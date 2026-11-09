/* ==========================================================================
   features/analytics.js — Perhitungan & render analitik admin
   Semua angka KPI, SLA, beban kerja, audit log, dan tren dihitung dari state
   agar tidak ada lagi angka statis yang tidak sinkron dengan tiket.
   ========================================================================== */

import { $$, byId, escapeHtml, formatDateTime, relativeTime } from "../core/dom.js";
import { state } from "../core/state.js";
import { ticketInvolves } from "../data/assignments.js";
import { CATEGORY_META, PRIORITY_META, STATUS_META } from "../data/reports.js";
import { TEAMS, TEAM_BY_ID } from "../data/technicians.js";
import { assetCondition } from "../data/assets.js";

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const ACTIVE_STATUS = new Set(["progress", "waiting"]);

const timeOf = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));

export const activeReports = (reports = state.reports) =>
  reports.filter((report) => ACTIVE_STATUS.has(report.status));

export function slaStats(reports = state.reports) {
  const now = Date.now();
  const done = reports.filter((report) => report.status === "done");
  const active = reports.filter((report) => report.status !== "done");

  const lateDone = done.filter(
    (report) =>
      report.completedAt &&
      report.slaDueAt &&
      timeOf(report.completedAt) > timeOf(report.slaDueAt)
  );
  const overdue = active.filter(
    (report) => report.slaDueAt && timeOf(report.slaDueAt) < now
  );
  const dueSoon = active.filter((report) => {
    if (!report.slaDueAt) return false;
    const remaining = timeOf(report.slaDueAt) - now;
    return remaining >= 0 && remaining <= 60 * 60 * 1000;
  });

  const tracked = reports.length;
  // SLA dihitung dari tiket yang sudah selesai: tepat waktu vs terlambat.
  // Tiket aktif tidak lagi dihitung sebagai "tercapai" agar persentase
  // benar-benar berubah ketika pekerjaan diselesaikan.
  const onTime = Math.max(0, done.length - lateDone.length);
  const percent = done.length ? Math.round((onTime / done.length) * 1000) / 10 : 100;

  const durations = done
    .filter((report) => report.createdAt && report.completedAt)
    .map((report) => (timeOf(report.completedAt) - timeOf(report.createdAt)) / 3600000)
    .filter((hours) => hours >= 0);
  const avgHours = durations.length
    ? Math.round((durations.reduce((sum, hours) => sum + hours, 0) / durations.length) * 10) / 10
    : 0;

  return {
    total: tracked,
    done: done.length,
    active: active.length,
    lateDone: lateDone.length,
    overdue: overdue.length,
    dueSoon: dueSoon.length,
    onTime,
    withinSla: onTime,
    percent,
    avgHours,
    backlog: active.length,
    urgentBacklog: active.filter((report) => report.urgent).length,
  };
}

export function teamWorkload() {
  return TEAMS.map((team) => {
    const members = state.technicians.filter(
      (technician) => technician.teamId === team.id && !technician.archived
    );
    const activeMembers = members.filter((technician) => technician.active);
    const tickets = state.reports.filter(
      (report) => report.teamId === team.id && ACTIVE_STATUS.has(report.status)
    );
    const doneTickets = state.reports.filter(
      (report) => report.teamId === team.id && report.status === "done"
    );
    const capacity = members.length
      ? Math.round((activeMembers.length / members.length) * 100)
      : 0;
    return {
      ...team,
      members,
      activeMembers,
      tickets,
      doneTickets,
      capacity,
    };
  });
}

/** Beban tiket aktif & riwayat selesai per personil (PIC maupun pendukung). */
export function technicianWorkload() {
  return state.technicians
    .filter((technician) => !technician.archived)
    .map((technician) => {
      const team = TEAM_BY_ID[technician.teamId];
      const tickets = state.reports.filter((report) =>
        ticketInvolves(report, technician.id)
      );
      const active = tickets.filter((report) => report.status !== "done");
      const done = tickets.filter((report) => report.status === "done");
      return {
        ...technician,
        team,
        active: active.length,
        done: done.length,
        total: tickets.length,
      };
    });
}

