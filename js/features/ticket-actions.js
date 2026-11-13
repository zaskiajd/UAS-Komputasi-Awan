/* ==========================================================================
   features/ticket-actions.js — Detail tiket admin & siklus status
   ========================================================================== */

import { byId, escapeHtml, formatDateTime, relativeTime } from "../core/dom.js";
import { state } from "../core/state.js";
import {
  assignmentRoster,
  nextInstructionId,
  primaryAssignee,
} from "../data/assignments.js";
import { CATEGORY_META, PRIORITY_META, STATUS_META } from "../data/reports.js";
import { TEAM_BY_ID, technicianById } from "../data/technicians.js";
import { openModal } from "../ui/modal.js";
import { showToast } from "../ui/toast.js";
import { renderReports } from "./reports.js";
import { renderTechnicians } from "./technicians.js";
import { updateStatusRequest } from "./tickets-api.js";

const ADMIN_NAME = "Ir. Hendrawan";

const isOverdue = (report) =>
  Boolean(
    report.status !== "done" &&
      report.slaDueAt &&
      new Date(report.slaDueAt).getTime() < Date.now()
  );

function actionButtons(report) {
  const button = (status, label, icon, variant) => `
    <button type="button" class="h-10 px-4 rounded-full text-xs font-bold transition flex items-center gap-1.5 ${variant}" data-action="ticket-status" data-ticket="${escapeHtml(report.id)}" data-status="${status}">
      <span class="material-symbols-outlined text-base">${icon}</span>
      ${label}
    </button>`;

  const actions = [];
  if (report.status === "review") {
    actions.push(`
      <button type="button" class="h-10 px-4 rounded-full bg-primary-container text-white text-xs font-bold hover:brightness-110 transition flex items-center gap-1.5" data-action="quick-assign" data-ticket="${escapeHtml(report.id)}">
        <span class="material-symbols-outlined text-base">bolt</span>
        Disposisi ke Teknisi
      </button>`);
  }
  if (report.status === "progress") {
    actions.push(
      button("waiting", "Menunggu Suku Cadang", "schedule", "bg-amber-100 text-amber-800 hover:bg-amber-200"),
      button("done", "Selesaikan Pekerjaan", "task_alt", "bg-emerald-100 text-emerald-800 hover:bg-emerald-200")
    );
  }
  if (report.status === "waiting") {
    actions.push(
      button("progress", "Lanjutkan Penanganan", "engineering", "bg-tertiary-fixed text-tertiary hover:brightness-105"),
      button("done", "Selesaikan Pekerjaan", "task_alt", "bg-emerald-100 text-emerald-800 hover:bg-emerald-200")
    );
  }
  if (report.status === "done") {
    actions.push(
      button("reopen", "Buka Kembali Tiket", "replay", "bg-surface-container-high text-on-surface hover:bg-surface-variant")
    );
  }
  return actions.join("");
}

