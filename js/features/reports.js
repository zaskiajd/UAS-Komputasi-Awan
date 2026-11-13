/* ==========================================================================
   features/reports.js — Hitung statistik, filter, dan render kartu tiket
   Admin memakai seluruh data; mahasiswa hanya melihat tiket miliknya
   (dipilih lewat field owner = NIM pemilik).
   ========================================================================== */

import { $$, byId, escapeHtml, relativeTime } from "../core/dom.js";
import { activeStudent, state } from "../core/state.js";
import {
  assignmentRoster,
  primaryAssignee,
  supportAssignments,
} from "../data/assignments.js";
import { CATEGORY_META, PRIORITY_META, STATUS_META } from "../data/reports.js";
import { closeModal, openModal } from "../ui/modal.js";
import { showToast } from "../ui/toast.js";
import { renderAnalytics } from "./analytics.js";
import { deleteTicketRequest } from "./tickets-api.js";

export function statusCounts(reports = state.reports) {
  return {
    all: reports.length,
    urgent: reports.filter((report) => report.urgent && report.status !== "done").length,
    review: reports.filter((report) => report.status === "review").length,
    progress: reports.filter(
      (report) => report.status === "progress" || report.status === "waiting"
    ).length,
    waiting: reports.filter((report) => report.status === "waiting").length,
    done: reports.filter((report) => report.status === "done").length,
  };
}

/** Tiket yang dimiliki mahasiswa aktif saat ini. */
export function studentReports() {
  const { nim } = activeStudent();
  return state.reports.filter((report) => report.owner === nim);
}

/** Menyamakan angka pada badge statistik admin & mahasiswa. */
export function updateCounters() {
  const adminCounts = statusCounts();
  const studentCounts = statusCounts(studentReports());

  $$("[data-admin-count]").forEach((element) => {
    const key = element.dataset.adminCount;
    if (key in adminCounts) element.textContent = String(adminCounts[key]);
  });
  $$("[data-student-count]").forEach((element) => {
    const key = element.dataset.studentCount;
    if (key in studentCounts) element.textContent = String(studentCounts[key]);
  });
}

export function matchesFilter(report, filter) {
  if (filter === "all") return true;
  if (filter === "urgent") return Boolean(report.urgent) && report.status !== "done";
  if (filter === "review") return report.status === "review";
  if (filter === "progress") {
    return report.status === "progress" || report.status === "waiting";
  }
  if (filter === "done") return report.status === "done";
  return true;
}

