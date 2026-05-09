package com.gestornova.gestion;

import android.content.DialogInterface;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
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
 * Comprueba actualizaciones: primero {@code version.json} en GitHub (APK firmada), si falla manifest en
 * assets, y la tabla Neon sigue existiendo para la web — en Android el JS puede omitir la consulta Neon.
 */
public final class AppUpdateChecker {

    private static final String TAG = "AppUpdateChecker";
    /** JSON en la rama default del repo Android (actualizar versionCode/apkUrl al publicar release). */
    private static final String GITHUB_VERSION_JSON =
            "https://raw.githubusercontent.com/LEAVERA77/Pedidos-Manteniemiento-Android/main/app/version.json";

    private static final String ASSET_CONFIG = "app_update_config.json";
    private static final String PREFS = AppUpdateDownloadHelper.PREFS;
    private static final String KEY_SNOOZED_REMOTE = "update_snoozed_remote_code";
    private static final String KEY_SNOOZED_UNTIL_MS = "update_snoozed_until_ms";

    /** Hay actualización remota conocida (re-mostrar tras logout / reinicio). */
    private static final String KEY_UPDATE_PENDING = "gn_update_pending";

    private static final String KEY_UPDATE_PENDING_RC = "gn_update_pending_rc";
    /** El usuario eligió no instalar esta versión remota hasta que salga otra mayor. */
    private static final String KEY_UPDATE_SKIPPED_RC = "gn_update_skipped_remote_vc";

    /** «Más tarde» en GitHub: snooze corto para poder ver el aviso de nuevo pronto (p. ej. tras cerrar sesión). */
    private static final long GITHUB_LATER_SNOOZE_MS = 120_000L;

    /** Evita carreras entre hilo Neon y hilo manifest. */
    private static final Object APPLY_LOCK = new Object();

    private static AlertDialog sActiveUpdateDialog;

    private AppUpdateChecker() {}

    public static void checkAsync(AppCompatActivity activity) {
        new Thread(
                () -> {
                    if (!tryApplyFromGitHub(activity)) {
                        doCheckFromManifest(activity);
                    }
                },
                "gn-app-update")
                .start();
    }

    /**
     * Llamado desde JS con datos de {@code app_version} en Neon. Si GitHub responde con {@code version.json}
     * válido, se usa ese origen y se ignora el JSON de Neon (la tabla sigue en la BD para admin/PWA).
     */
    public static void checkWithRemoteJson(AppCompatActivity activity, String jsonBody) {
        if (activity == null || jsonBody == null || jsonBody.trim().isEmpty()) return;
        new Thread(
                () -> {
                    try {
                        if (tryApplyFromGitHub(activity)) {
                            return;
                        }
                        JSONObject remote = new JSONObject(jsonBody.trim());
                        applyIfNewer(activity, remote, "neon-db");
                    } catch (Exception e) {
                        Log.w(TAG, "JSON Neon inválido: " + e.getMessage());
                        doCheckFromManifest(activity);
                    }
                },
                "gn-app-update-neon")
                .start();
    }

