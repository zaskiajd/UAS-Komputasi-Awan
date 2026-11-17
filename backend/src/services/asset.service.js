/* ==========================================================================
   services/asset.service.js — Logika bisnis & query inventaris aset
   --------------------------------------------------------------------------
   - Semua endpoint aset hanya untuk admin (ditegakkan di route).
   - Bentuk objek keluaran mengikuti objek aset di frontend
     (lihat docs/db-contract.md §5.7).
   - ID aset dibuat backend di dalam transaksi yang sama dengan INSERT,
     dilindungi pg_advisory_xact_lock per prefix agar aman dari pembuatan
     paralel.
   - Lokasi memakai pola find-or-create berdasarkan (building, room).
   ========================================================================== */

const { query, withTransaction } = require('../config/db');
const { ApiError, notFound, conflict } = require('../utils/errors');
const { DEFAULT_NOTE } = require('../utils/validate-asset');

const PREFIX_BY_CATEGORY = {
  ac: 'AC',
  projector: 'PRJ',
  network: 'WIFI',
  sanitation: 'SAN',
  furniture: 'MJR',
  lift: 'LFT',
  electrical: 'LMP',
};

// Label sama dengan ASSET_CONDITION di js/data/assets.js (dipakai teks riwayat).
const CONDITION_LABEL = {
  good: 'Baik',
  service: 'Perlu Servis',
  disrupted: 'Gangguan',
  broken: 'Rusak',
};

const ASSET_COLUMNS = `
  a.id, a.name, a.condition, a.team_id, a.last_service_at, a.note,
  a.archived, a.archived_at, a.created_at, a.category_id,
  c.code AS category_code, c.label AS category_label, c.icon AS category_icon,
  l.id AS location_id, l.zone, l.building, l.room,
  t.name AS team_name`;

const ASSET_FROM = `
  FROM assets a
  JOIN categories c ON c.id = a.category_id
  JOIN locations  l ON l.id = a.location_id
  LEFT JOIN teams t ON t.id = a.team_id`;

/* ------------------------------------------------------------------ mapping */

/** Gabungan lokasi yang selalu bisa dikirim balik ke server tanpa duplikasi baris. */
function formatLocation(building, room) {
  const detail = (room || '').trim();
  return detail ? `${building} • ${detail}` : building;
}

function mapAsset(row) {
  return {
    id: row.id,
    name: row.name,
    cat: row.category_code,
    category: {
      code: row.category_code,
      label: row.category_label,
      icon: row.category_icon,
    },
    location: formatLocation(row.building, row.room),
    zone: row.zone,
    locationId: row.location_id,
    condition: row.condition,
    teamId: row.team_id,
    lastServiceAt: row.last_service_at,
    note: row.note,
    archived: row.archived,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    history: [],
  };
}

async function attachHistory(client, assets) {
  if (assets.length === 0) return assets;
  const { rows } = await client.query(
    `SELECT id, asset_id, at, label, actor, note
       FROM asset_history
      WHERE asset_id = ANY($1::text[])
      ORDER BY at DESC, id DESC`,
    [assets.map((asset) => asset.id)]
  );

  const byAsset = new Map();
  for (const row of rows) {
    if (!byAsset.has(row.asset_id)) byAsset.set(row.asset_id, []);
    byAsset.get(row.asset_id).push({
      id: Number(row.id),
      at: row.at,
      label: row.label,
      actor: row.actor,
      note: row.note,
    });
  }

  for (const asset of assets) asset.history = byAsset.get(asset.id) || [];
  return assets;
}

const addHistory = (client, assetId, { label, actor, note }) =>
  client.query(
    `INSERT INTO asset_history (asset_id, label, actor, note)
     VALUES ($1, $2, $3, $4)`,
    [assetId, label, actor, note ?? null]
  );

/* ------------------------------------------------------------------ helpers */

