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

import java.sql.Connection;

/**
 * Cada ~15 min envía la última ubicación conocida del técnico a Neon (tabla {@code ubicaciones_usuarios}),
 * complementando el tracking del WebView cuando la app está en segundo plano.
 */
public class UbicacionWorker extends Worker {

    private static final String TAG = "UbicacionWorker";

    public static final String PREFS_SESSION = "gestornova_session";
    public static final String KEY_USER_ID = "user_id";
    public static final String KEY_ROL = "rol";
    /** Cliente / tenant operativo (sincronizado desde la web admin vía WebView). */
    public static final String KEY_TENANT_ID = "tenant_id";

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
        if (uid <= 0 || (!"tecnico".equals(rol) && !"supervisor".equals(rol))) {
            Log.d(TAG, "No hay sesión de técnico/supervisor activa");
            return Result.success();
        }

        String cs = NeonConfigReader.readConnectionString(ctx);
        if (cs == null) {
            Log.d(TAG, "Sin connection string");
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
        try (Connection conn = NeonJdbc.open(cs)) {
            NeonJdbc.insertUbicacionUsuario(conn, uid, loc.getLatitude(), loc.getLongitude(), prec);
            Log.i(TAG, "Ubicación registrada uid=" + uid);
            return Result.success();
        } catch (NoClassDefFoundError e) {
            Log.w(TAG, "JDBC no usable (ubicación omitida): " + e.getMessage());
            return Result.success();
        } catch (Exception e) {
            Log.w(TAG, "Error al enviar ubicación: " + e.getMessage());
            return Result.success();
        }
    }
}
