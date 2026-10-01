# Referensi API

## Vocab takeover

- `GET /api/vocab/active` → `{ ok, slot: VocabSlot | null, items: VocabItem[] }`
- `GET /api/vocab/live` → `{ ok, live: { slotId, index, nonce } | null }`
- `POST /api/vocab/manual` body `{ slotId, index }` atau `{ stop: true }` → `{ ok, live? }`.
  Error: `invalid_slot` (400), `slot_not_found` (404), `slot_not_manual` (400).

## Video mufrodat

- `GET /api/mufrodat-video/state` → `{ ok, videoUrl, playbackNonce }`. Pada slot jadwal
  yang terpukul, sekaligus mengunci slot (5 settings ditulis) agar tiap slot memutar 1 video.
- `POST /api/mufrodat-video/ack` body `{ playbackNonce }` → membersihkan state setelah diputar.
- `POST /api/mufrodat-video/upload-legacy` → form upload + trigger putar sekali (redirect ke `/admin?notice=`).

## Suara event

- `GET /api/event-sounds/:id` → biner audio (`Content-Type` asli, `no-store`).

## Live announcement (WebRTC + SSE, detail di README)

- `POST /api/announcement/session/{start,stop,join,leave,signal}`
- `GET /api/announcement/stream?role=admin` atau `?role=viewer&viewerId=...`

## Aset

- `GET /assets/[...path]` → file dari folder `assets/` (background, audio, video, logo).