async function resolveCategory(client, code) {
  const { rows } = await client.query(
    'SELECT id, code, label, icon FROM categories WHERE code = $1',
    [code]
  );
  if (rows.length === 0) {
    throw new ApiError(422, 'Data yang dikirim tidak valid.', {
      category: `Kategori '${code}' tidak ditemukan.`,
    });
  }
  return rows[0];
}

async function resolveTeam(client, teamId) {
  const { rows } = await client.query('SELECT id, name FROM teams WHERE id = $1', [teamId]);
  if (rows.length === 0) {
    throw new ApiError(422, 'Data yang dikirim tidak valid.', {
      teamId: `Tim '${teamId}' tidak ditemukan.`,
    });
  }
  return rows[0];
}

/**
 * Pisahkan teks lokasi pada "•" lalu find-or-create baris locations.
 * Zona lama tidak ditimpa; zona yang tersimpan dikembalikan.
 */
async function findOrCreateLocation(client, locationText, zone) {
  const { rows } = await client.query(
    `INSERT INTO locations (zone, building, room)
     VALUES (
       $1,
       btrim(split_part($2, '•', 1)),
       NULLIF(btrim(split_part($2, '•', 2)), '')
     )
     ON CONFLICT (building, (COALESCE(room, ''))) DO UPDATE
       SET zone = locations.zone
     RETURNING id, zone, building, room`,
    [zone, locationText]
  );
  return rows[0];
}

/** Nomor aset berikutnya untuk prefix, aman dari pembuatan paralel. */
async function nextAssetId(client, prefix) {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`assets:${prefix}`]);
  // Pindai semua aset berprefix sama, bukan hanya kategori saat ini: aset bisa
  // dipindah kategori sehingga ID lamanya tetap harus dihitung.
  const { rows } = await client.query(
    `SELECT COALESCE(MAX(substring(a.id FROM '^AST-' || $1 || '-([0-9]+)$')::int), 0) + 1
              AS next_num
       FROM assets a`,
    [prefix]
  );
  return `AST-${prefix}-${String(rows[0].next_num).padStart(4, '0')}`;
}

/* --------------------------------------------------------------------- READ */

async function listAssets(filters = {}) {
  const params = [];
  const where = [];
  const add = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (filters.status === 'archived') where.push('a.archived = true');
  else if (filters.status !== 'all') where.push('a.archived = false');

  if (filters.condition) where.push(`a.condition = ${add(filters.condition)}`);
  if (filters.category) where.push(`c.code = ${add(filters.category)}`);

  if (filters.q) {
    const like = `%${filters.q.replace(/[\\%_]/g, '\\$&')}%`;
    const p = add(like);
    where.push(
      `(a.name ILIKE ${p} OR a.id ILIKE ${p} OR l.building ILIKE ${p}` +
        ` OR l.room ILIKE ${p} OR concat_ws(' • ', l.building, l.room) ILIKE ${p})`
    );
  }

  const limit = add(filters.limit);
  const offset = add(filters.offset);

  const { rows } = await query(
    `SELECT ${ASSET_COLUMNS}, COUNT(*) OVER() AS total_count
       ${ASSET_FROM}
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY a.archived ASC, a.id ASC
      LIMIT ${limit} OFFSET ${offset}`,
    params
  );

  const items = await attachHistory({ query }, rows.map(mapAsset));
  return {
    items,
    total: rows.length ? Number(rows[0].total_count) : 0,
  };
}

async function getAssetDetail(assetId) {
  const { rows } = await query(`SELECT ${ASSET_COLUMNS} ${ASSET_FROM} WHERE a.id = $1`, [assetId]);
  if (rows.length === 0) throw notFound('Aset tidak ditemukan.');
  const [asset] = await attachHistory({ query }, [mapAsset(rows[0])]);
  return asset;
}

/* ------------------------------------------------------------------- CREATE */

