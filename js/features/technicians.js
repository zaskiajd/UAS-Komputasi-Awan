/* ==========================================================================
   features/technicians.js — Manajemen teknisi lapangan
   ========================================================================== */

import { byId, escapeHtml, formatDateTime } from "../core/dom.js";
import { state } from "../core/state.js";
import { assignmentRoster, ticketInvolves } from "../data/assignments.js";
import {
  nextTechnicianId,
  TEAMS,
  TEAM_BY_ID,
} from "../data/technicians.js";
import { closeModal, openModal } from "../ui/modal.js";
import { showToast } from "../ui/toast.js";
import { renderAnalytics, teamWorkload } from "./analytics.js";
import { renderReports } from "./reports.js";

const ROLE_OPTIONS = ["Koordinator", "Teknisi"];

const ACCENTS = {
  primary: { badge: "bg-primary-fixed text-primary", bar: "bg-primary-container" },
  tertiary: { badge: "bg-tertiary-fixed text-tertiary", bar: "bg-tertiary" },
  amber: { badge: "bg-amber-100 text-amber-800", bar: "bg-amber-500" },
  sky: { badge: "bg-sky-100 text-sky-700", bar: "bg-sky-500" },
};

function technicianTickets(technicianId) {
  return state.reports
    .filter((report) => ticketInvolves(report, technicianId))
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
}

function activeTickets(technicianId) {
  return technicianTickets(technicianId).filter((report) => report.status !== "done");
}

function doneTickets(technicianId) {
  return technicianTickets(technicianId).filter((report) => report.status === "done");
}

function memberChip(technician) {
  const load = activeTickets(technician.id).length;
  return `
    <button type="button" class="px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
      technician.active
        ? "bg-surface-container text-on-surface hover:bg-surface-container-high"
        : "bg-surface-container-high text-secondary hover:bg-surface-variant"
    }" data-action="tech-detail" data-tech="${escapeHtml(technician.id)}" title="${
      technician.active ? "Sedang bertugas" : "Standby"
    }">
      ${escapeHtml(technician.name)}
      ${technician.role === "Koordinator" ? '<span class="material-symbols-outlined text-[11px] align-middle">star</span>' : ""}
      ${load ? `<span class="ml-1 px-1.5 py-0.5 rounded-full bg-white/70 text-[9px] font-bold text-primary">${load}</span>` : ""}
    </button>`;
}

function teamCard(team) {
  const accent = ACCENTS[team.accent] || ACCENTS.primary;
  const coordinator =
    team.members.find((member) => member.role === "Koordinator") ||
    team.members.find((member) => member.id === team.coordinator);
  return `
    <article class="bg-surface-container-lowest rounded-2xl p-6 border border-white shadow-[0_12px_32px_-4px_rgba(20,23,26,0.05)]">
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-center gap-3">
          <span class="w-11 h-11 rounded-full ${accent.badge} flex items-center justify-center">
            <span class="material-symbols-outlined">${team.icon}</span>
          </span>
          <div>
            <h3 class="font-display text-base font-bold text-on-surface">${escapeHtml(team.name)}</h3>
            <p class="text-[11px] text-secondary">Koordinator: ${escapeHtml(
              coordinator?.title || "-"
            )}</p>
          </div>
        </div>
        <span class="text-[10px] font-bold px-2.5 py-1 rounded-full ${accent.badge}">${team.capacity}%</span>
      </div>

      <div class="mt-4 flex flex-wrap gap-1.5">
        ${team.members.map(memberChip).join("")}
      </div>

      <div class="mt-4 flex items-center justify-between text-xs mb-1">
        <span class="text-secondary">Personil bertugas</span>
        <span class="font-bold text-on-surface">${team.activeMembers.length} dari ${team.members.length} personil</span>
      </div>
      <div class="w-full h-2 rounded-full bg-surface-container overflow-hidden">
        <div class="h-full rounded-full ${accent.bar}" style="width:${team.capacity}%"></div>
      </div>

      <div class="mt-4 flex items-center justify-between text-[11px] text-secondary gap-3">
        <span>Zona: ${escapeHtml(team.zone)}</span>
        <span class="font-semibold ${team.tickets.length ? "text-primary" : "text-emerald-700"}">
          ${team.tickets.length} tiket aktif • ${team.doneTickets.length} selesai
        </span>
      </div>
    </article>`;
}

