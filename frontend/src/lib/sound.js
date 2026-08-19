// Short "pop" sounds, synthesized with the Web Audio API rather than shipped
// as an audio file — no asset to license, no network request on load, and the
// exact tone stays tunable in one place instead of re-recording a clip.

let ctx = null;

const getContext = () => {
  // Created lazily and only ever touched from inside a user gesture (sending
  // a message) — browsers block an AudioContext that starts before any
  // interaction, and a thrown error here must never be allowed to interrupt
  // sending.
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!ctx) ctx = new AudioContextClass();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
};

const pop = ({ startFreq, endFreq, duration, gain }) => {
  const audio = getContext();
  if (!audio) return;

  const oscillator = audio.createOscillator();
  const envelope = audio.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(startFreq, audio.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(endFreq, audio.currentTime + duration);

  // A fast exponential decay is what makes a sine sweep read as a "pop"
  // rather than a whistle — a linear ramp lingers audibly at the tail.
  envelope.gain.setValueAtTime(gain, audio.currentTime);
  envelope.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);

  oscillator.connect(envelope);
  envelope.connect(audio.destination);

  oscillator.start();
  oscillator.stop(audio.currentTime + duration);
};

// Pitched a step above the received tone, so the two are tellable apart by ear
// without looking at the screen.
export const playSentPop = () => {
  try {
    pop({ startFreq: 720, endFreq: 340, duration: 0.09, gain: 0.18 });
  } catch {
    // Sound is a nicety layered on top of sending — a failure here must never
    // surface as if the message itself failed.
  }
};

export const playReceivedPop = () => {
  try {
    pop({ startFreq: 560, endFreq: 260, duration: 0.11, gain: 0.16 });
  } catch {
    /* same as above */
  }
};
