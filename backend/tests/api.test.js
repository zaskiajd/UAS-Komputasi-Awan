/* ==========================================================================
   tests/api.test.js — Pengujian integrasi API (node:test + fetch bawaan Node)
   --------------------------------------------------------------------------
   Menjalankan server Express sungguhan terhadap PostgreSQL di DATABASE_URL.

   Prasyarat:
     - Database sudah di-import:  npm run db:reset
     - JANGAN diarahkan ke database produksi. Test membuat lalu menghapus
       akun/tiket miliknya sendiri, tetapi tetap menulis ke database.
   Opsional: TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD bila sandi demo sudah diganti.

   Jalankan:  cd backend && npm test
   ========================================================================== */

process.env.NODE_ENV = 'test';
process.env.AUTH_RATE_LIMIT = '10000';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

if (process.env.NODE_ENV === 'production') throw new Error('Jangan jalankan test di produksi.');

const { createApp } = require('../src/app');
const { query, pool } = require('../src/config/db');
const { JWT_SECRET } = require('../src/config/env');
const { _setGoogleVerifierForTesting } = require('../src/services/auth.service');

const ADMIN = {
  email: process.env.TEST_ADMIN_EMAIL || 'hendrawan@unsil.ac.id',
  password: process.env.TEST_ADMIN_PASSWORD || 'CampusCare#2026',
};

const RUN = Date.now().toString().slice(-8); // penanda unik per eksekusi
const PASSWORD = 'Sandi#Uji123';
const createdTicketIds = [];
const createdEmails = [];

let server;
let baseUrl;
let adminToken;

async function api(method, path, { token, body, raw } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers,
    body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

let userSeq = 0;
async function registerStudent(overrides = {}) {
  userSeq += 1;
  const nim = `9${RUN}${userSeq}`;
  const email = `uji.${RUN}.${userSeq}@student.unsil.ac.id`;
  createdEmails.push(email);
  const payload = {
    name: `Mahasiswa Uji ${userSeq}`,
    nim,
    faculty: 'Teknik Informatika',
    email,
    password: PASSWORD,
    ...overrides,
  };
  const res = await api('POST', '/auth/register', { body: payload });
  return { res, payload, token: res.body?.data?.token, user: res.body?.data?.user };
}

const validTicket = (extra = {}) => ({
  title: 'AC tidak dingin di Lab AI',
  category: 'ac',
  building: 'Gedung F (Fakultas Teknik)',
  room: 'Lab AI - Lt. 3',
  priority: 'Sedang',
  description: 'AC berbunyi bising dan tidak dingin saat perkuliahan.',
  ...extra,
});

async function newTicket(token, extra) {
  const res = await api('POST', '/tickets', { token, body: validTicket(extra) });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  createdTicketIds.push(res.body.data.ticketId);
  return res.body.data;
}

test.before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const login = await api('POST', '/auth/login', { body: ADMIN });
  assert.equal(login.status, 200, 'Login admin demo gagal — pastikan seed sudah di-import.');
  adminToken = login.body.data.token;
});