export function readinessStats() {
  const assets = state.assets;
  const scored = assets.map((asset) => ({
    ...asset,
    weight: assetCondition(asset.condition).weight,
  }));
  const score = scored.length
    ? Math.round((scored.reduce((sum, asset) => sum + asset.weight, 0) / scored.length) * 1000) / 10
    : 100;

  const zones = Array.from(new Set(scored.map((asset) => asset.zone))).map((zone) => {
    const list = scored.filter((asset) => asset.zone === zone);
    const zoneScore = list.length
      ? Math.round((list.reduce((sum, asset) => sum + asset.weight, 0) / list.length) * 1000) / 10
      : 100;
    return { zone, score: zoneScore, total: list.length };
  });

  return {
    score,
    total: assets.length,
    good: assets.filter((asset) => asset.condition === "good").length,
    attention: assets.filter((asset) => asset.condition !== "good").length,
    zones: zones.sort((a, b) => b.score - a.score),
  };
}

export function auditEntries(limit = 4, reports = state.reports) {
  return reports
    .flatMap((report) =>
      (report.history || []).map((entry) => ({
        ...entry,
        ticketId: report.id,
        title: report.title,
        status: entry.status || report.status,
      }))
    )
    .sort((a, b) => timeOf(b.at) - timeOf(a.at))
    .slice(0, limit);
}

export function categoryBreakdown(reports = state.reports) {
  const totals = {};
  reports.forEach((report) => {
    totals[report.cat] = (totals[report.cat] || 0) + 1;
  });

  return Object.entries(totals)
    .map(([key, total]) => {
      const list = reports.filter((report) => report.cat === key);
      const done = list.filter((report) => report.status === "done").length;
      return {
        key,
        meta: CATEGORY_META[key] || CATEGORY_META.ac,
        total,
        done,
        active: total - done,
        percent: total ? Math.round((done / total) * 100) : 0,
      };
    })
    .sort((a, b) => b.total - a.total || a.meta.label.localeCompare(b.meta.label));
}

export function monthlyTrend(months = 6, reports = state.reports) {
  const now = new Date();
  const buckets = [];

  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    buckets.push({
      key: `${date.getFullYear()}-${date.getMonth()}`,
      label: MONTHS_SHORT[date.getMonth()],
      fullLabel: `${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`,
      count: 0,
    });
  }

  const index = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  reports.forEach((report) => {
    if (report.status !== "done" || !report.completedAt) return;
    const date = new Date(report.completedAt);
    if (Number.isNaN(date.getTime())) return;
    const bucket = index.get(`${date.getFullYear()}-${date.getMonth()}`);
    if (bucket) bucket.count += 1;
  });

  const max = Math.max(1, ...buckets.map((bucket) => bucket.count));
  return buckets.map((bucket, position) => ({
    ...bucket,
    height: bucket.count ? Math.max(8, Math.round((bucket.count / max) * 100)) : 0,
    current: position === buckets.length - 1,
  }));
}

export function dispatchSummary(reports = state.reports) {
  const now = Date.now();
  const queue = reports.filter((report) => report.status === "review");
  const urgent = queue.filter((report) => report.urgent);
  const ages = queue.map((report) => Math.max(0, now - timeOf(report.createdAt)) / 60000);
  const oldest = ages.length ? Math.round(Math.max(...ages)) : 0;
  const safe = queue.filter(
    (report) => now - timeOf(report.createdAt) <= 20 * 60000
  );
  const safePercent = queue.length ? Math.round((safe.length / queue.length) * 100) : 100;
  return { queue: queue.length, urgent: urgent.length, oldest, safe: safe.length, safePercent };
}

/* --------------------------------------------------------------------------
   Render
   -------------------------------------------------------------------------- */

function setText(selector, value) {
  $$(selector).forEach((element) => {
    element.textContent = String(value);
  });
}

function setWidth(selector, value) {
  $$(selector).forEach((element) => {
    element.style.width = `${clamp(value)}%`;
  });
}

function priorityColor(score) {
  if (score >= 90) return "bg-emerald-500";
  if (score >= 75) return "bg-primary-container";
  if (score >= 60) return "bg-amber-500";
  return "bg-red-500";
}

