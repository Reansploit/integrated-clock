'use client';

import { useMemo } from 'react';

import { getAnnouncementRtcDiagnostics } from '@/lib/announcement/rtcConfig';
import { usePushToTalkAnnouncement } from '@/lib/announcement/usePushToTalkAnnouncement';

type AdminAnnouncementControlProps = {
  authToken?: string;
};

export function AdminAnnouncementControl({ authToken = '' }: AdminAnnouncementControlProps) {
  const adminToken = useMemo(() => authToken, [authToken]);
  const rtcDiagnostics = useMemo(() => getAnnouncementRtcDiagnostics(), []);

  const state = usePushToTalkAnnouncement({
    authToken: adminToken,
  });

  return (
    <div className={`announcement-admin ${state.isActive ? 'is-live' : ''}`}>
      <div className="announcement-admin__status-row">
        <strong>{state.isActive ? 'LIVE ANNOUNCEMENT' : 'Push-to-Talk standby'}</strong>
        <span>{state.isConnected ? 'Live signaling connected' : 'Live signaling disconnected'}</span>
      </div>
      <p>Hold <kbd>SPACE</kbd> to talk. Release to stop.</p>
      {state.isActive ? <p className="announcement-admin__live">🎤 LIVE ANNOUNCEMENT</p> : null}
      {state.micDenied ? <p className="announcement-admin__error">Microphone permission denied.</p> : null}
      {!state.micDenied && state.error ? <p className="announcement-admin__error">{state.error}</p> : null}
      {!state.isConnected ? (
        <p className="announcement-admin__hint">
          Signaling belum tersambung. Pastikan endpoint live announcement bisa diakses, dan
          <code>NEXT_PUBLIC_LA_BASE_URL</code> sudah diarahkan ke server signaling (jika pakai server terpisah).
        </p>
      ) : null}
      {!rtcDiagnostics.hasTurn ? (
        <p className="announcement-admin__hint">
          TURN server belum dikonfigurasi. Untuk antar jaringan/internet (termasuk Tailscale Funnel), set
          <code>NEXT_PUBLIC_ANNOUNCEMENT_ICE_SERVERS</code> dengan URL <code>turn:</code>/<code>turns:</code>.
        </p>
      ) : null}
      {rtcDiagnostics.hasTurn && rtcDiagnostics.iceTransportPolicy !== 'relay' ? (
        <p className="announcement-admin__hint">
          TURN sudah ada. Jika audio masih putus antar jaringan, set
          <code>NEXT_PUBLIC_ANNOUNCEMENT_ICE_TRANSPORT_POLICY=relay</code> untuk memaksa jalur TURN.
        </p>
      ) : null}
    </div>
  );
}
