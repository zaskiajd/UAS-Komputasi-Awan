/* ==========================================================================
   tests/assets.test.js — Pengujian integrasi endpoint inventaris aset (admin)
   --------------------------------------------------------------------------
   Memakai server Express sungguhan terhadap PostgreSQL di DATABASE_URL.
   Prasyarat: database sudah di-import (npm run db:reset). Seluruh aset,
   tiket, lokasi, dan akun yang dibuat tes ini dibersihkan di test.after().
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
const LOCATION_MARKER = `Gedung Uji ${RUN}`;

const createdAssetIds = new Set();
const createdTicketIds = [];
const createdEmails = [];

let server;
let baseUrl;
let adminToken;
let studentToken;

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

function track(asset) {
  if (asset?.id) createdAssetIds.add(asset.id);
  return asset;
}

const assetPayload = (extra = {}) => ({
  name: `Aset Uji ${RUN}`,
  category: 'ac',
  location: `${LOCATION_MARKER} • Lt. 1`,
  zone: 'FT',
  teamId: 'electrical',
  ...extra,
});

async function createAsset(extra = {}) {
  const res = await api('POST', '/assets', { token: adminToken, body: assetPayload(extra) });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return track(res.body.data);
}

async function maxAssetNumber(prefix) {
  const { rows } = await query('SELECT id FROM assets WHERE id LIKE $1', [`AST-${prefix}-%`]);
  return rows.reduce((max, row) => {
    const n = Number(String(row.id).split('-').pop());
    return Number.isFinite(n) ? Math.max(max, n) : max;
  }, 0);
}

const pad = (n) => String(n).padStart(4, '0');

test.before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const login = await api('POST', '/auth/login', { body: ADMIN });
  assert.equal(login.status, 200, 'Login admin demo gagal — pastikan seed sudah di-import.');
  adminToken = login.body.data.token;

  const email = `aset.uji.${RUN}@student.unsil.ac.id`;
  createdEmails.push(email);
  const reg = await api('POST', '/auth/register', {
    body: {
      name: 'Mahasiswa Uji Aset',
      nim: `8${RUN}`.slice(0, 20),
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
    if (createdAssetIds.size) {
      await query('DELETE FROM assets WHERE id = ANY($1::text[])', [[...createdAssetIds]]);
    }
    await query('DELETE FROM locations WHERE building LIKE $1', [`%${RUN}%`]);
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

test.describe('Inventaris — akses', () => {
  test('semua endpoint aset wajib login → 401', async () => {
    const endpoints = [
      ['GET', '/assets'],
      ['POST', '/assets'],
      ['GET', '/assets/AST-AC-0312'],
      ['PATCH', '/assets/AST-AC-0312'],
      ['POST', '/assets/AST-AC-0312/service'],
      ['POST', '/assets/AST-AC-0312/archive'],
      ['POST', '/assets/AST-AC-0312/restore'],
      ['DELETE', '/assets/AST-AC-0312'],
    ];
    for (const [method, path] of endpoints) {
      const res = await api(method, path, { body: method === 'GET' || method === 'DELETE' ? undefined : {} });
      assert.equal(res.status, 401, `${method} ${path}`);
    }
  });

  test('mahasiswa mendapat 403 pada seluruh endpoint aset', async () => {
    assert.equal((await api('GET', '/assets', { token: studentToken })).status, 403);
    assert.equal(
      (await api('POST', '/assets', { token: studentToken, body: assetPayload() })).status,
      403
    );
    assert.equal(
      (await api('PATCH', '/assets/AST-AC-0312', { token: studentToken, body: { name: 'X' } })).status,
      403
    );
    assert.equal((await api('DELETE', '/assets/AST-AC-0312', { token: studentToken })).status, 403);
  });
});

/* ============================================================== CREATE ==== */

