# TV Digital Signage System - Clock + Mufrodat + Video Scheduler

Production-ready monorepo blueprint for a **24/7 school TV signage platform** with:

- Futuristic fullscreen clock UI
- Mufrodat rotation (Arabic + translation)
- Active event display
- Prayer times with per-prayer offset
- Boot video flow + scheduled fullscreen video takeover
- Admin-ready REST API (Laravel + PostgreSQL)

## 1) Project Structure

```text
.
├── backend
│   ├── app
│   │   ├── Console
│   │   │   ├── Commands/SyncPrayerTimes.php
│   │   │   └── Kernel.php
│   │   ├── Http/Controllers/Api
│   │   │   ├── DisplayStateController.php
│   │   │   ├── EventController.php
│   │   │   ├── MediaAssetController.php
│   │   │   ├── MufrodatController.php
│   │   │   ├── PrayerTimeController.php
│   │   │   └── SettingController.php
│   │   ├── Models
│   │   └── Services/PrayerTimeSyncService.php
│   ├── config/services.php
│   ├── database/migrations
│   ├── database/seeders/DatabaseSeeder.php
│   └── routes/api.php
└── frontend
    ├── src
    │   ├── api/client.ts
    │   ├── components
    │   ├── hooks
    │   ├── store/signageStore.ts
    │   ├── styles/global.css
    │   ├── types/signage.ts
    │   ├── App.tsx
    │   └── main.tsx
    ├── index.html
    └── package.json
```

## 2) Backend (Laravel API)

### Key API Endpoints

- `GET /api/display/state` → one payload for TV frontend polling every 5s
- `GET /api/prayer-times/today` → required endpoint (offset applied)
- `POST /api/prayer-times/offsets` → set manual offsets
- `POST /api/events/import` → bulk JSON import
- CRUD:
  - `/api/events`
  - `/api/mufrodat`
  - `/api/media-assets`
- `POST /api/settings` → theme / optional settings

### Prayer API Integration

Uses external source (via backend only):

`POST https://equran.id/api/v2/shalat`

Sync flow:
1. Scheduler runs daily (`00:05`) with command `prayer-times:sync`.
2. Month data is cached into PostgreSQL table `prayer_times`.
3. Frontend consumes only local backend endpoint (`/api/prayer-times/today`).

### Database Tables

- `prayer_times`
- `prayer_offsets`
- `events`
- `mufrodats`
- `media_assets`
- `settings`

## 3) Frontend (React + Vite)

### Mode System

- `boot` → autoplay muted boot MP4 + duration fallback + onEnded fallback
- `clock` → normal signage UI
- `video` → scheduled fullscreen MP4, hides full UI

### Polling + Long-Run Stability

- Poll `/api/display/state` every 5 seconds.
- Intervals are cleaned in hooks/components.
- API failure fallback message is shown to avoid blank screen.

### UI Layers

1. Background image/video
2. Dark blur overlay (glassmorphism)
3. Content layer (header, clock, mufrodat, footer)

### TV Readability

- 16:9 fullscreen layout
- No scroll
- Orbitron for digital clock
- Large typography and spacing

## 4) Admin Features (via REST)

- Upload boot video + duration
- Upload background image/video
- Upload scheduled video + time range
- CRUD events
- CRUD mufrodat
- Set prayer offsets
- Import events JSON
- Theme setting (dark/light/auto)

## 5) Environment Notes

### Backend `.env` example

```env
APP_NAME="TV Signage"
APP_ENV=production
APP_URL=http://localhost:8000

DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=signage
DB_USERNAME=postgres
DB_PASSWORD=postgres

EQURAN_BASE_URL=https://equran.id/api/v2
EQURAN_PROVINCE="Jawa Timur"
EQURAN_CITY="kab. jombang"
```

### Frontend `.env` example

```env
VITE_API_BASE_URL=http://localhost:8000/api
```

## 6) Production Hardening Checklist

- Serve via systemd + supervisor (php-fpm/nginx + frontend static files)
- Enable Laravel queues for heavy media jobs
- Add health endpoint + watchdog restart policy on TV device
- Add signed URL or auth for admin panel upload routes
- Configure storage lifecycle + media cleanup
- Add monitoring (Sentry + uptime checks)
