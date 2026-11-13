/* ==========================================================================
   features/dispatch.js — Disposisi tiket ke teknisi (admin)
   ========================================================================== */

import { byId, escapeHtml } from "../core/dom.js";
import { state } from "../core/state.js";
import {
  activeTicketCount,
  leastLoadedTechnician,
  nextInstructionId,
} from "../data/assignments.js";
import { SLA_HOURS } from "../data/reports.js";
import { TEAMS, TEAM_BY_ID } from "../data/technicians.js";
import { closeModal, openModal } from "../ui/modal.js";
import { showToast } from "../ui/toast.js";
import { renderReports } from "./reports.js";
import { renderTechnicians } from "./technicians.js";
import { updateStatusRequest } from "./tickets-api.js";

const ADMIN_NAME = "Ir. Hendrawan";

/** Saran tim berdasarkan kategori tiket agar disposisi lebih cepat. */
const TEAM_FOR_CATEGORY = {
  ac: "electrical",
  electrical: "electrical",
  projector: "av",
  network: "network",
  sanitation: "civil",
  furniture: "civil",
  lift: "civil",
};

/** Mengisi pilihan tiket yang masih menunggu disposisi. */
export function fillDispatchOptions(selectedId) {
  const select = byId("ticket-select");
  if (!select) return;

  const queue = state.reports.filter((report) => report.status === "review");

  select.innerHTML = queue.length
    ? queue
        .map(
          (report) =>
            `<option value="${escapeHtml(report.id)}">${escapeHtml(report.id)} — ${escapeHtml(
              report.title
            )}${report.urgent ? " (Urgent)" : ""}</option>`
        )
        .join("")
    : `<option value="">Tidak ada tiket yang menunggu disposisi</option>`;

  if (selectedId && queue.some((report) => report.id === selectedId)) {
    select.value = selectedId;
  }
}

/** Mengisi pilihan tim dari data master agar ID tim selalu konsisten. */
export function fillTeamOptions() {
  const select = byId("dispatch-team");
  if (!select) return;
  select.innerHTML = TEAMS.map(
    (team) => `<option value="${escapeHtml(team.id)}">${escapeHtml(team.name)}</option>`
  ).join("");
}

function teamTechnicians(teamId) {
  const team = TEAM_BY_ID[teamId] || TEAMS[0];
  return state.technicians.filter(
    (technician) => technician.teamId === team.id && !technician.archived
  );
}

/**
 * Mengisi pilihan PIC untuk tim terpilih.
 * Teknisi standby tidak ditampilkan, dan default dipilih dari beban tiket
 * paling ringan (load balancing) agar tidak selalu menunjuk orang pertama.
 */
export function fillAssigneeOptions(teamId, preferredTechId) {
  const select = byId("dispatch-assignee");
  const hint = byId("dispatch-assignee-hint");
  const submit = byId("dispatch-submit");
  if (!select) return;

  const members = teamTechnicians(teamId);
  const active = members.filter((technician) => technician.active);

  if (!active.length) {
    select.innerHTML = `<option value="">Tidak ada teknisi aktif di tim ini</option>`;
    select.disabled = true;
    if (submit) submit.disabled = true;
    if (hint) {
      hint.textContent =
        "Belum ada personil aktif. Aktifkan minimal satu teknisi di Manajemen Teknisi sebelum mengirim disposisi.";
      hint.className = "text-[11px] text-red-600 mt-1 leading-relaxed";
    }
    renderDispatchSupport();
    return;
  }

  const sorted = active
    .slice()
    .sort(
      (a, b) =>
        activeTicketCount(a.id, state.reports) - activeTicketCount(b.id, state.reports) ||
        a.name.localeCompare(b.name)
    );

  select.disabled = false;
  if (submit) submit.disabled = false;
  select.innerHTML = sorted
    .map((technician) => {
      const load = activeTicketCount(technician.id, state.reports);
      return `<option value="${escapeHtml(technician.id)}">${escapeHtml(
        technician.title
      )} — ${escapeHtml(technician.role)} • ${load} tiket aktif</option>`;
    })
    .join("");

  const preferred = sorted.find((technician) => technician.id === preferredTechId);
  select.value = (preferred || sorted[0]).id;

  if (hint) {
    const chosen = preferred || sorted[0];
    hint.textContent = `${active.length} dari ${members.length} personil siap bertugas. ${chosen.title} dipilih karena beban tiket paling ringan.`;
    hint.className = "text-[11px] text-secondary mt-1 leading-relaxed";
  }

  renderDispatchSupport();
}

