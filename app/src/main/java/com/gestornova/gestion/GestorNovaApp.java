package com.gestornova.gestion;

import android.app.Application;

/**
 * Garantiza que {@link com.gestornova.gestion.work.NeonJdbc} ejecute su {@code static} (props pgjdbc)
 * antes que cualquier {@code Worker} de WorkManager: si el proceso arranca solo por trabajo en segundo
 * plano, puede no haberse abierto {@link MainActivity} aún.
 */
public final class GestorNovaApp extends Application {

    @Override
    public void onCreate() {
        super.onCreate();
        try {
            Class.forName("com.gestornova.gestion.work.NeonJdbc");
        } catch (Throwable ignored) {
            // Fallo de driver / classpath: los workers capturan y registran en logcat.
        }
    }
}
