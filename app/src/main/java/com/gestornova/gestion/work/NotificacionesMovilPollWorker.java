package com.gestornova.gestion.work;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import com.gestornova.gestion.MainActivity;
import com.gestornova.gestion.R;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedOutputStream;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * Drena la cola {@code notificaciones_movil} en Neon (JDBC) y muestra notificaciones locales.
 * Complementa el polling en WebView (~45 s): con la app cerrada o dormida, WorkManager (~15 min)
 * o este mismo worker en one-shot al volver a primer plano.
 */
public class NotificacionesMovilPollWorker extends Worker {

    private static final String TAG = "NotifMovilPoll";

    /** Mismo id que {@link MainActivity} (puente {@code AndroidLocalNotify}). */
    public static final String CHANNEL_ID = "pmg_pedidos_avisos";

    public NotificacionesMovilPollWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context ctx = getApplicationContext();
        SharedPreferences sp = ctx.getSharedPreferences(UbicacionWorker.PREFS_SESSION, Context.MODE_PRIVATE);
        int uid = sp.getInt(UbicacionWorker.KEY_USER_ID, -1);
        String token = sp.getString("api_token", "");

        if (uid <= 0 || token.isEmpty()) {
            Log.d(TAG, "Sin sesión o token");
            return Result.success();
        }

        try {
            // 1. Fetch unread notifications
            String fetchSql = "SELECT id, titulo, cuerpo, pedido_id FROM notificaciones_movil "
                    + "WHERE usuario_id = " + uid + " AND leida = FALSE ORDER BY id ASC LIMIT 15";

            JSONObject resp = callProxy(token, fetchSql);
            JSONArray rows = resp.optJSONArray("rows");

            if (rows == null || rows.length() == 0) {
                return Result.success();
            }

            ensureChannel(ctx);
            for (int i = 0; i < rows.length(); i++) {
                JSONObject row = rows.getJSONObject(i);
                long id = row.getLong("id");
                String titulo = row.optString("titulo", "");
                String cuerpo = row.optString("cuerpo", "");
                String pedidoId = row.isNull("pedido_id") ? null : row.getString("pedido_id");

                mostrarNotificacion(ctx, id, titulo, cuerpo, pedidoId);

                // 2. Mark as read
                callProxy(token, "UPDATE notificaciones_movil SET leida = TRUE WHERE id = " + id);
            }

            Log.i(TAG, "Procesadas " + rows.length() + " filas de notificaciones_movil");
            return Result.success();
        } catch (Exception e) {
            String msg = e.getMessage() != null ? e.getMessage() : "";
            if (msg.contains("notificaciones_movil") || msg.contains("does not exist")) {
                Log.d(TAG, "Cola no disponible: " + msg);
                return Result.success();
            }
            Log.e(TAG, "Error REST notificaciones_movil", e);
            return Result.retry();
        }
    }

    private JSONObject callProxy(String token, String query) throws Exception {
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

    private static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID,
                "Avisos de pedidos",
                NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Cuando un administrador te envía un pedido al mapa");
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm != null) nm.createNotificationChannel(ch);
    }

    private static void mostrarNotificacion(Context ctx, long id, String titulo, String cuerpo, String pedidoId) {
        String title = (titulo == null || titulo.isEmpty()) ? "GestorNova" : titulo;
        String body = cuerpo != null ? cuerpo : "";
        String pId = pedidoId != null ? pedidoId : "";

        Intent open = new Intent(ctx, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        open.putExtra("pedidoId", pId);

        int req = (int) (id % Integer.MAX_VALUE);
        PendingIntent pi = PendingIntent.getActivity(
                ctx,
                req,
                open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        String shortBody = body.length() > 200 ? body.substring(0, 197) + "…" : body;
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_launcher_foreground)
                .setContentTitle(title)
                .setContentText(shortBody)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(pi);

        try {
            NotificationManagerCompat.from(ctx).notify(req, b.build());
        } catch (SecurityException e) {
            Log.w(TAG, "Notificación bloqueada: " + e.getMessage());
        }
    }
}
