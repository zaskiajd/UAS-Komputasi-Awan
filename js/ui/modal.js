/* ==========================================================================
   ui/modal.js — Buka/tutup modal bersama
   ========================================================================== */

import { $$ } from "../core/dom.js";

export function openModal(modal) {
  if (!modal) return;

  modal.hidden = false;
  requestAnimationFrame(() => modal.classList.add("is-open"));
  document.body.classList.add("cc-modal-open");

  const focusTarget = modal.querySelector(
    "input:not([type='hidden']):not([readonly]), select, textarea"
  );
  if (focusTarget) {
    setTimeout(() => focusTarget.focus({ preventScroll: true }), 120);
  }
}

export function closeModal(modal) {
  if (!modal) return;

  modal.classList.remove("is-open");
  setTimeout(() => {
    modal.hidden = true;
    if (!document.querySelector(".cc-modal.is-open")) {
      document.body.classList.remove("cc-modal-open");
    }
  }, 220);
}

export function closeAllModals() {
  $$(".cc-modal").forEach((modal) => closeModal(modal));
  document.body.classList.remove("cc-modal-open");
}
