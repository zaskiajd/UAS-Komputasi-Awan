/* ==========================================================================
   utils/validate.js — Validasi input tanpa dependensi tambahan
   --------------------------------------------------------------------------
   Setiap validator mengembalikan { value, errors }. Bila errors tidak kosong,
   controller melempar 422 lewat assertValid().
   ========================================================================== */

const { ApiError } = require('./errors');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NIM_RE = /^[0-9]{6,20}$/;

const STATUSES = ['review', 'progress', 'waiting', 'done', 'rejected'];
const PRIORITIES = ['Tinggi', 'Sedang', 'Rendah'];

/** Ambil string rapi (trim) atau undefined bila bukan string. */
const str = (v) => (typeof v === 'string' ? v.trim() : undefined);

function assertValid(errors) {
  if (Object.keys(errors).length > 0) {
    throw new ApiError(422, 'Data yang dikirim tidak valid.', errors);
  }
}

/** Email wajib lowercase+trim sebelum menyentuh DB (constraint users.email). */
const normalizeEmail = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : '');

function validateRegister(body = {}) {
  const errors = {};
  const name = str(body.name);
  const nim = str(body.nim);
  const faculty = str(body.faculty);
  const email = normalizeEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : '';

  if (!name || name.length < 3 || name.length > 100) {
    errors.name = 'Nama lengkap wajib diisi (3–100 karakter).';
  }
  if (!nim || !NIM_RE.test(nim)) {
    errors.nim = 'NIM harus berupa 6–20 digit angka.';
  }
  if (!faculty || faculty.length > 100) {
    errors.faculty = 'Fakultas/jurusan wajib diisi.';
  }
  if (!email || !EMAIL_RE.test(email) || email.length > 254) {
    errors.email = 'Format email tidak valid.';
  }
  if (password.length < 8) {
    errors.password = 'Kata sandi minimal 8 karakter.';
  } else if (password.length > 72) {
    // bcrypt hanya membaca 72 byte pertama; tolak agar tidak terpotong diam-diam.
    errors.password = 'Kata sandi maksimal 72 karakter.';
  }
  if (body.confirmPassword !== undefined && body.confirmPassword !== body.password) {
    errors.confirmPassword = 'Konfirmasi kata sandi tidak cocok.';
  }

  return { value: { name, nim, faculty, email, password }, errors };
}

function validateLogin(body = {}) {
  const errors = {};
  const email = normalizeEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : '';
  const role = body.role === undefined || body.role === '' ? undefined : body.role;

  if (!email || !EMAIL_RE.test(email)) errors.email = 'Format email tidak valid.';
  if (!password) errors.password = 'Kata sandi wajib diisi.';
  if (role !== undefined && !['student', 'admin'].includes(role)) {
    errors.role = "Role harus 'student' atau 'admin'.";
  }

  return { value: { email, password, role }, errors };
}

/**
 * Validasi pembuatan/perubahan tiket.
 * @param {object} body
 * @param {{partial?: boolean}} opts partial=true → field boleh tidak ada (PATCH)
 */
function validateTicketInput(body = {}, { partial = false } = {}) {
  const errors = {};
  const value = {};
  const has = (k) => body[k] !== undefined;

  if (!partial || has('title')) {
    const title = str(body.title);
    if (!title || title.length < 3 || title.length > 120) {
      errors.title = 'Judul wajib diisi (3–120 karakter).';
    } else value.title = title;
  }

  if (!partial || has('description')) {
    const description = str(body.description);
    if (!description || description.length < 5 || description.length > 2000) {
      errors.description = 'Deskripsi wajib diisi (5–2000 karakter).';
    } else value.description = description;
  }

  if (!partial || has('category')) {
    const category = str(body.category);
    if (!category || !/^[a-z0-9_-]{1,40}$/.test(category)) {
      errors.category = 'Kode kategori wajib diisi (mis. ac, projector, network).';
    } else value.category = category;
  }

  if (!partial || has('priority')) {
    const priority = body.priority === undefined ? 'Sedang' : body.priority;
    if (!PRIORITIES.includes(priority)) {
      errors.priority = `Prioritas harus salah satu dari: ${PRIORITIES.join(', ')}.`;
    } else value.priority = priority;
  }

  // Lokasi: boleh lewat locationId ATAU nama gedung (+ ruang). Pada POST salah satu wajib.
  const hasLocation = has('locationId') || has('building') || has('room');
  if (!partial && !has('locationId') && !str(body.building)) {
    errors.building = 'Gedung/lokasi wajib diisi.';
  }
  if (hasLocation) {
    if (has('locationId') && body.locationId !== null) {
      const id = Number(body.locationId);
      if (!Number.isInteger(id) || id <= 0) errors.locationId = 'locationId tidak valid.';
      else value.locationId = id;
    }
    if (has('building')) {
      const building = str(body.building);
      if (!building || building.length > 150) errors.building = 'Nama gedung tidak valid.';
      else value.building = building;
    }
    if (has('room')) {
      const room = str(body.room) ?? '';
      if (room.length > 150) errors.room = 'Ruang/lantai maksimal 150 karakter.';
      else value.room = room;
    }
  }

  if (partial && has('room') && !has('building') && !has('locationId')) {
    errors.room = 'Untuk mengubah ruang, sertakan juga building atau locationId.';
  }

  if (has('photoUrl') && body.photoUrl !== null && body.photoUrl !== '') {
    const url = str(body.photoUrl);
    if (!url || url.length > 500 || !/^https?:\/\//i.test(url)) {
      errors.photoUrl = 'photoUrl harus berupa URL http(s).';
    } else value.photoUrl = url;
  }

  if (partial && Object.keys(value).length === 0 && Object.keys(errors).length === 0) {
    errors._ = 'Tidak ada field yang diubah.';
  }

  return { value, errors };
}

