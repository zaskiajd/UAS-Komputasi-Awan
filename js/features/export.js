/* ==========================================================================
   features/export.js — Ekspor data per tab ke CSV (kompatibel Excel)
   ========================================================================== */

import { state } from "../core/state.js";
import {
  primaryAssignee,
  supportAssignments,
  ticketInvolves,
} from "../data/assignments.js";
import { CATEGORY_META, STATUS_META } from "../data/reports.js";
import { assetCondition } from "../data/assets.js";
import { TEAM_BY_ID } from "../data/technicians.js";
import { showToast } from "../ui/toast.js";
import { filteredAdminReports, filteredDispatchReports } from "./reports.js";
import { filteredAssets } from "./inventory.js";
import { filteredTechnicians } from "./technicians.js";
import { categoryBreakdown, monthlyTrend, slaStateLabel, slaStats } from "./analytics.js";

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

const csvCell = (value) => {
  const text = String(value ?? "").replace(/\r?\n/g, " ").trim();
  return `"${text.replace(/"/g, '""')}"`;
};

const csvLine = (cells) => cells.map(csvCell).join(";");

function downloadFile(filename, content, mime = "text/csv;charset=utf-8;") {
  const blob = new Blob([`\ufeff${content}`], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Unduh beberapa baris CSV; baris kosong dipakai sebagai pemisah bagian. */
function downloadCsv(filename, rows) {
  downloadFile(filename, rows.map(csvLine).join("\r\n"));
}

const stamp = () => {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return [
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`,
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`,
  ].join("-");
};

const formatDateTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const hoursBetween = (start, end) => {
  if (!start || !end) return null;
  const from = new Date(start).getTime();
  const to = new Date(end).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.round(((to - from) / 3600000) * 10) / 10;
};

const monthLabel = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return `${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`;
};

const currentPeriodLabel = () => {
  const now = new Date();
  return `${MONTHS_SHORT[now.getMonth()]} ${now.getFullYear()}`;
};

/** Status SLA sebuah tiket pada saat ekspor (sama dengan tampilan UI). */
const slaState = slaStateLabel;

const reportDuration = (report) =>
  report.status === "done" ? hoursBetween(report.createdAt, report.completedAt) : null;

const FILTER_LABEL = {
  all: "Semua",
  urgent: "Urgent",
  normal: "Normal",
  review: "Butuh Verifikasi",
  progress: "Diproses",
  waiting: "Menunggu",
  done: "Selesai",
  good: "Baik",
  maintenance: "Perlu Servis",
  broken: "Rusak",
  active: "Bertugas",
  standby: "Standby",
  archived: "Diarsipkan",
};

/** Blok identitas di awal CSV agar tiap jenis ekspor mudah dibedakan. */
function metaRows(title, details) {
  return [
    [`CampusCare — ${title}`],
    ["Diekspor", formatDateTime(new Date().toISOString())],
    ...details,
    [],
  ];
}

export function exportReports(reports = filteredAdminReports(), options = {}) {
  const scope = options.scope || "rekap-tiket";
  const label = options.label || "tiket";
  const title = options.title || "Rekap Tiket";

  if (!reports.length) {
    showToast("Tidak Ada Data", "Belum ada tiket untuk diekspor pada filter ini.", "error");
    return;
  }

  const header = [
    "Kode Tiket",
    "Judul",
    "Kategori",
    "Status",
    "Prioritas",
    "Pelapor",
    "Lokasi",
    "Tim",
    "PIC",
    "Teknisi Pendukung",
    "Dibuat",
    "Batas SLA",
    "Selesai",
    "Jumlah Catatan",
    "Jumlah Instruksi",
    "Status SLA",
    "Durasi (Jam)",
  ];

  const rows = reports.map((report) => {
    const assignee = primaryAssignee(report, state.technicians);
    const supporters = supportAssignments(report, state.technicians)
      .map((entry) => entry.technician.name)
      .join(", ");
    return [
      report.id,
      report.title,
      CATEGORY_META[report.cat]?.label || report.cat,
      STATUS_META[report.status]?.label || report.status,
      report.priority || "-",
      report.reporter,
      report.location,
      report.team || "-",
      assignee?.name || "-",
      supporters || "-",
      formatDateTime(report.createdAt || report.date),
      formatDateTime(report.slaDueAt),
      formatDateTime(report.completedAt),
      (report.notes || []).length,
      (report.instructions || []).length,
      slaState(report),
      reportDuration(report) ?? "-",
    ];
  });

  downloadCsv(`campuscare-${scope}-${stamp()}.csv`, [
    ...metaRows(title, [
      ["Jenis Laporan", "Tiket pengaduan"],
      ["Filter Status", options.filterLabel || FILTER_LABEL[state.adminFilter] || "Semua"],
      ["Pencarian", options.query || state.adminQuery || "-"],
      ["Jumlah Baris", reports.length],
    ]),
    header,
    ...rows,
  ]);
  showToast(
    "Ekspor Selesai",
    `${reports.length} ${label} diekspor ke CSV (dapat dibuka di Excel).`,
    "success"
  );
}

export function exportAssets(assets = filteredAssets()) {
  if (!assets.length) {
    showToast("Tidak Ada Data", "Belum ada aset untuk diekspor pada filter ini.", "error");
    return;
  }

  const header = [
    "Kode Aset",
    "Nama Fasilitas",
    "Lokasi",
    "Zona",
    "Kondisi",
    "Status",
    "Tim",
    "Servis Terakhir",
    "Catatan",
  ];

  const rows = assets.map((asset) => [
    asset.id,
    asset.name,
    asset.location,
    asset.zone,
    assetCondition(asset.condition).label,
    asset.archived ? "Diarsipkan" : "Aktif",
    TEAM_BY_ID[asset.teamId]?.name || "-",
    formatDateTime(asset.lastServiceAt),
    asset.note || "-",
  ]);

  const statusMeta = {
    active: "Aktif",
    archived: "Diarsipkan",
    all: "Semua status",
  };

  downloadCsv(`campuscare-inventaris-${stamp()}.csv`, [
    ...metaRows("Inventaris Aset Sarpras", [
      ["Jenis Laporan", "Aset & fasilitas"],
      ["Filter Status", statusMeta[state.assetStatusFilter] || "Aktif"],
      [
        "Filter Kondisi",
        state.inventoryFilter === "all"
          ? "Semua kondisi"
          : assetCondition(state.inventoryFilter).label,
      ],
      ["Pencarian", state.inventoryQuery || "-"],
      ["Jumlah Baris", assets.length],
    ]),
    header,
    ...rows,
  ]);
  showToast(
    "Ekspor Inventaris Selesai",
    `${assets.length} aset diekspor ke CSV (dapat dibuka di Excel).`,
    "success"
  );
}

export function exportTechnicians(technicians = filteredTechnicians()) {
  if (!technicians.length) {
    showToast("Tidak Ada Data", "Belum ada teknisi untuk diekspor pada filter ini.", "error");
    return;
  }

  const header = [
    "ID Personil",
    "Nama",
    "Jabatan",
    "Peran",
    "Tim",
    "Status",
    "Telepon",
    "Keahlian",
    "Tiket Aktif",
    "Tiket Selesai",
    "Total Tiket",
  ];

  const rows = technicians.map((technician) => {
    const tickets = state.reports.filter((report) =>
      ticketInvolves(report, technician.id)
    );
    const active = tickets.filter((report) => report.status !== "done").length;
    const done = tickets.filter((report) => report.status === "done").length;
    const status = technician.archived
      ? "Diarsipkan"
      : technician.active
        ? "Bertugas"
        : "Standby";
    return [
      technician.id,
      technician.name,
      technician.title,
      technician.role,
      TEAM_BY_ID[technician.teamId]?.name || "-",
      status,
      technician.phone || "-",
      (technician.skills || []).join(", ") || "-",
      active,
      done,
      tickets.length,
    ];
  });

  downloadCsv(`campuscare-data-teknisi-${stamp()}.csv`, [
    ...metaRows("Data Teknisi Lapangan", [
      ["Jenis Laporan", "Personil teknisi"],
      [
        "Filter Tim",
        state.techTeamFilter === "all"
          ? "Semua tim"
          : TEAM_BY_ID[state.techTeamFilter]?.name || state.techTeamFilter,
      ],
      [
        "Filter Status",
        state.techStatusFilter === "all"
          ? "Semua status"
          : FILTER_LABEL[state.techStatusFilter] || state.techStatusFilter,
      ],
      ["Pencarian", state.techQuery || "-"],
      ["Jumlah Baris", technicians.length],
    ]),
    header,
    ...rows,
  ]);
  showToast(
    "Ekspor Data Teknisi Selesai",
    `${technicians.length} personil diekspor ke CSV (dapat dibuka di Excel).`,
    "success"
  );
}

export function exportDamage() {
  const reports = [...state.reports].sort(
    (a, b) =>
      Number(a.status === "done") - Number(b.status === "done") ||
      Number(b.priority === "Tinggi") - Number(a.priority === "Tinggi") ||
      new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
  );
  const active = reports.filter((report) => report.status !== "done");
  const attentionAssets = state.assets
    .filter((asset) => !asset.archived && asset.condition !== "good")
    .sort(
      (a, b) =>
        assetCondition(a.condition).weight - assetCondition(b.condition).weight ||
        a.name.localeCompare(b.name)
    );

  if (!reports.length) {
    showToast("Tidak Ada Data", "Belum ada tiket kerusakan untuk diekspor.", "error");
    return;
  }

  const rows = [
    ["Rekapitulasi Kerusakan CampusCare"],
    ["Diekspor", formatDateTime(new Date().toISOString())],
    ["Jenis Laporan", "Rekap kerusakan & aset terdampak"],
    ["Jumlah Tiket", reports.length],
    [],
    ["Ringkasan", "Nilai"],
    ["Total Laporan Kerusakan", reports.length],
    ["Tiket Masih Aktif", active.length],
    ["Tiket Prioritas Tinggi Aktif", active.filter((report) => report.priority === "Tinggi").length],
    ["Aset Perlu Perhatian", attentionAssets.length],
    [],
    ["Aset Perlu Perhatian"],
    ["Kode Aset", "Nama Fasilitas", "Lokasi", "Zona", "Kondisi", "Servis Terakhir", "Catatan"],
    ...attentionAssets.map((asset) => [
      asset.id,
      asset.name,
      asset.location,
      asset.zone,
      assetCondition(asset.condition).label,
      formatDateTime(asset.lastServiceAt),
      asset.note || "-",
    ]),
    [],
    ["Daftar Tiket Kerusakan"],
    [
      "Kode Tiket",
      "Judul",
      "Kategori",
      "Status",
      "Prioritas",
      "Lokasi",
      "Dibuat",
      "Batas SLA",
      "Selesai",
      "Status SLA",
    ],
    ...reports.map((report) => [
      report.id,
      report.title,
      CATEGORY_META[report.cat]?.label || report.cat,
      STATUS_META[report.status]?.label || report.status,
      report.priority || "-",
      report.location,
      formatDateTime(report.createdAt || report.date),
      formatDateTime(report.slaDueAt),
      formatDateTime(report.completedAt),
      slaState(report),
    ]),
  ];

  downloadCsv(`campuscare-rekap-kerusakan-${stamp()}.csv`, rows);
  showToast(
    "Ekspor Rekap Kerusakan Selesai",
    `${reports.length} tiket dan ${attentionAssets.length} aset diekspor ke CSV.`,
    "success"
  );
}

export function exportSla() {
  const stats = slaStats();
  const trend = monthlyTrend(6);
  const categories = categoryBreakdown();
  const period = currentPeriodLabel();
  const reports = [...state.reports].sort(
    (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
  );

  const rows = [
    ["Laporan Kinerja & SLA CampusCare"],
    ["Data per", period],
    ["Diekspor", formatDateTime(new Date().toISOString())],
    [],
    ["Ringkasan", "Nilai"],
    ["Total Tiket", stats.total],
    ["Tiket Selesai", stats.done],
    ["Tiket Selesai Tepat Waktu", stats.onTime],
    ["Tiket Selesai Terlambat", stats.lateDone],
    ["SLA Tercapai (%)", stats.percent],
    ["Rata-rata Penyelesaian (Jam)", stats.avgHours],
    ["Backlog Aktif", stats.backlog],
    ["Backlog Prioritas Tinggi", stats.urgentBacklog],
    ["Melewati SLA", stats.overdue],
    [],
    ["Tren 6 Bulan", "Tiket Selesai"],
    ...trend.map((month) => [month.fullLabel, month.count]),
    [],
    ["Target SLA per Kategori", "Selesai", "Total", "Persentase (%)"],
    ...categories.map((category) => [
      category.meta.label,
      category.done,
      category.total,
      category.percent,
    ]),
    [],
    ["Rincian Tiket"],
    [
      "Kode Tiket",
      "Judul",
      "Kategori",
      "Status",
      "Prioritas",
      "Tim",
      "PIC",
      "Dibuat",
      "Batas SLA",
      "Selesai",
      "Status SLA",
      "Durasi (Jam)",
      "Bulan Selesai",
    ],
    ...reports.map((report) => [
      report.id,
      report.title,
      CATEGORY_META[report.cat]?.label || report.cat,
      STATUS_META[report.status]?.label || report.status,
      report.priority || "-",
      report.team || "-",
      primaryAssignee(report, state.technicians)?.name || "-",
      formatDateTime(report.createdAt || report.date),
      formatDateTime(report.slaDueAt),
      formatDateTime(report.completedAt),
      slaState(report),
      reportDuration(report) ?? "-",
      monthLabel(report.completedAt || report.createdAt),
    ]),
  ];

  downloadCsv(`campuscare-laporan-sla-${stamp()}.csv`, rows);
  showToast(
    "Ekspor Laporan SLA Selesai",
    `${stats.total} tiket, ${stats.done} selesai, SLA ${stats.percent}% — CSV siap dibuka di Excel.`,
    "success"
  );
}

const TAB_EXPORT = {
  dashboard: "reports",
  dispatches: "dispatch",
  techs: "technicians",
  inventory: "assets",
  sla: "sla",
  damage: "damage",
};

/** Handler generik untuk tombol data-action="export". */
export function handleExport(element) {
  const kind = element?.dataset?.export || TAB_EXPORT[state.adminTab] || "reports";
  if (kind === "assets" || kind === "inventory") {
    exportAssets();
    return;
  }
  if (kind === "technicians") {
    exportTechnicians();
    return;
  }
  if (kind === "dispatch") {
    exportReports(filteredDispatchReports(), {
      scope: "antrean-disposisi",
      label: "tiket antrean",
      title: "Antrean Disposisi Penugasan",
      filterLabel:
        state.dispatchFilter === "all"
          ? "Semua antrean"
          : FILTER_LABEL[state.dispatchFilter] || state.dispatchFilter,
      query: state.dispatchQuery || "-",
    });
    return;
  }
  if (kind === "sla") {
    exportSla();
    return;
  }
  if (kind === "damage") {
    exportDamage();
    return;
  }
  exportReports(filteredAdminReports(), {
    scope: "rekap-tiket",
    label: "tiket",
    title: "Rekap Tiket Dashboard",
    filterLabel:
      state.adminFilter === "all"
        ? "Semua status"
        : FILTER_LABEL[state.adminFilter] || state.adminFilter,
    query: state.adminQuery || "-",
  });
}
