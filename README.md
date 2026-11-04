# CampusCare — Sistem Pengaduan & Pemeliharaan Fasilitas Kampus

Satu aplikasi web utuh yang menggabungkan tiga tampilan CampusCare (login/registrasi, dashboard mahasiswa, dan dashboard admin Sarpras) menjadi **satu SPA modular**: HTML dipecah menjadi partial per menu, CSS per kategori, dan JavaScript per modul.

> **Penting:** berkas HTML dimuat sebagai partial lewat `fetch`, jadi aplikasi **wajib dijalankan melalui web server**. Membuka `index.html` lewat `file://` akan menampilkan pesan kesalahan.

---

## Struktur File

```
.
├── index.html                 # Shell SPA: <head>, Tailwind config, kontainer partial, layar boot
├── views/                     # Partial HTML yang dimuat saat runtime
│   ├── auth.html              #   Halaman login & registrasi
│   ├── student.html           #   Kerangka dashboard mahasiswa (header + dock + footer)
│   ├── admin.html             #   Kerangka dashboard admin (header + drawer + konten)
│   ├── student/
│   │   ├── dashboard.html     #     Panel Dashboard
│   │   ├── complaints.html    #     Panel Pengaduan Fasilitas
│   │   ├── timeline.html      #     Panel Timeline Status
│   │   └── campus.html        #     Panel Area Kampus
│   ├── admin/
│   │   ├── dashboard.html     #     Panel Dashboard Admin
│   │   ├── dispatches.html    #     Panel Disposisi Penugasan
│   │   ├── techs.html         #     Panel Manajemen Teknisi
│   │   ├── inventory.html     #     Panel Inventaris Sarpras
│   │   └── sla.html           #     Panel Laporan & SLA
│   └── modals/
│       ├── complaint.html     #     Modal pengaduan baru
│       ├── dispatch.html      #     Modal disposisi teknisi
│       ├── sso-help.html      #     Modal bantuan SSO
│       └── toast.html         #     Notifikasi toast global
├── css/                       # Stylesheet modular (urutan pemuatan penting)
│   ├── tokens.css             #   Variabel warna, font, radius, bayangan
│   ├── base.css               #   Reset, tipografi, latar view, layar boot
│   ├── layout.css             #   Router view & panel SPA
│   ├── components.css         #   Glassmorphism, navigasi, form, modal, timeline
│   ├── student.css            #   Penyesuaian khusus mahasiswa
│   ├── admin.css              #   Header, drawer, dan konten admin
│   ├── responsive.css         #   Aturan responsif lintas view
│   └── utilities.css          #   Kelas bantu & preferensi pengguna
├── js/                        # ES module (tanpa build step)
│   ├── main.js                #   Titik masuk: muat partial → init → tampilkan UI
│   ├── events.js              #   Delegasi klik/keydown & pemetaan data-action
│   ├── core/
│   │   ├── dom.js             #     Helper DOM & format tanggal
│   │   ├── state.js           #     State aplikasi & penomoran tiket
│   │   ├── router.js          #     Perpindahan view + sinkronisasi hash
│   │   ├── partials.js        #     Pemuat partial HTML (fetch, rekursif)
│   │   └── init.js            #     Inisialisasi state, event, dan render awal
│   ├── data/
│   │   └── reports.js         #     Metadata kategori/status & data contoh
│   ├── ui/
│   │   ├── toast.js           #     Notifikasi
│   │   ├── modal.js           #     Buka/tutup modal
│   │   ├── menu.js            #     Menu dropdown akun
│   │   └── sidebar.js         #     Drawer admin
│   ├── views/
│   │   ├── auth.js            #     Tab login/registrasi, peran, kekuatan sandi
│   │   ├── student.js         #     Navigasi panel mahasiswa
│   │   └── admin.js           #     Navigasi panel admin
│   └── features/
│       ├── reports.js         #     Statistik, filter, render kartu tiket
│       ├── dispatch.js        #     Alur disposisi teknisi
│       ├── complaint.js       #     Pengaduan baru
│       ├── session.js         #     Masuk & keluar sesi
│       └── timeline.js        #     Pelacakan tiket
└── README.md                  # Panduan ini
```

Tidak ada proses build. Gaya memakai Tailwind Play CDN + CSS kustom, sedangkan seluruh perilaku berada di ES module dalam `js/` dan dimuat oleh `js/main.js`.

---

## Cara Menjalankan

**Server lokal (wajib)**

```powershell
# dari folder proyek
python -m http.server 8000
# lalu buka http://localhost:8000
```

