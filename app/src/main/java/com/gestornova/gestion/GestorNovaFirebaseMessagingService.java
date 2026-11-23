package com.gestornova.gestion;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import androidx.annotation.NonNull;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import com.gestornova.gestion.work.UbicacionWorker;
import java.util.Map;

/** Mensajes de datos de asignación masiva; se presentan con el mismo id que la cola local. */
public class GestorNovaFirebaseMessagingService extends FirebaseMessagingService {
    @Override public void onNewToken(@NonNull String token) {
        FcmTokenBridge.saveToken(this, token);
        Log.i("GNFirebaseMsg", "Token FCM actualizado");
        // El próximo polling de la WebView lo registra con el JWT de la sesión actual.
    }

    @Override public void onMessageReceived(@NonNull RemoteMessage message) {
        Map<String, String> data = message.getData();
        if (!"asignacion_masiva".equals(data.get("tipo"))) return;
        try {
            long id = Long.parseLong(data.get("notificacion_id"));
            int uid = Integer.parseInt(data.get("usuario_id"));
            int cantidad = Integer.parseInt(data.get("cantidad"));
            SharedPreferences session = getSharedPreferences(UbicacionWorker.PREFS_SESSION, Context.MODE_PRIVATE);
            if (id < 1 || uid < 1 || cantidad < 1 || cantidad > 100 || session.getInt(UbicacionWorker.KEY_USER_ID, -1) != uid) return;
            String role = session.getString(UbicacionWorker.KEY_ROL, "");
            if (!"tecnico".equalsIgnoreCase(role) && !"técnico".equalsIgnoreCase(role) && !"supervisor".equalsIgnoreCase(role)) return;
            NotificacionMovilPresenter.show(this, id, "Pedidos asignados",
                "Tenés " + cantidad + " pedido(s) asignado(s). Abrí la aplicación para ver el detalle.", "");
        } catch (RuntimeException e) { Log.w("GNFirebaseMsg", "Mensaje inválido"); }
    }
}
