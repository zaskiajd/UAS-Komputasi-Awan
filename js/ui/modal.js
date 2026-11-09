/* ==========================================================================
   ui/modal.js — Buka/tutup modal bersama + focus trap
   ========================================================================== */

import { $$ } from "../core/dom.js";

const lastFocus = new WeakMap();
const trapHandlers = new WeakMap();

const FOCUSABLE =
  "a[href], button:not([disabled]), input:not([type='hidden']):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

function focusables(modal) {
  return Array.from(modal.querySelectorAll(FOCUSABLE)).filter(
    (element) => element.offsetParent !== null || element === document.activeElement
  );
}

export function openModal(modal) {
  if (!modal) return;

  lastFocus.set(modal, document.activeElement);
  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => modal.classList.add("is-open"));
  document.body.classList.add("cc-modal-open");

  const focusTarget =
    modal.querySelector("input:not([type='hidden']):not([readonly]), select, textarea") ||
    modal.querySelector("[data-autofocus]") ||
    focusables(modal)[0];
  if (focusTarget) {
    setTimeout(() => focusTarget.focus({ preventScroll: true }), 120);
  }

  const previous = trapHandlers.get(modal);
  if (previous) modal.removeEventListener("keydown", previous);

  const handler = (event) => {
    if (event.key !== "Tab") return;
    const items = focusables(modal);
    if (!items.length) {
      event.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  modal.addEventListener("keydown", handler);
  trapHandlers.set(modal, handler);
}

export function closeModal(modal) {
  if (!modal) return;

  const handler = trapHandlers.get(modal);
  if (handler) {
    modal.removeEventListener("keydown", handler);
    trapHandlers.delete(modal);
  }

  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");

  const restore = lastFocus.get(modal);
  lastFocus.delete(modal);
  if (restore && document.contains(restore)) {
    setTimeout(() => restore.focus({ preventScroll: true }), 0);
  }

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
