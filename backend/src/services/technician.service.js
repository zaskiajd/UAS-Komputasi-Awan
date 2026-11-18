/* ==========================================================================
   services/technician.service.js — Logika bisnis & query manajemen teknisi
   --------------------------------------------------------------------------
   - Semua endpoint teknisi hanya untuk admin (ditegakkan di route).
   - Bentuk objek keluaran mengikuti objek teknisi di frontend
     (js/data/technicians.js, lihat docs/db-contract.md).
   - Sumber daftar: view v_technician_workload (sudah menghitung beban
     tiket aktif/selesai per teknisi) sehingga frontend tidak perlu N+1.
   - Aturan bisnis yang dipertahankan dari frontend lama:
       * satu koordinator per tim (teams.coordinator_id disinkronkan);
       * teknisi yang masih memegang tiket aktif tidak boleh diarsipkan
         atau dipensiunkan dari tugas;
       * hapus permanen hanya boleh untuk teknisi yang sudah diarsipkan
         dan tidak punya riwayat penugasan (FK RESTRICT).
   ========================================================================== */

const { query, withTransaction } = require('../config/db');
const { ApiError, notFound, conflict } = require('../utils/errors');

const TECHNICIAN_ROLES = ['Koordinator', 'Teknisi'];

const WORKLOAD_COLUMNS = `
  technician_id, name, title, role, team_id, team_name, team_short_name,
  active, archived, phone, skills,
  active_ticket_count, done_ticket_count, total_ticket_count`;

/* ------------------------------------------------------------------ mapping */

function mapTechnician(row) {
  return {
    id: row.technician_id,
    name: row.name,
    title: row.title || '',
    role: row.role,
    teamId: row.team_id,
    teamName: row.team_name || null,
    teamShortName: row.team_short_name || null,
    active: row.active,
    archived: row.archived,
    phone: row.phone || '',
    skills: row.skills || [],
    activeTicketCount: Number(row.active_ticket_count) || 0,
    doneTicketCount: Number(row.done_ticket_count) || 0,
    totalTicketCount: Number(row.total_ticket_count) || 0,
  };
}

/* ------------------------------------------------------------------ helpers */

/** ID unik untuk teknisi baru, diturunkan dari nama (sama seperti frontend lama). */
const slugify = (value) =>
  String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

async function nextTechnicianId(client, name) {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['technicians:id']);
  const base = slugify(name) || `tech-${Date.now().toString(36)}`;

  const { rows } = await client.query(
    `SELECT id FROM technicians WHERE id = $1 OR id LIKE $1 || '-%' ORDER BY id`,
    [base]
  );
  if (rows.length === 0) return base;

  const taken = new Set(rows.map((row) => row.id));
  let candidate = base;
  let counter = 2;
  while (taken.has(candidate)) {
    candidate = `${base}-${counter}`;
    counter += 1;
  }
  return candidate;
}

/** Pastikan teknisi dengan role Koordinator menjadi satu-satunya koordinator timnya. */
async function enforceCoordinator(client, techId, teamId, role) {
  if (role !== 'Koordinator') return;

  const { rows } = await client.query(
    `SELECT id FROM technicians
      WHERE team_id = $1 AND role = 'Koordinator' AND id <> $2 AND archived = false`,
    [teamId, techId]
  );
  if (rows.length > 0) {
    throw conflict('Tim ini sudah memiliki koordinator aktif.', {
      role: 'Tim ini sudah memiliki koordinator aktif. Turunkan koordinator lama terlebih dahulu.',
    });
  }

  await client.query('UPDATE teams SET coordinator_id = $1 WHERE id = $2', [techId, teamId]);
}

