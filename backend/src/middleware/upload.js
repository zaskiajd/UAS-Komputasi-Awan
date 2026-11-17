/* ==========================================================================
   middleware/upload.js — Penerimaan multipart/form-data untuk foto pengaduan
   --------------------------------------------------------------------------
   File disimpan di memori (memoryStorage) agar dapat divalidasi dari magic
   bytes sebelum ditulis ke disk. Batas: 3 berkas, 3 MB per berkas.
   ========================================================================== */

const multer = require('multer');
const { ApiError } = require('../utils/errors');
const { MAX_PHOTOS, MAX_PHOTO_BYTES } = require('../utils/uploads');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_PHOTO_BYTES,
    files: MAX_PHOTOS,
  },
});

const MAX_MB = Math.round(MAX_PHOTO_BYTES / (1024 * 1024));

/**
 * Middleware field `photos` (maks. 3 berkas). Error multer diterjemahkan ke
 * respons API berbahasa Indonesia.
 */
function uploadPhotos(req, res, next) {
  upload.array('photos', MAX_PHOTOS)(req, res, (error) => {
    if (!error) return next();

    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return next(
          new ApiError(413, `Ukuran setiap foto maksimal ${MAX_MB} MB.`, {
            photos: `Salah satu foto melebihi batas ${MAX_MB} MB.`,
          })
        );
      }
      if (error.code === 'LIMIT_FILE_COUNT') {
        return next(
          new ApiError(422, `Maksimal ${MAX_PHOTOS} foto per pengaduan.`, {
            photos: `Jumlah foto melebihi batas ${MAX_PHOTOS}.`,
          })
        );
      }
      if (error.code === 'LIMIT_UNEXPECTED_FILE') {
        return next(
          new ApiError(
            422,
            `Field foto harus bernama "photos" dan maksimal ${MAX_PHOTOS} berkas.`,
            { photos: 'Field atau jumlah berkas tidak sesuai.' }
          )
        );
      }
      return next(
        new ApiError(422, 'Berkas foto tidak dapat diproses.', {
          photos: 'Periksa kembali berkas yang dikirim.',
        })
      );
    }

    return next(error);
  });
}

module.exports = { uploadPhotos };
