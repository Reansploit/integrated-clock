import { redirect } from 'next/navigation';

/**
 * Feedback for the control panel.
 *
 * A server action that only calls `revalidatePath` gives the operator nothing
 * back: the form re-renders with the same values and there is no way to tell a
 * saved row from a failed one. Every write therefore ends in a redirect to the
 * page it came from, carrying a `notice` key and an optional detail, and the
 * page turns that into one sentence.
 *
 * Keys rather than whole sentences in the URL, so the wording lives in one
 * place and a hand-edited link cannot print arbitrary text. The detail carries
 * field names from a failed validation, which is the one part that has to be
 * built at runtime.
 */

export type NoticeTone = 'ok' | 'error';

export type PanelNotice = {
  tone: NoticeTone;
  text: string;
};

const notices: Record<string, PanelNotice> = {
  'settings-saved': { tone: 'ok', text: 'Pengaturan layar tersimpan.' },
  'ticker-saved': { tone: 'ok', text: 'Teks berjalan tersimpan.' },
  'ticker-empty': { tone: 'error', text: 'Teks berjalan tidak boleh kosong. Papan akan tampil tanpa baris teks.' },

  'event-added': { tone: 'ok', text: 'Kegiatan ditambahkan.' },
  'event-updated': { tone: 'ok', text: 'Kegiatan diperbarui.' },
  'event-deleted': { tone: 'ok', text: 'Kegiatan dihapus.' },
  'events-imported': { tone: 'ok', text: 'Jadwal kegiatan diimpor.' },
  'events-import-empty': {
    tone: 'error',
    text: 'Tidak ada baris yang bisa dibaca dari isian itu. Periksa formatnya di bagian Impor.',
  },

  'mufrodat-added': { tone: 'ok', text: 'Kosakata ditambahkan.' },
  'mufrodat-deleted': { tone: 'ok', text: 'Kosakata dihapus.' },

  'sound-added': { tone: 'ok', text: 'Suara tersimpan di perpustakaan.' },
  'sound-too-large': { tone: 'error', text: 'Suara ditolak: ukuran file maksimal 20 MB.' },
  'sound-type-invalid': { tone: 'error', text: 'Suara ditolak: format yang diterima mp3, wav, ogg, m4a, atau aac.' },
  'sound-no-file': { tone: 'error', text: 'Belum ada file suara yang dipilih.' },

  'video-added': { tone: 'ok', text: 'Video masuk playlist.' },
  'video-deleted': { tone: 'ok', text: 'Video dihapus dari playlist.' },
  'video-settings-saved': { tone: 'ok', text: 'Jadwal tayang video tersimpan.' },
  'video-stopped': { tone: 'ok', text: 'Pemutaran video dihentikan.' },
  'video-play-once': { tone: 'ok', text: 'Video diunggah dan langsung diputar sekali di papan.' },
  'video-too-large': { tone: 'error', text: 'Video ditolak: ukuran file maksimal 100 MB.' },
  'video-type-invalid': { tone: 'error', text: 'Video ditolak: format yang diterima mp4 atau webm.' },
  'video-no-file': { tone: 'error', text: 'Belum ada file video yang dipilih.' },
  'video-write-failed': { tone: 'error', text: 'Video gagal ditulis ke disk. Lihat log terminal untuk detailnya.' },

  'background-added': { tone: 'ok', text: 'Gambar latar tersimpan dan langsung dipakai papan.' },
  'background-too-large': { tone: 'error', text: 'Gambar ditolak: ukuran file maksimal 10 MB.' },
  'background-type-invalid': {
    tone: 'error',
    text: 'Gambar ditolak: format yang diterima png, jpg, gif, atau webp.',
  },
  'background-no-file': { tone: 'error', text: 'Belum ada file gambar yang dipilih.' },
  'background-cleared': { tone: 'ok', text: 'Gambar latar dilepas. Papan kembali ke warna gelap bawaan.' },
  'language-week-saved': { tone: 'ok', text: 'Minggu bahasa tersimpan. Kotak kosakata di papan ikut berubah.' },
  'countdown-saved': { tone: 'ok', text: 'Tanggal hitung mundur tersimpan. Tile di bawah jadwal sholat papan ikut berubah.' },
  'background-write-failed': { tone: 'error', text: 'Gambar gagal ditulis ke disk. Lihat log terminal untuk detailnya.' },

  'vocab-item-added': { tone: 'ok', text: 'Kartu vocab ditambahkan.' },
  'vocab-item-updated': { tone: 'ok', text: 'Kartu vocab diperbarui.' },
  'vocab-item-deleted': { tone: 'ok', text: 'Kartu vocab dihapus.' },
  'vocab-item-moved': { tone: 'ok', text: 'Urutan kartu diperbarui.' },
  'vocab-move-edge': { tone: 'error', text: 'Urutan tidak berubah.' },
  'vocab-slot-saved': { tone: 'ok', text: 'Slot tayang tersimpan.' },
  'vocab-slot-deleted': { tone: 'ok', text: 'Slot tayang dihapus.' },
  'vocab-live-set': { tone: 'ok', text: 'Kartu yang tampil di papan diganti.' },
  'vocab-live-stopped': { tone: 'ok', text: 'Mode manual dihentikan.' },

  invalid: { tone: 'error', text: 'Ada isian yang tidak valid.' },
  'row-missing': { tone: 'error', text: 'Baris yang dimaksud tidak ada. Mungkin sudah dihapus dari tab lain.' },
  'db-not-configured': { tone: 'error', text: 'Database lokal belum siap. Jalankan npm run db:seed lalu muat ulang halaman ini.' },
  'write-failed': { tone: 'error', text: 'Perubahan gagal disimpan. Lihat log terminal untuk detailnya.' },
};

export function resolveNotice(raw: string | undefined | null): PanelNotice | null {
  if (!raw) return null;
  return notices[raw] ?? { tone: 'error', text: 'Terjadi kesalahan yang tidak dikenal.' };
}

export function readNoticeDetail(raw: string | undefined | null) {
  if (!raw) return '';
  return raw.replace(/\s+/g, ' ').trim().slice(0, 300);
}

type PanelRedirectOptions = {
  anchor?: string;
  detail?: string;
  page?: number;
};

/**
 * Anchors survive the redirect, so an operator who saves deep in the page lands
 * back on the section they were editing instead of at the top. The event list
 * is paginated, so the page number travels too: without it an edit on page 3
 * would always throw the operator back to page 1.
 */
export function panelRedirect(pathname: string, notice: string, options: PanelRedirectOptions = {}): never {
  const params = new URLSearchParams();
  if (options.page && options.page > 1) {
    params.set('page', String(options.page));
  }
  params.set('notice', notice);
  if (options.detail) {
    params.set('detail', options.detail);
  }

  const hash = options.anchor ? `#${options.anchor}` : '';
  redirect(`${pathname}?${params.toString()}${hash}`);
}

/**
 * zod writes for a developer ("Expected string, received number"). The operator
 * needs to know which box to fix, so the field path is kept and the type
 * chatter is dropped.
 */
export function describeIssues(issues: Array<{ path: PropertyKey[]; message: string }>) {
  return issues
    .map((issue) => {
      const field = issue.path
        .map((part) => String(part))
        .filter(Boolean)
        .join(' / ');
      return field ? `${field} (${issue.message})` : issue.message;
    })
    .join('; ');
}