function rosterSection(report) {
  const roster = assignmentRoster(report, state.technicians);
  const supportEntries = roster.filter((entry) => entry.role !== "PIC");
  const teamTechs = state.technicians.filter(
    (technician) =>
      !technician.archived &&
      (!report.teamId || technician.teamId === report.teamId) &&
      (technician.active || technician.id === report.assignee)
  );
  const picOptions = teamTechs.length
    ? teamTechs
        .map(
          (technician) =>
            `<option value="${escapeHtml(technician.id)}" ${
              technician.id === report.assignee ? "selected" : ""
            }>${escapeHtml(technician.title)} — ${escapeHtml(technician.role)}${
              technician.active ? "" : " (standby)"
            }</option>`
        )
        .join("")
    : `<option value="">Tidak ada teknisi aktif</option>`;

  const availableSupport = teamTechs.filter(
    (technician) =>
      technician.active &&
      !roster.some((entry) => entry.techId === technician.id)
  );
  const supportOptions = availableSupport.length
    ? availableSupport
        .map(
          (technician) =>
            `<option value="${escapeHtml(technician.id)}">${escapeHtml(
              technician.title
            )} — ${escapeHtml(technician.role)}</option>`
        )
        .join("")
    : `<option value="">Tidak ada pendukung tersedia</option>`;

  return `
    <div class="mt-4 rounded-xl border border-surface-container-high p-3">
      <div class="flex items-center justify-between gap-2">
        <p class="text-[10px] uppercase tracking-wider text-secondary font-bold">Tim Penanganan</p>
        <span class="text-[10px] text-secondary">${roster.length} personil</span>
      </div>
      <div class="mt-2 space-y-2">
        ${
          roster.length
            ? roster
                .map(
                  (entry) => `
              <div class="flex items-center justify-between gap-2 rounded-xl bg-surface-container-low px-3 py-2">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="w-8 h-8 rounded-full bg-primary-fixed text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
                    ${escapeHtml(entry.technician.name.slice(0, 2).toUpperCase())}
                  </span>
                  <span class="min-w-0">
                    <span class="block text-[11px] font-bold text-on-surface truncate">${escapeHtml(entry.technician.title)}</span>
                    <span class="block text-[10px] text-secondary truncate">${escapeHtml(entry.role)} • ditugaskan ${escapeHtml(relativeTime(entry.assignedAt))}</span>
                  </span>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <span class="px-2 py-0.5 rounded-full bg-white text-[9px] font-bold text-secondary">${escapeHtml(entry.role)}</span>
                  ${
                    entry.role !== "PIC"
                      ? `<button type="button" class="text-[10px] font-bold text-red-600 hover:underline" data-action="remove-support" data-ticket="${escapeHtml(report.id)}" data-tech="${escapeHtml(entry.techId)}">Lepas</button>`
                      : ""
                  }
                </div>
              </div>`
                )
                .join("")
            : `<p class="text-[11px] text-secondary rounded-xl bg-surface-container-low p-3">Belum ada teknisi. Gunakan disposisi untuk menetapkan PIC pertama.</p>`
        }
      </div>

      ${
        roster.length
          ? `<div class="mt-3 grid grid-cols-1 gap-2">
              <div class="flex flex-col sm:flex-row gap-2">
                <select class="flex-1 text-[11px] font-semibold rounded-xl border border-surface-container-high focus:border-primary-container focus:ring-primary-container bg-surface-container-low p-2.5" id="ticket-pic-select" aria-label="Pilih PIC baru">${picOptions}</select>
                <button type="button" class="h-10 px-4 rounded-full bg-inverse-surface text-white text-[11px] font-bold hover:brightness-110 transition shrink-0" data-action="save-pic" data-ticket="${escapeHtml(report.id)}">Ganti PIC</button>
              </div>
              <div class="flex flex-col sm:flex-row gap-2">
                <select class="flex-1 text-[11px] font-semibold rounded-xl border border-surface-container-high focus:border-primary-container focus:ring-primary-container bg-surface-container-low p-2.5" id="ticket-support-select" aria-label="Pilih teknisi pendukung" ${availableSupport.length ? "" : "disabled"}>${supportOptions}</select>
                <button type="button" class="h-10 px-4 rounded-full bg-tertiary-fixed text-tertiary text-[11px] font-bold hover:brightness-105 transition shrink-0 disabled:opacity-50 disabled:cursor-not-allowed" data-action="add-support" data-ticket="${escapeHtml(report.id)}" ${availableSupport.length ? "" : "disabled"}>Tambah Pendukung</button>
              </div>
              <p class="text-[10px] text-secondary">${supportEntries.length} teknisi pendukung aktif • PIC memegang tanggung jawab utama.</p>
            </div>`
          : ""
      }
    </div>`;
}

