/* ==========================================================================
   middleware/auth.js — Autentikasi JWT + otorisasi berbasis role
   --------------------------------------------------------------------------
   authenticate  : verifikasi token Bearer, muat user dari DB → req.user
   requireRole() : batasi endpoint untuk role tertentu ('student' / 'admin')
   ========================================================================== */

const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const { JWT_SECRET } = require('../config/env');
const { asyncHandler, unauthorized, forbidden } = require('../utils/errors');

const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw unauthorized('Token tidak ditemukan. Sertakan header Authorization: Bearer <token>.');
  }

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
  } catch (error) {
    throw unauthorized(
      error.name === 'TokenExpiredError'
        ? 'Sesi telah berakhir. Silakan login kembali.'
        : 'Token tidak valid.'
    );
  }

  // Muat ulang dari DB: akun yang sudah dihapus / role yang berubah langsung berlaku.
  const { rows } = await query(
    `SELECT id, nim, name, email, role, faculty
       FROM users
      WHERE id = $1`,
    [payload.sub]
  );
  if (rows.length === 0) throw unauthorized('Akun tidak ditemukan. Silakan login kembali.');

  req.user = rows[0];
  next();
});

/** @param {...('student'|'admin')} roles */
const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(forbidden('Role Anda tidak diizinkan mengakses endpoint ini.'));
    }
    return next();
  };

module.exports = { authenticate, requireRole };
