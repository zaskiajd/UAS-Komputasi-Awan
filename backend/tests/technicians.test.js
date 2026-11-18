/* ==========================================================================
   tests/technicians.test.js — Pengujian integrasi endpoint manajemen teknisi
   --------------------------------------------------------------------------
   Memakai server Express sungguhan terhadap PostgreSQL di DATABASE_URL.
   Prasyarat: database sudah di-import (npm run db:reset) sehingga tim
   seed (electrical, av, civil, network) tersedia. Seluruh teknisi,
   tiket, dan akun yang dibuat tes ini dibersihkan di test.after().
   ========================================================================== */

process.env.NODE_ENV = 'test';
process.env.AUTH_RATE_LIMIT = '10000';

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

const createdTechIds = new Set();
const createdTicketIds = [];
const createdEmails = [];

let server;
let baseUrl;
let adminToken;
let studentToken;

async function api(method, path, { token, body } = {}) {
  const headers = {};
  const hasBody = body !== undefined && !['GET', 'HEAD'].includes(method);
  if (hasBody) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers,
    body: hasBody ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

function track(technician) {
  if (technician?.id) createdTechIds.add(technician.id);
  return technician;
}

const techPayload = (extra = {}) => ({
  name: `Teknisi Uji ${RUN}`,
  title: 'Pak Uji',
  role: 'Teknisi',
  teamId: 'electrical',
  active: true,
  phone: '+62 800-000-000',
  skills: ['Menguji'],
  ...extra,
});

async function createTechnician(extra = {}) {
  const res = await api('POST', '/technicians', { token: adminToken, body: techPayload(extra) });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return track(res.body.data);
}

async function newTicket() {
  const res = await api('POST', '/tickets', {
    token: studentToken,
    body: {
      title: `Tiket uji teknisi ${RUN}`,
      description: 'Dibuat untuk uji proteksi tiket aktif.',
      category: 'ac',
      building: 'Gedung F (Fakultas Teknik)',
      room: 'R. Uji Teknisi',
      priority: 'Sedang',
    },
  });
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

  const email = `teknisi.uji.${RUN}@student.unsil.ac.id`;
  createdEmails.push(email);
  const reg = await api('POST', '/auth/register', {
    body: {
      name: 'Mahasiswa Uji Teknisi',
      nim: `7${RUN}`.slice(0, 20),
      faculty: 'Teknik Informatika',
      email,
      password: PASSWORD,
    },
  });
  assert.equal(reg.status, 201, JSON.stringify(reg.body));
  studentToken = reg.body.data.token;
});

