/* ==========================================================================
   main.js — Titik masuk aplikasi
   1. Muat semua partial HTML (views/**)
   2. Jalankan inisialisasi modul
   3. Tampilkan antarmuka setelah stylesheet & partial siap
   ========================================================================== */

import { loadPartials } from "./core/partials.js";
import { init } from "./core/init.js";

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

function revealApp() {
  document.body.classList.remove("cc-booting");
  document.getElementById("boot-screen")?.remove();
}

function showBootError(error) {
  revealApp();

  const panel = document.getElementById("boot-error");
  const detail = document.getElementById("boot-error-detail");
  if (detail) detail.textContent = error?.message || String(error);
  if (panel) panel.hidden = false;

  console.error("[CampusCare] Gagal memuat antarmuka:", error);
}

async function boot() {
  try {
    await loadPartials();
    init();

    // Satu frame agar browser sempat menghitung layout sebelum animasi masuk.
    await nextFrame();
    revealApp();
  } catch (error) {
    showBootError(error);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
