import { useEffect, useRef, useState } from 'react';
import { randomMeme } from '../data/memes';

// Shows a random meme every `minMs`–`maxMs` (randomized each cycle), visible
// for `displayMs`, then waits for the next window. Pass `enabled: false` to
// pause the cycle entirely (e.g. during a timed question) without losing
// the schedule — it just won't show anything until re-enabled.
export function useRandomMeme({ enabled = true, minMs = 45_000, maxMs = 100_000, displayMs = 7_000 } = {}) {
  const [current, setCurrent] = useState(null);
  const lastIndex = useRef(-1);
  const showTimer = useRef(null);
  const hideTimer = useRef(null);

  useEffect(() => {
    if (!enabled) {
      clearTimeout(showTimer.current);
      clearTimeout(hideTimer.current);
      return;
    }

    const scheduleNext = () => {
      const delay = minMs + Math.random() * (maxMs - minMs);
      showTimer.current = setTimeout(() => {
        const { meme, index } = randomMeme(lastIndex.current);
        lastIndex.current = index;
        setCurrent(meme);
        hideTimer.current = setTimeout(() => {
          setCurrent(null);
          scheduleNext();
        }, displayMs);
      }, delay);
    };

    scheduleNext();
    return () => { clearTimeout(showTimer.current); clearTimeout(hideTimer.current); };
  }, [enabled, minMs, maxMs, displayMs]);

  const dismiss = () => {
    clearTimeout(hideTimer.current);
    setCurrent(null);
  };

  return { current, dismiss };
}
