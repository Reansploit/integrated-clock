import { useEffect } from 'react';
import { useSignageStore } from '../store/signageStore';

export function BootScreen(): JSX.Element {
  const bootVideo = useSignageStore((s) => s.state?.boot_video);
  const setMode = useSignageStore((s) => s.setMode);

  useEffect(() => {
    const fallbackMs = (bootVideo?.duration_seconds ?? 8) * 1000;
    const timeoutId = window.setTimeout(() => setMode('clock'), fallbackMs);
    return () => window.clearTimeout(timeoutId);
  }, [bootVideo?.duration_seconds, setMode]);

  if (!bootVideo?.path) {
    return (
      <section className="boot-screen">
        <h1>Initializing Signage System...</h1>
      </section>
    );
  }

  return (
    <section className="boot-screen">
      <video
        className="fullscreen-video"
        autoPlay
        muted
        playsInline
        src={bootVideo.path}
        onEnded={() => setMode('clock')}
      />
    </section>
  );
}