/** Daftar teknisi pendukung aktif selain PIC yang sedang dipilih. */
export function renderDispatchSupport() {
  const container = byId("dispatch-support-list");
  if (!container) return;

  const teamId = byId("dispatch-team")?.value || TEAMS[0].id;
  const assigneeId = byId("dispatch-assignee")?.value || "";
  const available = teamTechnicians(teamId).filter(
    (technician) => technician.active && technician.id !== assigneeId
  );

  if (!available.length) {
    container.innerHTML = `<p class="text-[11px] text-secondary rounded-xl bg-surface-container-low p-3">Tidak ada teknisi pendukung aktif pada tim ini.</p>`;
    return;
  }

  container.innerHTML = available
    .map((technician) => {
      const load = activeTicketCount(technician.id, state.reports);
      return `
        <label class="flex items-center justify-between gap-3 rounded-xl border border-surface-container-high px-3 py-2 cursor-pointer hover:bg-surface-container transition-colors">
          <span class="flex items-center gap-2 min-w-0">
            <input type="checkbox" class="rounded border-surface-container-high text-primary-container focus:ring-primary-container" value="${escapeHtml(technician.id)}">
            <span class="min-w-0">
              <span class="block text-[11px] font-bold text-on-surface truncate">${escapeHtml(technician.title)}</span>
              <span class="block text-[10px] text-secondary">${escapeHtml(technician.role)} • ${load} tiket aktif</span>
            </span>
          </span>
          <span class="text-[10px] font-semibold text-secondary shrink-0">Pendukung</span>
        </label>`;
    })
    .join("");
}

/** Dipanggil saat tim atau PIC berubah dari event global. */
export function refreshDispatchTechnicians(teamId, preferredTechId) {
  fillAssigneeOptions(teamId, preferredTechId);
}

export function openDispatch(ticketId) {
  fillDispatchOptions(ticketId);
  fillTeamOptions();

  const report = state.reports.find((item) => item.id === ticketId);
  const teamSelect = byId("dispatch-team");
  const suggestedTeam = report ? TEAM_FOR_CATEGORY[report.cat] : null;
  if (teamSelect && suggestedTeam && TEAM_BY_ID[suggestedTeam]) {
    teamSelect.value = suggestedTeam;
  }

  const priority = byId("dispatch-priority");
  if (report && priority) priority.value = report.urgent ? "Tinggi" : "Sedang";

  const note = byId("dispatch-note");
  if (note) note.value = "";

  fillAssigneeOptions(teamSelect?.value || TEAMS[0].id, report?.assignee);
  openModal(byId("modal-dispatch"));
}