function instructionSection(report) {
  const roster = assignmentRoster(report, state.technicians);
  const instructions = (report.instructions || [])
    .slice()
    .sort((a, b) => new Date(b.at) - new Date(a.at));

  const targetOptions = roster.length
    ? roster
        .map(
          (entry) =>
            `<option value="${escapeHtml(entry.techId)}">${escapeHtml(
              entry.technician.title
            )} — ${escapeHtml(entry.role)}</option>`
        )
        .join("")
    : `<option value="">Belum ada teknisi</option>`;

  return `
    <div class="mt-4 rounded-xl border border-surface-container-high p-3">
      <div class="flex items-center justify-between gap-2">
        <p class="text-[10px] uppercase tracking-wider text-secondary font-bold">Instruksi Terarah</p>
        <span class="text-[10px] text-secondary">${instructions.length} pesan</span>
      </div>
      <div class="mt-2 space-y-2 max-h-48 overflow-y-auto pr-1">
        ${
          instructions.length
            ? instructions
                .map((instruction) => {
                  const target = technicianById(instruction.toTechId, state.technicians);
                  return `
              <div class="rounded-xl bg-surface-container-low p-3">
                <div class="flex items-center justify-between gap-2">
                  <span class="text-[11px] font-bold text-on-surface truncate">${escapeHtml(instruction.from || "Admin")} → ${escapeHtml(target?.title || "Teknisi")}</span>
                  <span class="text-[10px] text-secondary shrink-0">${escapeHtml(relativeTime(instruction.at))}</span>
                </div>
                <p class="text-[11px] text-secondary leading-relaxed mt-1">${escapeHtml(instruction.text)}</p>
                <span class="inline-flex items-center gap-1 mt-1 text-[9px] font-semibold ${instruction.readAt ? "text-emerald-700" : "text-secondary"}">
                  <span class="material-symbols-outlined text-[12px]">${instruction.readAt ? "mark_email_read" : "schedule_send"}</span>
                  ${instruction.readAt ? `Dibaca ${escapeHtml(relativeTime(instruction.readAt))}` : "Terkirim"}
                </span>
              </div>`;
                })
                .join("")
            : `<p class="text-[11px] text-secondary rounded-xl bg-surface-container-low p-3">Belum ada instruksi terarah untuk tim ini.</p>`
        }
      </div>
      <p class="text-[10px] text-secondary mt-2 leading-relaxed">Status baca akan aktif saat portal teknisi tersedia; saat ini pesan tercatat sebagai terkirim.</p>
      ${
        roster.length
          ? `<form class="mt-2 flex flex-col gap-2" id="ticket-instruction-form" data-ticket="${escapeHtml(report.id)}">
              <select class="w-full text-[11px] font-semibold rounded-xl border border-surface-container-high focus:border-primary-container focus:ring-primary-container bg-surface-container-low p-2.5" id="ticket-instruction-target" aria-label="Penerima instruksi">${targetOptions}</select>
              <div class="flex flex-col sm:flex-row gap-2">
                <textarea class="flex-1 text-[11px] font-medium rounded-xl border border-surface-container-high focus:border-primary-container focus:ring-primary-container bg-surface-container-low p-2.5" rows="2" placeholder="Tulis instruksi khusus untuk teknisi terpilih..." required></textarea>
                <button type="submit" class="h-10 px-4 rounded-full bg-primary-container text-white text-[11px] font-bold hover:brightness-110 transition shrink-0">Kirim Instruksi</button>
              </div>
            </form>`
          : ""
      }
    </div>`;
}

