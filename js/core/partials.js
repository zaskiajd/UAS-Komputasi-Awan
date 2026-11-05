/* ==========================================================================
   core/partials.js — Pemuat partial HTML (views/**) untuk SPA
   ========================================================================== */

import { info, warn } from "./debug.js";

const RETRIES = 1;
const RETRY_DELAY = 250;

/**
 * Mengganti setiap `<div data-include="...">` dengan isi file partial terkait.
 * Bekerja rekursif agar partial boleh memuat partial lain (mis. modal di dalam view).
 */
export async function loadPartials(root = document) {
  if (window.location.protocol === "file:") {
    throw new Error(
      "Halaman dibuka lewat protokol file://. Jalankan web server lokal, mis. `python -m http.server 8000`."
    );
  }

  let guard = 0;

  while (true) {
    const pending = Array.from(root.querySelectorAll("[data-include]"));

    if (!pending.length) return;

    if ((guard += 1) > 20) {
      throw new Error("Partial saling memuat terlalu dalam (kemungkinan ada include melingkar).");
    }

    info("Memuat partial", `${pending.length} placeholder (putaran ${guard})`);
    await Promise.all(pending.map(injectPartial));
  }
}

async function injectPartial(node) {
  const path = node.dataset.include;
  const html = await fetchPartial(path);

  const template = document.createElement("template");
  template.innerHTML = html;

  node.replaceWith(template.content);
  info(`Partial siap: ${path}`, `${html.length} byte`);
}

/** Mengambil satu partial; mencoba ulang sekali sebelum melempar galat yang jelas. */
async function fetchPartial(path) {
  const url = new URL(path, document.baseURI);
  let lastError = null;

  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, { cache: "no-cache" });

      if (!response.ok) {
        throw new Error(
          `Gagal memuat ${path} (HTTP ${response.status}). Periksa nama file di folder views/.`
        );
      }

      const text = (await response.text()).trim();

      if (!text) {
        throw new Error(`Partial ${path} kosong (0 byte). Periksa isi file.`);
      }

      // Server yang salah (mis. SPA fallback) bisa mengembalikan index.html utuh.
      if (/^<!doctype html/i.test(text) || /<html[\s>]/i.test(text)) {
        throw new Error(
          `Partial ${path} berisi dokumen HTML penuh, bukan potongan view. Periksa isi file.`
        );
      }

      return text;
    } catch (error) {
      lastError = error;
      if (attempt < RETRIES) {
        warn(`Gagal memuat ${path}, mencoba ulang…`, error.message);
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
      }
    }
  }

  throw lastError;
}
