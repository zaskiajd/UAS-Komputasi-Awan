/* ==========================================================================
   services/ticket.service.js — Logika bisnis & query pengaduan (tiket)
   --------------------------------------------------------------------------
   Aturan utama:
   - Mahasiswa hanya melihat/mengelola tiket MILIKNYA yang belum di-soft-delete.
     Tiket orang lain dijawab 404 (bukan 403) agar keberadaannya tidak bocor.
   - Mahasiswa boleh mengubah tiket hanya saat status 'review'.
   - Hapus oleh mahasiswa:
       review         → dibatalkan (baris dihapus permanen)
       done/rejected  → "hapus riwayat" (soft delete: deleted_by_student_at)
       progress/waiting → ditolak 409 (sedang ditangani)
   - Admin melihat semua tiket dan mengubah status (tercatat di ticket_history).
   Bentuk objek keluaran mengikuti objek `report` di frontend
   (lihat docs/db-contract.md §5.1).
   ========================================================================== */

const { query, withTransaction } = require('../config/db');
const { ApiError, notFound, conflict } = require('../utils/errors');
const { mapPhoto, removeUploadFiles } = require('../utils/uploads');

const SLA_HOURS = { Tinggi: 2, Sedang: 6, Rendah: 24 };

const STATUS_SHORT = {
  review: 'Verifikasi',
  progress: 'Diproses',
  waiting: 'Menunggu',
  done: 'Selesai',
  rejected: 'Ditolak',
};

const STATUS_LABEL = {
  review: 'Dikembalikan ke antrean verifikasi',
  progress: 'Penanganan dilanjutkan',
  waiting: 'Menunggu suku cadang',
  done: 'Pekerjaan selesai & divalidasi',
  rejected: 'Pengaduan ditolak',
};

/* ------------------------------------------------------------------ mapping */