function ticketDetailMarkup(report) {
  const category = CATEGORY_META[report.cat] || CATEGORY_META.ac;
  const status = STATUS_META[report.status] || STATUS_META.review;
  const priority = PRIORITY_META[report.priority] || PRIORITY_META.Sedang;
  const team = report.team || TEAM_BY_ID[report.teamId]?.name || "Belum ditugaskan";
  const assignee = primaryAssignee(report, state.technicians);
  const roster = assignmentRoster(report, state.technicians);
  const overdue = isOverdue(report);
  const notes = (report.notes || []).slice().sort((a, b) => new Date(b.at) - new Date(a.at));
  const history = (report.history || []).slice().sort((a, b) => new Date(b.at) - new Date(a.at));

  return `
    <div class="flex items-start justify-between gap-3">
      <div class="flex items-start gap-3 min-w-0">
        <div class="w-11 h-11 rounded-xl ${category.badge} flex items-center justify-center shrink-0">
          <span class="material-symbols-outlined text-xl">${category.icon}</span>
        </div>
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-[11px] font-bold text-secondary">${escapeHtml(report.id)}</span>
            <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full ${status.chip} text-[10px] font-bold">
              <span class="w-1.5 h-1.5 rounded-full ${status.dot}"></span>${escapeHtml(status.label)}
            </span>
            <span class="px-2.5 py-0.5 rounded-full ${priority.chip} text-[10px] font-bold">${escapeHtml(report.priority || "Sedang")}</span>
            ${overdue ? '<span class="px-2.5 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold">Lewat SLA</span>' : ""}
          </div>
          <h3 class="text-base sm:text-lg font-bold text-on-surface font-display mt-1 leading-snug">${escapeHtml(report.title)}</h3>
          <p class="text-[11px] text-secondary mt-1">${escapeHtml(category.label)} • ${escapeHtml(report.date)}</p>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5 text-xs">
      <div class="rounded-xl bg-surface-container-low p-3">
        <p class="text-[10px] uppercase tracking-wider text-secondary font-bold">Pelapor</p>
        <p class="font-semibold text-on-surface mt-1">${escapeHtml(report.reporter)}</p>
      </div>
      <div class="rounded-xl bg-surface-container-low p-3">
        <p class="text-[10px] uppercase tracking-wider text-secondary font-bold">Lokasi</p>
        <p class="font-semibold text-on-surface mt-1">${escapeHtml(report.location)}</p>
      </div>
      <div class="rounded-xl bg-surface-container-low p-3">
        <p class="text-[10px] uppercase tracking-wider text-secondary font-bold">Tim penanganan</p>
        <p class="font-semibold text-on-surface mt-1">${escapeHtml(team)}</p>
        <p class="text-[10px] text-secondary mt-0.5">${escapeHtml(
          assignee ? `PIC: ${assignee.title}${roster.length > 1 ? ` • ${roster.length - 1} pendukung` : ""}` : "Belum ada teknisi"
        )}</p>
      </div>
      <div class="rounded-xl bg-surface-container-low p-3">
        <p class="text-[10px] uppercase tracking-wider text-secondary font-bold">Batas SLA</p>
        <p class="font-semibold ${overdue ? "text-red-700" : "text-on-surface"} mt-1">${escapeHtml(formatDateTime(report.slaDueAt))}</p>
        <p class="text-[10px] text-secondary mt-0.5">${report.completedAt ? `Selesai ${escapeHtml(formatDateTime(report.completedAt))}` : "Belum selesai"}</p>
      </div>
    </div>

    <div class="mt-4">
      <div class="flex items-center justify-between text-xs mb-1">
        <span class="text-secondary">Progres penanganan</span>
        <span class="font-bold text-on-surface">${Math.min(100, Math.max(0, Number(report.progress) || 0))}%</span>
      </div>
      <div class="w-full h-2.5 rounded-full bg-surface-container overflow-hidden">
        <div class="h-full rounded-full ${report.status === "done" ? "bg-emerald-500" : overdue ? "bg-red-500" : "bg-primary-container"}" style="width:${Math.min(100, Math.max(0, Number(report.progress) || 0))}%"></div>
      </div>
    </div>

    <div class="mt-4 rounded-xl border border-surface-container-high p-3">
      <p class="text-[10px] uppercase tracking-wider text-secondary font-bold">Deskripsi laporan</p>
      <p class="text-xs text-on-surface leading-relaxed mt-1">${escapeHtml(report.description)}</p>
    </div>

    ${rosterSection(report)}
    ${instructionSection(report)}

    <div class="mt-5">
      <div class="flex items-center justify-between gap-2">
        <p class="text-xs font-bold text-on-surface">Catatan Operasional</p>
        <span class="text-[11px] text-secondary">${notes.length} catatan</span>
      </div>
      <div class="mt-2 space-y-2 max-h-40 overflow-y-auto pr-1">
        ${
          notes.length
            ? notes
                .map(
                  (note) => `
              <div class="rounded-xl bg-surface-container-low p-3">
                <div class="flex items-center justify-between gap-2">
                  <span class="text-[11px] font-bold text-on-surface">${escapeHtml(note.author || "Admin")}</span>
                  <span class="text-[10px] text-secondary">${escapeHtml(relativeTime(note.at))}</span>
                </div>
                <p class="text-[11px] text-secondary leading-relaxed mt-1">${escapeHtml(note.text)}</p>
              </div>`
                )
                .join("")
            : `<p class="text-[11px] text-secondary rounded-xl bg-surface-container-low p-3">Belum ada catatan operasional.</p>`
        }
      </div>
      <form class="mt-3 flex flex-col sm:flex-row gap-2" id="ticket-note-form" data-ticket="${escapeHtml(report.id)}">
        <textarea class="flex-1 text-xs font-medium rounded-xl border border-surface-container-high focus:border-primary-container focus:ring-primary-container bg-surface-container-low p-2.5" rows="2" placeholder="Tambahkan instruksi atau catatan untuk teknisi..." required></textarea>
        <button type="submit" class="h-10 px-4 rounded-full bg-inverse-surface text-white text-xs font-bold hover:brightness-110 transition shrink-0">Tambah Catatan</button>
      </form>
    </div>

    <div class="mt-5">
      <p class="text-xs font-bold text-on-surface">Riwayat Status</p>
      <div class="mt-2 space-y-3 max-h-48 overflow-y-auto pr-1">
        ${history
          .map(
            (entry) => `
          <div class="flex items-start gap-2.5">
            <span class="w-2 h-2 rounded-full mt-1.5 shrink-0 ${entry.status === "done" ? "bg-emerald-500" : entry.status === "waiting" ? "bg-amber-500" : entry.status === "progress" ? "bg-tertiary" : "bg-primary-container"}"></span>
            <div class="min-w-0">
              <p class="text-[11px] font-bold text-on-surface">${escapeHtml(entry.label)}</p>
              <p class="text-[10px] text-secondary">${escapeHtml(entry.actor || "Sistem")} • ${escapeHtml(formatDateTime(entry.at))}</p>
              ${entry.note ? `<p class="text-[10px] text-secondary leading-relaxed mt-0.5">${escapeHtml(entry.note)}</p>` : ""}
            </div>
          </div>`
          )
          .join("")}
      </div>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-2 mt-5 pt-4 border-t border-surface-container-high">
      <div class="flex flex-wrap gap-2">${actionButtons(report)}</div>
      <button type="button" class="h-10 px-4 rounded-full bg-surface-container text-on-surface text-xs font-bold hover:bg-surface-container-high transition" data-action="close-modal">Tutup</button>
    </div>`;
}

