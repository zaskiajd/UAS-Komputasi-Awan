/* ==========================================================================
   config/env.js — Konfigurasi aplikasi dari environment variable
   --------------------------------------------------------------------------
   Membaca process.env dan memvalidasi nilai yang kritis untuk keamanan.
   ========================================================================== */

const path = require('path');

// Muat backend/.env (aman dipanggil berulang; tidak menimpa env yang sudah ada).
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';

const WEAK_SECRETS = new Set(['', 'ganti_ini', 'secret', 'changeme', 'password']);

const JWT_SECRET = process.env.JWT_SECRET || '';
if (WEAK_SECRETS.has(JWT_SECRET) || JWT_SECRET.length < 16) {
  if (isProduction) {
    throw new Error(
      'JWT_SECRET lemah/belum diset. Isi minimal 16 karakter acak di environment ' +
        'variable platform deployment (jangan memakai nilai contoh).'
    );
  }
  console.warn(
    '[env] PERINGATAN: JWT_SECRET lemah/belum diset. Aman hanya untuk development lokal.'
  );
}

/** Daftar origin frontend yang diizinkan (pisahkan dengan koma). */
const CORS_ORIGINS = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

module.exports = {
  NODE_ENV,
  isProduction,
  PORT: Number(process.env.PORT || 3000),
  JWT_SECRET: JWT_SECRET || 'dev-only-insecure-secret',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '8h',
  CORS_ORIGINS,
};
