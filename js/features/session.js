/* ==========================================================================
   features/session.js — Masuk & keluar sesi autentikasi
   ========================================================================== */

import { byId } from "../core/dom.js";
import { state } from "../core/state.js";
import { setView } from "../core/router.js";
import { showToast } from "../ui/toast.js";
import { setStudentTab } from "../views/student.js";
import { setAdminTab } from "../views/admin.js";
import { setAuthTab, clearFieldError, clearLoginError } from "../views/auth.js";
import { renderReports } from "./reports.js";
import { closeDrawers } from "../ui/sidebar.js";
import { clearToken } from "../core/api.js";
import { seedReports } from "../data/reports.js";

/**
 * Menyelesaikan proses login sukses:
 * Menyimpan data pengguna ke state dan mengarahkan ke dashboard yang sesuai (admin / mahasiswa).
 */
export function handleAuthSuccess(user) {
  state.role = user.role;
  state.student =
    user.role === "student"
      ? { name: user.name, nim: user.nim, faculty: user.faculty, email: user.email }
      : null;
  loginAs(user.role, { name: user.name });
}

export function loginAs(role, options = {}) {
  closeDrawers();
  state.role = role;

  if (role === "admin") {
    setAdminTab("dashboard");
    setView("admin");
    const review = state.reports.filter((report) => report.status === "review").length;
    const urgent = state.reports.filter(
      (report) => report.urgent && report.status !== "done"
    ).length;
    showToast(
      "Portal Admin Sarpras Aktif",
      `Selamat bertugas, ${options.name || "Admin Sarpras"}. ${review} tiket menunggu verifikasi • ${urgent} urgent.`,
      "success"
    );
  } else {
    setStudentTab("summary");
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

export function logout(options = {}) {
  clearToken();
  state.student = null;
  state.role = "public";
  state.reports = seedReports(); // buang data tiket milik sesi sebelumnya
  setView("auth");
  setAuthTab("login");
  state.studentFilter = "all";
  state.adminFilter = "all";
  state.dispatchFilter = "all";
  state.inventoryFilter = "all";
  state.studentQuery = "";
  state.adminQuery = "";
  state.dispatchQuery = "";
  state.inventoryQuery = "";
  state.selectedTicket = null;

  clearFieldError();
  clearLoginError();

  const studentSearch = byId("student-search");
  const adminSearch = byId("admin-search");
  const dispatchSearch = byId("dispatch-search");
  const inventorySearch = byId("inventory-search");
  if (studentSearch) studentSearch.value = "";
  if (adminSearch) adminSearch.value = "";
  if (dispatchSearch) dispatchSearch.value = "";
  if (inventorySearch) inventorySearch.value = "";
  renderReports();

  const loginEmail = byId("login-email");
  if (loginEmail) loginEmail.value = "";
  const loginPassword = byId("login-password");
  if (loginPassword) loginPassword.value = "";

  if (options.silent !== true) {
    showToast(
      options.title || "Sesi Diakhiri",
      options.message || "Anda telah keluar dari portal CampusCare secara aman.",
      options.variant || "info"
    );
  }
}
