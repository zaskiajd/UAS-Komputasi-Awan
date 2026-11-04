/* ==========================================================================
   features/session.js — Masuk & keluar sesi (demo)
   ========================================================================== */

import { byId } from "../core/dom.js";
import { state } from "../core/state.js";
import { setView } from "../core/router.js";
import { showToast } from "../ui/toast.js";
import { setStudentTab } from "../views/student.js";
import { setAdminTab } from "../views/admin.js";
import { setAuthTab } from "../views/auth.js";
import { renderReports } from "./reports.js";

export function loginAs(role, options = {}) {
  state.role = role;

  if (role === "admin") {
    setAdminTab("dashboard");
    setView("admin");
    showToast(
      "Portal Admin Sarpras Aktif",
      "Selamat bertugas, Ir. Hendrawan. 9 tiket menunggu verifikasi.",
      "success"
    );
  } else {
    setStudentTab("dashboard");
    setView("student");
    showToast(
      "Portal Mahasiswa Aktif",
      options.name
        ? `Selamat datang, ${options.name}. Pantau laporan fasilitas Anda di sini.`
        : "Selamat datang kembali. Pantau laporan fasilitas Anda di sini.",
      "success"
    );
  }
}

export function logout() {
  setView("auth");
  setAuthTab("login");
  state.studentFilter = "all";
  state.adminFilter = "all";
  state.studentQuery = "";
  state.adminQuery = "";

  const studentSearch = byId("student-search");
  const adminSearch = byId("admin-search");
  if (studentSearch) studentSearch.value = "";
  if (adminSearch) adminSearch.value = "";
  renderReports();

  const loginEmail = byId("login-email");
  if (loginEmail) loginEmail.value = "";
  const loginPassword = byId("login-password");
  if (loginPassword) loginPassword.value = "";

  showToast("Sesi Diakhiri", "Anda telah keluar dari portal CampusCare secara aman.", "info");
}
