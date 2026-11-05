/* ==========================================================================
   events.js — Delegasi event global & pemetaan data-action
   ========================================================================== */

import { $$, byId } from "./core/dom.js";
import { state } from "./core/state.js";
import { setView } from "./core/router.js";
import { STATUS_META } from "./data/reports.js";
import { closeMenus } from "./ui/menu.js";
import { closeModal, openModal } from "./ui/modal.js";
import { closeDrawers, toggleSidebar, toggleStudentSidebar } from "./ui/sidebar.js";
import { showToast } from "./ui/toast.js";
import {
  clearFieldError,
  evaluatePassword,
  setAuthRole,
  setAuthTab,
  showFieldError,
  togglePasswordVisibility,
} from "./views/auth.js";
import { setStudentTab } from "./views/student.js";
import { setAdminTab } from "./views/admin.js";
import { loginAs, logout } from "./features/session.js";
import { handleDispatchSubmit, openDispatch } from "./features/dispatch.js";
import { handleComplaintSubmit } from "./features/complaint.js";
import { trackReport } from "./features/timeline.js";
import { renderAdminTickets, renderStudentReports } from "./features/reports.js";

/** Menjalankan aksi berdasarkan atribut `data-action` pada elemen. */
function handleAction(actionElement) {
  const action = actionElement.dataset.action;

  switch (action) {
    case "open-student-login":
      setAuthRole("student");
      setAuthTab("login");
      setView("auth");
      break;

    case "open-admin-login":
      setAuthRole("admin");
      setAuthTab("login");
      setView("auth");
      break;

    case "back-public":
      setView("public");
      break;

    case "auth-tab":
      setAuthTab(actionElement.dataset.tab);
      break;

    case "auth-role":
      setAuthRole(actionElement.dataset.role);
      break;

    case "toggle-password":
      togglePasswordVisibility(actionElement);
      break;

    case "toggle-menu": {
      const menu = byId(actionElement.dataset.menu);
      if (!menu) break;
      const willOpen = menu.hidden;
      closeMenus(menu);
      menu.hidden = !willOpen;
      actionElement.setAttribute("aria-expanded", String(willOpen));
      break;
    }

    case "close-modal": {
      const modal = actionElement.closest(".cc-modal");
      if (modal) closeModal(modal);
      break;
    }

    case "open-sso-help":
      closeMenus();
      openModal(byId("modal-sso-help"));
      break;

    case "open-complaint":
      closeMenus();
      openModal(byId("modal-complaint"));
      break;

    case "open-dispatch":
    case "open-dispatch-modal":
      closeMenus();
      toggleSidebar(false);
      openDispatch();
      break;

    case "quick-assign":
      closeMenus();
      openDispatch(actionElement.dataset.ticket);
      break;

    case "track-report":
      trackReport(actionElement.dataset.ticket);
      break;

    case "open-detail": {
      const report = state.reports.find((item) => item.id === actionElement.dataset.ticket);
      closeMenus();
      if (report) {
        showToast(
          `Detail ${report.id}`,
          `${report.title} • Status: ${STATUS_META[report.status].label}`,
          "info"
        );
      }
      break;
    }

    case "google-login":
      showToast("Google Workspace SSO", "Menghubungkan ke layanan OAuth2 UNSIL...", "info");
      setTimeout(() => {
        if (state.view === "auth") loginAs("student");
      }, 1100);
      break;

    case "export":
      showToast(
        "Menyiapkan Ekspor",
        "Rekap Sarpras UNSIL sedang dibuat dalam format PDF/XLS.",
        "success"
      );
      break;

    case "notify":
      showToast("Notifikasi", actionElement.dataset.note || "Tidak ada notifikasi baru.", "info");
      break;

    case "show-lock-info":
      showToast(
        "Hak Akses Terverifikasi",
        "Sesi Anda terikat SSO UNSIL dengan enkripsi 256-bit.",
        "info"
      );
      break;

    case "switch-role":
      loginAs(actionElement.dataset.role);
      break;

    case "logout":
      closeDrawers();
      logout();
      break;

    case "toggle-sidebar":
      toggleSidebar(true);
      break;

    case "close-sidebar":
      toggleSidebar(false);
      break;

    case "toggle-student-sidebar":
      toggleStudentSidebar(true);
      break;

    case "close-student-sidebar":
      toggleStudentSidebar(false);
      break;

    case "demo":
      toggleSidebar(false);
      showToast(
        "Mode Prototipe",
        actionElement.dataset.note || "Fitur ini akan terhubung ke backend pada tahap berikutnya.",
        "info"
      );
      break;

    default:
      break;
  }
}

