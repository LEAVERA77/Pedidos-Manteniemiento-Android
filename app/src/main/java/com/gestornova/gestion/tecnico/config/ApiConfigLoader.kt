package com.gestornova.gestion.tecnico.config

import android.content.Context
import android.util.Log
import org.json.JSONObject

/**
 * Lee [api.baseUrl] desde assets/config.json (misma fuente que la WebView).
 */
object ApiConfigLoader {

    private const val TAG = "ApiConfigLoader"

    fun loadBaseUrl(context: Context): String? {
        return try {
            val raw = context.assets.open("config.json").bufferedReader().use { it.readText() }
            val root = JSONObject(raw)
            val api = root.optJSONObject("api") ?: run {
                Log.w(TAG, "config.json sin objeto api")
                return null
            }
            val url = api.optString("baseUrl", "").trim().trimEnd('/')
            if (url.isEmpty()) {
                Log.w(TAG, "api.baseUrl vacío")
                null
            } else {
                "$url/"
            }
        } catch (e: Exception) {
            Log.w(TAG, "No se pudo leer api.baseUrl", e)
            null
        }
    }
}