function refreshTicketDetail(report) {
  const body = byId("ticket-detail-body");
  if (body && body.dataset.ticket === report.id) {
    body.innerHTML = ticketDetailMarkup(report);
  }
}

export function openTicketDetail(ticketId) {
  const report = state.reports.find((item) => item.id === ticketId);
  const body = byId("ticket-detail-body");
  const modal = byId("modal-ticket-detail");
  if (!report || !body || !modal) return;

  body.dataset.ticket = report.id;
  body.innerHTML = ticketDetailMarkup(report);
  openModal(modal);
}

function afterAssignmentChange(report, toastTitle, toastText) {
  refreshTicketDetail(report);
  renderReports();
  renderTechnicians();
  showToast(toastTitle, toastText, "success");
}

export function changeTicketPic(ticketId, techId) {
  const report = state.reports.find((item) => item.id === ticketId);
  const selectedId = techId || byId("ticket-pic-select")?.value || "";
  const technician = state.technicians.find((item) => item.id === selectedId);
  if (!report) return;

  if (!technician) {
    showToast("PIC Tidak Ditemukan", "Pilih teknisi yang masih aktif pada tim ini.", "error");
    return;
  }
  if (!technician.active) {
    showToast(
      "Teknisi Sedang Standby",
      `${technician.title} belum bertugas. Aktifkan terlebih dahulu atau pilih teknisi lain.`,
      "error"
    );
    return;
  }
  if (technician.id === report.assignee) {
    showToast("PIC Tidak Berubah", `${technician.title} sudah menjadi PIC tiket ini.`, "info");
    return;
  }

  const now = new Date().toISOString();
  report.assignments = Array.isArray(report.assignments) ? report.assignments : [];

  let hadPic = false;
  report.assignments.forEach((entry) => {
    if (
      entry.role === "PIC" &&
      entry.status !== "replaced" &&
      entry.status !== "removed"
    ) {
      entry.status = "replaced";
      hadPic = true;
    }
    if (
      entry.techId === technician.id &&
      entry.status === "active" &&
      entry.role !== "PIC"
    ) {
      entry.status = "removed";
    }
  });

  if (!hadPic && report.assignee) {
    report.assignments.push({
      techId: report.assignee,
      role: "PIC",
      assignedAt: report.assignedAt || report.updatedAt || now,
      assignedBy: ADMIN_NAME,
      status: "replaced",
    });
  }

  report.assignments.push({
    techId: technician.id,
    role: "PIC",
    assignedAt: now,
    assignedBy: ADMIN_NAME,
    status: report.status === "done" ? "done" : "active",
  });

  report.assignee = technician.id;
  report.assignedAt = now;
  report.teamId = technician.teamId;
  report.team = TEAM_BY_ID[technician.teamId]?.name || report.team;
  report.updatedAt = now;
  report.history = report.history || [];
  report.history.push({
    at: now,
    label: `PIC diganti ke ${technician.title}`,
    actor: ADMIN_NAME,
    status: report.status,
    note: `Penanggung jawab utama tiket kini ${technician.title}.`,
  });

  updateStatusRequest(report, report.status, {
    teamId: technician.teamId,
    assignee: technician.id,
    note: `Penanggung jawab utama tiket kini ${technician.title}.`,
  }).catch(() => {});

  afterAssignmentChange(
    report,
    "PIC Diperbarui",
    `${technician.title} sekarang menjadi PIC tiket ${report.id}.`
  );
}