function statusIcon(status) {
  if (status === "done") return { icon: "check", color: "bg-emerald-500" };
  if (status === "waiting") return { icon: "schedule", color: "bg-amber-500" };
  if (status === "progress") return { icon: "engineering", color: "bg-tertiary" };
  return { icon: "assignment", color: "bg-primary-container" };
}

function renderKpis() {
  const reports = state.reports;
  const review = reports.filter((report) => report.status === "review").length;
  const progress = reports.filter((report) => report.status === "progress").length;
  const waiting = reports.filter((report) => report.status === "waiting").length;
  const done = reports.filter((report) => report.status === "done").length;
  const urgent = reports.filter((report) => report.urgent && report.status !== "done").length;
  const total = reports.length;
  const today = new Date().toDateString();
  const todayCount = reports.filter(
    (report) => report.createdAt && new Date(report.createdAt).toDateString() === today
  ).length;
  const sla = slaStats(reports);
  const activeTechs = state.technicians.filter(
    (technician) => technician.active && !technician.archived
  ).length;

  const values = { total, review, progress: progress + waiting, done, urgent, waiting };
  $$("[data-admin-kpi]").forEach((element) => {
    const key = element.dataset.adminKpi;
    if (key in values) element.textContent = String(values[key]);
  });

  const subtitles = {
    total: `${todayCount} laporan hari ini • ${total} total terpantau`,
    review: `${urgent} urgent • antrean disposisi ${review} tiket`,
    progress: `${activeTechs} teknisi aktif • ${waiting} menunggu suku cadang`,
    done: `${sla.percent}% SLA tercapai • rata-rata ${sla.avgHours} jam`,
  };
  Object.entries(subtitles).forEach(([key, value]) => {
    setText(`[data-admin-kpi-sub="${key}"]`, value);
  });

  setWidth("[data-admin-kpi-bar='total']", total ? (done / total) * 100 : 0);
  setWidth("[data-admin-kpi-bar='review']", total ? (review / total) * 100 : 0);
  setWidth("[data-admin-kpi-bar='progress']", total ? ((progress + waiting) / total) * 100 : 0);
  setWidth("[data-admin-kpi-bar='done']", total ? (done / total) * 100 : 0);

  // Semicircle KPI mengikuti proporsi status terhadap total tiket.
  const arcValues = {
    review: total ? (review / total) * 100 : 0,
    progress: total ? ((progress + waiting) / total) * 100 : 0,
    done: total ? (done / total) * 100 : 0,
  };
  $$("[data-admin-kpi-arc]").forEach((element) => {
    const key = element.dataset.adminKpiArc;
    const percent = Math.max(0, Math.min(100, arcValues[key] ?? 0));
    element.style.strokeDasharray = `${percent} 100`;
  });
}

function renderReadiness() {
  const readiness = readinessStats();
  const grade =
    readiness.score >= 90
      ? "A+ Unggul"
      : readiness.score >= 80
        ? "A Baik"
        : readiness.score >= 70
          ? "B Cukup"
          : "C Perlu Perhatian";

  setText("[data-readiness-score]", `${readiness.score}%`);
  setText("[data-readiness-grade]", grade);
  setText(
    "[data-readiness-caption]",
    `${readiness.good}/${readiness.total} aset kritis dalam kondisi baik`
  );
  setText(
    "[data-readiness-attention]",
    `${readiness.attention} aset perlu perhatian`
  );

  $$("[data-readiness-arc]").forEach((element) => {
    element.style.strokeDasharray = `${readiness.score} 100`;
  });

  // Marker mengikuti ujung busur skor kesiapan (setengah lingkaran 180°).
  $$("[data-readiness-marker]").forEach((element) => {
    const score = Math.max(0, Math.min(100, readiness.score));
    const angle = Math.PI * (1 + score / 100);
    element.setAttribute("cx", (55 + 45 * Math.cos(angle)).toFixed(2));
    element.setAttribute("cy", (55 + 45 * Math.sin(angle)).toFixed(2));
  });

  const list = byId("readiness-zone-list");
  if (list) {
    list.innerHTML = readiness.zones
      .map(
        (zone) => `
        <div>
          <div class="flex items-center justify-between text-xs mb-1">
            <span class="text-on-surface font-medium">${escapeHtml(zone.zone)}</span>
            <span class="font-bold ${zone.score >= 80 ? "text-emerald-700" : zone.score >= 65 ? "text-primary" : "text-amber-700"}">${zone.score}%</span>
          </div>
          <div class="w-full bg-surface-container h-2 rounded-full overflow-hidden">
            <div class="h-full rounded-full ${priorityColor(zone.score)}" style="width:${clamp(zone.score)}%"></div>
          </div>
        </div>`
      )
      .join("");
  }
}

