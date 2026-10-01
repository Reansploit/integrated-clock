'use client';

import { useMemo } from 'react';

import { useAnnouncementListener } from '@/lib/announcement/useAnnouncementListener';

export function LiveAnnouncementOverlay() {
  const streamUrl = useMemo(() => '/api/announcement/stream', []);

  const { isLive, announcementText, audioBlocked, retryAudioPlayback, peerState } = useAnnouncementListener({ streamUrl });

  return (
    <>
      <div className="live-announcement-sr" role="status" aria-live="assertive" aria-atomic="true">
        {announcementText}
      </div>
      {isLive ? (
        <div className="live-announcement-overlay" aria-hidden="true">
          <div className="live-announcement-overlay__badge">LIVE ANNOUNCEMENT</div>
          <div
            style={{
              position: 'absolute',
              bottom: 20,
              right: 20,
              background: 'rgba(0,0,0,0.7)',
              color: '#0f0',
              padding: '8px 12px',
              borderRadius: 8,
              fontSize: 12,
              fontFamily: 'monospace',
            }}
          >
            AUDIO ACTIVE · {peerState.toUpperCase()}
          </div>
          {audioBlocked ? (
            <button
              type="button"
              onClick={retryAudioPlayback}
              style={{
                position: 'absolute',
                bottom: 20,
                left: 20,
                border: '1px solid rgba(255,255,255,0.35)',
                background: 'rgba(0, 0, 0, 0.72)',
                color: '#fff',
                padding: '8px 12px',
                borderRadius: 8,
                fontSize: 12,
                pointerEvents: 'auto',
                cursor: 'pointer',
              }}
            >
              Tap untuk aktifkan audio
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
