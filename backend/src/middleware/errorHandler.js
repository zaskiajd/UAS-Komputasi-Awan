/* ==========================================================================
   middleware/errorHandler.js — 404 + penanganan error terpusat
   ========================================================================== */

const { isProduction } = require('../config/env');

const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    message: `Endpoint ${req.method} ${req.originalUrl} tidak ditemukan.`,
  });
};

/** Terjemahkan error PostgreSQL yang umum menjadi respons yang bermakna. */
function mapPgError(error) {
  switch (error.code) {
    case '23505':
      return { status: 409, message: 'Data duplikat: nilai tersebut sudah digunakan.' };
    case '23503':
      return { status: 409, message: 'Data masih terhubung dengan data lain atau referensi tidak ada.' };
    case '23514':
    case '23502':
    case '22P02':
    case '22001':
      return { status: 400, message: 'Data yang dikirim melanggar aturan basis data.' };
    default:
      return null;
  }
}

// eslint-disable-next-line no-unused-vars
const errorHandler = (error, req, res, _next) => {
  // Body JSON rusak / terlalu besar (dari express.json)
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'Body request bukan JSON yang valid.' });
  }
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'Body request terlalu besar.' });
  }

  if (error.name === 'ApiError') {
    const body = { success: false, message: error.message };
    if (error.errors) body.errors = error.errors;
    return res.status(error.status).json(body);
  }

  const mapped = mapPgError(error);
  if (mapped) {
    return res.status(mapped.status).json({ success: false, message: mapped.message });
  }

  console.error(`[error] ${req.method} ${req.originalUrl}`, error);
  return res.status(500).json({
    success: false,
    message: 'Terjadi kesalahan pada server.',
    ...(isProduction ? {} : { detail: error.message }),
  });
};

module.exports = { notFoundHandler, errorHandler };
