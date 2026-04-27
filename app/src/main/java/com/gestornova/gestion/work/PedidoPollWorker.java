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

import java.sql.Connection;
import java.sql.SQLException;

/**
 * Consulta periódica a la tabla {@code pedidos} en Neon y muestra una notificación local
 * si hay filas con {@code id} mayor al último visto (marca de agua en SharedPreferences).
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
        String cs = NeonConfigReader.readConnectionString(ctx);
        if (cs == null) {
            Log.d(TAG, "Sin connectionString: omitiendo (añadí assets/config.json)");
            return Result.success();
        }

        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        long stored = prefs.getLong(KEY_LAST_MAX_ID, -1L);

        try (Connection conn = NeonJdbc.open(cs)) {
            long maxId = NeonJdbc.queryMaxPedidoId(conn);
            if (maxId < 0) {
                Log.w(TAG, "MAX(id) inválido");
                return Result.retry();
            }

            if (stored < 0) {
                prefs.edit().putLong(KEY_LAST_MAX_ID, maxId).apply();
                Log.i(TAG, "Bootstrap marca de agua pedidos maxId=" + maxId);
                return Result.success();
            }

            if (maxId > stored) {
                int nuevos = NeonJdbc.countPedidosNewerThan(conn, stored);
                String ultimoNp = NeonJdbc.queryNumeroPedido(conn, maxId);
                mostrarNotificacion(ctx, nuevos, ultimoNp);
                prefs.edit().putLong(KEY_LAST_MAX_ID, maxId).apply();
                Log.i(TAG, "Nuevos pedidos: " + nuevos + " (maxId " + stored + " -> " + maxId + ")");
            }

            return Result.success();
        } catch (SQLException e) {
            // Emulador sin Neon válido / red: evita reintentos infinitos y ruido en logcat.
            Log.w(TAG, "Neon no disponible (config.json / red). Notif. pedidos desactivada: " + e.getMessage());
            return Result.success();
        } catch (NoClassDefFoundError e) {
            // p.ej. pgjdbc + ManagementFactory en Android: no reintentar en bucle.
            Log.w(TAG, "JDBC no usable en este dispositivo (notif. pedidos omitida): " + e.getMessage());
            return Result.success();
        } catch (Exception e) {
            Log.e(TAG, "Error consultando Neon", e);
            return Result.success();
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
