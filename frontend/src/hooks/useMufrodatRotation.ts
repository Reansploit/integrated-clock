import { useEffect } from 'react';
import { useSignageStore } from '../store/signageStore';

export function useMufrodatRotation(intervalMs = 12000): void {
  const state = useSignageStore((s) => s.state);
  const setIndex = useSignageStore((s) => s.setActiveMufrodatIndex);

  useEffect(() => {
    if (!state?.mufrodat.length) return;

    const id = window.setInterval(() => {
      setIndex((Math.floor(Date.now() / intervalMs) + 1) % state.mufrodat.length);
    }, intervalMs);

    return () => window.clearInterval(id);
  }, [intervalMs, setIndex, state?.mufrodat.length]);
}
