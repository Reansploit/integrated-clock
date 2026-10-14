# Panel kontrol

Dua halaman, satu bahasa, satu pola. Keduanya memakai shell yang sama (`.console`)
dan pola umpan balik yang sama.

- `/admin`: isi papan, dikelompokkan. Papan: teks berjalan, kota dan jadwal
  sholat, layar dan suara bawaan, hitung mundur. Jadwal: kegiatan. Audio:
  perpustakaan suara, rekaman terjadwal.
  Bahasa: mufrodat, video mufrodat, ringkasan kosakata (dikelola di halaman
  sendiri). Siaran: pengumuman langsung.
- `/control/vocab`: kosakata tayang: kartu, slot jadwal, kendali manual.

Papan memuat langsung ke isi. Tidak ada animasi pembuka, tidak ada gambar
pembuka, dan tidak ada strip sponsor.

## Cara kerjanya

Setiap tulisan (tambah, ubah, hapus, impor) melewati satu fungsi `guard()` di
`app/admin/actions.ts` atau `app/control/vocab/actions.ts`:

1. baca form (`readForm`), validasi `zod`;
2. kalau gagal, kembali ke halaman dengan `notice=invalid` plus nama field-nya;
3. kalau berhasil, tulis ke DB atau disk, `revalidatePath('/')`, lalu
   `redirect()` ke halaman asal dengan `?notice=<key>#<seksi>`, plus `page=<n>`
   kalau operator sedang di halaman 2 atau lebih daftar kegiatan.

Jadi **selalu** ada kalimat hasil di layar, dan operator mendarat kembali di
seksi dan halaman yang tadi ia isi, bukan di paling atas. `lib/panel-notice.ts` menyimpan
satu kalimat per `key`, jadi kalimatnya hanya ada di satu tempat dan tautan yang
diedit tangan tidak bisa menampilkan teks bebas. Nomor halaman ikut lewat input
tersembunyi `page` di setiap form, karena aksi server tidak tahu operator sedang
di halaman berapa.

Papan di `/` memuat ulang sendiri maksimal 10 detik setelah setiap simpanan:
tiap tulisan yang berhasil menaikkan counter revisi di DB, dan
`RevisionWatcher` di papan mengecek counter itu tiap 10 detik lalu reload
kalau angkanya bergerak. Reload menunggu video yang sedang tayang atau
pengumuman yang sedang berjalan sampai selesai dulu. `AutoRefresh` (tiap 30
menit, hanya saat tab benar-benar menampilkan `/`) tinggal sebagai pengaman.

## Hitung mundur

Dua tanggal di bawah daftar sholat (rail kanan papan): perpulangan dan ujian,
dihitung mundur dalam hari dari hari ini (zona Asia/Jakarta). Hari-H tulis
`Today`, tanggal yang sudah lewat tulis strip. Kolom dikosongkan berarti tidak
ada tanggal, papan hanya menampilkan strip tanpa penjelasan.

Tile yang punya tanggal dinyalakan dengan efek asap WebGL cyan (shader dari
kartu InfernoCard milik owner); tile kosong tetap kartu gelap biasa. Efeknya
berhenti otomatis saat night mode (rail disembunyikan) dan saat sistem menyetel
reduced motion.

## Rekaman terjadwal

Bagian `#rekaman` memutar matan, murottal, atau adzan pada jam yang ditentukan,
dengan batas jam selesai. Jamnya custom, bukan mengikuti jadwal sholat, jadi
pergeseran waktu sholat tidak mengubah jadwal rekaman.

**Jaminannya: tidak ada rekaman yang berhenti di tengah ayat.** Batas jam bukan
tombol pemutus. Server menyusun rencana sebelum file pertama berbunyi dan hanya
memasukkan file yang muat penuh; file yang tidak muat tidak pernah dibunyikan
sama sekali, bukan bunyi sebagian. Yang bisa terjadi justru "surah hari ini tidak
bunyi karena kelamaan", dan itu terlihat di konsol sebelum hari-H.

### Langkah pertama: ukur durasi

Tombol **Ukur semua durasi** membaca panjang tiap file di perpustakaan suara dan
menyimpannya. Tanpa langkah ini planner akan membuang semua file dengan alasan
"durasi belum diketahui", jadi tidak ada yang bunyi. Pengukuran ini diulang
otomatis oleh papan kalau ternyata durasi simpanannya meleset.

### Membaca garis waktu

