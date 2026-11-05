/* ==========================================================================
   core/router.js — Router tampilan (publik / auth / mahasiswa / admin)
   ========================================================================== */

import { byId } from "./dom.js";
import { state } from "./state.js";
import { info, auditView } from "./debug.js";
import { closeMenus } from "../ui/menu.js";
import { closeAllModals } from "../ui/modal.js";

/** Peta hash yang stabil untuk deep link tanpa membocorkan sesi. */
const HASH_BY_VIEW = {
  public: "",
  auth: "#masuk",
  student: "#student",
  admin: "#admin",
};

/** Menyimpan view aktif ke hash URL tanpa menambah riwayat. */
export function syncHash(view) {
  try {
    const base = window.location.pathname + window.location.search;
    window.history.replaceState(null, "", `${base}${HASH_BY_VIEW[view] || ""}`);
  } catch (error) {
    /* file:// atau lingkungan tanpa History API — abaikan */
  }
}

/** Menampilkan satu view dan menyembunyikan view lainnya. */
export function setView(view) {
  state.view = view;
  document.body.dataset.view = view;

  ["public", "auth", "student", "admin"].forEach((name) => {
    const section = byId(`view-${name}`);
    if (!section) return;
    section.classList.toggle("is-active", name === view);
  });

  syncHash(view);
  closeMenus();
  closeAllModals();
  window.scrollTo({ top: 0, behavior: "auto" });

  info(`Tampilkan view: ${view}`);

  // Audit setelah browser menghitung layout agar panel kosong cepat terdeteksi.
  requestAnimationFrame(() => {
    if (state.view === view) auditView(view);
  });
}
