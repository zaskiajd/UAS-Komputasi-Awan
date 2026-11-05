/* ==========================================================================
   views/public.js — Render dashboard publik (user biasa)
   Hanya menampilkan data agregat; identitas pelapor tidak pernah dirender.
   ========================================================================== */

import { byId, escapeHtml } from "../core/dom.js";
import { state } from "../core/state.js";
import { CATEGORY_META, STATUS_META } from "../data/reports.js";

function publicCounts() {
  const reports = state.reports;
  return {
    all: reports.length,
    review: reports.filter((report) => report.status === "review").length,
    progress: reports.filter(
      (report) => report.status === "progress" || report.status === "waiting"
    ).length,
    done: reports.filter((report) => report.status === "done").length,
  };
}

function renderStatusBar(counts) {
  const bar = byId("public-status-bar");
  const caption = byId("public-status-caption");
  if (!bar) return;

  if (!counts.all) {
    bar.innerHTML = "";
    if (caption) caption.textContent = "Belum ada data";
    return;
  }

  const segments = [
    { key: "review", color: "#ff661f", label: "verifikasi" },
    { key: "progress", color: "#0053db", label: "diproses" },
    { key: "done", color: "#10b981", label: "selesai" },
  ];

  bar.innerHTML = segments
    .filter((segment) => counts[segment.key] > 0)
    .map(
      (segment) =>
        `<span style="width:${(counts[segment.key] / counts.all) * 100}%;background:${segment.color}" title="${counts[segment.key]} ${segment.label}"></span>`
    )
    .join("");

  if (caption) {
    const percent = Math.round((counts.done / counts.all) * 100);
    caption.textContent = `${percent}% selesai`;
  }
}

function renderRecent() {
  const list = byId("public-recent-list");
  if (!list) return;

  const recent = state.reports.slice(0, 4);

  if (!recent.length) {
    list.innerHTML = `
      <div class="cc-empty">
        <span class="material-symbols-outlined text-3xl text-gray-300">inbox</span>
        <p class="font-display text-sm font-bold text-gray-700">Belum ada aduan</p>
        <p class="text-xs text-gray-500">Pengaduan mahasiswa akan tampil di sini setelah dikirim.</p>
      </div>`;
    return;
  }

  list.innerHTML = recent
    .map((report) => {
      const category = CATEGORY_META[report.cat] || CATEGORY_META.ac;
      const status = STATUS_META[report.status] || STATUS_META.review;
      return `
        <article class="public-ticket">
          <span class="w-11 h-11 rounded-full ${category.badge} flex items-center justify-center shrink-0">
            <span class="material-symbols-outlined text-xl">${category.icon}</span>
          </span>
          <div class="flex-1 min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-surface-container text-secondary font-semibold">${escapeHtml(category.label)}</span>
              <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full ${status.chip} text-[10px] font-bold">
                <span class="w-1.5 h-1.5 rounded-full ${status.dot}"></span>
                ${escapeHtml(status.label)}
              </span>
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
}

function renderCategories() {
  const list = byId("public-category-list");
  const caption = byId("public-category-caption");
  if (!list) return;

  const totals = {};
  state.reports.forEach((report) => {
    totals[report.cat] = (totals[report.cat] || 0) + 1;
  });

  const entries = Object.entries(totals)
    .map(([key, count]) => ({
      key,
      count,
      meta: CATEGORY_META[key] || CATEGORY_META.ac,
    }))
    .sort((a, b) => b.count - a.count || a.meta.label.localeCompare(b.meta.label));

  if (caption) caption.textContent = `${entries.length} kategori`;

  if (!entries.length) {
    list.innerHTML = `
      <div class="cc-empty sm:col-span-2">
        <span class="material-symbols-outlined text-3xl text-gray-300">category</span>
        <p class="font-display text-sm font-bold text-gray-700">Belum ada kategori</p>
        <p class="text-xs text-gray-500">Data kategori muncul setelah pengaduan pertama dibuat.</p>
      </div>`;
    return;
  }

  const max = Math.max(...entries.map((entry) => entry.count));

  list.innerHTML = entries
    .map((entry) => {
      const percent = Math.max(8, Math.round((entry.count / max) * 100));
      return `
        <div class="public-cat-row">
          <div class="flex items-center justify-between gap-3">
            <span class="flex items-center gap-2 min-w-0">
              <span class="w-8 h-8 rounded-full ${entry.meta.badge} flex items-center justify-center shrink-0">
                <span class="material-symbols-outlined text-base">${entry.meta.icon}</span>
              </span>
              <span class="text-xs font-semibold text-on-surface truncate">${escapeHtml(entry.meta.label)}</span>
            </span>
            <span class="text-xs font-bold text-on-surface shrink-0">${entry.count}</span>
          </div>
          <div class="public-cat-track mt-2">
            <div class="public-cat-fill" style="width:${percent}%"></div>
          </div>
        </div>`;
    })
    .join("");
}

export function renderPublicView() {
  const counts = publicCounts();

  document.querySelectorAll("[data-public-count]").forEach((element) => {
    const key = element.dataset.publicCount;
    if (key in counts) element.textContent = String(counts[key]);
  });

  renderStatusBar(counts);
  renderRecent();
  renderCategories();
}
