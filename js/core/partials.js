/* ==========================================================================
   core/partials.js — Pemuat partial HTML (views/**) untuk SPA
   ========================================================================== */

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

    await Promise.all(pending.map(injectPartial));
  }
}

async function injectPartial(node) {
  const path = node.dataset.include;
  const url = new URL(path, document.baseURI);

  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`Gagal memuat ${path} (HTTP ${response.status}).`);
  }

  const template = document.createElement("template");
  template.innerHTML = (await response.text()).trim();

  // Bila file kosong, tetap hapus placeholder agar tidak ikut diproses ulang.
  node.replaceWith(template.content);
}