function matchesTechnicianQuery(technician, query) {
  if (!query) return true;
  const team = TEAM_BY_ID[technician.teamId];
  const haystack = [
    technician.name,
    technician.title,
    technician.role,
    technician.phone,
    team?.name || "",
    team?.short || "",
    ...(technician.skills || []),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function technicianRow(technician) {
  const team = TEAM_BY_ID[technician.teamId];
  const active = activeTickets(technician.id).length;
  const done = doneTickets(technician.id).length;
  const skills = technician.skills || [];
  const visibleSkills = skills.slice(0, 2);
  const extraSkills = skills.length - visibleSkills.length;
  const archived = Boolean(technician.archived);

  return `
    <tr>
      <td class="py-3.5 px-5">
        <button type="button" class="flex items-center gap-3 text-left" data-action="tech-detail" data-tech="${escapeHtml(technician.id)}">
          <span class="w-9 h-9 rounded-xl bg-primary-fixed text-primary flex items-center justify-center font-display font-bold text-[11px] shrink-0">
            ${escapeHtml(technician.name.slice(0, 2).toUpperCase())}
          </span>
          <span class="min-w-0">
            <span class="block font-semibold text-on-surface truncate">${escapeHtml(technician.title)}</span>
            <span class="block text-[10px] text-secondary truncate">${escapeHtml(technician.role)} • ${escapeHtml(team?.short || "Tanpa tim")}</span>
          </span>
        </button>
      </td>
      <td class="py-3.5 px-5">
        <span class="px-2.5 py-1 rounded-full text-[10px] font-bold ${
          archived
            ? "bg-surface-container-high text-secondary"
            : technician.active
              ? "bg-emerald-100 text-emerald-800"
              : "bg-surface-container-high text-secondary"
        }">${archived ? "Diarsipkan" : technician.active ? "Bertugas" : "Standby"}</span>
      </td>
      <td class="py-3.5 px-5 is-num font-bold text-on-surface">${active}</td>
      <td class="py-3.5 px-5 is-num text-secondary">${done}</td>
      <td class="py-3.5 px-5">
        <span class="flex flex-wrap gap-1">
          ${visibleSkills
            .map(
              (skill) =>
                `<span class="px-2 py-0.5 rounded-full bg-surface-container text-[10px] font-semibold text-on-surface">${escapeHtml(skill)}</span>`
            )
            .join("")}
          ${extraSkills > 0 ? `<span class="px-2 py-0.5 rounded-full bg-surface-container text-[10px] font-semibold text-secondary">+${extraSkills}</span>` : ""}
        </span>
      </td>
      <td class="py-3.5 px-5 is-action">
        <span class="inline-flex items-center justify-end gap-2">
          <button type="button" class="px-3 py-1.5 rounded-full bg-surface-container text-primary font-bold hover:bg-surface-container-high transition" data-action="tech-detail" data-tech="${escapeHtml(technician.id)}">Detail</button>
          ${
            archived
              ? `<button type="button" class="px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700 font-bold hover:bg-emerald-200 transition" data-action="restore-tech" data-tech="${escapeHtml(technician.id)}">Pulihkan</button>`
              : `<button type="button" class="px-3 py-1.5 rounded-full bg-tertiary-fixed text-tertiary font-bold hover:brightness-95 transition" data-action="edit-tech" data-tech="${escapeHtml(technician.id)}">Edit</button>`
          }
        </span>
      </td>
    </tr>`;
}

/** Personil yang sedang tampil di tabel (mengikuti pencarian & filter). */
export function filteredTechnicians() {
  const query = state.techQuery || "";
  const teamValue = state.techTeamFilter || "all";
  const statusValue = state.techStatusFilter || "all";

  const teamOrder = new Map(TEAMS.map((team, index) => [team.id, index]));
  return state.technicians
    .filter((technician) => {
      if (teamValue !== "all" && technician.teamId !== teamValue) return false;

      // Arsip hanya tampil saat filter statusnya dipilih secara eksplisit.
      if (statusValue === "archived") {
        return Boolean(technician.archived) && matchesTechnicianQuery(technician, query);
      }
      if (technician.archived) return false;
      if (statusValue === "active" && !technician.active) return false;
      if (statusValue === "standby" && technician.active) return false;
      return matchesTechnicianQuery(technician, query);
    })
    .sort(
      (a, b) =>
        (teamOrder.get(a.teamId) ?? 99) - (teamOrder.get(b.teamId) ?? 99) ||
        Number(b.active) - Number(a.active) ||
        a.name.localeCompare(b.name)
    );
}

export function renderTechnicianTable() {
  const body = byId("technician-table-body");
  if (!body) return;

  const teamFilter = byId("tech-team-filter");
  if (teamFilter && !teamFilter.options.length) {
    teamFilter.innerHTML =
      `<option value="all">Semua tim</option>` +
      TEAMS.map(
        (team) => `<option value="${escapeHtml(team.id)}">${escapeHtml(team.short)}</option>`
      ).join("");
  }

  const filtered = filteredTechnicians();

  body.innerHTML = filtered.length
    ? filtered.map(technicianRow).join("")
    : `<tr><td colspan="6" class="py-10 px-5 text-center text-secondary text-xs">Tidak ada personil yang cocok dengan pencarian atau filter.</td></tr>`;

  const visible = byId("tech-visible-count");
  if (visible) visible.textContent = String(filtered.length);
}

export function renderTechnicians() {
  const teams = teamWorkload();
  const container = byId("technician-team-list");
  if (container) container.innerHTML = teams.map(teamCard).join("");

  const roster = state.technicians.filter((technician) => !technician.archived);
  const total = roster.length;
  const active = roster.filter((technician) => technician.active).length;
  const assigned = teams.reduce((sum, team) => sum + team.tickets.length, 0);

  document.querySelectorAll("[data-tech-summary]").forEach((element) => {
    const key = element.dataset.techSummary;
    if (key === "total") element.textContent = `${total} Personil`;
    if (key === "active") element.textContent = `${active} Siaga`;
    if (key === "teams") element.textContent = `${teams.length} Tim Spesialis`;
    if (key === "tickets") element.textContent = `${assigned} tiket aktif`;
  });

  renderTechnicianTable();
  renderAnalytics();
}

function assignmentRole(report, technicianId) {
  const entry = assignmentRoster(report, state.technicians).find(
    (item) => item.techId === technicianId
  );
  if (entry) return entry.role;
  return report.assignee === technicianId ? "PIC" : "Pendukung";
}

function technicianDetailMarkup(technician) {
  const team = TEAM_BY_ID[technician.teamId];
  const tickets = technicianTickets(technician.id);
  const active = activeTickets(technician.id);
  const done = doneTickets(technician.id);
  const archived = Boolean(technician.archived);

  return `
    <div class="flex items-start gap-4">
      <div class="w-14 h-14 rounded-2xl bg-primary-fixed text-primary flex items-center justify-center font-display font-bold text-xl shrink-0">
        ${escapeHtml(technician.name.slice(0, 2).toUpperCase())}
      </div>
      <div class="min-w-0">
        <h3 class="text-lg font-bold text-on-surface font-display">${escapeHtml(technician.title)}</h3>
        <p class="text-xs text-secondary">${escapeHtml(technician.role)} • ${escapeHtml(team?.name || "Tanpa tim")}</p>
        <div class="flex flex-wrap items-center gap-2 mt-2">
          <span class="px-2.5 py-1 rounded-full text-[10px] font-bold ${archived ? "bg-surface-container-high text-secondary" : technician.active ? "bg-emerald-100 text-emerald-800" : "bg-surface-container-high text-secondary"}">
            ${archived ? "Diarsipkan" : technician.active ? "Sedang Bertugas" : "Standby"}
          </span>
          <span class="px-2.5 py-1 rounded-full bg-surface-container text-[10px] font-semibold text-secondary">${active.length} tiket aktif</span>
          <span class="px-2.5 py-1 rounded-full bg-surface-container text-[10px] font-semibold text-secondary">${done.length} selesai</span>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5 text-xs">
      <div class="rounded-xl bg-surface-container-low p-3">
        <p class="text-[10px] uppercase tracking-wider text-secondary font-bold">Kontak</p>
        <p class="font-semibold text-on-surface mt-1">${escapeHtml(technician.phone)}</p>
      </div>
      <div class="rounded-xl bg-surface-container-low p-3">
        <p class="text-[10px] uppercase tracking-wider text-secondary font-bold">Zona kerja</p>
        <p class="font-semibold text-on-surface mt-1">${escapeHtml(team?.zone || "-")}</p>
      </div>
      <div class="rounded-xl bg-surface-container-low p-3">
        <p class="text-[10px] uppercase tracking-wider text-secondary font-bold">Beban aktif</p>
        <p class="font-semibold text-on-surface mt-1">${active.length} tiket berjalan</p>
      </div>
      <div class="rounded-xl bg-surface-container-low p-3">
        <p class="text-[10px] uppercase tracking-wider text-secondary font-bold">Penyelesaian</p>
        <p class="font-semibold text-on-surface mt-1">${done.length} tiket selesai</p>
      </div>
      <div class="rounded-xl bg-surface-container-low p-3 sm:col-span-2">
        <p class="text-[10px] uppercase tracking-wider text-secondary font-bold">Keahlian</p>
        <div class="flex flex-wrap gap-1.5 mt-2">
          ${(technician.skills || [])
            .map((skill) => `<span class="px-2.5 py-1 rounded-full bg-white border border-surface-container-high text-[10px] font-semibold text-on-surface">${escapeHtml(skill)}</span>`)
            .join("")}
        </div>
      </div>
    </div>

    <div class="mt-5">
      <div class="flex items-center justify-between gap-2">
        <p class="text-xs font-bold text-on-surface">Tiket Ditangani</p>
        <span class="text-[11px] text-secondary">${active.length} aktif • ${done.length} selesai</span>
      </div>
      <div class="mt-2 space-y-2 max-h-48 overflow-y-auto pr-1">
        ${
          tickets.length
            ? tickets
                .map(
                  (report) => `
              <button type="button" class="w-full text-left rounded-xl border border-surface-container-high p-3 hover:bg-surface-container-low transition" data-action="open-detail" data-ticket="${escapeHtml(report.id)}">
                <div class="flex items-center justify-between gap-2">
                  <span class="text-[10px] font-bold text-primary">${escapeHtml(report.id)}</span>
                  <span class="flex items-center gap-1.5">
                    <span class="px-2 py-0.5 rounded-full bg-surface-container text-[9px] font-bold text-secondary">${escapeHtml(assignmentRole(report, technician.id))}</span>
                    <span class="text-[10px] font-semibold ${report.status === "done" ? "text-emerald-700" : report.status === "waiting" ? "text-amber-700" : "text-tertiary"}">${escapeHtml(report.status)}</span>
                  </span>
                </div>
                <p class="text-xs font-semibold text-on-surface truncate mt-1">${escapeHtml(report.title)}</p>
                <p class="text-[10px] text-secondary mt-0.5">${escapeHtml(report.location)} • ${escapeHtml(formatDateTime(report.updatedAt))}</p>
              </button>`
                )
                .join("")
            : `<p class="text-xs text-secondary rounded-xl bg-surface-container-low p-3">Belum ada tiket yang ditugaskan ke teknisi ini.</p>`
        }
      </div>
    </div>

    ${
      technician.active && active.length
        ? `<p class="mt-3 text-[11px] text-amber-700 bg-amber-50 rounded-xl p-3 leading-relaxed">Teknisi masih memegang ${active.length} tiket aktif. Selesaikan atau pindahkan tiket terlebih dahulu sebelum mengubah status ke standby.</p>`
        : ""
    }

    ${
      archived
        ? `<p class="mt-3 text-[11px] text-secondary bg-surface-container-low rounded-xl p-3 leading-relaxed">Teknisi ini diarsipkan. Riwayat tiket tetap tersimpan dan tidak lagi muncul di roster aktif maupun pilihan disposisi.</p>`
        : ""
    }

    <div class="flex flex-wrap items-center justify-between gap-2 mt-5 pt-4 border-t border-surface-container-high">
      <div class="flex flex-wrap gap-2">
        ${
          archived
            ? `<button type="button" class="h-10 px-4 rounded-full bg-emerald-100 text-emerald-800 hover:bg-emerald-200 text-xs font-bold transition" data-action="restore-tech" data-tech="${escapeHtml(technician.id)}">Pulihkan Teknisi</button>`
            : `<button type="button" class="h-10 px-4 rounded-full text-xs font-bold ${technician.active ? "bg-amber-100 text-amber-800 hover:bg-amber-200" : "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"} transition" data-action="toggle-tech-duty" data-tech="${escapeHtml(technician.id)}">
                ${technician.active ? "Set ke Standby" : "Aktifkan Bertugas"}
              </button>
              <button type="button" class="h-10 px-4 rounded-full bg-surface-container text-on-surface text-xs font-bold hover:bg-surface-container-high transition" data-action="edit-tech" data-tech="${escapeHtml(technician.id)}">Edit Data</button>
              <button type="button" class="h-10 px-4 rounded-full bg-red-100 text-red-700 hover:bg-red-200 text-xs font-bold transition" data-action="remove-tech" data-tech="${escapeHtml(technician.id)}">Hapus</button>`
        }
      </div>
      <button type="button" class="h-10 px-4 rounded-full bg-surface-container text-on-surface text-xs font-bold hover:bg-surface-container-high transition" data-action="close-modal">Tutup</button>
    </div>`;
}

export function openTechnicianDetail(technicianId) {
  const technician = state.technicians.find((item) => item.id === technicianId);
  const body = byId("technician-detail-body");
  const modal = byId("modal-technician");
  if (!technician || !body || !modal) return;

  body.dataset.tech = technician.id;
  body.innerHTML = technicianDetailMarkup(technician);
  openModal(modal);
}

export function toggleTechnicianDuty(technicianId) {
  const technician = state.technicians.find((item) => item.id === technicianId);
  if (!technician) return;

  if (technician.archived) {
    showToast(
      "Teknisi Diarsipkan",
      `${technician.title} harus dipulihkan terlebih dahulu sebelum status siaganya diubah.`,
      "error"
    );
    return;
  }

  if (technician.active) {
    const active = activeTickets(technician.id);
    if (active.length) {
      showToast(
        "Tidak Bisa Standby",
        `${technician.title} masih menangani ${active.length} tiket aktif. Selesaikan atau pindahkan tiket terlebih dahulu.`,
        "error"
      );
      return;
    }
  }

  technician.active = !technician.active;
  renderTechnicians();

  const body = byId("technician-detail-body");
  if (body && body.dataset.tech === technician.id) {
    body.innerHTML = technicianDetailMarkup(technician);
  }

  showToast(
    technician.active ? "Teknisi Diaktifkan" : "Teknisi Standby",
    `${technician.title} sekarang ${technician.active ? "bertugas" : "standby"}.`,
    "success"
  );
}

function refreshTechnicianViews() {
  renderTechnicians();
  renderReports();
}

/** Pastikan satu tim selalu memiliki koordinator bila masih ada personil. */
function promoteReplacementCoordinator(teamId) {
  const members = state.technicians.filter(
    (technician) => technician.teamId === teamId && !technician.archived
  );
  if (members.some((technician) => technician.role === "Koordinator")) return;
  const replacement = members.find((technician) => technician.active) || members[0];
  if (replacement) replacement.role = "Koordinator";
}

function parseSkills(value) {
  return Array.from(
    new Set(
      String(value || "")
        .split(",")
        .map((skill) => skill.trim())
        .filter(Boolean)
    )
  ).slice(0, 12);
}

export function openTechnicianForm(technicianId) {
  const form = byId("technician-form");
  const modal = byId("modal-technician-form");
  if (!form || !modal) return;

  const technician = technicianId
    ? state.technicians.find((item) => item.id === technicianId)
    : null;

  if (technician?.archived) {
    showToast(
      "Teknisi Diarsipkan",
      "Pulihkan teknisi terlebih dahulu sebelum mengubah datanya.",
      "error"
    );
    return;
  }

  form.reset();

  const teamSelect = byId("tech-form-team");
  if (teamSelect) {
    teamSelect.innerHTML = TEAMS.map(
      (team) => `<option value="${escapeHtml(team.id)}">${escapeHtml(team.name)}</option>`
    ).join("");
  }

  byId("tech-form-id").value = technician?.id || "";
  byId("tech-form-name").value = technician?.name || "";
  byId("tech-form-title").value = technician?.title || "";
  if (teamSelect) teamSelect.value = technician?.teamId || TEAMS[0].id;
  byId("tech-form-role").value = ROLE_OPTIONS.includes(technician?.role)
    ? technician.role
    : "Teknisi";
  byId("tech-form-phone").value = technician?.phone || "";
  byId("tech-form-skills").value = (technician?.skills || []).join(", ");
  byId("tech-form-active").value = technician
    ? technician.active
      ? "active"
      : "standby"
    : "active";

  byId("technician-form-title").textContent = technician
    ? "Edit Data Teknisi"
    : "Tambah Teknisi";
  byId("technician-form-subtitle").textContent = technician
    ? `Perbarui profil ${technician.title} dan penempatan timnya.`
    : "Lengkapi data personil baru untuk tim lapangan Sarpras.";
  byId("tech-form-submit").textContent = technician
    ? "Simpan Perubahan"
    : "Tambah Teknisi";

  const detail = byId("modal-technician");
  if (detail && !detail.hidden) closeModal(detail);
  openModal(modal);
}

export function handleTechnicianFormSubmit(event) {
  event.preventDefault();

  const id = byId("tech-form-id").value.trim();
  const name = byId("tech-form-name").value.trim();
  const title = byId("tech-form-title").value.trim() || name;
  const teamId = byId("tech-form-team").value;
  const roleValue = byId("tech-form-role").value;
  const phone = byId("tech-form-phone").value.trim();
  const skills = parseSkills(byId("tech-form-skills").value);
  const wantsActive = byId("tech-form-active").value === "active";
  const team = TEAM_BY_ID[teamId];
  const role = ROLE_OPTIONS.includes(roleValue) ? roleValue : "Teknisi";

  if (!name) {
    showToast("Nama Wajib Diisi", "Masukkan nama pendek teknisi terlebih dahulu.", "error");
    return;
  }
  if (!team) {
    showToast("Tim Tidak Valid", "Pilih tim penempatan teknisi.", "error");
    return;
  }

  const existing = id
    ? state.technicians.find((technician) => technician.id === id)
    : null;

  if (id && !existing) {
    showToast("Teknisi Tidak Ditemukan", "Data teknisi sudah berubah. Muat ulang halaman.", "error");
    return;
  }
  if (existing?.archived) {
    showToast(
      "Teknisi Diarsipkan",
      "Pulihkan teknisi terlebih dahulu sebelum mengubah datanya.",
      "error"
    );
    return;
  }

  if (existing && existing.active && !wantsActive && activeTickets(existing.id).length) {
    showToast(
      "Tidak Bisa Standby",
      `${existing.title} masih menangani ${activeTickets(existing.id).length} tiket aktif. Selesaikan atau pindahkan tiket terlebih dahulu.`,
      "error"
    );
    return;
  }

  const previous = existing
    ? { teamId: existing.teamId, role: existing.role }
    : null;

  const technician =
    existing ||
    ({
      id: nextTechnicianId(name, state.technicians),
      archived: false,
    });

  technician.name = name;
  technician.title = title;
  technician.teamId = team.id;
  technician.role = role;
  technician.phone = phone || "-";
  technician.skills = skills;
  technician.active = wantsActive;

  if (!existing) state.technicians.push(technician);

  // Hanya satu koordinator aktif per tim.
  if (role === "Koordinator") {
    state.technicians.forEach((other) => {
      if (
        other.id !== technician.id &&
        other.teamId === team.id &&
        other.role === "Koordinator" &&
        !other.archived
      ) {
        other.role = "Teknisi";
      }
    });
  }

  // Bila koordinator lama pindah tim atau turun jabatan, angkat pengganti.
  if (
    previous?.role === "Koordinator" &&
    (previous.teamId !== team.id || role !== "Koordinator")
  ) {
    promoteReplacementCoordinator(previous.teamId);
  }

  closeModal(byId("modal-technician-form"));
  refreshTechnicianViews();

  showToast(
    existing ? "Data Teknisi Diperbarui" : "Teknisi Ditambahkan",
    existing
      ? `${technician.title} kini tercatat di ${team.short}.`
      : `${technician.title} ditambahkan ke ${team.short}${technician.active ? "" : " (standby)"}.`,
    "success"
  );
}

export function removeTechnician(technicianId) {
  const technician = state.technicians.find((item) => item.id === technicianId);
  if (!technician || technician.archived) return;

  const active = activeTickets(technician.id);
  if (active.length) {
    showToast(
      "Tidak Bisa Dihapus",
      `${technician.title} masih menangani ${active.length} tiket aktif. Selesaikan atau pindahkan tiket terlebih dahulu.`,
      "error"
    );
    return;
  }

  if (technician.role === "Koordinator") {
    const replacement =
      state.technicians.find(
        (other) =>
          other.id !== technician.id &&
          other.teamId === technician.teamId &&
          !other.archived &&
          other.active
      ) ||
      state.technicians.find(
        (other) =>
          other.id !== technician.id &&
          other.teamId === technician.teamId &&
          !other.archived
      );

    if (!replacement) {
      showToast(
        "Koordinator Belum Ada Pengganti",
        "Tambahkan atau aktifkan personil lain di tim ini sebelum menghapus koordinator.",
        "error"
      );
      return;
    }

    replacement.role = "Koordinator";
    technician.role = "Teknisi";
  }

  const referenced = state.reports.some((report) =>
    ticketInvolves(report, technician.id)
  );

  closeModal(byId("modal-technician"));
  closeModal(byId("modal-technician-form"));

  if (referenced) {
    // Pertahankan data agar riwayat tiket & analitik tidak kehilangan nama.
    technician.archived = true;
    technician.active = false;
    refreshTechnicianViews();
    showToast(
      "Teknisi Diarsipkan",
      `${technician.title} tidak lagi tampil di roster aktif. Riwayat tiketnya tetap tersimpan.`,
      "success"
    );
    return;
  }

  state.technicians = state.technicians.filter((item) => item.id !== technician.id);
  refreshTechnicianViews();
  showToast(
    "Teknisi Dihapus",
    `${technician.title} dihapus permanen karena belum memiliki riwayat tiket.`,
    "success"
  );
}

export function restoreTechnician(technicianId) {
  const technician = state.technicians.find((item) => item.id === technicianId);
  if (!technician || !technician.archived) return;

  technician.archived = false;
  technician.active = false;

  // Kembali ke tampilan roster utama agar teknisi yang dipulihkan langsung terlihat.
  state.techStatusFilter = "all";
  const statusFilter = byId("tech-status-filter");
  if (statusFilter) statusFilter.value = "all";

  refreshTechnicianViews();

  const body = byId("technician-detail-body");
  if (body && body.dataset.tech === technician.id) {
    body.innerHTML = technicianDetailMarkup(technician);
  }

  showToast(
    "Teknisi Dipulihkan",
    `${technician.title} kembali ke roster sebagai standby. Aktifkan saat siap bertugas.`,
    "success"
  );
}
