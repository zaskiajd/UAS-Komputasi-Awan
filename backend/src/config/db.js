/* ==========================================================================
   src/config/db.js — Koneksi PostgreSQL (node-postgres)
   --------------------------------------------------------------------------
   Pemakaian:
     const { pool, query } = require('./src/config/db');
     const { rows } = await query('SELECT ...', [param]);

   DB_SSL hanya diaktifkan bila env DB_SSL bernilai "true" (case-insensitive).
   ========================================================================== */

const path = require('path');
const { Pool } = require('pg');

// Muat backend/.env tanpa bergantung pada cwd proses Node.
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL belum diset. Salin backend/.env.example menjadi backend/.env ' +
      'lalu isi connection string PostgreSQL.'
  );
}

const useSsl = String(process.env.DB_SSL || '').toLowerCase() === 'true';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (error) => {
  // Jangan biarkan idle client yang error mematikan proses tanpa jejak.
  console.error('[db] idle client error:', error.message);
});

/**
 * Jalankan query memakai pool.
 * @param {string} text SQL query
 * @param {any[]} [params] parameter query
 * @returns {Promise<import('pg').QueryResult>}
 */
const query = (text, params) => pool.query(text, params);

/**
 * Helper transaksi untuk operasi multi-statement (mis. buat tiket + history).
 * @template T
 * @param {(client: import('pg').PoolClient) => Promise<T>} callback
 * @returns {Promise<T>}
 */
async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction };
