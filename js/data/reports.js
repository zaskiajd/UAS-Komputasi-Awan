/* ==========================================================================
   data/reports.js — Metadata kategori/status & data pengaduan contoh
   ========================================================================== */

import { todayLabel } from "../core/dom.js";

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
    short: "Verifikasi",
    chip: "bg-primary-fixed text-on-primary-fixed",
    dot: "bg-primary",
    pulse: true,
  },
  progress: {
    label: "Sedang Dikerjakan",
    short: "Diproses",
    chip: "bg-tertiary-fixed text-on-tertiary-fixed-variant",
    dot: "bg-tertiary",
    pulse: false,
  },
  waiting: {
    label: "Menunggu Suku Cadang",
    short: "Menunggu",
    chip: "bg-amber-100 text-amber-900",
    dot: "bg-amber-500",
    pulse: false,
  },
  done: {
    label: "Selesai & Valid",
    short: "Selesai",
    chip: "bg-emerald-100 text-emerald-800",
    dot: "bg-emerald-500",
    pulse: false,
  },
};

/** Target SLA dalam jam berdasarkan prioritas disposisi. */
export const SLA_HOURS = { Tinggi: 2, Sedang: 6, Rendah: 24 };

export const PRIORITY_META = {
  Tinggi: { chip: "bg-error-container text-on-error-container", label: "Prioritas Tinggi" },
  Sedang: { chip: "bg-primary-fixed text-primary", label: "Prioritas Sedang" },
  Rendah: { chip: "bg-surface-container text-secondary", label: "Prioritas Rendah" },
};

const MINUTE = 60 * 1000;

