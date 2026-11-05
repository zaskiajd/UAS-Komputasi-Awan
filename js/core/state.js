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
  historyDeleteMode: false, // mode pilih riwayat pada Pengaduan Saya
  historySelection: new Set(), // id tiket yang dipilih untuk dihapus
};

/** Profil mahasiswa aktif. Sebelum sesi login memakai akun demo pemilik tiket seed. */
export const DEMO_STUDENT = {
  name: "Ahmad Rizki",
  nim: "217006120",
  faculty: "Teknik Informatika",
  email: "217006120@student.unsil.ac.id",
};

export const activeStudent = () => state.student || DEMO_STUDENT;

let reportSequence = 916;

export function nextReportId() {
  return `#CC-2026-${String(reportSequence++).padStart(4, "0")}`;
}

export function resetReportSequence() {
  reportSequence = 916;
}
