/* ==========================================================================
   features/technicians-api.js — Sinkronisasi manajemen teknisi dengan backend
   --------------------------------------------------------------------------
   Backend (/api/technicians, admin-only) adalah sumber data sejak fitur
   ini dipersistenkan. state.technicians hanya salinan di memori yang
   diisi dari API setelah admin login.
   ========================================================================== */

import { apiRequest } from "../core/api.js";
import { state } from "../core/state.js";
import { showToast } from "../ui/toast.js";

const refOf = (technician) =>
  technician.id !== undefined && technician.id !== null
    ? encodeURIComponent(technician.id)
    : encodeURIComponent(technician);

/** Menyamakan objek teknisi dari API dengan bentuk yang dipakai renderer frontend. */
export function normalizeTechnician(technician) {
  return {
    archived: false,
    active: true,
    phone: "",
    skills: [],
    activeTicketCount: 0,
    doneTicketCount: 0,
    totalTicketCount: 0,
    ...technician,
    title: technician.title || technician.name,
    phone: technician.phone || "",
  };
}

/** Ambil seluruh teknisi (aktif + arsip) ke state.technicians. Pemanggil yang merender ulang. */
export async function loadTechnicians() {
  const items = await apiRequest("/technicians");
  state.technicians = (items || []).map(normalizeTechnician);
}

/** Muat teknisi; kegagalan ditampilkan sebagai toast dan tidak menghentikan login. */
export async function loadTechniciansSafely() {
  try {
    await loadTechnicians();
  } catch (error) {
    showToast("Gagal Memuat Teknisi", error.message || "Data teknisi tidak dapat dimuat.", "error");
  }
}

export async function createTechnicianRequest(payload) {
  const technician = await apiRequest("/technicians", { method: "POST", body: payload });
  return normalizeTechnician(technician);
}

export async function updateTechnicianRequest(technician, payload) {
  const updated = await apiRequest(`/technicians/${refOf(technician)}`, {
    method: "PATCH",
    body: payload,
  });
  return normalizeTechnician(updated);
}

export async function setDutyRequest(technician, active) {
  const updated = await apiRequest(`/technicians/${refOf(technician)}/duty`, {
    method: "POST",
    body: { active: Boolean(active) },
  });
  return normalizeTechnician(updated);
}

export async function archiveTechnicianRequest(technician) {
  const updated = await apiRequest(`/technicians/${refOf(technician)}/archive`, { method: "POST" });
  return normalizeTechnician(updated);
}

export async function restoreTechnicianRequest(technician) {
  const updated = await apiRequest(`/technicians/${refOf(technician)}/restore`, { method: "POST" });
  return normalizeTechnician(updated);
}

export function deleteTechnicianRequest(technician) {
  return apiRequest(`/technicians/${refOf(technician)}`, { method: "DELETE" });
}
