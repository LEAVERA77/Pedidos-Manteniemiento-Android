package com.gestornova.gestion;

import android.content.DialogInterface;
import android.content.Intent;
import android.content.SharedPreferences;
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
    private static final String PREFS = AppUpdateDownloadHelper.PREFS;
    private static final String KEY_SNOOZED_REMOTE = "update_snoozed_remote_code";
    private static final String KEY_SNOOZED_UNTIL_MS = "update_snoozed_until_ms";

    private static AlertDialog sActiveUpdateDialog;

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
            if (manifestUrl == null || manifestUrl.isEmpty()) {
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
            String remoteNameRaw = remote.optString("versionName", remote.optString("version_name", ""));
            final String remoteName =
                    remoteNameRaw.isEmpty() ? ("v" + remoteCode) : remoteNameRaw;
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
                clearSnoozeIfInstalled(activity, (int) current);
                return;
            }

            if (!forceUpdate && isSnoozedForRemote(activity, remoteCode)) {
                Log.d(TAG, "Actualización pospuesta por el usuario (misma versión remota): " + remoteCode);
                return;
            }

            Log.i(TAG, "Actualización disponible (" + source + "): " + current + " -> " + remoteCode);

            String title = forceUpdate
                    ? activity.getString(R.string.update_dialog_title_forced)
                    : activity.getString(R.string.update_dialog_title);
            String msg = forceUpdate
                    ? activity.getString(R.string.update_dialog_message_forced, remoteName)
                            + (notes != null && !notes.isEmpty() ? "\n\n" + notes : "")
                    : buildMessage(activity, remoteName, notes);

            activity.runOnUiThread(() -> showDialog(activity, title, msg, apkUrl, forceUpdate, remoteCode, remoteName));
        } catch (PackageManager.NameNotFoundException e) {
            Log.e(TAG, "Package?", e);
        } catch (Exception e) {
            Log.w(TAG, "applyIfNewer: " + e.getMessage());
        }
    }

    private static boolean isSnoozedForRemote(AppCompatActivity activity, int remoteCode) {
        SharedPreferences sp = activity.getSharedPreferences(PREFS, AppCompatActivity.MODE_PRIVATE);
        int sn = sp.getInt(KEY_SNOOZED_REMOTE, -1);
        long until = sp.getLong(KEY_SNOOZED_UNTIL_MS, 0L);
        return sn == remoteCode && System.currentTimeMillis() < until;
    }

    private static void clearSnoozeIfInstalled(AppCompatActivity activity, int currentLocalCode) {
        try {
            SharedPreferences sp = activity.getSharedPreferences(PREFS, AppCompatActivity.MODE_PRIVATE);
            int sn = sp.getInt(KEY_SNOOZED_REMOTE, -1);
            if (sn > 0 && currentLocalCode >= sn) {
                sp.edit().remove(KEY_SNOOZED_REMOTE).remove(KEY_SNOOZED_UNTIL_MS).apply();
            }
        } catch (Exception ignored) {
        }
    }

    private static void showDialog(
            AppCompatActivity activity,
            String title,
            String msg,
            String apkUrl,
            boolean forceUpdate,
            int remoteCode,
            String remoteName) {
        if (activity.isFinishing() || activity.isDestroyed()) return;
        try {
            if (sActiveUpdateDialog != null && sActiveUpdateDialog.isShowing()) {
                return;
            }
        } catch (Exception ignored) {
        }

        AlertDialog.Builder b = new AlertDialog.Builder(activity)
                .setTitle(title)
                .setMessage(msg)
                .setPositiveButton(R.string.update_dialog_download, (DialogInterface dialog, int which) -> {
                    try {
                        dialog.dismiss();
                    } catch (Exception ignored) {
                    }
                    sActiveUpdateDialog = null;
                    try {
                        activity.getSharedPreferences(PREFS, AppCompatActivity.MODE_PRIVATE)
                                .edit()
                                .remove(KEY_SNOOZED_REMOTE)
                                .remove(KEY_SNOOZED_UNTIL_MS)
                                .apply();
                    } catch (Exception ignored) {
                    }
                    AppUpdateDownloadHelper.enqueueApkDownload(activity, apkUrl, remoteName, remoteCode);
                });
        if (!forceUpdate) {
            b.setNegativeButton(R.string.update_dialog_later, (DialogInterface dialog, int which) -> {
                try {
                    dialog.dismiss();
                } catch (Exception ignored) {
                }
                sActiveUpdateDialog = null;
                long until = System.currentTimeMillis() + 12L * 60L * 60L * 1000L;
                try {
                    activity.getSharedPreferences(PREFS, AppCompatActivity.MODE_PRIVATE)
                            .edit()
                            .putInt(KEY_SNOOZED_REMOTE, remoteCode)
                            .putLong(KEY_SNOOZED_UNTIL_MS, until)
                            .apply();
                } catch (Exception ignored) {
                }
            });
        }
        AlertDialog dialog = b.create();
        if (forceUpdate) {
            dialog.setCancelable(false);
            dialog.setCanceledOnTouchOutside(false);
        }
        dialog.setOnDismissListener(d -> sActiveUpdateDialog = null);
        sActiveUpdateDialog = dialog;
        dialog.show();
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
