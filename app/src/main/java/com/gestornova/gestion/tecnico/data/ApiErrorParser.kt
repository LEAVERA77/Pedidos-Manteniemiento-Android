package com.gestornova.gestion.tecnico.data

import com.google.gson.JsonParser
import retrofit2.HttpException

/**
 * Extrae mensaje legible de respuestas HTTP de la API (JSON `{ "error": "..." }` o texto plano).
 */
object ApiErrorParser {

    fun messageFromHttpException(e: HttpException): String {
        val raw = try {
            e.response()?.errorBody()?.string().orEmpty()
        } catch (_: Exception) {
            ""
        }
        return parseErrorBody(raw).ifBlank { fallbackForCode(e.code()) }
    }

    fun parseErrorBody(raw: String): String {
        val trimmed = raw.trim()
        if (trimmed.isEmpty()) return ""
        return try {
            val o = JsonParser.parseString(trimmed).asJsonObject
            o.get("error")?.asString?.trim().orEmpty().ifBlank { trimmed }
        } catch (_: Exception) {
            trimmed
        }
    }

    private fun fallbackForCode(code: Int): String = when (code) {
        401 -> "No autorizado"
        403 -> "Acceso denegado"
        404 -> "No encontrado"
        in 500..599 -> "Error del servidor ($code)"
        else -> "Error HTTP $code"
    }
}
