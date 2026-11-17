/* ==========================================================================
   features/photo-gallery.js — URL foto, galeri, thumbnail, dan lightbox
   --------------------------------------------------------------------------
   Backend menyimpan foto sebagai path relatif "/uploads/<uuid>.<ext>".
   Di production path ini same-origin dengan frontend (Nginx), sedangkan saat
   development frontend (:8000) dan backend (:3000) berbeda origin. Helper
   resolvePhotoUrl() menjadi satu-satunya tempat penyesuaian origin.

   Setiap pemicu `open-photo` membawa daftar foto tiket + indeks yang diklik
   lewat data-photo-list/data-photo-index agar lightbox bisa bernavigasi.
   ========================================================================== */

import { API_BASE } from "../core/api.js";
import { escapeHtml } from "../core/dom.js";
import { closeModal, openModal } from "../ui/modal.js";

const MAX_PHOTOS = 3;

/** Ubah path foto backend menjadi URL absolut yang bisa dimuat <img>. */
export function resolvePhotoUrl(url) {
  if (!url) return "";
  const value = String(url);
  if (/^https?:\/\//i.test(value) || value.startsWith("data:")) return value;
  if (value.startsWith("//")) {
    try {
      return `${new URL(API_BASE, window.location.href).protocol}${value}`;
    } catch (error) {
      return value;
    }
  }
  try {
    const api = new URL(API_BASE, window.location.href);
    return `${api.origin}${value.startsWith("/") ? "" : "/"}${value}`;
  } catch (error) {
    return value;
  }
}

function photoAlt(ticketId, index) {
  return `Foto bukti ${ticketId || "pengaduan"} ${index + 1}`;
}

function photoList(photos) {
  return Array.isArray(photos)
    ? photos.filter((photo) => photo?.url).slice(0, MAX_PHOTOS)
    : [];
}

/** Daftar item galeri (URL absolut + alt) untuk satu tiket. */
function galleryItems(photos, ticketId) {
  return photoList(photos).map((photo, index) => ({
    src: resolvePhotoUrl(photo.url),
    alt: photoAlt(ticketId, index),
  }));
}

/** Atribut pemicu lightbox: membawa semua foto + indeks yang diklik. */
function photoTriggerAttributes(items, index) {
  const item = items[index];
  return `data-action="open-photo" data-photo="${escapeHtml(item.src)}" data-photo-alt="${escapeHtml(
    item.alt
  )}" data-photo-index="${index}" data-photo-list="${escapeHtml(JSON.stringify(items))}"`;
}

/** Galeri foto lengkap untuk detail tiket (admin & mahasiswa). */
export function photoGalleryMarkup(
  photos,
  { ticketId = "", label = "Foto bukti laporan" } = {}
) {
  const items = galleryItems(photos, ticketId);
  if (!items.length) return "";

  return `
    <div class="mt-4">
      <div class="flex items-center justify-between gap-2">
        <p class="text-[10px] uppercase tracking-wider text-secondary font-bold">${escapeHtml(label)}</p>
        <span class="text-[10px] text-secondary">${items.length} foto</span>
      </div>
      <div class="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
        ${items
          .map(
            (item, index) => `
              <button type="button" class="cc-photo-tile" ${photoTriggerAttributes(
                items,
                index
              )} aria-label="Perbesar ${escapeHtml(item.alt)}">
                <img src="${escapeHtml(item.src)}" alt="${escapeHtml(item.alt)}" loading="lazy" decoding="async">
              </button>`
          )
          .join("")}
      </div>
    </div>`;
}

/** Thumbnail ringkas untuk kartu riwayat/antrean tiket (semua foto, maks. 3). */
export function photoThumbnailMarkup(photos, ticketId = "") {
  const items = galleryItems(photos, ticketId);
  if (!items.length) return "";

  return `
    <div class="cc-photo-thumbs" aria-label="${escapeHtml(
      `${items.length} foto bukti ${ticketId || "pengaduan"}`
    )}">
      ${items
        .map(
          (item, index) => `
        <button type="button" class="cc-photo-thumb" ${photoTriggerAttributes(
          items,
          index
        )} aria-label="Lihat ${escapeHtml(item.alt)} (${index + 1} dari ${items.length})">
          <img src="${escapeHtml(item.src)}" alt="${escapeHtml(item.alt)}" loading="lazy" decoding="async">
        </button>`
        )
        .join("")}
    </div>`;
}

/**
 * Lightbox dinamis dengan navigasi.
 * @param {HTMLElement|string} trigger elemen `[data-action="open-photo"]` atau URL tunggal
 * @param {string} [alt] alt untuk pemanggilan URL tunggal (kompatibilitas)
 */
export function openPhotoLightbox(trigger, alt) {
  let items = [];
  let index = 0;
  let triggerElement = null;

  if (trigger && typeof trigger === "object" && trigger.dataset) {
    triggerElement = trigger;
    const rawList = trigger.dataset.photoList;
    if (rawList) {
      try {
        const parsed = JSON.parse(rawList);
        if (Array.isArray(parsed)) {
          items = parsed
            .filter((item) => item?.src)
            .map((item) => ({ src: resolvePhotoUrl(item.src), alt: item.alt || alt || "Foto bukti" }));
        }
      } catch (error) {
        items = [];
      }
    }
    if (!items.length && trigger.dataset.photo) {
      items = [
        {
          src: resolvePhotoUrl(trigger.dataset.photo),
          alt: trigger.dataset.photoAlt || alt || "Foto bukti pengaduan",
        },
      ];
    }
    index = Number(trigger.dataset.photoIndex || 0) || 0;
  } else if (trigger) {
    items = [{ src: resolvePhotoUrl(trigger), alt: alt || "Foto bukti pengaduan" }];
  }

  items = items.filter((item) => item.src);
  if (!items.length) return;
  index = Math.min(Math.max(0, index), items.length - 1);

  const multiple = items.length > 1;
  const modal = document.createElement("div");
  modal.className = "cc-modal cc-photo-lightbox";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-label", "Galeri foto bukti");
  modal.innerHTML = `
    <div class="cc-photo-lightbox__panel" role="document">
      <button type="button" class="cc-photo-lightbox__close" aria-label="Tutup foto">
        <span class="material-symbols-outlined">close</span>
      </button>
      <div class="cc-photo-lightbox__stage">
        ${
          multiple
            ? `<button type="button" class="cc-photo-lightbox__nav cc-photo-lightbox__nav--prev" aria-label="Foto sebelumnya"><span class="material-symbols-outlined">chevron_left</span></button>`
            : ""
        }
        <img data-photo-image src="${escapeHtml(items[index].src)}" alt="${escapeHtml(
          items[index].alt
        )}">
        ${
          multiple
            ? `<button type="button" class="cc-photo-lightbox__nav cc-photo-lightbox__nav--next" aria-label="Foto berikutnya"><span class="material-symbols-outlined">chevron_right</span></button>`
            : ""
        }
      </div>
      <div class="cc-photo-lightbox__meta">
        ${
          multiple
            ? `<span class="cc-photo-lightbox__counter" data-photo-counter aria-live="polite">${
                index + 1
              } / ${items.length}</span>`
            : ""
        }
        <p class="cc-photo-lightbox__caption" data-photo-caption>${escapeHtml(
          items[index].alt
        )}</p>
      </div>
    </div>`;

  const image = modal.querySelector("[data-photo-image]");
  const caption = modal.querySelector("[data-photo-caption]");
  const counter = modal.querySelector("[data-photo-counter]");
  const prevButton = modal.querySelector(".cc-photo-lightbox__nav--prev");
  const nextButton = modal.querySelector(".cc-photo-lightbox__nav--next");

  const render = () => {
    const item = items[index];
    image.src = item.src;
    image.alt = item.alt;
    if (caption) caption.textContent = item.alt;
    if (counter) counter.textContent = `${index + 1} / ${items.length}`;
  };

  const go = (step) => {
    if (!multiple) return;
    index = (index + step + items.length) % items.length;
    render();
  };

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKeyDown, true);
    closeModal(modal);
    setTimeout(() => modal.remove(), 260);
  };
  const onKeyDown = (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      event.preventDefault();
      close();
      return;
    }
    if (!multiple) return;
    if (event.key === "ArrowLeft") {
      event.stopPropagation();
      event.preventDefault();
      go(-1);
    } else if (event.key === "ArrowRight") {
      event.stopPropagation();
      event.preventDefault();
      go(1);
    }
  };

  modal.addEventListener("click", (event) => {
    if (event.target === modal) close();
  });
  modal.querySelector(".cc-photo-lightbox__close").addEventListener("click", close);
  prevButton?.addEventListener("click", () => go(-1));
  nextButton?.addEventListener("click", () => go(1));
  document.addEventListener("keydown", onKeyDown, true);

  document.body.appendChild(modal);
  // Pastikan fokus awal tercatat sebagai pemicu agar bisa dikembalikan saat tutup.
  if (triggerElement && typeof triggerElement.focus === "function") {
    triggerElement.focus({ preventScroll: true });
  }
  openModal(modal);
}
