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
 * WorkManager mínimo 15 min: coincide con el intervalo de tracking en la web.
 */
public final class UbicacionPollingScheduler {

    private static final String TAG = "UbicacionSched";
    private static final String UNIQUE_NAME = "nexxo_ubicacion_periodic";

    private UbicacionPollingScheduler() {}

    public static void schedule(@NonNull Context context) {
        Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();

        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(
                UbicacionWorker.class,
                15,
                TimeUnit.MINUTES)
                .setConstraints(constraints)
                .build();

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                UNIQUE_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                request);

        Log.i(TAG, "Ubicación técnico: trabajo periódico 15 min");
    }
}
