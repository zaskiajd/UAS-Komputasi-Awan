/* ==========================================================================
   views/student.js — Navigasi panel dashboard mahasiswa
   ========================================================================== */

import { $$ } from "../core/dom.js";
import { state } from "../core/state.js";
import { renderStudentReports } from "../features/reports.js";

export function setStudentTab(tab) {
  state.studentTab = tab;

  $$(".cc-panel[id^='panel-student-']").forEach((panel) => {
    panel.classList.toggle("is-active", panel.id === `panel-student-${tab}`);
  });

  $$("[data-student-tab]").forEach((button) => {
    const isActive = button.dataset.studentTab === tab;
    button.classList.toggle("is-active", isActive);
    if (button.classList.contains("seg-tab")) {
      button.setAttribute("aria-current", isActive ? "page" : "false");
    }
  });

  if (tab === "complaints") renderStudentReports();
  window.scrollTo({ top: 0, behavior: "auto" });
}
