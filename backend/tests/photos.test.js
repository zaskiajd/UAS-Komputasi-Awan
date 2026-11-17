/* ==========================================================================
   tests/photos.test.js — Pengujian unggah/hapus foto pengaduan
   --------------------------------------------------------------------------
   Menjalankan server Express + PostgreSQL sungguhan. Berkas foto ditulis ke
   folder sementara (UPLOAD_DIR) yang dibersihkan setelah pengujian.

   Prasyarat: database sudah di-import (npm run db:reset) dan migrasi 003
   sudah dijalankan. Jalankan: cd backend && npm test
   ========================================================================== */

process.env.NODE_ENV = 'test';
process.env.AUTH_RATE_LIMIT = '10000';
process.env.UPLOAD_RATE_LIMIT = '10000';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'campuscare-photos-'));
process.env.UPLOAD_DIR = UPLOAD_DIR;

const test = require('node:test');
const assert = require('node:assert/strict');

if (process.env.NODE_ENV === 'production') throw new Error('Jangan jalankan test di produksi.');

const { createApp } = require('../src/app');
const { query, pool } = require('../src/config/db');

const ADMIN = {
  email: process.env.TEST_ADMIN_EMAIL || 'hendrawan@unsil.ac.id',
  password: process.env.TEST_ADMIN_PASSWORD || 'CampusCare#2026',
};

const RUN = Date.now().toString().slice(-8);
const PASSWORD = 'Sandi#Uji123';
const createdEmails = [];

let server;
let baseUrl;
let adminToken;
let student;
let otherStudent;

/* --------------------------------------------------------------- helpers */

async function api(method, endpoint, { token, body } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}/api${endpoint}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json, headers: res.headers };
}

let userSeq = 0;
async function registerStudent() {
  userSeq += 1;
  const email = `foto.${RUN}.${userSeq}@student.unsil.ac.id`;
  createdEmails.push(email);
  const res = await api('POST', '/auth/register', {
    body: {
      name: `Mahasiswa Foto ${userSeq}`,
      nim: `8${RUN}${userSeq}`,
      faculty: 'Teknik Informatika',
      email,
      password: PASSWORD,
    },
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return { token: res.body.data.token, user: res.body.data.user };
}

async function newTicket(token) {
  const res = await api('POST', '/tickets', {
    token,
    body: {
      title: 'Lampu koridor mati',
      category: 'ac',
      building: 'Gedung F (Fakultas Teknik)',
      room: 'Koridor Lt. 2',
      priority: 'Sedang',
      description: 'Lampu koridor mati sejak pagi dan gelap saat perkuliahan.',
    },
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
}

const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(60, 0x11),
]);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(40, 0x22),
]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x20, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP', 'ascii'),
  Buffer.alloc(40, 0x33),
]);
const NOT_IMAGE = Buffer.from('ini hanya teks, bukan gambar', 'utf8');

function file(name, buffer, type = 'application/octet-stream') {
  return { name, buffer, type };
}

function snapshotFiles() {
  return new Set(fs.readdirSync(UPLOAD_DIR));
}

