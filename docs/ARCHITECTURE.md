# Arsitektur clock2

Display masjid/boardingschool fullscreen (Next.js App Router) + panel kontrol lokal.
Satu PC, satu file database, tahan internet lambat.

## Alur render display (`/`)

`app/page.tsx` (ISR 60 detik) memuat sekali lewat `getDashboardData()`:

- `getSettings / getEvents / getMufrodat / getTicker / getVocabItems / getVocabSlots` → SQLite lokal (`lib/db.ts`, `node:sqlite`, file `data/clock.db`)
- `getPrayerTimes(cityId)` → MyQuran API, cache 60 menit, fallback cache 7 hari
- `getWeather()` → Open-Meteo, cache 30 menit, fallback cache 7 hari, gagal = tampil `--`

Komponen overlay client yang poll sendiri:

| Overlay | Poll | Sumber |
|---|---|---|
| `MufrodatVideoOverlay` | 10 dtk | `GET /api/mufrodat-video/state` |
| `VocabTakeoverOverlay` | jadwal dihitung lokal tiap 15 dtk; refresh slot 30 dtk; live manual 3 dtk | `GET /api/vocab/active`, `GET /api/vocab/live` |
| `LiveAnnouncementOverlay` | SSE realtime | `GET /api/announcement/stream` |

## Aturan tulis database

- **SQLite hanya ditulis dari aksi admin** (Server Actions / API upload). Display tidak pernah menulis SQLite.
- **State transient tidak masuk SQLite**: playback video (`settings` nonce) ditulis hanya saat slot jadwal terpukul;
  live manual vocab di `data/vocab-live.json`; sesi announcement di memori (`lib/announcement/serverStore.ts`).
  Alasan: SQLite satu file, write tiap detik mempercepat bloat dan risiko lock.

## Modul penting

- `lib/db.ts` — satu-satunya pintu SQLite. Tambah tabel baru di `bootstrapDatabase()`, tambah getter di sini.
- `lib/vocab.ts` — logika jadwal murni (dipakai server + client). Uji via `npx tsx` bila diubah.
- `lib/vocab-live.ts` — file JSON atomik untuk live manual.
- `lib/prayer.ts`, `lib/weather.ts` — fetch eksternal + cache. Jangan turunkan timeout di bawah 2,5 dtk (internet lambat).
- `lib/media.ts` — resolver `/assets/...`. Aset display wajib lokal di `assets/`.
