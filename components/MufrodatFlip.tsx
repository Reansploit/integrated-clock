'use client';

import { useEffect, useState } from 'react';

type MufrodatItem = {
  id: string | number;
  arabic: string;
  translation: string;
};

function MufrodatCard({ item }: { item: MufrodatItem }) {
  return (
    <div className="mufrodat-card mufrodat-flip__card">
      <span className="arabic-line">{item.arabic}</span>
      <span className="translation-line">{item.translation}</span>
    </div>
  );
}

export function MufrodatFlip({ items }: { items: MufrodatItem[] }) {
  const [index, setIndex] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [settling, setSettling] = useState(false);

  useEffect(() => {
    if (items.length <= 1) {
      return;
    }

    let timeoutId: number | undefined;
    const intervalId = window.setInterval(() => {
      setTransitioning(true);
      timeoutId = window.setTimeout(() => {
        setIndex((current) => (current + 1) % items.length);
        setTransitioning(false);
      }, 360);
    }, 4600);

    return () => {
      window.clearInterval(intervalId);
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [items.length]);

  useEffect(() => {
    if (items.length <= 1) {
      return;
    }

    setSettling(true);
    const timeoutId = window.setTimeout(() => setSettling(false), 420);
    return () => window.clearTimeout(timeoutId);
  }, [index, items.length]);

  const currentItem = items[index];

  if (!currentItem) {
    return <p className="fallback-note">No vocabulary items to display yet.</p>;
  }

  if (items.length <= 1) {
    return <MufrodatCard item={currentItem} />;
  }

  return (
    <div className={`mufrodat-flip ${transitioning ? 'is-flipping' : ''} ${settling ? 'is-settling' : ''}`}>
      <div className="mufrodat-flip__inner">
        <MufrodatCard item={currentItem} />
      </div>
    </div>
  );
}
