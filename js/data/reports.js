/* ==========================================================================
   data/reports.js — Metadata kategori/status & data pengaduan contoh
   ========================================================================== */

export const CATEGORY_META = {
  ac: { icon: "mode_fan", badge: "bg-tertiary-fixed text-tertiary", label: "Kelistrikan & AC" },
  projector: { icon: "videocam_off", badge: "bg-primary-fixed text-primary", label: "Proyektor & Audio" },
  network: { icon: "wifi_off", badge: "bg-sky-100 text-sky-700", label: "Jaringan Wi-Fi" },
  sanitation: { icon: "plumbing", badge: "bg-amber-100 text-amber-900", label: "Sanitasi & Sipil" },
  furniture: { icon: "chair", badge: "bg-indigo-100 text-indigo-700", label: "Meubel & Ruang Kuliah" },
  lift: { icon: "elevator", badge: "bg-purple-100 text-purple-700", label: "Lift & Akses Gedung" },
  electrical: { icon: "lightbulb", badge: "bg-amber-100 text-amber-900", label: "Kelistrikan" },
};

export const STATUS_META = {
  review: {
    label: "Butuh Verifikasi & Disposisi",
    chip: "bg-primary-fixed text-on-primary-fixed",
    dot: "bg-primary",
    pulse: true,
  },
  progress: {
    label: "Sedang Dikerjakan",
    chip: "bg-tertiary-fixed text-on-tertiary-fixed-variant",
    dot: "bg-tertiary",
    pulse: false,
  },
  waiting: {
    label: "Menunggu Suku Cadang",
    chip: "bg-amber-100 text-amber-900",
    dot: "bg-amber-500",
    pulse: false,
  },
  done: {
    label: "Selesai & Valid",
    chip: "bg-emerald-100 text-emerald-800",
    dot: "bg-emerald-500",
    pulse: false,
  },
};

/** Data awal pengaduan untuk pengujian tanpa backend. */
export const seedReports = () => [
  {
    id: "#CC-2024-0915",
    title: "Lift Rektorat Macet dengan Penumpang di Lt. 2",
    reporter: "Rina Kartika (Tendik BAKPK)",
    owner: null,
    location: "Gedung Rektorat • Lift Utama",
    cat: "lift",
    status: "review",
    urgent: true,
    date: "Hari ini, 09:05 WIB",
    team: null,
    progress: 0,
    description:
      "Lift berhenti mendadak di lantai 2 dan pintu tidak terbuka. Dua orang sempat terjebak sebelum petugas datang.",
  },
  {
    id: "#CC-2024-0912",
    title: "AC Bocor & Air Menetes di Lab Komputer 3 Gedung F",
    reporter: "Ahmad Rizki (Mhs • 217006120)",
    owner: "217006120",
    location: "Dekanat FT Lt. 2 (Lab Komp 3)",
    cat: "ac",
    status: "review",
    urgent: true,
    date: "Hari ini, 08:42 WIB",
    team: null,
    progress: 0,
    description:
      "Air dari unit AC menetes tepat di atas meja komputer sehingga praktikum harus dipindahkan. Bau apek juga muncul di ruangan.",
  },
  {
    id: "#CC-2024-0908",
    title: "Proyektor Mati Total Ruang Kuliah R.204 GKB",
    reporter: "Ahmad Rizki (Mhs • 217006120)",
    owner: "217006120",
    location: "GKB R.204 Lt. 2",
    cat: "projector",
    status: "progress",
    urgent: false,
    date: "Hari ini, 07:15 WIB",
    team: "Pak Hendra & Tim AV",
    progress: 65,
    description:
      "Proyektor tidak menyala saat mata kuliah pagi. Kabel dan sumber listrik sudah dicek, tetapi lampu indikator tetap mati.",
  },
  {
    id: "#CC-2024-0899",
    title: "Kerusakan Pintu Geser & Saklar Toilet Pria Lt.1 Rektorat",
    reporter: "Siti Rahma (Tendik BAKPK)",
    owner: null,
    location: "Gedung Rektorat Lt. 1",
    cat: "sanitation",
    status: "waiting",
    urgent: false,
    date: "Kemarin, 14:10 WIB",
    team: "Pak Dadi (Sipil)",
    progress: 45,
    description:
      "Pintu geser tidak bisa menutup rapat dan saklar lampu toilet kadang tidak merespons. Perbaikan menunggu suku cadang engsel.",
  },
  {
    id: "#CC-2024-0885",
    title: "Lampu Sorot Lapangan Basket Sarpras Olahraga Putus",
    reporter: "BEM Mahasiswa (Ormawa)",
    owner: null,
    location: "Sarana Gelanggang Olahraga",
    cat: "electrical",
    status: "done",
    urgent: false,
    date: "24 Apr 2026 • 11:20 WIB",
    team: "Pak Nanang (1.2 Jam)",
    progress: 100,
    description:
      "Satu unit lampu sorot padam sehingga sebagian lapangan gelap saat latihan malam. Penggantian sudah selesai dan diuji.",
  },
  {
    id: "#CC-2024-0871",
    title: "Wi-Fi Perpustakaan Lt. 2 Sering Terputus",
    reporter: "Nabila Putri (Mhs • 217008812)",
    owner: "217008812",
    location: "Perpustakaan Pusat Lt. 2",
    cat: "network",
    status: "review",
    urgent: false,
    date: "Kemarin, 16:05 WIB",
    team: null,
    progress: 0,
    description:
      "Koneksi terputus setiap beberapa menit di area meja baca lantai 2. Perangkat terhubung ke SSID kampus tetapi tidak ada internet.",
  },
  {
    id: "#CC-2024-0864",
    title: "Kursi Kuliah R.301 Banyak yang Patah",
    reporter: "Ahmad Rizki (Mhs • 217006120)",
    owner: "217006120",
    location: "Fakultas Teknik R.301",
    cat: "furniture",
    status: "done",
    urgent: false,
    date: "22 Apr 2026 • 09:10 WIB",
    team: "Pak Iwan (Sipil)",
    progress: 100,
    description:
      "Lima kursi kuliah memiliki rangka patah dan sandaran longgar. Penggantian kursi sudah dilakukan sebelum ujian tengah semester.",
  },
];
