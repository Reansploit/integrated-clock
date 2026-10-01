# Live Announcement Python Server

## Run

```powershell
cd la-server
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8001
```

`--host 0.0.0.0` membuat server bisa diakses device lain dalam satu network LAN.

## Env

- `ANNOUNCEMENT_ADMIN_TOKEN` (optional)
- `LA_ALLOWED_ORIGINS` (default `*`, atau daftar origin dipisah koma)

## Next.js Integration

Set di `.env.local` app utama:

```env
NEXT_PUBLIC_LA_BASE_URL=http://YOUR_LAN_IP:8001
```

Contoh:

```env
NEXT_PUBLIC_LA_BASE_URL=http://192.168.1.10:8001
```