    /**
     * @return {@code true} si se obtuvo y parseó {@code version.json} de GitHub (aunque no haya update);
     *         {@code false} para seguir con Neon o manifest.
     */
    private static boolean tryApplyFromGitHub(AppCompatActivity activity) {
        if (activity == null) return false;
        try {
            /* Evita JSON en caché (CDN/proxy) cuando subís versionCode nuevo. */
            String url = GITHUB_VERSION_JSON + "?t=" + System.currentTimeMillis();
            String body = httpGet(url, 5000, 5000);
            if (body == null || body.trim().isEmpty()) {
                return false;
            }
            JSONObject remote = new JSONObject(body.trim());
            int rc = remote.optInt("versionCode", remote.optInt("version_code", 0));
            String apk = remote.optString("apkUrl", remote.optString("apk_url", "")).trim();
            if (rc <= 0 || apk.isEmpty()) {
                Log.w(TAG, "version.json GitHub incompleto (versionCode/apkUrl)");
                return false;
            }
            applyIfNewer(activity, remote, "github");
            return true;
        } catch (Exception e) {
            Log.w(TAG, "GitHub version.json omitido: " + e.getMessage());
            return false;
        }
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

    private static void dismissStaleUpdateDialog() {
        try {
            if (sActiveUpdateDialog != null) {
                try {
                    sActiveUpdateDialog.dismiss();
                } catch (Exception ignored) {
                }
            }
        } catch (Exception ignored) {
        } finally {
            sActiveUpdateDialog = null;
        }
    }

    private static void applySnooze(AppCompatActivity activity, int remoteCode, long durationMs) {
        if (remoteCode <= 0 || activity == null) return;
        long until = System.currentTimeMillis() + durationMs;
        try {
            activity.getSharedPreferences(PREFS, AppCompatActivity.MODE_PRIVATE)
                    .edit()
                    .putInt(KEY_SNOOZED_REMOTE, remoteCode)
                    .putLong(KEY_SNOOZED_UNTIL_MS, until)
                    .apply();
        } catch (Exception ignored) {
        }
    }

    private static void clearSnooze(AppCompatActivity activity) {
        if (activity == null) return;
        try {
            activity.getSharedPreferences(PREFS, AppCompatActivity.MODE_PRIVATE)
                    .edit()
                    .remove(KEY_SNOOZED_REMOTE)
                    .remove(KEY_SNOOZED_UNTIL_MS)
                    .apply();
        } catch (Exception ignored) {
        }
    }

    /**
     * Tras abrir el instalador del sistema, evita que el chequeo remoto vuelva a mostrar el cartel al instante
     * (la app sigue en versionCode viejo hasta que el usuario complete la instalación).
     */
    public static void snoozeAfterOpeningInstaller(AppCompatActivity activity, int remoteCode) {
        applySnooze(activity, remoteCode, 48L * 60L * 60L * 1000L);
    }

    private static void applyIfNewer(AppCompatActivity activity, JSONObject remote, String source) {
        int remoteCode;
        String remoteName;
        String apkUrl;
        String notes;
        boolean forceUpdate;
        try {
            synchronized (APPLY_LOCK) {
                int rc = remote.optInt("versionCode", remote.optInt("version_code", 0));
                String remoteNameRaw = remote.optString("versionName", remote.optString("version_name", ""));
                String rn = remoteNameRaw.isEmpty() ? ("v" + rc) : remoteNameRaw;
                String apk = remote.optString("apkUrl", remote.optString("apk_url", ""));
                String nt =
                        remote.optString(
                                "releaseNotes",
                                remote.optString("release_notes", remote.optString("changeLog", "")));
                boolean fu = remote.optBoolean("forceUpdate", remote.optBoolean("force_update", false));

                if (rc <= 0 || apk.isEmpty()) {
                    Log.w(TAG, "Manifest incompleto (" + source + "): versionCode/apkUrl");
                    return;
                }

                SharedPreferences sp = activity.getSharedPreferences(PREFS, AppCompatActivity.MODE_PRIVATE);
                int skipped = sp.getInt(KEY_UPDATE_SKIPPED_RC, -1);
                if (skipped == rc) {
                    Log.d(TAG, "Versión remota omitida por el usuario: " + rc + " (" + source + ")");
                    return;
                }

                PackageInfo pi = activity.getPackageManager()
                        .getPackageInfo(activity.getPackageName(), 0);
                long cur = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                        ? pi.getLongVersionCode()
                        : pi.versionCode;

                if (rc <= cur) {
                    Log.d(TAG, "Sin actualización (" + source + "): local=" + cur + " remoto=" + rc);
                    clearSnoozeIfInstalled(activity, (int) cur);
                    clearOfferStateIfUpgraded(activity, (int) cur);
                    return;
                }

                if (!fu && isSnoozedForRemote(activity, rc)) {
                    Log.d(TAG, "Actualización pospuesta por el usuario (misma versión remota): " + rc);
                    return;
                }

                if (AppUpdateDownloadHelper.shouldSuppressUpdateDialog(activity)) {
                    Log.d(TAG, "Diálogo omitido: descarga OTA en curso o pendiente de instalación.");
                    return;
                }

                Log.i(TAG, "Actualización disponible (" + source + "): " + cur + " -> " + rc);
                remoteCode = rc;
                remoteName = rn;
                apkUrl = apk;
                notes = nt;
                forceUpdate = fu;
                markUpdateOfferPending(activity, rc);
            }
        } catch (PackageManager.NameNotFoundException e) {
            Log.e(TAG, "Package?", e);
            return;
        } catch (Exception e) {
            Log.w(TAG, "applyIfNewer: " + e.getMessage());
            return;
        }

        String title = forceUpdate
                ? activity.getString(R.string.update_dialog_title_forced)
                : activity.getString(R.string.update_dialog_title);
        String msg = forceUpdate
                ? activity.getString(R.string.update_dialog_message_forced, remoteName)
                        + (notes != null && !notes.isEmpty() ? "\n\n" + notes : "")
                : buildMessage(activity, remoteName, notes);

        final int rcFinal = remoteCode;
        final String rnFinal = remoteName;
        final String apkFinal = apkUrl;
        final boolean fuFinal = forceUpdate;
        final String titleFinal = title;
        final String msgFinal = msg;
        final String sourceFinal = source;
        activity.runOnUiThread(
                () ->
                        showDialog(
                                activity, titleFinal, msgFinal, apkFinal, fuFinal, rcFinal, rnFinal, sourceFinal));
    }

    private static void markUpdateOfferPending(AppCompatActivity activity, int remoteCode) {
        if (activity == null || remoteCode <= 0) return;
        try {
            activity.getSharedPreferences(PREFS, AppCompatActivity.MODE_PRIVATE)
                    .edit()
                    .putBoolean(KEY_UPDATE_PENDING, true)
                    .putInt(KEY_UPDATE_PENDING_RC, remoteCode)
                    .apply();
        } catch (Exception ignored) {
        }
    }

    private static void clearOfferStateIfUpgraded(AppCompatActivity activity, int currentLocalCode) {
        if (activity == null) return;
        try {
            SharedPreferences sp = activity.getSharedPreferences(PREFS, AppCompatActivity.MODE_PRIVATE);
            int pendingRc = sp.getInt(KEY_UPDATE_PENDING_RC, -1);
            int skipped = sp.getInt(KEY_UPDATE_SKIPPED_RC, -1);
            SharedPreferences.Editor ed = sp.edit();
            if (pendingRc > 0 && currentLocalCode >= pendingRc) {
                ed.remove(KEY_UPDATE_PENDING).remove(KEY_UPDATE_PENDING_RC);
            }
            if (skipped > 0 && currentLocalCode >= skipped) {
                ed.remove(KEY_UPDATE_SKIPPED_RC);
            }
            ed.apply();
        } catch (Exception ignored) {
        }
    }

    static void skipThisRemoteVersion(AppCompatActivity activity, int remoteCode) {
        if (activity == null || remoteCode <= 0) return;
        try {
            activity.getSharedPreferences(PREFS, AppCompatActivity.MODE_PRIVATE)
                    .edit()
                    .putInt(KEY_UPDATE_SKIPPED_RC, remoteCode)
                    .remove(KEY_UPDATE_PENDING)
                    .remove(KEY_UPDATE_PENDING_RC)
                    .remove(KEY_SNOOZED_REMOTE)
                    .remove(KEY_SNOOZED_UNTIL_MS)
                    .apply();
        } catch (Exception ignored) {
        }
    }

    private static void applyLaterSnooze(AppCompatActivity activity, int remoteCode, String source) {
        long ms =
                "github".equals(source)
                        ? GITHUB_LATER_SNOOZE_MS
                        : 24L * 60L * 60L * 1000L;
        applySnooze(activity, remoteCode, ms);
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
            String remoteName,
            String source) {
        if (activity.isFinishing() || activity.isDestroyed()) return;

        /* Si quedó un diálogo colgado o hubo varias comprobaciones, cerrar el anterior antes de mostrar otro. */
        dismissStaleUpdateDialog();

        final int[] outcome = new int[] {0};

        AlertDialog.Builder b = new AlertDialog.Builder(activity)
                .setTitle(title)
                .setMessage(msg)
                .setPositiveButton(R.string.update_dialog_download, (DialogInterface dialog, int which) -> {
                    outcome[0] = 1;
                    try {
                        dialog.dismiss();
                    } catch (Exception ignored) {
                    }
                    sActiveUpdateDialog = null;
                    clearSnooze(activity);
                    try {
                        activity.getSharedPreferences(PREFS, AppCompatActivity.MODE_PRIVATE)
                                .edit()
                                .putBoolean(KEY_UPDATE_PENDING, false)
                                .apply();
                    } catch (Exception ignored) {
                    }
                    AppUpdateDownloadHelper.enqueueApkDownload(activity, apkUrl, remoteName, remoteCode);
                });
        /* Siempre ofrecer posponer: evita diálogo “atrapado” si force_update quedó en true en Neon. */
        b.setNegativeButton(R.string.update_dialog_later, (DialogInterface dialog, int which) -> {
            outcome[0] = 2;
            try {
                dialog.dismiss();
            } catch (Exception ignored) {
            }
            sActiveUpdateDialog = null;
            applyLaterSnooze(activity, remoteCode, source);
        });
        if (!forceUpdate) {
            b.setNeutralButton(
                    R.string.update_dialog_skip_version,
                    (DialogInterface dialog, int which) -> {
                        outcome[0] = 3;
                        try {
                            dialog.dismiss();
                        } catch (Exception ignored) {
                        }
                        sActiveUpdateDialog = null;
                        skipThisRemoteVersion(activity, remoteCode);
                    });
        }

        AlertDialog dialog = b.create();
        dialog.setCancelable(true);
        dialog.setCanceledOnTouchOutside(true);
        dialog.setOnDismissListener(
                d -> {
                    sActiveUpdateDialog = null;
                    if (outcome[0] == 0 && remoteCode > 0) {
                        applyLaterSnooze(activity, remoteCode, source);
                    }
                });
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
        return httpGet(urlStr, 15000, 15000);
    }

    private static String httpGet(String urlStr, int connectTimeoutMs, int readTimeoutMs) {
        HttpURLConnection c = null;
        try {
            URL u = new URL(urlStr);
            c = (HttpURLConnection) u.openConnection();
            c.setConnectTimeout(Math.max(1000, connectTimeoutMs));
            c.setReadTimeout(Math.max(1000, readTimeoutMs));
            c.setRequestMethod("GET");
            c.setRequestProperty("Accept", "application/json");
            c.setRequestProperty("Cache-Control", "no-cache");
            c.setRequestProperty("Pragma", "no-cache");
            int code = c.getResponseCode();
            if (code != 200) {
                Log.w(TAG, "HTTP " + code + " al leer " + urlStr);
                return null;
            }
            try (InputStream in = c.getInputStream()) {
                return readStream(in);
            }
        } catch (Exception e) {
            Log.w(TAG, "Error HTTP GET: " + e.getMessage());
            return null;
        } finally {
            if (c != null) c.disconnect();
        }
    }
}
