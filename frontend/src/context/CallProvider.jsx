import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useSocket } from '../socket/SocketProvider.jsx';

const CallContext = createContext(null);

export const useCall = () => {
  const context = useContext(CallContext);
  if (!context) throw new Error('useCall must be used inside CallProvider');
  return context;
};

// Google's STUN server resolves a caller's own public address, which is
// enough when both people are on ordinary home networks. It is not enough
// behind a symmetric NAT (common on mobile data and corporate wifi), which is
// what TURN is for — relaying the media itself when a direct path cannot be
// found. These are Open Relay Project's published, free, public credentials
// (metered.ca/tools/openrelay): fine for a portfolio demo's call volume, but
// it is a shared rate-limited relay, not a private one — swap in a dedicated
// TURN service before this carries real traffic.
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  {
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turn:openrelay.metered.ca:443?transport=tcp',
    ],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

const mediaFor = (kind) => ({ audio: true, video: kind === 'video' });

// One call at a time, start to finish, through five states:
//   idle -> outgoing (we invited, ringing) -----\
//   idle -> incoming (they invited, ringing) --- -> active -> idle
// `call` carries everything a screen needs to render whichever of those it is
// in: the conversation, who is on the other end, the kind, and — once
// active — the two media streams.
export const CallProvider = ({ children }) => {
  const { on, emit } = useSocket();

  const [call, setCall] = useState(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const pendingCandidates = useRef([]);
  const callRef = useRef(null);
  callRef.current = call;

  const teardown = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    pendingCandidates.current = [];
    setCall(null);
  }, []);

  const buildPeerConnection = useCallback((conversationId) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        emit('call:ice-candidate', { conversationId, candidate: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      setCall((prev) => (prev ? { ...prev, remoteStream: event.streams[0] } : prev));
    };

    // A dropped ICE path (wifi handoff, a flaky mobile signal) surfaces here
    // rather than as a silently frozen call — closing cleanly reads as "the
    // call ended" instead of a bubble that never comes back.
    pc.oniceconnectionstatechange = () => {
      if (['failed', 'closed'].includes(pc.iceConnectionState)) {
        emit('call:end', { conversationId });
        teardown();
      }
    };

    pcRef.current = pc;
    return pc;
  }, [emit, teardown]);

  const flushPendingCandidates = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;
    const queued = pendingCandidates.current;
    pendingCandidates.current = [];
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(candidate);
      } catch {
        // A candidate that no longer applies once the connection has moved on
        // is not worth failing the call over.
      }
    }
  }, []);

  const startCall = useCallback(
    async (conversationId, partner, kind) => {
      if (callRef.current) return;
      try {
        const localStream = await navigator.mediaDevices.getUserMedia(mediaFor(kind));
        localStreamRef.current = localStream;
        setCall({ conversationId, partner, kind, direction: 'outgoing', status: 'ringing', localStream });
      } catch {
        setCall({
          conversationId, partner, kind, direction: 'outgoing', status: 'error',
          error: 'Could not access your microphone or camera',
        });
        return;
      }

      emit('call:invite', { conversationId, kind }, (ack) => {
        if (!ack?.ok) {
          const reason = ack?.error === 'busy' ? "They're on another call" : "Could not start the call";
          setCall((prev) => (prev ? { ...prev, status: 'error', error: reason } : prev));
          setTimeout(teardown, 1800);
        }
      });
    },
    [emit, teardown]
  );

  const acceptCall = useCallback(async () => {
    const current = callRef.current;
    if (!current || current.direction !== 'incoming') return;

    let localStream;
    try {
      localStream = await navigator.mediaDevices.getUserMedia(mediaFor(current.kind));
      localStreamRef.current = localStream;
    } catch {
      emit('call:decline', { conversationId: current.conversationId, reason: 'no-device' });
      teardown();
      return;
    }

    const pc = buildPeerConnection(current.conversationId);
    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

    setCall((prev) => (prev ? { ...prev, status: 'active', localStream } : prev));
    emit('call:accept', { conversationId: current.conversationId });
  }, [buildPeerConnection, emit, teardown]);

  const declineCall = useCallback(() => {
    const current = callRef.current;
    if (!current) return;
    emit('call:decline', { conversationId: current.conversationId, reason: 'declined' });
    teardown();
  }, [emit, teardown]);

  const endCall = useCallback(() => {
    const current = callRef.current;
    if (!current) return;
    emit(current.direction === 'outgoing' && current.status === 'ringing' ? 'call:cancel' : 'call:end', {
      conversationId: current.conversationId,
    });
    teardown();
  }, [emit, teardown]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const track = stream.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setCall((prev) => (prev ? { ...prev, muted: !track.enabled } : prev));
  }, []);

  const toggleCamera = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setCall((prev) => (prev ? { ...prev, cameraOff: !track.enabled } : prev));
  }, []);

  // `on`'s identity changes whenever SocketProvider's presence state changes
  // (it is rebuilt in a useMemo keyed on `[status, onlineUsers]`), which is
  // often — so this must be a proper effect with cleanup, not a `useMemo`
  // used for its side effect: without unsubscribing the previous batch,
  // every presence update would pile on a duplicate set of listeners and
  // `call:incoming` would eventually fire many times over for one ring.
  // Handlers read current state through refs rather than closing over a
  // stale `call` from whichever render last registered them.
  useEffect(() => {
    const offIncoming = on('call:incoming', ({ conversationId, kind, from }) => {
      if (callRef.current) return; // already on a call — the server's own "busy" check covers the common case
      setCall({ conversationId, partner: from, kind, direction: 'incoming', status: 'ringing' });
    });

    const offAccepted = on('call:accepted', async ({ conversationId }) => {
      const current = callRef.current;
      if (!current || current.conversationId !== conversationId) return;

      const pc = buildPeerConnection(conversationId);
      current.localStream?.getTracks().forEach((track) => pc.addTrack(track, current.localStream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      setCall((prev) => (prev ? { ...prev, status: 'active' } : prev));
      emit('call:offer', { conversationId, sdp: pc.localDescription });
    });

    const offOffer = on('call:offer', async ({ conversationId, sdp }) => {
      const pc = pcRef.current;
      if (!pc || callRef.current?.conversationId !== conversationId) return;
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      await flushPendingCandidates();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      emit('call:answer', { conversationId, sdp: pc.localDescription });
    });

    const offAnswer = on('call:answer', async ({ conversationId, sdp }) => {
      const pc = pcRef.current;
      if (!pc || callRef.current?.conversationId !== conversationId) return;
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      await flushPendingCandidates();
    });

    const offIceCandidate = on('call:ice-candidate', async ({ conversationId, candidate }) => {
      if (callRef.current?.conversationId !== conversationId || !candidate) return;
      const pc = pcRef.current;
      const iceCandidate = new RTCIceCandidate(candidate);
      // The offer/answer exchange and ICE candidates race over the same
      // socket — a candidate can arrive before `setRemoteDescription` has
      // run, and `addIceCandidate` throws if called too early. Queue it and
      // flush right after the description lands instead of dropping it.
      if (!pc || !pc.remoteDescription) {
        pendingCandidates.current.push(iceCandidate);
        return;
      }
      try {
        await pc.addIceCandidate(iceCandidate);
      } catch {
        // Ignored — see flushPendingCandidates.
      }
    });

    const endEvents = ['call:declined', 'call:cancelled', 'call:missed', 'call:end'];
    const offEndEvents = endEvents.map((event) =>
      on(event, ({ conversationId, reason }) => {
        if (callRef.current?.conversationId !== conversationId) return;
        setCall((prev) => (prev ? { ...prev, status: 'ended', endReason: reason ?? event } : prev));
        setTimeout(teardown, event === 'call:declined' || event === 'call:missed' ? 1600 : 300);
      })
    );

    return () => {
      offIncoming();
      offAccepted();
      offOffer();
      offAnswer();
      offIceCandidate();
      offEndEvents.forEach((off) => off());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on]);

  const value = useMemo(
    () => ({ call, startCall, acceptCall, declineCall, endCall, toggleMute, toggleCamera }),
    [call, startCall, acceptCall, declineCall, endCall, toggleMute, toggleCamera]
  );

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
};

export default CallProvider;
