/* ==========================================================================
   utils/response.js — Format respons API yang seragam
   --------------------------------------------------------------------------
   Sukses : { success: true,  data: ..., message: "..." }
   Gagal  : { success: false, message: "...", errors?: { field: "pesan" } }
   ========================================================================== */

const ok = (res, data = null, message = 'Berhasil', status = 200, meta) =>
  res.status(status).json({ success: true, data, message, ...(meta ? { meta } : {}) });

const created = (res, data = null, message = 'Berhasil dibuat') =>
  ok(res, data, message, 201);

module.exports = { ok, created };