export function addTicketSupport(ticketId, techId) {
  const report = state.reports.find((item) => item.id === ticketId);
  const selectedId = techId || byId("ticket-support-select")?.value || "";
  const technician = state.technicians.find((item) => item.id === selectedId);
  if (!report) return;

  if (!technician) {
    showToast("Pendukung Tidak Ditemukan", "Pilih teknisi pendukung yang tersedia.", "error");
    return;
  }
  if (!technician.active) {
    showToast(
      "Teknisi Sedang Standby",
      `${technician.title} belum bertugas dan tidak bisa ditambahkan sebagai pendukung.`,
      "error"
    );
    return;
  }
  if (technician.id === report.assignee) {
    showToast("Sudah Menjadi PIC", `${technician.title} sudah memegang tiket ini sebagai PIC.`, "info");
    return;
  }

  const roster = assignmentRoster(report, state.technicians);
  if (roster.some((entry) => entry.techId === technician.id)) {
    showToast("Sudah Terdaftar", `${technician.title} sudah menjadi pendukung tiket ini.`, "info");
    return;
  }

  const now = new Date().toISOString();
  report.assignments = Array.isArray(report.assignments) ? report.assignments : [];

  // Pastikan PIC lama tetap tercatat saat data masih memakai field `assignee`.
  if (
    report.assignee &&
    !report.assignments.some(
      (entry) =>
        entry.techId === report.assignee &&
        entry.role === "PIC" &&
        entry.status !== "replaced" &&
        entry.status !== "removed"
    )
  ) {
    report.assignments.unshift({
      techId: report.assignee,
      role: "PIC",
      assignedAt: report.assignedAt || report.updatedAt || now,
      assignedBy: ADMIN_NAME,
      status: report.status === "done" ? "done" : "active",
    });
  }

  report.assignments.push({
    techId: technician.id,
    role: "Pendukung",
    assignedAt: now,
    assignedBy: ADMIN_NAME,
    status: report.status === "done" ? "done" : "active",
  });
  report.updatedAt = now;
  report.history = report.history || [];
  report.history.push({
    at: now,
    label: `Pendukung ditambahkan: ${technician.title}`,
    actor: ADMIN_NAME,
    status: report.status,
    note: "Teknisi pendukung membantu penanganan tiket ini.",
  });

  afterAssignmentChange(
    report,
    "Pendukung Ditambahkan",
    `${technician.title} bergabung menangani tiket ${report.id}.`
  );
}