/** Data awal pengaduan untuk pengujian tanpa backend. */
export const seedReports = () => {
  const now = Date.now();
  const at = (minutesAgo) => new Date(now - minutesAgo * MINUTE).toISOString();
  const due = (createdAt, priority) =>
    new Date(new Date(createdAt).getTime() + SLA_HOURS[priority] * 60 * MINUTE).toISOString();

  const report = (input) => {
    const priority = input.priority || (input.urgent ? "Tinggi" : "Sedang");
    const createdAt = input.createdAt;
    const base = {
      team: null,
      teamId: null,
      assignee: null,
      assignedAt: null,
      assignments: [],
      instructions: [],
      progress: 0,
      notes: [],
      priority,
      slaDueAt: due(createdAt, priority),
      ...input,
      date: todayLabel(createdAt),
      history: input.history || [
        {
          at: createdAt,
          label: "Pengaduan diterima",
          actor: input.reporter,
          status: "review",
          note: "Laporan masuk ke antrean verifikasi Biro Sarpras.",
        },
      ],
    };

    // Data seed lama hanya menyimpan `assignee`; turunkan riwayat penugasan
    // terstruktur agar roster PIC/pendukung langsung tersedia.
    if (base.assignee) {
      if (!Array.isArray(base.assignments)) base.assignments = [];
      if (!base.assignments.length) {
        base.assignments = [
          {
            techId: base.assignee,
            role: "PIC",
            assignedAt: base.assignedAt || base.updatedAt || createdAt,
            assignedBy: "Ir. Hendrawan",
            status: base.status === "done" ? "done" : "active",
          },
        ];
      }
      base.assignedAt =
        base.assignedAt || base.assignments[0]?.assignedAt || base.updatedAt || createdAt;
    }

    return base;
  };

  return [
    report({
      id: "#CC-2026-0915",
      title: "Lift Rektorat Macet dengan Penumpang di Lt. 2",
      reporter: "Rina Kartika (Tendik BAKPK)",
      owner: null,
      location: "Gedung Rektorat • Lift Utama",
      cat: "lift",
      status: "review",
      urgent: true,
      priority: "Tinggi",
      progress: 0,
      createdAt: at(12),
      updatedAt: at(12),
      completedAt: null,
      description:
        "Lift berhenti mendadak di lantai 2 dan pintu tidak terbuka. Dua orang sempat terjebak sebelum petugas datang.",
    }),
    report({
      id: "#CC-2026-0912",
      title: "AC Bocor & Air Menetes di Lab Komputer 3 Gedung F",
      reporter: "Ahmad Rizki (Mhs • 217006120)",
      owner: "217006120",
      location: "Dekanat FT Lt. 2 (Lab Komp 3)",
      cat: "ac",
      status: "review",
      urgent: true,
      priority: "Tinggi",
      progress: 0,
      createdAt: at(18),
      updatedAt: at(18),
      completedAt: null,
      description:
        "Air dari unit AC menetes tepat di atas meja komputer sehingga praktikum harus dipindahkan. Bau apek juga muncul di ruangan.",
    }),
    report({
      id: "#CC-2026-0908",
      title: "Proyektor Mati Total Ruang Kuliah R.204 GKB",
      reporter: "Ahmad Rizki (Mhs • 217006120)",
      owner: "217006120",
      location: "GKB R.204 Lt. 2",
      cat: "projector",
      status: "progress",
      urgent: false,
      priority: "Sedang",
      team: "Tim Multimedia & AV",
      teamId: "av",
      assignee: "fajar",
      assignedAt: at(140),
      assignments: [
        {
          techId: "fajar",
          role: "PIC",
          assignedAt: at(140),
          assignedBy: "Ir. Hendrawan",
          status: "active",
        },
        {
          techId: "yudi",
          role: "Pendukung",
          assignedAt: at(120),
          assignedBy: "Ir. Hendrawan",
          status: "active",
        },
      ],
      instructions: [
        {
          id: "INS-0908-01",
          at: at(42),
          from: "Ir. Hendrawan",
          toTechId: "fajar",
          text: "Gunakan unit proyektor cadangan dari gudang AV dan uji HDMI sebelum kelas berikutnya.",
          readAt: null,
        },
      ],
      progress: 65,
      createdAt: at(155),
      updatedAt: at(40),
      completedAt: null,
      description:
        "Proyektor tidak menyala saat mata kuliah pagi. Kabel dan sumber listrik sudah dicek, tetapi lampu indikator tetap mati.",
      notes: [
        {
          at: at(38),
          author: "Fajar",
          text: "Unit proyektor sudah dibuka. Ballast lampu terindikasi lemah, sedang disiapkan unit pengganti.",
        },
      ],
      history: [
        {
          at: at(155),
          label: "Pengaduan diterima",
          actor: "Ahmad Rizki",
          status: "review",
          note: "Laporan masuk ke antrean verifikasi.",
        },
        {
          at: at(140),
          label: "Disposisi ke Tim Multimedia & AV",
          actor: "Ir. Hendrawan",
          status: "progress",
          note: "Prioritas sedang, target SLA 6 jam.",
        },
        {
          at: at(40),
          label: "Teknisi mulai menangani",
          actor: "Fajar",
          status: "progress",
          note: "Pemeriksaan unit dan jalur daya selesai.",
        },
      ],
    }),
    report({
      id: "#CC-2026-0899",
      title: "Kerusakan Pintu Geser & Saklar Toilet Pria Lt.1 Rektorat",
      reporter: "Siti Rahma (Tendik BAKPK)",
      owner: null,
      location: "Gedung Rektorat Lt. 1",
      cat: "sanitation",
      status: "waiting",
      urgent: false,
      priority: "Sedang",
      team: "Tim Sanitasi & Sipil",
      teamId: "civil",
      assignee: "dadi",
      assignedAt: at(1600),
      assignments: [
        {
          techId: "dadi",
          role: "PIC",
          assignedAt: at(1600),
          assignedBy: "Ir. Hendrawan",
          status: "active",
        },
        {
          techId: "nanang",
          role: "Pendukung",
          assignedAt: at(1580),
          assignedBy: "Ir. Hendrawan",
          status: "active",
        },
      ],
      instructions: [
        {
          id: "INS-0899-01",
          at: at(125),
          from: "Ir. Hendrawan",
          toTechId: "dadi",
          text: "Koordinasikan dengan vendor engsel; bila tiba, pasang bersama Nanang dan uji buka-tutup 20 kali.",
          readAt: null,
        },
      ],
      progress: 45,
      createdAt: at(1680),
      updatedAt: at(120),
      completedAt: null,
      description:
        "Pintu geser tidak bisa menutup rapat dan saklar lampu toilet kadang tidak merespons. Perbaikan menunggu suku cadang engsel.",
      notes: [
        {
          at: at(120),
          author: "Dadi",
          text: "Engsel pintu tipe geser sudah dipesan ke vendor. Estimasi tiba 2 hari kerja.",
        },
      ],
      history: [
        {
          at: at(1680),
          label: "Pengaduan diterima",
          actor: "Siti Rahma",
          status: "review",
          note: "Laporan masuk ke antrean verifikasi.",
        },
        {
          at: at(1600),
          label: "Disposisi ke Tim Sanitasi & Sipil",
          actor: "Ir. Hendrawan",
          status: "progress",
          note: "Pemeriksaan awal oleh tim sipil.",
        },
        {
          at: at(120),
          label: "Menunggu suku cadang",
          actor: "Dadi",
          status: "waiting",
          note: "Perbaikan tertunda sampai engsel pengganti tiba.",
        },
      ],
    }),
    report({
      id: "#CC-2026-0885",
      title: "Lampu Sorot Lapangan Basket Sarpras Olahraga Putus",
      reporter: "BEM Mahasiswa (Ormawa)",
      owner: null,
      location: "Sarana Gelanggang Olahraga",
      cat: "electrical",
      status: "done",
      urgent: false,
      priority: "Rendah",
      team: "Tim Kelistrikan & Tata Udara",
      teamId: "electrical",
      assignee: "agus",
      progress: 100,
      createdAt: at(4320),
      updatedAt: at(2880),
      completedAt: at(2880),
      description:
        "Satu unit lampu sorot padam sehingga sebagian lapangan gelap saat latihan malam. Penggantian sudah selesai dan diuji.",
      notes: [
        {
          at: at(2890),
          author: "Agus",
          text: "Lampu LED 200W diganti dan diuji nyala selama 30 menit. BAP sudah ditandatangani.",
        },
      ],
      history: [
        {
          at: at(4320),
          label: "Pengaduan diterima",
          actor: "BEM Mahasiswa",
          status: "review",
          note: "Laporan masuk ke antrean verifikasi.",
        },
        {
          at: at(4200),
          label: "Disposisi ke Tim Kelistrikan & Tata Udara",
          actor: "Ir. Hendrawan",
          status: "progress",
          note: "Target SLA 24 jam.",
        },
        {
          at: at(2880),
          label: "Pekerjaan selesai & divalidasi",
          actor: "Agus",
          status: "done",
          note: "Penggantian lampu sorot selesai dan lolos uji nyala.",
        },
      ],
    }),
    report({
      id: "#CC-2026-0871",
      title: "Wi-Fi Perpustakaan Lt. 2 Sering Terputus",
      reporter: "Nabila Putri (Mhs • 217008812)",
      owner: "217008812",
      location: "Perpustakaan Pusat Lt. 2",
      cat: "network",
      status: "review",
      urgent: false,
      priority: "Sedang",
      progress: 0,
      createdAt: at(40),
      updatedAt: at(40),
      completedAt: null,
      description:
        "Koneksi terputus setiap beberapa menit di area meja baca lantai 2. Perangkat terhubung ke SSID kampus tetapi tidak ada internet.",
    }),
    report({
      id: "#CC-2026-0864",
      title: "Kursi Kuliah R.301 Banyak yang Patah",
      reporter: "Ahmad Rizki (Mhs • 217006120)",
      owner: "217006120",
      location: "Fakultas Teknik R.301",
      cat: "furniture",
      status: "done",
      urgent: false,
      priority: "Sedang",
      team: "Tim Sanitasi & Sipil",
      teamId: "civil",
      assignee: "iwan",
      progress: 100,
      createdAt: at(7200),
      updatedAt: at(5760),
      completedAt: at(5760),
      description:
        "Lima kursi kuliah memiliki rangka patah dan sandaran longgar. Penggantian kursi sudah dilakukan sebelum ujian tengah semester.",
      history: [
        {
          at: at(7200),
          label: "Pengaduan diterima",
          actor: "Ahmad Rizki",
          status: "review",
          note: "Laporan masuk ke antrean verifikasi.",
        },
        {
          at: at(7100),
          label: "Disposisi ke Tim Sanitasi & Sipil",
          actor: "Ir. Hendrawan",
          status: "progress",
          note: "Target SLA 6 jam.",
        },
        {
          at: at(5760),
          label: "Pekerjaan selesai & divalidasi",
          actor: "Iwan",
          status: "done",
          note: "Lima kursi diganti dan area kelas dibersihkan.",
        },
      ],
    }),

    /* Arsip selesai beberapa bulan terakhir agar tren & SLA punya data nyata. */
    report({
      id: "#CC-2026-0845",
      title: "Perbaikan Lift Gedung B Setelah Pemadaman",
      reporter: "Satpam Gedung B",
      owner: null,
      location: "Gedung B • Lift Penumpang",
      cat: "lift",
      status: "done",
      urgent: false,
      priority: "Tinggi",
      team: "Tim Sanitasi & Sipil",
      teamId: "civil",
      assignee: "nanang",
      progress: 100,
      createdAt: at(43200),
      updatedAt: at(43110),
      completedAt: at(43110),
      description:
        "Lift berhenti di lantai dasar setelah pemadaman listrik. Reset panel dan pemeriksaan darurat sudah dilakukan.",
      history: [
        {
          at: at(43200),
          label: "Pengaduan diterima",
          actor: "Satpam Gedung B",
          status: "review",
          note: "Laporan masuk ke antrean verifikasi.",
        },
        {
          at: at(43190),
          label: "Disposisi ke Tim Sanitasi & Sipil",
          actor: "Ir. Hendrawan",
          status: "progress",
          note: "Prioritas tinggi, target SLA 2 jam.",
        },
        {
          at: at(43110),
          label: "Pekerjaan selesai & divalidasi",
          actor: "Nanang",
          status: "done",
          note: "Reset panel dan uji operasi lift selesai.",
        },
      ],
    }),
    report({
      id: "#CC-2026-0812",
      title: "Proyektor Aula Serbaguna Bergaris",
      reporter: "Bagian Akademik",
      owner: null,
      location: "Aula Serbaguna • Lt. 1",
      cat: "projector",
      status: "done",
      urgent: false,
      priority: "Sedang",
      team: "Tim Multimedia & AV",
      teamId: "av",
      assignee: "yudi",
      progress: 100,
      createdAt: at(86400),
      updatedAt: at(86280),
      completedAt: at(86280),
      description:
        "Gambar proyektor bergaris saat presentasi. Kabel HDMI diganti dan unit dibersihkan.",
      history: [
        {
          at: at(86400),
          label: "Pengaduan diterima",
          actor: "Bagian Akademik",
          status: "review",
          note: "Laporan masuk ke antrean verifikasi.",
        },
        {
          at: at(86380),
          label: "Disposisi ke Tim Multimedia & AV",
          actor: "Ir. Hendrawan",
          status: "progress",
          note: "Target SLA 6 jam.",
        },
        {
          at: at(86280),
          label: "Pekerjaan selesai & divalidasi",
          actor: "Yudi",
          status: "done",
          note: "Kabel HDMI diganti, gambar kembali normal.",
        },
      ],
    }),
    report({
      id: "#CC-2026-0788",
      title: "Saluran Air Hujan Tersumbat di Koridor FT",
      reporter: "Cleaning Service FT",
      owner: null,
      location: "Fakultas Teknik • Koridor Lt. 1",
      cat: "sanitation",
      status: "done",
      urgent: false,
      priority: "Sedang",
      team: "Tim Sanitasi & Sipil",
      teamId: "civil",
      assignee: "asep",
      progress: 100,
      createdAt: at(129600),
      updatedAt: at(129300),
      completedAt: at(129300),
      description:
        "Air menggenang di koridor saat hujan. Saluran dibersihkan dan penutup drainase diperbaiki.",
      history: [
        {
          at: at(129600),
          label: "Pengaduan diterima",
          actor: "Cleaning Service FT",
          status: "review",
          note: "Laporan masuk ke antrean verifikasi.",
        },
        {
          at: at(129560),
          label: "Disposisi ke Tim Sanitasi & Sipil",
          actor: "Ir. Hendrawan",
          status: "progress",
          note: "Target SLA 6 jam.",
        },
        {
          at: at(129300),
          label: "Pekerjaan selesai & divalidasi",
          actor: "Asep",
          status: "done",
          note: "Saluran air dan penutup drainase sudah normal.",
        },
      ],
    }),
    report({
      id: "#CC-2026-0742",
      title: "Access Point Perpustakaan Lt. 1 Mati",
      reporter: "Pustakawan Shift Pagi",
      owner: null,
      location: "Perpustakaan Pusat Lt. 1",
      cat: "network",
      status: "done",
      urgent: false,
      priority: "Sedang",
      team: "Tim Jaringan & IT",
      teamId: "network",
      assignee: "bayu",
      progress: 100,
      createdAt: at(172800),
      updatedAt: at(172740),
      completedAt: at(172740),
      description:
        "Access point mati total sehingga area lobi perpustakaan tidak mendapat Wi-Fi. Adaptor daya diganti.",
      history: [
        {
          at: at(172800),
          label: "Pengaduan diterima",
          actor: "Pustakawan Shift Pagi",
          status: "review",
          note: "Laporan masuk ke antrean verifikasi.",
        },
        {
          at: at(172780),
          label: "Disposisi ke Tim Jaringan & IT",
          actor: "Ir. Hendrawan",
          status: "progress",
          note: "Target SLA 6 jam.",
        },
        {
          at: at(172740),
          label: "Pekerjaan selesai & divalidasi",
          actor: "Bayu",
          status: "done",
          note: "Adaptor daya AP diganti dan koneksi diuji.",
        },
      ],
    }),
    report({
      id: "#CC-2026-0701",
      title: "Panel Listrik Lab Basis Data Sering Trip",
      reporter: "Dosen Lab Basis Data",
      owner: null,
      location: "Gedung F • Lab Basis Data",
      cat: "electrical",
      status: "done",
      urgent: true,
      priority: "Tinggi",
      team: "Tim Kelistrikan & Tata Udara",
      teamId: "electrical",
      assignee: "hendra",
      progress: 100,
      createdAt: at(216000),
      updatedAt: at(215820),
      completedAt: at(215820),
      description:
        "MCB panel lab sering trip saat komputer digunakan bersamaan. Beban dibagi ulang dan MCB diganti.",
      history: [
        {
          at: at(216000),
          label: "Pengaduan diterima",
          actor: "Dosen Lab Basis Data",
          status: "review",
          note: "Laporan masuk ke antrean verifikasi.",
        },
        {
          at: at(215990),
          label: "Disposisi ke Tim Kelistrikan & Tata Udara",
          actor: "Ir. Hendrawan",
          status: "progress",
          note: "Prioritas tinggi, target SLA 2 jam.",
        },
        {
          at: at(215820),
          label: "Pekerjaan selesai & divalidasi",
          actor: "Hendra",
          status: "done",
          note: "MCB diganti dan beban panel dibagi ulang.",
        },
      ],
    }),
  ];
};
