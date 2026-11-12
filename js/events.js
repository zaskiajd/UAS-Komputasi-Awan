/* ==========================================================================
   events.js — Delegasi event global & pemetaan data-action
   ========================================================================== */

import { $$, byId } from "./core/dom.js";
import { state } from "./core/state.js";
import { setView } from "./core/router.js";
import { closeMenus } from "./ui/menu.js";
import { closeModal, openModal } from "./ui/modal.js";
import { closeDrawers, toggleSidebar, toggleStudentSidebar } from "./ui/sidebar.js";
import { showToast } from "./ui/toast.js";
import {
  clearFieldError,
  clearLoginError,
  evaluatePassword,
  setAuthRole,
  setAuthTab,
  setButtonLoading,
  setOnAuthSuccess,
  showFieldError,
  showLoginError,
  togglePasswordVisibility,
  triggerGoogleLogin,
} from "./views/auth.js";
import { setStudentTab } from "./views/student.js";
import { setAdminTab } from "./views/admin.js";
import { handleAuthSuccess, logout } from "./features/session.js";
import { ApiError, loginRequest, registerRequest } from "./core/api.js";
import { loadTicketsSafely } from "./features/tickets-api.js";
import {
  handleDispatchSubmit,
  openDispatch,
  refreshDispatchTechnicians,
} from "./features/dispatch.js";
import { handleComplaintSubmit } from "./features/complaint.js";
import { trackReport } from "./features/timeline.js";
import {
  cancelHistoryDelete,
  executeHistoryDelete,
  openHistoryDeleteConfirm,
  renderAdminTickets,
  renderDispatchList,
  renderReports,
  renderStudentReports,
  toggleHistoryDeleteMode,
  toggleHistorySelection,
  toggleSelectAllHistory,
} from "./features/reports.js";
import {
  addTicketSupport,
  changeTicketPic,
  handleInstructionSubmit,
  handleTicketNoteSubmit,
  openTicketDetail,
  removeTicketSupport,
  updateTicketStatus,
} from "./features/ticket-actions.js";
import {
  handleTechnicianFormSubmit,
  openTechnicianDetail,
  openTechnicianForm,
  removeTechnician,
  renderTechnicians,
  restoreTechnician,
  toggleTechnicianDuty,
} from "./features/technicians.js";
import {
  confirmAssetAction,
  handleAssetFormSubmit,
  markAssetServiced,
  openAssetDetail,
  openAssetForm,
  renderInventory,
  requestAssetArchive,
  requestAssetDelete,
  restoreAsset,
} from "./features/inventory.js";
import { handleExport } from "./features/export.js";

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

    case "google-login":
      triggerGoogleLogin();
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

    case "open-operation-guide":
      closeMenus();
      toggleSidebar(false);
      openModal(byId("modal-operation-guide"));
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

    case "close-ticket-detail": {
      const detail = byId("student-detail-card");
      if (detail) {
        detail.hidden = true;
        delete detail.dataset.ticket;
      }
      state.selectedTicket = null;
      break;
    }

    case "delete-history":
      toggleHistoryDeleteMode();
      break;

    case "toggle-history-select":
      toggleHistorySelection(actionElement.dataset.ticket);
      break;

    case "select-all-history":
      toggleSelectAllHistory();
      break;

    case "cancel-delete-history":
      cancelHistoryDelete();
      break;

    case "confirm-delete-history":
      openHistoryDeleteConfirm();
      break;

    case "execute-delete-history":
      executeHistoryDelete();
      break;

    case "open-detail": {
      const report = state.reports.find((item) => item.id === actionElement.dataset.ticket);
      closeMenus();
      if (report) openTicketDetail(report.id);
      break;
    }

    case "ticket-status":
      updateTicketStatus(actionElement.dataset.ticket, actionElement.dataset.status);
      break;

    case "save-pic":
      changeTicketPic(actionElement.dataset.ticket);
      break;

    case "add-support":
      addTicketSupport(actionElement.dataset.ticket);
      break;

    case "remove-support":
      removeTicketSupport(actionElement.dataset.ticket, actionElement.dataset.tech);
      break;

    case "tech-detail":
      closeMenus();
      openTechnicianDetail(actionElement.dataset.tech);
      break;

    case "add-tech":
      closeMenus();
      openTechnicianForm();
      break;

    case "edit-tech":
      closeMenus();
      openTechnicianForm(actionElement.dataset.tech);
      break;

    case "remove-tech":
      removeTechnician(actionElement.dataset.tech);
      break;

    case "restore-tech":
      restoreTechnician(actionElement.dataset.tech);
      break;

    case "toggle-tech-duty":
      toggleTechnicianDuty(actionElement.dataset.tech);
      break;

    case "asset-detail":
      closeMenus();
      openAssetDetail(actionElement.dataset.asset);
      break;

    case "asset-service":
      markAssetServiced(actionElement.dataset.asset);
      break;

    case "add-asset":
      closeMenus();
      openAssetForm();
      break;

    case "edit-asset":
      closeMenus();
      openAssetForm(actionElement.dataset.asset);
      break;

    case "asset-archive":
      requestAssetArchive(actionElement.dataset.asset);
      break;

    case "asset-delete":
      requestAssetDelete(actionElement.dataset.asset);
      break;

    case "asset-restore":
      restoreAsset(actionElement.dataset.asset);
      break;

    case "asset-confirm":
      confirmAssetAction();
      break;

    case "export":
      handleExport(actionElement);
      break;

    case "show-lock-info":
      showToast(
        "Hak Akses Terverifikasi",
        "Sesi Anda terikat SSO UNSIL dengan enkripsi 256-bit.",
        "info"
      );
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

