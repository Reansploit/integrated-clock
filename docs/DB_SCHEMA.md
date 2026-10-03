# Skema database (SQLite, `data/clock.db`)

Dibuat otomatis oleh `ensureDatabase()` di `lib/db.ts`. Tidak ada migrasi versi:
tambah tabel/kolom baru langsung di `bootstrapDatabase()` dengan `IF NOT EXISTS`.

## Tabel awet (ditulis hanya dari panel kontrol)

- `settings(key PK, value)`: config display: kota, URL suara bawaan kegiatan, gambar layar, dan state playback video. Teks berjalan tidak ada di sini, sudah pindah ke `ticker_items`.
- `events(title, day, start, end_time, sound_url, note)`: jadwal kegiatan per hari (`senin`..`minggu`).
- `event_sounds(original_name UNIQUE, mime_type, file_ext, size_bytes, audio_data BLOB)`: perpustakaan suara (maks 20 MB/file).
- `mufrodat(arabic, translation)`: kosakata untuk kotak kanan bawah papan. Data kartu takeover yang lebih lengkap masuk `vocab_items`.
- `mufrodat_videos(original_name, relative_path UNIQUE, mime_type, size_bytes, sort_order)`: file fisik di `assets/videos/mufrodat/`.
- `ticker_items(text, sort_order)`: baris teks berjalan. Satu baris di tabel ini = satu baris di kotak bawah papan.
- `vocab_items(english, arabic, meaning, example_ar, example_meaning, audio_url, sort_order)`: kartu vocab takeover.
- `vocab_slots(title, days CSV, start HH:MM, end HH:MM, mode auto|manual, interval_sec, order_mode, enabled)`: slot tayang.

Key `settings` yang sudah dihapus dan tidak lagi dipakai: `theme`, `runningText`
(dipindah ke `ticker_items`), `sponsors` (strip sponsor sudah dibongkar),
`bootAnimationUrl`, dan `introImageUrl` (urutan pembuka papan dihapus seluruhnya,
termasuk folder `assets/boot/`). Key lama yang masih tertinggal di DB lokal boleh
dihapus manual; tidak ada kode yang membacanya lagi.

## File transient (bukan tabel)

- `data/vocab-live.json`: `{ slotId, index, nonce, updatedAt }` untuk mode manual. Ditulis dari `/control/vocab` dan `POST /api/vocab/manual`.
- Memori proses: sesi live announcement. Hilang saat restart, itu disengaja.

## Backup & restore

Salin `data/clock.db` **sekaligus file `-wal` dan `-shm` di sampingnya** kalau
aplikasi sedang jalan: SQLite_mode WAL menaruh penulisan baru di `clock.db-wal`,
jadi `clock.db` saja belum tentu berisi data terakhir. Menyalin ketiga file
sambil app berjalan masih bisa menghasilkan salinan yang tidak konsisten, jadi
tutup app dulu kalau bisa. Restore = timpa file-file itu, lalu muat ulang papan.

Audio BLOB ikut di file DB; video besar tetap di `assets/videos/mufrodat/`
(backup folder itu juga).

## Gabung database Postgres lama (`db:merge`)

2 database jadi 1 tanpa menghapus data lokal: baris yang sudah ada dilewati
(kunci natural: event = judul+hari+jam, mufrodat = arab+terjemahan, ticker/suara/video = nama/path unik),
settings dari PG menimpa key yang sama.

```bash
# Lihat dulu apa yang akan digabung, tanpa menulis:
PG_SOURCE_URL=postgresql://user:pass@host:5432/db npm run db:merge -- --dry-run

# Eksekusi gabung:
PG_SOURCE_URL=postgresql://user:pass@host:5432/db npm run db:merge
```

Catatan: file fisik video (`mufrodat_videos`) tidak ikut terkirim. Script akan
mencetak daftar file yang harus dicopy manual ke `assets/`.
