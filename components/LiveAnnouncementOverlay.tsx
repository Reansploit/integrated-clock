'use client';

import { useMemo } from 'react';

import { useAnnouncementListener } from '@/lib/announcement/useAnnouncementListener';

const PEER_LABEL: Record<'idle' | 'connecting' | 'connected' | 'failed', string> = {
  idle: 'waiting',
  connecting: 'connecting',
  connected: 'connected',
  failed: 'failed',
};

export function LiveAnnouncementOverlay() {
  const streamUrl = useMemo(() => '/api/announcement/stream', []);

  const { isLive, announcementText, audioBlocked, retryAudioPlayback, peerState } = useAnnouncementListener({ streamUrl });

  if (!isLive) {
    return <div className="live-announcement-sr" role="status" aria-live="assertive" aria-atomic="true" />;
  }

  return (
    <>
      <div className="live-announcement-sr" role="status" aria-live="assertive" aria-atomic="true">
        {announcementText}
      </div>

      <div className="live-announcement-overlay" aria-hidden="true">
        <span className="live-announcement-overlay__badge">Live Announcement</span>
        <span className="live-announcement-overlay__peer">Audio {PEER_LABEL[peerState]}</span>

        {audioBlocked ? (
          <button type="button" className="live-announcement-overlay__unlock" onClick={retryAudioPlayback}>
            Tap to enable audio
          </button>
        ) : null}
      </div>
    </>
  );
}