export function matchesQuery(report, query) {
  if (!query) return true;
  const assignee = primaryAssignee(report, state.technicians);
  const rosterNames = assignmentRoster(report, state.technicians).map(
    (entry) => entry.technician.name
  );
  const haystack = [
    report.id,
    report.title,
    report.location,
    report.reporter,
    report.team || "",
    assignee?.name || "",
    ...rosterNames,
    report.priority || "",
    CATEGORY_META[report.cat]?.label || "",
    ...(report.notes || []).map((note) => note.text),
    ...(report.instructions || []).map((instruction) => instruction.text),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

/** Tiket admin yang sedang tampil (mengikuti filter status & pencarian). */
export function filteredAdminReports() {
  return state.reports.filter(
    (report) =>
      matchesFilter(report, state.adminFilter) &&
      matchesQuery(report, state.adminQuery)
  );
}

/** Antrean disposisi yang sedang tampil (mengikuti filter & pencarian). */
export function filteredDispatchReports() {
  return state.reports
    .filter((report) => report.status === "review")
    .filter((report) => {
      if (state.dispatchFilter === "urgent") return report.urgent;
      if (state.dispatchFilter === "normal") return !report.urgent;
      return true;
    })
    .filter((report) => matchesQuery(report, state.dispatchQuery))
    .sort(
      (a, b) =>
        Number(b.urgent) - Number(a.urgent) ||
        new Date(a.createdAt || 0) - new Date(b.createdAt || 0)
    );
}

function emptyState(title) {
  return `
      <div class="cc-empty">
        <span class="material-symbols-outlined text-3xl text-gray-300">search_off</span>
        <p class="font-display text-sm font-bold text-gray-700">${escapeHtml(title)}</p>
        <p class="text-xs text-gray-500">Coba ubah kata kunci atau filter status pengaduan.</p>
      </div>`;
}

function isOverdue(report) {
  return Boolean(
    report.status !== "done" &&
      report.slaDueAt &&
      new Date(report.slaDueAt).getTime() < Date.now()
  );
}

function reportActions(report, mode) {
  if (mode === "student") {
    if (state.historyDeleteMode) {
      const selected = state.historySelection.has(report.id);
      return `
        <button type="button" class="h-10 px-4 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
          selected
            ? "bg-primary-container text-white shadow-[0_8px_20px_-8px_rgba(255,102,31,0.8)]"
            : "bg-surface-container text-on-surface hover:bg-surface-container-high"
        }" data-action="toggle-history-select" data-ticket="${escapeHtml(report.id)}" aria-pressed="${selected}">
          <span class="material-symbols-outlined text-base">${selected ? "check_circle" : "radio_button_unchecked"}</span>
          ${selected ? "Dipilih" : "Pilih"}
        </button>`;
    }

    return `
        <button type="button" class="h-10 px-4 rounded-full bg-surface-container text-on-surface text-xs font-bold hover:bg-surface-container-high transition-colors" data-action="track-report" data-ticket="${escapeHtml(report.id)}">
          Lihat detail
        </button>`;
  }

  if (report.status === "review") {
    return `
        <button type="button" class="h-11 px-5 rounded-full bg-primary-container text-white text-xs font-bold hover:brightness-110 shadow-sm transition-all flex items-center gap-1.5" data-action="quick-assign" data-ticket="${escapeHtml(report.id)}">
          <span>Disposisi Sekarang</span>
          <span class="material-symbols-outlined text-base font-bold">arrow_forward</span>
        </button>`;
  }

  if (report.status === "done") {
    return `
        <button type="button" class="h-11 px-5 rounded-full bg-surface-container-high hover:bg-surface-variant text-on-surface text-xs font-bold transition-all flex items-center gap-1" data-action="open-detail" data-ticket="${escapeHtml(report.id)}">
          <span>Review Hasil</span>
          <span class="material-symbols-outlined text-base">verified</span>
        </button>`;
  }

  return `
      <button type="button" class="h-11 px-5 rounded-full bg-inverse-surface text-white text-xs font-bold hover:brightness-110 transition-all flex items-center gap-1.5 shadow-sm" data-action="open-detail" data-ticket="${escapeHtml(report.id)}">
        <span>${report.status === "waiting" ? "Detail Tiket" : "Kelola Tiket"}</span>
        <span class="material-symbols-outlined text-base font-bold">arrow_forward</span>
      </button>`;
}

function reportCard(report, mode) {
  const category = CATEGORY_META[report.cat] || CATEGORY_META.ac;
  const status = STATUS_META[report.status] || STATUS_META.review;
  const priority = PRIORITY_META[report.priority] || PRIORITY_META.Sedang;
  const assignee = primaryAssignee(report, state.technicians);
  const supports = supportAssignments(report, state.technicians);
  const overdue = isOverdue(report);

  const progressLabel =
    report.status === "progress" && report.progress ? ` (${report.progress}%)` : "";

  const teamLine = report.team
    ? `<span class="inline-flex items-center gap-1 font-semibold ${
        report.status === "done" ? "text-emerald-700" : overdue ? "text-error" : "text-tertiary"
      }">
           <span class="material-symbols-outlined text-base">engineering</span>
           ${escapeHtml(report.team)}${assignee ? ` • ${escapeHtml(assignee.name)}` : ""}${supports.length ? ` +${supports.length}` : ""}
         </span>`
    : `<span class="inline-flex items-center gap-1 font-semibold ${
        report.urgent ? "text-primary" : "text-secondary"
      }">
           <span class="material-symbols-outlined text-base">engineering</span>
           Status: Belum ada teknisi
         </span>`;

  const actions = reportActions(report, mode);
  const selected =
    mode === "student" &&
    state.historyDeleteMode &&
    state.historySelection.has(report.id);

  return `
      <article class="ticket-card bg-surface-container-lowest rounded-2xl p-5 sm:p-6 shadow-[0_12px_32px_-4px_rgba(20,23,26,0.05),0_4px_12px_rgba(166,175,189,0.12)] hover:shadow-[0_16px_40px_-4px_rgba(20,23,26,0.08)] border transition-all flex flex-col md:flex-row gap-5 justify-between items-start md:items-center ${
        selected
          ? "border-primary-container ring-2 ring-primary-container/25 bg-primary-fixed/10"
          : "border-[#e2e8f0]"
      }" data-id="${escapeHtml(report.id)}" data-status="${escapeHtml(report.status)}"${
        mode === "student" && state.historyDeleteMode ? ` aria-selected="${selected}"` : ""
      }>
        <div class="flex items-start gap-4 flex-1 min-w-0">
          <div class="w-12 h-12 rounded-full ${category.badge} flex items-center justify-center shrink-0">
            <span class="material-symbols-outlined text-2xl">${category.icon}</span>
          </div>
          <div class="flex flex-col gap-1.5 min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-xs uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-surface-container text-secondary font-semibold">${escapeHtml(report.id)}</span>
              <span class="inline-flex items-center gap-1 px-3 py-0.5 rounded-full ${status.chip} text-xs font-bold">
                <span class="w-1.5 h-1.5 rounded-full ${status.dot}${status.pulse ? " animate-ping" : ""}"></span>
                ${status.label}${progressLabel}
              </span>
              ${
                report.urgent
                  ? `<span class="px-2 py-0.5 rounded-full bg-error-container text-on-error-container text-[11px] font-bold">Urgent</span>`
                  : ""
              }
              ${
                mode === "admin"
                  ? `<span class="px-2 py-0.5 rounded-full ${priority.chip} text-[11px] font-bold">${escapeHtml(report.priority || "Sedang")}</span>`
                  : ""
              }
              ${
                overdue
                  ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[11px] font-bold"><span class="material-symbols-outlined text-xs">schedule</span>Lewat SLA</span>`
                  : ""
              }
              <span class="text-xs text-secondary">${escapeHtml(report.date)}</span>
              ${
                mode === "admin" && report.updatedAt
                  ? `<span class="text-[11px] text-secondary/70">Diperbarui ${escapeHtml(relativeTime(report.updatedAt))}</span>`
                  : ""
              }
            </div>
            <h3 class="text-base md:text-lg font-bold text-on-surface font-display leading-snug">${escapeHtml(report.title)}</h3>
            <div class="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-secondary">
              <span class="inline-flex items-center gap-1">
                <span class="material-symbols-outlined text-base text-secondary">person</span>
                ${escapeHtml(report.reporter)}
              </span>
              <span class="inline-flex items-center gap-1">
                <span class="material-symbols-outlined text-base text-secondary">location_on</span>
                ${escapeHtml(report.location)}
              </span>
              ${teamLine}
            </div>
          </div>
        </div>
        ${
          actions
            ? `<div class="flex items-center gap-2 shrink-0 w-full md:w-auto justify-end">${actions}</div>`
            : ""
        }
      </article>`;
}

/** Menyamakan tampilan bilah pilihan dengan state hapus riwayat. */
function syncHistoryToolbar(visibleReports = []) {
  const trigger = byId("btn-delete-history");
  if (trigger) {
    trigger.setAttribute("aria-pressed", String(state.historyDeleteMode));
    trigger.classList.toggle("is-active", state.historyDeleteMode);
  }

  const toolbar = byId("student-history-toolbar");
  if (!toolbar) return;

  const selectedCount = state.historySelection.size;
  const countLabel = byId("student-history-selected-count");
  const confirmButton = byId("btn-confirm-delete-history");

  toolbar.hidden = !state.historyDeleteMode;
  if (!state.historyDeleteMode) {
    // Reset label & tombol agar tidak menyisakan status pilihan lama saat toolbar disembunyikan.
    if (countLabel) countLabel.textContent = "0 riwayat dipilih";
    if (confirmButton) confirmButton.disabled = true;
    return;
  }

  if (countLabel) {
    countLabel.textContent = `${selectedCount} riwayat dipilih`;
  }

  const allSelected =
    visibleReports.length > 0 &&
    visibleReports.every((report) => state.historySelection.has(report.id));
  const selectAllButton = byId("btn-select-all-history");
  if (selectAllButton) {
    selectAllButton.textContent = allSelected ? "Kosongkan pilihan" : "Pilih semua";
    selectAllButton.setAttribute("aria-pressed", String(allSelected));
  }

  if (confirmButton) confirmButton.disabled = selectedCount === 0;
}

/** Daftar tiket mahasiswa yang lolos filter & pencarian saat ini. */
function visibleStudentReports() {
  return studentReports().filter(
    (report) =>
      matchesFilter(report, state.studentFilter) && matchesQuery(report, state.studentQuery)
  );
}

export function renderStudentReports() {
  const container = byId("student-report-list");
  if (!container) return;

  const filtered = visibleStudentReports();

  container.innerHTML = filtered.length
    ? filtered.map((report) => reportCard(report, "student")).join("")
    : emptyState(
        state.historyDeleteMode ? "Tidak ada riwayat untuk dipilih" : "Tidak ada pengaduan yang cocok"
      );

  syncHistoryToolbar(filtered);
  updateCounters();
}

/* --------------------------------------------------------------------------
   Hapus riwayat pengaduan mahasiswa (pilih beberapa lalu hapus sekaligus)
   -------------------------------------------------------------------------- */

export function toggleHistoryDeleteMode() {
  state.historyDeleteMode = !state.historyDeleteMode;
  state.historySelection.clear();
  renderStudentReports();
}

export function toggleHistorySelection(ticketId) {
  if (!state.historyDeleteMode || !ticketId) return;
  if (state.historySelection.has(ticketId)) {
    state.historySelection.delete(ticketId);
  } else {
    state.historySelection.add(ticketId);
  }
  renderStudentReports();
}

export function toggleSelectAllHistory() {
  if (!state.historyDeleteMode) return;

  const visible = visibleStudentReports();
  const allSelected =
    visible.length > 0 && visible.every((report) => state.historySelection.has(report.id));

  visible.forEach((report) => {
    if (allSelected) state.historySelection.delete(report.id);
    else state.historySelection.add(report.id);
  });

  renderStudentReports();
}

export function cancelHistoryDelete() {
  state.historyDeleteMode = false;
  state.historySelection.clear();
  renderStudentReports();
}

export function openHistoryDeleteConfirm() {
  const selected = studentReports().filter((report) =>
    state.historySelection.has(report.id)
  );

  if (!selected.length) {
    showToast("Belum ada riwayat dipilih", "Pilih minimal satu riwayat terlebih dahulu.", "error");
    return;
  }

  const modal = byId("modal-delete-history");
  if (!modal) return;

  const countLabel = byId("delete-history-count");
  if (countLabel) {
    countLabel.textContent = `${selected.length} riwayat pengaduan`;
  }

  const preview = byId("delete-history-preview");
  if (preview) {
    preview.innerHTML = selected
      .map(
        (report) => `
          <li class="flex items-start gap-2.5 rounded-xl bg-white px-3 py-2 border border-gray-200">
            <span class="material-symbols-outlined text-base text-red-600 mt-0.5">receipt_long</span>
            <span class="min-w-0">
              <span class="block truncate text-[11px] font-bold text-gray-900">${escapeHtml(report.title)}</span>
              <span class="block text-[10px] text-gray-500 mt-0.5">${escapeHtml(report.id)} · ${escapeHtml(report.date)}</span>
            </span>
          </li>`
      )
      .join("");
  }

  openModal(modal);
}

export async function executeHistoryDelete() {
  if (!state.historySelection.size) return;

  const selected = state.reports.filter((report) => state.historySelection.has(report.id));
  const removed = new Set();
  const failures = [];

  for (const report of selected) {
    try {
      await deleteTicketRequest(report);
      removed.add(report.id);
    } catch (error) {
      failures.push(`${report.id}: ${error.message}`);
    }
  }

  state.reports = state.reports.filter((report) => !removed.has(report.id));
  state.historySelection.clear();
  state.historyDeleteMode = false;

  closeModal(byId("modal-delete-history"));

  const detail = byId("student-detail-card");
  if (detail && removed.has(detail.dataset.ticket)) {
    detail.hidden = true;
    detail.innerHTML = "";
    delete detail.dataset.ticket;
    state.selectedTicket = null;
  }

  renderReports();
  if (removed.size) {
    showToast(
      "Riwayat dihapus",
      `${removed.size} pengaduan berhasil dihapus dari riwayat Anda.`,
      "success"
    );
  }
  if (failures.length) {
    showToast("Sebagian Tidak Dapat Dihapus", failures[0], "error");
  }
}

/** Kartu ringkas pada panel Ringkasan (maksimal 3 tiket terbaru milik mahasiswa). */
export function renderStudentSummary() {
  const container = byId("student-recent-list");
  if (!container) return;

  const recent = studentReports().slice(0, 3);

  if (!recent.length) {
    container.innerHTML = `
      <div class="cc-empty flex-1">
        <span class="material-symbols-outlined text-3xl text-gray-300">receipt_long</span>
        <p class="font-display text-sm font-bold text-gray-700">Belum ada pengaduan</p>
        <p class="text-xs text-gray-500">Kirim laporan pertama Anda untuk mulai dipantau tim Sarpras.</p>
        <button type="button" class="mt-3 h-10 px-5 rounded-full bg-primary-container text-white text-xs font-bold hover:brightness-110 transition-all" data-action="open-complaint">
          Buat Pengaduan
        </button>
      </div>`;
    updateCounters();
    return;
  }

  container.innerHTML = recent
    .map((report) => {
      const category = CATEGORY_META[report.cat] || CATEGORY_META.ac;
      const status = STATUS_META[report.status] || STATUS_META.review;
      return `
        <article class="flex items-center gap-4 p-4 rounded-2xl bg-surface-container-low border border-surface-container-high hover:bg-surface-container transition-colors">
          <span class="w-11 h-11 rounded-full ${category.badge} flex items-center justify-center shrink-0">
            <span class="material-symbols-outlined text-xl">${category.icon}</span>
          </span>
          <div class="flex-1 min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-surface-container-lowest text-secondary font-semibold">${escapeHtml(report.id)}</span>
              <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full ${status.chip} text-[10px] font-bold">
                <span class="w-1.5 h-1.5 rounded-full ${status.dot}"></span>
                ${escapeHtml(status.label)}
              </span>
              ${
                report.urgent
                  ? `<span class="px-2 py-0.5 rounded-full bg-error-container text-on-error-container text-[10px] font-bold">Urgent</span>`
                  : ""
              }
            </div>
            <p class="text-sm font-bold text-on-surface font-display leading-snug mt-1 truncate">${escapeHtml(report.title)}</p>
            <p class="text-[11px] text-secondary mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span class="inline-flex items-center gap-1"><span class="material-symbols-outlined text-sm">location_on</span>${escapeHtml(report.location)}</span>
              <span class="text-secondary/60">•</span>
              <span>${escapeHtml(report.date)}</span>
            </p>
          </div>
        </article>`;
    })
    .join("");

  updateCounters();
}

export function renderAdminTickets() {
  const container = byId("admin-ticket-list");
  if (!container) return;

  const filtered = filteredAdminReports();

  container.innerHTML = filtered.length
    ? filtered.map((report) => reportCard(report, "admin")).join("")
    : emptyState("Tidak ada tiket pada filter ini");

  const countBadge = byId("visible-count");
  if (countBadge) countBadge.textContent = String(filtered.length);

  updateCounters();
}

export function renderDispatchList() {
  const container = byId("admin-dispatch-list");
  if (!container) return;

  const filtered = filteredDispatchReports();

  container.innerHTML = filtered.length
    ? filtered.map((report) => reportCard(report, "admin")).join("")
    : emptyState(
        state.dispatchQuery || state.dispatchFilter !== "all"
          ? "Tidak ada tiket yang cocok"
          : "Antrean disposisi sudah bersih"
      );

  const countBadge = byId("dispatch-visible");
  if (countBadge) countBadge.textContent = String(filtered.length);

  updateCounters();
}

export function renderReports() {
  renderStudentReports();
  renderStudentSummary();
  renderAdminTickets();
  renderDispatchList();
  updateCounters();
  renderAnalytics();
}
