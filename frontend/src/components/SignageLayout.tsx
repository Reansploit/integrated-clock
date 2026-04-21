import { FooterTicker } from './FooterTicker';
import { HeaderTicker } from './HeaderTicker';
import { ClockPanel } from './ClockPanel';
import { useSignageStore } from '../store/signageStore';

export function SignageLayout(): JSX.Element {
  const bgImage = useSignageStore((s) => s.state?.background.image?.path);
  const bgVideo = useSignageStore((s) => s.state?.background.video?.path);
  const nightMode = useSignageStore((s) => s.state?.night_mode);

  return (
    <div className={`layout-root ${nightMode ? 'night' : ''}`} style={bgImage ? { backgroundImage: `url(${bgImage})` } : undefined}>
      {bgVideo ? (
        <video className="background-video" autoPlay muted loop playsInline src={bgVideo} />
      ) : null}
      <div className="overlay" />
      <div className="content-layer">
        <HeaderTicker />
        <ClockPanel />
        <FooterTicker />
      </div>
    </div>
  );
}
