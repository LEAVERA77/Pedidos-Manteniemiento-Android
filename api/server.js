/**
 * API Pedidos MG
 * - GET /api/app-version: JSON con versionCode, versionName, apkUrl para actualizaciones Android
 * - Conexión a Neon (PostgreSQL)
 */

import 'dotenv/config';
import express from 'express';
import pg from 'pg';

const { Pool } = pg;
const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('neon.tech') ? { rejectUnauthorized: false } : false,
});

app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.get('/api/app-version', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT version_code, version_name, apk_url, release_notes, force_update
      FROM app_version
      ORDER BY version_code DESC
      LIMIT 1
    `);
    if (!r.rows || r.rows.length === 0) {
      return res.status(404).json({ error: 'No hay versión configurada' });
    }
    const row = r.rows[0];
    res.json({
      versionCode: row.version_code,
      versionName: row.version_name || `v${row.version_code}`,
      apkUrl: row.apk_url || '',
      releaseNotes: row.release_notes || '',
      forceUpdate: !!row.force_update,
    });
  } catch (err) {
    console.error('Error app-version:', err);
    res.status(500).json({ error: 'Error al consultar versión' });
  }
});

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`API Pedidos MG en http://localhost:${PORT}`);
});