function renderWorkload() {
  const teams = teamWorkload();
  const list = byId("team-workload-list");
  if (list) {
    list.innerHTML = teams
      .map(
        (team) => `
        <div>
          <div class="flex justify-between items-center mb-1 text-xs">
            <span class="font-medium text-on-surface flex items-center gap-1.5">
              <span class="material-symbols-outlined text-base text-primary">${team.icon}</span>
              ${escapeHtml(team.short)}
            </span>
            <span class="text-on-surface font-bold">${team.activeMembers.length}/${team.members.length} Bertugas</span>
          </div>
          <div class="w-full h-2 rounded-full bg-surface-container overflow-hidden">
            <div class="h-full rounded-full ${priorityColor(team.capacity)}" style="width:${team.capacity}%"></div>
          </div>
          <span class="text-[11px] text-secondary mt-0.5 block">
            ${team.tickets.length} tiket aktif • ${team.doneTickets.length} selesai • kapasitas ${team.capacity}%
          </span>
        </div>`
      )
      .join("");
  }

  const roster = state.technicians.filter((technician) => !technician.archived);
  const total = roster.length;
  const active = roster.filter((technician) => technician.active).length;
  setText("[data-tech-summary='total']", `${total} Personil`);
  setText("[data-tech-summary='active']", `${active} Siaga`);
  setText("[data-tech-summary='teams']", `${TEAMS.length} Tim Spesialis`);
  setText(
    "[data-tech-summary='tickets']",
    `${activeReports().length} tiket aktif ditangani`
  );
}

function renderTechnicianPerformance() {
  const container = byId("technician-performance-list");
  if (!container) return;

  const list = technicianWorkload().sort(
    (a, b) => b.active - a.active || b.done - a.done || a.name.localeCompare(b.name)
  );
  const totalActive = list.reduce((sum, technician) => sum + technician.active, 0);
  const busy = list.filter((technician) => technician.active > 0).length;
  const max = Math.max(1, ...list.map((technician) => technician.active));

  setText(
    "[data-tech-load-summary]",
    `${totalActive} tiket aktif • ${busy} personil sibuk`
  );

  container.innerHTML = list
    .map((technician) => {
      const percent = Math.round((technician.active / max) * 100);
      return `
        <div class="rounded-xl bg-surface-container-low p-3">
          <div class="flex items-center justify-between gap-2 text-xs">
            <span class="font-semibold text-on-surface truncate">${escapeHtml(technician.title)}</span>
            <span class="font-bold ${technician.active ? "text-primary" : "text-emerald-700"}">${technician.active} aktif</span>
          </div>
          <div class="w-full h-2 rounded-full bg-surface-container overflow-hidden mt-2">
            <div class="h-full rounded-full ${technician.active ? "bg-primary-container" : "bg-emerald-500"}" style="width:${percent}%"></div>
          </div>
          <p class="text-[10px] text-secondary mt-1">${escapeHtml(technician.team?.short || "-")} • ${technician.done} selesai • ${technician.active ? "PIC/pendukung" : "siap menerima tugas"}</p>
        </div>`;
    })
    .join("");
}

function renderAuditLog() {
  const list = byId("audit-log-list");
  if (!list) return;
  const entries = auditEntries(4);

  if (!entries.length) {
    list.innerHTML = `
      <div class="cc-empty">
        <span class="material-symbols-outlined text-3xl text-gray-300">history</span>
        <p class="text-xs text-gray-500">Belum ada jejak perubahan status.</p>
      </div>`;
    return;
  }

  list.innerHTML = entries
    .map((entry) => {
      const visual = statusIcon(entry.status);
      return `
        <div class="relative flex items-start gap-3 pl-1">
          <div class="w-5 h-5 rounded-full ${visual.color} text-white flex items-center justify-center z-10 shrink-0">
            <span class="material-symbols-outlined text-xs">${visual.icon}</span>
          </div>
          <div class="min-w-0">
            <p class="font-bold text-on-surface">${escapeHtml(entry.label)}</p>
            <p class="text-secondary text-[11px] truncate">${escapeHtml(entry.ticketId)} • ${escapeHtml(entry.title)}</p>
            <p class="text-secondary text-[11px]">${escapeHtml(entry.actor || "Sistem")}</p>
            <span class="text-[10px] text-primary font-bold">${escapeHtml(relativeTime(entry.at))}</span>
          </div>
        </div>`;
    })
    .join("");
}

function renderDispatchPanel() {
  const summary = dispatchSummary();
  setText("[data-dispatch-queue]", summary.queue);
  setText("[data-dispatch-urgent]", summary.urgent);
  setText("[data-dispatch-oldest]", `${summary.oldest} menit`);
  setText("[data-dispatch-safe]", `${summary.safePercent}% antrean masih dalam batas aman.`);
  setWidth("[data-dispatch-safe-bar]", summary.safePercent);
}

function renderSlaPanel() {
  const sla = slaStats();
  setText("[data-sla='avg']", sla.avgHours);
  setText("[data-sla='percent']", `${sla.percent}%`);
  setText("[data-sla='done']", sla.done);
  setText("[data-sla='backlog']", sla.backlog);
  setText(
    "[data-sla='backlog-sub']",
    `${sla.urgentBacklog} di antaranya prioritas tinggi • ${sla.overdue} melewati SLA`
  );
  setText(
    "[data-sla='percent-sub']",
    sla.done
      ? `${sla.onTime} dari ${sla.done} tiket selesai tepat waktu`
      : "Belum ada tiket selesai pada periode ini"
  );
  setWidth("[data-sla-bar='percent']", sla.percent);

  const trend = monthlyTrend(6);
  const trendBox = byId("sla-trend-chart");
  if (trendBox) {
    trendBox.innerHTML = trend
      .map(
        (month) => `
        <div class="flex-1 h-full flex flex-col items-center justify-end gap-2">
          <div class="w-full rounded-t-xl ${month.current ? "bg-primary-container" : "bg-surface-container-high"}" style="height:${month.height}%;max-width:46px" title="${month.count} tiket selesai"></div>
          <span class="text-[10px] ${month.current ? "font-bold text-primary" : "font-semibold text-secondary"}">${month.label}</span>
        </div>`
      )
      .join("");
  }

  const categories = categoryBreakdown();
  const categoryBox = byId("sla-category-list");
  if (categoryBox) {
    categoryBox.innerHTML = categories
      .map(
        (category) => `
        <div>
          <div class="flex justify-between mb-1">
            <span class="font-medium text-on-surface">${escapeHtml(category.meta.label)}</span>
            <span class="font-bold ${category.percent >= 80 ? "text-emerald-600" : category.percent >= 50 ? "text-primary" : "text-amber-600"}">${category.percent}%</span>
          </div>
          <div class="w-full h-2 rounded-full bg-surface-container overflow-hidden">
            <div class="h-full rounded-full ${category.percent >= 80 ? "bg-emerald-500" : category.percent >= 50 ? "bg-primary-container" : "bg-amber-500"}" style="width:${clamp(category.percent)}%"></div>
          </div>
          <span class="text-[10px] text-secondary">${category.done}/${category.total} tiket selesai</span>
        </div>`
      )
      .join("");
  }

  const period = new Date();
  setText("[data-sla-period]", `${MONTHS_SHORT[period.getMonth()]} ${period.getFullYear()}`);
}