function mapTicket(row, { admin = false } = {}) {
  const ticket = {
    id: row.ticket_code,
    ticketId: row.id,
    title: row.title,
    description: row.description,
    reporter: row.reporter_name,
    owner: row.owner_nim,
    location: row.location_label,
    locationId: row.location_id,
    building: row.location_building,
    room: row.location_detail || row.location_room || null,
    cat: row.category_code,
    category: {
      code: row.category_code,
      label: row.category_label,
      icon: row.category_icon,
    },
    status: row.status,
    priority: row.priority,
    urgent: row.urgent,
    progress: row.progress,
    teamId: row.team_id,
    team: row.team_name,
    assignee: row.pic_technician_id,
    assigneeName: row.pic_name,
    photoUrl: row.photo_url,
    photos: [],
    slaDueAt: row.sla_due_at,
    isOverdue: row.is_overdue,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
  if (admin) ticket.deletedByStudentAt = row.deleted_by_student_at;
  return ticket;
}

/* ------------------------------------------------------------------ helpers */

/** Bangun klausa WHERE untuk mengunci tiket berdasarkan id/kode + hak akses. */
function accessFilter(ref, user, alias = '') {
  const col = (name) => (alias ? `${alias}.${name}` : name);
  const params = [ref.value];
  const clauses = [ref.by === 'id' ? `${col('id')} = $1` : `${col('ticket_code')} = $1`];

  if (user.role !== 'admin') {
    params.push(user.id);
    clauses.push(`${col('owner_id')} = $2`, `${col('deleted_by_student_at')} IS NULL`);
  }
  return { where: clauses.join(' AND '), params };
}

/** Terjemahkan input lokasi (locationId | building + room) → kolom tiket. */
async function resolveLocation(client, input) {
  const room = (input.room || '').trim();

  if (input.locationId) {
    const { rows } = await client.query(
      'SELECT id, building, room FROM locations WHERE id = $1',
      [input.locationId]
    );
    if (rows.length === 0) {
      throw new ApiError(422, 'Data yang dikirim tidak valid.', {
        locationId: 'Lokasi tidak ditemukan.',
      });
    }
    return { locationId: rows[0].id, locationDetail: room || null };
  }

  const building = input.building;
  const { rows } = await client.query(
    `SELECT id FROM locations
      WHERE building = $1
      ORDER BY (room IS NULL) DESC, id
      LIMIT 1`,
    [building]
  );
  if (rows.length > 0) {
    return { locationId: rows[0].id, locationDetail: room || null };
  }
  // Gedung belum ada di master lokasi: simpan sebagai teks bebas agar laporan tidak hilang.
  return { locationId: null, locationDetail: room ? `${building} • ${room}` : building };
}

async function resolveCategory(client, code) {
  const { rows } = await client.query('SELECT id FROM categories WHERE code = $1', [code]);
  if (rows.length === 0) {
    throw new ApiError(422, 'Data yang dikirim tidak valid.', {
      category: `Kategori '${code}' tidak ditemukan.`,
    });
  }
  return rows[0].id;
}

const addHistory = (client, ticketId, { label, actor, status, note }) =>
  client.query(
    `INSERT INTO ticket_history (ticket_id, label, actor, status, note)
     VALUES ($1, $2, $3, $4, $5)`,
    [ticketId, label, actor, status, note ?? null]
  );

/* --------------------------------------------------------------------- READ */

/**
 * Daftar tiket. Mahasiswa: miliknya saja. Admin: semua (termasuk yang sudah
 * dihapus dari riwayat mahasiswa).
 */
async function listTickets(user, filters = {}) {
  const admin = user.role === 'admin';
  const params = [];
  const where = [];
  const add = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (!admin) {
    where.push(`owner_id = ${add(user.id)}`, 'deleted_by_student_at IS NULL');
  }
  if (filters.status) where.push(`status = ${add(filters.status)}`);
  if (filters.category) where.push(`category_code = ${add(filters.category)}`);
  if (filters.priority) where.push(`priority = ${add(filters.priority)}`);
  if (filters.q) {
    const like = `%${filters.q.replace(/[\\%_]/g, '\\$&')}%`;
    const p = add(like);
    where.push(
      `(title ILIKE ${p} OR ticket_code ILIKE ${p} OR location_label ILIKE ${p}` +
        ` OR reporter_name ILIKE ${p} OR description ILIKE ${p})`
    );
  }

  const limit = add(filters.limit);
  const offset = add(filters.offset);

  const { rows } = await query(
    `SELECT *, COUNT(*) OVER() AS total_count
       FROM v_ticket_summary
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY created_at DESC, id DESC
      LIMIT ${limit} OFFSET ${offset}`,
    params
  );

  const items = rows.map((row) => mapTicket(row, { admin }));

  // Lampirkan semua foto dengan satu query terkelompok (hindari N+1).
  if (items.length > 0) {
    const ids = rows.map((row) => row.id);
    const photos = await query(
      `SELECT id, ticket_id, file_name, mime_type, size_bytes, created_at
         FROM ticket_photos
        WHERE ticket_id = ANY($1::int[])
        ORDER BY created_at ASC, id ASC`,
      [ids]
    );
    const grouped = new Map(ids.map((id) => [id, []]));
    for (const photo of photos.rows) {
      const list = grouped.get(photo.ticket_id);
      if (list) list.push(mapPhoto(photo));
    }
    for (let i = 0; i < items.length; i += 1) {
      const list = grouped.get(rows[i].id) || [];
      items[i].photos = list;
      if (list.length > 0) items[i].photoUrl = list[0].url;
    }
  }

  return {
    items,
    total: rows.length ? Number(rows[0].total_count) : 0,
  };
}

/** Detail tiket + riwayat + komentar (+ penugasan untuk admin). */
async function getTicketDetail(ref, user, client = { query }) {
  const admin = user.role === 'admin';
  const { where, params } = accessFilter(ref, user);

  const { rows } = await client.query(`SELECT * FROM v_ticket_summary WHERE ${where}`, params);
  if (rows.length === 0) throw notFound('Pengaduan tidak ditemukan.');

  const row = rows[0];
  const ticket = mapTicket(row, { admin });

  const photos = await client.query(
    `SELECT id, file_name, mime_type, size_bytes, created_at
       FROM ticket_photos
      WHERE ticket_id = $1
      ORDER BY created_at ASC, id ASC`,
    [row.id]
  );
  ticket.photos = photos.rows.map(mapPhoto);
  if (ticket.photos.length > 0) ticket.photoUrl = ticket.photos[0].url;

  const history = await client.query(
    `SELECT id, at, label, actor, status, note
       FROM ticket_history
      WHERE ticket_id = $1
      ORDER BY at ASC, id ASC`,
    [row.id]
  );
  ticket.history = history.rows.map((h) => ({
    id: Number(h.id),
    at: h.at,
    label: h.label,
    actor: h.actor,
    status: h.status,
    note: h.note,
  }));

  // Mahasiswa hanya melihat tanggapan publik; catatan/instruksi internal hanya admin.
  const comments = await client.query(
    `SELECT id, kind, author_name, target_technician_id, body, read_at, created_at
       FROM ticket_comments
      WHERE ticket_id = $1
        ${admin ? '' : "AND kind = 'response' AND is_public = true"}
      ORDER BY created_at ASC, id ASC`,
    [row.id]
  );
  ticket.responses = [];
  if (admin) {
    ticket.notes = [];
    ticket.instructions = [];
  }
  for (const c of comments.rows) {
    if (c.kind === 'response') {
      ticket.responses.push({ id: Number(c.id), at: c.created_at, author: c.author_name, text: c.body });
    } else if (c.kind === 'note') {
      ticket.notes.push({ id: Number(c.id), at: c.created_at, author: c.author_name, text: c.body });
    } else if (c.kind === 'instruction') {
      ticket.instructions.push({
        id: Number(c.id),
        at: c.created_at,
        from: c.author_name,
        toTechId: c.target_technician_id,
        text: c.body,
        readAt: c.read_at,
      });
    }
  }

  if (admin) {
    const assignments = await client.query(
      `SELECT ta.technician_id, ta.role, ta.status, ta.assigned_at, u.name AS assigned_by
         FROM ticket_assignments ta
         LEFT JOIN users u ON u.id = ta.assigned_by
        WHERE ta.ticket_id = $1
        ORDER BY ta.assigned_at ASC, ta.id ASC`,
      [row.id]
    );
    ticket.assignments = assignments.rows.map((a) => ({
      techId: a.technician_id,
      role: a.role,
      status: a.status,
      assignedAt: a.assigned_at,
      assignedBy: a.assigned_by,
    }));
  }

  return ticket;
}

/* ------------------------------------------------------------------- CREATE */

async function createTicket(user, input) {
  const ticketId = await withTransaction(async (client) => {
    const categoryId = await resolveCategory(client, input.category);
    const { locationId, locationDetail } = await resolveLocation(client, input);
    const reporter = user.nim ? `${user.name} (Mhs • ${user.nim})` : user.name;

    const { rows } = await client.query(
      `INSERT INTO tickets
         (title, description, reporter_name, owner_id, category_id,
          location_id, location_detail, priority, urgent, photo_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        input.title,
        input.description,
        reporter,
        user.id,
        categoryId,
        locationId,
        locationDetail,
        input.priority,
        input.priority === 'Tinggi',
        input.photoUrl || null,
      ]
    );

    await addHistory(client, rows[0].id, {
      label: 'Pengaduan diterima',
      actor: user.name,
      status: 'review',
      note: 'Laporan masuk ke antrean verifikasi Biro Sarpras.',
    });

    return rows[0].id;
  });

  return getTicketDetail({ by: 'id', value: ticketId }, user);
}

/* ------------------------------------------------------------------- UPDATE */

/** Mahasiswa mengubah laporannya sendiri — hanya selama status 'review'. */
async function updateOwnTicket(ref, user, input) {
  const ticketId = await withTransaction(async (client) => {
    const { where, params } = accessFilter(ref, user);
    const { rows } = await client.query(
      `SELECT id, status, created_at FROM tickets WHERE ${where} FOR UPDATE`,
      params
    );
    if (rows.length === 0) throw notFound('Pengaduan tidak ditemukan.');
    const current = rows[0];

    if (current.status !== 'review') {
      throw conflict(
        'Pengaduan yang sudah diproses tidak dapat diubah. Hubungi admin Sarpras bila ada koreksi.'
      );
    }

    const sets = [];
    const values = [];
    const set = (column, value) => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };

    if (input.title !== undefined) set('title', input.title);
    if (input.description !== undefined) set('description', input.description);
    if (input.photoUrl !== undefined) set('photo_url', input.photoUrl || null);
    if (input.category !== undefined) set('category_id', await resolveCategory(client, input.category));

    if (input.building !== undefined || input.locationId !== undefined) {
      const { locationId, locationDetail } = await resolveLocation(client, input);
      set('location_id', locationId);
      set('location_detail', locationDetail);
    }

    if (input.priority !== undefined) {
      set('priority', input.priority);
      set('urgent', input.priority === 'Tinggi');
      // SLA mengikuti prioritas baru (selalu dihitung dari waktu laporan dibuat).
      set(
        'sla_due_at',
        new Date(new Date(current.created_at).getTime() + SLA_HOURS[input.priority] * 3600 * 1000)
      );
    }

    await client.query(
      `UPDATE tickets SET ${sets.join(', ')} WHERE id = $${values.length + 1}`,
      [...values, current.id]
    );

    await addHistory(client, current.id, {
      label: 'Pengaduan diperbarui',
      actor: user.name,
      status: 'review',
      note: 'Mahasiswa memperbarui detail laporan sebelum diverifikasi.',
    });

    return current.id;
  });

  return getTicketDetail({ by: 'id', value: ticketId }, user);
}

/** Admin mengubah status tiket (+ opsional disposisi tim/teknisi/prioritas) dan mencatat ke ticket_history. */
async function updateTicketStatus(ref, user, input) {
  const ticketId = await withTransaction(async (client) => {
    const { where, params } = accessFilter(ref, user);
    const { rows } = await client.query(
      `SELECT id, status, progress, team_id, priority FROM tickets WHERE ${where} FOR UPDATE`,
      params
    );
    if (rows.length === 0) throw notFound('Pengaduan tidak ditemukan.');
    const current = rows[0];
    const next = input.status;

    const hasDispatchFields =
      input.teamId !== undefined ||
      input.assignee !== undefined ||
      input.supporters !== undefined ||
      input.instructionTo !== undefined ||
      input.priority !== undefined ||
      input.instruction !== undefined;

    if (next === current.status && input.progress === undefined && !input.note && !hasDispatchFields) {
      throw conflict(`Pengaduan sudah berstatus '${next}'.`);
    }

    // Validasi referensi tim & teknisi bila dikirim saat disposisi
    let teamRow = null;
    if (input.teamId !== undefined) {
      const { rows: tRows } = await client.query('SELECT id, name FROM teams WHERE id = $1', [
        input.teamId,
      ]);
      if (tRows.length === 0) {
        throw new ApiError(422, 'Data yang dikirim tidak valid.', {
          teamId: `Tim '${input.teamId}' tidak ditemukan.`,
        });
      }
      teamRow = tRows[0];
    }

    let assigneeTech = null;
    if (input.assignee !== undefined) {
      const { rows: techRows } = await client.query(
        'SELECT id, name, title, team_id FROM technicians WHERE id = $1 AND archived = false',
        [input.assignee]
      );
      if (techRows.length === 0) {
        throw new ApiError(422, 'Data yang dikirim tidak valid.', {
          assignee: `Teknisi '${input.assignee}' tidak ditemukan.`,
        });
      }
      assigneeTech = techRows[0];
      if (!teamRow && assigneeTech.team_id) {
        const { rows: tRows } = await client.query('SELECT id, name FROM teams WHERE id = $1', [
          assigneeTech.team_id,
        ]);
        teamRow = tRows[0] || null;
      }
    }

    const supporterIds = Array.isArray(input.supporters)
      ? input.supporters.filter((id) => !assigneeTech || id !== assigneeTech.id)
      : null;

    if (supporterIds && supporterIds.length > 0) {
      const { rows: supRows } = await client.query(
        'SELECT id FROM technicians WHERE id = ANY($1::text[]) AND archived = false',
        [supporterIds]
      );
      if (supRows.length !== supporterIds.length) {
        throw new ApiError(422, 'Data yang dikirim tidak valid.', {
          supporters: 'Salah satu teknisi pendukung tidak ditemukan.',
        });
      }
    }

    // Aturan progress mengikuti perilaku dashboard admin di frontend.
    let progress;
    if (next === 'done') progress = 100;
    else if (input.progress !== undefined) progress = input.progress;
    else if (next === 'progress' || next === 'waiting') {
      progress = Math.min(95, Math.max(35, Number(current.progress) || 35));
    } else progress = 0; // review / rejected

    const reopened = current.status === 'done' && next !== 'done';

    const sets = [
      'status = $2',
      'progress = $3',
      "completed_at = CASE WHEN $2 = 'done' THEN now() ELSE NULL END",
    ];
    const updateParams = [current.id, next, progress];

    if (teamRow) {
      updateParams.push(teamRow.id);
      sets.push(`team_id = $${updateParams.length}`);
    }

    if (input.priority !== undefined) {
      updateParams.push(input.priority);
      sets.push(`priority = $${updateParams.length}`);
      updateParams.push(input.priority === 'Tinggi');
      sets.push(`urgent = $${updateParams.length}`);
      updateParams.push(new Date(Date.now() + SLA_HOURS[input.priority] * 3600 * 1000));
      sets.push(`sla_due_at = $${updateParams.length}`);
    }

    await client.query(`UPDATE tickets SET ${sets.join(', ')} WHERE id = $1`, updateParams);

    if (assigneeTech) {
      const assignmentStatus = next === 'done' ? 'done' : 'active';
      if (supporterIds !== null) {
        await client.query(
          `UPDATE ticket_assignments
              SET status = 'replaced'
            WHERE ticket_id = $1 AND status = 'active'`,
          [current.id]
        );
      } else {
        await client.query(
          `UPDATE ticket_assignments
              SET status = 'replaced'
            WHERE ticket_id = $1 AND role = 'PIC' AND status = 'active'`,
          [current.id]
        );
        await client.query(
          `UPDATE ticket_assignments
              SET status = 'removed'
            WHERE ticket_id = $1 AND technician_id = $2 AND role <> 'PIC' AND status = 'active'`,
          [current.id, assigneeTech.id]
        );
      }

      await client.query(
        `INSERT INTO ticket_assignments (ticket_id, technician_id, role, status, assigned_by)
         VALUES ($1, $2, 'PIC', $3, $4)`,
        [current.id, assigneeTech.id, assignmentStatus, user.id]
      );

      if (supporterIds && supporterIds.length > 0) {
        for (const supId of supporterIds) {
          await client.query(
            `INSERT INTO ticket_assignments (ticket_id, technician_id, role, status, assigned_by)
             VALUES ($1, $2, 'Pendukung', $3, $4)`,
            [current.id, supId, assignmentStatus, user.id]
          );
        }
      }
    } else if (next === 'done') {
      await client.query(
        `UPDATE ticket_assignments SET status = 'done'
          WHERE ticket_id = $1 AND status = 'active'`,
        [current.id]
      );
    } else if (next === 'rejected') {
      await client.query(
        `UPDATE ticket_assignments SET status = 'removed'
          WHERE ticket_id = $1 AND status = 'active'`,
        [current.id]
      );
    } else if (reopened) {
      // Buka kembali: aktifkan lagi penugasan yang tadinya ditutup 'done'
      // (satu PIC terbaru + pendukung, tanpa melanggar indeks unik penugasan aktif).
      await client.query(
        `WITH latest AS (
           SELECT DISTINCT ON (ta.technician_id) ta.id, ta.role, ta.assigned_at
             FROM ticket_assignments ta
            WHERE ta.ticket_id = $1
              AND ta.status = 'done'
              AND NOT EXISTS (
                SELECT 1 FROM ticket_assignments x
                 WHERE x.ticket_id = ta.ticket_id
                   AND x.technician_id = ta.technician_id
                   AND x.status = 'active')
            ORDER BY ta.technician_id, ta.assigned_at DESC, ta.id DESC
         ),
         pic AS (
           SELECT id FROM latest
            WHERE role = 'PIC'
              AND NOT EXISTS (
                SELECT 1 FROM ticket_assignments x
                 WHERE x.ticket_id = $1 AND x.role = 'PIC' AND x.status = 'active')
            ORDER BY assigned_at DESC
            LIMIT 1
         )
         UPDATE ticket_assignments SET status = 'active'
          WHERE id IN (SELECT id FROM latest WHERE role = 'Pendukung'
                       UNION SELECT id FROM pic)`,
        [current.id]
      );
    }

    // Supporters tanpa `assignee`: hanya daftar pendukung yang diperbarui,
    // PIC aktif tidak disentuh dan tidak ada baris PIC baru.
    let supportNote = null;
    if (supporterIds !== null && !assigneeTech) {
      const { rows: picRows } = await client.query(
        `SELECT technician_id
           FROM ticket_assignments
          WHERE ticket_id = $1 AND role = 'PIC' AND status IN ('active', 'done')
          ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, assigned_at DESC, id DESC
          LIMIT 1`,
        [current.id]
      );
      const activePic = picRows[0] || null;
      const desired = supporterIds.filter(
        (id) => !activePic || id !== activePic.technician_id
      );

      if (!activePic && desired.length > 0) {
        throw conflict('Tetapkan PIC lebih dulu lewat disposisi');
      }

      const { rows: existingRows } = await client.query(
        `SELECT technician_id
           FROM ticket_assignments
          WHERE ticket_id = $1 AND role = 'Pendukung' AND status IN ('active', 'done')`,
        [current.id]
      );
      const existing = new Set(existingRows.map((row) => row.technician_id));
      const wanted = new Set(desired);
      const removedIds = [...existing].filter((id) => !wanted.has(id));
      const addedIds = desired.filter((id) => !existing.has(id));

      if (removedIds.length > 0) {
        await client.query(
          `UPDATE ticket_assignments
              SET status = 'removed'
            WHERE ticket_id = $1 AND role = 'Pendukung'
              AND status IN ('active', 'done')
              AND technician_id = ANY($2::text[])`,
          [current.id, removedIds]
        );
      }

      if (addedIds.length > 0) {
        const assignmentStatus = next === 'done' ? 'done' : 'active';
        for (const supId of addedIds) {
          await client.query(
            `INSERT INTO ticket_assignments (ticket_id, technician_id, role, status, assigned_by)
             VALUES ($1, $2, 'Pendukung', $3, $4)`,
            [current.id, supId, assignmentStatus, user.id]
          );
        }
      }

      const changedIds = [...addedIds, ...removedIds];
      const titleById = new Map();
      if (changedIds.length > 0) {
        const { rows: techRows } = await client.query(
          'SELECT id, name, title FROM technicians WHERE id = ANY($1::text[])',
          [changedIds]
        );
        for (const tech of techRows) {
          titleById.set(tech.id, tech.title || tech.name);
        }
      }
      const parts = [];
      if (addedIds.length > 0) {
        parts.push(
          `Pendukung ditambahkan: ${addedIds.map((id) => titleById.get(id) || id).join(', ')}`
        );
      }
      if (removedIds.length > 0) {
        parts.push(`dilepas: ${removedIds.map((id) => titleById.get(id) || id).join(', ')}`);
      }
      supportNote = parts.length ? `${parts.join('; ')}.` : 'Tidak ada perubahan pendukung.';
    }

    const assigneeTitle = assigneeTech ? assigneeTech.title || assigneeTech.name : null;
    const historyLabel =
      assigneeTech && teamRow
        ? `Disposisi ke ${teamRow.name} — ${assigneeTitle}`
        : assigneeTech
          ? `PIC diganti ke ${assigneeTitle}`
          : reopened
            ? 'Tiket dibuka kembali'
            : supporterIds !== null
              ? 'Tim penanganan diperbarui'
              : STATUS_LABEL[next];

    await addHistory(client, current.id, {
      label: historyLabel,
      actor: user.name,
      status: next,
      note: input.note || supportNote || `Status tiket diubah menjadi ${STATUS_SHORT[next]}.`,
    });

    // Penerima instruksi: `instructionTo` (PIC/pendukung aktif) bila dikirim,
    // selain itu tetap mengikuti PIC pada payload disposisi lama.
    let instructionTarget = assigneeTech;
    if (input.instruction && input.instructionTo !== undefined) {
      const { rows: targetRows } = await client.query(
        `SELECT t.id, t.name, t.title
           FROM ticket_assignments ta
           JOIN technicians t ON t.id = ta.technician_id
          WHERE ta.ticket_id = $1 AND ta.technician_id = $2
            AND ta.status IN ('active', 'done')
            AND t.archived = false
          ORDER BY CASE ta.status WHEN 'active' THEN 0 ELSE 1 END
          LIMIT 1`,
        [current.id, input.instructionTo]
      );
      if (targetRows.length === 0) {
        throw new ApiError(422, 'Data yang dikirim tidak valid.', {
          instructionTo:
            'Instruksi hanya dapat dikirim ke PIC atau pendukung aktif tiket ini.',
        });
      }
      instructionTarget = targetRows[0];
    }

    if (input.instruction) {
      await client.query(
        `INSERT INTO ticket_comments
           (ticket_id, kind, author_id, author_name, target_technician_id, body, is_public)
         VALUES ($1, 'instruction', $2, $3, $4, $5, false)`,
        [
          current.id,
          user.id,
          user.name,
          instructionTarget ? instructionTarget.id : null,
          input.instruction,
        ]
      );
      await addHistory(client, current.id, {
        label: `Instruksi terarah ke ${
          instructionTarget ? instructionTarget.title || instructionTarget.name : 'Teknisi'
        }`,
        actor: user.name,
        status: next,
        note: input.instruction,
      });
    }

    return current.id;
  });

  return getTicketDetail({ by: 'id', value: ticketId }, user);
}

/* ------------------------------------------------------------------- DELETE */

/**
 * Hapus oleh mahasiswa. Lihat aturan di header file.
 * @returns {{id:number, ticketCode:string, mode:'cancelled'|'archived'}}
 */
async function deleteOwnTicket(ref, user) {
  const { result, photoFiles } = await withTransaction(async (client) => {
    const { where, params } = accessFilter(ref, user);
    const { rows } = await client.query(
      `SELECT id, ticket_code, status FROM tickets WHERE ${where} FOR UPDATE`,
      params
    );
    if (rows.length === 0) throw notFound('Pengaduan tidak ditemukan.');
    const ticket = rows[0];

    if (ticket.status === 'review') {
      const photos = await client.query(
        'SELECT file_name FROM ticket_photos WHERE ticket_id = $1',
        [ticket.id]
      );
      await client.query('DELETE FROM tickets WHERE id = $1', [ticket.id]);
      return {
        result: { id: ticket.id, ticketCode: ticket.ticket_code, mode: 'cancelled' },
        photoFiles: photos.rows.map((p) => p.file_name),
      };
    }

    if (ticket.status === 'done' || ticket.status === 'rejected') {
      await client.query('UPDATE tickets SET deleted_by_student_at = now() WHERE id = $1', [
        ticket.id,
      ]);
      return {
        result: { id: ticket.id, ticketCode: ticket.ticket_code, mode: 'archived' },
        photoFiles: [],
      };
    }

    throw conflict(
      'Pengaduan yang sedang ditangani tidak dapat dihapus. Tunggu hingga selesai atau ditolak.'
    );
  });

  // Baris ticket_photos ikut terhapus lewat ON DELETE CASCADE; berkas fisik
  // dibersihkan setelah transaksi sukses agar tidak ada unggahan yatim.
  await removeUploadFiles(photoFiles);
  return result;
}

module.exports = {
  listTickets,
  getTicketDetail,
  createTicket,
  updateOwnTicket,
  updateTicketStatus,
  deleteOwnTicket,
  accessFilter,
};
