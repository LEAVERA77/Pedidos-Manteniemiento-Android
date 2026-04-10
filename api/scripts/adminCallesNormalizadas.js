/**
 * Script auxiliar para gestionar calles normalizadas en Neon
 * 
 * Uso:
 *   node adminCallesNormalizadas.js listar [ciudad]
 *   node adminCallesNormalizadas.js agregar "Ciudad" "Nombre Oficial" "variante1,variante2,variante3"
 *   node adminCallesNormalizadas.js actualizar ID "nueva_variante1,nueva_variante2"
 *   node adminCallesNormalizadas.js desactivar ID
 * 
 * made by leavera77
 */

import { query } from "../db/neon.js";

const comando = process.argv[2];
const args = process.argv.slice(3);

async function listarCalles(ciudad) {
  try {
    const sql = ciudad
      ? `SELECT * FROM calles_normalizadas WHERE ciudad = $1 ORDER BY ciudad, nombre_oficial`
      : `SELECT * FROM calles_normalizadas ORDER BY ciudad, nombre_oficial`;
    
    const params = ciudad ? [ciudad] : [];
    const result = await query(sql, params);
    
    if (!result || !result.rows || result.rows.length === 0) {
      console.log("No se encontraron calles.");
      return;
    }
    
    console.log(`\n📍 Calles normalizadas (${result.rows.length} registros)\n`);
    console.log("═".repeat(80));
    
    let ciudadActual = "";
    for (const row of result.rows) {
      if (row.ciudad !== ciudadActual) {
        ciudadActual = row.ciudad;
        console.log(`\n🏙️  ${ciudadActual.toUpperCase()}`);
        console.log("─".repeat(80));
      }
      
      const estado = row.activo ? "✓" : "✗";
      const variantes = Array.isArray(row.variantes) ? row.variantes.join(", ") : "";
      console.log(`${estado} [${row.id}] ${row.nombre_oficial}`);
      console.log(`   Variantes: ${variantes || "(ninguna)"}`);
      console.log("");
    }
    
    console.log("═".repeat(80));
  } catch (err) {
    console.error("❌ Error al listar calles:", err?.message || err);
    process.exit(1);
  }
}

async function agregarCalle(ciudad, nombreOficial, variantesStr) {
  if (!ciudad || !nombreOficial || !variantesStr) {
    console.error("❌ Uso: node adminCallesNormalizadas.js agregar \"Ciudad\" \"Nombre Oficial\" \"variante1,variante2\"");
    process.exit(1);
  }
  
  try {
    const variantes = variantesStr.split(",").map(v => v.trim()).filter(v => v.length > 0);
    
    const result = await query(
      `INSERT INTO calles_normalizadas (ciudad, nombre_oficial, variantes, activo)
       VALUES ($1, $2, $3, TRUE)
       ON CONFLICT (ciudad, nombre_oficial) 
       DO UPDATE SET variantes = EXCLUDED.variantes, fecha_actualizacion = NOW()
       RETURNING id`,
      [ciudad, nombreOficial, variantes]
    );
    
    const id = result?.rows?.[0]?.id;
    console.log(`✓ Calle agregada/actualizada: [${id}] ${nombreOficial} en ${ciudad}`);
    console.log(`  Variantes: ${variantes.join(", ")}`);
  } catch (err) {
    console.error("❌ Error al agregar calle:", err?.message || err);
    process.exit(1);
  }
}

async function actualizarVariantes(id, variantesStr) {
  if (!id || !variantesStr) {
    console.error("❌ Uso: node adminCallesNormalizadas.js actualizar ID \"variante1,variante2\"");
    process.exit(1);
  }
  
  try {
    const variantes = variantesStr.split(",").map(v => v.trim()).filter(v => v.length > 0);
    
    const result = await query(
      `UPDATE calles_normalizadas 
       SET variantes = $1, fecha_actualizacion = NOW()
       WHERE id = $2
       RETURNING nombre_oficial, ciudad`,
      [variantes, parseInt(id, 10)]
    );
    
    if (!result || !result.rows || result.rows.length === 0) {
      console.error(`❌ No se encontró calle con ID ${id}`);
      process.exit(1);
    }
    
    const row = result.rows[0];
    console.log(`✓ Variantes actualizadas para: ${row.nombre_oficial} en ${row.ciudad}`);
    console.log(`  Nuevas variantes: ${variantes.join(", ")}`);
  } catch (err) {
    console.error("❌ Error al actualizar variantes:", err?.message || err);
    process.exit(1);
  }
}

async function desactivarCalle(id) {
  if (!id) {
    console.error("❌ Uso: node adminCallesNormalizadas.js desactivar ID");
    process.exit(1);
  }
  
  try {
    const result = await query(
      `UPDATE calles_normalizadas 
       SET activo = FALSE, fecha_actualizacion = NOW()
       WHERE id = $1
       RETURNING nombre_oficial, ciudad`,
      [parseInt(id, 10)]
    );
    
    if (!result || !result.rows || result.rows.length === 0) {
      console.error(`❌ No se encontró calle con ID ${id}`);
      process.exit(1);
    }
    
    const row = result.rows[0];
    console.log(`✓ Calle desactivada: ${row.nombre_oficial} en ${row.ciudad}`);
  } catch (err) {
    console.error("❌ Error al desactivar calle:", err?.message || err);
    process.exit(1);
  }
}

async function main() {
  if (!comando) {
    console.log(`
📚 Administrador de Calles Normalizadas

Comandos disponibles:
  listar [ciudad]              Lista todas las calles (opcionalmente filtradas por ciudad)
  agregar [ciudad] [nombre] [variantes]  Agrega o actualiza una calle
  actualizar [id] [variantes]  Actualiza las variantes de una calle existente
  desactivar [id]              Desactiva una calle (no se borrará, solo dejará de usarse)

Ejemplos:
  node adminCallesNormalizadas.js listar
  node adminCallesNormalizadas.js listar "Cerrito"
  node adminCallesNormalizadas.js agregar "Cerrito" "Sarmiento" "sarmiento,dom sarmiento,domingo sarmiento"
  node adminCallesNormalizadas.js actualizar 15 "nueva1,nueva2,nueva3"
  node adminCallesNormalizadas.js desactivar 15
    `);
    process.exit(0);
  }
  
  switch (comando.toLowerCase()) {
    case "listar":
    case "list":
      await listarCalles(args[0]);
      break;
    case "agregar":
    case "add":
      await agregarCalle(args[0], args[1], args[2]);
      break;
    case "actualizar":
    case "update":
      await actualizarVariantes(args[0], args[1]);
      break;
    case "desactivar":
    case "disable":
      await desactivarCalle(args[0]);
      break;
    default:
      console.error(`❌ Comando desconocido: ${comando}`);
      console.error(`   Usa: node adminCallesNormalizadas.js (sin argumentos) para ver la ayuda`);
      process.exit(1);
  }
  
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Error fatal:", err);
  process.exit(1);
});
