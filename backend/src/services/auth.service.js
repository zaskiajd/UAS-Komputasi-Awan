/* ==========================================================================
   services/auth.service.js — Register, login, Google OAuth, dan pembuatan JWT
   ========================================================================== */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { query } = require('../config/db');
const {
  JWT_SECRET,
  JWT_EXPIRES_IN,
  GOOGLE_CLIENT_ID,
  ALLOWED_EMAIL_DOMAINS,
} = require('../config/env');
const { ApiError, unauthorized, forbidden } = require('../utils/errors');

const BCRYPT_ROUNDS = 10;

// Hash palsu agar waktu respons login "email tidak ada" ≈ "sandi salah"
// (mencegah enumerasi akun lewat timing).
const DUMMY_HASH = bcrypt.hashSync('campuscare-dummy-password', BCRYPT_ROUNDS);

let oauth2Client = null;
let googleVerifierStub = null; // untuk keperluan testing tanpa kontak ke server Google sungguhan

/**
 * Stub verifier untuk keperluan unit test.
 * @param {Function|null} fn
 */
function _setGoogleVerifierForTesting(fn) {
  googleVerifierStub = fn;
}

/**
 * Verifikasi ID token dari Google Identity Services.
 * Mengembalikan payload token (sub, email, email_verified, name, dll).
 */
async function verifyGoogleCredential(credential) {
  if (googleVerifierStub) {
    return googleVerifierStub(credential);
  }

  if (!GOOGLE_CLIENT_ID) {
    throw new ApiError(500, 'GOOGLE_CLIENT_ID belum dikonfigurasi di server.');
  }

  if (!oauth2Client) {
    oauth2Client = new OAuth2Client(GOOGLE_CLIENT_ID);
  }

  const ticket = await oauth2Client.verifyIdToken({
    idToken: credential,
    audience: GOOGLE_CLIENT_ID,
  });

  return ticket.getPayload();
}

const toPublicUser = (row) => ({
  id: row.id,
  nim: row.nim,
  name: row.name,
  email: row.email,
  role: row.role,
  faculty: row.faculty,
});

const signToken = (user) =>
  jwt.sign({ role: user.role }, JWT_SECRET, {
    algorithm: 'HS256',
    subject: String(user.id),
    expiresIn: JWT_EXPIRES_IN,
  });

/**
 * Registrasi mahasiswa. Role SELALU 'student' — tidak pernah diambil dari input,
 * sehingga tidak ada celah membuat akun admin lewat endpoint publik.
 */
async function register({ name, nim, faculty, email, password }) {
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  try {
    const { rows } = await query(
      `INSERT INTO users (nim, name, email, password_hash, role, faculty, auth_provider)
       VALUES ($1, $2, $3, $4, 'student', $5, 'local')
       RETURNING id, nim, name, email, role, faculty`,
      [nim, name, email, passwordHash, faculty]
    );
    const user = toPublicUser(rows[0]);
    return { token: signToken(user), user };
  } catch (error) {
    if (error.code === '23505') {
      const constraint = String(error.constraint || '');
      if (constraint.includes('nim')) {
        throw new ApiError(409, 'NIM sudah terdaftar.', { nim: 'NIM sudah terdaftar.' });
      }
      throw new ApiError(409, 'Email sudah terdaftar.', { email: 'Email sudah terdaftar.' });
    }
    throw error;
  }
}

async function login({ email, password, role }) {
  const { rows } = await query(
    `SELECT id, nim, name, email, role, faculty, password_hash, auth_provider
       FROM users
      WHERE email = $1`,
    [email]
  );
  const row = rows[0];

  // Gunakan DUMMY_HASH jika akun tidak ditemukan ATAU jika akun tidak memiliki password_hash
  // (misal akun Google-only), sehingga bcrypt tidak crash dan timing komputasi tetap terjaga.
  const hashToCompare = row && row.password_hash ? row.password_hash : DUMMY_HASH;
  const passwordOk = await bcrypt.compare(password, hashToCompare);

  if (!row || !row.password_hash || !passwordOk) {
    throw unauthorized('Email atau kata sandi salah.');
  }

  // Chip peran di form login: bila dipilih, harus cocok dengan role akun.
  if (role && role !== row.role) {
    throw forbidden(
      role === 'admin'
        ? 'Akun ini bukan akun admin Sarpras.'
        : 'Akun ini bukan akun mahasiswa. Pilih peran Admin untuk masuk.'
    );
  }

  const user = toPublicUser(row);
  return { token: signToken(user), user };
}

