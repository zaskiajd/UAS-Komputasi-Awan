/* ==========================================================================
   core/init.js — Inisialisasi state dan seluruh perilaku aplikasi
   ========================================================================== */

import { resetReportSequence, state } from "./state.js";
import { setView } from "./router.js";
import { seedReports } from "../data/reports.js";
import { bindEvents } from "../events.js";
import { setAuthRole, setAuthTab } from "../views/auth.js";
import { loginAs } from "../features/session.js";
import { fillDispatchOptions } from "../features/dispatch.js";
import { renderReports } from "../features/reports.js";

export function init() {
  const initialHash = window.location.hash.replace("#", "").toLowerCase();

  state.reports = seedReports();
  resetReportSequence();

  bindEvents();
  setAuthTab("login");
  setAuthRole("student");
  fillDispatchOptions();
  renderReports();

  setView("auth");

  if (initialHash === "admin") {
    loginAs("admin");
  } else if (initialHash === "student" || initialHash === "mahasiswa") {
    loginAs("student");
  }
}
