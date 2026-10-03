# Operasi offline & internet lambat

Display dirancang jalan penuh tanpa internet setelah build pertama.

## Yang butuh internet (sekali, lalu cache)

- Jadwal sholat (MyQuran, timeout 2,5 dtk): cache segar 60 menit, dipakai sampai 7 hari saat offline.
- Cuaca (Open-Meteo, timeout 3 dtk): cache segar 30 menit, dipakai sampai 7 hari. Gagal total = tampil `--`.

## Yang selalu lokal

- Semua konten (jadwal, vocab, ticker, suara, video, background) dari `data/clock.db` + `assets/`.
- Polling display (state video 10 dtk, vocab 15–30 dtk) ke `localhost`, tidak kena internet lambat.
- Live announcement WebRTC: peer lokal; lintas jaringan butuh STUN/TURN (lihat README).

## Menjalankan

- Dev: `npm run dev`
- Produksi: `npm run build && npm start` (listen `0.0.0.0`, buka `http://<ip-pc>:3000`)
- Inisialisasi DB: `npm run db:init` (`tsx scripts/seed-db.ts`)
- Ganti lokasi DB: env `DB_FILE_PATH` (default `data/clock.db`)

## Darurat

- Display macet: reload browser (auto-reload tiap 30 menit juga aktif).
- Jadwal sholat basi > 7 hari: tampil kosong; sambungkan internet sebentar lalu reload.
- DB corrupt: restore salinan `data/clock.db`, atau hapus file dan jalankan `npm run db:init` (kembali ke bawaan).
