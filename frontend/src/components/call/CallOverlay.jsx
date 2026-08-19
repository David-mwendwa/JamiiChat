import { useCall } from '../../context/CallProvider.jsx';
import useMediaStream from '../../hooks/useMediaStream.js';
import Avatar from '../ui/Avatar.jsx';
import Icon from '../ui/Icon.jsx';
import cn from '../../lib/cn.js';

const REASON_LABEL = {
  declined: 'Call declined',
  busy: "They're on another call",
  'no-device': 'They could not answer',
  disconnected: 'Connection lost',
};

const ControlButton = ({ active, onClick, label, children, danger }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    aria-pressed={active}
    className={cn(
      'inline-flex h-14 w-14 items-center justify-center rounded-full transition',
      danger
        ? 'bg-rose-600 text-white hover:bg-rose-700'
        : active
          ? 'bg-white text-ink hover:bg-white/90'
          : 'bg-white/15 text-white hover:bg-white/25'
    )}>
    {children}
  </button>
);

// Mounted once, near the app's root, so a call rings and stays on screen
// across route changes rather than being tied to whichever page happened to
// start it. Renders nothing when there is no call in progress.
const CallOverlay = () => {
  const { call, acceptCall, declineCall, endCall, toggleMute, toggleCamera } = useCall();
  const localVideoRef = useMediaStream(call?.localStream);
  const remoteVideoRef = useMediaStream(call?.remoteStream);

  if (!call) return null;

  const { partner, kind, direction, status } = call;
  const isVideo = kind === 'video';

  if (status === 'error' || status === 'ended') {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/90 backdrop-blur-sm">
        <div className="text-center text-white">
          <Avatar user={partner} size="lg" link={false} />
          <p className="mt-4 text-lg font-semibold">{partner?.displayName}</p>
          <p className="mt-1 text-sm text-white/70">
            {call.error ?? REASON_LABEL[call.endReason] ?? 'Call ended'}
          </p>
        </div>
      </div>
    );
  }

  if (status === 'ringing' && direction === 'incoming') {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col items-center justify-between bg-ink/95 px-6 py-16 backdrop-blur-sm">
        <div className="text-center text-white">
          <p className="text-sm font-semibold uppercase tracking-wide text-white/60">
            Incoming {isVideo ? 'video' : 'voice'} call
          </p>
          <div className="relative mt-8 inline-block">
            <span className="absolute inset-0 -m-3 animate-ping rounded-full bg-primary-500/30" />
            <Avatar user={partner} size="lg" link={false} />
          </div>
          <p className="mt-6 text-2xl font-bold">{partner?.displayName}</p>
          <p className="handle mt-1 text-white/50">@{partner?.handle}</p>
        </div>

        <div className="flex items-center gap-10">
          <div className="flex flex-col items-center gap-2">
            <ControlButton label="Decline" onClick={declineCall} danger>
              <Icon name="phoneOff" className="h-6 w-6" />
            </ControlButton>
            <span className="text-xs text-white/60">Decline</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <ControlButton label="Accept" onClick={acceptCall}>
              <Icon name="phone" className="h-6 w-6 text-emerald-600" />
            </ControlButton>
            <span className="text-xs text-white/60">Accept</span>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'ringing' && direction === 'outgoing') {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col items-center justify-between bg-ink/95 px-6 py-16 backdrop-blur-sm">
        <div className="text-center text-white">
          <p className="text-sm font-semibold uppercase tracking-wide text-white/60">
            Calling…
          </p>
          <div className="mt-8">
            <Avatar user={partner} size="lg" link={false} />
          </div>
          <p className="mt-6 text-2xl font-bold">{partner?.displayName}</p>
        </div>

        <div className="flex flex-col items-center gap-2">
          <ControlButton label="Cancel call" onClick={endCall} danger>
            <Icon name="phoneOff" className="h-6 w-6" />
          </ControlButton>
          <span className="text-xs text-white/60">Cancel</span>
        </div>
      </div>
    );
  }

  // Active — audio and video share the same control bar; video adds the two
  // <video> tiles, audio shows a simple centred avatar so there is still
  // something to look at while the call runs.
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-ink">
      <div className="relative flex-1 overflow-hidden">
        {isVideo ? (
          <>
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="h-full w-full bg-ink object-cover"
            />
            {!call.remoteStream && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
                <Avatar user={partner} size="lg" link={false} />
                <p className="text-sm text-white/60">Connecting…</p>
              </div>
            )}
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={cn(
                'absolute right-4 top-4 h-40 w-28 rounded-2xl border-2 border-white/20 bg-ink object-cover shadow-lift',
                call.cameraOff && 'hidden'
              )}
            />
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-white">
            <Avatar user={partner} size="lg" link={false} />
            <p className="text-2xl font-bold">{partner?.displayName}</p>
            <p className="text-sm text-white/60">
              {call.remoteStream ? 'On the call' : 'Connecting…'}
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-6 bg-ink/95 py-6">
        <ControlButton label={call.muted ? 'Unmute' : 'Mute'} active={call.muted} onClick={toggleMute}>
          <Icon name={call.muted ? 'micOff' : 'mic'} className="h-6 w-6" />
        </ControlButton>
        {isVideo && (
          <ControlButton
            label={call.cameraOff ? 'Turn camera on' : 'Turn camera off'}
            active={call.cameraOff}
            onClick={toggleCamera}>
            <Icon name={call.cameraOff ? 'videoOff' : 'video'} className="h-6 w-6" />
          </ControlButton>
        )}
        <ControlButton label="End call" onClick={endCall} danger>
          <Icon name="phoneOff" className="h-6 w-6" />
        </ControlButton>
      </div>
    </div>
  );
};

export default CallOverlay;
