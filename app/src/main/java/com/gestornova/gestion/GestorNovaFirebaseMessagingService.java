package com.gestornova.gestion;

import android.util.Log;

/**
 * Stub: activar con Firebase Cloud Messaging cuando exista google-services.json.
 * Guarda el token en SharedPreferences para {@link FcmTokenBridge}.
 * made by leavera77
 */
public class GestorNovaFirebaseMessagingService {

    private static final String TAG = "GNFirebaseMsg";

    /** Llamar desde com.google.firebase.messaging.FirebaseMessagingService.onNewToken cuando se integre Firebase. */
    public static void onNewTokenReceived(android.content.Context context, String token) {
        if (token == null || token.length() < 20) return;
        FcmTokenBridge.saveToken(context, token);
        Log.i(TAG, "FCM token actualizado");
    }
}