export function slaStateLabel(report) {
  if (report.status === "done") {
    if (!report.completedAt || !report.slaDueAt) return "Selesai";
    return timeOf(report.completedAt) > timeOf(report.slaDueAt)
      ? "Selesai terlambat"
      : "Selesai tepat waktu";
  }
  if (!report.slaDueAt) return "Tanpa target";
  return timeOf(report.slaDueAt) < Date.now() ? "Melewati SLA" : "Dalam target";
}

function renderDamageRecap() {
  const reports = state.reports;
  const active = reports.filter((report) => report.status !== "done");
  const highPriorityActive = active.filter((report) => report.priority === "Tinggi");
  const attentionAssets = state.assets
    .filter((asset) => asset.condition !== "good")
    .sort(
      (a, b) =>
        assetCondition(a.condition).weight - assetCondition(b.condition).weight ||
        a.name.localeCompare(b.name)
    );

  setText("[data-damage='tickets']", reports.length);
  setText("[data-damage='active']", active.length);
  setText("[data-damage='high']", highPriorityActive.length);
  setText("[data-damage='assets']", attentionAssets.length);
  setText("[data-damage='ticket-count']", `${reports.length} tiket`);

  setText(
    "[data-damage-sub='tickets']",
    `${reports.filter((report) => report.status === "done").length} tiket selesai tervalidasi`
  );
  setText(
    "[data-damage-sub='active']",
    `${reports.filter((report) => report.status === "review").length} menunggu verifikasi`
  );
  setText(
    "[data-damage-sub='high']",
    `${highPriorityActive.filter((report) => report.status === "review").length} masih di antrean disposisi`
  );
  setText(
    "[data-damage-sub='assets']",
    `${state.assets.filter((asset) => asset.condition === "broken").length} aset rusak`
  );

  const categoryBox = byId("damage-category-list");
  if (categoryBox) {
    const categories = categoryBreakdown();
    categoryBox.innerHTML = categories.length
      ? categories
          .map((category) => {
            const percent = category.total
              ? Math.round((category.active / category.total) * 100)
              : 0;
            const tone =
              percent >= 60
                ? "bg-red-500"
                : percent >= 30
                  ? "bg-amber-500"
                  : "bg-emerald-500";
            return `
        <div>
          <div class="flex justify-between mb-1">
            <span class="font-medium text-on-surface">${escapeHtml(category.meta.label)}</span>
            <span class="font-bold ${percent >= 60 ? "text-red-600" : percent >= 30 ? "text-amber-600" : "text-emerald-600"}">${category.active} aktif</span>
          </div>
          <div class="w-full h-2 rounded-full bg-surface-container overflow-hidden">
            <div class="h-full rounded-full ${tone}" style="width:${clamp(percent)}%"></div>
          </div>
          <span class="text-[10px] text-secondary">${category.done}/${category.total} tiket selesai • ${percent}% masih aktif</span>
        </div>`;
          })
          .join("")
      : `<p class="text-xs text-secondary">Belum ada data kategori kerusakan.</p>`;
  }

  const assetBox = byId("damage-asset-list");
  if (assetBox) {
    assetBox.innerHTML = attentionAssets.length
      ? attentionAssets
          .map((asset) => {
            const condition = assetCondition(asset.condition);
            const related = reports.filter(
              (report) => report.cat === asset.cat && report.status !== "done"
            ).length;
            return `
        <button type="button" class="w-full text-left rounded-xl border border-surface-container-high p-3 hover:bg-surface-container-low transition" data-action="asset-detail" data-asset="${escapeHtml(asset.id)}">
          <div class="flex items-start justify-between gap-2">
            <span class="font-semibold text-on-surface text-xs">${escapeHtml(asset.name)}</span>
            <span class="px-2 py-0.5 rounded-full ${condition.chip} font-bold text-[10px] whitespace-nowrap">${escapeHtml(condition.label)}</span>
          </div>
          <p class="text-[10px] text-secondary mt-1">${escapeHtml(asset.location)} • ${escapeHtml(asset.zone)}</p>
          <p class="text-[10px] text-secondary mt-0.5">${related} tiket aktif kategori ini</p>
        </button>`;
          })
          .join("")
      : `<p class="text-xs text-secondary">Semua aset dalam kondisi baik.</p>`;
  }

  const body = byId("damage-ticket-body");
  if (body) {
    const sorted = [...reports].sort(
      (a, b) =>
        Number(a.status === "done") - Number(b.status === "done") ||
        Number(b.priority === "Tinggi") - Number(a.priority === "Tinggi") ||
        timeOf(b.createdAt) - timeOf(a.createdAt)
    );

    body.innerHTML = sorted.length
      ? sorted
          .map((report) => {
            const category = CATEGORY_META[report.cat] || CATEGORY_META.ac;
            const status = STATUS_META[report.status] || STATUS_META.review;
            const priority = PRIORITY_META[report.priority] || PRIORITY_META.Sedang;
            const overdue =
              report.status !== "done" &&
              report.slaDueAt &&
              timeOf(report.slaDueAt) < Date.now();
            const lateDone =
              report.status === "done" &&
              report.completedAt &&
              report.slaDueAt &&
              timeOf(report.completedAt) > timeOf(report.slaDueAt);
            const slaAlert = overdue || lateDone;
            return `
        <tr class="hover:bg-surface-container-low transition">
          <td class="py-3 px-5">
            <span class="block font-bold text-on-surface whitespace-nowrap">${escapeHtml(report.id)}</span>
            <span class="block text-[10px] text-secondary mt-0.5 max-w-[260px] truncate">${escapeHtml(report.title)}</span>
            <span class="block text-[10px] text-secondary">${escapeHtml(report.location)}</span>
          </td>
          <td class="py-3 px-5">
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${category.badge} font-bold text-[10px] whitespace-nowrap">
              <span class="material-symbols-outlined text-xs">${category.icon}</span>
              ${escapeHtml(category.label)}
            </span>
          </td>
          <td class="py-3 px-5">
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${status.chip} font-bold text-[10px] whitespace-nowrap">
              <span class="w-1.5 h-1.5 rounded-full ${status.dot}"></span>
              ${escapeHtml(status.short)}
            </span>
          </td>
          <td class="py-3 px-5">
            <span class="px-2.5 py-1 rounded-full ${priority.chip} font-bold text-[10px] whitespace-nowrap">${escapeHtml(report.priority || "Sedang")}</span>
          </td>
          <td class="py-3 px-5 whitespace-nowrap">
            <span class="block ${slaAlert ? "font-bold text-red-700" : "text-on-surface"}">${escapeHtml(formatDateTime(report.slaDueAt))}</span>
            <span class="block text-[10px] ${slaAlert ? "text-red-600" : "text-secondary"}">${escapeHtml(slaStateLabel(report))}</span>
          </td>
          <td class="py-3 px-5 text-right">
            <button type="button" class="text-primary font-bold hover:underline" data-action="open-detail" data-ticket="${escapeHtml(report.id)}">Detail</button>
          </td>
        </tr>`;
          })
          .join("")
      : `<tr><td colspan="6" class="py-10 px-5 text-center text-secondary text-xs">Belum ada tiket kerusakan.</td></tr>`;
  }
}

function renderBadges() {
  const reports = state.reports;
  const review = reports.filter((report) => report.status === "review").length;
  const urgent = reports.filter((report) => report.urgent && report.status !== "done").length;
  const activeTechs = state.technicians.filter(
    (technician) => technician.active && !technician.archived
  ).length;
  const sla = slaStats(reports);
  const attention = state.assets.filter((asset) => asset.condition !== "good").length;

  setText("[data-admin-badge='review']", review);
  setText("[data-admin-badge='urgent']", `${urgent} Urgent`);
  setText("[data-admin-badge='sla']", `${sla.percent}%`);
  setText("[data-admin-badge='techs']", `${activeTechs} Siaga`);
  setText("[data-admin-badge='inventory']", `${attention} Aset`);
}

/** Render seluruh angka analitik admin. Aman dipanggil kapan saja. */
export function renderAnalytics() {
  renderKpis();
  renderReadiness();
  renderWorkload();
  renderTechnicianPerformance();
  renderAuditLog();
  renderDispatchPanel();
  renderSlaPanel();
  renderDamageRecap();
  renderBadges();
}
