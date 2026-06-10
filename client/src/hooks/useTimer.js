import { useState, useEffect, useRef } from 'react';

export function useCountdown(endTimeISO) {
  const [timeLeft, setTimeLeft] = useState(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!endTimeISO) { setTimeLeft(null); return; }

    const tick = () => {
      const diff = new Date(endTimeISO) - Date.now();
      setTimeLeft(Math.max(0, diff));
    };

    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => clearInterval(intervalRef.current);
  }, [endTimeISO]);

  if (timeLeft === null) return null;

  const totalSeconds = Math.floor(timeLeft / 1000);
  const hours   = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    raw: timeLeft,
    hours,
    minutes,
    seconds,
    formatted: hours > 0
      ? `${hours}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`
      : `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`,
    isUrgent: totalSeconds < 60,
    isDone: timeLeft === 0,
  };
}
