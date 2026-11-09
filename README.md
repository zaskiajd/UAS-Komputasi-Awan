# CampusCare — Sistem Pengaduan & Pemeliharaan Fasilitas Kampus

CampusCare adalah SPA modular tanpa build step untuk pengaduan dan pemeliharaan sarana kampus UNSIL. Aplikasi menggabungkan tiga tampilan — publik, portal mahasiswa, dan dashboard admin Sarpras — dalam satu shell HTML. Partial dimuat saat runtime, CSS dipisah per kategori, dan perilaku ditulis sebagai ES module.

> **Penting:** partial HTML dimuat lewat `fetch`, jadi aplikasi **wajib dijalankan melalui web server**. Membuka `index.html` lewat `file://` akan menampilkan pesan kesalahan.

---

## Struktur File

```text
index.html                  # Shell SPA: <head>, kontainer partial, layar boot
views/
  auth.html                 # Login & registrasi
  public.html               # Landing page publik
  student.html              # Kerangka portal mahasiswa
  admin.html                # Kerangka dashboard admin (header + drawer)
  student/
    summary.html            # Panel Ringkasan
    complaints.html         # Panel Pengaduan Saya + detail tiket
    help.html               # Panel Bantuan & Kontak
  admin/
    dashboard.html          # KPI, kesiapan aset, beban tim, audit log
    dispatches.html         # Antrean disposisi + pencarian/filter
    techs.html              # Tim & personil teknisi
    inventory.html          # Inventaris aset
    sla.html                # Laporan kinerja & SLA
    damage.html             # Rekapitulasi kerusakan per kategori & aset
  modals/
    complaint.html          # Modal pengaduan baru
    delete-history.html     # Modal konfirmasi hapus riwayat
    dispatch.html           # Modal disposisi teknisi
    sso-help.html           # Modal bantuan SSO
    operation-guide.html    # Modal panduan operasional Sarpras
    ticket-detail.html      # Modal detail & siklus status tiket
    technician.html         # Modal detail teknisi
    technician-form.html    # Modal tambah/edit data teknisi
    asset-detail.html       # Modal detail aset
    toast.html              # Notifikasi toast global
css/                        # Stylesheet modular (urutan pemuatan penting)
  tokens.css, base.css, layout.css, components.css
  student.css, admin.css, responsive.css, utilities.css
  debug.css, fonts.css, tailwind.input.css, tailwind.css
js/
  main.js                   # Muat partial -> init -> validasi shell -> tampilkan UI
  events.js                 # Delegasi event global & pemetaan data-action
  core/
    dom.js                  # Helper DOM & format tanggal/waktu
    state.js                # State aplikasi & penomoran tiket
    router.js               # Perpindahan view
    partials.js             # Pemuat partial HTML (fetch, retry, validasi)
    debug.js                # Mode debug & diagnosa mandiri
    init.js                 # Seed data, event, dan render awal
  data/
    reports.js              # Metadata kategori/status/prioritas & seed tiket
    assignments.js          # Helper PIC, pendukung, dan load balancing
    technicians.js          # 4 tim & 15 personil teknisi
    assets.js               # Seed aset, kondisi, dan riwayat perawatan
  ui/
    toast.js, modal.js, menu.js, sidebar.js
  views/
    auth.js, student.js, admin.js, public.js
  features/
    reports.js              # Statistik, filter, render kartu tiket
    analytics.js            # KPI, SLA, kesiapan, beban kerja, audit log, tren
    dispatch.js             # Alur disposisi & penyimpanan penugasan
    complaint.js            # Pengaduan baru mahasiswa
    session.js              # Masuk & keluar sesi demo
    timeline.js             # Detail progres tiket mahasiswa
    ticket-actions.js       # Detail tiket admin & siklus status
    technicians.js          # Kartu tim, detail teknisi, status siaga
    inventory.js            # Tabel aset, filter, detail, servis
    export.js               # Ekspor CSV per tab (tiket, antrean, teknisi, aset, SLA, kerusakan)
assets/fonts/               # Font WOFF2 lokal (teks + Material Symbols)
tailwind.config.js          # Tema & daftar berkas yang dipindai Tailwind
package.json                # Skrip build CSS (opsional, hanya maintainer)
README.md
```

Catatan: `views/student/timeline.html` dan `views/student/campus.html` adalah partial lama yang tidak lagi dimuat oleh `student.html`. Panel mahasiswa aktif hanya `summary`, `complaints`, dan `help`; detail progres tiket dirender di dalam panel Pengaduan Saya.

Tidak ada proses build saat menjalankan aplikasi. Utility Tailwind sudah dikompilasi ke `css/tailwind.css`, sedangkan seluruh perilaku berada di ES module dalam `js/` dan dimuat oleh `js/main.js`.

---

## Cara Menjalankan

**Server lokal (wajib)**

```powershell
# dari folder proyek
python -m http.server 8000
# lalu buka http://localhost:8000
```

Alternatif lain: `npx serve .`, ekstensi *Live Server* di VS Code, atau unggah folder ini ke GitHub Pages.

