'use client';

import { useEffect, useMemo, useState } from 'react';

type SponsorEntry = {
  label: string;
  src: string;
};

function normalizeLabel(label: string) {
  return label.trim() || 'Sponsor';
}

export function SponsorStrip({ sponsors }: { sponsors: SponsorEntry[] }) {
  const visibleSponsors = useMemo(() => sponsors.filter((entry) => entry.src), [sponsors]);
  const [index, setIndex] = useState(0);
  const [flipping, setFlipping] = useState(false);
  const [settling, setSettling] = useState(false);

  useEffect(() => {
    if (visibleSponsors.length <= 1) {
      return;
    }

    let timeoutId: number | undefined;
    const intervalId = window.setInterval(() => {
      setFlipping(true);
      timeoutId = window.setTimeout(() => {
        setIndex((current) => (current + 1) % visibleSponsors.length);
        setFlipping(false);
      }, 520);
    }, 4200);

    return () => {
      window.clearInterval(intervalId);
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [visibleSponsors.length]);

  useEffect(() => {
    if (visibleSponsors.length <= 1) {
      return;
    }

    setSettling(true);
    const timeoutId = window.setTimeout(() => setSettling(false), 420);
    return () => window.clearTimeout(timeoutId);
  }, [index, visibleSponsors.length]);

  if (!visibleSponsors.length) {
    return null;
  }

  const currentSponsor = visibleSponsors[index];
  const label = currentSponsor.label || 'supported by';

  return (
    <section className="sponsor-strip" aria-label="Sponsors">
      <div className={`sponsor-strip__stage ${flipping ? 'is-flipping' : ''} ${settling ? 'is-settling' : ''}`}>
        <div className="sponsor-strip__card">
          <span className="sponsor-strip__label">{label}</span>
          <img className="sponsor-strip__logo" src={currentSponsor.src} alt={normalizeLabel(currentSponsor.label)} />
        </div>
      </div>
    </section>
  );
}
