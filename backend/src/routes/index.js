/* ==========================================================================
   routes/index.js — Pemasangan seluruh router di bawah /api
   --------------------------------------------------------------------------
   Anggota 5 (endpoint kategori/lokasi/tanggapan/riwayat) cukup menambahkan:
     router.use('/categories', require('./category.routes'));
   dan memakai `authenticate` + `requireRole('admin')` dari middleware/auth.js.
   ========================================================================== */

const express = require('express');
const { query } = require('../config/db');
const { ok } = require('../utils/response');
const { asyncHandler } = require('../utils/errors');

const router = express.Router();

router.get(
  '/health',
  asyncHandler(async (_req, res) => {
    await query('SELECT 1');
    return ok(res, { status: 'ok', uptime: Math.round(process.uptime()) }, 'API berjalan.');
  })
);

router.use('/auth', require('./auth.routes'));
router.use('/tickets', require('./ticket.routes'));

module.exports = router;
