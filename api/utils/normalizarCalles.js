/**
 * Diccionario de calles normalizadas por ciudad para corregir errores de escritura
 * del usuario en el bot de WhatsApp.
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

export const DICCIONARIO_CALLES = {
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
 * Calcula la distancia de Levenshtein entre dos strings (similaridad)
 */
function levenshtein(a, b) {
  const an = a.length;
  const bn = b.length;
  const matrix = Array(bn + 1).fill(null).map(() => Array(an + 1).fill(0));

  for (let i = 0; i <= an; i++) matrix[0][i] = i;
  for (let j = 0; j <= bn; j++) matrix[j][0] = j;

  for (let j = 1; j <= bn; j++) {
    for (let i = 1; i <= an; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + cost
      );
    }
  }

  return matrix[bn][an];
}

/**
 * Normaliza un string para comparación: sin tildes, minúsculas, sin puntos
 */
function normalizarParaComparacion(str) {
  return String(str)
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.,;:]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Busca el nombre oficial de una calle corrigiendo errores de escritura
 * @param {string} calleInput - Calle ingresada por el usuario
 * @param {string} ciudad - Ciudad donde buscar
 * @returns {{oficial: string, confianza: number, metodo: string} | null}
 */
export function normalizarNombreCalle(calleInput, ciudad) {
  if (!calleInput || !ciudad) return null;
  
  const ciudadNorm = String(ciudad).trim();
  const dict = DICCIONARIO_CALLES[ciudadNorm];
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
  
  // 2. Búsqueda por similitud (Levenshtein)
  let mejorMatch = null;
  let mejorDistancia = Infinity;
  
  for (const [oficial, variantes] of Object.entries(dict)) {
    // Comparar con nombre oficial
    const distOficial = levenshtein(inputNorm, normalizarParaComparacion(oficial));
    if (distOficial < mejorDistancia) {
      mejorDistancia = distOficial;
      mejorMatch = oficial;
    }
    
    // Comparar con variantes
    for (const variante of variantes) {
      const dist = levenshtein(inputNorm, normalizarParaComparacion(variante));
      if (dist < mejorDistancia) {
        mejorDistancia = dist;
        mejorMatch = oficial;
      }
    }
  }
  
  // Solo retornar si la distancia es razonable (máximo 3 caracteres de diferencia)
  const umbral = Math.min(3, Math.floor(inputNorm.length * 0.3));
  if (mejorMatch && mejorDistancia <= umbral) {
    const confianza = 1 - (mejorDistancia / inputNorm.length);
    return { 
      oficial: mejorMatch, 
      confianza: Math.max(0.5, confianza),
      metodo: "levenshtein",
      distancia: mejorDistancia
    };
  }
  
  console.info("[normalize-calle] Sin match para '%s' en %s (mejor dist: %s)", 
    calleInput, ciudadNorm, mejorDistancia);
  return null;
}

/**
 * Normaliza una dirección completa antes de geocodificar
 * @param {object} opts
 * @param {string} opts.calle
 * @param {string} opts.ciudad
 * @returns {{calleNormalizada: string, original: string, cambio: boolean, confianza: number}}
 */
export function normalizarDireccion({ calle, ciudad }) {
  const calleOriginal = String(calle || "").trim();
  
  if (!calleOriginal || !ciudad) {
    return { 
      calleNormalizada: calleOriginal, 
      original: calleOriginal, 
      cambio: false, 
      confianza: 1.0 
    };
  }
  
  const resultado = normalizarNombreCalle(calleOriginal, ciudad);
  
  if (resultado && resultado.confianza >= 0.6) {
    console.info("[normalize-direccion] '%s' → '%s' (confianza: %.2f, método: %s)", 
      calleOriginal, resultado.oficial, resultado.confianza, resultado.metodo);
    return {
      calleNormalizada: resultado.oficial,
      original: calleOriginal,
      cambio: true,
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
