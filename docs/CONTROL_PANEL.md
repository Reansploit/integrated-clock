# Panel kontrol

- `/admin` — panel lama: settings, events + impor `jadwal.json`, mufrodat teks, video mufrodat, announcement PTT, ticker.
- `/control/vocab` — panel baru khusus vocab: kartu, slot jadwal, kendali manual.

Semua aksi memakai Server Actions (validasi `zod`) lalu `revalidatePath('/')` agar display
diperbarui maksimal 60 detik kemudian (atau reload manual).

## Vocab: kartu

Tambah/edit/hapus, geser urutan (↑↓) untuk mode urut. Audio opsional: isi URL file
`assets/audio/...` atau pilih dari library suara event (`/api/event-sounds/:id`).

## Vocab: slot

Satu baris = satu rentang tayang. Hari dicentang, format jam `HH:MM` (zona Asia/Jakarta).
`interval_sec` hanya berlaku untuk mode auto. Slot nonaktif tidak memicu takeover.

## Vocab: kendali manual

Muncul bila ada slot manual yang aktif. `Next/Prev` menggeser kartu yang tampil di display
(menulis `data/vocab-live.json`). `Hentikan live manual` menghapus state-nya.

## Troubleshooting panel

- Form gagal diam-diam → cek log terminal (`console.warn` / `console.error` dari actions).
- Upload suara ditolak → ekstensi harus mp3/wav/ogg/m4a/aac, maks 20 MB.
- Upload video ditolak → mp4/webm, maks 100 MB, tersimpan di `assets/videos/mufrodat/`.