function validateStatusUpdate(body = {}) {
  const errors = {};
  const value = {};

  if (!STATUSES.includes(body.status)) {
    errors.status = `Status harus salah satu dari: ${STATUSES.join(', ')}.`;
  } else value.status = body.status;

  if (body.progress !== undefined && body.progress !== null) {
    const p = Number(body.progress);
    if (!Number.isInteger(p) || p < 0 || p > 100) {
      errors.progress = 'Progress harus bilangan bulat 0–100.';
    } else value.progress = p;
  }

  if (body.note !== undefined && body.note !== null) {
    const note = str(body.note);
    if (note === undefined || note.length > 1000) errors.note = 'Catatan maksimal 1000 karakter.';
    else if (note) value.note = note;
  }

  if (body.teamId !== undefined && body.teamId !== null && body.teamId !== '') {
    const teamId = str(body.teamId);
    if (!teamId || !/^[a-z0-9_-]{1,40}$/.test(teamId)) {
      errors.teamId = 'ID tim tidak valid.';
    } else value.teamId = teamId;
  }

  if (body.assignee !== undefined && body.assignee !== null && body.assignee !== '') {
    const assignee = str(body.assignee);
    if (!assignee || !/^[a-z0-9_-]{1,40}$/.test(assignee)) {
      errors.assignee = 'ID teknisi PIC tidak valid.';
    } else value.assignee = assignee;
  }

  if (body.supporters !== undefined && body.supporters !== null) {
    if (!Array.isArray(body.supporters) || body.supporters.length > 20) {
      errors.supporters = 'Daftar teknisi pendukung harus berupa array (maks. 20).';
    } else {
      const cleaned = [];
      for (const item of body.supporters) {
        const techId = str(item);
        if (!techId || !/^[a-z0-9_-]{1,40}$/.test(techId)) {
          errors.supporters = 'ID teknisi pendukung tidak valid.';
          break;
        }
        if (!cleaned.includes(techId)) cleaned.push(techId);
      }
      if (!errors.supporters) value.supporters = cleaned;
    }
  }

  if (body.priority !== undefined && body.priority !== null && body.priority !== '') {
    if (!PRIORITIES.includes(body.priority)) {
      errors.priority = `Prioritas harus salah satu dari: ${PRIORITIES.join(', ')}.`;
    } else value.priority = body.priority;
  }

  if (body.instruction !== undefined && body.instruction !== null) {
    const instruction = str(body.instruction);
    if (instruction === undefined || instruction.length > 1000) {
      errors.instruction = 'Instruksi maksimal 1000 karakter.';
    } else if (instruction) value.instruction = instruction;
  }

  return { value, errors };
}

/** Parameter :id boleh berupa id numerik atau ticket_code (#CC-2026-0916). */
function parseTicketRef(raw) {
  let ref = String(raw || '');
  try {
    ref = decodeURIComponent(ref);
  } catch {
    return null;
  }
  ref = ref.trim();
  if (/^[0-9]{1,9}$/.test(ref)) return { by: 'id', value: Number(ref) };
  if (/^#CC-[0-9]{4}-[0-9]{4,}$/.test(ref)) return { by: 'code', value: ref };
  if (/^CC-[0-9]{4}-[0-9]{4,}$/.test(ref)) return { by: 'code', value: `#${ref}` };
  return null;
}

function validateGoogleAuth(body = {}) {
  const errors = {};
  const credential = str(body?.credential);
  if (!credential) {
    errors.credential = 'Kredensial Google (ID token) wajib dikirimkan.';
  }
  return { value: { credential }, errors };
}

module.exports = {
  STATUSES,
  PRIORITIES,
  assertValid,
  normalizeEmail,
  validateRegister,
  validateLogin,
  validateGoogleAuth,
  validateTicketInput,
  validateStatusUpdate,
  parseTicketRef,
};
