/* ==========================================================================
   server.js — Titik masuk: menjalankan HTTP server
   --------------------------------------------------------------------------
   Pemakaian:  cd backend && npm start     (atau: npm run dev)
   ========================================================================== */

const { createApp } = require('./src/app');
const { PORT } = require('./src/config/env');
const { pool } = require('./src/config/db');
const { initRealtime, closeRealtime } = require('./src/realtime/socket');

const app = createApp();

const server = app.listen(PORT, () => {
  console.log(`[server] CampusCare API berjalan di port ${PORT}`);
});

// Notifikasi real-time berbagi HTTP server yang sama (path /api/ws).
initRealtime(server);

// Tutup koneksi dengan rapi saat PaaS menghentikan/restart proses.
function shutdown(signal) {
  console.log(`[server] ${signal} diterima, menutup server...`);
  server.close(async () => {
    await closeRealtime();
    await pool.end().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
