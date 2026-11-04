/* ==========================================================================
   features/timeline.js — Pelacakan tiket pada panel timeline
   ========================================================================== */

import { byId } from "../core/dom.js";
import { state } from "../core/state.js";
import { STATUS_META } from "../data/reports.js";
import { showToast } from "../ui/toast.js";
import { setStudentTab } from "../views/student.js";

export function trackReport(ticketId) {
  const report = state.reports.find((item) => item.id === ticketId);
  if (!report) return;

  const idElement = byId("timeline-ticket-id");
  const titleElement = byId("timeline-ticket-title");
  if (idElement) idElement.textContent = report.id;
  if (titleElement) titleElement.textContent = report.title;

  setStudentTab("timeline");
  showToast(
    "Pelacakan Tiket",
    `Menampilkan progres ${report.id} • ${STATUS_META[report.status].label}.`,
    "info"
  );
}
