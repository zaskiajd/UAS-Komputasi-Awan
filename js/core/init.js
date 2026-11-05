/* ==========================================================================
   core/init.js — Inisialisasi state dan seluruh perilaku aplikasi
   ========================================================================== */

import { resetReportSequence, state } from "./state.js";
import { setView } from "./router.js";
import { seedReports } from "../data/reports.js";
import { bindEvents } from "../events.js";
import { setAuthRole, setAuthTab } from "../views/auth.js";
import { fillDispatchOptions } from "../features/dispatch.js";
import { renderReports } from "../features/reports.js";
import { renderPublicView } from "../views/public.js";

export function init() {
  const initialHash = window.location.hash.replace("#", "").toLowerCase();

  state.reports = seedReports();
  resetReportSequence();

  bindEvents();
  setAuthTab("login");
  setAuthRole("student");
  fillDispatchOptions();
  renderReports();
  renderPublicView();

  if (["admin", "student", "mahasiswa", "masuk"].includes(initialHash)) {
    setAuthRole(initialHash === "admin" ? "admin" : "student");
    setView("auth");
    return;
  }

  setView("public");
}
