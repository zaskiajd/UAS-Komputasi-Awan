/* ==========================================================================
   realtime/socket.js — Server WebSocket untuk notifikasi real-time
   --------------------------------------------------------------------------
   Transport: ws (WebSocket) di path /api/ws pada HTTP server yang sama,
   sehingga tidak butuh port baru dan tetap melewati Nginx.

   Autentikasi: setelah koneksi terbuka, client WAJIB mengirim satu pesan
   JSON { "type": "auth", "token": "<JWT>" } dalam 10 detik. Token
   diverifikasi dengan aturan yang sama dengan middleware/auth.js
   (HS256 + muat ulang user dari DB), lalu user disimpan di koneksi.

   Routing event:
     - semua admin online menerima seluruh event tiket;
     - mahasiswa hanya menerima event tiket miliknya (owner_id cocok).
   ========================================================================== */

const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');
const { query } = require('../config/db');

const AUTH_TIMEOUT_MS = 10_000;
const HEARTBEAT_MS = 30_000;

/** Koneksi yang sudah lolos autentikasi. */
const clients = new Set();
let wss = null;

function heartbeat() {
  this.isAlive = true;
}

async function authenticateMessage(client, raw) {
  let message;
  try {
    message = JSON.parse(String(raw));
  } catch {
    client.close(4400, 'Pesan harus berupa JSON.');
    return;
  }

  if (message.type !== 'auth' || typeof message.token !== 'string') {
    client.close(4401, 'Kirim { type: "auth", token } terlebih dahulu.');
    return;
  }

  try {
    const payload = jwt.verify(message.token, JWT_SECRET, { algorithms: ['HS256'] });
    const { rows } = await query(
      `SELECT id, nim, name, role FROM users WHERE id = $1`,
      [payload.sub]
    );
    if (rows.length === 0) {
      client.close(4401, 'Akun tidak ditemukan.');
      return;
    }

    client.user = rows[0];
    clients.add(client);
    client.send(JSON.stringify({ type: 'connected', role: client.user.role }));
    console.log(`[realtime] ${client.user.role} ${client.user.name} terhubung (${clients.size} klien)`);
  } catch (error) {
    client.close(4401, 'Token tidak valid atau kedaluwarsa.');
    console.error('[realtime] autentikasi gagal:', error.message);
  }
}

function initRealtime(server) {
  wss = new WebSocketServer({ server, path: '/api/ws' });

  wss.on('connection', (client) => {
    client.isAlive = true;
    client.on('pong', heartbeat);

    const authTimer = setTimeout(() => {
      if (!client.user) client.close(4401, 'Autentikasi tidak diterima dalam 10 detik.');
    }, AUTH_TIMEOUT_MS);
    client.once('close', () => clearTimeout(authTimer));

    client.on('message', (raw) => authenticateMessage(client, raw));
    client.on('close', () => {
      clients.delete(client);
      if (client.user) {
        console.log(`[realtime] ${client.user.name} terputus (${clients.size} klien)`);
      }
    });
  });

  // Ping periodik: matikan koneksi mati (mobile/tab tertutup) agar
  // set clients tidak menumpuk.
  const interval = setInterval(() => {
    for (const client of wss.clients) {
      if (client.isAlive === false) {
        client.terminate();
        continue;
      }
      client.isAlive = false;
      client.ping();
    }
  }, HEARTBEAT_MS);
  wss.on('close', () => clearInterval(interval));

  console.log('[realtime] server WebSocket aktif di path /api/ws');
  return wss;
}

/**
 * Siarkan event ke klien yang berhak: semua admin + pemilik tiket.
 * Aman dipanggil walau server belum diinisialisasi (no-op).
 */
function broadcast(payload) {
  if (!wss) return;
  const data = JSON.stringify(payload);
  for (const client of clients) {
    if (client.readyState !== 1 /* WebSocket.OPEN */) continue;
    const isAdmin = client.user.role === 'admin';
    const isOwner = payload.ownerId != null && client.user.id === payload.ownerId;
    if (isAdmin || isOwner) {
      client.send(data, () => {
        /* antrean ws menangani backpressure; error per-klien diabaikan */
      });
    }
  }
}

function closeRealtime() {
  if (!wss) return Promise.resolve();
  for (const client of clients) client.close(1001, 'Server dimatikan.');
  return new Promise((resolve) => wss.close(() => resolve()));
}

module.exports = { initRealtime, broadcast, closeRealtime };
