import { useCallback } from 'react';
import { BootScreen } from './components/BootScreen';
import { FullscreenVideo } from './components/FullscreenVideo';
import { SignageLayout } from './components/SignageLayout';
import { useMufrodatRotation } from './hooks/useMufrodatRotation';
import { usePolling } from './hooks/usePolling';
import { useSignageStore } from './store/signageStore';

export default function App(): JSX.Element {
  const mode = useSignageStore((s) => s.mode);
  const poll = useSignageStore((s) => s.poll);
  const apiHealthy = useSignageStore((s) => s.apiHealthy);

  const pollCb = useCallback(() => {
    void poll();
  }, [poll]);

  usePolling(pollCb, 5000);
  useMufrodatRotation(12000);

  if (!apiHealthy) {
    return <div className="system-message">Koneksi backend terganggu. Menjalankan data cache lokal.</div>;
  }

  if (mode === 'boot') return <BootScreen />;
  if (mode === 'video') return <FullscreenVideo />;

  return <SignageLayout />;
}
