import { useSignageStore } from '../store/signageStore';

export function FullscreenVideo(): JSX.Element {
  const activeVideo = useSignageStore((s) => s.state?.active_video);
  const setMode = useSignageStore((s) => s.setMode);

  if (!activeVideo?.path) {
    setMode('clock');
    return <></>;
  }

  return (
    <video
      className="fullscreen-video"
      autoPlay
      muted
      playsInline
      src={activeVideo.path}
      onEnded={() => setMode('clock')}
    />
  );
}
