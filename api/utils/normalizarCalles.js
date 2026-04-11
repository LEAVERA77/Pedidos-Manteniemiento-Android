/**
 * Diccionario de calles normalizadas por ciudad para corregir errores de escritura
 * del usuario en el bot de WhatsApp.
 * 
 * NOTA: Este diccionario hardcodeado se mantiene como fallback. La fuente principal
 * es la tabla `calles_normalizadas` en Neon DB.
 * 
 * Estructura:
 * {
 *   "ciudad": {
 *     "nombre_oficial": ["variante1", "variante2", ...]
 *   }
 * }
 * 
 * made by leavera77
 */

import { query } from "../db/neon.js";
import {
  mejorCoincidenciaDiccionarioCalles,
  normalizarTextoCalleComparacion,
  UMBRAL_SIMILITUD_CALLE_JW,
} from "./normalizadorCalles.js";

export const DICCIONARIO_CALLES_FALLBACK = {
  "Cerrito": {
    "Boulevard Libertad": ["livertad", "libertad", "bvar libertad", "bv libertad", "bvd libertad", "boulevar libertad"],
    "Avenida San Martín": ["san martin", "sanmartin", "av san martin", "avda san martin"],
    "Avenida Mitre": ["mitre", "av mitre", "avda mitre"],
    "Avenida Paraná": ["parana", "av parana", "avda parana"],
    "Antártida Argentina": ["antartica", "antartida", "antartica argentina"],
    "Almafuerte": ["almafuerte", "alma fuerte"],
    "25 de Mayo": ["25 mayo", "veinticinco de mayo", "25demayo"],
    "9 de Julio": ["9 julio", "nueve de julio", "9dejulio"],
  },
  // Agregar más ciudades según sea necesario
};

/**
 * Carga el diccionario de calles desde la BD (cachea por 5 minutos)
 */
let _cacheDict = null;
let _cacheExpiry = 0;

async function cargarDiccionarioDesdeDB(ciudad) {
  const now = Date.now();
  if (_cacheDict && now < _cacheExpiry && _cacheDict[ciudad]) {
    return _cacheDict[ciudad];
  }
  
  try {
    const result = await query(
      `SELECT nombre_oficial, variantes 
       FROM calles_normalizadas 
       WHERE ciudad = $1 AND activo = TRUE`,
      [ciudad]
    );
    
    if (!result || !result.rows || result.rows.length === 0) {
      console.info("[normalize-calle] Sin calles en BD para ciudad '%s', usando fallback", ciudad);
      return DICCIONARIO_CALLES_FALLBACK[ciudad] || null;
    }
    
    const dict = {};
    for (const row of result.rows) {
      dict[row.nombre_oficial] = Array.isArray(row.variantes) ? row.variantes : [];
    }
    
    // Cachear por 5 minutos
    if (!_cacheDict) _cacheDict = {};
    _cacheDict[ciudad] = dict;
    _cacheExpiry = now + (5 * 60 * 1000);
    
    console.info("[normalize-calle] Diccionario cargado desde BD para '%s': %d calles", ciudad, result.rows.length);
    return dict;
  } catch (err) {
    console.warn("[normalize-calle] Error al cargar diccionario desde BD:", err?.message || err);
    return DICCIONARIO_CALLES_FALLBACK[ciudad] || null;
  }
}

function normalizarParaComparacion(str) {
  return normalizarTextoCalleComparacion(str);
}

/**
 * Busca el nombre oficial de una calle corrigiendo errores de escritura
 * @param {string} calleInput - Calle ingresada por el usuario
 * @param {string} ciudad - Ciudad donde buscar
 * @returns {Promise<{oficial: string, confianza: number, metodo: string} | null>}
 */
export async function normalizarNombreCalle(calleInput, ciudad) {
  if (!calleInput || !ciudad) return null;
  
  const ciudadNorm = String(ciudad).trim();
  const dict = await cargarDiccionarioDesdeDB(ciudadNorm);
  
  if (!dict) {
    console.info("[normalize-calle] Sin diccionario para ciudad '%s'", ciudadNorm);
    return null;
  }
  
  const inputNorm = normalizarParaComparacion(calleInput);
  
  // 1. Búsqueda exacta en variantes
  for (const [oficial, variantes] of Object.entries(dict)) {
    if (normalizarParaComparacion(oficial) === inputNorm) {
      return { oficial, confianza: 1.0, metodo: "match_exacto_oficial" };
    }
    
    for (const variante of variantes) {
      if (normalizarParaComparacion(variante) === inputNorm) {
        return { oficial, confianza: 1.0, metodo: "match_exacto_variante" };
      }
    }
  }
  
  // 2. Fuzzy: Jaro-Winkler (+ Levenshtein respaldo) vs. oficial y variantes (umbral ≥ 0,8)
  const entradas = Object.entries(dict).map(([oficial, variantes]) => ({
    oficial,
    alias: Array.isArray(variantes) ? variantes : [],
  }));
  const fuzzy = mejorCoincidenciaDiccionarioCalles(calleInput, entradas, {
    minScore: UMBRAL_SIMILITUD_CALLE_JW,
    usarLevenshteinRespaldo: true,
  });
  if (fuzzy) {
    return {
      oficial: fuzzy.oficial,
      confianza: fuzzy.confianza,
      metodo: fuzzy.metodo,
    };
  }

  console.info("[normalize-calle] Sin match fuzzy (≥%.2f) para '%s' en %s", UMBRAL_SIMILITUD_CALLE_JW, calleInput, ciudadNorm);
  return null;
}

/**
 * Normaliza una dirección completa antes de geocodificar
 * @param {object} opts
 * @param {string} opts.calle
 * @param {string} opts.ciudad
 * @returns {Promise<{calleNormalizada: string, original: string, cambio: boolean, confianza: number}>}
 */
export async function normalizarDireccion({ calle, ciudad }) {
  const calleOriginal = String(calle || "").trim();
  
  if (!calleOriginal || !ciudad) {
    return { 
      calleNormalizada: calleOriginal, 
      original: calleOriginal, 
      cambio: false, 
      confianza: 1.0 
    };
  }
  
  const resultado = await normalizarNombreCalle(calleOriginal, ciudad);
  
  if (resultado && resultado.confianza >= UMBRAL_SIMILITUD_CALLE_JW) {
    const igual =
      normalizarParaComparacion(calleOriginal) === normalizarParaComparacion(resultado.oficial);
    console.info("[normalize-direccion] '%s' → '%s' (confianza: %.2f, método: %s)", 
      calleOriginal, resultado.oficial, resultado.confianza, resultado.metodo);
    return {
      calleNormalizada: resultado.oficial,
      original: calleOriginal,
      cambio: !igual,
      confianza: resultado.confianza,
      metodo: resultado.metodo
    };
  }
  
  return { 
    calleNormalizada: calleOriginal, 
    original: calleOriginal, 
    cambio: false, 
    confianza: 1.0 
  };
}
