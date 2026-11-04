/* ==========================================================================
   features/complaint.js — Pengaduan baru dari mahasiswa
   ========================================================================== */

import { byId, nowLabel } from "../core/dom.js";
import { nextReportId, state } from "../core/state.js";
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

export function handleComplaintSubmit(event) {
  event.preventDefault();

  const title = byId("complaint-title").value.trim();
  const categoryLabel = byId("complaint-category").value;
  const building = byId("complaint-building").value;
  const room = byId("complaint-room").value.trim();
  const priority = byId("complaint-priority").value;
  const description = byId("complaint-desc").value.trim();

  const newReport = {
    id: nextReportId(),
    title: title || description.slice(0, 80),
    reporter: "Ahmad Rizki (Mhs • 217006120)",
    location: `${building} • ${room}`,
    cat: CATEGORY_MAP[categoryLabel] || "ac",
    status: "review",
    urgent: priority === "Tinggi",
    date: nowLabel(),
    team: null,
    progress: 0,
    description,
  };

  state.reports.unshift(newReport);

  closeModal(byId("modal-complaint"));
  event.target.reset();

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
