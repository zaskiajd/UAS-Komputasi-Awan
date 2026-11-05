/* ==========================================================================
   ui/sidebar.js — Drawer navigasi (admin & mahasiswa)
   ========================================================================== */

import { byId } from "../core/dom.js";

const DRAWERS = {
  admin: { drawer: "sidebar-drawer", backdrop: "sidebar-backdrop" },
  student: { drawer: "student-drawer", backdrop: "student-backdrop" },
};

function setDrawer(scope, open) {
  const ids = DRAWERS[scope];
  const drawer = byId(ids.drawer);
  const backdrop = byId(ids.backdrop);
  if (!drawer || !backdrop) return;

  drawer.classList.toggle("-translate-x-full", !open);
  drawer.classList.toggle("translate-x-0", open);
  backdrop.classList.toggle("opacity-0", !open);
  backdrop.classList.toggle("pointer-events-none", !open);
  backdrop.classList.toggle("opacity-100", open);
  backdrop.classList.toggle("pointer-events-auto", open);
  document.body.style.overflow = open ? "hidden" : "";
}

export function toggleSidebar(open) {
  setDrawer("admin", open);
}

export function toggleStudentSidebar(open) {
  setDrawer("student", open);
}

/** Menutup semua drawer sekaligus (Escape, logout, ganti tampilan). */
export function closeDrawers() {
  setDrawer("admin", false);
  setDrawer("student", false);
}
