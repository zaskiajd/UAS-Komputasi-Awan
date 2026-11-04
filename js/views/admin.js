/* ==========================================================================
   views/admin.js — Navigasi panel dashboard admin Sarpras
   ========================================================================== */

import { $$ } from "../core/dom.js";
import { state } from "../core/state.js";
import { toggleSidebar } from "../ui/sidebar.js";
import { renderAdminTickets, renderDispatchList } from "../features/reports.js";

export function setAdminTab(tab) {
  toggleSidebar(false);
  state.adminTab = tab;

  $$(".cc-panel[id^='panel-admin-']").forEach((panel) => {
    panel.classList.toggle("is-active", panel.id === `panel-admin-${tab}`);
  });

  $$("[data-admin-tab]").forEach((button) => {
    const isActive = button.dataset.adminTab === tab;
    button.classList.toggle("is-active", isActive);
    if (button.classList.contains("seg-tab")) {
      button.setAttribute("aria-current", isActive ? "page" : "false");
    }
  });

  if (tab === "dashboard") renderAdminTickets();
  if (tab === "dispatches") renderDispatchList();
  window.scrollTo({ top: 0, behavior: "auto" });
}
