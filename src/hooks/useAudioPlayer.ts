import { useState, useRef, useCallback, useEffect } from 'react';
import { Howl } from 'howler';

let currentHowl: Howl | null = null;
let currentId: string | null = null;

function stopPlayback(frameRef: React.MutableRefObject<number | undefined>) {
  if (currentHowl) {
    currentHowl.stop();
    currentHowl.unload();
  }
  if (frameRef.current !== undefined) {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = undefined;
  }
  currentHowl = null;
  currentId = null;
}

export function useAudioPlayer() {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const frameRef = useRef<number>(undefined);

  const play = useCallback((id: string, url: string) => {
    const wasSameTrack = currentId === id;
    stopPlayback(frameRef);

    if (wasSameTrack) {
      // Toggle off
      setPlayingId(null);
      setProgress(0);
      return;
    }

    const howl = new Howl({
      src: [url],
      html5: true,
      onend: () => {
        if (currentHowl === howl) {
          currentHowl.unload();
          currentHowl = null;
          currentId = null;
        }
        setPlayingId(null);
        setProgress(0);
      },
    });

    howl.play();
    currentHowl = howl;
    currentId = id;
    setPlayingId(id);

    const updateProgress = () => {
      if (currentHowl && currentId === id) {
        setProgress(currentHowl.seek() / (currentHowl.duration() || 1));
        frameRef.current = requestAnimationFrame(updateProgress);
      }
    };
    updateProgress();
  }, []);

  const stop = useCallback(() => {
    stopPlayback(frameRef);
    setPlayingId(null);
    setProgress(0);
  }, []);

  useEffect(() => stop, [stop]);

  return { playingId, progress, play, stop };
}
