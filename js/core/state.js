/* ==========================================================================
   core/state.js — State aplikasi & penomoran tiket
   ========================================================================== */

export const state = {
  view: "auth",
  role: "student",
  authTab: "login",
  studentTab: "dashboard",
  adminTab: "dashboard",
  studentFilter: "all",
  adminFilter: "all",
  studentQuery: "",
  adminQuery: "",
  reports: [],
};

let reportSequence = 916;

export function nextReportId() {
  return `#CC-2026-${String(reportSequence++).padStart(4, "0")}`;
}

export function resetReportSequence() {
  reportSequence = 916;
}
