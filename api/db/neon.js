import pg from "pg";

const { Pool } = pg;

const connectionString = process.env.DB_CONNECTION || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("Falta DB_CONNECTION o DATABASE_URL en variables de entorno");
}

export const pool = new Pool({
  connectionString,
  ssl: connectionString.includes("neon.tech") ? { rejectUnauthorized: false } : false,
});

export async function query(text, params = []) {
  return pool.query(text, params);
}

export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

