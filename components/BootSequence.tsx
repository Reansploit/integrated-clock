'use client';

import { useEffect, useState } from 'react';

function normalizeMediaUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^(https?:)?\/\//i.test(trimmed) || trimmed.startsWith('data:')) {
    return trimmed;
  }
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export function BootSequence({
  bootAnimationUrl,
  introImageUrl = '',
}: {
  bootAnimationUrl: string;
  introImageUrl?: string;
}) {
  const [stage, setStage] = useState<'hidden' | 'boot' | 'intro'>('hidden');
  const INTRO_DURATION_MS = 3_000;
  const MAX_TOTAL_DURATION_MS = 30_000;

  useEffect(() => {
    const mediaUrl = normalizeMediaUrl(bootAnimationUrl);
    if (!mediaUrl) return;

    const BOOT_DURATION_MS = MAX_TOTAL_DURATION_MS - INTRO_DURATION_MS;

    setStage('boot');
    const bootTimer = window.setTimeout(() => {
      setStage('intro');
    }, BOOT_DURATION_MS);

    return () => {
      window.clearTimeout(bootTimer);
    };
  }, [bootAnimationUrl, INTRO_DURATION_MS, MAX_TOTAL_DURATION_MS]);

  useEffect(() => {
    if (stage !== 'intro') {
      return;
    }

    const introTimer = window.setTimeout(() => {
      setStage('hidden');
    }, INTRO_DURATION_MS);

    return () => {
      window.clearTimeout(introTimer);
    };
  }, [stage, INTRO_DURATION_MS]);

  if (stage === 'hidden') {
    return null;
  }

  const mediaUrl = normalizeMediaUrl(bootAnimationUrl);
  if (!mediaUrl) {
    return null;
  }

  if (stage === 'intro') {
    const introImage = normalizeMediaUrl(introImageUrl);
    return (
      <div className="boot-overlay boot-overlay--intro" role="presentation">
        <div className="boot-intro-orb">
          <div className="boot-intro-orb__ring" />
          <div className="boot-intro-orb__inner">
            {introImage ? (
              <img className="boot-intro-orb__image" src={introImage} alt="Intro logo" />
            ) : (
              <div className="boot-intro-orb__fallback">CLOCK2</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="boot-overlay" role="presentation">
      <video
        className="boot-overlay__video"
        autoPlay
        muted
        playsInline
        src={mediaUrl}
        onEnded={() => setStage('intro')}
      />
    </div>
  );
}