export function removeTicketSupport(ticketId, techId) {
  const report = state.reports.find((item) => item.id === ticketId);
  if (!report) return;

  const technician = technicianById(techId, state.technicians);
  const entry = (report.assignments || []).find(
    (item) => item.techId === techId && item.role !== "PIC" && item.status === "active"
  );
  if (!entry || !technician) {
    showToast("Pendukung Tidak Ditemukan", "Teknisi ini bukan pendukung aktif tiket.", "error");
    return;
  }

  const now = new Date().toISOString();
  entry.status = "removed";
  report.updatedAt = now;
  report.history = report.history || [];
  report.history.push({
    at: now,
    label: `Pendukung dilepas: ${technician.title}`,
    actor: ADMIN_NAME,
    status: report.status,
    note: "Teknisi pendukung dikeluarkan dari roster tiket ini.",
  });

  afterAssignmentChange(
    report,
    "Pendukung Dilepas",
    `${technician.title} tidak lagi menjadi pendukung tiket ${report.id}.`
  );
}

export function handleInstructionSubmit(event) {
  event.preventDefault();

  const form = event.target;
  const ticketId = form.dataset.ticket;
  const report = state.reports.find((item) => item.id === ticketId);
  const targetId = form.querySelector("select")?.value || "";
  const textarea = form.querySelector("textarea");
  const text = textarea ? textarea.value.trim() : "";
  const target = technicianById(targetId, state.technicians);

  if (!report) return;
  if (!target) {
    showToast("Penerima Tidak Ditemukan", "Pilih teknisi penerima instruksi.", "error");
    return;
  }
  if (
    !assignmentRoster(report, state.technicians).some(
      (entry) => entry.techId === target.id
    )
  ) {
    showToast(
      "Penerima Tidak Ada di Roster",
      "Instruksi hanya dapat dikirim ke PIC atau pendukung aktif tiket ini.",
      "error"
    );
    return;
  }
  if (!text) {
    showToast("Instruksi Kosong", "Tulis instruksi terlebih dahulu.", "error");
    return;
  }

  const now = new Date().toISOString();
  report.instructions = report.instructions || [];
  report.instructions.push({
    id: nextInstructionId(),
    at: now,
    from: ADMIN_NAME,
    toTechId: target.id,
    text,
    readAt: null,
  });
  report.updatedAt = now;
  report.history = report.history || [];
  report.history.push({
    at: now,
    label: `Instruksi terarah ke ${target.title}`,
    actor: ADMIN_NAME,
    status: report.status,
    note: text,
  });

  if (textarea) textarea.value = "";
  refreshTicketDetail(report);
  renderReports();

  showToast(
    "Instruksi Terkirim",
    `Pesan untuk ${target.title} tersimpan pada tiket ${report.id}.`,
    "success"
  );
}