Alternatif lain: `npx serve .`, ekstensi *Live Server* di VS Code, atau unggah folder ini ke GitHub Pages.

**Mengapa tidak bisa `file://`?** Partial dimuat dengan `fetch`, dan browser memblokir `fetch`/module script untuk protokol `file://`. Bila dibuka langsung, aplikasi menampilkan panel "Antarmuka tidak dapat dimuat" beserta instruksi server di atas.

Butuh koneksi internet karena memuat:

- Tailwind Play CDN (`cdn.tailwindcss.com` + plugin forms & container-queries)
- Google Fonts (Space Grotesk, Plus Jakarta Sans) dan Material Symbols
- Beberapa foto kampus dari `lh3.googleusercontent.com` (CSS menyediakan gradient sebagai fallback)

---

## Akun Demo

Form login bersifat demo: **email valid + kata sandi apa pun** akan diterima. Pilih peran lewat chip di atas form.

| Peran | Email contoh | Tujuan |
| --- | --- | --- |
| Mahasiswa | `217006001@student.unsil.ac.id` | Dashboard mahasiswa |
| Admin Sarpras | `admin@sarpras.unsil.ac.id` | Dashboard admin Sarpras |

Registrasi baru juga tersedia (minimal 8 karakter, konfirmasi sandi harus sama, dan checkbox persetujuan wajib dicentang).

---

## Navigasi

**Deep link** (langsung masuk tanpa login):

- `http://localhost:8000/#student` atau `#mahasiswa` → dashboard mahasiswa
- `http://localhost:8000/#admin` → dashboard admin Sarpras
- tanpa hash → halaman login

> Catatan: mengubah hash pada URL yang sudah terbuka tidak memuat ulang halaman. Gunakan link di atas dari tab baru, atau tekan **Keluar** lalu masuk lagi.

**Mahasiswa** — Dashboard, Pengaduan Fasilitas, Timeline Status, Area Kampus (tab atas di desktop, dock ikon di mobile).

**Admin Sarpras** — Dashboard Admin, Disposisi Penugasan, Manajemen Teknisi, Inventaris Sarpras, Laporan & SLA. Di layar kecil, menu dibuka lewat tombol hamburger (drawer).

---

## Fitur Utama

- **Router satu halaman** — tiga view (`#view-auth`, `#view-student`, `#view-admin`) dengan animasi fade, tanpa reload.
- **Pemilihan peran** saat login yang mengarahkan ke dashboard sesuai peran, plus tombol ganti peran di menu profil.
- **Daftar pengaduan berbasis data** — 7 tiket contoh (`#CC-2024-0915` dst.) yang dirender dari `state.reports`.
- **Pencarian & filter** — Semua, Verifikasi, Diproses, Selesai; jumlah badge dihitung otomatis.
- **Buat pengaduan baru** — tiket baru langsung masuk daftar dengan ID berurutan (`#CC-2026-0916`, ...).
- **Alur disposisi admin** — pilih teknisi + prioritas, status tiket berubah menjadi *Sedang Dikerjakan*, penghitung "Butuh Verifikasi" berkurang.
- **Timeline status** dan **detail tiket** untuk memantau progres penanganan.
- **Toast global** dan **modal terpusat** (bantuan SSO, pengaduan baru, disposisi).
- **Responsif** — menu admin berupa drawer, dock mahasiswa ringkas, tidak ada horizontal scroll pada 320–1440 px.
- **Aksesibilitas dasar** — `aria-label`/`aria-modal`, fokus pada modal, `prefers-reduced-motion`.

---

## Catatan Teknis

- **Urutan impor bebas dari siklus**: `core → data → ui → features → views → events → main`. `js/main.js` menunggu partial selesai dimuat sebelum menjalankan `init()`.
- Semua interaksi memakai **event delegation** (`data-action`, `data-student-tab`, `data-admin-tab`, `data-student-filter`, `data-admin-filter`) — tidak ada `onclick` inline.
- Partial boleh memuat partial lain (mis. modal di dalam `views/student.html`); `core/partials.js` menyelesaikannya secara rekursif.
- Setelah injeksi, UI baru ditampilkan setelah dua `requestAnimationFrame` agar Tailwind Play CDN sempat memindai kelas pada markup hasil injeksi.
- Data disimpan **di memori** (`state`) sehingga perubahan akan hilang saat halaman dimuat ulang; ini cukup untuk demo tanpa backend.
- Semua ID elemen unik dan setiap referensi `byId(...)` di modul JS sudah diverifikasi ada di partial terkait.
