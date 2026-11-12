/* ==========================================================================
   features/tickets-api.js — Sinkronisasi tiket antara frontend dan backend
   --------------------------------------------------------------------------
   Backend (/api/tickets) adalah sumber data. state.reports hanya salinan di
   memori yang diisi dari API setelah login.
   ========================================================================== */

import { apiRequest } from "../core/api.js";
import { todayLabel } from "../core/dom.js";
import { state } from "../core/state.js";
import { showToast } from "../ui/toast.js";

const refOf = (report) =>
  report.ticketId !== undefined && report.ticketId !== null
    ? String(report.ticketId)
    : encodeURIComponent(report.id);

/** Menyamakan objek tiket dari API dengan bentuk yang dipakai renderer frontend. */
export function normalizeTicket(ticket) {
  return {
    assignedAt: null,
    assignments: [],
    instructions: [],
    notes: [],
    history: [],
    ...ticket,
    date: todayLabel(ticket.createdAt),
  };
}

/** Ambil semua tiket (+ detail: riwayat, catatan, penugasan) ke state.reports. Pemanggil yang merender ulang. */
export async function loadTickets() {
  const items = await apiRequest("/tickets?limit=100");
  const detailed = await Promise.all(
    items.map(async (item) => {
      try {
        return await apiRequest(`/tickets/${refOf(item)}`);
      } catch (error) {
        return item; // detail gagal dimuat: pakai data ringkas
      }
    })
  );
  state.reports = detailed.map(normalizeTicket);
}

/** Muat tiket; kegagalan ditampilkan sebagai toast dan tidak menghentikan login. */
export async function loadTicketsSafely() {
  try {
    await loadTickets();
  } catch (error) {
    showToast("Gagal Memuat Pengaduan", error.message || "Data pengaduan tidak dapat dimuat.", "error");
  }
}

export async function createTicketRequest(payload) {
  const ticket = await apiRequest("/tickets", { method: "POST", body: payload });
  return normalizeTicket(ticket);
}

export function updateStatusRequest(report, status, { progress, note } = {}) {
  return apiRequest(`/tickets/${refOf(report)}/status`, {
    method: "PATCH",
    body: {
      status,
      ...(progress !== undefined ? { progress } : {}),
      ...(note ? { note } : {}),
    },
  });
}

export function deleteTicketRequest(report) {
  return apiRequest(`/tickets/${refOf(report)}`, { method: "DELETE" });
}
