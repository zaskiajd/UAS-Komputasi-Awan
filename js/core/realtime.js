/* ==========================================================================
   core/realtime.js — Klien WebSocket untuk notifikasi real-time
   --------------------------------------------------------------------------
   Terhubung ke <API>/ws setelah login; autentikasi dengan JWT pada pesan
   pertama. Event dari server:
     ticket.created — admin: ada pengaduan baru masuk
     ticket.status  — admin & pemilik tiket: status/progres berubah
     ticket.photo   — pemilik tiket: foto baru diunggah
   Saat event diterima, daftar tiket dimuat ulang agar tampilan selalu
   mutakhir tanpa menekan refresh. Koneksi putus otomatis dicoba lagi
   dengan backoff, dan ditutup saat logout.
   ========================================================================== */

import { API_BASE, getToken } from "./api.js";
import { state } from "./state.js";
import { showToast } from "../ui/toast.js";
import { STATUS_META } from "../data/reports.js";
import { loadTicketsSafely } from "../features/tickets-api.js";
import { renderReports } from "../features/reports.js";

let socket = null;
let reconnectTimer = null;
let reconnectDelayMs = 1000;
const MAX_RECONNECT_DELAY_MS = 30_000;

/** Ubah API base (http/https atau path same-origin) menjadi URL WebSocket. */
function realtimeUrl() {
  const base = API_BASE.startsWith("/")
    ? `${window.location.origin}${API_BASE}`
    : API_BASE.replace(/^http/, "ws");
  return `${base.replace(/\/+$/, "")}/ws`;
}

function scheduleReconnect() {
  if (reconnectTimer || !getToken()) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectRealtime();
  }, reconnectDelayMs);
  reconnectDelayMs = Math.min(reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS);
}

function refreshTicketViews() {
  loadTicketsSafely()
    .then(() => {
      renderReports();
    })
    .catch(() => {
      /* toast kegagalan sudah ditampilkan loadTicketsSafely */
    });
}

function statusLabel(status) {
  return STATUS_META[status]?.label || status;
}

function handleEvent(event) {
  if (!event || !event.type) return;

  switch (event.type) {
    case "ticket.created":
      // Admin: tiket baru masuk ke antrean verifikasi.
      if (state.role === "admin") {
        showToast(
          "Pengaduan Baru Masuk",
          `${event.ticketCode} — ${event.title}. Verifikasi tiket di panel disposisi.`,
          "info"
        );
        refreshTicketViews();
      }
      break;

    case "ticket.status": {
      const isOwner = state.role === "student" && state.student?.nim;
      const isAdmin = state.role === "admin";
      if (!isAdmin && !isOwner) break;

      if (isOwner) {
        showToast(
          "Status Pengaduan Diperbarui",
          `${event.ticketCode} — ${statusLabel(event.status)}${event.progress != null ? ` (${event.progress}%)` : ""}.`,
          event.status === "done" ? "success" : "info"
        );
      }
      refreshTicketViews();
      break;
    }

    case "ticket.photo":
      // Foto baru diunggah pemilik tiket; admin perlu data terbaru.
      if (state.role === "admin") refreshTicketViews();
      break;

    default:
      break;
  }
}

function handleMessage(raw) {
  let data;
  try {
    data = JSON.parse(String(raw));
  } catch {
    return;
  }

  if (data.type === "connected") {
    reconnectDelayMs = 1000; // koneksi berhasil — reset backoff
    document.body.dataset.realtime = "on";
    return;
  }
  handleEvent(data);
}

/**
 * Buka koneksi WebSocket bila pengguna sudah login.
 * Aman dipanggil berulang: koneksi yang sudah terbuka tidak dibuat ulang.
 */
export function connectRealtime() {
  const token = getToken();
  if (!token || socket) return;

  try {
    socket = new WebSocket(realtimeUrl());
  } catch {
    socket = null;
    scheduleReconnect();
    return;
  }

  socket.addEventListener("open", () => {
    socket.send(JSON.stringify({ type: "auth", token }));
  });

  socket.addEventListener("message", (event) => handleMessage(event.data));

  socket.addEventListener("close", () => {
    socket = null;
    document.body.dataset.realtime = "off";
    scheduleReconnect(); // token kedaluwarsa / server restart → coba lagi pelan-pelan
  });

  socket.addEventListener("error", () => {
    // close akan menyusul; reconnect ditangani di listener close.
  });
}

/** Tutup koneksi (dipanggil saat logout) dan hentikan reconnect berjalan. */
export function disconnectRealtime() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (socket) {
    const closing = socket;
    socket = null;
    try {
      closing.onclose = null; // jangan picu scheduleReconnect saat logout
      closing.close(1000, "logout");
    } catch {
      /* koneksi sudah tutup */
    }
  }
  document.body.dataset.realtime = "off";
}
