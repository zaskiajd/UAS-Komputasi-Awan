/* ==========================================================================
   ui/toast.js — Notifikasi ringkas (toast)
   ========================================================================== */

import { byId } from "../core/dom.js";

let toastTimer = null;

export function showToast(title, message, variant = "success") {
  const toast = byId("toast");
  if (!toast) return;

  clearTimeout(toastTimer);

  toast.dataset.variant = variant;
  byId("toast-title").textContent = title || "";
  byId("toast-message").textContent = message || "";

  const icon = byId("toast-icon");
  icon.textContent = variant === "error" ? "error" : variant === "info" ? "info" : "check";

  toast.classList.add("is-visible");
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 4200);
}
