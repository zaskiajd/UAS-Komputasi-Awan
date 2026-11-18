/* ==========================================================================
   realtime/bus.js — Event bus internal untuk notifikasi real-time
   --------------------------------------------------------------------------
   Layanan (ticket.service, photo.service) memanggil ticketEvent() SETELAH
   transaksi DB selesai. Bus mengambil data minimum tiket lalu menyerahkan
   broadcast ke socket.js (dipasang saat server boot).
   Desainnya sengaja longgar: bila socket gagal/salah konfigurasi, event
   tidak boleh membuat transaksi utama gagal — semua error diserap.
   ========================================================================== */

const { query } = require('../config/db');
const { broadcast } = require('./socket');

/**
 * Terbitkan event perubahan tiket ke klien WebSocket.
 * @param {number} ticketId ID numerik tiket
 * @param {'ticket.created'|'ticket.status'|'ticket.photo'|'ticket.deleted'} type
 * @param {{actor?: string}} [meta]
 */
async function ticketEvent(ticketId, type, meta = {}) {
  try {
    const { rows } = await query(
      `SELECT id, ticket_code, title, status, progress, owner_id
         FROM tickets
        WHERE id = $1 AND deleted_by_student_at IS NULL`,
      [ticketId]
    );
    if (rows.length === 0) return;
    const t = rows[0];

    broadcast({
      type,
      ticketId: t.id,
      ticketCode: t.ticket_code,
      title: t.title,
      status: t.status,
      progress: t.progress,
      ownerId: t.owner_id,
      actor: meta.actor || null,
      at: new Date().toISOString(),
    });
  } catch (error) {
    // Notifikasi tidak boleh menggagalkan operasi utama.
    console.error('[realtime] gagal menyiarkan event tiket:', error.message);
  }
}

module.exports = { ticketEvent };
