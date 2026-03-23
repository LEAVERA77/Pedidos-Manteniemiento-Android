package com.leavera.pedidosmg;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Foreground service que permanece activo con la app en segundo plano y ejecuta
 * una verificación de conectividad (capacidades de red + HTTP ligero) cada 15 minutos.
 */
public class NetworkWatchdogService extends Service {

    private static final String TAG = "NetworkWatchdog";

    static final String CHANNEL_ID = "pmg_network_watchdog";
    private static final int NOTIF_ID = 7101;
    /** Intervalo entre verificaciones completas de red. */
    private static final long INTERVAL_MS = 15 * 60 * 1000L;
    private static final long INITIAL_DELAY_MS = 5_000L;
    private static final int CONNECT_TIMEOUT_MS = 12_000;
    private static final int READ_TIMEOUT_MS = 12_000;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService ioPool = Executors.newSingleThreadExecutor();
    private volatile boolean stopped = false;

    private final Runnable periodicCheck = new Runnable() {
        @Override
        public void run() {
            if (stopped) return;
            ioPool.execute(() -> {
                if (stopped) return;
                final boolean deviceOnline = isDeviceOnline(NetworkWatchdogService.this);
                final boolean httpOk = deviceOnline && checkHttpReachability();
                mainHandler.post(() -> {
                    if (stopped) return;
                    updateNotification(httpOk, deviceOnline);
                    mainHandler.postDelayed(periodicCheck, INTERVAL_MS);
                });
            });
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
        Notification initial = buildNotification(
                getString(R.string.watchdog_notification_checking),
                getString(R.string.watchdog_notification_subtitle),
                true,
                true);
        startForegroundWithType(initial);
        mainHandler.postDelayed(periodicCheck, INITIAL_DELAY_MS);
        Log.i(TAG, "Servicio iniciado; primer chequeo en " + (INITIAL_DELAY_MS / 1000) + "s, luego cada 15 min");
    }

    private void startForegroundWithType(Notification notification) {
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(
                    NOTIF_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(NOTIF_ID, notification);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        stopped = true;
        mainHandler.removeCallbacks(periodicCheck);
        ioPool.shutdownNow();
        super.onDestroy();
        Log.i(TAG, "Servicio detenido");
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID,
                getString(R.string.watchdog_channel_name),
                NotificationManager.IMPORTANCE_LOW);
        ch.setDescription(getString(R.string.watchdog_channel_desc));
        ch.setShowBadge(false);
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.createNotificationChannel(ch);
    }

    private void updateNotification(boolean httpOk, boolean deviceOnline) {
        String title;
        String text;
        if (httpOk) {
            title = getString(R.string.watchdog_notification_ok_title);
            text = getString(R.string.watchdog_notification_ok_text);
        } else if (deviceOnline) {
            title = getString(R.string.watchdog_notification_limited_title);
            text = getString(R.string.watchdog_notification_limited_text);
        } else {
            title = getString(R.string.watchdog_notification_offline_title);
            text = getString(R.string.watchdog_notification_offline_text);
        }
        Notification updated = buildNotification(title, text, httpOk, deviceOnline);
        startForegroundWithType(updated);
        Log.i(TAG, "Chequeo red: deviceOnline=" + deviceOnline + " httpOk=" + httpOk);
    }

    private Notification buildNotification(String title, String text, boolean ok, boolean deviceOnline) {
        Intent open = new Intent(this, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        android.app.PendingIntent pi = android.app.PendingIntent.getActivity(
                this,
                0,
                open,
                android.app.PendingIntent.FLAG_UPDATE_CURRENT
                        | android.app.PendingIntent.FLAG_IMMUTABLE);

        int color = ok ? 0xff059669 : (deviceOnline ? 0xfff97316 : 0xffdc2626);
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_launcher_foreground)
                .setContentTitle(title)
                .setContentText(text)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(pi)
                .setColor(color)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .build();
    }

    private static boolean isDeviceOnline(Context ctx) {
        ConnectivityManager cm = (ConnectivityManager) ctx.getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return false;
        Network nw = cm.getActiveNetwork();
        if (nw == null) return false;
        NetworkCapabilities caps = cm.getNetworkCapabilities(nw);
        if (caps == null) return false;
        if (!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) return false;
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
    }

    /**
     * Comprueba salida HTTP real (204 de generate_204); no depende solo del estado del sistema.
     */
    private static boolean checkHttpReachability() {
        HttpURLConnection c = null;
        try {
            URL url = new URL("https://www.google.com/generate_204");
            c = (HttpURLConnection) url.openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(CONNECT_TIMEOUT_MS);
            c.setReadTimeout(READ_TIMEOUT_MS);
            c.setRequestMethod("GET");
            c.setUseCaches(false);
            c.connect();
            int code = c.getResponseCode();
            return code == 204 || code == 200;
        } catch (IOException e) {
            Log.w(TAG, "HTTP reachability falló: " + e.getMessage());
            return false;
        } finally {
            if (c != null) c.disconnect();
        }
    }
}
