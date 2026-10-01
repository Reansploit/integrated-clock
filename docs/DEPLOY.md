# Deploy ke PC display (Windows)

Panduan pindah source, install, jalan, dan testing. Waktu yang dibutuhkan ±30 menit
(kebanyakan menunggu `npm install` dan `npm run build`).

## 1. Syarat PC target

- Windows 10/11 64-bit, RAM minimal 4 GB.
- **Node.js versi 22 ke atas** (cek: `node --version`). Unduh di https://nodejs.org (pilih LTS).
  Wajib 22+ karena database memakai `node:sqlite` bawaan Node.
- Internet: hanya dibutuhkan saat `npm install`, `npm run build`, dan fetch pertama
  jadwal sholat/cuaca. Setelah itu display jalan offline.

## 2. Copy source via flashdisk

Dari PC ini, copy folder project ke flashdisk **KECUALI** folder berikut (dibuat ulang otomatis):

- `node_modules/` (besar, install ulang di target)
- `.next/` (hasil build, build ulang di target)
- `.venv/`, `__pycache__/`, `la-server/.venv/` (sisa eksperimen Python, tidak dipakai app)

Yang lain ikut semua, termasuk `data/clock.db` (isi konten saat ini ikut pindah)
dan `assets/` (suara, video, gambar). Kalau mau mulai dari nol, hapus `data/clock.db`
di target lalu jalankan `npm run db:init`.

Contoh lokasi di target: `D:\clock2`.

## 3. Install & jalan pertama (di PC target)

Buka terminal (PowerShell/CMD) di folder project:

```bat
node --version        :: pastikan v22+
npm install           :: butuh internet, sekali saja
npm run db:init       :: siapkan database (lewati bila data/clock.db ikut dicopy)
npm run build         :: build produksi
npm start             :: jalan di http://localhost:3000
```

Atau cara gampang: **klik 2x `start-display.bat`** (otomatis build bila perlu, lalu jalan).

Buka browser ke `http://localhost:3000`, tekan **F11** untuk fullscreen.

## 4. Testing real (checklist)

Lakukan berurutan, centang yang lolos:

- [ ] Display `/` tampil: jam analog+digital, jadwal sholat, event hari ini, vocab kecil, teks berjalan.
- [ ] `/control/vocab`: tambah 1 kartu, tambah 1 slot (hari ini, mulai = sekarang, selesai = +10 menit, aktif).
      Tunggu ≤60 detik / reload display → takeover fullscreen muncul + kartu rotate.
- [ ] Mode manual: ubah slot ke manual → Kendali Manual Next/Prev ganti kartu di display.
- [ ] Audio kartu: upload mp3 di Library Audio → pasang ke kartu → dengar preview di kontrol.
      Di display, audio bunyi setelah layar disentuh/diklik sekali (aturan browser).
- [ ] `/admin`: tambah 1 event hari ini (cek muncul di display), simpan 1 baris ticker baru.
- [ ] Video (bila ada file): upload mp4 di Mufrodat Video → trigger playback → tampil fullscreen sekali.
- [ ] Announcement: di `/admin` bagian Live Announcement, tahan SPACE dan bicara
      (butuh mic + izin browser). Display yang sama di tab lain harus menampilkan badge pengumuman.
- [ ] Internet dimatikan setelah semua di atas lolos: reload display → konten lokal tetap jalan,
      jadwal sholat pakai cache (maks 7 hari), cuaca tampil `--`.
- [ ] Restart PC → ulangi langkah 3 (klik `start-display.bat`) → data tetap ada (bukti persistensi SQLite).

## 5. Kalau ada error

| Gejala | Penyebab umum | Perbaikan |
|---|---|---|
| `node` tidak dikenal | Node belum install / terminal lama | Install Node 22+, tutup-buka terminal |
| `npm install` gagal | Internet / proxy | Cek internet, ulangi |
| Display kosong setelah build | `.env.local` hilang | Copy ulang file itu dari PC asal |
| Halaman vocab 500 | `data/` tidak bisa ditulis | Pastikan folder tidak read-only / terkunci antivirus |
| Suara tidak bunyi | Autoplay browser | Klik/sentuh layar sekali dulu |

## 6. Rutin setelah deploy

- Backup: copy `data/clock.db` + `assets/` ke flashdisk seminggu sekali.
- Update konten: edit dari `/admin` dan `/control/vocab` langsung di PC display.
