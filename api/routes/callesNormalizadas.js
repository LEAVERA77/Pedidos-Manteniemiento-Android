/**
 * Rutas API para gestión de calles normalizadas y autocompletado
 * made by leavera77
 */

import { Router } from "express";
import { query } from "../db/neon.js";

const router = Router();

/**
 * GET /api/calles-normalizadas/sugerencias
 * Autocompletado de calles mientras el usuario escribe
 * 
 * Query params:
 *   - q: texto de búsqueda (ej: "liver", "antar")
 *   - ciudad: ciudad donde buscar (ej: "Cerrito")
 *   - limit: máximo de resultados (default: 10)
 */
router.get("/sugerencias", async (req, res) => {
  try {
    const { q, ciudad, limit } = req.query;
    
    if (!q || !ciudad) {
      return res.status(400).json({ 
        error: "Se requieren parámetros 'q' y 'ciudad'" 
      });
    }
    
    const searchTerm = String(q).trim().toLowerCase();
    const ciudadNorm = String(ciudad).trim();
    const maxResults = parseInt(limit) || 10;
    
    if (searchTerm.length < 2) {
      return res.json({ sugerencias: [] });
    }
    
    // Búsqueda en nombre_oficial y variantes usando ILIKE
    const sql = `
      SELECT 
        id,
        ciudad,
        nombre_oficial,
        variantes
      FROM calles_normalizadas
      WHERE ciudad = $1 
        AND activo = TRUE
        AND (
          LOWER(nombre_oficial) LIKE $2
          OR EXISTS (
            SELECT 1 
            FROM unnest(variantes) AS v 
            WHERE LOWER(v) LIKE $2
          )
        )
      ORDER BY 
        CASE 
          WHEN LOWER(nombre_oficial) LIKE $3 THEN 1  -- Coincidencia al inicio (mayor prioridad)
          ELSE 2
        END,
        nombre_oficial
      LIMIT $4
    `;
    
    const result = await query(sql, [
      ciudadNorm,
      `%${searchTerm}%`,  // Coincidencia en cualquier parte
      `${searchTerm}%`,   // Coincidencia al inicio (para ordenar)
      maxResults
    ]);
    
    const sugerencias = result.rows.map(row => ({
      id: row.id,
      nombre_oficial: row.nombre_oficial,
      ciudad: row.ciudad,
      variantes: Array.isArray(row.variantes) ? row.variantes : []
    }));
    
    res.json({ sugerencias });
    
  } catch (err) {
    console.error("[calles-normalizadas-api] Error en sugerencias:", err);
    res.status(500).json({ 
      error: "Error al buscar sugerencias", 
      message: err?.message || String(err) 
    });
  }
});

/**
 * GET /api/calles-normalizadas
 * Lista todas las calles de una ciudad (para admin)
 */
router.get("/", async (req, res) => {
  try {
    const { ciudad } = req.query;
    
    const sql = ciudad
      ? `SELECT * FROM calles_normalizadas WHERE ciudad = $1 AND activo = TRUE ORDER BY nombre_oficial`
      : `SELECT * FROM calles_normalizadas WHERE activo = TRUE ORDER BY ciudad, nombre_oficial`;
    
    const params = ciudad ? [String(ciudad).trim()] : [];
    const result = await query(sql, params);
    
    res.json({ calles: result.rows });
    
  } catch (err) {
    console.error("[calles-normalizadas-api] Error al listar:", err);
    res.status(500).json({ 
      error: "Error al listar calles", 
      message: err?.message || String(err) 
    });
  }
});

/**
 * POST /api/calles-normalizadas
 * Agregar nueva calle (admin)
 * 
 * Body: { ciudad, nombre_oficial, variantes: [] }
 */
router.post("/", async (req, res) => {
  try {
    const { ciudad, nombre_oficial, variantes } = req.body;
    
    if (!ciudad || !nombre_oficial || !Array.isArray(variantes)) {
      return res.status(400).json({ 
        error: "Se requieren campos: ciudad, nombre_oficial, variantes[]" 
      });
    }
    
    const result = await query(
      `INSERT INTO calles_normalizadas (ciudad, nombre_oficial, variantes, activo)
       VALUES ($1, $2, $3, TRUE)
       ON CONFLICT (ciudad, nombre_oficial) 
       DO UPDATE SET variantes = EXCLUDED.variantes, fecha_actualizacion = NOW()
       RETURNING *`,
      [String(ciudad).trim(), String(nombre_oficial).trim(), variantes]
    );
    
    res.status(201).json({ calle: result.rows[0] });
    
  } catch (err) {
    console.error("[calles-normalizadas-api] Error al agregar:", err);
    res.status(500).json({ 
      error: "Error al agregar calle", 
      message: err?.message || String(err) 
    });
  }
});

export default router;
