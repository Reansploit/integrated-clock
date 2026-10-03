'use client';

import { getAnnouncementApiBase } from '@/lib/announcement/apiBase';
import { getAnnouncementRtcDiagnostics } from '@/lib/announcement/rtcConfig';
import { usePushToTalkAnnouncement } from '@/lib/announcement/usePushToTalkAnnouncement';

type AdminAnnouncementControlProps = {
  authToken?: string;
};

/**
 * Both setup notes below are about one situation only: the board lives on a
 * different machine, so the signaling server sits on another origin. On one LAN
 * with the panel next to the board there is nothing to configure, and showing
 * the note anyway would just be noise to read past.
 */
export function AdminAnnouncementControl({ authToken = '' }: AdminAnnouncementControlProps) {
  const rtcDiagnostics = getAnnouncementRtcDiagnostics();
  const isCrossOrigin = getAnnouncementApiBase() !== '';
  const state = usePushToTalkAnnouncement({ authToken });

  return (
    <div className="ptt" data-live={state.isActive ? 'true' : undefined}>
      <div className="ptt__state">
        <span className="ptt__label" data-live={state.isActive ? 'true' : undefined}>
          {state.isActive ? 'Sedang bicara' : 'Siap dipakai'}
        </span>
        <span className="ptt__link">
          {state.isConnected ? 'Sinyal tersambung' : 'Sinyal belum tersambung'}
        </span>
      </div>

      <p className="ptt__help">
        Tahan tombol <kbd>Space</kbd> sambil bicara, lalu lepaskan untuk berhenti. Suara langsung keluar dari
        speaker papan.
      </p>

      {state.micDenied ? <p className="ptt__error">Izin mikrofon ditolak browser.</p> : null}
      {!state.micDenied && state.error ? <p className="ptt__error">{state.error}</p> : null}

      {isCrossOrigin && !rtcDiagnostics.hasTurn ? (
        <p className="ptt__note">
          Kalau papan ada di jaringan yang berbeda, isi <code>NEXT_PUBLIC_ANNOUNCEMENT_ICE_SERVERS</code>{' '}
          dengan alamat <code>turn:</code> atau <code>turns:</code>. Tanpa TURN, suara kadang tidak sampai.
        </p>
      ) : null}
    </div>
  );
}
