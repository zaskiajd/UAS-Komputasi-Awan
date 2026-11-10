/* ==========================================================================
   services/auth.service.js — Register, login, dan pembuatan JWT
   ========================================================================== */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const { JWT_SECRET, JWT_EXPIRES_IN } = require('../config/env');
const { ApiError, unauthorized, forbidden } = require('../utils/errors');

const BCRYPT_ROUNDS = 10;

// Hash palsu agar waktu respons login "email tidak ada" ≈ "sandi salah"
// (mencegah enumerasi akun lewat timing).
const DUMMY_HASH = bcrypt.hashSync('campuscare-dummy-password', BCRYPT_ROUNDS);

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
      `INSERT INTO users (nim, name, email, password_hash, role, faculty)
       VALUES ($1, $2, $3, $4, 'student', $5)
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
    `SELECT id, nim, name, email, role, faculty, password_hash
       FROM users
      WHERE email = $1`,
    [email]
  );
  const row = rows[0];

  const passwordOk = await bcrypt.compare(password, row ? row.password_hash : DUMMY_HASH);
  if (!row || !passwordOk) throw unauthorized('Email atau kata sandi salah.');

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

module.exports = { register, login, toPublicUser };
