/* ==========================================================================
   ui/menu.js — Menu dropdown akun (mahasiswa & admin)
   ========================================================================== */

import { $$, byId } from "../core/dom.js";

/** Menutup semua menu dropdown, kecuali menu yang sedang dibuka. */
export function closeMenus(exceptMenu) {
  $$(".cc-menu").forEach((menu) => {
    if (menu !== exceptMenu) menu.hidden = true;
  });
  $$("[data-action='toggle-menu']").forEach((button) => {
    const target = byId(button.dataset.menu);
    button.setAttribute("aria-expanded", target && !target.hidden ? "true" : "false");
  });
}
