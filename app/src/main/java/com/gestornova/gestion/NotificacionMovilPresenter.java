package com.gestornova.gestion;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import java.util.HashSet;
import java.util.Set;

/** Una presentación por id de cola en este dispositivo, compartida por FCM, WebView y Worker. */
public final class NotificacionMovilPresenter {
    private static final String CHANNEL = "pmg_pedidos_avisos";
    private static final String PREFS = "gestornova_notif_presentadas";
    private NotificacionMovilPresenter() {}

    public static synchronized boolean show(Context context, long id, String title, String body, String pedidoId) {
        if (id <= 0) return false;
        Context ctx = context.getApplicationContext();
        NotificationManagerCompat manager = NotificationManagerCompat.from(ctx);
        if (!manager.areNotificationsEnabled()) return false;
        SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String key = "id_" + id;
        if (sp.contains(key)) return true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Avisos de pedidos", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Cuando un administrador te envía un pedido al mapa");
            NotificationManager nm = ctx.getSystemService(NotificationManager.class);
            if (nm != null) {
                nm.createNotificationChannel(channel);
                NotificationChannel existing = nm.getNotificationChannel(CHANNEL);
                if (existing != null && existing.getImportance() == NotificationManager.IMPORTANCE_NONE) return false;
            }
        }
        Intent open = new Intent(ctx, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        open.putExtra("pedidoId", pedidoId != null ? pedidoId : "");
        int req = (int) (id % Integer.MAX_VALUE);
        PendingIntent pi = PendingIntent.getActivity(ctx, req, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String safeTitle = title != null && !title.isEmpty() ? title : "GestorNova";
        String text = body != null ? body : "";
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_launcher_foreground).setContentTitle(safeTitle)
            .setContentText(text.length() > 200 ? text.substring(0, 197) + "…" : text)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
            .setPriority(NotificationCompat.PRIORITY_HIGH).setAutoCancel(true).setContentIntent(pi);
        try { manager.notify(req, b.build()); }
        catch (SecurityException e) { Log.w("GNNotif", "Permiso de notificaciones no concedido"); return false; }
        // Limpieza acotada por antigüedad, sin destruir marcadores recientes para IDs en tránsito.
        SharedPreferences.Editor edit = sp.edit();
        long now = System.currentTimeMillis();
        for (MapEntry entry : expiredEntries(sp, now)) edit.remove(entry.key);
        edit.putLong(key, now).commit();
        return true;
    }

    private static final class MapEntry { final String key; MapEntry(String k) { key = k; } }
    private static Set<MapEntry> expiredEntries(SharedPreferences sp, long now) {
        Set<MapEntry> expired = new HashSet<>();
        for (java.util.Map.Entry<String, ?> e : sp.getAll().entrySet())
            if (e.getKey().startsWith("id_") && e.getValue() instanceof Long && now - (Long)e.getValue() > 90L * 24 * 60 * 60 * 1000)
                expired.add(new MapEntry(e.getKey()));
        return expired;
    }
}
