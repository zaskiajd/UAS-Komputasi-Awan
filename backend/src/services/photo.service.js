/* ==========================================================================
   services/photo.service.js — Unggah & hapus foto pengaduan
   --------------------------------------------------------------------------
   Aturan:
   - Hanya pemilik tiket (role student) yang boleh menambah/menghapus foto.
   - Maksimal 3 foto per tiket; baris tiket dikunci (FOR UPDATE) agar dua
     unggahan bersamaan tidak melewati batas.
   - Berkas ditulis ke disk lebih dulu, lalu metadata dimasukkan dalam
     transaksi. Bila transaksi gagal, berkas yang sudah ditulis dibersihkan.
   - tickets.photo_url selalu disinkronkan dengan foto pertama.
   ========================================================================== */

const { withTransaction } = require('../config/db');
const { ApiError, notFound, conflict } = require('../utils/errors');
const { accessFilter } = require('./ticket.service');
const { ticketEvent } = require('../realtime/bus');
const {
  MAX_PHOTOS,
  detectImageType,
  mapPhoto,
  removeUploadFile,
  removeUploadFiles,
  sanitizeOriginalName,
  writePhotoFile,
} = require('../utils/uploads');

/** Ambil semua foto tiket dengan urutan tampil yang stabil. */
function listPhotoRows(client, ticketId) {
  return client
    .query(
      `SELECT id, file_name, mime_type, size_bytes, created_at
         FROM ticket_photos
        WHERE ticket_id = $1
        ORDER BY created_at ASC, id ASC`,
      [ticketId]
    )
    .then((result) => result.rows);
}

/** Samakan tickets.photo_url dengan URL foto pertama (atau NULL). */
function syncPrimaryPhoto(client, ticketId) {
  return client.query(
    `UPDATE tickets
        SET photo_url = (
          SELECT '/uploads/' || file_name
            FROM ticket_photos
           WHERE ticket_id = $1
           ORDER BY created_at ASC, id ASC
           LIMIT 1
        )
      WHERE id = $1`,
    [ticketId]
  );
}

/** Kunci tiket + pastikan boleh diakses user; kembalikan baris tiket. */
async function lockTicket(client, ref, user) {
  const { where, params } = accessFilter(ref, user);
  const { rows } = await client.query(
    `SELECT id, status FROM tickets WHERE ${where} FOR UPDATE`,
    params
  );
  if (rows.length === 0) throw notFound('Pengaduan tidak ditemukan.');
  return rows[0];
}

/**
 * Tambah 1–3 foto.
 * @param {{by:'id'|'code', value:number|string}} ref
 * @param {object} user
 * @param {Express.Multer.File[]} files
 * @returns {Promise<{photos: object[], photoUrl: string|null}>}
 */
async function addPhotos(ref, user, files) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new ApiError(422, 'Pilih minimal satu foto yang akan diunggah.', {
      photos: 'Berkas foto belum dipilih.',
    });
  }

  // Validasi magic bytes sebelum menyentuh disk/database.
  const prepared = files.map((file) => {
    const detected = detectImageType(file.buffer);
    if (!detected) {
      throw new ApiError(
        422,
        'Format foto tidak didukung. Gunakan JPEG, PNG, atau WebP.',
        { photos: 'Salah satu berkas bukan gambar JPEG/PNG/WebP yang valid.' }
      );
    }
    return {
      buffer: file.buffer,
      mimeType: detected.mimeType,
      extension: detected.extension,
      originalName: sanitizeOriginalName(file.originalname),
      sizeBytes: file.size,
    };
  });

  if (prepared.length > MAX_PHOTOS) {
    throw new ApiError(422, `Maksimal ${MAX_PHOTOS} foto per pengaduan.`, {
      photos: `Jumlah foto melebihi batas ${MAX_PHOTOS}.`,
    });
  }

  const writtenFiles = [];
  let committed = false;
  let ticketId = null; // dicatat untuk event real-time setelah commit

  try {
    const photos = await withTransaction(async (client) => {
      const ticket = await lockTicket(client, ref, user);
      ticketId = ticket.id;

      if (ticket.status === 'done') {
        throw conflict(
          'Pengaduan yang sudah selesai tidak dapat ditambahi foto. Hubungi admin Sarpras bila perlu.'
        );
      }

      const countResult = await client.query(
        'SELECT COUNT(*)::int AS count FROM ticket_photos WHERE ticket_id = $1',
        [ticket.id]
      );
      const existing = Number(countResult.rows[0].count);
      if (existing + prepared.length > MAX_PHOTOS) {
        throw conflict(
          `Maksimal ${MAX_PHOTOS} foto per pengaduan. ` +
            `Tiket ini sudah memiliki ${existing} foto.`
        );
      }

      for (const photo of prepared) {
        const fileName = await writePhotoFile(photo.buffer, photo.extension);
        writtenFiles.push(fileName);
        await client.query(
          `INSERT INTO ticket_photos
             (ticket_id, file_name, original_name, mime_type, size_bytes)
           VALUES ($1, $2, $3, $4, $5)`,
          [ticket.id, fileName, photo.originalName, photo.mimeType, photo.sizeBytes]
        );
      }

      await syncPrimaryPhoto(client, ticket.id);
      const rows = await listPhotoRows(client, ticket.id);
      return rows.map(mapPhoto);
    });

    committed = true;
    // Notifikasi real-time: foto baru pada tiket.
    ticketEvent(ticketId, 'ticket.photo', { actor: user.name });
    return { photos, photoUrl: photos.length > 0 ? photos[0].url : null };
  } finally {
    // Transaksi gagal/rollback → jangan tinggalkan berkas yatim di disk.
    if (!committed) await removeUploadFiles(writtenFiles);
  }
}

/**
 * Hapus satu foto milik tiket. Baris dihapus dalam transaksi, berkas fisik
 * dibersihkan setelah commit.
 * @returns {Promise<{photos: object[], photoUrl: string|null}>}
 */
async function deletePhoto(ref, user, photoId) {
  const id = Number(photoId);
  if (!Number.isInteger(id) || id < 1) throw notFound('Foto tidak ditemukan.');

  let fileName = null;

  const photos = await withTransaction(async (client) => {
    const ticket = await lockTicket(client, ref, user);

    const result = await client.query(
      'SELECT id, file_name FROM ticket_photos WHERE id = $1 AND ticket_id = $2',
      [id, ticket.id]
    );
    if (result.rows.length === 0) throw notFound('Foto tidak ditemukan.');

    fileName = result.rows[0].file_name;
    await client.query('DELETE FROM ticket_photos WHERE id = $1', [id]);
    await syncPrimaryPhoto(client, ticket.id);

    const rows = await listPhotoRows(client, ticket.id);
    return rows.map(mapPhoto);
  });

  if (fileName) await removeUploadFile(fileName);

  return { photos, photoUrl: photos.length > 0 ? photos[0].url : null };
}

module.exports = { addPhotos, deletePhoto };
