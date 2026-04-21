package com.gestornova.gestion.work;

import android.app.Notification;
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

/**
 * Consulta periódica a la tabla {@code pedidos} vía API REST (sql-proxy) y muestra una notificación local
 * si hay filas con {@code id} mayor al último visto.
 */
public class PedidoPollWorker extends Worker {

    private static final String TAG = "PedidoPollWorker";

    public static final String PREFS = "pmg_pedido_poll";
    public static final String KEY_LAST_MAX_ID = "last_max_pedido_id";

    static final String CHANNEL_ID = "pmg_pedidos_workmanager";
    private static final int NOTIF_ID = 7201;

    public PedidoPollWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context ctx = getApplicationContext();
        SharedPreferences session = ctx.getSharedPreferences(UbicacionWorker.PREFS_SESSION, Context.MODE_PRIVATE);
        String token = session.getString("api_token", "");
        if (token.isEmpty()) {
            Log.d(TAG, "Sin token: omitiendo");
            return Result.success();
        }

        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        long stored = prefs.getLong(KEY_LAST_MAX_ID, -1L);

        try {
            // 1. Obtener MAX(id)
            JSONObject respMax = callProxy(token, "SELECT COALESCE(MAX(id), 0) as max_id FROM pedidos");
            JSONArray rowsMax = respMax.optJSONArray("rows");
            if (rowsMax == null || rowsMax.length() == 0) return Result.success();
            long maxId = rowsMax.getJSONObject(0).optLong("max_id", 0);

            if (stored < 0) {
                prefs.edit().putLong(KEY_LAST_MAX_ID, maxId).apply();
                return Result.success();
            }

            if (maxId > stored) {
                // 2. Contar nuevos
                JSONObject respCount = callProxy(token, "SELECT COUNT(*)::int as nuevos FROM pedidos WHERE id > " + stored);
                int nuevos = respCount.optJSONArray("rows").getJSONObject(0).optInt("nuevos", 0);

                // 3. Obtener último número
                JSONObject respNum = callProxy(token, "SELECT numero_pedido FROM pedidos WHERE id = " + maxId);
                String ultimoNp = respNum.optJSONArray("rows").getJSONObject(0).optString("numero_pedido", "");

                mostrarNotificacion(ctx, nuevos, ultimoNp);
                prefs.edit().putLong(KEY_LAST_MAX_ID, maxId).apply();
            }

            return Result.success();
        } catch (Exception e) {
            Log.e(TAG, "Error consultando API", e);
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

    private static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID,
                ctx.getString(R.string.work_pedidos_channel_name),
                NotificationManager.IMPORTANCE_DEFAULT);
        ch.setDescription(ctx.getString(R.string.work_pedidos_channel_desc));
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm != null) nm.createNotificationChannel(ch);
    }

    private static void mostrarNotificacion(Context ctx, int cantidad, String ultimoNumeroPedido) {
        ensureChannel(ctx);

        Intent open = new Intent(ctx, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(
                ctx,
                1,
                open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        String title = ctx.getString(R.string.work_pedidos_notif_title);
        String text;
        if (cantidad == 1 && ultimoNumeroPedido != null && !ultimoNumeroPedido.isEmpty()) {
            text = ctx.getString(R.string.work_pedidos_notif_one, ultimoNumeroPedido);
        } else {
            text = ctx.getString(R.string.work_pedidos_notif_many, cantidad);
        }

        Notification n = new NotificationCompat.Builder(ctx, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_launcher_foreground)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setAutoCancel(true)
                .setContentIntent(pi)
                .build();

        try {
            NotificationManagerCompat.from(ctx).notify(NOTIF_ID, n);
        } catch (SecurityException e) {
            Log.w(TAG, "Notificación bloqueada (permiso): " + e.getMessage());
        }
    }
}