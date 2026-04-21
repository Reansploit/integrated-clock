import { useEffect } from 'react';

export function usePolling(callback: () => void, delay = 5000): void {
  useEffect(() => {
    callback();
    const id = window.setInterval(callback, delay);
    return () => window.clearInterval(id);
  }, [callback, delay]);
}