/** Hitung jumlah tiket aktif yang dipegang teknisi (status tiket belum selesai). */
async function countActiveTickets(client, techId) {
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS count
       FROM ticket_assignments ta
       JOIN tickets t ON t.id = ta.ticket_id
      WHERE ta.technician_id = $1
        AND ta.status = 'active'
        AND t.status NOT IN ('done', 'rejected')`,
    [techId]
  );
  return rows[0].count;
}

/* --------------------------------------------------------------------- READ */

async function listTechnicians() {
  const { rows } = await query(
    `SELECT ${WORKLOAD_COLUMNS}
       FROM v_technician_workload
      ORDER BY archived ASC,
               team_id ASC,
               CASE WHEN role = 'Koordinator' THEN 0 ELSE 1 END,
               name ASC`
  );
  return rows.map(mapTechnician);
}

/* ------------------------------------------------------------------- CREATE */

async function createTechnician(user, input) {
  const id = await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT id FROM teams WHERE id = $1', [input.teamId]);
    if (rows.length === 0) {
      throw new ApiError(422, 'Data yang dikirim tidak valid.', {
        teamId: `Tim '${input.teamId}' tidak ditemukan.`,
      });
    }

    const newId = await nextTechnicianId(client, input.name);
    await client.query(
      `INSERT INTO technicians (id, name, title, role, team_id, active, phone, skills)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        newId,
        input.name,
        input.title || null,
        input.role,
        input.teamId,
        input.active !== false,
        input.phone || null,
        input.skills || [],
      ]
    );

    await enforceCoordinator(client, newId, input.teamId, input.role);
    return newId;
  });

  return getTechnicianDetail(id);
}

/* ------------------------------------------------------------------- UPDATE */

async function updateTechnician(techId, user, input) {
  await withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT id, role, team_id, archived FROM technicians WHERE id = $1 FOR UPDATE',
      [techId]
    );
    if (rows.length === 0) throw notFound('Teknisi tidak ditemukan.');
    const current = rows[0];
    if (current.archived) {
      throw conflict('Teknisi yang diarsipkan tidak dapat diubah. Pulihkan terlebih dahulu.');
    }

    const teamId = input.teamId !== undefined ? input.teamId : current.team_id;
    if (input.teamId !== undefined) {
      const { rows: teamRows } = await client.query('SELECT id FROM teams WHERE id = $1', [
        input.teamId,
      ]);
      if (teamRows.length === 0) {
        throw new ApiError(422, 'Data yang dikirim tidak valid.', {
          teamId: `Tim '${input.teamId}' tidak ditemukan.`,
        });
      }
    }

    const role = input.role !== undefined ? input.role : current.role;

    // Pindah tim: lepaskan jabatan koordinator di tim lama.
    if (current.team_id && current.team_id !== teamId && current.role === 'Koordinator') {
      await client.query(
        `UPDATE teams SET coordinator_id = NULL
          WHERE id = $1 AND coordinator_id = $2`,
        [current.team_id, techId]
      );
    }

    // Gabungkan nilai baru dengan nilai tersimpan (PATCH parsial).
    const merged = await client.query(
      `SELECT name, title, role, team_id, active, phone, skills FROM technicians WHERE id = $1`,
      [techId]
    );
    const prev = merged.rows[0];

    await client.query(
      `UPDATE technicians
          SET name  = $2, title = $3, role = $4, team_id = $5,
              active = $6, phone = $7, skills = $8
        WHERE id = $1`,
      [
        techId,
        input.name !== undefined ? input.name : prev.name,
        input.title !== undefined ? input.title || null : prev.title,
        role,
        teamId,
        input.active !== undefined ? input.active : prev.active,
        input.phone !== undefined ? input.phone || null : prev.phone,
        input.skills !== undefined ? input.skills : prev.skills,
      ]
    );

    await enforceCoordinator(client, techId, teamId, role);
  });

  return getTechnicianDetail(techId);
}

/* ------------------------------------------------------------------ ACTIONS */

/** true = bertugas, false = standby. Tidak boleh standby bila masih pegang tiket. */
async function setDuty(techId, active, user) {
  await withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT id, archived FROM technicians WHERE id = $1 FOR UPDATE',
      [techId]
    );
    if (rows.length === 0) throw notFound('Teknisi tidak ditemukan.');
    if (rows[0].archived) throw conflict('Teknisi yang diarsipkan tidak dapat mengubah tugas.');

    if (!active) {
      const activeCount = await countActiveTickets(client, techId);
      if (activeCount > 0) {
        throw conflict(
          'Teknisi masih memegang tiket aktif dan tidak dapat dipensiunkan dari tugas.'
        );
      }
    }

    await client.query('UPDATE technicians SET active = $2 WHERE id = $1', [techId, active]);
  });

  return getTechnicianDetail(techId);
}

