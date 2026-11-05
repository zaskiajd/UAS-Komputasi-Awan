/* ==========================================================================
   main.js — Titik masuk aplikasi
   1. Muat semua partial HTML (views/**)
   2. Jalankan inisialisasi modul
   3. Validasi struktur shell (view, panel, modal)
   4. Tampilkan antarmuka setelah stylesheet & partial siap
   ========================================================================== */

import { info, error as logError, auditView } from "./core/debug.js";
import { loadPartials } from "./core/partials.js";
import { init } from "./core/init.js";

/** View dan panel wajib ada; kalau hilang, dashboard tampil kosong tanpa pesan. */
const REQUIRED_VIEWS = ["view-public", "view-auth", "view-student", "view-admin"];
const REQUIRED_PANELS = {
  student: ["summary", "complaints", "help"],
  admin: ["dashboard", "dispatches", "techs", "inventory", "sla"],
};
const REQUIRED_MODALS = [
  "modal-complaint",
  "modal-delete-history",
  "modal-dispatch",
  "modal-sso-help",
  "toast",
];

const ms = (start) => `${Math.round(performance.now() - start)} ms`;
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

function revealApp() {
  document.body.classList.remove("cc-booting");
  document.getElementById("boot-screen")?.remove();
}

function showBootError(error) {
  revealApp();
  window.__ccReady = false;

  const panel = document.getElementById("boot-error");
  const detail = document.getElementById("boot-error-detail");
  if (detail) detail.textContent = error?.message || String(error);
  if (panel) panel.hidden = false;

  logError("Boot gagal", error?.stack || error?.message || String(error));
  console.error("[CampusCare] Gagal memuat antarmuka:", error);
}

/** Memastikan partial inti benar-benar terpasang, bukan hanya "tidak error". */
function validateShell() {
  const problems = [];

  REQUIRED_VIEWS.forEach((id) => {
    if (!document.getElementById(id)) problems.push(`#${id} tidak ada`);
  });

  Object.entries(REQUIRED_PANELS).forEach(([view, tabs]) => {
    tabs.forEach((tab) => {
      const id = `panel-${view}-${tab}`;
      if (!document.getElementById(id)) problems.push(`#${id} tidak ada`);
    });
  });

  REQUIRED_MODALS.forEach((id) => {
    if (!document.getElementById(id)) problems.push(`#${id} tidak ada`);
  });

  const placeholders = document.querySelectorAll("[data-include]").length;
  if (placeholders) problems.push(`${placeholders} partial belum termuat`);

  if (problems.length) {
    throw new Error(`Struktur antarmuka tidak lengkap: ${problems.join("; ")}`);
  }

  info(
    "Struktur shell lengkap",
    `${REQUIRED_VIEWS.length} view, ${Object.values(REQUIRED_PANELS).flat().length} panel, ${REQUIRED_MODALS.length} modal`
  );
}

async function boot() {
  const started = performance.now();
  info("Boot dimulai", `${window.location.pathname}${window.location.search}`);

  try {
    const tPartials = performance.now();
    await loadPartials();
    info("Partial HTML termuat", ms(tPartials));

    const tInit = performance.now();
    init();
    info("Inisialisasi modul selesai", ms(tInit));

    validateShell();

    // Satu frame agar browser sempat menghitung layout sebelum animasi masuk.
    await nextFrame();
    revealApp();
    window.__ccReady = true;

    info("Antarmuka siap", ms(started));
    auditView(document.body.dataset.view);
  } catch (error) {
    showBootError(error);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
