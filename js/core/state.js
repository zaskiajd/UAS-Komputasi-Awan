/* ==========================================================================
   core/state.js — State aplikasi
   --------------------------------------------------------------------------
   Kode tiket tidak lagi dibuat di frontend: backend menerbitkan
   #CC-<tahun>-NNNN lewat sequence database.
   ========================================================================== */

export const state = {
  view: "public",
  role: "public", // public | student | admin
  publicTab: "overview", // overview | services | guide | help
  authRole: "student", // peran yang sedang dipilih di gerbang login
  authTab: "login",
  studentTab: "summary",
  adminTab: "dashboard",
  studentFilter: "all",
  adminFilter: "all",
  dispatchFilter: "all",
  inventoryFilter: "all",
  assetStatusFilter: "active",
  techTeamFilter: "all",
  techStatusFilter: "all",
  studentQuery: "",
  adminQuery: "",
  dispatchQuery: "",
  inventoryQuery: "",
  techQuery: "",
  reports: [], // diisi dari API setelah login
  technicians: [], // diisi dari API setelah admin login
  assets: [], // diisi dari API setelah admin login
  student: null, // { name, nim, faculty, email }
  selectedTicket: null,
  historyDeleteMode: false, // mode pilih riwayat pada Pengaduan Saya
  historySelection: new Set(), // id tiket yang dipilih untuk dihapus
};

/** Profil mahasiswa aktif. Kosong sebelum login — semua panel mahasiswa
 * hanya dirender setelah state.student terisi dari backend. */
export const activeStudent = () => state.student || { name: "", nim: "", faculty: "", email: "" };
