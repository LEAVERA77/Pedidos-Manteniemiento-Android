package com.gestornova.gestion.work;

import android.content.Context;
import android.util.Log;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;

/**
 * Lee {@code assets/config.json} (misma fuente que la WebView) y obtiene la cadena de Neon.
 */
public final class NeonConfigReader {

    private static final String TAG = "NeonConfigReader";

    private NeonConfigReader() {}

    public static String readConnectionString(Context context) {
        try (InputStream is = context.getAssets().open("config.json");
             BufferedReader r = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = r.readLine()) != null) sb.append(line);
            JSONObject root = new JSONObject(sb.toString());
            if (!root.has("neon")) return null;
            String cs = root.getJSONObject("neon").optString("connectionString", null);
            if (cs == null || cs.isEmpty()) return null;
            return cs.trim();
        } catch (Exception e) {
            Log.w(TAG, "config.json no disponible o inválido: " + e.getMessage());
            return null;
        }
    }
}