Setiap slot menggambar jendela berdampingan dengan isinya: panjang jendela, berapa
yang terpakai, dan file mana yang tidak bunyi beserta alasannya ("Butuh 22:02,
jendela tinggal 20:54"). Bar yang terisi mentok sebelum ujung jendela berarti
playlistnya kurang muat. Berapa menit lebih panjang yang dibutuhkan slot ditulis
di bawahnya.

### Field

- **Mulai / Harus selesai sebelum** — HH:MM zona Asia/Jakarta. Batas yang lebih
  kecil dari jam mulai dibaca sebagai keesokan hari, jadi slot Isha boleh selesai
  lewat tengah malam.
- **Jeda antar rekaman** — diam antara dua file, tidak dipakai setelah file
  terakhir. File yang berakhir tepat di batas tetap bunyi.
- **Toleransi telat** — kalau papan menyala lebih lambat dari ini setelah jam
  mulai, slot dianggap terlewat dan tidak dibunyikan. Ini yang mencegah murottal
  nyasar jam tiga pagi.
- **Hari** — kosong berarti setiap hari.
- **Urutan** — tetap. Baris pertama bunyi pertama.

### Kalau bentrok

Hanya satu rekaman berjalan pada satu waktu. Slot berikutnya yang waktunya tiba
sambil rekaman pertama masih bunyi dicatat **dilewati, bentrok slot lain** di
riwayat, dan slot video mufrodat ikut melompati jadwalnya selama rekaman berjalan.
Mikrofon pengumuman langsung tetap boleh memutus karena bersifat darurat.

### Kalau halaman papan dimuat ulang

Papan melanjutkan run yang sama dari file yang belum selesai, **dari detik
pertama**. Bukan dari posisi di tengah rekaman, supaya tidak ada ayat yang terputus
di awal. Riwayat di bawah section menyimpan tayang terakhir beserta alasannya
(selesai, terlewat, melewati batas jam, dilewati).

## Kegiatan: suara penanda

Satu baris = satu kegiatan, dengan jam mulai dan jam selesai zona Asia/Jakarta.
Jam selesai boleh kosong: kalau begitu kegiatan berakhir tepat saat kegiatan
berikutnya mulai, atau 60 menit setelah mulai kalau tidak ada yang berikutnya.

Kolom **Suara penanda** memilih bunyi yang berbunyi tepat pada detik kegiatan
mulai. Pilihan berasal dari dua tempat sekaligus:

- *Perpustakaan*: file yang diunggah lewat `#suara`, tersimpan sebagai BLOB.
- *Folder*: mp3 yang ada langsung di `assets/audio/events/`.

Kolom dikosongkan berarti pakai **Suara bawaan kegiatan** di bagian
*Latar belakang dan suara*. Kalau keduanya kosong, kegiatan berjalan tanpa
bunyi.

Satu bunyi per kegiatan, bukan berulang: papan mengingat kegiatan yang sedang
diputar lewat id dan jam mulainya, jadi memuat ulang halaman di tengah kegiatan
tidak memutar ulang.

Browser bisa memblokir playback otomatis. Kalau terblokir, bunyi menunggu
sampai ada klik atau tombol ditekan di halaman papan, lalu diputar ulang sekali.

## Mufrodat: minggu bahasa

Pilihan di bagian Mufrodat menentukan bendera dan tulisan di atas daftar kata
di kotak kosakata papan: minggu Arab (🇸🇦 + أسبوع العربية) atau minggu Inggris
(🇬🇧 + english week). Tersimpan seperti pengaturan lain, jadi papan ikut
berubah sendiri setelah simpan.

## Kosakata: kartu

Satu baris = satu kartu. Urutan baris di daftar ikut dipakai saat mode putar
*Ikuti urutan daftar*, jadi tombol Naik dan Turun mengubah urutan yang benar.
Audio opsional: pilih dari perpustakaan suara di `/admin#suara`, atau isi URL
sendiri. Kalau URL diisi, URL itu yang dipakai.

## Kosakata: slot

Satu baris = satu rentang tayang. Hari dicentang, jam `HH:MM` zona
Asia/Jakarta. `Interval` hanya berlaku untuk mode Otomatis. Slot nonaktif tidak
memicu takeover. Batas atas dan bawah tombol Naik/Turun mati di ujungnya, jadi
tidak ada permintaan yang pasti ditolak.

Takeover tampil kalau keempatnya terpenuhi: slot dicentang Aktif, hari ini
termasuk yang dicentang, jam sekarang di dalam rentang, dan ada minimal satu
kartu. Papan mengecek jadwal tiap 30 detik sendiri, jadi slot yang baru dibuka
muncul paling lambat 30 detik kemudian tanpa F5, dan yang baru ditutup hilang
sendiri. Kalau tidak muncul juga, cek keempat syarat itu satu per satu, paling
sering hari atau jamnya belum cocok.

## Kosakata: kendali manual

Muncul bila ada slot berstatus aktif dengan mode putar Manual. Sebelumnya dan
Berikutnya menggeser kartu yang tampil di papan (menulis
`data/vocab-live.json`). Hentikan tampilan manual menghapus state-nya.

## Batas ukuran

|_Unggahan_| Format | Maks |
|---|---|---|
| Suara | mp3, wav, ogg, m4a, aac | 20 MB |
| Video mufrodat | mp4, webm | 100 MB |
| Gambar latar | png, jpg, gif, webp | 10 MB |

Audio disimpan sebagai BLOB di SQLite. Video dan gambar latar disimpan sebagai
file di `assets/videos/mufrodat/` dan `assets/backgrounds/`, hanya metadata-nya
yang ada di DB. Gambar latar tidak pernah menjadi backdrop permanen: ia
disembunyikan, lalu mengintip pudar 5 detik setiap 20 detik. Semua unggahan
lewat server action yang sama, jadi dari PC lain
di LAN pun jalurnya identik: yang penting tab admin dibuka lewat alamat server
(bukan file lokal), dan file tidak melebihi batas di atas.

## Kalau ada yang gagal

- Halaman tidak menampilkan kalimat hasil → lihat log terminal, cari `write-failed`
  atau `video-write-failed`.
- Unggahan ditolak → format di luar daftar di atas, atau lewat batas ukuran.
- `/admin` menampilkan "Database lokal belum siap" → `npm run db:seed`, lalu muat
  ulang.
- Baris hilang padahal tidak ada yang menghapus → cek tab lain; `row-missing`
  muncul kalau baris sudah tidak ada saat tombol ditekan.