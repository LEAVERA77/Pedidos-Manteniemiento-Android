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
        try {
            com.google.firebase.messaging.FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
                String token = task.isSuccessful() ? task.getResult() : null;
                if (token != null && token.length() >= 20) saveToken(context, token);
                responder(cb, token);
            });
        } catch (Exception e) {
            responder(cb, null); // Firebase no configurado en este build.
        }
    }

    private void responder(String cb, String token) {
        webView.post(() -> {
            try {
                JSONObject o = new JSONObject();
                if (token != null && token.length() >= 20) {
                    o.put("token", token);
                    o.put("plataforma", "android");
                } else o.put("error", "sin_token_fcm");
                webView.evaluateJavascript(cb + "(" + o.toString() + ")", null);
            } catch (Exception e) { Log.w(TAG, "getToken", e); }
        });
    }
}
