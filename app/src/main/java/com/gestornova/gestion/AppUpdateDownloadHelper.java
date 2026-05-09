package com.gestornova.gestion;

import android.app.DownloadManager;
import android.content.Context;
import android.net.Uri;
import android.os.Environment;
import android.util.Log;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

import java.io.File;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Descarga APK (p. ej. Google Drive) con {@link DownloadManager} hacia el almacenamiento
 * privado de la app y dispara instalación al completarse (vía receiver en {@link MainActivity}).
 */
public final class AppUpdateDownloadHelper {

    private static final String TAG = "AppUpdateDl";
    static final String PREFS = "gn_app_update_prefs";
    static final String KEY_PENDING_DOWNLOAD_ID = "pending_apk_download_id";
    static final String KEY_PENDING_FILE_NAME = "pending_apk_file_name";

    private static final Pattern DRIVE_ID = Pattern.compile("[?&]id=([^&]+)");

    private AppUpdateDownloadHelper() {}

    /**
     * URL de Drive tipo {@code /uc?export=download&id=…} a veces devuelve HTML de confirmación;
     * usercontent + {@code confirm=t} suele funcionar mejor con DownloadManager.
     */
    public static String normalizeApkDownloadUrl(String apkUrl) {
        if (apkUrl == null) return "";
        String u = apkUrl.trim();
        if (u.isEmpty()) return u;
        if (u.contains("drive.google.com") && u.contains("export=download")) {
            Matcher m = DRIVE_ID.matcher(u);
            if (m.find()) {
                String id = m.group(1);
                if (id != null && !id.isEmpty()) {
                    return "https://drive.usercontent.google.com/download?id="
                            + id
                            + "&export=download&confirm=t";
                }
            }
        }
        return u;
    }

    public static void enqueueApkDownload(AppCompatActivity activity, String apkUrl, String versionName, int remoteCode) {
        if (activity == null || activity.isFinishing()) return;
        String url = normalizeApkDownloadUrl(apkUrl);
        if (url.isEmpty()) {
            Toast.makeText(activity, "URL de APK vacía.", Toast.LENGTH_LONG).show();
            return;
        }
        String vn = versionName != null ? versionName : ("v" + remoteCode);
        String safe = "GestorNova-" + vn.replaceAll("[^0-9a-zA-Z.\\-]", "_") + ".apk";

        File base = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (base == null) {
            base = activity.getExternalFilesDir(null);
        }
        if (base != null && !base.exists()) {
            try {
                base.mkdirs();
            } catch (Exception ignored) {
            }
        }
        File out = base != null ? new File(base, safe) : null;
        if (out != null && out.exists()) {
            try {
                if (!out.delete()) {
                    Log.w(TAG, "No se pudo borrar APK previa: " + out.getAbsolutePath());
                }
            } catch (Exception e) {
                Log.w(TAG, e.getMessage());
            }
        }

        try {
            DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
            req.setAllowedNetworkTypes(
                    DownloadManager.Request.NETWORK_WIFI | DownloadManager.Request.NETWORK_MOBILE);
            req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            req.setTitle("GestorNova " + vn);
            req.setDescription("Actualización " + remoteCode);
            req.setMimeType("application/vnd.android.package-archive");
            req.setDestinationInExternalFilesDir(activity, Environment.DIRECTORY_DOWNLOADS, safe);

            DownloadManager dm = (DownloadManager) activity.getSystemService(Context.DOWNLOAD_SERVICE);
            if (dm == null) {
                Toast.makeText(activity, "DownloadManager no disponible.", Toast.LENGTH_LONG).show();
                return;
            }
            long id = dm.enqueue(req);
            activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit()
                    .putLong(KEY_PENDING_DOWNLOAD_ID, id)
                    .putString(KEY_PENDING_FILE_NAME, safe)
                    .apply();
            Toast.makeText(
                            activity,
                            "Descargando actualización… Al terminar se abrirá el instalador.",
                            Toast.LENGTH_LONG)
                    .show();
        } catch (Exception e) {
            Log.e(TAG, "enqueue", e);
            Toast.makeText(activity, "No se pudo iniciar la descarga: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }
}