async function createAsset(user, input) {
  const assetId = await withTransaction(async (client) => {
    const category = await resolveCategory(client, input.category);
    const prefix = PREFIX_BY_CATEGORY[category.code];
    if (!prefix) {
      throw new ApiError(422, 'Data yang dikirim tidak valid.', {
        category: `Kategori '${category.code}' belum mendukung inventaris aset.`,
      });
    }

    const team = await resolveTeam(client, input.teamId);
    const location = await findOrCreateLocation(client, input.location, input.zone);
    const id = await nextAssetId(client, prefix);

    await client.query(
      `INSERT INTO assets
         (id, name, location_id, category_id, condition, team_id, note, archived)
       VALUES ($1, $2, $3, $4, $5, $6, $7, false)`,
      [
        id,
        input.name,
        location.id,
        category.id,
        input.condition || 'good',
        team.id,
        input.note || DEFAULT_NOTE,
      ]
    );

    await addHistory(client, id, {
      label: 'Aset terdaftar',
      actor: user.name,
      note: 'Aset baru ditambahkan ke inventaris Sarpras.',
    });

    return id;
  });

  return getAssetDetail(assetId);
}

/* ------------------------------------------------------------------- UPDATE */

async function updateAsset(assetId, user, input) {
  await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT ${ASSET_COLUMNS} ${ASSET_FROM} WHERE a.id = $1 FOR UPDATE OF a`,
      [assetId]
    );
    if (rows.length === 0) throw notFound('Aset tidak ditemukan.');

    const current = rows[0];
    if (current.archived) {
      throw conflict('Aset yang diarsipkan tidak dapat diubah. Pulihkan aset terlebih dahulu.');
    }

    const category =
      input.category !== undefined
        ? await resolveCategory(client, input.category)
        : { id: null, code: current.category_code, label: current.category_label };
    const team =
      input.teamId !== undefined
        ? await resolveTeam(client, input.teamId)
        : { id: current.team_id, name: current.team_name };

    const currentLocation = formatLocation(current.building, current.room);
    let location = {
      id: current.location_id,
      zone: current.zone,
      building: current.building,
      room: current.room,
    };
    if (input.location !== undefined || input.zone !== undefined) {
      location = await findOrCreateLocation(
        client,
        input.location !== undefined ? input.location : currentLocation,
        input.zone !== undefined ? input.zone : current.zone
      );
    }

    const next = {
      name: input.name !== undefined ? input.name : current.name,
      categoryId: input.category !== undefined ? category.id : current.category_id,
      cat: category.code,
      categoryLabel: category.label,
      location: formatLocation(location.building, location.room),
      zone: location.zone,
      teamId: team.id || null,
      teamName: team.name || null,
      condition: input.condition !== undefined ? input.condition : current.condition,
      note: input.note !== undefined ? input.note : current.note,
    };

    const changes = [];
    if (current.name !== next.name) changes.push(`nama: ${current.name} → ${next.name}`);
    if (current.category_code !== next.cat) {
      changes.push(`kategori: ${current.category_label} → ${next.categoryLabel}`);
    }
    if (currentLocation !== next.location) {
      changes.push(`lokasi: ${currentLocation} → ${next.location}`);
    }
    if (current.zone !== next.zone) changes.push(`zona: ${current.zone} → ${next.zone}`);
    if ((current.team_id || null) !== next.teamId) {
      changes.push(
        `tim: ${current.team_name || current.team_id || '-'} → ${next.teamName || '-'}`
      );
    }
    if (current.condition !== next.condition) {
      changes.push(
        `kondisi: ${CONDITION_LABEL[current.condition] || current.condition} → ` +
          `${CONDITION_LABEL[next.condition] || next.condition}`
      );
    }

    await client.query(
      `UPDATE assets
          SET name = $2,
              location_id = $3,
              category_id = $4,
              condition = $5,
              team_id = $6,
              note = $7
        WHERE id = $1`,
      [
        assetId,
        next.name,
        location.id,
        next.categoryId,
        next.condition,
        next.teamId,
        next.note || DEFAULT_NOTE,
      ]
    );

    await addHistory(client, assetId, {
      label: 'Data aset diperbarui',
      actor: user.name,
      note: changes.length
        ? changes.join('; ')
        : 'Detail aset diperbarui tanpa perubahan kondisi.',
    });
  });

  return getAssetDetail(assetId);
}

/* ------------------------------------------------------------------ ACTIONS */

async function markServiced(assetId, user) {
  await withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT id, archived FROM assets WHERE id = $1 FOR UPDATE',
      [assetId]
    );
    if (rows.length === 0) throw notFound('Aset tidak ditemukan.');
    if (rows[0].archived) {
      throw conflict('Aset yang diarsipkan tidak dapat ditandai selesai servis.');
    }

    await client.query(
      `UPDATE assets
          SET condition = 'good',
              last_service_at = now(),
              note = 'Servis selesai dan aset dinyatakan kembali dalam kondisi baik.'
        WHERE id = $1`,
      [assetId]
    );

    await addHistory(client, assetId, {
      label: 'Servis selesai',
      actor: user.name,
      note: 'Kondisi aset divalidasi dan dikembalikan ke status baik.',
    });
  });

  return getAssetDetail(assetId);
}

async function archiveAsset(assetId, user) {
  await withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT id, archived FROM assets WHERE id = $1 FOR UPDATE',
      [assetId]
    );
    if (rows.length === 0) throw notFound('Aset tidak ditemukan.');
    if (rows[0].archived) throw conflict('Aset sudah diarsipkan.');

    await client.query(
      `UPDATE assets
          SET archived = true,
              archived_at = now()
        WHERE id = $1`,
      [assetId]
    );

    await addHistory(client, assetId, {
      label: 'Aset diarsipkan',
      actor: user.name,
      note: 'Aset dikeluarkan dari daftar aktif tanpa menghapus riwayat.',
    });
  });

  return getAssetDetail(assetId);
}

async function restoreAsset(assetId, user) {
  await withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT id, archived FROM assets WHERE id = $1 FOR UPDATE',
      [assetId]
    );
    if (rows.length === 0) throw notFound('Aset tidak ditemukan.');
    if (!rows[0].archived) throw conflict('Aset tidak sedang diarsipkan.');

    await client.query(
      `UPDATE assets
          SET archived = false,
              archived_at = NULL
        WHERE id = $1`,
      [assetId]
    );

    await addHistory(client, assetId, {
      label: 'Aset dipulihkan',
      actor: user.name,
      note: 'Aset dikembalikan ke daftar inventaris aktif.',
    });
  });

  return getAssetDetail(assetId);
}

/* ------------------------------------------------------------------- DELETE */

async function deleteAssetPermanently(assetId) {
  try {
    return await withTransaction(async (client) => {
      const { rows } = await client.query(
        'SELECT id, archived, last_service_at FROM assets WHERE id = $1 FOR UPDATE',
        [assetId]
      );
      if (rows.length === 0) throw notFound('Aset tidak ditemukan.');
      const asset = rows[0];

      if (!asset.archived) {
        throw conflict('Aset harus diarsipkan sebelum dapat dihapus permanen.');
      }
      if (asset.last_service_at) {
        throw conflict('Aset memiliki riwayat servis dan tidak dapat dihapus permanen.');
      }

      const linked = await client.query(
        'SELECT 1 FROM tickets WHERE asset_id = $1 LIMIT 1',
        [assetId]
      );
      if (linked.rows.length > 0) {
        throw conflict('Aset masih memiliki tiket terkait dan tidak dapat dihapus permanen.');
      }

      await client.query('DELETE FROM assets WHERE id = $1', [assetId]);
      return { id: assetId };
    });
  } catch (error) {
    // RESTRICT / FK violation dari PostgreSQL → pesan yang sama dan jelas.
    if (error.code === '23001' || error.code === '23503') {
      throw conflict('Aset masih memiliki tiket terkait dan tidak dapat dihapus permanen.');
    }
    throw error;
  }
}

module.exports = {
  listAssets,
  getAssetDetail,
  createAsset,
  updateAsset,
  markServiced,
  archiveAsset,
  restoreAsset,
  deleteAssetPermanently,
};
