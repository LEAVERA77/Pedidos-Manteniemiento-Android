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
import com.gestornova.gestion.NotificacionMovilPresenter;
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
            for (NeonJdbc.NotificacionMovilRow row : rows) {
                if (NotificacionMovilPresenter.show(ctx, row.id, row.titulo, row.cuerpo, row.pedidoId))
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

}
