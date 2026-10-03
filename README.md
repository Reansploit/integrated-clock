# clock2 - Display Boarding School (Next.js + SQLite lokal)

Dashboard fullscreen untuk display: jam, jadwal sholat, kegiatan hari ini, vocab,
teks berjalan, video terjadwal, dan live announcement. Satu PC, satu file database
(`data/clock.db`, SQLite via `node:sqlite`), tahan internet lambat.

- Display: `/` (auto-refresh tiap 1 jam, ISR 60 detik)
- Panel lama: `/admin` (settings, events, mufrodat, video, announcement, ticker)
- Vocab control: `/control/vocab` (kartu + slot jadwal + kendali manual)

Dokumentasi penerus ada di `docs/`: `ARCHITECTURE.md`, `DB_SCHEMA.md`,
`VOCAB_TAKEOVER.md`, `CONTROL_PANEL.md`, `OFFLINE.md`, `API.md`.

## Jalankan lokal

- Dev: `npm run dev`
- Prod: `npm run build && npm start` (listen `0.0.0.0`)
- Inisialisasi DB: `npm run db:init`
- Ganti lokasi DB: `DB_FILE_PATH=./data/clock.db` (default)

Backup = copy `data/clock.db` + folder `assets/videos/mufrodat/`.

## Live Announcement v3 (WebRTC + SSE signaling)

Sistem live announcement sekarang memakai WebRTC untuk audio realtime, dengan signaling berbasis HTTP + SSE:

- `POST /api/announcement/session/start`
- `POST /api/announcement/session/stop`
- `POST /api/announcement/session/join`
- `POST /api/announcement/session/leave`
- `POST /api/announcement/session/signal`
- `GET /api/announcement/stream?role=admin`
- `GET /api/announcement/stream?role=viewer&viewerId=...`

Tidak ada lagi upload audio chunk HTTP untuk live announcement.

## Jalankan lokal

- Dev: `npm run dev`
- Prod: `npm run build && npm start`

## Environment

Token admin (opsional):

- Server: `ANNOUNCEMENT_ADMIN_TOKEN=...`
- Client admin: `NEXT_PUBLIC_ANNOUNCEMENT_ADMIN_TOKEN=...`

ICE/TURN (opsional, direkomendasikan untuk koneksi lintas jaringan/NAT ketat):

- `NEXT_PUBLIC_ANNOUNCEMENT_ICE_SERVERS`:
  - Format JSON array, contoh:
    `[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:turn.example.com:3478","username":"user","credential":"pass"}]`
  - Atau daftar URL dipisah koma: `stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302`
- `NEXT_PUBLIC_ANNOUNCEMENT_ICE_TRANSPORT_POLICY`:
  - `all` (default) atau `relay` (paksa lewat TURN)

## Catatan operasional

- Admin menekan dan menahan `SPACE` untuk broadcast mic realtime.
- Setiap viewer membangun peer WebRTC masing-masing (1:N dari admin).
- Untuk skala besar, disarankan migrasi ke SFU/TURN terkelola agar performa tetap stabil lintas NAT.
