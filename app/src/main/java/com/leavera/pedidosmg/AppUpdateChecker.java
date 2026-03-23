package com.leavera.pedidosmg;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

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
 * Lee {@code assets/app_update_config.json} (campo {@code manifestUrl}), descarga un JSON
 * con {@code versionCode} y {@code apkUrl} y, si hay versión más nueva, muestra diálogo.
 */
public final class AppUpdateChecker {

    private static final String TAG = "AppUpdateChecker";
    private static final String ASSET_CONFIG = "app_update_config.json";

    private AppUpdateChecker() {}

    public static void checkAsync(AppCompatActivity activity) {
        new Thread(() -> doCheck(activity), "pmg-app-update").start();
    }

    private static void doCheck(AppCompatActivity activity) {
        try {
            String manifestUrl = readManifestUrlFromAssets(activity);
            if (manifestUrl == null || manifestUrl.isEmpty()) {
                Log.d(TAG, "Sin manifestUrl en assets/" + ASSET_CONFIG + " — omitiendo");
                return;
            }

            String body = httpGet(manifestUrl);
            if (body == null) return;

            JSONObject remote = new JSONObject(body);
            int remoteCode = remote.optInt("versionCode", 0);
            String remoteName = remote.optString("versionName", "");
            if (remoteName.isEmpty()) remoteName = "v" + remoteCode;
            String apkUrl = remote.optString("apkUrl", "");
            String notes = remote.optString("releaseNotes", "");
            boolean forceUpdate = remote.optBoolean("forceUpdate", false);

            if (remoteCode <= 0 || apkUrl.isEmpty()) {
                Log.w(TAG, "Manifest remoto incompleto (versionCode/apkUrl)");
                return;
            }

            PackageInfo pi = activity.getPackageManager()
                    .getPackageInfo(activity.getPackageName(), 0);
            long current = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                    ? pi.getLongVersionCode()
                    : pi.versionCode;

            if (remoteCode <= current) return;

            String title = activity.getString(R.string.update_dialog_title);
            String msg = buildMessage(activity, remoteName, notes);

            activity.runOnUiThread(() -> {
                if (activity.isFinishing() || activity.isDestroyed()) return;
                AlertDialog.Builder b = new AlertDialog.Builder(activity)
                        .setTitle(title)
                        .setMessage(msg)
                        .setPositiveButton(R.string.update_dialog_download, (d, w) -> {
                            try {
                                activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(apkUrl)));
                            } catch (Exception e) {
                                Log.e(TAG, "No se pudo abrir apkUrl", e);
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
            });
        } catch (PackageManager.NameNotFoundException e) {
            Log.e(TAG, "Package?", e);
        } catch (Exception e) {
            Log.w(TAG, "Comprobación de actualización omitida: " + e.getMessage());
        }
    }

    private static String buildMessage(AppCompatActivity activity, String remoteName, String notes) {
        String base = activity.getString(R.string.update_dialog_message, remoteName);
        if (notes != null && !notes.isEmpty()) {
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
