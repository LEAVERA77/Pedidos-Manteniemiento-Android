import dotenv from 'dotenv';
import { readFileSync } from 'fs';

// Load environment variables first
dotenv.config();

console.log('DB_CONNECTION:', process.env.DB_CONNECTION ? 'Loaded' : 'Not loaded');

// Now import after env is loaded
const { query } = await import('./db/neon.js');

async function runMigration() {
  try {
    console.log('Checking database connection...');

    // Check if table exists
    const tables = await query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
    console.log('Tables in public schema:', tables.rows.map(r => r.table_name));

    const hasSociosCatalogo = tables.rows.some(r => r.table_name === 'socios_catalogo');

    if (!hasSociosCatalogo) {
      console.log('Table socios_catalogo does not exist. Creating it...');

      // First create the table
      const createTableSql = `
        CREATE TABLE IF NOT EXISTS socios_catalogo (
            id                  SERIAL PRIMARY KEY,
            nis_medidor         TEXT NOT NULL,
            nombre              TEXT,
            calle               TEXT,
            numero              TEXT,
            telefono            TEXT,
            distribuidor_codigo TEXT,
            activo              BOOLEAN NOT NULL DEFAULT TRUE,
            creado_en           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (nis_medidor)
        );
      `;

      try {
        await query(createTableSql);
        console.log('✅ Table socios_catalogo created');
      } catch (err) {
        console.log('Warning creating table:', err.message);
      }

      // Then run the rest of the setup
      const setupSql = readFileSync('../docs/NEON_nexxo_operativo_enre.sql', 'utf8');

      // Split and execute the rest
      const setupStatements = setupSql.split(';').map(s => s.trim()).filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('COMMENT') && !s.includes('CREATE TABLE'));

      console.log('Additional setup statements to execute:', setupStatements.length);

      for (const statement of setupStatements) {
        if (statement) {
          try {
            console.log('Executing setup:', statement.substring(0, 50) + '...');
            await query(statement);
          } catch (err) {
            console.log('Warning on setup statement:', err.message);
            // Continue
          }
        }
      }

      console.log('✅ Table setup completed');
    } else {
      console.log('Table socios_catalogo already exists');
    }

    // Now check for the column
    const columns = await query("SELECT column_name FROM information_schema.columns WHERE table_name = 'socios_catalogo' AND column_name = 'ubicacion_manual'");
    if (columns.rows.length > 0) {
      console.log('✅ Column ubicacion_manual already exists. Migration already applied.');
      return;
    }

    console.log('Running migration: add_ubicacion_manual_to_socios_catalogo.sql');

    const sql = readFileSync('./db/migrations/add_ubicacion_manual_to_socios_catalogo.sql', 'utf8');

    // Split by semicolon and execute each statement
    const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);

    for (const statement of statements) {
      if (statement) {
        console.log('Executing:', statement.substring(0, 50) + '...');
        await query(statement);
      }
    }

    console.log('✅ Migration completed successfully');

    // Run cleanup SQL
    console.log('Running cleanup: cleanup_vultr_references.sql');

    const cleanupSql = readFileSync('../scripts/migration/cleanup_vultr_references.sql', 'utf8');

    // Split by semicolon and execute SELECT statements
    const cleanupStatements = cleanupSql.split(';').map(s => s.trim()).filter(s => s.length > 0 && s.toUpperCase().startsWith('SELECT'));

    for (const statement of cleanupStatements) {
      if (statement) {
        try {
          console.log('Executing cleanup query:', statement.substring(0, 50) + '...');
          const result = await query(statement);
          console.log(`Result: ${result.rows.length} rows`);
          if (result.rows.length > 0) {
            console.log('Sample:', JSON.stringify(result.rows[0], null, 2));
          }
        } catch (err) {
          console.log('Warning on cleanup query:', err.message);
        }
      }
    }

    console.log('✅ Cleanup completed');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
