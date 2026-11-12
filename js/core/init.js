/* ==========================================================================
   core/init.js — Inisialisasi state dan seluruh perilaku aplikasi
   ========================================================================== */

import { resetReportSequence, state } from "./state.js";
import { setView } from "./router.js";
import { seedReports } from "../data/reports.js";
import { seedTechnicians } from "../data/technicians.js";
import { seedAssets } from "../data/assets.js";
import { bindEvents } from "../events.js";
import { setAuthRole, setAuthTab, initGoogleAuth } from "../views/auth.js";
import { fillDispatchOptions } from "../features/dispatch.js";
import { renderReports } from "../features/reports.js";
import { renderTechnicians } from "../features/technicians.js";
import { renderInventory } from "../features/inventory.js";
import { renderAnalytics } from "../features/analytics.js";
import { renderPublicView } from "../views/public.js";
import { clearToken, fetchMe, getToken, setUnauthorizedHandler } from "./api.js";
import { loginAs, logout } from "../features/session.js";
import { loadTicketsSafely } from "../features/tickets-api.js";

/** Memulihkan sesi dari token tersimpan; token tidak valid dibuang secara aman. */
async function restoreSession() {
  const token = getToken();
  if (!token) return;

  try {
    const user = await fetchMe();
    if (!user) {
      clearToken();
      return;
    }
    state.role = user.role;
    state.student =
      user.role === "student"
        ? { name: user.name, nim: user.nim, faculty: user.faculty, email: user.email }
        : null;
    await loadTicketsSafely();
    renderReports();
    loginAs(user.role, { name: user.name });
  } catch (error) {
    clearToken();
    if (state.view === "student" || state.view === "admin") {
      logout({
        title: "Sesi Kedaluwarsa",
        message: "Sesi login Anda telah berakhir. Silakan masuk kembali.",
        variant: "warning",
      });
    }
  }
}

export function init() {
  const initialHash = window.location.hash.replace("#", "").toLowerCase();

  state.reports = seedReports();
  state.technicians = seedTechnicians();
  state.assets = seedAssets();
  resetReportSequence();

  setUnauthorizedHandler((message) => {
    if (state.view === "student" || state.view === "admin") {
      logout({
        title: "Sesi Berakhir",
        message: message || "Sesi Anda telah berakhir. Silakan masuk kembali.",
        variant: "warning",
      });
    }
  });

  bindEvents();
  setAuthTab("login");
  setAuthRole("student");
  initGoogleAuth();
  fillDispatchOptions();
  renderReports();
  renderTechnicians();
  renderInventory();
  renderAnalytics();
  renderPublicView();

  if (["admin", "student", "mahasiswa", "masuk"].includes(initialHash)) {
    setAuthRole(initialHash === "admin" ? "admin" : "student");
    setView("auth");
    restoreSession();
    return;
  }

  setView("public");
  restoreSession();
}
