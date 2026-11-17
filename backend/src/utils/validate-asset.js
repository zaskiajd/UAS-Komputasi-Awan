/* ==========================================================================
   utils/validate-asset.js — Validasi input inventaris aset (admin)
   --------------------------------------------------------------------------
   Setiap validator mengembalikan { value, errors }. Bila errors tidak kosong,
   controller melempar 422 lewat assertValid().
   ========================================================================== */

const { ApiError } = require('./errors');

const ASSET_CONDITIONS = ['good', 'service', 'disrupted', 'broken'];
const DEFAULT_NOTE = 'Tidak ada catatan.';
const ASSET_ID_RE = /^AST-[A-Z]{2,6}-[0-9]{4,}$/;
const CODE_RE = /^[a-z0-9_-]{1,40}$/;

/** Ambil string rapi (trim) atau undefined bila bukan string. */
const str = (v) => (typeof v === 'string' ? v.trim() : undefined);

function assertValid(errors) {
  if (Object.keys(errors).length > 0) {
    throw new ApiError(422, 'Data yang dikirim tidak valid.', errors);
  }
}

/**
 * Validasi pembuatan/perubahan aset.
 * @param {object} body
 * @param {{partial?: boolean}} opts partial=true → field boleh tidak ada (PATCH)
 */
function validateAssetInput(body = {}, { partial = false } = {}) {
  const errors = {};
  const value = {};
  const has = (k) => body[k] !== undefined;

  if (!partial || has('name')) {
    const name = str(body.name);
    if (!name || name.length > 150) {
      errors.name = 'Nama aset wajib diisi (maks. 150 karakter).';
    } else value.name = name;
  }

  if (!partial || has('category')) {
    const category = str(body.category);
    if (!category || !CODE_RE.test(category)) {
      errors.category = 'Kode kategori wajib diisi (mis. ac, projector, network).';
    } else value.category = category;
  }

  if (!partial || has('location')) {
    const location = str(body.location);
    if (!location || location.length > 150) {
      errors.location = 'Lokasi aset wajib diisi (maks. 150 karakter).';
    } else if (!location.split('•')[0].trim()) {
      errors.location = 'Nama gedung pada lokasi wajib diisi.';
    } else value.location = location;
  }

  if (!partial || has('zone')) {
    const zone = str(body.zone);
    if (!zone || zone.length > 40) {
      errors.zone = 'Zona kampus wajib diisi (maks. 40 karakter).';
    } else value.zone = zone;
  }

  if (!partial || has('teamId')) {
    const teamId = str(body.teamId);
    if (!teamId || !CODE_RE.test(teamId)) {
      errors.teamId = 'Tim penanggung jawab wajib dipilih.';
    } else value.teamId = teamId;
  }

  if (has('condition')) {
    const condition = str(body.condition);
    if (!ASSET_CONDITIONS.includes(condition)) {
      errors.condition = `Kondisi harus salah satu dari: ${ASSET_CONDITIONS.join(', ')}.`;
    } else value.condition = condition;
  } else if (!partial) {
    value.condition = 'good';
  }

  if (has('note')) {
    const note = str(body.note);
    if (note === undefined || note.length > 1000) {
      errors.note = 'Catatan maksimal 1000 karakter.';
    } else value.note = note || DEFAULT_NOTE;
  } else if (!partial) {
    value.note = DEFAULT_NOTE;
  }

  if (partial && Object.keys(value).length === 0 && Object.keys(errors).length === 0) {
    errors._ = 'Tidak ada field yang diubah.';
  }

  return { value, errors };
}

/** Parameter :id aset. ID tidak valid diperlakukan seperti data tidak ditemukan. */
function parseAssetRef(raw) {
  let ref = String(raw || '');
  try {
    ref = decodeURIComponent(ref);
  } catch {
    return null;
  }
  ref = ref.trim().toUpperCase();
  return ASSET_ID_RE.test(ref) ? ref : null;
}

module.exports = {
  ASSET_CONDITIONS,
  DEFAULT_NOTE,
  assertValid,
  validateAssetInput,
  parseAssetRef,
};