async function uploadPhotos(token, ticketId, files, field = 'photos') {
  const form = new FormData();
  for (const item of files) {
    form.append(field, new Blob([item.buffer], { type: item.type }), item.name);
  }
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}/api/tickets/${ticketId}/photos`, {
    method: 'POST',
    headers,
    body: form,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

function fileNameFromUrl(url) {
  return url.slice('/uploads/'.length);
}

/* ------------------------------------------------------------- lifecycle */

test.before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const login = await api('POST', '/auth/login', { body: ADMIN });
  assert.equal(login.status, 200, 'Login admin demo gagal — pastikan seed sudah di-import.');
  adminToken = login.body.data.token;

  student = await registerStudent();
  otherStudent = await registerStudent();
});

test.after(async () => {
  try {
    if (createdEmails.length) {
      await query(
        `UPDATE tickets SET deleted_by_student_at = NULL
          WHERE owner_id IN (SELECT id FROM users WHERE email = ANY($1))`,
        [createdEmails]
      );
      await query(
        'DELETE FROM tickets WHERE owner_id IN (SELECT id FROM users WHERE email = ANY($1))',
        [createdEmails]
      );
      await query('DELETE FROM users WHERE email = ANY($1)', [createdEmails]);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
    fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
  }
});

/* ============================================================== UPLOAD ==== */

test.describe('Unggah foto', () => {
  test('tanpa login → 401', async () => {
    const ticket = await newTicket(student.token);
    const res = await uploadPhotos(null, ticket.ticketId, [file('a.jpg', JPEG, 'image/jpeg')]);
    assert.equal(res.status, 401);
  });

  test('admin tidak boleh mengunggah foto → 403', async () => {
    const ticket = await newTicket(student.token);
    const res = await uploadPhotos(adminToken, ticket.ticketId, [file('a.jpg', JPEG, 'image/jpeg')]);
    assert.equal(res.status, 403);
  });

  test('unggah 1 foto: 201, metadata benar, berkas tersimpan', async () => {
    const ticket = await newTicket(student.token);
    const res = await uploadPhotos(student.token, ticket.ticketId, [
      file('foto depan.jpg', JPEG, 'image/jpeg'),
    ]);

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.photos.length, 1);
    assert.equal(res.body.data.photoUrl, res.body.data.photos[0].url);

    const photo = res.body.data.photos[0];
    assert.ok(Number.isInteger(photo.id));
    assert.equal(photo.mimeType, 'image/jpeg');
    assert.equal(photo.sizeBytes, JPEG.length);
    assert.match(photo.url, /^\/uploads\/[0-9a-f-]{36}\.jpg$/);
    assert.ok(photo.createdAt);

    const filePath = path.join(UPLOAD_DIR, fileNameFromUrl(photo.url));
    assert.ok(fs.existsSync(filePath));
    assert.deepEqual(fs.readFileSync(filePath), JPEG);

    const row = await query(
      'SELECT original_name, file_name FROM ticket_photos WHERE id = $1',
      [photo.id]
    );
    assert.equal(row.rows[0].original_name, 'foto depan.jpg');
    assert.equal(row.rows[0].file_name, fileNameFromUrl(photo.url));
  });

  test('menerima JPEG, PNG, dan WebP (deteksi magic bytes)', async () => {
    const ticket = await newTicket(student.token);
    const res = await uploadPhotos(student.token, ticket.ticketId, [
      file('a.bin', JPEG),
      file('b.bin', PNG),
      file('c.bin', WEBP),
    ]);

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.deepEqual(
      res.body.data.photos.map((p) => p.mimeType),
      ['image/jpeg', 'image/png', 'image/webp']
    );
    assert.match(res.body.data.photos[1].url, /\.png$/);
    assert.match(res.body.data.photos[2].url, /\.webp$/);
  });

  test('magic bytes menang atas ekstensi/Content-Type palsu', async () => {
    const ticket = await newTicket(student.token);
    const res = await uploadPhotos(student.token, ticket.ticketId, [
      file('gambar.exe', JPEG, 'application/x-msdownload'),
    ]);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.photos[0].mimeType, 'image/jpeg');
    assert.match(res.body.data.photos[0].url, /\.jpg$/);
  });

  test('berkas bukan gambar → 422 dan tidak menyisakan berkas', async () => {
    const ticket = await newTicket(student.token);
    const before = snapshotFiles();
    const res = await uploadPhotos(student.token, ticket.ticketId, [
      file('palsu.jpg', NOT_IMAGE, 'image/jpeg'),
    ]);

    assert.equal(res.status, 422, JSON.stringify(res.body));
    assert.match(res.body.message, /Format foto tidak didukung/i);
    assert.ok(res.body.errors.photos);
    assert.deepEqual(snapshotFiles(), before);

    const count = await query('SELECT COUNT(*)::int AS n FROM ticket_photos WHERE ticket_id = $1', [
      ticket.ticketId,
    ]);
    assert.equal(count.rows[0].n, 0);
  });

  test('tanpa berkas → 422', async () => {
    const ticket = await newTicket(student.token);
    const res = await uploadPhotos(student.token, ticket.ticketId, []);
    assert.equal(res.status, 422, JSON.stringify(res.body));
    assert.match(res.body.message, /minimal satu foto/i);
  });

  test('lebih dari 3 berkas dalam satu request → 422', async () => {
    const ticket = await newTicket(student.token);
    const res = await uploadPhotos(student.token, ticket.ticketId, [
      file('1.jpg', JPEG),
      file('2.jpg', JPEG),
      file('3.jpg', JPEG),
      file('4.jpg', JPEG),
    ]);
    assert.equal(res.status, 422, JSON.stringify(res.body));
    assert.match(res.body.message, /Maksimal 3 foto/i);
  });

  test('foto melebihi 3 MB → 413', async () => {
    const ticket = await newTicket(student.token);
    const tooLarge = Buffer.concat([JPEG, Buffer.alloc(3 * 1024 * 1024)]);
    const res = await uploadPhotos(student.token, ticket.ticketId, [
      file('besar.jpg', tooLarge, 'image/jpeg'),
    ]);
    assert.equal(res.status, 413, JSON.stringify(res.body));
    assert.match(res.body.message, /3 MB/);
  });

  test('maksimal 3 foto per tiket lintas request → 409', async () => {
    const ticket = await newTicket(student.token);
    const first = await uploadPhotos(student.token, ticket.ticketId, [
      file('1.jpg', JPEG),
      file('2.jpg', JPEG),
    ]);
    assert.equal(first.status, 201);

    const second = await uploadPhotos(student.token, ticket.ticketId, [
      file('3.jpg', JPEG),
      file('4.jpg', JPEG),
    ]);
    assert.equal(second.status, 409, JSON.stringify(second.body));
    assert.match(second.body.message, /Maksimal 3 foto/i);

    const count = await query('SELECT COUNT(*)::int AS n FROM ticket_photos WHERE ticket_id = $1', [
      ticket.ticketId,
    ]);
    assert.equal(count.rows[0].n, 2);
  });

  test('dua unggahan paralel tidak melewati batas 3 foto', async () => {
    const ticket = await newTicket(student.token);
    const [a, b] = await Promise.all([
      uploadPhotos(student.token, ticket.ticketId, [
        file('a1.jpg', JPEG),
        file('a2.jpg', JPEG),
      ]),
      uploadPhotos(student.token, ticket.ticketId, [
        file('b1.jpg', JPEG),
        file('b2.jpg', JPEG),
      ]),
    ]);

    assert.deepEqual([a.status, b.status].sort(), [201, 409]);
    const count = await query('SELECT COUNT(*)::int AS n FROM ticket_photos WHERE ticket_id = $1', [
      ticket.ticketId,
    ]);
    assert.equal(count.rows[0].n, 2);
  });

  test('tiket milik mahasiswa lain → 404', async () => {
    const ticket = await newTicket(student.token);
    const res = await uploadPhotos(otherStudent.token, ticket.ticketId, [
      file('a.jpg', JPEG, 'image/jpeg'),
    ]);
    assert.equal(res.status, 404, JSON.stringify(res.body));
  });

  test('nama asli disanitasi (tanpa path/karakter kontrol)', async () => {
    const ticket = await newTicket(student.token);
    const res = await uploadPhotos(student.token, ticket.ticketId, [
      file('../../evil "foto"\n.jpg', JPEG),
    ]);
    assert.equal(res.status, 201, JSON.stringify(res.body));

    const row = await query('SELECT original_name FROM ticket_photos WHERE id = $1', [
      res.body.data.photos[0].id,
    ]);
    const original = row.rows[0].original_name;
    assert.equal(original.includes('/'), false);
    assert.equal(original.includes('\\'), false);
    assert.equal(original.includes('"'), false);
    assert.equal(original.includes('\n'), false);
    assert.ok(original.length <= 180);
  });

  test('tiket berstatus done → 409', async () => {
    const ticket = await newTicket(student.token);
    const update = await api('PATCH', `/tickets/${ticket.ticketId}/status`, {
      token: adminToken,
      body: { status: 'done' },
    });
    assert.equal(update.status, 200, JSON.stringify(update.body));

    const res = await uploadPhotos(student.token, ticket.ticketId, [
      file('setelah-selesai.jpg', JPEG),
    ]);
    assert.equal(res.status, 409, JSON.stringify(res.body));
    assert.match(res.body.message, /sudah selesai/i);
  });
});

/* ============================================================ PENYAJIAN ==== */

test.describe('Penyajian berkas & data tiket', () => {
  test('/uploads/<file> disajikan dengan header aman', async () => {
    const ticket = await newTicket(student.token);
    const upload = await uploadPhotos(student.token, ticket.ticketId, [
      file('bukti.png', PNG, 'image/png'),
    ]);
    assert.equal(upload.status, 201);

    const url = upload.body.data.photos[0].url;
    const res = await fetch(`${baseUrl}${url}`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /^image\/png/);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.match(res.headers.get('cache-control'), /max-age=86400/);
    assert.match(res.headers.get('cache-control'), /immutable/);
    assert.equal(res.headers.get('cross-origin-resource-policy'), 'cross-origin');
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), PNG);
  });

  test('berkas tidak ada → 404 JSON; path dotfile tidak dilayani', async () => {
    const res = await fetch(`${baseUrl}/uploads/tidak-ada.jpg`);
    assert.equal(res.status, 404);
    const json = await res.json();
    assert.equal(json.success, false);

    fs.writeFileSync(path.join(UPLOAD_DIR, '.rahasia'), 'jangan tampil');
    try {
      const dot = await fetch(`${baseUrl}/uploads/.rahasia`);
      assert.equal(dot.status, 404);
    } finally {
      fs.rmSync(path.join(UPLOAD_DIR, '.rahasia'), { force: true });
    }
  });

  test('detail & daftar tiket memuat photos urut dan photoUrl foto pertama', async () => {
    const ticket = await newTicket(student.token);
    const upload = await uploadPhotos(student.token, ticket.ticketId, [
      file('satu.jpg', JPEG),
      file('dua.png', PNG),
    ]);
    assert.equal(upload.status, 201);
    const expected = upload.body.data.photos;

    const detail = await api('GET', `/tickets/${ticket.ticketId}`, { token: student.token });
    assert.equal(detail.status, 200);
    assert.deepEqual(detail.body.data.photos, expected);
    assert.equal(detail.body.data.photoUrl, expected[0].url);

    const list = await api('GET', '/tickets?limit=100', { token: student.token });
    assert.equal(list.status, 200);
    const found = list.body.data.find((item) => item.id === ticket.id);
    assert.ok(found);
    assert.deepEqual(found.photos, expected);
    assert.equal(found.photoUrl, expected[0].url);
  });

  test('tiket baru tanpa foto memiliki photos=[] dan photoUrl=null', async () => {
    const ticket = await newTicket(student.token);
    assert.deepEqual(ticket.photos, []);
    assert.equal(ticket.photoUrl, null);
  });
});

/* ============================================================== DELETE ==== */

test.describe('Hapus foto', () => {
  test('hapus foto sendiri: baris + berkas hilang, photoUrl disinkronkan', async () => {
    const ticket = await newTicket(student.token);
    const upload = await uploadPhotos(student.token, ticket.ticketId, [
      file('pertama.jpg', JPEG),
      file('kedua.png', PNG),
    ]);
    assert.equal(upload.status, 201);

    const [first, second] = upload.body.data.photos;
    const firstPath = path.join(UPLOAD_DIR, fileNameFromUrl(first.url));
    assert.ok(fs.existsSync(firstPath));

    const res = await api('DELETE', `/tickets/${ticket.ticketId}/photos/${first.id}`, {
      token: student.token,
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.photos.length, 1);
    assert.equal(res.body.data.photos[0].id, second.id);
    assert.equal(res.body.data.photoUrl, second.url);
    assert.equal(fs.existsSync(firstPath), false);

    const row = await query('SELECT COUNT(*)::int AS n FROM ticket_photos WHERE id = $1', [first.id]);
    assert.equal(row.rows[0].n, 0);
  });

  test('menghapus semua foto menyetel photoUrl menjadi null', async () => {
    const ticket = await newTicket(student.token);
    const upload = await uploadPhotos(student.token, ticket.ticketId, [
      file('satu.jpg', JPEG),
      file('dua.jpg', JPEG),
    ]);
    for (const photo of upload.body.data.photos) {
      const res = await api('DELETE', `/tickets/${ticket.ticketId}/photos/${photo.id}`, {
        token: student.token,
      });
      assert.equal(res.status, 200, JSON.stringify(res.body));
    }

    const last = await api('GET', `/tickets/${ticket.ticketId}`, { token: student.token });
    assert.deepEqual(last.body.data.photos, []);
    assert.equal(last.body.data.photoUrl, null);

    const row = await query('SELECT photo_url FROM tickets WHERE id = $1', [ticket.ticketId]);
    assert.equal(row.rows[0].photo_url, null);
  });

  test('foto milik tiket lain / milik mahasiswa lain → 404', async () => {
    const ticket = await newTicket(student.token);
    const upload = await uploadPhotos(student.token, ticket.ticketId, [file('a.jpg', JPEG)]);
    const photoId = upload.body.data.photos[0].id;

    const otherTicket = await newTicket(student.token);
    const wrongTicket = await api('DELETE', `/tickets/${otherTicket.ticketId}/photos/${photoId}`, {
      token: student.token,
    });
    assert.equal(wrongTicket.status, 404);

    const otherUser = await api('DELETE', `/tickets/${ticket.ticketId}/photos/${photoId}`, {
      token: otherStudent.token,
    });
    assert.equal(otherUser.status, 404);

    const nonexistent = await api('DELETE', `/tickets/${ticket.ticketId}/photos/999999999`, {
      token: student.token,
    });
    assert.equal(nonexistent.status, 404);
  });

  test('ID foto tidak valid → 404', async () => {
    const ticket = await newTicket(student.token);
    const res = await api('DELETE', `/tickets/${ticket.ticketId}/photos/abc`, {
      token: student.token,
    });
    assert.equal(res.status, 404);
  });
});

/* ============================================================== CLEANUP ==== */

test.describe('Pembersihan berkas', () => {
  test('membatalkan tiket (status review) menghapus baris & berkas foto', async () => {
    const ticket = await newTicket(student.token);
    const upload = await uploadPhotos(student.token, ticket.ticketId, [file('hapus.jpg', JPEG)]);
    const filePath = path.join(UPLOAD_DIR, fileNameFromUrl(upload.body.data.photos[0].url));
    assert.ok(fs.existsSync(filePath));

    const res = await api('DELETE', `/tickets/${ticket.ticketId}`, { token: student.token });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.mode, 'cancelled');
    assert.equal(fs.existsSync(filePath), false);

    const photos = await query('SELECT COUNT(*)::int AS n FROM ticket_photos WHERE ticket_id = $1', [
      ticket.ticketId,
    ]);
    assert.equal(photos.rows[0].n, 0);
  });
});
