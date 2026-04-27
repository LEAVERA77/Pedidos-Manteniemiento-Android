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

import java.sql.Connection;
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
        if (uid <= 0) {
            Log.d(TAG, "Sin sesión");
            return Result.success();
        }

        String cs = NeonConfigReader.readConnectionString(ctx);
        if (cs == null) {
            Log.d(TAG, "Sin connectionString");
            return Result.success();
        }

        try (Connection conn = NeonJdbc.open(cs)) {
            if (!NeonJdbc.hasNotificacionesMovilTable(conn)) {
                Log.d(TAG, "Tabla notificaciones_movil ausente");
                return Result.success();
            }
            List<NeonJdbc.NotificacionMovilRow> rows = NeonJdbc.fetchUnreadNotificacionesMovil(conn, uid, 15);
            ensureChannel(ctx);
            for (NeonJdbc.NotificacionMovilRow row : rows) {
                mostrarNotificacion(ctx, row);
                NeonJdbc.markNotificacionMovilLeida(conn, row.id);
            }
            if (!rows.isEmpty()) {
                Log.i(TAG, "Procesadas " + rows.size() + " filas de notificaciones_movil");
            }
            return Result.success();
        } catch (NoClassDefFoundError e) {
            Log.w(TAG, "JDBC no usable (notif. omitidas): " + e.getMessage());
            return Result.success();
        } catch (Exception e) {
            String msg = e.getMessage() != null ? e.getMessage() : "";
            if (msg.contains("notificaciones_movil") || msg.contains("does not exist") || msg.contains("42P01")) {
                Log.d(TAG, "Cola no disponible: " + msg);
                return Result.success();
            }
            Log.w(TAG, "Error JDBC notificaciones_movil: " + msg);
            return Result.success();
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

    private static void mostrarNotificacion(Context ctx, NeonJdbc.NotificacionMovilRow row) {
        String title = row.titulo.isEmpty() ? "GestorNova" : row.titulo;
        String body = row.cuerpo;
        String pedidoId = row.pedidoId != null ? row.pedidoId : "";

        Intent open = new Intent(ctx, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        open.putExtra("pedidoId", pedidoId);

        int req = (int) (row.id % Integer.MAX_VALUE);
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
