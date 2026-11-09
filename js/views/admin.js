/* ==========================================================================
   views/admin.js — Navigasi panel dashboard admin Sarpras
   ========================================================================== */

import { $$ } from "../core/dom.js";
import { state } from "../core/state.js";
import { toggleSidebar } from "../ui/sidebar.js";
import { renderAdminTickets, renderDispatchList } from "../features/reports.js";
import { renderTechnicians } from "../features/technicians.js";
import { renderInventory } from "../features/inventory.js";
import { renderAnalytics } from "../features/analytics.js";

function syncAdminFilterChips() {
  $$(".filter-chip[data-admin-filter]").forEach((element) => {
    element.classList.toggle("is-active", element.dataset.adminFilter === state.adminFilter);
  });
}

export function setAdminTab(tab, options = {}) {
  toggleSidebar(false);
  state.adminTab = tab;

  // Pintasan drawer boleh membawa filter awal (mis. "Tiket Masuk & Triage").
  state.adminFilter = options.filter || "all";
  syncAdminFilterChips();

  $$(".cc-panel[id^='panel-admin-']").forEach((panel) => {
    panel.classList.toggle("is-active", panel.id === `panel-admin-${tab}`);
  });

  $$("[data-admin-tab]").forEach((button) => {
    // Pintasan filter di drawer (mis. "Tiket Masuk & Triage") bukan tab utama,
    // jadi tidak ikut ditandai aktif agar tidak ada dua menu menyala sekaligus.
    if (button.dataset.adminFilter) return;
    // Pintasan gulir (mis. "Audit Log Stream") juga bukan tab utama.
    if (button.dataset.adminScroll) return;

    const isActive = button.dataset.adminTab === tab;
    button.classList.toggle("is-active", isActive);
    if (button.classList.contains("seg-tab")) {
      button.setAttribute("aria-current", isActive ? "page" : "false");
    }
  });

  if (tab === "dashboard") renderAdminTickets();
  if (tab === "dispatches") renderDispatchList();
  if (tab === "techs") renderTechnicians();
  if (tab === "inventory") renderInventory();
  if (tab === "sla") renderAnalytics();

  renderAnalytics();
  window.scrollTo({ top: 0, behavior: "auto" });
}