**Mengapa tidak bisa `file://`?** Partial dimuat dengan `fetch`, dan browser memblokir `fetch`/module script untuk protokol `file://`. Bila dibuka langsung, aplikasi menampilkan panel "Antarmuka tidak dapat dimuat" beserta instruksi server.

**Jika tampilan terlihat rusak setelah memperbarui file**, lakukan *hard refresh* (`Ctrl+F5`). Bila modul JS gagal dimuat, aplikasi menampilkan panel peringatan otomatis setelah 8 detik, bukan layar "Memuat CampusCare…" yang menggantung.

Tanpa koneksi internet aplikasi tetap berfungsi penuh: Tailwind sudah dikompilasi, JS disajikan lokal, dan seluruh font (termasuk ikon Material Symbols) di-*host* sendiri di `assets/fonts/`.

---

## Mode Debug

| Cara | Keterangan |
| --- | --- |
| `?debug=1` | Tambahkan pada URL, mis. `http://localhost:8000/?debug=1#student` |
| `Ctrl+Shift+D` | Buka/tutup panel debug kapan saja |
| `localStorage` | `localStorage.setItem("cc-debug", "1")` lalu muat ulang |

Panel **CampusCare Debug** menampilkan log boot, error runtime, dan tombol:

- **Diagnosa** — memeriksa protokol, stylesheet, utilitas Tailwind, design token, font lokal, keberadaan view/panel/modal, ID duplikat, kartu tiket, gambar rusak, serta menyimulasikan klik setiap tab mahasiswa/admin.
- **Salin** — menyalin seluruh laporan ke clipboard.
- **Bersihkan** — mengosongkan log.

Dari console browser tersedia `ccDiagnose()` dan `ccDebug.report()`.

---

## Akun Demo

Form login bersifat demo: **email valid + kata sandi apa pun** akan diterima. Pilih peran lewat chip di atas form.

| Peran | Email contoh | Tujuan |
| --- | --- | --- |
| Mahasiswa | `217006120@student.unsil.ac.id` | Portal mahasiswa (pemilik tiket seed) |
| Admin Sarpras | `hendrawan@unsil.ac.id` | Dashboard admin Sarpras |

Registrasi baru juga tersedia (minimal 8 karakter, konfirmasi sandi harus sama, dan checkbox persetujuan wajib dicentang).

---

## Navigasi

**Deep link** (langsung masuk tanpa login):

- `http://localhost:8000/#student` atau `#mahasiswa` → portal mahasiswa
- `http://localhost:8000/#admin` → dashboard admin Sarpras
- tanpa hash → halaman publik/login

> Catatan: mengubah hash pada URL yang sudah terbuka tidak memuat ulang halaman. Gunakan link di atas dari tab baru, atau tekan **Keluar** lalu masuk lagi.

**Mahasiswa** — Ringkasan, Pengaduan Saya, Bantuan & Kontak (tab atas di desktop, dock ikon di mobile).

**Admin Sarpras** — Dashboard, Disposisi Penugasan, Manajemen Teknisi, Inventaris Sarpras, Laporan SLA, dan Rekapitulasi Kerusakan. Pintasan **Audit Log Stream** membuka dashboard lalu menggulir ke daftar audit, sedangkan **Panduan Operasional** membuka modal SOP. Menu pengaturan, jadwal pemeliharaan, dan peta kampus tidak disertakan pada prototipe ini. Di layar kecil, menu dibuka lewat drawer.

---

## Fitur Utama

### Portal mahasiswa

- Ringkasan pengaduan milik sendiri berdasarkan NIM (`owner`).
- Pengaduan baru langsung masuk daftar dengan ID berurutan (`#CC-2026-0916`, dst.).
- Detail progres tiket: gauge persentase, 4 tahapan interaktif, status, tim, prioritas, dan deskripsi.
- Pencarian & filter status; mode pilih untuk menghapus satu atau beberapa riwayat.

### Dashboard admin

