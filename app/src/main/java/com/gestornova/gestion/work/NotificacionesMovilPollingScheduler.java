package com.gestornova.gestion.work;

import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import java.util.concurrent.TimeUnit;

/**
 * Programa {@link NotificacionesMovilPollWorker} cada 15 minutos (mínimo WorkManager para periódicos).
 */
public final class NotificacionesMovilPollingScheduler {

    private static final String TAG = "NotifMovilSched";
    private static final String UNIQUE_NAME = "notificaciones_movil_neon_periodic_poll";

    private NotificacionesMovilPollingScheduler() {}

    public static void schedule(@NonNull Context context) {
        Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();

        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(
                NotificacionesMovilPollWorker.class,
                15,
                TimeUnit.MINUTES)
                .setConstraints(constraints)
                .build();

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                UNIQUE_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                request);

        Log.i(TAG, "WorkManager cola notificaciones_movil (15 min, requiere red)");
    }
}