export async function updateTicketStatus(ticketId, nextStatus) {
  const report = state.reports.find((item) => item.id === ticketId);
  if (!report) return;

  // Simpan ke backend dulu; tampilan hanya berubah bila server menerima.
  const apiStatus = nextStatus === "waiting" ? "waiting" : nextStatus === "done" ? "done" : "progress";
  const apiProgress =
    apiStatus === "done"
      ? 100
      : Math.min(95, Math.max(35, Number(report.progress) || 35));
  try {
    await updateStatusRequest(report, apiStatus, { progress: apiProgress });
  } catch (error) {
    showToast("Status Gagal Diubah", error.message || "Perubahan tidak tersimpan.", "error");
    return;
  }

  const now = new Date().toISOString();
  let label = "";
  let toastTitle = "";

  if (nextStatus === "waiting") {
    report.status = "waiting";
    report.progress = Math.min(95, Math.max(35, Number(report.progress) || 45));
    label = "Menunggu suku cadang";
    toastTitle = "Tiket Menunggu Suku Cadang";
  } else if (nextStatus === "done") {
    report.status = "done";
    report.progress = 100;
    report.completedAt = now;
    label = "Pekerjaan selesai & divalidasi";
    toastTitle = "Pekerjaan Selesai";
  } else if (nextStatus === "reopen") {
    report.status = "progress";
    report.completedAt = null;
    report.progress = Math.min(90, Math.max(35, Number(report.progress) || 35));
    label = "Tiket dibuka kembali";
    toastTitle = "Tiket Dibuka Kembali";
  } else {
    report.status = "progress";
    report.progress = Math.min(95, Math.max(35, Number(report.progress) || 35));
    label = "Penanganan dilanjutkan";
    toastTitle = "Penanganan Dilanjutkan";
  }

  report.assignments = Array.isArray(report.assignments) ? report.assignments : [];
  report.assignments.forEach((entry) => {
    if (entry.status === "active") {
      entry.status = report.status === "done" ? "done" : "active";
    }
  });

  report.updatedAt = now;
  report.history = report.history || [];
  report.history.push({
    at: now,
    label,
    actor: ADMIN_NAME,
    status: report.status,
    note: `Status tiket diubah menjadi ${STATUS_META[report.status]?.short || report.status}.`,
  });

  refreshTicketDetail(report);
  renderReports();
  renderTechnicians();

  showToast(toastTitle, `Tiket ${report.id}: ${label.toLowerCase()}.`, "success");
}

export function handleTicketNoteSubmit(event) {
  event.preventDefault();

  const form = event.target;
  const ticketId = form.dataset.ticket;
  const report = state.reports.find((item) => item.id === ticketId);
  const textarea = form.querySelector("textarea");
  const text = textarea ? textarea.value.trim() : "";

  if (!report) return;
  if (!text) {
    showToast("Catatan Kosong", "Tulis catatan terlebih dahulu.", "error");
    return;
  }

  const now = new Date().toISOString();
  report.notes = report.notes || [];
  report.notes.push({ at: now, author: ADMIN_NAME, text });
  report.updatedAt = now;
  report.history = report.history || [];
  report.history.push({
    at: now,
    label: "Catatan operasional ditambahkan",
    actor: ADMIN_NAME,
    status: report.status,
    note: text,
  });

  if (textarea) textarea.value = "";
  refreshTicketDetail(report);
  renderReports();

  showToast("Catatan Ditambahkan", `Catatan tersimpan pada tiket ${report.id}.`, "success");
}