test.describe('Inventaris — tambah aset', () => {
  test('ID aset berurutan: AC pertama setelah seed 0312 → 0313, lalu 0314', async () => {
    const baseline = await maxAssetNumber('AC');
    const first = await createAsset({ name: 'AC Uji Urutan 1' });
    const second = await createAsset({ name: 'AC Uji Urutan 2' });

    assert.equal(first.id, `AST-AC-${pad(baseline + 1)}`);
    assert.equal(second.id, `AST-AC-${pad(baseline + 2)}`);
    // Sesuai kontrak §6.4.1 untuk database hasil seed murni.
    if (baseline === 312) {
      assert.equal(first.id, 'AST-AC-0313');
      assert.equal(second.id, 'AST-AC-0314');
    }
  });

  test('objek aset hasil POST sesuai bentuk renderer + condition/note default', async () => {
    const asset = await createAsset({
      name: 'AC Uji Bentuk',
      location: `${LOCATION_MARKER} • R. Bentuk`,
    });

    assert.match(asset.id, /^AST-AC-\d{4,}$/);
    assert.equal(asset.name, 'AC Uji Bentuk');
    assert.equal(asset.cat, 'ac');
    assert.deepEqual(asset.category, {
      code: 'ac',
      label: 'Kelistrikan & AC',
      icon: 'mode_fan',
    });
    assert.equal(asset.location, `${LOCATION_MARKER} • R. Bentuk`);
    assert.equal(asset.zone, 'FT');
    assert.ok(Number.isInteger(asset.locationId));
    assert.equal(asset.condition, 'good');
    assert.equal(asset.teamId, 'electrical');
    assert.equal(asset.note, 'Tidak ada catatan.');
    assert.equal(asset.archived, false);
    assert.equal(asset.archivedAt, null);
    assert.ok(asset.createdAt);
    assert.equal(asset.history.length, 1);
    assert.equal(asset.history[0].label, 'Aset terdaftar');
    assert.equal(asset.history[0].actor, 'Ir. Hendrawan');
    assert.equal(asset.history[0].note, 'Aset baru ditambahkan ke inventaris Sarpras.');
    assert.ok(asset.history[0].id);
  });

  test('lima aset kategori sama dibuat paralel → semua 201 dengan ID unik', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        api('POST', '/assets', {
          token: adminToken,
          body: assetPayload({
            name: `Aset Paralel ${i + 1}`,
            category: 'network',
            teamId: 'network',
            location: `${LOCATION_MARKER} • R. Paralel`,
          }),
        })
      )
    );

    for (const res of results) {
      assert.equal(res.status, 201, JSON.stringify(res.body));
      track(res.body.data);
    }
    const ids = results.map((res) => res.body.data.id);
    assert.equal(new Set(ids).size, 5);
    for (const id of ids) assert.match(id, /^AST-WIFI-\d{4,}$/);
  });

  test('lokasi find-or-create tidak menduplikasi baris, zona lama tidak ditimpa, round trip PATCH aman', async () => {
    const location = `${LOCATION_MARKER} • R. Dedupe`;
    const countLocations = async () => {
      const { rows } = await query('SELECT count(*)::int AS n FROM locations');
      return rows[0].n;
    };

    const before = await countLocations();
    const first = await createAsset({ name: 'Aset Dedupe 1', location, zone: 'FT' });
    const afterFirst = await countLocations();
    const second = await createAsset({ name: 'Aset Dedupe 2', location, zone: 'ZONA-BARU' });
    const afterSecond = await countLocations();

    assert.equal(afterFirst, before + 1);
    assert.equal(afterSecond, afterFirst);
    assert.equal(second.locationId, first.locationId);
    assert.equal(second.zone, 'FT', 'zona lama tidak boleh ditimpa');

    const detail = await api('GET', `/assets/${first.id}`, { token: adminToken });
    assert.equal(detail.status, 200);
    const sameLocation = await api('PATCH', `/assets/${first.id}`, {
      token: adminToken,
      body: { location: detail.body.data.location, zone: detail.body.data.zone },
    });
    assert.equal(sameLocation.status, 200, JSON.stringify(sameLocation.body));
    assert.equal(sameLocation.body.data.location, detail.body.data.location);
    assert.equal(sameLocation.body.data.locationId, first.locationId);
    assert.equal(await countLocations(), afterSecond);
  });

  test('validasi 422 per field: wajib, kategori/tim tak dikenal, kondisi, panjang teks', async () => {
    const empty = await api('POST', '/assets', { token: adminToken, body: {} });
    assert.equal(empty.status, 422);
    for (const field of ['name', 'category', 'location', 'zone', 'teamId']) {
      assert.ok(empty.body.errors[field], `error untuk ${field} harus ada`);
    }

    const badCategory = await api('POST', '/assets', {
      token: adminToken,
      body: assetPayload({ category: 'tidak-ada' }),
    });
    assert.equal(badCategory.status, 422);
    assert.ok(badCategory.body.errors.category);

    const badTeam = await api('POST', '/assets', {
      token: adminToken,
      body: assetPayload({ teamId: 'tim-palsu' }),
    });
    assert.equal(badTeam.status, 422);
    assert.ok(badTeam.body.errors.teamId);

    const badCondition = await api('POST', '/assets', {
      token: adminToken,
      body: assetPayload({ condition: 'rusak' }),
    });
    assert.equal(badCondition.status, 422);
    assert.ok(badCondition.body.errors.condition);

    const longName = await api('POST', '/assets', {
      token: adminToken,
      body: assetPayload({ name: 'x'.repeat(151) }),
    });
    assert.equal(longName.status, 422);
    assert.ok(longName.body.errors.name);

    const longNote = await api('POST', '/assets', {
      token: adminToken,
      body: assetPayload({ note: 'x'.repeat(1001) }),
    });
    assert.equal(longNote.status, 422);
    assert.ok(longNote.body.errors.note);
  });
});

