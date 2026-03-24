package com.nexxo.gestion.work;

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
 * Programa {@link PedidoPollWorker} cada 15 minutos (mínimo permitido por WorkManager para trabajo periódico).
 */
public final class PedidoPollingScheduler {

    private static final String TAG = "PedidoPolling";
    private static final String UNIQUE_NAME = "pedidos_neon_periodic_poll";

    private PedidoPollingScheduler() {}

    public static void schedule(@NonNull Context context) {
        Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();

        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(
                PedidoPollWorker.class,
                15,
                TimeUnit.MINUTES)
                .setConstraints(constraints)
                .build();

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                UNIQUE_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                request);

        Log.i(TAG, "WorkManager único periódico registrado (15 min, requiere red)");
    }
}
