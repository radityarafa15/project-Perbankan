# TODO — Layout Sidebar + Section Panel (index.html)

- [x] 1. Tambah CSS layout sidebar (.app-body, .sidebar, .sidebar-btn, .content-area, .panel-section)
- [x] 2. Bungkus dashboard dengan .dashboard-wrap
- [x] 3. Ganti blok shortcut jadi .app-body + sidebar nav (5 tombol menu)
- [x] 4. Bungkus tiap section dengan div.panel-section + id:
  - section-transaksi (Form + Grafik, aktif)
  - section-wallet (Akun / Dompet)
  - section-autodebit (Transaksi Berulang)
  - section-plan (Anggaran Bulanan)
  - section-history (Riwayat Transaksi)
- [x] 5. Tambah JS handler .sidebar-btn → toggle .panel-section.active
- [x] 6. Verifikasi struktur HTML (kurung div seimbang)
- [x] 7. Update CSS responsive device:
  - Default desktop: sidebar kiri sticky
  - @media <=860px: sidebar jadi baris horizontal wrap di atas konten, dashboard 1 kolom
  - @media <=480px: padding 12px, tombol menu 2 kolom, nilai kartu 20px