- **KPI dinamis** — total masuk, butuh verifikasi, diproses/menunggu, selesai, plus subtitle SLA dan jumlah laporan hari ini.
- **Kesiapan sarana** — skor berbobot dari kondisi aset, grade otomatis, dan rincian per zona.
- **Beban kerja tim** — jumlah personil bertugas, tiket aktif, tiket selesai, dan kapasitas per tim.
- **Audit log** — entri terbaru dari riwayat status seluruh tiket.
- **Antrean disposisi** — pencarian, filter urgent/normal, jumlah tiket tampil, umur antrean, dan indikator batas aman.
- **Siklus tiket** — disposisi ke tim/teknisi tertentu, PIC + teknisi pendukung, prioritas, SLA otomatis, instruksi terarah, catatan operasional, serta transisi `review → progress → waiting/done → reopen`.
- **Roster & reassignment** — detail tiket menampilkan PIC dan pendukung aktif; admin dapat mengganti PIC, menambah/melepas pendukung, dan mengirim instruksi ke teknisi tertentu. Riwayat penugasan disimpan terstruktur (`active`, `replaced`, `removed`, `done`).
- **Manajemen teknisi** — 4 tim, 15 personil awal, tabel personil dengan pencarian/filter tim & status, jumlah tiket aktif/selesai, keahlian, detail keahlian/kontak/tiket, serta toggle status bertugas/standby yang dijaga selama teknisi masih memegang tiket aktif.
- **CRUD teknisi** — admin dapat menambah personil baru, mengedit nama/tim/peran/telepon/keahlian/status, serta menghapus atau mengarsipkan teknisi. Teknisi yang sudah memiliki riwayat tiket diarsipkan agar histori tetap utuh, dan dapat dipulihkan lewat filter status "Diarsipkan". Koordinator otomatis diganti bila pindah tim, turun peran, atau dihapus, sehingga setiap tim tetap memiliki satu koordinator.
- **Beban kerja personil** — analitik per teknisi (PIC + pendukung) dan pemilihan PIC otomatis berdasarkan beban tiket paling ringan saat disposisi.
- **Inventaris** — 7 aset seed, kondisi berbobot, pencarian, filter kondisi, detail riwayat perawatan, tiket terkait, dan aksi "Tandai Selesai Servis".
- **Laporan & SLA** — rata-rata penyelesaian, persentase SLA dihitung dari tiket selesai tepat waktu, tiket selesai, backlog, tren 6 bulan, dan capaian per kategori.
- **Rekapitulasi Kerusakan** — ringkasan tiket aktif, prioritas tinggi aktif, dan aset yang perlu perhatian; rekap per kategori; serta daftar tiket kerusakan dengan status SLA. Setiap baris terhubung ke detail tiket atau detail aset.
- **Ekspor CSV per tab** — satu tombol ekspor di tiap tab: Dashboard (rekap tiket), Disposisi (antrean), Teknisi (data personil), Inventaris (aset), Laporan SLA (ringkasan + tren + kategori + rincian status SLA), dan Rekapitulasi Kerusakan (ringkasan + aset terdampak + tiket). Semua ekspor mengikuti filter/pencarian aktif, memakai `Blob` + `URL.createObjectURL`, dan kompatibel dibuka di Excel tanpa dependency tambahan. Tiap file diawali blok identitas (jenis laporan, waktu ekspor, filter, pencarian, jumlah baris) sehingga isinya mudah dibedakan.

### Umum

- Router satu halaman dengan animasi fade, tanpa reload.
- Toast global dan modal terpusat dengan focus trap serta pemulihan fokus.
- Responsif 320–1440 px; menu admin berupa drawer dan dock mahasiswa ringkas.
- Aksesibilitas dasar: `aria-label`/`aria-modal`, fokus modal, `prefers-reduced-motion`.

---

## Catatan Teknis

- **Arah impor bebas siklus**: `core → data → ui → features → views → events → main`. Modul fitur boleh mengimpor `analytics.js`, tetapi `analytics.js` tidak mengimpor modul fitur.
- **Analitik murni + renderer**: perhitungan KPI/SLA/kesiapan/beban kerja berada di `features/analytics.js` dan membaca `state`; renderer dipanggil ulang setiap data berubah.
- **Partial tahan gagal sesaat**: `core/partials.js` mencoba ulang sekali, menolak respons kosong atau dokumen HTML penuh, dan menyebutkan path bermasalah.
- **Audit tampilan otomatis**: setiap perpindahan view diaudit; bila panel aktif tidak terlihat, peringatan tampil dan dicatat di mode debug.
- Semua interaksi memakai **event delegation** (`data-action`, `data-student-tab`, `data-admin-tab`, `data-student-filter`, `data-admin-filter`, `data-dispatch-filter`, `data-inventory-filter`).
- Partial boleh memuat partial lain (mis. modal di dalam `views/student.html`); pemuat partial menyelesaikannya secara rekursif.
- Data disimpan **di memori** (`state`) sehingga perubahan hilang saat halaman dimuat ulang; ini cukup untuk demo tanpa backend.
- Semua ID elemen unik dan setiap referensi `byId(...)` di modul JS sudah diverifikasi ada di partial terkait.

### Menyesuaikan Tailwind

`css/tailwind.css` dihasilkan dari tema di `tailwind.config.js`. Jika menambah kelas utility baru pada `index.html`, `views/**`, atau `js/**`, kompilasi ulang:

```powershell
npm install          # sekali saja
npm run build:css
```

Sumber kompilasi ada di `css/tailwind.input.css`; `node_modules/` diabaikan git sehingga aplikasi tetap bisa dijalankan tanpa npm.

Beberapa varian `xl:` yang dipakai panel admin (`xl:grid-cols-12`, `xl:col-span-4/5/7/8`) dilengkapi manual di `css/utilities.css` karena belum ada di hasil kompilasi `css/tailwind.css`. Jika nanti menjalankan `npm run build:css`, periksa kembali apakah varian tersebut sudah ikut terkompilasi.