async function archiveTechnician(techId, user) {
  await withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT id, archived, role, team_id FROM technicians WHERE id = $1 FOR UPDATE',
      [techId]
    );
    if (rows.length === 0) throw notFound('Teknisi tidak ditemukan.');
    if (rows[0].archived) throw conflict('Teknisi sudah diarsipkan.');

    const activeCount = await countActiveTickets(client, techId);
    if (activeCount > 0) {
      throw conflict('Teknisi masih memegang tiket aktif dan tidak dapat diarsipkan.');
    }

    await client.query(
      `UPDATE technicians SET archived = true, active = false WHERE id = $1`,
      [techId]
    );
    // Lepaskan jabatan koordinator bila ada; arsip tidak boleh tetap memegang tim.
    await client.query(
      `UPDATE teams SET coordinator_id = NULL WHERE coordinator_id = $1`,
      [techId]
    );
  });

  return getTechnicianDetail(techId);
}

async function restoreTechnician(techId, user) {
  await withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT id, archived FROM technicians WHERE id = $1 FOR UPDATE',
      [techId]
    );
    if (rows.length === 0) throw notFound('Teknisi tidak ditemukan.');
    if (!rows[0].archived) throw conflict('Teknisi tidak sedang diarsipkan.');

    await client.query(
      `UPDATE technicians SET archived = false, active = true WHERE id = $1`,
      [techId]
    );

    // Sinkronkan kembali koordinator bila teknisi ini ber-role Koordinator.
    const { rows: techRows } = await client.query(
      'SELECT role, team_id FROM technicians WHERE id = $1',
      [techId]
    );
    await enforceCoordinator(client, techId, techRows[0].team_id, techRows[0].role);
  });

  return getTechnicianDetail(techId);
}

/* ------------------------------------------------------------------- DELETE */

async function deleteTechnicianPermanently(techId) {
  try {
    return await withTransaction(async (client) => {
      const { rows } = await client.query(
        'SELECT id, archived FROM technicians WHERE id = $1 FOR UPDATE',
        [techId]
      );
      if (rows.length === 0) throw notFound('Teknisi tidak ditemukan.');

      if (!rows[0].archived) {
        throw conflict('Teknisi harus diarsipkan sebelum dapat dihapus permanen.');
      }

      const linked = await client.query(
        'SELECT 1 FROM ticket_assignments WHERE technician_id = $1 LIMIT 1',
        [techId]
      );
      if (linked.rows.length > 0) {
        throw conflict(
          'Teknisi memiliki riwayat penugasan tiket dan hanya dapat diarsipkan, bukan dihapus.'
        );
      }

      await client.query('DELETE FROM technicians WHERE id = $1', [techId]);
      return { id: techId };
    });
  } catch (error) {
    // FK RESTRICT dari PostgreSQL → pesan yang sama dan jelas.
    if (error.code === '23503') {
      throw conflict('Teknisi memiliki riwayat penugasan tiket dan tidak dapat dihapus permanen.');
    }
    throw error;
  }
}

/* ------------------------------------------------------------------- DETAIL */

async function getTechnicianDetail(techId) {
  const { rows } = await query(
    `SELECT ${WORKLOAD_COLUMNS} FROM v_technician_workload WHERE technician_id = $1`,
    [techId]
  );
  if (rows.length === 0) throw notFound('Teknisi tidak ditemukan.');
  return mapTechnician(rows[0]);
}

module.exports = {
  TECHNICIAN_ROLES,
  listTechnicians,
  getTechnicianDetail,
  createTechnician,
  updateTechnician,
  setDuty,
  archiveTechnician,
  restoreTechnician,
  deleteTechnicianPermanently,
};