/* ================================================================ LIST ==== */

test.describe('Inventaris — daftar, filter, pagination', () => {
  test('default hanya aset aktif; status=archived/all memfilter dengan benar', async () => {
    const toArchive = await createAsset({
      name: 'Aset Uji Arsip Daftar',
      location: `${LOCATION_MARKER} • R. Arsip Daftar`,
    });
    const archived = await api('POST', `/assets/${toArchive.id}/archive`, { token: adminToken });
    assert.equal(archived.status, 200);

    const active = await api('GET', '/assets?limit=500', { token: adminToken });
    assert.equal(active.status, 200);
    assert.ok(active.body.data.every((item) => item.archived === false));
    assert.ok(active.body.data.some((item) => item.id === 'AST-AC-0312'));
    assert.ok(!active.body.data.some((item) => item.id === toArchive.id));
    assert.ok(active.body.meta.total >= active.body.data.length);

    const archivedList = await api('GET', '/assets?status=archived&limit=500', {
      token: adminToken,
    });
    assert.equal(archivedList.status, 200);
    assert.ok(archivedList.body.data.length >= 1);
    assert.ok(archivedList.body.data.every((item) => item.archived === true));
    assert.ok(archivedList.body.data.some((item) => item.id === toArchive.id));

    const all = await api('GET', '/assets?status=all&limit=500', { token: adminToken });
    assert.equal(all.status, 200);
    assert.ok(all.body.data.some((item) => item.id === toArchive.id));
    assert.ok(all.body.data.some((item) => item.id === 'AST-AC-0312'));

    const detail = await api('GET', `/assets/${toArchive.id}`, { token: adminToken });
    assert.equal(detail.status, 200);
    assert.ok(detail.body.data.history.some((entry) => entry.label === 'Aset diarsipkan'));
    const dates = detail.body.data.history.map((entry) => new Date(entry.at).getTime());
    assert.deepEqual(dates, [...dates].sort((a, b) => b - a), 'riwayat terbaru lebih dulu');
  });

  test('filter condition/category/q dan pagination; parameter salah → 422', async () => {
    const byCondition = await api('GET', '/assets?condition=service&limit=500', {
      token: adminToken,
    });
    assert.equal(byCondition.status, 200);
    assert.ok(byCondition.body.data.length >= 1);
    assert.ok(byCondition.body.data.every((item) => item.condition === 'service'));

    const byCategory = await api('GET', '/assets?category=projector&limit=500', {
      token: adminToken,
    });
    assert.equal(byCategory.status, 200);
    assert.ok(byCategory.body.data.every((item) => item.cat === 'projector'));
    assert.ok(byCategory.body.data.some((item) => item.id === 'AST-PRJ-0087'));

    const byQuery = await api('GET', '/assets?q=AST-AC-0312', { token: adminToken });
    assert.equal(byQuery.status, 200);
    assert.equal(byQuery.body.data.length, 1);
    assert.equal(byQuery.body.data[0].id, 'AST-AC-0312');

    const page = await api('GET', '/assets?status=all&limit=1&offset=1', { token: adminToken });
    assert.equal(page.status, 200);
    assert.equal(page.body.data.length, 1);
    assert.ok(page.body.meta.total >= 2);
    assert.equal(page.body.meta.limit, 1);
    assert.equal(page.body.meta.offset, 1);

    assert.equal((await api('GET', '/assets?status=ngawur', { token: adminToken })).status, 422);
    assert.equal((await api('GET', '/assets?condition=rusak', { token: adminToken })).status, 422);
    assert.equal((await api('GET', '/assets?limit=0', { token: adminToken })).status, 422);
    assert.equal((await api('GET', '/assets?limit=501', { token: adminToken })).status, 422);
    assert.equal((await api('GET', '/assets?offset=-1', { token: adminToken })).status, 422);
  });
});

