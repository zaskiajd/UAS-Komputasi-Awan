/* ==========================================================================
   core/state.js — State aplikasi & penomoran tiket
   ========================================================================== */

export const state = {
  view: "public",
  role: "public", // public | student | admin
  authRole: "student", // peran yang sedang dipilih di gerbang login
  authTab: "login",
  studentTab: "summary",
  adminTab: "dashboard",
  studentFilter: "all",
  adminFilter: "all",
  studentQuery: "",
  adminQuery: "",
  reports: [],
  student: null, // { name, nim, faculty, email }
  accounts: {}, // akun mahasiswa yang dibuat selama sesi berlangsung
  selectedTicket: null,
};

let reportSequence = 916;

export function nextReportId() {
  return `#CC-2026-${String(reportSequence++).padStart(4, "0")}`;
}

export function resetReportSequence() {
  reportSequence = 916;
}