/**
 * Autentikasi dengan ID token Google Identity Services.
 * Alur:
 * 1. Verifikasi kredensial Google.
 * 2. Cek email_verified dan domain email resmi UNSIL.
 * 3. Jika google_id sudah ada: login.
 * 4. Jika email sudah terdaftar sebagai akun lokal: tautkan google_id ke akun tersebut.
 * 5. Jika belum terdaftar: buat akun baru dengan role SELALU 'student'.
 */
async function googleAuth(credential) {
  let payload;
  try {
    payload = await verifyGoogleCredential(credential);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw unauthorized('Kredensial Google tidak valid.');
  }

  if (!payload || !payload.sub) {
    throw unauthorized('Kredensial Google tidak valid.');
  }

  if (payload.email_verified !== true) {
    throw forbidden('Email Google Anda belum diverifikasi.');
  }

  const email = String(payload.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    throw unauthorized('Email tidak ditemukan pada kredensial Google.');
  }

  const emailDomain = email.split('@').pop();
  if (!ALLOWED_EMAIL_DOMAINS.includes(emailDomain)) {
    throw forbidden(
      `Domain email ${emailDomain ? '@' + emailDomain : ''} tidak diizinkan. Gunakan email resmi UNSIL (${ALLOWED_EMAIL_DOMAINS.join(', ')}).`
    );
  }

  const googleId = String(payload.sub);
  const name =
    String(payload.name || payload.given_name || email.split('@')[0]).trim() ||
    'Pengguna Google';

  // Cek apakah akun dengan google_id ini sudah ada
  const { rows: byGoogleId } = await query(
    `SELECT id, nim, name, email, role, faculty, auth_provider
       FROM users
      WHERE google_id = $1`,
    [googleId]
  );

  let userRow = byGoogleId[0];

  if (!userRow) {
    // Cek apakah email sudah terdaftar sebelumnya (misal pendaftaran lokal)
    const { rows: byEmail } = await query(
      `SELECT id, nim, name, email, role, faculty, auth_provider, google_id
         FROM users
        WHERE email = $1`,
      [email]
    );

    if (byEmail[0]) {
      // Tautkan google_id ke akun yang sudah ada (hanya jika email_verified true)
      const existing = byEmail[0];
      const { rows: updatedRows } = await query(
        `UPDATE users
            SET google_id = $1
          WHERE id = $2
        RETURNING id, nim, name, email, role, faculty, auth_provider`,
        [googleId, existing.id]
      );
      userRow = updatedRows[0];
    } else {
      // Buat akun baru: role SELALU 'student', NIM diambil dari bagian depan email jika 6-20 digit
      const emailPrefix = email.split('@')[0];
      const nim = /^[0-9]{6,20}$/.test(emailPrefix) ? emailPrefix : null;
      const faculty = 'Belum diisi';

      const { rows: insertedRows } = await query(
        `INSERT INTO users (nim, name, email, password_hash, role, faculty, auth_provider, google_id)
         VALUES ($1, $2, $3, NULL, 'student', $4, 'google', $5)
         RETURNING id, nim, name, email, role, faculty, auth_provider`,
        [nim, name, email, faculty, googleId]
      );
      userRow = insertedRows[0];
    }
  }

  const user = toPublicUser(userRow);
  return { token: signToken(user), user };
}

module.exports = {
  register,
  login,
  googleAuth,
  toPublicUser,
  verifyGoogleCredential,
  _setGoogleVerifierForTesting,
};
