/* ==========================================================================
   core/router.js — Router tampilan (publik / auth / mahasiswa / admin)
   ========================================================================== */

import { byId } from "./dom.js";
import { state } from "./state.js";
import { info, auditView } from "./debug.js";
import { closeMenus } from "../ui/menu.js";
import { closeAllModals } from "../ui/modal.js";
import { setAuthRole, setAuthTab } from "../views/auth.js";

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
  let nextView = view;
  if ((view === "student" || view === "admin") && state.role !== view) {
    setAuthRole(view);
    setAuthTab("login");
    nextView = "auth";
  }

  state.view = nextView;
  document.body.dataset.view = nextView;

  ["public", "auth", "student", "admin"].forEach((name) => {
    const section = byId(`view-${name}`);
    if (!section) return;
    section.classList.toggle("is-active", name === nextView);
  });

  syncHash(nextView);
  closeMenus();
  closeAllModals();
  window.scrollTo({ top: 0, behavior: "auto" });

  info(`Tampilkan view: ${nextView}`);

  // Audit setelah browser menghitung layout agar panel kosong cepat terdeteksi.
  requestAnimationFrame(() => {
    if (state.view === nextView) auditView(nextView);
  });
}
