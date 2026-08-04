# TODO — Fitur Aplikasi (index.html + service-worker.js + firebase-messaging-sw.js)

## Done — Transfer Antar Dompet

- [x] HP: form transfer di #section-wallet
- [x] JS: isi opsi akun transfer
- [x] JS: logika transfer + format nominal
- [x] hitungRingkasan abai transfer saat "Semua Akun"
- [x] hapusTransaksi berpasangan (transferPairId)
- [x] renderTabel label "Transfer" + badge netral

## Done — Point 2: Kategori Custom

- [x] KATEGORI_KEY + KATEGORI_DEFAULT + loader (muatKategori/simpanKategori)
- [x] HTML form "Kelola Kategori" (details)
- [x] JS renderDaftarKategoriCustom + refreshSemuaOpsiKategori + submit
- [x] Panggil muatKategori di bukaAplikasi & init; renderDaftarKategoriCustom di bukaAplikasi

## Done — Point 5: Filter Tanggal Custom (Export)

- [x] HTML opsi "Custom" + input rentang
- [x] JS show/hide wrap-tanggal-custom
- [x] Cabang "custom" di ambilRentangPeriode
- [x] Label + validasi + nama file custom di eksporLaporan

## Done — Point 6: Bump Service Worker

- [x] service-worker.js → CACHE_NAME "smoney-v2", ASSETS pakai android-chrome-\*.png, fetch hanya GET+ok

## Done — Firebase Cloud Messaging (Push Notifikasi)

- [x] B: Buat firebase-messaging-sw.js (importScripts, init, onBackgroundMessage, notificationclick)
- [x] C: Tambah script FCM di <head> (firebase-app-compat + firebase-messaging-compat)
- [x] C: firebaseConfig + VAPID_KEY + initFirebaseMessaging + daftarFCM + pasangListenerFCMForeground + tampilkanNotifikasi + updateTampilanLinkNotif
- [x] C: Footer link #link-aktifkan-notif
- [x] C: Panggil initFirebaseMessaging + pasangListenerFCMForeground + updateTampilanLinkNotif di bukaAplikasi

## Done — Overlay Dekripsi Gagal (PIN tidak cocok)

- [x] CSS #dekripsi-overlay
- [x] HTML overlay dengan 3 tombol: Coba PIN lain / Impor backup / Hapus data & mulai ulang
- [x] muatTransaksi() panggil tampilkanOverlayDekripsiGagal() saat decryptData gagal
- [x] JS tampilkan/sembunyikan overlay + hapusSemuaDataLokal() + event handlers

## Masih perlu dari USER

- [ ] Ganti semua nilai GANTI\_\* (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId, VAPID_KEY) dengan nilai Firebase produksi.
- [ ] Uji di Chrome (kasih izin notifikasi), cek console ada "FCM token: ..."

## Catatan

- Firebase config sengaja memakai placeholder "GANTI\_\*" selama belum ada nilai asli.
- Jika Firebase belum dikonfigurasi, tombol "Aktifkan push notifikasi" akan menampilkan toast "Firebase Messaging tidak tersedia." / "Gagal mendaftar push notifikasi." — ini normal tanpa config valid.