function bindStudentFilter(button) {
  state.studentFilter = button.dataset.studentFilter;
  $$("[data-student-filter]").forEach((element) => {
    element.classList.toggle("is-active", element.dataset.studentFilter === state.studentFilter);
  });
  renderStudentReports();
}

function bindAdminFilter(button) {
  state.adminFilter = button.dataset.adminFilter;
  $$(".filter-chip[data-admin-filter]").forEach((element) => {
    element.classList.toggle("is-active", element.dataset.adminFilter === state.adminFilter);
  });
  renderAdminTickets();
}

/** Memasang seluruh listener global setelah partial HTML siap. */
export function bindEvents() {
  /* Delegasi klik global */
  document.addEventListener("click", (event) => {
    const actionElement = event.target.closest("[data-action]");
    if (actionElement) {
      handleAction(actionElement);
      if (actionElement.dataset.action !== "toggle-menu") closeMenus();
    }

    const studentTabButton = event.target.closest("[data-student-tab]");
    if (studentTabButton) {
      setStudentTab(studentTabButton.dataset.studentTab);
    }

    const adminTabButton = event.target.closest("[data-admin-tab]");
    if (adminTabButton) {
      setAdminTab(adminTabButton.dataset.adminTab);
    }

    const studentFilterButton = event.target.closest("[data-student-filter]");
    if (studentFilterButton) bindStudentFilter(studentFilterButton);

    const adminFilterButton = event.target.closest("[data-admin-filter]");
    if (adminFilterButton) bindAdminFilter(adminFilterButton);

    /* Tutup menu saat klik di luar */
    if (!event.target.closest(".cc-menu") && !event.target.closest("[data-action='toggle-menu']")) {
      closeMenus();
    }
  });

  /* Modal backdrop */
  $$(".cc-modal").forEach((modal) => {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeModal(modal);
    });
  });

  /* Escape */
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeDrawers();
    const openModals = $$(".cc-modal.is-open");
    if (openModals.length) {
      closeModal(openModals[openModals.length - 1]);
    } else {
      closeMenus();
    }
  });

  /* Pencarian */
  const studentSearch = byId("student-search");
  if (studentSearch) {
    studentSearch.addEventListener("input", (event) => {
      state.studentQuery = event.target.value;
      renderStudentReports();
    });
  }

  const adminSearch = byId("admin-search");
  if (adminSearch) {
    adminSearch.addEventListener("input", (event) => {
      state.adminQuery = event.target.value;
      renderAdminTickets();
    });
  }

  /* Password strength */
  const regPassword = byId("reg-password");
  if (regPassword) {
    regPassword.addEventListener("input", (event) => {
      evaluatePassword(event.target.value);
      clearFieldError();
    });
  }
  const regConfirm = byId("reg-confirm");
  if (regConfirm) {
    regConfirm.addEventListener("input", clearFieldError);
  }

  /* Login */
  const loginForm = byId("login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const email = byId("login-email").value.trim();
      loginAs(state.role, { name: email ? email.split("@")[0] : "" });
    });
  }

  /* Registrasi */
  const registerForm = byId("register-form");
  if (registerForm) {
    registerForm.addEventListener("submit", (event) => {
      event.preventDefault();
      clearFieldError();

      const password = byId("reg-password").value;
      const confirm = byId("reg-confirm").value;
      const email = byId("reg-email").value.trim();
      const name = byId("reg-name").value.trim();

      if (password.length < 8) {
        showFieldError(byId("reg-password"), "Kata sandi minimal 8 karakter.");
        return;
      }

      if (password !== confirm) {
        showFieldError(byId("reg-confirm"), "Konfirmasi kata sandi tidak cocok.");
        return;
      }

      const loginEmail = byId("login-email");
      if (loginEmail) loginEmail.value = email;

      registerForm.reset();
      evaluatePassword("");
      setAuthTab("login");
      setAuthRole("student");

      showToast(
        "Pendaftaran Berhasil!",
        `Akun ${name || "mahasiswa"} siap digunakan. Silakan masuk dengan akun SSO Anda.`,
        "success"
      );
    });
  }

  /* Pengaduan */
  const complaintForm = byId("complaint-form");
  if (complaintForm) {
    complaintForm.addEventListener("submit", handleComplaintSubmit);
  }

  /* Disposisi */
  const dispatchForm = byId("dispatch-form");
  if (dispatchForm) {
    dispatchForm.addEventListener("submit", handleDispatchSubmit);
  }

  /* Histogram hover */
  $$("#histogram-container div").forEach((bar) => {
    bar.addEventListener("mouseenter", () => {
      bar.style.opacity = "1";
    });
    bar.addEventListener("mouseleave", () => {
      if (!bar.classList.contains("bg-brand-orange")) {
        bar.style.removeProperty("opacity");
      }
    });
  });
}