test.after(async () => {
  try {
    if (createdTicketIds.length) {
      await query('DELETE FROM tickets WHERE id = ANY($1::int[])', [createdTicketIds]);
    }
    if (createdTechIds.size) {
      // coordinator_id FK: ON DELETE SET NULL, aman dihapus langsung.
      await query('DELETE FROM technicians WHERE id = ANY($1::text[])', [[...createdTechIds]]);
    }
    if (createdEmails.length) {
      await query('DELETE FROM tickets WHERE owner_id IN (SELECT id FROM users WHERE email = ANY($1))', [
        createdEmails,
      ]);
      await query('DELETE FROM users WHERE email = ANY($1)', [createdEmails]);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
});

/* ============================================================== AKSES ===== */

test.describe('Teknisi — akses', () => {
  test('semua endpoint teknisi wajib login → 401', async () => {
    const endpoints = [
      ['GET', '/technicians'],
      ['POST', '/technicians'],
      ['GET', '/technicians/hendra'],
      ['PATCH', '/technicians/hendra'],
      ['POST', '/technicians/hendra/duty'],
      ['POST', '/technicians/hendra/archive'],
      ['POST', '/technicians/hendra/restore'],
      ['DELETE', '/technicians/hendra'],
    ];
    for (const [method, path] of endpoints) {
      const res = await api(method, path, { body: {} });
      assert.equal(res.status, 401, `${method} ${path}`);
    }
  });

  test('mahasiswa dilarang mengelola teknisi → 403', async () => {
    const res = await api('GET', '/technicians', { token: studentToken });
    assert.equal(res.status, 403);
  });
});

/* ============================================================== READ ===== */

test.describe('Teknisi — daftar', () => {
  test('admin melihat daftar teknisi seed dengan beban tiket', async () => {
    const res = await api('GET', '/technicians', { token: adminToken });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.ok(res.body.meta.total >= 15, 'seed memuat 15 teknisi');

    const hendra = res.body.data.find((t) => t.id === 'hendra');
    assert.ok(hendra, 'teknisi seed hendra ada');
    assert.equal(hendra.role, 'Koordinator');
    assert.equal(hendra.teamId, 'electrical');
    assert.equal(typeof hendra.activeTicketCount, 'number');
    assert.ok(Array.isArray(hendra.skills));
  });
});

/* ============================================================ CREATE ===== */

test.describe('Teknisi — buat', () => {
  test('membuat teknisi baru → 201 dan tampil di daftar', async () => {
    const tech = await createTechnician();
    assert.equal(tech.role, 'Teknisi');
    assert.equal(tech.teamId, 'electrical');
    assert.equal(tech.archived, false);
    assert.ok(tech.id.startsWith('teknisi-uji-'), `ID dari slug nama: ${tech.id}`);

    const list = await api('GET', '/technicians', { token: adminToken });
    assert.ok(list.body.data.some((t) => t.id === tech.id));
  });

  test('validasi input → 422 per field', async () => {
    const res = await api('POST', '/technicians', {
      token: adminToken,
      body: { name: '', role: 'BukanRole', teamId: 'electrical' },
    });
    assert.equal(res.status, 422);
    assert.ok(res.body.errors.name);
    assert.ok(res.body.errors.role);

    // Tim tidak dikenal ditolak di lapisan service (validasi dasar lolos).
    const resTeam = await api('POST', '/technicians', {
      token: adminToken,
      body: { name: `Teknisi Tim ${RUN}`, role: 'Teknisi', teamId: 'tim-tidak-ada' },
    });
    assert.equal(resTeam.status, 422);
    assert.ok(resTeam.body.errors.teamId);
  });

  test('dua koordinator per tim ditolak → 409', async () => {
    const res = await api('POST', '/technicians', {
      token: adminToken,
      body: techPayload({ role: 'Koordinator', name: `Koordinator Uji ${RUN}` }),
    });
    assert.equal(res.status, 409, JSON.stringify(res.body));
    assert.match(res.body.errors?.role || res.body.message, /koordinator/i);
  });
});

/* ============================================================ UPDATE ===== */

test.describe('Teknisi — ubah', () => {
  test('PATCH ubah nama, skills, dan tugas', async () => {
    const tech = await createTechnician({ name: `Teknisi Edit ${RUN}` });
    const res = await api('PATCH', `/technicians/${tech.id}`, {
      token: adminToken,
      body: { name: `Teknisi Edit 2 ${RUN}`, skills: ['AC split', 'Genset'], phone: '+62 811' },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.name, `Teknisi Edit 2 ${RUN}`);
    assert.deepEqual(res.body.data.skills, ['AC split', 'Genset']);
    assert.equal(res.body.data.phone, '+62 811');
  });

  test('teknisi yang diarsipkan tidak bisa diubah → 409', async () => {
    const tech = await createTechnician({ name: `Teknisi Arsip ${RUN}` });
    await api('POST', `/technicians/${tech.id}/archive`, { token: adminToken });
    const res = await api('PATCH', `/technicians/${tech.id}`, {
      token: adminToken,
      body: { name: 'Dilarang' },
    });
    assert.equal(res.status, 409);
  });
});

/* ============================================================ ACTIONS ==== */

test.describe('Teknisi — tugas & arsip', () => {
  test('standby ditolak bila masih memegang tiket aktif → 409', async () => {
    const tech = await createTechnician({ name: `Teknisi Sibuk ${RUN}` });
    const ticket = await newTicket();
    await api('PATCH', `/tickets/${ticket.ticketId}/status`, {
      token: adminToken,
      body: { status: 'progress', teamId: 'electrical', assignee: tech.id },
    });

    const res = await api('POST', `/technicians/${tech.id}/duty`, {
      token: adminToken,
      body: { active: false },
    });
    assert.equal(res.status, 409, JSON.stringify(res.body));

    // Selesaikan tiket lalu standby diperbolehkan.
    await api('PATCH', `/tickets/${ticket.ticketId}/status`, {
      token: adminToken,
      body: { status: 'done' },
    });
    const ok = await api('POST', `/technicians/${tech.id}/duty`, {
      token: adminToken,
      body: { active: false },
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.data.active, false);
  });

  test('arsip ditolak bila masih memegang tiket aktif → 409; arsip & pulihkan berhasil', async () => {
    const tech = await createTechnician({ name: `Teknisi Arsip Uji ${RUN}` });
    const ticket = await newTicket();
    await api('PATCH', `/tickets/${ticket.ticketId}/status`, {
      token: adminToken,
      body: { status: 'progress', teamId: 'electrical', assignee: tech.id },
    });

    const blocked = await api('POST', `/technicians/${tech.id}/archive`, { token: adminToken });
    assert.equal(blocked.status, 409);

    await api('PATCH', `/tickets/${ticket.ticketId}/status`, {
      token: adminToken,
      body: { status: 'done' },
    });

    const archived = await api('POST', `/technicians/${tech.id}/archive`, { token: adminToken });
    assert.equal(archived.status, 200);
    assert.equal(archived.body.data.archived, true);

    const restored = await api('POST', `/technicians/${tech.id}/restore`, { token: adminToken });
    assert.equal(restored.status, 200);
    assert.equal(restored.body.data.archived, false);
  });

  test('hapus permanen: wajib diarsipkan dan tanpa riwayat penugasan', async () => {
    const tech = await createTechnician({ name: `Teknisi Hapus ${RUN}` });

    // Belum diarsipkan → 409.
    const notArchived = await api('DELETE', `/technicians/${tech.id}`, { token: adminToken });
    assert.equal(notArchived.status, 409);

    // Teknisi dengan riwayat penugasan tidak boleh dihapus.
    const ticket = await newTicket();
    await api('PATCH', `/tickets/${ticket.ticketId}/status`, {
      token: adminToken,
      body: { status: 'progress', teamId: 'electrical', assignee: tech.id },
    });
    await api('PATCH', `/tickets/${ticket.ticketId}/status`, {
      token: adminToken,
      body: { status: 'done' },
    });

    const withHistory = await api('DELETE', `/technicians/${tech.id}`, { token: adminToken });
    assert.equal(withHistory.status, 409);

    // Teknisi tanpa riwayat yang sudah diarsipkan boleh dihapus.
    const fresh = await createTechnician({ name: `Teknisi Hapus Bersih ${RUN}` });
    await api('POST', `/technicians/${fresh.id}/archive`, { token: adminToken });
    const removed = await api('DELETE', `/technicians/${fresh.id}`, { token: adminToken });
    assert.equal(removed.status, 200);
    createdTechIds.delete(fresh.id);
  });
});
