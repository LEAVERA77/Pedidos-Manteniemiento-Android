package com.gestornova.gestion;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONObject;

/**
 * Puente JS para token FCM (SharedPreferences o Firebase si está en el classpath).
 * made by leavera77
 */
public class FcmTokenBridge {

    private static final String TAG = "FcmTokenBridge";
    private static final String PREFS = "gestornova_fcm";
    private static final String KEY_TOKEN = "fcm_token";

    private final WebView webView;
    private final Context context;

    public FcmTokenBridge(WebView webView, Context context) {
        this.webView = webView;
        this.context = context.getApplicationContext();
    }

    public static void saveToken(Context ctx, String token) {
        if (ctx == null || token == null || token.length() < 20) return;
        ctx.getApplicationContext()
                .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_TOKEN, token.trim())
                .apply();
    }

  @JavascriptInterface
    public void getToken(String jsCallback) {
        final String cb = jsCallback != null ? jsCallback.trim() : "";
        if (webView == null || cb.isEmpty() || !cb.matches("^[a-zA-Z0-9_.]+$")) return;
        webView.post(() -> {
            String token = null;
            try {
                token = tryFirebaseToken();
            } catch (Exception ignored) {
            }
            if (token == null || token.isEmpty()) {
                token = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_TOKEN, null);
            }
            try {
                JSONObject o = new JSONObject();
                if (token != null && token.length() >= 20) {
                    o.put("token", token);
                    o.put("plataforma", "android");
                } else {
                    o.put("error", "sin_token_fcm");
                }
                webView.evaluateJavascript(cb + "(" + o.toString() + ")", null);
            } catch (Exception e) {
                Log.w(TAG, "getToken", e);
            }
        });
    }

    private String tryFirebaseToken() {
        try {
            Class<?> fm = Class.forName("com.google.firebase.messaging.FirebaseMessaging");
            Object inst = fm.getMethod("getInstance").invoke(null);
            // async only — skip; token should be persisted by GestorNovaFirebaseMessagingService
            return null;
        } catch (ClassNotFoundException e) {
            return null;
        } catch (Exception e) {
            return null;
        }
    }
}
