package com.gestornova.gestion.work;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationManager;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONObject;

import java.io.BufferedOutputStream;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Cada ~15 min envía la última ubicación conocida del técnico a Neon (tabla {@code ubicaciones_usuarios}),
 * complementando el tracking del WebView cuando la app está en segundo plano.
 */
public class UbicacionWorker extends Worker {

    private static final String TAG = "UbicacionWorker";

    public static final String PREFS_SESSION = "gestornova_session";
    public static final String KEY_USER_ID = "user_id";
    public static final String KEY_ROL = "rol";

    public UbicacionWorker(@NonNull Context context, @NonNull WorkerParameters workerParams) {
        super(context, workerParams);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context ctx = getApplicationContext();
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED
                && ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            Log.d(TAG, "Sin permiso de ubicación");
            return Result.success();
        }

        SharedPreferences sp = ctx.getSharedPreferences(PREFS_SESSION, Context.MODE_PRIVATE);
        int uid = sp.getInt(KEY_USER_ID, -1);
        String rol = sp.getString(KEY_ROL, "").trim().toLowerCase();
        String token = sp.getString("api_token", "");

        if (uid <= 0 || token.isEmpty()) {
            Log.d(TAG, "Sin sesión o token");
            return Result.success();
        }

        if (!"tecnico".equals(rol) && !"supervisor".equals(rol)) {
            Log.d(TAG, "Rol no autorizado para tracking: " + rol);
            return Result.success();
        }

        LocationManager lm = (LocationManager) ctx.getSystemService(Context.LOCATION_SERVICE);
        if (lm == null) return Result.success();

        Location loc = null;
        try {
            if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                loc = lm.getLastKnownLocation(LocationManager.GPS_PROVIDER);
            }
            if (loc == null && lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                loc = lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER);
            }
            if (loc == null) {
                loc = lm.getLastKnownLocation(LocationManager.PASSIVE_PROVIDER);
            }
        } catch (SecurityException e) {
            Log.w(TAG, e.getMessage() != null ? e.getMessage() : "SecurityException");
            return Result.success();
        }

        if (loc == null) {
            Log.d(TAG, "Sin última ubicación conocida");
            return Result.success();
        }

        int prec = loc.hasAccuracy() ? Math.round(loc.getAccuracy()) : 0;
        try {
            String ins = "INSERT INTO ubicaciones_usuarios(usuario_id, lat, lng, precision_m, timestamp) "
                    + "VALUES (" + uid + ", " + loc.getLatitude() + ", " + loc.getLongitude() + ", "
                    + (prec > 0 ? prec : "NULL") + ", NOW())";
            callProxy(token, ins);

            String del = "DELETE FROM ubicaciones_usuarios WHERE usuario_id = " + uid
                    + " AND timestamp < NOW() - INTERVAL '2 hours'";
            callProxy(token, del);

            Log.i(TAG, "Ubicación registrada uid=" + uid);
            return Result.success();
        } catch (Exception e) {
            Log.e(TAG, "Error al enviar ubicación", e);
            return Result.retry();
        }
    }

    private JSONObject callProxy(String token, String query) throws Exception {
        // Usa el proxy de autenticación que sí está desplegado
        URL url = new URL("https://nexxo-api-418k.onrender.com/api/auth/sql-proxy");
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("POST");
        conn.setRequestProperty("Authorization", "Bearer " + token);
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setDoOutput(true);

        JSONObject body = new JSONObject();
        body.put("query", query);

        try (OutputStream os = new BufferedOutputStream(conn.getOutputStream())) {
            os.write(body.toString().getBytes(StandardCharsets.UTF_8));
        }

        int code = conn.getResponseCode();
        if (code != 200) throw new Exception("HTTP " + code);

        try (BufferedReader br = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = br.readLine()) != null) sb.append(line);
            return new JSONObject(sb.toString());
        } finally {
            conn.disconnect();
        }
    }
}