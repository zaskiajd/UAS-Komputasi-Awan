/* ==========================================================================
   features/complaint.js — Pengaduan baru dari mahasiswa
   ========================================================================== */

import { byId, nowLabel } from "../core/dom.js";
import { activeStudent, nextReportId, state } from "../core/state.js";
import { SLA_HOURS } from "../data/reports.js";
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
  const priorityInput = byId("complaint-priority").value;
  const description = byId("complaint-desc").value.trim();
  const student = activeStudent();
  const now = new Date();
  const priority = priorityInput === "Tinggi" ? "Tinggi" : priorityInput === "Rendah" ? "Rendah" : "Sedang";

  const newReport = {
    id: nextReportId(),
    title: title || description.slice(0, 80),
    reporter: `${student.name} (Mhs • ${student.nim})`,
    owner: student.nim,
    location: `${building} • ${room}`,
    cat: CATEGORY_MAP[categoryLabel] || "ac",
    status: "review",
    urgent: priorityInput === "Tinggi",
    priority,
    date: nowLabel(),
    team: null,
    teamId: null,
    assignee: null,
    assignedAt: null,
    assignments: [],
    instructions: [],
    progress: 0,
    description,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    completedAt: null,
    slaDueAt: new Date(
      now.getTime() + SLA_HOURS[priority] * 60 * 60 * 1000
    ).toISOString(),
    notes: [],
    history: [
      {
        at: now.toISOString(),
        label: "Pengaduan diterima",
        actor: student.name,
        status: "review",
        note: "Laporan masuk ke antrean verifikasi Biro Sarpras.",
      },
    ],
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
