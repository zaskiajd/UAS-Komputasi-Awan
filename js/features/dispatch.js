/* ==========================================================================
   features/dispatch.js — Disposisi tiket ke teknisi (admin)
   ========================================================================== */

import { byId, escapeHtml } from "../core/dom.js";
import { state } from "../core/state.js";
import { closeModal, openModal } from "../ui/modal.js";
import { showToast } from "../ui/toast.js";
import { renderReports } from "./reports.js";

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

export function openDispatch(ticketId) {
  fillDispatchOptions(ticketId);

  const report = state.reports.find((item) => item.id === ticketId);
  const priority = byId("dispatch-priority");
  if (report && priority) priority.value = report.urgent ? "Tinggi" : "Sedang";

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

  const team = byId("dispatch-team").value;
  const priority = byId("dispatch-priority").value;

  report.status = "progress";
  report.team = `${team} (${priority})`;
  report.progress = report.progress && report.progress > 0 ? report.progress : 35;
  report.urgent = priority === "Tinggi";

  closeModal(byId("modal-dispatch"));
  event.target.reset();
  renderReports();

  showToast(
    "Disposisi Diterbitkan!",
    `Tiket ${report.id} berhasil ditugaskan ke ${team}.`,
    "success"
  );
}