function bindDispatchFilter(button) {
  state.dispatchFilter = button.dataset.dispatchFilter;
  $$("[data-dispatch-filter]").forEach((element) => {
    element.classList.toggle("is-active", element.dataset.dispatchFilter === state.dispatchFilter);
  });
  renderDispatchList();
}

function bindInventoryFilter(button) {
  state.inventoryFilter = button.dataset.inventoryFilter;
  $$("[data-inventory-filter]").forEach((element) => {
    element.classList.toggle("is-active", element.dataset.inventoryFilter === state.inventoryFilter);
  });
  renderInventory();
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
      setAdminTab(adminTabButton.dataset.adminTab, {
        filter: adminTabButton.dataset.adminFilter,
      });
      // Panah KPI pada dashboard mengarahkan ke daftar tiket terkait.
      const scrollTarget = adminTabButton.dataset.adminScroll;
      if (scrollTarget) {
        const target = byId(scrollTarget);
        if (target) {
          const top = target.getBoundingClientRect().top + window.scrollY - 96;
          window.scrollTo({ top, behavior: "smooth" });
        }
      }
    }

    const studentFilterButton = event.target.closest("[data-student-filter]");
    if (studentFilterButton) bindStudentFilter(studentFilterButton);

    const adminFilterButton = event.target.closest("[data-admin-filter]");
    if (adminFilterButton && !adminFilterButton.dataset.adminTab) {
      bindAdminFilter(adminFilterButton);
    }

    const dispatchFilterButton = event.target.closest("[data-dispatch-filter]");
    if (dispatchFilterButton) bindDispatchFilter(dispatchFilterButton);

    const inventoryFilterButton = event.target.closest("[data-inventory-filter]");
    if (inventoryFilterButton) bindInventoryFilter(inventoryFilterButton);

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

  const dispatchSearch = byId("dispatch-search");
  if (dispatchSearch) {
    dispatchSearch.addEventListener("input", (event) => {
      state.dispatchQuery = event.target.value;
      renderDispatchList();
    });
  }

  /* Disposisi: personil mengikuti tim & PIC yang dipilih. */
  const dispatchTeam = byId("dispatch-team");
  if (dispatchTeam) {
    dispatchTeam.addEventListener("change", (event) => {
      refreshDispatchTechnicians(event.target.value);
    });
  }

  const dispatchAssignee = byId("dispatch-assignee");
  if (dispatchAssignee) {
    dispatchAssignee.addEventListener("change", () => {
      refreshDispatchTechnicians(
        byId("dispatch-team")?.value || "",
        byId("dispatch-assignee")?.value || ""
      );
    });
  }

  /* Pencarian & filter personil teknisi. */
  const techSearch = byId("tech-search");
  if (techSearch) {
    techSearch.addEventListener("input", (event) => {
      state.techQuery = event.target.value;
      renderTechnicians();
    });
  }

  const techTeamFilter = byId("tech-team-filter");
  if (techTeamFilter) {
    techTeamFilter.addEventListener("change", (event) => {
      state.techTeamFilter = event.target.value;
      renderTechnicians();
    });
  }

  const techStatusFilter = byId("tech-status-filter");
  if (techStatusFilter) {
    techStatusFilter.addEventListener("change", (event) => {
      state.techStatusFilter = event.target.value;
      renderTechnicians();
    });
  }

  const inventorySearch = byId("inventory-search");
  if (inventorySearch) {
    inventorySearch.addEventListener("input", (event) => {
      state.inventoryQuery = event.target.value;
      renderInventory();
    });
  }

  const assetStatusFilter = byId("asset-status-filter");
  if (assetStatusFilter) {
    assetStatusFilter.value = state.assetStatusFilter || "active";
    assetStatusFilter.addEventListener("change", (event) => {
      state.assetStatusFilter = event.target.value;
      renderInventory();
    });
  }

  const assetForm = byId("asset-form");
  if (assetForm) {
    assetForm.addEventListener("submit", handleAssetFormSubmit);
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

  /* Callback sukses autentikasi (Google OAuth / integrasi lainnya) */
  setOnAuthSuccess(async (user) => {
    await loadTicketsSafely();
    renderReports();
    handleAuthSuccess(user);
  });

  /* Login — diverifikasi ke backend (POST /auth/login) */
  const loginForm = byId("login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearLoginError();

      const submit = loginForm.querySelector('[type="submit"]');
      const email = byId("login-email")?.value.trim() || "";
      const password = byId("login-password")?.value || "";
      const role = state.role === "admin" ? "admin" : "student";

      if (!email || !password) {
        showLoginError("Email dan kata sandi wajib diisi.");
        showToast("Data Belum Lengkap", "Email dan kata sandi wajib diisi.", "error");
        return;
      }

      setButtonLoading(submit, true, "Memverifikasi...");
      try {
        const user = await loginRequest({ email, password, role });
        const passEl = byId("login-password");
        if (passEl) passEl.value = "";
        await loadTicketsSafely();
        renderReports();
        handleAuthSuccess(user);
      } catch (error) {
        const message =
          error instanceof ApiError ? error.message : "Terjadi kesalahan saat masuk. Coba lagi.";
        showLoginError(message);
        showToast("Gagal Masuk", message, "error");
      } finally {
        setButtonLoading(submit, false, "Masuk ke Portal CampusCare");
      }
    });
  }

  /* Registrasi Mahasiswa Baru (POST /auth/register) */
  const registerForm = byId("register-form");
  if (registerForm) {
    registerForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearFieldError();

      const password = byId("reg-password")?.value || "";
      const confirm = byId("reg-confirm")?.value || "";
      const email = byId("reg-email")?.value.trim() || "";
      const name = byId("reg-name")?.value.trim() || "";
      const nim = byId("reg-nim")?.value.trim() || "";
      const faculty = byId("reg-fakultas")?.value || "";

      if (password.length < 8) {
        showFieldError(byId("reg-password"), "Kata sandi minimal 8 karakter.");
        return;
      }

      if (password !== confirm) {
        showFieldError(byId("reg-confirm"), "Konfirmasi kata sandi tidak cocok.");
        return;
      }

      const submit = registerForm.querySelector('[type="submit"]');
      setButtonLoading(submit, true, "Mendaftarkan...");

      try {
        await registerRequest({ name, nim, faculty, email, password, confirmPassword: confirm });
      } catch (error) {
        if (error instanceof ApiError && error.errors) {
          const fieldIds = {
            name: "reg-name",
            nim: "reg-nim",
            faculty: "reg-fakultas",
            email: "reg-email",
            password: "reg-password",
            confirmPassword: "reg-confirm",
          };
          Object.entries(error.errors).forEach(([field, msg]) => {
            const input = byId(fieldIds[field]);
            if (input) input.classList.add("input-invalid");
          });
          const [field, message] = Object.entries(error.errors)[0] || [];
          showFieldError(byId(fieldIds[field]), message || error.message);
        } else {
          showToast(
            "Pendaftaran Gagal",
            error instanceof ApiError ? error.message : "Terjadi kesalahan. Coba lagi.",
            "error"
          );
        }
        setButtonLoading(submit, false, "Daftarkan Akun Mahasiswa");
        return;
      }

      setButtonLoading(submit, false, "Daftarkan Akun Mahasiswa");

      const loginEmail = byId("login-email");
      if (loginEmail) loginEmail.value = email;

      registerForm.reset();
      evaluatePassword("");
      setAuthTab("login");
      setAuthRole("student");

      showToast(
        "Pendaftaran Berhasil!",
        `Akun ${name || "mahasiswa"} siap digunakan. Silakan masuk dengan email dan kata sandi Anda.`,
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

  /* CRUD teknisi */
  const technicianForm = byId("technician-form");
  if (technicianForm) {
    technicianForm.addEventListener("submit", handleTechnicianFormSubmit);
  }

  /* Form tiket dirender ulang di dalam modal, jadi pakai delegasi. */
  document.addEventListener("submit", (event) => {
    if (event.target.closest("#ticket-instruction-form")) {
      handleInstructionSubmit(event);
      return;
    }
    if (event.target.closest("#ticket-note-form")) {
      handleTicketNoteSubmit(event);
    }
  });

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
