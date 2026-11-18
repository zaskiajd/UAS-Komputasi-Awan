/* ==========================================================================
   views/public.js — Render dashboard publik (user biasa)
   Beranda publik bersifat statis & informatif (Layanan & FAQ, Alur & SOP,
   Bantuan) — tidak menampilkan data operasional tiket. Identitas pelapor
   tidak pernah dirender di halaman publik.

   Perpindahan tab memakai View Transitions API (bila didukung browser):
   elemen dengan atribut view-transition-name mengalir mulus antar panel,
   memberi kesinambungan spasial saat navigasi. Browser lama hanya
   kehilangan animasi; fungsi tab tetap berjalan normal.
   ========================================================================== */

import { $$, byId } from "../core/dom.js";
import { state } from "../core/state.js";

const PUBLIC_TABS = ["overview", "services", "guide", "help"];

const reducedMotion =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Jalankan perubahan DOM di dalam View Transition bila browser mendukung. */
function withViewTransition(applyChanges) {
  if (!reducedMotion && typeof document.startViewTransition === "function") {
    document.startViewTransition(applyChanges);
    return;
  }
  applyChanges();
}

export function setPublicTab(tab) {
  const next = PUBLIC_TABS.includes(tab) ? tab : "overview";
  if (state.publicTab === next) return;

  withViewTransition(() => {
    state.publicTab = next;

    const publicMain = byId("public-main-content");
    if (publicMain) {
      publicMain.classList.toggle("hidden", next === "overview");
    }

    $$(".cc-panel[id^='panel-public-']").forEach((panel) => {
      panel.classList.toggle("is-active", panel.id === `panel-public-${next}`);
    });

    $$("[data-public-tab]").forEach((button) => {
      const isActive = button.dataset.publicTab === next;
      button.classList.toggle("is-active", isActive);
      if (button.classList.contains("seg-tab")) {
        button.setAttribute("aria-current", isActive ? "page" : "false");
      }
    });

    renderPublicView();
    window.scrollTo({ top: 0, behavior: "auto" });
  });
}

export function renderPublicView() {
  const publicMain = byId("public-main-content");
  if (publicMain) {
    publicMain.classList.toggle("hidden", (state.publicTab || "overview") === "overview");
  }
}
