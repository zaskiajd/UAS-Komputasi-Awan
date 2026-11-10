/* ==========================================================================
   utils/errors.js — Error terkontrol (dilempar controller/service)
   ========================================================================== */

class ApiError extends Error {
  /**
   * @param {number} status kode HTTP
   * @param {string} message pesan untuk pengguna
   * @param {Record<string,string>} [errors] detail per field
   */
  constructor(status, message, errors) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
  }
}

const badRequest = (message, errors) => new ApiError(400, message, errors);
const unauthorized = (message = 'Autentikasi diperlukan.') => new ApiError(401, message);
const forbidden = (message = 'Anda tidak memiliki akses ke sumber daya ini.') =>
  new ApiError(403, message);
const notFound = (message = 'Data tidak ditemukan.') => new ApiError(404, message);
const conflict = (message, errors) => new ApiError(409, message, errors);

/** Bungkus handler async agar error otomatis diteruskan ke error middleware. */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = {
  ApiError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  asyncHandler,
};
