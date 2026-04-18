package com.gestornova.gestion;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.util.Log;
import android.widget.Toast;

import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Comprueba actualizaciones vía JSON remoto (manifest HTTP o fila app_version desde Neon vía WebView).
 */
public final class AppUpdateChecker {

    private static final String TAG = "AppUpdateChecker";
    private static final String ASSET_CONFIG = "app_update_config.json";

    private AppUpdateChecker() {}

    public static void checkAsync(AppCompatActivity activity) {
        new Thread(() -> doCheckFromManifest(activity), "gn-app-update").start();
    }

    /**
     * Llamado desde JS cuando ya hay datos de {@code app_version} en Neon (prioridad sobre manifest HTTP).
     */
    public static void checkWithRemoteJson(AppCompatActivity activity, String jsonBody) {
        if (activity == null || jsonBody == null || jsonBody.trim().isEmpty()) return;
        new Thread(() -> {
            try {
                JSONObject remote = new JSONObject(jsonBody.trim());
                applyIfNewer(activity, remote, "neon-db");
            } catch (Exception e) {
                Log.w(TAG, "JSON Neon inválido: " + e.getMessage());
                doCheckFromManifest(activity);
            }
        }, "gn-app-update-neon").start();
    }

    private static void doCheckFromManifest(AppCompatActivity activity) {
        try {
            String manifestUrl = readManifestUrlFromAssets(activity);
            if (manifestUrl.isEmpty()) {
                Log.d(TAG, "Sin manifestUrl en assets/" + ASSET_CONFIG);
                return;
            }
            String body = httpGet(manifestUrl);
            if (body == null) return;
            JSONObject remote = new JSONObject(body);
            applyIfNewer(activity, remote, "manifest");
        } catch (Exception e) {
            Log.w(TAG, "Comprobación manifest omitida: " + e.getMessage());
        }
    }

    private static void applyIfNewer(AppCompatActivity activity, JSONObject remote, String source) {
        try {
            int remoteCode = remote.optInt("versionCode", remote.optInt("version_code", 0));
            String remoteName = remote.optString("versionName", remote.optString("version_name", ""));
            if (remoteName.isEmpty()) remoteName = "v" + remoteCode;
            String apkUrl = remote.optString("apkUrl", remote.optString("apk_url", ""));
            String notes = remote.optString("releaseNotes", remote.optString("release_notes", ""));
            boolean forceUpdate = remote.optBoolean("forceUpdate", remote.optBoolean("force_update", false));

            if (remoteCode <= 0 || apkUrl.isEmpty()) {
                Log.w(TAG, "Manifest incompleto (" + source + "): versionCode/apkUrl");
                return;
            }

            PackageInfo pi = activity.getPackageManager()
                    .getPackageInfo(activity.getPackageName(), 0);
            long current = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                    ? pi.getLongVersionCode()
                    : pi.versionCode;

            if (remoteCode <= current) {
                Log.d(TAG, "Sin actualización (" + source + "): local=" + current + " remoto=" + remoteCode);
                return;
            }

            Log.i(TAG, "Actualización disponible (" + source + "): " + current + " -> " + remoteCode);

            String title = forceUpdate
                    ? activity.getString(R.string.update_dialog_title_forced)
                    : activity.getString(R.string.update_dialog_title);
            String msg = forceUpdate
                    ? activity.getString(R.string.update_dialog_message_forced, remoteName)
                            + (!notes.isEmpty() ? "\n\n" + notes : "")
                    : buildMessage(activity, remoteName, notes);

            activity.runOnUiThread(() -> showDialog(activity, title, msg, apkUrl, forceUpdate));
        } catch (PackageManager.NameNotFoundException e) {
            Log.e(TAG, "Package?", e);
        } catch (Exception e) {
            Log.w(TAG, "applyIfNewer: " + e.getMessage());
        }
    }

    private static void showDialog(AppCompatActivity activity, String title, String msg, String apkUrl, boolean forceUpdate) {
        if (activity.isFinishing() || activity.isDestroyed()) return;
        AlertDialog.Builder b = new AlertDialog.Builder(activity)
                .setTitle(title)
                .setMessage(msg)
                .setPositiveButton(R.string.update_dialog_download, (d, w) -> {
                    try {
                        activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(apkUrl)));
                    } catch (Exception e) {
                        Log.e(TAG, "No se pudo abrir apkUrl", e);
                        Toast.makeText(activity, R.string.update_dialog_open_failed, Toast.LENGTH_LONG).show();
                    }
                });
        if (!forceUpdate) {
            b.setNegativeButton(R.string.update_dialog_later, null);
        }
        AlertDialog dialog = b.create();
        if (forceUpdate) {
            dialog.setCancelable(false);
            dialog.setCanceledOnTouchOutside(false);
        }
        dialog.show();
    }

    private static String buildMessage(AppCompatActivity activity, String remoteName, String notes) {
        String base = activity.getString(R.string.update_dialog_message, remoteName);
        if (!notes.isEmpty()) {
            return base + "\n\n" + notes;
        }
        return base;
    }

    private static String readManifestUrlFromAssets(AppCompatActivity activity) throws Exception {
        try (InputStream in = activity.getAssets().open(ASSET_CONFIG)) {
            String json = readStream(in);
            JSONObject o = new JSONObject(json);
            return o.optString("manifestUrl", "").trim();
        }
    }

    private static String readStream(InputStream in) throws Exception {
        BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = r.readLine()) != null) sb.append(line);
        return sb.toString();
    }

    private static String httpGet(String urlStr) {
        HttpURLConnection c = null;
        try {
            URL u = new URL(urlStr);
            c = (HttpURLConnection) u.openConnection();
            c.setConnectTimeout(15000);
            c.setReadTimeout(15000);
            c.setRequestMethod("GET");
            c.setRequestProperty("Accept", "application/json");
            int code = c.getResponseCode();
            if (code != 200) {
                Log.w(TAG, "HTTP " + code + " al leer manifest");
                return null;
            }
            try (InputStream in = c.getInputStream()) {
                return readStream(in);
            }
        } catch (Exception e) {
            Log.w(TAG, "Error HTTP manifest: " + e.getMessage());
            return null;
        } finally {
            if (c != null) c.disconnect();
        }
    }
}
