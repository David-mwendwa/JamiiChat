import { useEffect, useRef } from 'react';

// `srcObject` has no React prop equivalent, so a <video> showing a live
// MediaStream has to be wired up imperatively — this is that wiring, kept out
// of CallOverlay so the component itself only deals with call state.
const useMediaStream = (stream) => {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream ?? null;
  }, [stream]);

  return ref;
};

export default useMediaStream;
