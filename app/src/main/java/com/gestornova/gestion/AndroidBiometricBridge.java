package com.gestornova.gestion;

import android.content.Context;
import android.os.Build;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;

/**
 * Opcional: guardar usuario/contraseña tras BiometricPrompt y rellenar el login en WebView.
 * Los datos quedan en prefs privadas de la app (no cifrado en disco; mitigado por confirmación biométrica al leer/escribir).
 * made by leavera77
 */
public final class AndroidBiometricBridge {

    private static final String PREFS = "gn_bio_login_v1";
    private static final String K_EM = "em";
    private static final String K_PW = "pw";

    private final MainActivity activity;
    private final WebView webView;

    public AndroidBiometricBridge(MainActivity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
    }

    private Context ctx() {
        return activity.getApplicationContext();
    }

    private static int allowedBiometricAuthenticators() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            return BiometricManager.Authenticators.BIOMETRIC_STRONG
                    | BiometricManager.Authenticators.BIOMETRIC_WEAK;
        }
        return BiometricManager.Authenticators.BIOMETRIC_WEAK;
    }

    @JavascriptInterface
    public boolean isAvailable() {
        try {
            BiometricManager bm = BiometricManager.from(ctx());
            int r = bm.canAuthenticate(allowedBiometricAuthenticators());
            return r == BiometricManager.BIOMETRIC_SUCCESS;
        } catch (Throwable t) {
            return false;
        }
    }

    @JavascriptInterface
    public void clearSavedLogin() {
        try {
            ctx().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit()
                    .remove(K_EM)
                    .remove(K_PW)
                    .apply();
            activity.runOnUiThread(
                    () ->
                            webView.post(
                                    () ->
                                            webView.evaluateJavascript(
                                                    "try{if(typeof window.__gnRefreshLoginBiometricUi==='function')"
                                                            + "window.__gnRefreshLoginBiometricUi();}catch(e){}",
                                                    null)));
        } catch (Throwable ignored) {
        }
    }

    @JavascriptInterface
    public boolean hasSavedLogin() {
        try {
            String em = ctx().getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(K_EM, "");
            return em != null && !em.trim().isEmpty();
        } catch (Throwable t) {
            return false;
        }
    }

    @JavascriptInterface
    public void saveLoginWithBiometric(String email, String password) {
        String em = email != null ? email.trim() : "";
        String pw = password != null ? password : "";
        if (em.isEmpty() || pw.isEmpty()) {
            activity.runOnUiThread(() ->
                    Toast.makeText(activity, "Completá usuario y contraseña.", Toast.LENGTH_SHORT).show());
            return;
        }
        activity.runOnUiThread(() -> showPrompt(
                "Guardar acceso",
                "Confirmá con huella o rostro para guardar en este dispositivo.",
                () -> {
                    try {
                        ctx().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                                .edit()
                                .putString(K_EM, em)
                                .putString(K_PW, pw)
                                .apply();
                        Toast.makeText(activity, "Listo: podés usar «Entrar con huella».", Toast.LENGTH_SHORT).show();
                        webView.post(() -> webView.evaluateJavascript(
                                "try{if(typeof window.__gnRefreshLoginBiometricUi==='function')window.__gnRefreshLoginBiometricUi();}catch(e){}",
                                null));
                    } catch (Throwable t) {
                        Toast.makeText(activity, "No se pudo guardar.", Toast.LENGTH_SHORT).show();
                    }
                }));
    }

    @JavascriptInterface
    public void loginWithBiometric() {
        if (!hasSavedLogin()) {
            activity.runOnUiThread(() ->
                    Toast.makeText(activity, "Primero guardá el acceso con huella.", Toast.LENGTH_SHORT).show());
            return;
        }
        activity.runOnUiThread(() -> showPrompt(
                "Ingresar",
                "Confirmá con huella o rostro para completar usuario y contraseña.",
                () -> {
                    try {
                        String em = ctx().getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(K_EM, "");
                        String pw = ctx().getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(K_PW, "");
                        if (em == null || em.trim().isEmpty()) {
                            Toast.makeText(activity, "No hay credenciales guardadas.", Toast.LENGTH_SHORT).show();
                            return;
                        }
                        JSONObject o = new JSONObject();
                        o.put("em", em);
                        o.put("pw", pw != null ? pw : "");
                        String b64 = Base64.encodeToString(
                                o.toString().getBytes(StandardCharsets.UTF_8),
                                Base64.NO_WRAP);
                        String js =
                                "(function(){try{var o=JSON.parse(atob('" + b64 + "'));"
                                        + "var e=document.getElementById('em');var p=document.getElementById('pw');"
                                        + "if(e)e.value=o.em||'';if(p)p.value=o.pw||'';"
                                        + "if(typeof window.__gnEjecutarLogin==='function')window.__gnEjecutarLogin();"
                                        + "}catch(x){}})()";
                        webView.post(() -> webView.evaluateJavascript(js, null));
                    } catch (Throwable t) {
                        Toast.makeText(activity, "No se pudo leer el acceso guardado.", Toast.LENGTH_SHORT).show();
                    }
                }));
    }

    private void showPrompt(String title, String subtitle, Runnable onSuccess) {
        BiometricPrompt.AuthenticationCallback cb = new BiometricPrompt.AuthenticationCallback() {
            @Override
            public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                try {
                    onSuccess.run();
                } catch (Throwable t) {
                    Toast.makeText(activity, "Error al aplicar el acceso.", Toast.LENGTH_SHORT).show();
                }
            }

            @Override
            public void onAuthenticationError(int errorCode, @NonNull CharSequence errString) {
                if (errorCode != BiometricPrompt.ERROR_USER_CANCELED
                        && errorCode != BiometricPrompt.ERROR_NEGATIVE_BUTTON) {
                    Toast.makeText(activity, errString != null ? errString : "Cancelado", Toast.LENGTH_SHORT).show();
                }
            }
        };
        BiometricPrompt prompt = new BiometricPrompt(
                activity,
                ContextCompat.getMainExecutor(activity),
                cb);
        BiometricPrompt.PromptInfo.Builder b =
                new BiometricPrompt.PromptInfo.Builder()
                        .setTitle(title)
                        .setSubtitle(subtitle)
                        .setNegativeButtonText("Cancelar");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            b.setAllowedAuthenticators(allowedBiometricAuthenticators());
        }
        BiometricPrompt.PromptInfo info = b.build();
        prompt.authenticate(info);
    }
}
