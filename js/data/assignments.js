/* ==========================================================================
   data/assignments.js — Helper penugasan tiket (PIC + teknisi pendukung)
   Semua fungsi murni: menerima report/technicians sebagai argumen agar aman
   dipakai lintas fitur tanpa ketergantungan melingkar.
   ========================================================================== */

import { technicianById } from "./technicians.js";

const INACTIVE_ASSIGNMENT = new Set(["replaced", "removed"]);

/** Penugasan yang masih relevan (PIC & pendukung aktif/riwayat selesai). */
export function currentAssignments(report) {
  const list = Array.isArray(report?.assignments)
    ? report.assignments.filter((entry) => !INACTIVE_ASSIGNMENT.has(entry.status))
    : [];

  if (list.length) return list;

  // Kompatibilitas data lama yang hanya memiliki satu field `assignee`.
  if (report?.assignee) {
    return [
      {
        techId: report.assignee,
        role: "PIC",
        assignedAt: report.assignedAt || report.updatedAt || report.createdAt,
        assignedBy: "Ir. Hendrawan",
        status: report.status === "done" ? "done" : "active",
      },
    ];
  }

  return [];
}

/** Penugasan aktif yang sudah dilengkapi data teknisi. */
export function assignmentRoster(report, technicians = []) {
  return currentAssignments(report)
    .map((entry) => ({
      ...entry,
      technician: technicianById(entry.techId, technicians),
    }))
    .filter((entry) => entry.technician)
    .sort((a, b) => {
      if (a.role === "PIC" && b.role !== "PIC") return -1;
      if (b.role === "PIC" && a.role !== "PIC") return 1;
      return new Date(a.assignedAt || 0) - new Date(b.assignedAt || 0);
    });
}

export function primaryAssignee(report, technicians = []) {
  const roster = assignmentRoster(report, technicians);
  return (
    roster.find((entry) => entry.role === "PIC")?.technician ||
    technicianById(report?.assignee, technicians)
  );
}

export function supportAssignments(report, technicians = []) {
  return assignmentRoster(report, technicians).filter((entry) => entry.role !== "PIC");
}

/** True bila teknisi terlibat sebagai PIC maupun pendukung. */
export function ticketInvolves(report, techId) {
  if (!report || !techId) return false;
  if (report.assignee === techId) return true;
  return currentAssignments(report).some((entry) => entry.techId === techId);
}

/** Jumlah tiket belum selesai yang melibatkan teknisi. */
export function activeTicketCount(techId, reports = []) {
  return reports.filter(
    (report) => report.status !== "done" && ticketInvolves(report, techId)
  ).length;
}

/** Pilih teknisi aktif dengan beban tiket paling sedikit (load balancing). */
export function leastLoadedTechnician(teamId, technicians = [], reports = []) {
  const pool = technicians.filter(
    (technician) =>
      technician.teamId === teamId && technician.active && !technician.archived
  );
  if (!pool.length) return null;

  return pool
    .slice()
    .sort(
      (a, b) =>
        activeTicketCount(a.id, reports) - activeTicketCount(b.id, reports) ||
        a.name.localeCompare(b.name)
    )[0];
}

/** ID unik untuk instruksi terarah. */
export function nextInstructionId() {
  return `INS-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;
}
