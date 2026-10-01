# Vocab takeover

Saat slot jadwal aktif, display (`/`) otomatis fullscreen menampilkan kartu vocab:
kiri kartu (English / Arab, arti, contoh), kanan strip jam vertikal. Slot contoh
bawaan (`Contoh Halaqah Malam 21:00–21:15`) berstatus nonaktif.

## Cara kerja

1. Server me-render `slots` + `items` ke `VocabTakeoverOverlay` (ISR 60 dtk).
2. Client menghitung slot aktif tiap 15 dtk dengan `findActiveSlot()` (`lib/vocab.ts`,
   zona Asia/Jakarta). Slot aktif = `enabled` + hari ini masuk `days` + `start <= now < end`
   (mendukung lewat tengah malam, misal `23:00–00:30`).
3. Tumpang tindih dimenangkan oleh jam mulai paling akhir.
4. `mode=auto` → kartu berotasi tiap `interval_sec` (3–120 dtk), urut atau acak.
   `mode=manual` → kartu ikut `data/vocab-live.json` (poll 3 dtk, hanya saat slot manual aktif).
5. Audio per kartu (opsional) bunyi tiap ganti kartu setelah display disentuh/ditekan sekali
   (kebijakan autoplay browser).

## Endpoint

- `GET /api/vocab/active` → `{ slot, items }` atau `{ slot: null, items: [] }`.
- `GET /api/vocab/live` → `{ live: { slotId, index, nonce } | null }`.
- `POST /api/vocab/manual` → `{ slotId, index }` atau `{ stop: true }`. Hanya untuk slot manual.
  Trigger antar-device (LAN) direncanakan fase berikutnya; saat ini dipakai dari PC yang sama.

## Menambah jadwal baru

Di `/control/vocab` → Jadwal Tayang: isi nama, centang hari (boleh beda jam per hari
dengan membuat beberapa slot), isi mulai/selesai `HH:MM`, pilih auto/manual, simpan, aktifkan.
