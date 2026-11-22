package com.gestornova.gestion;

import android.app.Application;

import com.gestornova.gestion.tecnico.network.ApiClientFactory;

/**
 * Garantiza que {@link com.gestornova.gestion.work.NeonJdbc} ejecute su {@code static} (props pgjdbc)
 * antes que cualquier {@code Worker} de WorkManager y habilita la caché HTTP en disco de OkHttp (20 MB).
 */
public final class GestorNovaApp extends Application {

    @Override
    public void onCreate() {
        super.onCreate();
        try {
            ApiClientFactory.initHttpCache(getCacheDir());
        } catch (Throwable ignored) {
        }
        try {
            Class.forName("com.gestornova.gestion.work.NeonJdbc");
        } catch (Throwable ignored) {
            // Fallo de driver / classpath: los workers capturan y registran en logcat.
        }
    }
}
