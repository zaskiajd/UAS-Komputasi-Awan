/* ==========================================================================
   utils/uploads.js — Penyimpanan berkas foto pengaduan
   --------------------------------------------------------------------------
   - Foto disimpan di UPLOAD_DIR dengan nama UUID + ekstensi.
   - Jenis berkas ditentukan dari magic bytes, bukan dari Content-Type klien.
   - Metadata disimpan di tabel ticket_photos (lihat services/photo.service.js).
   ========================================================================== */

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { randomUUID } = require('crypto');
const { UPLOAD_DIR } = require('../config/env');

const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

const EXTENSION_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

/** Pastikan folder unggahan ada; aman dipanggil berulang. */
function ensureUploadDir() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  return UPLOAD_DIR;
}

/**
 * Deteksi jenis gambar dari magic bytes.
 * @param {Buffer} buffer
 * @returns {{mimeType:string, extension:string}|null}
 */
function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mimeType: 'image/jpeg', extension: '.jpg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return { mimeType: 'image/png', extension: '.png' };
  }

  // WebP: "RIFF" .... "WEBP"
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { mimeType: 'image/webp', extension: '.webp' };
  }

  return null;
}

/** Perbaiki nama berkas UTF-8 yang terbaca sebagai latin1 oleh multipart parser. */
function decodeOriginalName(name) {
  const value = String(name || '');
  if (!value) return '';
  // Multer mengurai filename sebagai latin1; jika semua karakter <= U+00FF,
  // coba tafsirkan ulang sebagai UTF-8 bila hasilnya valid.
  if (!/[^\u0000-\u00ff]/.test(value)) {
    const decoded = Buffer.from(value, 'latin1').toString('utf8');
    if (!decoded.includes('\ufffd')) return decoded;
  }
  return value;
}

/**
 * Sanitasi nama asli: hanya nama dasar, tanpa karakter kontrol/path.
 * Nilai ini hanya untuk informasi; URL selalu memakai nama UUID.
 */
function sanitizeOriginalName(name) {
  const base = path.basename(decodeOriginalName(name).replace(/\\/g, '/'));
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
  return cleaned || 'foto';
}

/** URL publik untuk sebuah berkas di UPLOAD_DIR. */
function photoUrl(fileName) {
  return `/uploads/${fileName}`;
}

/**
 * Tulis buffer ke UPLOAD_DIR dengan nama UUID unik.
 * @returns {Promise<string>} nama berkas (tanpa folder)
 */
async function writePhotoFile(buffer, extension) {
  ensureUploadDir();
  const fileName = `${randomUUID()}${extension}`;
  await fsp.writeFile(path.join(UPLOAD_DIR, fileName), buffer, { flag: 'wx' });
  return fileName;
}

/** Hapus satu berkas; error selain ENOENT dicatat agar tidak menutupi respons API. */
async function removeUploadFile(fileName) {
  if (!fileName || fileName !== path.basename(fileName)) return;
  try {
    await fsp.unlink(path.join(UPLOAD_DIR, fileName));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(`[uploads] gagal menghapus ${fileName}:`, error.message);
    }
  }
}

async function removeUploadFiles(fileNames) {
  await Promise.all((fileNames || []).map((name) => removeUploadFile(name)));
}

/** Bentuk objek foto untuk respons API. */
function mapPhoto(row) {
  return {
    id: Number(row.id),
    url: photoUrl(row.file_name),
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    createdAt: row.created_at,
  };
}

module.exports = {
  MAX_PHOTOS,
  MAX_PHOTO_BYTES,
  EXTENSION_BY_MIME,
  ensureUploadDir,
  detectImageType,
  sanitizeOriginalName,
  photoUrl,
  writePhotoFile,
  removeUploadFile,
  removeUploadFiles,
  mapPhoto,
};
