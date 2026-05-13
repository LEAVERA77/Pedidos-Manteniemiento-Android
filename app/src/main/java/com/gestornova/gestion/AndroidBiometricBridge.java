package com.gestornova.gestion;

import android.content.Context;
import android.os.Build;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AlertDialog;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;

/**
 * Opcional: guardar usuario/contraseña tras BiometricPrompt y rellenar el login en WebView.
 * Los datos quedan en prefs privadas de la app (no cifrado en disco; mitigado por confirmación biométrica al leer/escribir).
 * Tras un ingreso correcto, si el guardado biométrico falla o se cancela, se ofrece reintentar hasta lograrlo o
 * indicar explícitamente que no se desea guardar.
 * made by leavera77
 */
public final class AndroidBiometricBridge {

    private static final String PREFS = "gn_bio_login_v1";
    private static final String K_EM = "em";
    private static final String K_PW = "pw";
    private static final String K_DECLINED = "declined_save";

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

    private void postRefreshLoginBiometricJs() {
        webView.post(
                () ->
                        webView.evaluateJavascript(
                                "try{if(typeof window.__gnRefreshLoginBiometricUi==='function')"
                                        + "window.__gnRefreshLoginBiometricUi();}catch(e){}",
                                null));
    }

    @JavascriptInterface
    public void clearSavedLogin() {
        try {
            ctx().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit()
                    .remove(K_EM)
                    .remove(K_PW)
                    .remove(K_DECLINED)
                    .apply();
            activity.runOnUiThread(() -> webView.post(this::postRefreshLoginBiometricJs));
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

    /** El usuario eligió no guardar el acceso con huella en este dispositivo (no volver a pedir en automático). */
    @JavascriptInterface
    public boolean hasUserDeclinedBiometricSave() {
        try {
            return ctx().getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(K_DECLINED, false);
        } catch (Throwable t) {
            return false;
        }
    }

    @JavascriptInterface
    public void declineSaveLoginBiometricOffer() {
        try {
            ctx().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(K_DECLINED, true).apply();
            activity.runOnUiThread(
                    () -> {
                        Toast.makeText(
                                        activity,
                                        "No guardaremos el acceso con huella en este dispositivo.",
                                        Toast.LENGTH_SHORT)
                                .show();
                        postRefreshLoginBiometricJs();
                    });
        } catch (Throwable ignored) {
        }
    }

    @JavascriptInterface
    public void saveLoginWithBiometric(String email, String password) {
        String em = email != null ? email.trim() : "";
        String pw = password != null ? password : "";
        if (em.isEmpty() || pw.isEmpty()) {
            activity.runOnUiThread(
                    () ->
                            Toast.makeText(activity, "Completá usuario y contraseña.", Toast.LENGTH_SHORT)
                                    .show());
            return;
        }
        activity.runOnUiThread(() -> showBiometricSavePrompt(em, pw));
    }

    private void persistCredentialsAfterBiometricOk(String em, String pw) {
        try {
            ctx().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit()
                    .putString(K_EM, em)
                    .putString(K_PW, pw)
                    .remove(K_DECLINED)
                    .apply();
            Toast.makeText(activity, "Listo: podés usar «Entrar con huella».", Toast.LENGTH_SHORT).show();
            postRefreshLoginBiometricJs();
        } catch (Throwable t) {
            Toast.makeText(activity, "No se pudo guardar.", Toast.LENGTH_SHORT).show();
        }
    }

    private void showBiometricSavePrompt(String em, String pw) {
        BiometricPrompt.AuthenticationCallback cb =
                new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                        try {
                            persistCredentialsAfterBiometricOk(em, pw);
                        } catch (Throwable t) {
                            Toast.makeText(activity, "Error al aplicar el acceso.", Toast.LENGTH_SHORT).show();
                        }
                    }

                    @Override
                    public void onAuthenticationFailed() {
                        Toast.makeText(
                                        activity,
                                        "No reconocimos la huella o el rostro. Probá de nuevo.",
                                        Toast.LENGTH_SHORT)
                                .show();
                    }

                    @Override
                    public void onAuthenticationError(int errorCode, @NonNull CharSequence errString) {
                        if (errorCode == BiometricPrompt.ERROR_USER_CANCELED
                                || errorCode == BiometricPrompt.ERROR_NEGATIVE_BUTTON) {
                            showRetryOrDeclineSaveDialog(em, pw);
                            return;
                        }
                        if (errorCode != BiometricPrompt.ERROR_CANCELED) {
                            Toast.makeText(
                                            activity,
                                            errString != null && errString.length() > 0
                                                    ? errString.toString()
                                                    : "No se pudo usar la biometría.",
                                            Toast.LENGTH_SHORT)
                                    .show();
                        }
                        showRetryOrDeclineSaveDialog(em, pw);
                    }
                };
        BiometricPrompt prompt =
                new BiometricPrompt(activity, ContextCompat.getMainExecutor(activity), cb);
        BiometricPrompt.PromptInfo.Builder b =
                new BiometricPrompt.PromptInfo.Builder()
                        .setTitle("Guardar acceso")
                        .setSubtitle("Confirmá con huella o rostro para guardar en este dispositivo.")
                        .setNegativeButtonText("Cancelar");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            b.setAllowedAuthenticators(allowedBiometricAuthenticators());
        }
        prompt.authenticate(b.build());
    }

    private void showRetryOrDeclineSaveDialog(String em, String pw) {
        new AlertDialog.Builder(activity)
                .setTitle("Guardar acceso")
                .setMessage(
                        "¿Querés volver a intentar con huella o rostro, o preferís no guardar el usuario y la "
                                + "contraseña en este celular?\n\n"
                                + "Podés reintentar las veces que hagan falta; solo dejamos de pedirlo si elegís «No "
                                + "quiero guardar».")
                .setPositiveButton(
                        "Reintentar",
                        (d, w) -> {
                            d.dismiss();
                            showBiometricSavePrompt(em, pw);
                        })
                .setNegativeButton(
                        "No quiero guardar",
                        (d, w) -> {
                            try {
                                ctx().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                                        .edit()
                                        .putBoolean(K_DECLINED, true)
                                        .apply();
                            } catch (Throwable ignored) {
                            }
                            d.dismiss();
                            Toast.makeText(
                                            activity,
                                            "Listo. No volveremos a pedir guardar en automático; podés usar «Guardar "
                                                    + "acceso para huella» si cambiás de idea.",
                                            Toast.LENGTH_LONG)
                                    .show();
                            postRefreshLoginBiometricJs();
                        })
                .setCancelable(false)
                .show();
    }

    @JavascriptInterface
    public void loginWithBiometric() {
        if (!hasSavedLogin()) {
            activity.runOnUiThread(
                    () ->
                            Toast.makeText(activity, "Primero guardá el acceso con huella.", Toast.LENGTH_SHORT)
                                    .show());
            return;
        }
        activity.runOnUiThread(
                () ->
                        showReadLoginPrompt(
                                "Ingresar",
                                "Confirmá con huella o rostro para completar usuario y contraseña.",
                                () -> {
                                    try {
                                        String em =
                                                ctx().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                                                        .getString(K_EM, "");
                                        String pw =
                                                ctx().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                                                        .getString(K_PW, "");
                                        if (em == null || em.trim().isEmpty()) {
                                            Toast.makeText(
                                                            activity,
                                                            "No hay credenciales guardadas.",
                                                            Toast.LENGTH_SHORT)
                                                    .show();
                                            return;
                                        }
                                        JSONObject o = new JSONObject();
                                        o.put("em", em);
                                        o.put("pw", pw != null ? pw : "");
                                        String b64 =
                                                Base64.encodeToString(
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
                                        Toast.makeText(
                                                        activity,
                                                        "No se pudo leer el acceso guardado.",
                                                        Toast.LENGTH_SHORT)
                                                .show();
                                    }
                                }));
    }

    private void showReadLoginPrompt(String title, String subtitle, Runnable onSuccess) {
        BiometricPrompt.AuthenticationCallback cb =
                new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                        try {
                            onSuccess.run();
                        } catch (Throwable t) {
                            Toast.makeText(activity, "Error al aplicar el acceso.", Toast.LENGTH_SHORT).show();
                        }
                    }

                    @Override
                    public void onAuthenticationFailed() {
                        Toast.makeText(
                                        activity,
                                        "No reconocido. Probá de nuevo.",
                                        Toast.LENGTH_SHORT)
                                .show();
                    }

                    @Override
                    public void onAuthenticationError(int errorCode, @NonNull CharSequence errString) {
                        if (errorCode != BiometricPrompt.ERROR_USER_CANCELED
                                && errorCode != BiometricPrompt.ERROR_NEGATIVE_BUTTON
                                && errorCode != BiometricPrompt.ERROR_CANCELED) {
                            Toast.makeText(
                                            activity,
                                            errString != null ? errString.toString() : "Cancelado",
                                            Toast.LENGTH_SHORT)
                                    .show();
                        }
                    }
                };
        BiometricPrompt prompt =
                new BiometricPrompt(activity, ContextCompat.getMainExecutor(activity), cb);
        BiometricPrompt.PromptInfo.Builder b =
                new BiometricPrompt.PromptInfo.Builder()
                        .setTitle(title)
                        .setSubtitle(subtitle)
                        .setNegativeButtonText("Cancelar");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            b.setAllowedAuthenticators(allowedBiometricAuthenticators());
        }
        prompt.authenticate(b.build());
    }
}
