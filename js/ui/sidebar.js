/* ==========================================================================
   ui/sidebar.js — Drawer navigasi admin (mobile & desktop)
   ========================================================================== */

import { byId } from "../core/dom.js";

export function toggleSidebar(open) {
  const drawer = byId("sidebar-drawer");
  const backdrop = byId("sidebar-backdrop");
  if (!drawer || !backdrop) return;

  if (open) {
    drawer.classList.remove("-translate-x-full");
    drawer.classList.add("translate-x-0");
    backdrop.classList.remove("opacity-0", "pointer-events-none");
    backdrop.classList.add("opacity-100", "pointer-events-auto");
    document.body.style.overflow = "hidden";
  } else {
    drawer.classList.remove("translate-x-0");
    drawer.classList.add("-translate-x-full");
    backdrop.classList.remove("opacity-100", "pointer-events-auto");
    backdrop.classList.add("opacity-0", "pointer-events-none");
    document.body.style.overflow = "";
  }
}