/* ================================================================ EDIT ==== */

test.describe('Inventaris — edit aset', () => {
  test('PATCH mencatat diff lengkap dan ID tidak berubah', async () => {
    const oldLocation = `${LOCATION_MARKER} • R. Diff Lama`;
    const newLocation = `${LOCATION_MARKER} • R. Diff Baru`;
    const asset = await createAsset({ name: 'Aset Diff', location: oldLocation });
    const id = asset.id;

    const res = await api('PATCH', `/assets/${id}`, {
      token: adminToken,
      body: {
        name: 'Aset Diff Baru',
        category: 'projector',
        location: newLocation,
        zone: 'FT',
        teamId: 'av',
        condition: 'broken',
        note: 'Catatan hasil edit.',
      },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.id, id);
    assert.equal(res.body.data.name, 'Aset Diff Baru');
    assert.equal(res.body.data.cat, 'projector');
    assert.equal(res.body.data.location, newLocation);
    assert.equal(res.body.data.teamId, 'av');
    assert.equal(res.body.data.condition, 'broken');
    assert.equal(res.body.data.note, 'Catatan hasil edit.');

    const entry = res.body.data.history[0];
    assert.equal(entry.label, 'Data aset diperbarui');
    assert.equal(entry.actor, 'Ir. Hendrawan');
    assert.equal(
      entry.note,
      `nama: Aset Diff → Aset Diff Baru; kategori: Kelistrikan & AC → Proyektor & Audio; ` +
        `lokasi: ${oldLocation} → ${newLocation}; ` +
        'tim: Tim Kelistrikan & Tata Udara → Tim Multimedia & AV; kondisi: Baik → Rusak'
    );

    const { rows } = await query(
      `SELECT label, actor, note FROM asset_history WHERE asset_id = $1 ORDER BY id DESC LIMIT 1`,
      [id]
    );
    assert.equal(rows[0].label, 'Data aset diperbarui');
    assert.equal(rows[0].actor, 'Ir. Hendrawan');
  });

  test('PATCH tanpa perubahan mencatat teks default dan tidak mengubah ID', async () => {
    const asset = await createAsset({
      name: 'Aset Tanpa Perubahan',
      location: `${LOCATION_MARKER} • R. Tetap`,
      condition: 'good',
    });

    const res = await api('PATCH', `/assets/${asset.id}`, {
      token: adminToken,
      body: {
        name: asset.name,
        category: asset.cat,
        location: asset.location,
        zone: asset.zone,
        teamId: asset.teamId,
        condition: asset.condition,
        note: asset.note,
      },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.id, asset.id);
    assert.equal(res.body.data.history[0].label, 'Data aset diperbarui');
    assert.equal(
      res.body.data.history[0].note,
      'Detail aset diperbarui tanpa perubahan kondisi.'
    );
  });

  test('edit aset terarsip → 409; PATCH kosong → 422; ID tidak valid → 404', async () => {
    const asset = await createAsset({
      name: 'Aset Edit Arsip',
      location: `${LOCATION_MARKER} • R. Edit Arsip`,
    });
    await api('POST', `/assets/${asset.id}/archive`, { token: adminToken });

    const archivedEdit = await api('PATCH', `/assets/${asset.id}`, {
      token: adminToken,
      body: { name: 'Tidak boleh' },
    });
    assert.equal(archivedEdit.status, 409);
    assert.match(archivedEdit.body.message, /diarsipkan/i);

    const active = await createAsset({
      name: 'Aset Patch Kosong',
      location: `${LOCATION_MARKER} • R. Patch Kosong`,
    });
    const empty = await api('PATCH', `/assets/${active.id}`, { token: adminToken, body: {} });
    assert.equal(empty.status, 422);
    assert.ok(empty.body.errors._);

    const foreign = await api('PATCH', `/assets/${active.id}`, {
      token: adminToken,
      body: { id: 'AST-AC-9999', archived: true },
    });
    assert.equal(foreign.status, 422);

    assert.equal(
      (await api('PATCH', '/assets/BUKAN-ASET', { token: adminToken, body: { name: 'X' } })).status,
      404
    );
    assert.equal(
      (await api('GET', '/assets/AST-AC-9999', { token: adminToken })).status,
      404
    );
  });
});

/* ====================================================== SERVIS & ARSIP ==== */

test.describe('Inventaris — servis, arsip, pulihkan', () => {
  test('tandai selesai servis mengubah condition, lastServiceAt, note, dan riwayat', async () => {
    const asset = await createAsset({
      name: 'Aset Uji Servis',
      location: `${LOCATION_MARKER} • R. Servis`,
      condition: 'service',
      note: 'Perlu pengecekan.',
    });
    assert.equal(asset.lastServiceAt, null);

    const res = await api('POST', `/assets/${asset.id}/service`, { token: adminToken });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.condition, 'good');
    assert.ok(res.body.data.lastServiceAt);
    assert.equal(
      res.body.data.note,
      'Servis selesai dan aset dinyatakan kembali dalam kondisi baik.'
    );
    assert.equal(res.body.data.history[0].label, 'Servis selesai');
    assert.equal(res.body.data.history[0].actor, 'Ir. Hendrawan');

    const { rows } = await query(
      'SELECT condition, last_service_at, note FROM assets WHERE id = $1',
      [asset.id]
    );
    assert.equal(rows[0].condition, 'good');
    assert.ok(rows[0].last_service_at);
    assert.equal(
      rows[0].note,
      'Servis selesai dan aset dinyatakan kembali dalam kondisi baik.'
    );
  });

  test('arsip lalu pulihkan; aksi ganda dan servis pada aset terarsip → 409', async () => {
    const asset = await createAsset({
      name: 'Aset Uji Arsip Pulih',
      location: `${LOCATION_MARKER} • R. Arsip Pulih`,
    });

    const archived = await api('POST', `/assets/${asset.id}/archive`, { token: adminToken });
    assert.equal(archived.status, 200);
    assert.equal(archived.body.data.archived, true);
    assert.ok(archived.body.data.archivedAt);
    assert.equal(archived.body.data.history[0].label, 'Aset diarsipkan');

    const archivedAgain = await api('POST', `/assets/${asset.id}/archive`, { token: adminToken });
    assert.equal(archivedAgain.status, 409);

    const serviceArchived = await api('POST', `/assets/${asset.id}/service`, {
      token: adminToken,
    });
    assert.equal(serviceArchived.status, 409);

    const restored = await api('POST', `/assets/${asset.id}/restore`, { token: adminToken });
    assert.equal(restored.status, 200);
    assert.equal(restored.body.data.archived, false);
    assert.equal(restored.body.data.archivedAt, null);
    assert.equal(restored.body.data.history[0].label, 'Aset dipulihkan');

    const restoredAgain = await api('POST', `/assets/${asset.id}/restore`, { token: adminToken });
    assert.equal(restoredAgain.status, 409);
  });
});

/* ============================================================== DELETE ==== */

test.describe('Inventaris — hapus permanen', () => {
  test('ditolak bila belum diarsipkan, punya riwayat servis, atau terkait tiket', async () => {
    const active = await createAsset({
      name: 'Aset Hapus Aktif',
      location: `${LOCATION_MARKER} • R. Hapus Aktif`,
    });
    const notArchived = await api('DELETE', `/assets/${active.id}`, { token: adminToken });
    assert.equal(notArchived.status, 409);
    assert.match(notArchived.body.message, /diarsipkan/i);

    const serviced = await createAsset({
      name: 'Aset Hapus Servis',
      location: `${LOCATION_MARKER} • R. Hapus Servis`,
      condition: 'service',
    });
    await api('POST', `/assets/${serviced.id}/service`, { token: adminToken });
    await api('POST', `/assets/${serviced.id}/archive`, { token: adminToken });
    const hasService = await api('DELETE', `/assets/${serviced.id}`, { token: adminToken });
    assert.equal(hasService.status, 409);
    assert.match(hasService.body.message, /riwayat servis/i);

    const linked = await createAsset({
      name: 'Aset Hapus Tiket',
      location: `${LOCATION_MARKER} • R. Hapus Tiket`,
    });
    await api('POST', `/assets/${linked.id}/archive`, { token: adminToken });
    const { rows } = await query(
      `INSERT INTO tickets (title, reporter_name, category_id, asset_id)
       SELECT 'Tiket uji hapus aset', 'Admin Uji', c.id, $1
         FROM categories c WHERE c.code = $2
       RETURNING id`,
      [linked.id, linked.cat]
    );
    createdTicketIds.push(rows[0].id);

    const linkedDelete = await api('DELETE', `/assets/${linked.id}`, { token: adminToken });
    assert.equal(linkedDelete.status, 409);
    assert.match(linkedDelete.body.message, /tiket terkait/i);
    const stillThere = await query('SELECT 1 FROM assets WHERE id = $1', [linked.id]);
    assert.equal(stillThere.rows.length, 1);

    const seedDelete = await api('DELETE', '/assets/AST-AC-0312', { token: adminToken });
    assert.equal(seedDelete.status, 409);
    assert.ok(seedDelete.body.message);
    const seedStill = await query('SELECT 1 FROM assets WHERE id = $1', ['AST-AC-0312']);
    assert.equal(seedStill.rows.length, 1);
  });

  test('hapus sukses pada aset baru terarsip tanpa servis; asset_history ikut terhapus', async () => {
    const asset = await createAsset({
      name: 'Aset Hapus Sukses',
      location: `${LOCATION_MARKER} • R. Hapus Sukses`,
    });
    await api('POST', `/assets/${asset.id}/archive`, { token: adminToken });

    const historyBefore = await query(
      'SELECT count(*)::int AS n FROM asset_history WHERE asset_id = $1',
      [asset.id]
    );
    assert.ok(historyBefore.rows[0].n >= 2);

    const res = await api('DELETE', `/assets/${asset.id}`, { token: adminToken });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.id, asset.id);
    createdAssetIds.delete(asset.id);

    const assetGone = await query('SELECT 1 FROM assets WHERE id = $1', [asset.id]);
    assert.equal(assetGone.rows.length, 0);
    const historyGone = await query('SELECT 1 FROM asset_history WHERE asset_id = $1', [asset.id]);
    assert.equal(historyGone.rows.length, 0);

    assert.equal((await api('DELETE', '/assets/AST-AC-9999', { token: adminToken })).status, 404);
  });
});
