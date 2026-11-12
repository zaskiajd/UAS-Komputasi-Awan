/* ==========================================================================
   features/complaint.js — Pengaduan baru dari mahasiswa
   ========================================================================== */

import { byId } from "../core/dom.js";
import { state } from "../core/state.js";
import { ApiError } from "../core/api.js";
import { createTicketRequest } from "./tickets-api.js";
import { closeModal } from "../ui/modal.js";
import { showToast } from "../ui/toast.js";
import { renderReports } from "./reports.js";
import { setStudentTab } from "../views/student.js";

const CATEGORY_MAP = {
  "Kelistrikan & AC": "ac",
  "Proyektor & Audio": "projector",
  "Jaringan Wi-Fi": "network",
  "Sanitasi / Toilet": "sanitation",
  "Meja / Kursi Kuliah": "furniture",
  "Lift / Akses Gedung": "lift",
};

export async function handleComplaintSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const submit = form.querySelector('[type="submit"]');

  const title = byId("complaint-title").value.trim();
  const categoryLabel = byId("complaint-category").value;
  const building = byId("complaint-building").value;
  const room = byId("complaint-room").value.trim();
  const priorityInput = byId("complaint-priority").value;
  const description = byId("complaint-desc").value.trim();
  const priority = priorityInput === "Tinggi" ? "Tinggi" : priorityInput === "Rendah" ? "Rendah" : "Sedang";

  if (submit) submit.disabled = true;
  let newReport;
  try {
    // Pemilik, status, SLA, dan riwayat awal diisi server dari token.
    newReport = await createTicketRequest({
      title: title || description.slice(0, 80),
      category: CATEGORY_MAP[categoryLabel] || "ac",
      building,
      room,
      priority,
      description,
    });
  } catch (error) {
    const first = error instanceof ApiError && error.errors ? Object.values(error.errors)[0] : "";
    showToast(
      "Pengaduan Gagal Dikirim",
      first || (error instanceof ApiError ? error.message : "Terjadi kesalahan. Coba lagi."),
      "error"
    );
    return;
  } finally {
    if (submit) submit.disabled = false;
  }

  state.reports.unshift(newReport);

  closeModal(byId("modal-complaint"));
  form.reset();

  state.studentFilter = "all";
  document.querySelectorAll("[data-student-filter]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.studentFilter === "all");
  });

  renderReports();
  setStudentTab("complaints");

  showToast(
    "Pengaduan Terkirim!",
    `Tiket ${newReport.id} masuk antrean verifikasi tim Sarpras.`,
    "success"
  );
}
