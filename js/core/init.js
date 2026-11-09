/* ==========================================================================
   core/init.js — Inisialisasi state dan seluruh perilaku aplikasi
   ========================================================================== */

import { resetReportSequence, state } from "./state.js";
import { setView } from "./router.js";
import { seedReports } from "../data/reports.js";
import { seedTechnicians } from "../data/technicians.js";
import { seedAssets } from "../data/assets.js";
import { bindEvents } from "../events.js";
import { setAuthRole, setAuthTab } from "../views/auth.js";
import { fillDispatchOptions } from "../features/dispatch.js";
import { renderReports } from "../features/reports.js";
import { renderTechnicians } from "../features/technicians.js";
import { renderInventory } from "../features/inventory.js";
import { renderAnalytics } from "../features/analytics.js";
import { renderPublicView } from "../views/public.js";

export function init() {
  const initialHash = window.location.hash.replace("#", "").toLowerCase();

  state.reports = seedReports();
  state.technicians = seedTechnicians();
  state.assets = seedAssets();
  resetReportSequence();

  bindEvents();
  setAuthTab("login");
  setAuthRole("student");
  fillDispatchOptions();
  renderReports();
  renderTechnicians();
  renderInventory();
  renderAnalytics();
  renderPublicView();

  if (["admin", "student", "mahasiswa", "masuk"].includes(initialHash)) {
    setAuthRole(initialHash === "admin" ? "admin" : "student");
    setView("auth");
    return;
  }

  setView("public");
}
