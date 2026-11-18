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

/* --------------------------------------------------------------------------
   Data tiket dummy sudah dihapus: frontend tidak lagi menyimpan laporan
   contoh. Semua tiket dimuat dari backend (features/tickets-api.js).
   -------------------------------------------------------------------------- */
