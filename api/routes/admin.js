/**
 * Rutas administrativas para mantenimiento del sistema
 * Incluye migración de base de datos y verificación de esquema
 * 
 * made by leavera77
 */

import express from "express";
import { query } from "../db/neon.js";
import { adminOnly } from "../middleware/auth.js";

const router = express.Router();

/**
 * GET /api/admin/db/schema/socios_catalogo
 * Verifica el esquema de la tabla socios_catalogo
 */
router.get("/db/schema/socios_catalogo", adminOnly, async (req, res) => {
  try {
    const result = await query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'socios_catalogo'
      ORDER BY ordinal_position
    `);
    
    const columns = result.rows || [];
    const hasLatitud = columns.some(c => c.column_name === 'latitud');
    const hasLongitud = columns.some(c => c.column_name === 'longitud');
    const hasUbicacionManual = columns.some(c => c.column_name === 'ubicacion_manual');
    
    res.json({
      status: "ok",
      table: "socios_catalogo",
      columns: columns.map(c => ({
        name: c.column_name,
        type: c.data_type,
        nullable: c.is_nullable === 'YES',
        default: c.column_default
      })),
      migration_status: {
        latitud: hasLatitud ? "✅ existe" : "❌ falta",
        longitud: hasLongitud ? "✅ existe" : "❌ falta",
        ubicacion_manual: hasUbicacionManual ? "✅ existe" : "❌ falta",
        needs_migration: !hasLatitud || !hasLongitud || !hasUbicacionManual
      }
    });
  } catch (err) {
    console.error("[admin] Error al verificar esquema:", err);
    res.status(500).json({
      error: "Error al verificar esquema",
      details: err?.message || String(err)
    });
  }
});

/**
 * POST /api/admin/db/migrate/socios_catalogo
 * Ejecuta la migración para agregar columnas de coordenadas
 */
router.post("/db/migrate/socios_catalogo", adminOnly, async (req, res) => {
  const log = [];
  
  try {
    log.push("🔧 Iniciando migración de socios_catalogo...");
    
    // Verificar si las columnas ya existen
    const schemaResult = await query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'socios_catalogo'
        AND column_name IN ('latitud', 'longitud', 'ubicacion_manual', 'fecha_actualizacion_coords')
    `);
    
    const existingColumns = (schemaResult.rows || []).map(r => r.column_name);
    log.push(`📊 Columnas existentes: ${existingColumns.join(', ') || 'ninguna'}`);
    
    // Agregar columnas faltantes
    const migrations = [];
    
    if (!existingColumns.includes('latitud')) {
      migrations.push({
        sql: `ALTER TABLE socios_catalogo ADD COLUMN latitud DOUBLE PRECISION`,
        name: 'latitud'
      });
    }
    
    if (!existingColumns.includes('longitud')) {
      migrations.push({
        sql: `ALTER TABLE socios_catalogo ADD COLUMN longitud DOUBLE PRECISION`,
        name: 'longitud'
      });
    }
    
    if (!existingColumns.includes('ubicacion_manual')) {
      migrations.push({
        sql: `ALTER TABLE socios_catalogo ADD COLUMN ubicacion_manual BOOLEAN DEFAULT FALSE`,
        name: 'ubicacion_manual'
      });
    }
    
    if (!existingColumns.includes('fecha_actualizacion_coords')) {
      migrations.push({
        sql: `ALTER TABLE socios_catalogo ADD COLUMN fecha_actualizacion_coords TIMESTAMP WITH TIME ZONE`,
        name: 'fecha_actualizacion_coords'
      });
    }
    
    if (migrations.length === 0) {
      log.push("✅ Todas las columnas ya existen, no se requiere migración");
      return res.json({
        status: "ok",
        message: "Esquema ya actualizado",
        log
      });
    }
    
    // Ejecutar migraciones
    for (const migration of migrations) {
      try {
        await query(migration.sql);
        log.push(`  ✓ Columna '${migration.name}' agregada`);
      } catch (err) {
        if (err.message && err.message.includes('already exists')) {
          log.push(`  ⚠️  Columna '${migration.name}' ya existe (ignorando)`);
        } else {
          throw err;
        }
      }
    }
    
    // Crear índices
    log.push("\n🔍 Creando índices...");
    
    try {
      await query(`
        CREATE INDEX IF NOT EXISTS idx_socios_catalogo_coords 
        ON socios_catalogo(latitud, longitud) 
        WHERE latitud IS NOT NULL AND longitud IS NOT NULL
      `);
      log.push("  ✓ Índice idx_socios_catalogo_coords creado");
    } catch (err) {
      log.push(`  ⚠️  Error al crear índice coords: ${err?.message || err}`);
    }
    
    try {
      await query(`
        CREATE INDEX IF NOT EXISTS idx_socios_catalogo_ubicacion_manual 
        ON socios_catalogo(ubicacion_manual) 
        WHERE ubicacion_manual = TRUE
      `);
      log.push("  ✓ Índice idx_socios_catalogo_ubicacion_manual creado");
    } catch (err) {
      log.push(`  ⚠️  Error al crear índice ubicacion_manual: ${err?.message || err}`);
    }
    
    log.push("\n✅ Migración completada exitosamente");
    
    res.json({
      status: "ok",
      message: "Migración ejecutada exitosamente",
      migrations_applied: migrations.map(m => m.name),
      log
    });
    
  } catch (err) {
    log.push(`\n❌ Error fatal: ${err?.message || err}`);
    console.error("[admin] Error en migración:", err);
    res.status(500).json({
      error: "Error al ejecutar migración",
      details: err?.message || String(err),
      log
    });
  }
});

export default router;
