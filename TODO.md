# TODO — Fitur Tambahan (index.html + service-worker.js)

## Done — Transfer Antar Dompet

- [x] 1. HTML form transfer di #section-wallet
- [x] 2. JS isi opsi akun transfer
- [x] 3. JS logika transfer + format nominal
- [x] 4. hitungRingkasan abai transfer saat "Semua Akun"
- [x] 5. hapusTransaksi berpasangan (transferPairId)
- [x] 6. renderTabel label "Transfer" + badge netral

## Done — Point 2: Kategori Custom

- [x] A. Tambah KATEGORI_KEY
- [x] B. Ganti KATEGORI → KATEGORI_DEFAULT + loader muatKategori/simpanKategori
- [x] C. HTML form "Kelola Kategori" (details) di section transaksi
- [x] D. JS renderDaftarKategoriCustom + refreshSemuaOpsiKategori + submit handler
- [x] Panggil muatKategori() di bukaAplikasi() & init(); renderDaftarKategoriCustom() di bukaAplikasi()

## Done — Point 5: Filter Tanggal Custom (Export)

- [x] A. HTML opsi "Custom" + input rentang (export-dari / export-sampai)
- [x] B. JS show/hide wrap-tanggal-custom saat custom dipilih
- [x] C. Tambah cabang "custom" di ambilRentangPeriode
- [x] D. Label + validasi + nama file custom di eksporLaporan

## Done — Point 6: Bump Service Worker

- [x] Update service-worker.js → CACHE_NAME "smoney-v2", ASSETS pakai android-chrome-\*.png, fetch hanya cache GET + ok
- [x] Registrasi SW di index.html sudah ada

## Verifikasi

- [ ] Buka di browser, cek console tidak ada error
- [ ] Chrome: Application → Service Workers → Unregister sekali, lalu refresh (v2 aktif)
