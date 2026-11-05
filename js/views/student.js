/* ==========================================================================
   views/student.js — Navigasi panel portal mahasiswa & identitas sesi
   ========================================================================== */

import { $$ } from "../core/dom.js";
import { activeStudent, state } from "../core/state.js";
import { toggleStudentSidebar } from "../ui/sidebar.js";
import { renderStudentReports, renderStudentSummary } from "../features/reports.js";

/** Tiga menu mahasiswa; nilai lain jatuh kembali ke Ringkasan. */
const STUDENT_TABS = ["summary", "complaints", "help"];

export function setStudentTab(tab) {
  const next = STUDENT_TABS.includes(tab) ? tab : "summary";
  toggleStudentSidebar(false);
  state.studentTab = next;

  // Mode hapus riwayat hanya berlaku selama berada di panel Pengaduan Saya.
  if (next !== "complaints" && state.historyDeleteMode) {
    state.historyDeleteMode = false;
    state.historySelection.clear();
  }

  $$(".cc-panel[id^='panel-student-']").forEach((panel) => {
    panel.classList.toggle("is-active", panel.id === `panel-student-${next}`);
  });

  $$("[data-student-tab]").forEach((button) => {
    const isActive = button.dataset.studentTab === next;
    button.classList.toggle("is-active", isActive);
    if (button.classList.contains("seg-tab")) {
      button.setAttribute("aria-current", isActive ? "page" : "false");
    }
  });

  renderStudentIdentity();

  if (next === "summary") renderStudentSummary();
  if (next === "complaints") renderStudentReports();
  window.scrollTo({ top: 0, behavior: "auto" });
}

/** Menyalin profil mahasiswa aktif ke seluruh elemen header & ringkasan. */
export function renderStudentIdentity() {
  const student = activeStudent();
  const initials = student.name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join("")
    .toUpperCase();

  $$("[data-student-name]").forEach((element) => {
    element.textContent = student.name;
  });
  $$("[data-student-meta]").forEach((element) => {
    element.textContent = `Mahasiswa • ${student.faculty}`;
  });
  $$("[data-student-initials]").forEach((element) => {
    element.textContent = initials;
  });
  $$("[data-student-nim]").forEach((element) => {
    element.textContent = student.nim;
  });
}
