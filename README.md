# CampusCare — Sistem Pengaduan & Pemeliharaan Fasilitas Kampus

Satu aplikasi web utuh yang menggabungkan tiga mockup CampusCare (login/registrasi, dashboard mahasiswa, dan dashboard admin Sarpras) menjadi **HTML, CSS, dan JS terpisah** dengan navigasi antar-tampilan tanpa berpindah halaman.

---

## Struktur File

```
.
├── index.html        # Seluruh markup: view auth, view mahasiswa, view admin, modal, toast
├── css/
│   └── style.css     # Design token, glassmorphism, router view, dock/tab, timeline, responsif
├── js/
│   └── app.js        # Router, autentikasi, data pengaduan, disposisi, filter, toast, hash routing
└── README.md         # Panduan menjalankan aplikasi
```

Tidak ada proses build. Semua gaya memakai Tailwind Play CDN + CSS kustom, semua perilaku ada di `js/app.js`.

---

## Cara Menjalankan

**Opsi 1 — langsung buka file**

Klik dua kali `index.html`, atau:

```powershell
start index.html
```

**Opsi 2 — server lokal (disarankan)**

```powershell
python -m http.server 8000
# lalu buka http://localhost:8000
```

Butuh koneksi internet karena memuat:

- Tailwind Play CDN (`cdn.tailwindcss.com` + plugin forms & container-queries)
- Google Fonts (Inter) dan Material Symbols
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

- `index.html#student` atau `index.html#mahasiswa` → dashboard mahasiswa
- `index.html#admin` → dashboard admin Sarpras
- tanpa hash → halaman login

> Catatan: mengubah hash pada URL yang sudah terbuka tidak memuat ulang halaman. Gunakan link di atas dari tab baru, atau tekan **Keluar** lalu masuk lagi.

**Mahasiswa** — Dashboard, Pengaduan Fasilitas, Timeline Status, Area Kampus (tab atas di desktop, dock ikon di mobile).

**Admin Sarpras** — Dashboard Admin, Disposisi Penugasan, Manajemen Teknisi, Inventaris Sarpras, Laporan & SLA.

---

## Fitur Utama

- **Router satu halaman** — tiga view (`#view-auth`, `#view-student`, `#view-admin`) dengan animasi fade, tanpa reload.
- **Pemilihan peran** saat login yang mengarahkan ke dashboard sesuai peran, plus tombol ganti peran di menu profil.
- **Daftar pengaduan berbasis data** — 7 tiket contoh (`#CC-2024-0915` dst.) yang dirender dari `state.reports` di `js/app.js`.
- **Pencarian & filter** — Semua, Verifikasi, Diproses, Selesai; jumlah badge dihitung otomatis.
- **Buat pengaduan baru** — tiket baru langsung masuk daftar dengan ID berurutan (`#CC-2026-0916`, ...).
- **Alur disposisi admin** — pilih teknisi + prioritas, status tiket berubah menjadi *Sedang Dikerjakan*, penghitung "Butuh Verifikasi" berkurang.
- **Timeline status** dan **detail tiket** untuk memantau progres penanganan.
- **Toast global** dan **modal terpusat** (bantuan SSO, pengaduan baru, disposisi).
- **Responsif** — dock admin menempel di bawah layar pada mobile, dock mahasiswa ringkas dan bisa digeser, tidak ada horizontal scroll pada 320–1440 px.
- **Aksesibilitas dasar** — `aria-label`/`aria-modal`, fokus pada modal, `prefers-reduced-motion`.

---

## Catatan Teknis

- Semua interaksi memakai **event delegation** (`data-action`, `data-student-tab`, `data-admin-tab`, `data-student-filter`, `data-admin-filter`) — tidak ada `onclick` inline.
- Data disimpan **di memori** (`state`) sehingga perubahan akan hilang saat halaman dimuat ulang; ini cukup untuk demo tanpa backend.
- Semua ID elemen unik dan setiap referensi `byId(...)` di `app.js` sudah diverifikasi ada di `index.html`.
- Aplikasi hanya terdiri dari `index.html`, `css/style.css`, `js/app.js`, dan `README.md` — tidak ada aset atau file mockup tambahan.
