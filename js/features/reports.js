/* ==========================================================================
   features/reports.js — Hitung statistik, filter, dan render kartu tiket
   ========================================================================== */

import { $$, byId, escapeHtml } from "../core/dom.js";
import { state } from "../core/state.js";
import { CATEGORY_META, STATUS_META } from "../data/reports.js";

export function statusCounts() {
  const reports = state.reports;
  return {
    all: reports.length,
    urgent: reports.filter((report) => report.urgent).length,
    review: reports.filter((report) => report.status === "review").length,
    progress: reports.filter(
      (report) => report.status === "progress" || report.status === "waiting"
    ).length,
    done: reports.filter((report) => report.status === "done").length,
  };
}

/** Menyamakan angka pada badge statistik admin & mahasiswa. */
export function updateCounters() {
  const counts = statusCounts();

  $$("[data-admin-count]").forEach((element) => {
    const key = element.dataset.adminCount;
    if (key in counts) element.textContent = String(counts[key]);
  });
  $$("[data-student-count]").forEach((element) => {
    const key = element.dataset.studentCount;
    if (key in counts) element.textContent = String(counts[key]);
  });
}

export function matchesFilter(report, filter) {
  if (filter === "all") return true;
  if (filter === "urgent") return Boolean(report.urgent);
  if (filter === "review") return report.status === "review";
  if (filter === "progress") {
    return report.status === "progress" || report.status === "waiting";
  }
  if (filter === "done") return report.status === "done";
  return true;
}

export function matchesQuery(report, query) {
  if (!query) return true;
  const haystack = [
    report.id,
    report.title,
    report.location,
    report.reporter,
    report.team || "",
    CATEGORY_META[report.cat]?.label || "",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function emptyState(title) {
  return `
      <div class="cc-empty">
        <span class="material-symbols-outlined text-3xl text-gray-300">search_off</span>
        <p class="font-display text-sm font-bold text-gray-700">${escapeHtml(title)}</p>
        <p class="text-xs text-gray-500">Coba ubah kata kunci atau filter status pengaduan.</p>
      </div>`;
}

function reportActions(report, mode) {
  if (mode === "student") {
    return `
        <button type="button" class="h-11 px-5 rounded-full bg-inverse-surface text-white text-xs font-bold hover:bg-black transition-all flex items-center gap-1.5 shadow-sm" data-action="track-report" data-ticket="${escapeHtml(report.id)}">
          <span>Lacak Tiket</span>
          <span class="material-symbols-outlined text-base">arrow_forward</span>
        </button>
        <button type="button" class="h-11 px-4 rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-bold transition-all" data-action="open-detail" data-ticket="${escapeHtml(report.id)}">
          Detail
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
      <button type="button" class="h-11 px-5 rounded-full bg-inverse-surface text-white text-xs font-bold hover:bg-black transition-all flex items-center gap-1.5 shadow-sm" data-action="open-detail" data-ticket="${escapeHtml(report.id)}">
        <span>${report.status === "waiting" ? "Detail Tiket" : "Lihat Progres"}</span>
        <span class="material-symbols-outlined text-base font-bold">arrow_forward</span>
      </button>`;
}

function reportCard(report, mode) {
  const category = CATEGORY_META[report.cat] || CATEGORY_META.ac;
  const status = STATUS_META[report.status] || STATUS_META.review;

  const progressLabel =
    report.status === "progress" && report.progress ? ` (${report.progress}%)` : "";

  const teamLine = report.team
    ? `<span class="inline-flex items-center gap-1 font-semibold ${
        report.status === "done" ? "text-emerald-700" : "text-tertiary"
      }">
           <span class="material-symbols-outlined text-base">engineering</span>
           Teknisi: ${escapeHtml(report.team)}
         </span>`
    : `<span class="inline-flex items-center gap-1 font-semibold ${
        report.urgent ? "text-primary" : "text-secondary"
      }">
           <span class="material-symbols-outlined text-base">engineering</span>
           Status: Belum ada teknisi
         </span>`;

  return `
      <article class="ticket-card bg-surface-container-lowest rounded-2xl p-5 sm:p-6 shadow-[0_12px_32px_-4px_rgba(20,23,26,0.05),0_4px_12px_rgba(166,175,189,0.12)] hover:shadow-[0_16px_40px_-4px_rgba(20,23,26,0.08)] border border-[#e2e8f0] transition-all flex flex-col md:flex-row gap-5 justify-between items-start md:items-center" data-id="${escapeHtml(report.id)}" data-status="${escapeHtml(report.status)}">
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
              <span class="text-xs text-secondary">${escapeHtml(report.date)}</span>
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
        <div class="flex items-center gap-2 shrink-0 w-full md:w-auto justify-end">
          ${reportActions(report, mode)}
        </div>
      </article>`;
}

export function renderStudentReports() {
  const container = byId("student-report-list");
  if (!container) return;

  const filtered = state.reports.filter(
    (report) =>
      matchesFilter(report, state.studentFilter) && matchesQuery(report, state.studentQuery)
  );

  container.innerHTML = filtered.length
    ? filtered.map((report) => reportCard(report, "student")).join("")
    : emptyState("Tidak ada pengaduan yang cocok");

  updateCounters();
}

export function renderAdminTickets() {
  const container = byId("admin-ticket-list");
  if (!container) return;

  const filtered = state.reports.filter(
    (report) => matchesFilter(report, state.adminFilter) && matchesQuery(report, state.adminQuery)
  );

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

  const filtered = state.reports
    .filter((report) => report.status === "review")
    .sort((a, b) => Number(b.urgent) - Number(a.urgent));

  container.innerHTML = filtered.length
    ? filtered.map((report) => reportCard(report, "admin")).join("")
    : emptyState("Antrean disposisi sudah bersih");

  updateCounters();
}

export function renderReports() {
  renderStudentReports();
  renderAdminTickets();
  renderDispatchList();
  updateCounters();
}
