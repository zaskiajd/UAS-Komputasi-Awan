/* ==========================================================================
   core/dom.js — Pembantu DOM & format
   ========================================================================== */

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
export const byId = (id) => document.getElementById(id);

export const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const nowLabel = () => {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `Hari ini, ${hh}:${mm} WIB`;
};

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

const toDate = (value) => {
  if (value instanceof Date) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const pad2 = (value) => String(value).padStart(2, "0");

/** Tanggal ringkas, mis. "07 Nov 2026". */
export const formatDate = (value) => {
  const date = toDate(value);
  if (!date) return "-";
  return `${pad2(date.getDate())} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`;
};

/** Tanggal + jam, mis. "07 Nov 2026 • 09:05 WIB". */
export const formatDateTime = (value) => {
  const date = toDate(value);
  if (!date) return "-";
  return `${formatDate(date)} • ${pad2(date.getHours())}:${pad2(date.getMinutes())} WIB`;
};

/** Label relatif singkat untuk audit log. */
export const relativeTime = (value) => {
  const date = toDate(value);
  if (!date) return "-";
  const diff = Date.now() - date.getTime();
  if (diff < 0) return "Baru saja";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Baru saja";
  if (minutes < 60) return `${minutes} Menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} Jam lalu`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} Hari lalu`;
  return formatDate(date);
};

/** Label tanggal gaya riwayat mahasiswa (Hari ini / Kemarin / tanggal). */
export const todayLabel = (value = new Date()) => {
  const date = toDate(value) || new Date();
  const startOfDay = (input) =>
    new Date(input.getFullYear(), input.getMonth(), input.getDate()).getTime();
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86400000);
  const time = `${pad2(date.getHours())}:${pad2(date.getMinutes())} WIB`;
  if (diffDays === 0) return `Hari ini, ${time}`;
  if (diffDays === 1) return `Kemarin, ${time}`;
  return `${formatDate(date)} • ${time}`;
};

export const scrollTop = () => window.scrollTo({ top: 0, behavior: "auto" });
