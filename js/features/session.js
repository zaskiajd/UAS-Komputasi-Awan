/* ==========================================================================
   features/session.js — Masuk & keluar sesi mahasiswa / admin
   Validasi kredensial dilakukan di sini: mahasiswa wajib @student.unsil.ac.id,
   admin wajib @unsil.ac.id (bukan akun mahasiswa), sandi minimal 8 karakter.
   ========================================================================== */

import { byId } from "../core/dom.js";
import { DEMO_STUDENT, activeStudent, state } from "../core/state.js";
import { setView } from "../core/router.js";
import { showToast } from "../ui/toast.js";
import { closeDrawers } from "../ui/sidebar.js";
import { setStudentTab } from "../views/student.js";
import { setAdminTab } from "../views/admin.js";
import { clearLoginError, setAuthRole, setAuthTab, showLoginError } from "../views/auth.js";
import { renderReports } from "./reports.js";

const STUDENT_DOMAIN = "@student.unsil.ac.id";
const ADMIN_DOMAIN = "@unsil.ac.id";

/**
 * Memeriksa kredensial sesuai peran.
 * @returns {{field: string, message: string}|null} null bila valid.
 */
export function validateCredentials(role, email, password) {
  const normalized = String(email || "").trim().toLowerCase();

  if (!normalized) {
    return { field: "login-email", message: "Email kampus wajib diisi." };
  }

  if (role === "student") {
    if (!normalized.endsWith(STUDENT_DOMAIN)) {
      return {
        field: "login-email",
        message: `Mahasiswa masuk dengan email NIM${STUDENT_DOMAIN}.`,
      };
    }
  } else {
    if (normalized.endsWith(STUDENT_DOMAIN)) {
      return {
        field: "login-email",
        message: "Akun mahasiswa tidak berlaku di gerbang admin. Gunakan email @unsil.ac.id.",
      };
    }
    if (!normalized.endsWith(ADMIN_DOMAIN)) {
      return {
        field: "login-email",
        message: "Admin Sarpras masuk dengan email berdomain @unsil.ac.id.",
      };
    }
  }

  if (String(password || "").length < 8) {
    return { field: "login-password", message: "Kata sandi minimal 8 karakter." };
  }

  return null;
}

/** Profil mahasiswa dari sesi registrasi atau akun demo pemilik tiket seed. */
function studentProfile(email) {
  const nim = email.split("@")[0].trim();
  const registered =
    state.accounts[email] || Object.values(state.accounts).find((account) => account.nim === nim);

  if (registered) {
    return {
      name: registered.name,
      nim: registered.nim,
      faculty: registered.faculty,
      email,
    };
  }

  if (nim === DEMO_STUDENT.nim) {
    return { ...DEMO_STUDENT, email };
  }

  return { name: `Mahasiswa ${nim}`, nim, faculty: "Mahasiswa UNSIL", email };
}

/** Membuka portal; login divalidasi di loginAs, registrasi mengaktifkan sesi mahasiswa. */
export function openPortal(role, options = {}) {
  state.role = role;
  closeDrawers();

  if (role === "admin") {
    setAdminTab("dashboard");
    setView("admin");
    const review = state.reports.filter((report) => report.status === "review").length;
    const urgent = state.reports.filter(
      (report) => report.urgent && report.status !== "done"
    ).length;
    showToast(
      "Portal Admin Sarpras Aktif",
      options.message ||
        `Selamat bertugas, Ir. Hendrawan. ${review} tiket menunggu verifikasi • ${urgent} urgent.`,
      "success"
    );
    return;
  }

  setStudentTab("summary");
  setView("student");
  showToast(
    "Portal Mahasiswa Aktif",
    options.message ||
      `Selamat datang, ${activeStudent().name}. Pantau laporan fasilitas Anda di sini.`,
    "success"
  );
}

/**
 * Masuk ke portal setelah kredensial peran tersebut divalidasi.
 */
export function loginAs(role, options = {}) {
  const email = String(options.email || "").trim().toLowerCase();
  const password = String(options.password || "");

  if (role !== "student" && role !== "admin") return false;
  const problem = validateCredentials(role, email, password);
  if (problem) {
    showLoginError(problem.message, byId(problem.field));
    return false;
  }

  if (role === "student" && email) {
    state.student = studentProfile(email);
  }

  openPortal(role, options);
  return true;
}

export function logout() {
  closeDrawers();

  state.role = "public";
  state.student = null;
  state.studentFilter = "all";
  state.adminFilter = "all";
  state.dispatchFilter = "all";
  state.inventoryFilter = "all";
  state.studentQuery = "";
  state.adminQuery = "";
  state.dispatchQuery = "";
  state.inventoryQuery = "";
  state.selectedTicket = null;

  const studentSearch = byId("student-search");
  const adminSearch = byId("admin-search");
  const dispatchSearch = byId("dispatch-search");
  const inventorySearch = byId("inventory-search");
  if (studentSearch) studentSearch.value = "";
  if (adminSearch) adminSearch.value = "";
  if (dispatchSearch) dispatchSearch.value = "";
  if (inventorySearch) inventorySearch.value = "";

  const loginEmail = byId("login-email");
  const loginPassword = byId("login-password");
  if (loginEmail) loginEmail.value = "";
  if (loginPassword) loginPassword.value = "";
  clearLoginError();

  setAuthRole("student");
  setAuthTab("login");
  renderReports();
  setView("public");

  showToast("Sesi Diakhiri", "Anda telah keluar dari portal CampusCare secara aman.", "info");
}
