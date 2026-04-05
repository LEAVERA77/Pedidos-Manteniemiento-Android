package com.gestornova.gestion.tecnico.config

import android.content.Context
import org.json.JSONObject

/**
 * Lee [api.baseUrl] desde assets/config.json (misma fuente que la WebView).
 */
object ApiConfigLoader {

    fun loadBaseUrl(context: Context): String? {
        return try {
            val raw = context.assets.open("config.json").bufferedReader().use { it.readText() }
            val root = JSONObject(raw)
            val api = root.optJSONObject("api") ?: return null
            val url = api.optString("baseUrl", "").trim().trimEnd('/')
            if (url.isEmpty()) null else "$url/"
        } catch (_: Exception) {
            null
        }
    }
}