test.after(async () => {
  try {
    if (createdTicketIds.length) {
      await query('DELETE FROM tickets WHERE id = ANY($1::int[])', [createdTicketIds]);
    }
    if (createdEmails.length) {
      await query('DELETE FROM tickets WHERE owner_id IN (SELECT id FROM users WHERE email = ANY($1))', [createdEmails]);
      await query('DELETE FROM users WHERE email = ANY($1)', [createdEmails]);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
});

/* ============================================================== HEALTH ==== */

test('GET /api/health → 200', async () => {
  const res = await api('GET', '/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
});

test('endpoint tidak dikenal → 404 berformat standar', async () => {
  const res = await api('GET', '/tidak-ada');
  assert.equal(res.status, 404);
  assert.equal(res.body.success, false);
});

test('body JSON rusak → 400', async () => {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{rusak',
  });
  assert.equal(res.status, 400);
});

/* ================================================================= AUTH ==== */

test.describe('Autentikasi', () => {
  test('register sukses → 201, role student, ada token, tanpa password_hash', async () => {
    const { res, payload } = await registerStudent();
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.user.role, 'student');
    assert.equal(res.body.data.user.email, payload.email);
    assert.ok(res.body.data.token);
    assert.equal(JSON.stringify(res.body).includes('password'), false);
  });

  test('password tersimpan sebagai hash bcrypt, bukan teks asli', async () => {
    const { payload } = await registerStudent();
    const { rows } = await query('SELECT password_hash FROM users WHERE email = $1', [payload.email]);
    assert.match(rows[0].password_hash, /^\$2[aby]\$\d{2}\$/);
    assert.notEqual(rows[0].password_hash, PASSWORD);
  });

  test('mass-assignment: role=admin dari klien diabaikan', async () => {
    const { res } = await registerStudent({ role: 'admin' });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.user.role, 'student');
  });

  test('email huruf besar dinormalisasi ke lowercase dan bisa dipakai login', async () => {
    const { res, payload } = await registerStudent();
    assert.equal(res.status, 201);
    const login = await api('POST', '/auth/login', {
      body: { email: payload.email.toUpperCase(), password: PASSWORD },
    });
    assert.equal(login.status, 200);
  });

  test('email duplikat → 409', async () => {
    const first = await registerStudent();
    const dup = await registerStudent({ email: first.payload.email });
    assert.equal(dup.res.status, 409);
    assert.ok(dup.res.body.errors.email);
  });

  test('NIM duplikat → 409', async () => {
    const first = await registerStudent();
    const dup = await registerStudent({ nim: first.payload.nim });
    assert.equal(dup.res.status, 409);
    assert.ok(dup.res.body.errors.nim);
  });

  test('validasi register: field kosong/tidak valid → 422 dengan detail per field', async () => {
    const res = await api('POST', '/auth/register', {
      body: { name: '', nim: 'abc', email: 'bukan-email', password: '123', faculty: '' },
    });
    assert.equal(res.status, 422);
    for (const field of ['name', 'nim', 'email', 'password', 'faculty']) {
      assert.ok(res.body.errors[field], `error untuk ${field} harus ada`);
    }
  });

  test('konfirmasi sandi tidak cocok → 422', async () => {
    const { res } = await registerStudent({ confirmPassword: 'beda-sandi-123' });
    assert.equal(res.status, 422);
    assert.ok(res.body.errors.confirmPassword);
  });

  test('login akun demo mahasiswa & admin dari seed (hash pgcrypto kompatibel)', async () => {
    const mhs = await api('POST', '/auth/login', {
      body: { email: '217006120@student.unsil.ac.id', password: 'CampusCare#2026', role: 'student' },
    });
    // Bila sandi demo sudah diganti, test ini boleh diabaikan lewat TEST_SKIP_DEMO_STUDENT=1.
    if (!process.env.TEST_SKIP_DEMO_STUDENT) assert.equal(mhs.status, 200);
    const admin = await api('POST', '/auth/login', { body: { ...ADMIN, role: 'admin' } });
    assert.equal(admin.status, 200);
    assert.equal(admin.body.data.user.role, 'admin');
  });

  test('sandi salah dan email tak terdaftar → 401 dengan pesan identik', async () => {
    const { payload } = await registerStudent();
    const wrongPw = await api('POST', '/auth/login', { body: { email: payload.email, password: 'salah-total-1' } });
    const noUser = await api('POST', '/auth/login', { body: { email: 'tidak.ada@unsil.ac.id', password: 'salah-total-1' } });
    assert.equal(wrongPw.status, 401);
    assert.equal(noUser.status, 401);
    assert.equal(wrongPw.body.message, noUser.body.message);
  });

  test('pilih peran admin dengan akun mahasiswa → 403', async () => {
    const { payload } = await registerStudent();
    const res = await api('POST', '/auth/login', {
      body: { email: payload.email, password: PASSWORD, role: 'admin' },
    });
    assert.equal(res.status, 403);
  });

  test('GET /auth/me dengan token valid → profil', async () => {
    const { token, payload } = await registerStudent();
    const res = await api('GET', '/auth/me', { token });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.email, payload.email);
  });

  test('GET /auth/me tanpa token / token ngawur / header salah → 401', async () => {
    assert.equal((await api('GET', '/auth/me')).status, 401);
    assert.equal((await api('GET', '/auth/me', { token: 'bukan.jwt.valid' })).status, 401);
    const res = await fetch(`${baseUrl}/api/auth/me`, { headers: { Authorization: 'Token abc' } });
    assert.equal(res.status, 401);
  });

  test('token kedaluwarsa → 401', async () => {
    const { user } = await registerStudent();
    const expired = jwt.sign({ role: user.role }, JWT_SECRET, {
      subject: String(user.id),
      expiresIn: -10,
    });
    const res = await api('GET', '/auth/me', { token: expired });
    assert.equal(res.status, 401);
  });

  test('token ditandatangani secret lain / alg=none → 401', async () => {
    const { user } = await registerStudent();
    const forged = jwt.sign({ role: 'admin' }, 'secret-palsu-yang-berbeda', { subject: String(user.id) });
    assert.equal((await api('GET', '/auth/me', { token: forged })).status, 401);

    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: String(user.id), role: 'admin' })}.`;
    assert.equal((await api('GET', '/auth/me', { token: none })).status, 401);
  });

  test('role di dalam token tidak dipercaya: privilese diambil dari DB', async () => {
    const { user } = await registerStudent();
    const tokenClaimingAdmin = jwt.sign({ role: 'admin' }, JWT_SECRET, { subject: String(user.id) });
    const patch = await api('PATCH', '/tickets/1/status', {
      token: tokenClaimingAdmin,
      body: { status: 'done' },
    });
    assert.equal(patch.status, 403);
  });
});

test.describe('Autentikasi Google OAuth', () => {
  let googleSeq = 0;

  test.afterEach(() => {
    _setGoogleVerifierForTesting(null);
  });

  test('validasi: credential kosong → 422', async () => {
    const res = await api('POST', '/auth/google', { body: {} });
    assert.equal(res.status, 422);
    assert.ok(res.body.errors.credential);
  });

  test('token tidak valid → 401', async () => {
    _setGoogleVerifierForTesting(async () => {
      throw new Error('Token signature invalid');
    });
    const res = await api('POST', '/auth/google', { body: { credential: 'token-salah' } });
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
  });

  test('email belum terverifikasi → 403', async () => {
    _setGoogleVerifierForTesting(async () => ({
      sub: 'google-sub-unverified',
      email: 'unverified@student.unsil.ac.id',
      email_verified: false,
      name: 'Unverified User',
    }));
    const res = await api('POST', '/auth/google', { body: { credential: 'token-unverified' } });
    assert.equal(res.status, 403);
    assert.match(res.body.message, /belum diverifikasi/i);
  });

  test('domain email ditolak → 403', async () => {
    _setGoogleVerifierForTesting(async () => ({
      sub: 'google-sub-domain-ditolak',
      email: 'someone@gmail.com',
      email_verified: true,
      name: 'Gmail User',
    }));
    const res = await api('POST', '/auth/google', { body: { credential: 'token-gmail' } });
    assert.equal(res.status, 403);
    assert.match(res.body.message, /tidak diizinkan/i);
  });

  test('akun baru: role SELALU student, nim diekstrak jika numerik, faculty default', async () => {
    googleSeq += 1;
    const nimPart = `21700688${googleSeq}`;
    const email = `${nimPart}@student.unsil.ac.id`;
    const googleSub = `google-id-${RUN}-${googleSeq}`;
    createdEmails.push(email);

    _setGoogleVerifierForTesting(async () => ({
      sub: googleSub,
      email,
      email_verified: true,
      name: `Mahasiswa Google ${googleSeq}`,
    }));

    const res = await api('POST', '/auth/google', { body: { credential: 'token-baru' } });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.token);
    assert.equal(res.body.data.user.role, 'student');
    assert.equal(res.body.data.user.email, email);
    assert.equal(res.body.data.user.nim, nimPart);
    assert.equal(res.body.data.user.faculty, 'Belum diisi');

    // Cek di DB bahwa password_hash NULL dan auth_provider = 'google'
    const { rows } = await query(
      'SELECT password_hash, auth_provider, google_id FROM users WHERE email = $1',
      [email]
    );
    assert.equal(rows[0].password_hash, null);
    assert.equal(rows[0].auth_provider, 'google');
    assert.equal(rows[0].google_id, googleSub);
  });

  test('login ulang akun Google yang sudah terdaftar → 200', async () => {
    googleSeq += 1;
    const email = `21700777${googleSeq}@student.unsil.ac.id`;
    const googleSub = `google-id-relok-${RUN}-${googleSeq}`;
    createdEmails.push(email);

    _setGoogleVerifierForTesting(async () => ({
      sub: googleSub,
      email,
      email_verified: true,
      name: `Mahasiswa Repeat ${googleSeq}`,
    }));

    const first = await api('POST', '/auth/google', { body: { credential: 'tok-1' } });
    assert.equal(first.status, 200);

    const second = await api('POST', '/auth/google', { body: { credential: 'tok-2' } });
    assert.equal(second.status, 200);
    assert.equal(second.body.data.user.id, first.body.data.user.id);
  });

  test('penautan akun lokal yang sudah ada email-nya → 200 & google_id tertaut', async () => {
    const { payload, user: localUser } = await registerStudent();
    const googleSub = `google-linked-${RUN}-${Date.now()}`;

    _setGoogleVerifierForTesting(async () => ({
      sub: googleSub,
      email: payload.email,
      email_verified: true,
      name: 'Google Linked Name',
    }));

    const res = await api('POST', '/auth/google', { body: { credential: 'token-link' } });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.id, localUser.id);

    const { rows } = await query('SELECT google_id, password_hash FROM users WHERE id = $1', [
      localUser.id,
    ]);
    assert.equal(rows[0].google_id, googleSub);
    assert.ok(rows[0].password_hash);
  });

  test('role SELALU student meskipun token Google berisi role=admin atau klien mengirim role=admin', async () => {
    googleSeq += 1;
    const email = `admin.palsu.${googleSeq}@student.unsil.ac.id`;
    createdEmails.push(email);

    _setGoogleVerifierForTesting(async () => ({
      sub: `google-forged-admin-${RUN}-${googleSeq}`,
      email,
      email_verified: true,
      name: 'Penyerang Google',
      role: 'admin',
    }));

    const res = await api('POST', '/auth/google', {
      body: { credential: 'token-hacker', role: 'admin' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.role, 'student');
  });

  test('login password (POST /auth/login) ke akun Google-only ditolak dengan 401', async () => {
    googleSeq += 1;
    const email = `google.only.${googleSeq}@student.unsil.ac.id`;
    createdEmails.push(email);

    _setGoogleVerifierForTesting(async () => ({
      sub: `google-only-${RUN}-${googleSeq}`,
      email,
      email_verified: true,
      name: 'User Google Saja',
    }));

    const reg = await api('POST', '/auth/google', { body: { credential: 'token-g-only' } });
    assert.equal(reg.status, 200);

    const loginAttempt = await api('POST', '/auth/login', {
      body: { email, password: 'SandiSembarang123' },
    });
    assert.equal(loginAttempt.status, 401);
    assert.equal(loginAttempt.body.message, 'Email atau kata sandi salah.');
  });

  test('akun lokal yang sudah tertaut ke Google A ditolak (403) saat login Google B dengan email sama', async () => {
    const { payload, user: localUser } = await registerStudent();
    const googleSubA = `google-sub-a-${RUN}-${Date.now()}`;
    const googleSubB = `google-sub-b-${RUN}-${Date.now()}`;

    _setGoogleVerifierForTesting(async (cred) => ({
      sub: cred === 'token-a' ? googleSubA : googleSubB,
      email: payload.email,
      email_verified: true,
      name: 'Mahasiswa Tertaut',
    }));

    const first = await api('POST', '/auth/google', { body: { credential: 'token-a' } });
    assert.equal(first.status, 200);

    const second = await api('POST', '/auth/google', { body: { credential: 'token-b' } });
    assert.equal(second.status, 403);
    assert.match(second.body.message, /sudah tertaut dengan akun Google lain/i);

    const { rows } = await query('SELECT google_id FROM users WHERE id = $1', [localUser.id]);
    assert.equal(rows[0].google_id, googleSubA);
  });

  test('dua request /api/auth/google paralel untuk email baru yang sama tidak 500 dan hanya membuat satu baris user', async () => {
    googleSeq += 1;
    const email = `21700899${googleSeq}@student.unsil.ac.id`;
    const googleSub = `google-parallel-${RUN}-${googleSeq}`;
    createdEmails.push(email);

    _setGoogleVerifierForTesting(async () => ({
      sub: googleSub,
      email,
      email_verified: true,
      name: `Mahasiswa Paralel ${googleSeq}`,
    }));

    const [res1, res2] = await Promise.all([
      api('POST', '/auth/google', { body: { credential: 'token-par-1' } }),
      api('POST', '/auth/google', { body: { credential: 'token-par-2' } }),
    ]);

    assert.notEqual(res1.status, 500);
    assert.notEqual(res2.status, 500);
    assert.equal(res1.status, 200);
    assert.equal(res2.status, 200);
    assert.equal(res1.body.data.user.id, res2.body.data.user.id);

    const { rows } = await query('SELECT id FROM users WHERE email = $1', [email]);
    assert.equal(rows.length, 1);
  });
});

/* ============================================================== TICKETS ==== */

test.describe('Pengaduan — akses & role', () => {
  test('semua endpoint tiket wajib login → 401', async () => {
    assert.equal((await api('GET', '/tickets')).status, 401);
    assert.equal((await api('POST', '/tickets', { body: validTicket() })).status, 401);
    assert.equal((await api('GET', '/tickets/1')).status, 401);
    assert.equal((await api('PATCH', '/tickets/1', { body: { title: 'x' } })).status, 401);
    assert.equal((await api('DELETE', '/tickets/1')).status, 401);
    assert.equal((await api('PATCH', '/tickets/1/status', { body: { status: 'done' } })).status, 401);
  });

  test('mahasiswa TIDAK bisa memakai endpoint admin (ubah status) → 403', async () => {
    const { token } = await registerStudent();
    const ticket = await newTicket(token);
    const res = await api('PATCH', `/tickets/${ticket.ticketId}/status`, {
      token,
      body: { status: 'done' },
    });
    assert.equal(res.status, 403);
  });

  test('admin tidak membuat pengaduan lewat endpoint mahasiswa → 403', async () => {
    const res = await api('POST', '/tickets', { token: adminToken, body: validTicket() });
    assert.equal(res.status, 403);
  });
});

test.describe('Pengaduan — create & validasi', () => {
  test('mahasiswa membuat pengaduan → 201, status review, history awal, SLA terisi', async () => {
    const { token, user } = await registerStudent();
    const t = await newTicket(token, { priority: 'Tinggi' });

    assert.match(t.id, /^#CC-\d{4}-\d{4,}$/);
    assert.equal(t.status, 'review');
    assert.equal(t.progress, 0);
    assert.equal(t.urgent, true);
    assert.equal(t.owner, user.nim);
    assert.equal(t.cat, 'ac');
    assert.equal(t.location, 'Gedung F (Fakultas Teknik) • Lab AI - Lt. 3');
    assert.equal(t.history.length, 1);
    assert.equal(t.history[0].label, 'Pengaduan diterima');
    const hours = (new Date(t.slaDueAt) - new Date(t.createdAt)) / 3600000;
    assert.equal(Math.round(hours), 2);
  });

  test('pemilik tidak bisa dipalsukan lewat body (owner/status/progress diabaikan)', async () => {
    const { token, user } = await registerStudent();
    const res = await api('POST', '/tickets', {
      token,
      body: validTicket({ owner: '217006120', ownerId: 1, status: 'done', progress: 100, urgent: false }),
    });
    assert.equal(res.status, 201);
    createdTicketIds.push(res.body.data.ticketId);
    assert.equal(res.body.data.owner, user.nim);
    assert.equal(res.body.data.status, 'review');
    assert.equal(res.body.data.progress, 0);
  });

  test('gedung yang belum ada di master lokasi tetap diterima (teks bebas)', async () => {
    const { token } = await registerStudent();
    const t = await newTicket(token, { building: 'Gedung Baru Z', room: 'R.1' });
    assert.equal(t.location, 'Gedung Baru Z • R.1');
    assert.equal(t.locationId, null);
  });

  test('validasi: judul kosong, kategori tak dikenal, prioritas ngawur → 422', async () => {
    const { token } = await registerStudent();

    const bad = await api('POST', '/tickets', {
      token,
      body: { title: '', category: 'ac', building: 'X', description: 'abc', priority: 'Super' },
    });
    assert.equal(bad.status, 422);
    assert.ok(bad.body.errors.title);
    assert.ok(bad.body.errors.description);
    assert.ok(bad.body.errors.priority);

    const cat = await api('POST', '/tickets', {
      token,
      body: validTicket({ category: 'tidak-ada' }),
    });
    assert.equal(cat.status, 422);
    assert.ok(cat.body.errors.category);
  });

  test('SQL injection di field teks diperlakukan sebagai data biasa', async () => {
    const { token } = await registerStudent();
    const evil = "x'); DROP TABLE tickets;--";
    const t = await newTicket(token, { title: evil, description: `desc ${evil}` });
    assert.equal(t.title, evil);
    const { rows } = await query('SELECT count(*)::int AS n FROM tickets');
    assert.ok(rows[0].n > 0);
  });
});

test.describe('Pengaduan — kepemilikan (hanya milik sendiri)', () => {
  test('mahasiswa hanya melihat tiket miliknya di daftar', async () => {
    const a = await registerStudent();
    const b = await registerStudent();
    const ta = await newTicket(a.token, { title: 'Milik A' });
    const tb = await newTicket(b.token, { title: 'Milik B' });

    const listA = await api('GET', '/tickets', { token: a.token });
    assert.equal(listA.status, 200);
    const idsA = listA.body.data.map((t) => t.ticketId);
    assert.ok(idsA.includes(ta.ticketId));
    assert.ok(!idsA.includes(tb.ticketId));
    assert.ok(listA.body.data.every((t) => t.owner === a.payload.nim));
  });

  test("mahasiswa B tidak bisa GET/PATCH/DELETE tiket mahasiswa A → 404", async () => {
    const a = await registerStudent();
    const b = await registerStudent();
    const ta = await newTicket(a.token);

    assert.equal((await api('GET', `/tickets/${ta.ticketId}`, { token: b.token })).status, 404);
    assert.equal(
      (await api('PATCH', `/tickets/${ta.ticketId}`, { token: b.token, body: { title: 'Dibajak' } })).status,
      404
    );
    assert.equal((await api('DELETE', `/tickets/${ta.ticketId}`, { token: b.token })).status, 404);

    const still = await api('GET', `/tickets/${ta.ticketId}`, { token: a.token });
    assert.equal(still.status, 200);
    assert.equal(still.body.data.title, ta.title);
  });

  test('tiket seed milik mahasiswa lain tidak bisa dibuka (IDOR)', async () => {
    const { token } = await registerStudent();
    const { rows } = await query('SELECT id FROM tickets ORDER BY id LIMIT 1');
    assert.equal((await api('GET', `/tickets/${rows[0].id}`, { token })).status, 404);
  });

  test('admin melihat semua tiket dan detail lengkap (penugasan, catatan)', async () => {
    const { token } = await registerStudent();
    const t = await newTicket(token);

    const list = await api('GET', '/tickets?limit=100', { token: adminToken });
    assert.equal(list.status, 200);
    assert.ok(list.body.meta.total >= 10);
    assert.ok(list.body.data.some((x) => x.ticketId === t.ticketId));

    const detail = await api('GET', `/tickets/${t.ticketId}`, { token: adminToken });
    assert.equal(detail.status, 200);
    assert.ok(Array.isArray(detail.body.data.assignments));
    assert.ok(Array.isArray(detail.body.data.notes));
    assert.ok(Array.isArray(detail.body.data.instructions));
  });

  test('mahasiswa tidak menerima catatan/instruksi internal & hanya tanggapan publik', async () => {
    const { token } = await registerStudent();
    const t = await newTicket(token);
    await query(
      `INSERT INTO ticket_comments (ticket_id, kind, author_name, body, is_public) VALUES
         ($1,'note','Admin','catatan internal',false),
         ($1,'response','Admin','tanggapan publik',true),
         ($1,'response','Admin','tanggapan draf',false)`,
      [t.ticketId]
    );
    const res = await api('GET', `/tickets/${t.ticketId}`, { token });
    assert.equal(res.body.data.notes, undefined);
    assert.equal(res.body.data.instructions, undefined);
    assert.equal(res.body.data.assignments, undefined);
    assert.deepEqual(res.body.data.responses.map((r) => r.text), ['tanggapan publik']);
  });

  test('bisa mengambil detail lewat kode tiket (%23CC-...) dan id tidak valid → 404', async () => {
    const { token } = await registerStudent();
    const t = await newTicket(token);
    const byCode = await api('GET', `/tickets/${encodeURIComponent(t.id)}`, { token });
    assert.equal(byCode.status, 200);
    assert.equal(byCode.body.data.ticketId, t.ticketId);

    assert.equal((await api('GET', '/tickets/abc', { token })).status, 404);
    assert.equal((await api('GET', '/tickets/99999999', { token })).status, 404);
  });
});

test.describe('Pengaduan — daftar, filter, pagination', () => {
  test('filter status/kategori/pencarian + pagination', async () => {
    const { token } = await registerStudent();
    await newTicket(token, { title: 'Proyektor mati total', category: 'projector' });
    await newTicket(token, { title: 'Wifi lambat sekali', category: 'network' });

    const byCat = await api('GET', '/tickets?category=projector', { token });
    assert.equal(byCat.body.data.length, 1);
    assert.equal(byCat.body.data[0].cat, 'projector');

    const byQ = await api('GET', '/tickets?q=wifi', { token });
    assert.equal(byQ.body.data.length, 1);

    const page = await api('GET', '/tickets?limit=1&offset=1', { token });
    assert.equal(page.body.data.length, 1);
    assert.equal(page.body.meta.total, 2);

    const byStatus = await api('GET', '/tickets?status=done', { token });
    assert.equal(byStatus.body.data.length, 0);
  });

  test('parameter tidak valid → 422; wildcard LIKE di q tidak meledak', async () => {
    const { token } = await registerStudent();
    assert.equal((await api('GET', '/tickets?status=ngawur', { token })).status, 422);
    assert.equal((await api('GET', '/tickets?limit=0', { token })).status, 422);
    assert.equal((await api('GET', '/tickets?limit=1000', { token })).status, 422);
    const wild = await api('GET', '/tickets?q=%25', { token });
    assert.equal(wild.status, 200);
    assert.equal(wild.body.data.length, 0);
  });
});

test.describe('Pengaduan — edit oleh mahasiswa', () => {
  test('edit saat status review → berhasil, SLA & urgent mengikuti prioritas, history bertambah', async () => {
    const { token } = await registerStudent();
    const t = await newTicket(token, { priority: 'Sedang' });

    const res = await api('PATCH', `/tickets/${t.ticketId}`, {
      token,
      body: { title: 'Judul diperbarui', priority: 'Tinggi', room: 'Lab Lain', building: 'Gedung F (Fakultas Teknik)' },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.title, 'Judul diperbarui');
    assert.equal(res.body.data.urgent, true);
    assert.equal(res.body.data.location, 'Gedung F (Fakultas Teknik) • Lab Lain');
    const hours = (new Date(res.body.data.slaDueAt) - new Date(res.body.data.createdAt)) / 3600000;
    assert.equal(Math.round(hours), 2);
    assert.equal(res.body.data.history.length, 2);
    assert.equal(res.body.data.status, 'review');
  });

  test('PATCH kosong / field tidak valid → 422; status/owner tidak bisa diubah lewat PATCH', async () => {
    const { token } = await registerStudent();
    const t = await newTicket(token);
    assert.equal((await api('PATCH', `/tickets/${t.ticketId}`, { token, body: {} })).status, 422);
    assert.equal(
      (await api('PATCH', `/tickets/${t.ticketId}`, { token, body: { title: 'x' } })).status,
      422
    );
    // status hanya field asing → tidak ada field valid yang diubah → 422, status tetap review
    const sneaky = await api('PATCH', `/tickets/${t.ticketId}`, { token, body: { status: 'done' } });
    assert.equal(sneaky.status, 422);
    const check = await api('GET', `/tickets/${t.ticketId}`, { token });
    assert.equal(check.body.data.status, 'review');
  });
});

test.describe('Pengaduan — status oleh admin & aturan status', () => {
  test('alur lengkap: admin proses → mahasiswa tak bisa edit/hapus → selesai → hapus riwayat (soft delete)', async () => {
    const { token } = await registerStudent();
    const t = await newTicket(token);
    const url = `/tickets/${t.ticketId}`;

    const inProgress = await api('PATCH', `${url}/status`, {
      token: adminToken,
      body: { status: 'progress', note: 'Teknisi menuju lokasi.' },
    });
    assert.equal(inProgress.status, 200, JSON.stringify(inProgress.body));
    assert.equal(inProgress.body.data.status, 'progress');
    assert.equal(inProgress.body.data.progress, 35);
    assert.equal(inProgress.body.data.history.at(-1).note, 'Teknisi menuju lokasi.');
    assert.equal(inProgress.body.data.history.at(-1).actor.length > 0, true);

    // aturan status: sedang diproses → tidak boleh diedit/dihapus mahasiswa
    const edit = await api('PATCH', url, { token, body: { title: 'Coba ubah' } });
    assert.equal(edit.status, 409);
    const del = await api('DELETE', url, { token });
    assert.equal(del.status, 409);

    const done = await api('PATCH', `${url}/status`, { token: adminToken, body: { status: 'done' } });
    assert.equal(done.status, 200);
    assert.equal(done.body.data.progress, 100);
    assert.ok(done.body.data.completedAt);

    // selesai → mahasiswa boleh menghapus dari riwayatnya (soft delete)
    const archived = await api('DELETE', url, { token });
    assert.equal(archived.status, 200);
    assert.equal(archived.body.data.mode, 'archived');

    assert.equal((await api('GET', url, { token })).status, 404);
    const list = await api('GET', '/tickets', { token });
    assert.ok(!list.body.data.some((x) => x.ticketId === t.ticketId));

    // admin tetap melihatnya, dengan penanda soft delete
    const adminView = await api('GET', url, { token: adminToken });
    assert.equal(adminView.status, 200);
    assert.ok(adminView.body.data.deletedByStudentAt);
  });

  test('hapus saat masih review = dibatalkan (baris dihapus permanen)', async () => {
    const { token } = await registerStudent();
    const t = await newTicket(token);
    const res = await api('DELETE', `/tickets/${t.ticketId}`, { token });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.mode, 'cancelled');
    assert.equal((await api('GET', `/tickets/${t.ticketId}`, { token: adminToken })).status, 404);
  });

  test('ditolak admin → mahasiswa boleh menghapus riwayat', async () => {
    const { token } = await registerStudent();
    const t = await newTicket(token);
    const rej = await api('PATCH', `/tickets/${t.ticketId}/status`, {
      token: adminToken,
      body: { status: 'rejected', note: 'Bukan kewenangan Sarpras.' },
    });
    assert.equal(rej.status, 200);
    assert.equal(rej.body.data.history.at(-1).label, 'Pengaduan ditolak');
    const del = await api('DELETE', `/tickets/${t.ticketId}`, { token });
    assert.equal(del.body.data.mode, 'archived');
  });

  test('validasi status: nilai ngawur, progress di luar 0–100, status sama tanpa perubahan', async () => {
    const { token } = await registerStudent();
    const t = await newTicket(token);
    const url = `/tickets/${t.ticketId}/status`;

    assert.equal((await api('PATCH', url, { token: adminToken, body: { status: 'selesai' } })).status, 422);
    assert.equal((await api('PATCH', url, { token: adminToken, body: {} })).status, 422);
    assert.equal(
      (await api('PATCH', url, { token: adminToken, body: { status: 'progress', progress: 150 } })).status,
      422
    );
    assert.equal((await api('PATCH', url, { token: adminToken, body: { status: 'review' } })).status, 409);
    assert.equal((await api('PATCH', '/tickets/99999999/status', { token: adminToken, body: { status: 'done' } })).status, 404);
  });

  test('selesai menutup penugasan aktif; buka kembali mengaktifkannya lagi', async () => {
    const { token } = await registerStudent();
    const t = await newTicket(token);
    const url = `/tickets/${t.ticketId}/status`;

    await query(
      `INSERT INTO ticket_assignments (ticket_id, technician_id, role, status)
       VALUES ($1, 'hendra', 'PIC', 'active')`,
      [t.ticketId]
    );
    await api('PATCH', url, { token: adminToken, body: { status: 'progress' } });

    const done = await api('PATCH', url, { token: adminToken, body: { status: 'done' } });
    assert.equal(done.body.data.assignments[0].status, 'done');
    assert.equal(done.body.data.assignee, 'hendra');

    const reopen = await api('PATCH', url, { token: adminToken, body: { status: 'progress' } });
    assert.equal(reopen.status, 200, JSON.stringify(reopen.body));
    assert.equal(reopen.body.data.completedAt, null);
    assert.equal(reopen.body.data.history.at(-1).label, 'Tiket dibuka kembali');
    assert.equal(reopen.body.data.assignments[0].status, 'active');
    assert.ok(reopen.body.data.progress < 100);
  });

  test('disposisi penuh lewat PATCH /tickets/:id/status menyimpan tim, PIC, pendukung, prioritas, dan instruksi', async () => {
    const { token } = await registerStudent();
    const t = await newTicket(token, { priority: 'Sedang' });
    const url = `/tickets/${t.ticketId}/status`;

    const dispatch = await api('PATCH', url, {
      token: adminToken,
      body: {
        status: 'progress',
        progress: 35,
        teamId: 'electrical',
        assignee: 'hendra',
        supporters: ['rian'],
        priority: 'Tinggi',
        note: 'Segera cek kompresor AC Lab AI.',
        instruction: 'Segera cek kompresor AC Lab AI.',
      },
    });

    assert.equal(dispatch.status, 200, JSON.stringify(dispatch.body));
    assert.equal(dispatch.body.data.status, 'progress');
    assert.equal(dispatch.body.data.teamId, 'electrical');
    assert.equal(dispatch.body.data.assignee, 'hendra');
    assert.equal(dispatch.body.data.priority, 'Tinggi');
    assert.equal(dispatch.body.data.urgent, true);
    assert.equal(dispatch.body.data.assignments.filter((a) => a.status === 'active').length, 2);
    assert.equal(dispatch.body.data.instructions.length, 1);
    assert.equal(dispatch.body.data.instructions[0].toTechId, 'hendra');
    assert.equal(dispatch.body.data.instructions[0].text, 'Segera cek kompresor AC Lab AI.');
  });
});