export function handleDispatchSubmit(event) {
  event.preventDefault();

  const select = byId("ticket-select");
  if (!select || !select.value) {
    showToast("Tidak Ada Tiket", "Antrean disposisi sedang kosong.", "error");
    return;
  }

  const report = state.reports.find((item) => item.id === select.value);
  if (!report) return;

  const teamId = byId("dispatch-team").value;
  const team = TEAM_BY_ID[teamId] || TEAMS[0];
  const priority = byId("dispatch-priority").value;
  const note = byId("dispatch-note").value.trim();
  const assigneeId = byId("dispatch-assignee")?.value || "";
  let assignee = state.technicians.find((technician) => technician.id === assigneeId);

  // Jaga konsistensi bila pilihan PIC tidak lagi cocok dengan tim terpilih.
  if (!assignee || assignee.teamId !== team.id || !assignee.active) {
    assignee = leastLoadedTechnician(team.id, state.technicians, state.reports);
  }

  if (!assignee) {
    showToast(
      "Belum Ada Teknisi Aktif",
      "Aktifkan minimal satu teknisi pada tim ini sebelum mengirim disposisi.",
      "error"
    );
    return;
  }

  const supportIds = Array.from(
    document.querySelectorAll("#dispatch-support-list input[type='checkbox']:checked")
  ).map((input) => input.value);
  const supporters = supportIds
    .map((id) => state.technicians.find((technician) => technician.id === id))
    .filter(
      (technician) =>
        technician &&
        technician.active &&
        technician.teamId === team.id &&
        technician.id !== assignee.id
    );

  const now = new Date();
  const nowIso = now.toISOString();

  report.assignments = Array.isArray(report.assignments) ? report.assignments : [];
  report.assignments.forEach((entry) => {
    if (entry.status === "active") entry.status = "replaced";
  });
  report.assignments.push({
    techId: assignee.id,
    role: "PIC",
    assignedAt: nowIso,
    assignedBy: ADMIN_NAME,
    status: "active",
  });
  supporters.forEach((technician) => {
    report.assignments.push({
      techId: technician.id,
      role: "Pendukung",
      assignedAt: nowIso,
      assignedBy: ADMIN_NAME,
      status: "active",
    });
  });

  report.status = "progress";
  report.teamId = team.id;
  report.team = team.name;
  report.assignee = assignee.id;
  report.assignedAt = nowIso;
  report.priority = priority;
  report.urgent = priority === "Tinggi";
  report.progress = report.progress && report.progress > 0 ? report.progress : 35;
  report.updatedAt = nowIso;
  report.slaDueAt = new Date(
    now.getTime() + SLA_HOURS[priority] * 60 * 60 * 1000
  ).toISOString();

  const supportLabel = supporters.length
    ? ` Pendukung: ${supporters.map((technician) => technician.title).join(", ")}.`
    : "";
  const defaultNote = `Prioritas ${priority}, target SLA ${SLA_HOURS[priority]} jam. PIC ${assignee.title}.${supportLabel}`;

  report.history = report.history || [];
  report.history.push({
    at: nowIso,
    label: `Disposisi ke ${team.name} — ${assignee.title}`,
    actor: ADMIN_NAME,
    status: "progress",
    note: note || defaultNote,
  });

  if (note) {
    report.instructions = report.instructions || [];
    report.instructions.push({
      id: nextInstructionId(),
      at: nowIso,
      from: ADMIN_NAME,
      toTechId: assignee.id,
      text: note,
      readAt: null,
    });
    report.history.push({
      at: nowIso,
      label: `Instruksi terarah ke ${assignee.title}`,
      actor: ADMIN_NAME,
      status: "progress",
      note,
    });
  }

  // Simpan status, tim, PIC, pendukung, prioritas, dan instruksi disposisi ke backend.
  updateStatusRequest(report, "progress", {
    progress: report.progress,
    teamId: team.id,
    assignee: assignee.id,
    supporters: supporters.map((technician) => technician.id),
    priority,
    note: note || defaultNote,
    ...(note ? { instruction: note } : {}),
  }).catch((error) => {
    if (error.status !== 409) {
      showToast("Status Belum Tersimpan", error.message || "Disposisi hanya tersimpan sementara.", "error");
    }
  });

  closeModal(byId("modal-dispatch"));
  event.target.reset();
  fillDispatchOptions();
  fillAssigneeOptions(byId("dispatch-team")?.value || TEAMS[0].id);
  renderReports();
  renderTechnicians();

  showToast(
    "Disposisi Diterbitkan!",
    `Tiket ${report.id} ditugaskan ke ${assignee.title}${
      supporters.length ? ` (+${supporters.length} pendukung)` : ""
    }.`,
    "success"
  );
}
