package com.gestornova.gestion;

import android.app.DownloadManager;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
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
    /** version_code remoto asociado a la descarga en curso (snooze tras abrir instalador). */
    static final String KEY_PENDING_REMOTE_CODE = "pending_apk_remote_code";
    static final String KEY_PENDING_DEST_PUBLIC = "pending_apk_dest_public";

    private static final Pattern DRIVE_ID = Pattern.compile("[?&]id=([^&]+)");

    /**
     * Nombre fijo bajo {@code Download/} público (mejor visibilidad en Samsung / “Descargas” del sistema).
     * Si el sistema no permite destino público, se usa el directorio privado de la app.
     */
    public static final String PUBLIC_UPDATE_APK_NAME = "GestorNova-update.apk";

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

    /**
     * No volver a mostrar el cartel de actualización mientras haya una descarga en curso o recién terminada
     * que aún estamos procesando (evita bucle Neon ↔ diálogo).
     */
    public static boolean shouldSuppressUpdateDialog(Context ctx) {
        android.content.SharedPreferences sp =
                ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        long pendingId = sp.getLong(KEY_PENDING_DOWNLOAD_ID, -1L);
        if (pendingId < 0L) {
            return false;
        }
        DownloadManager dm = (DownloadManager) ctx.getSystemService(Context.DOWNLOAD_SERVICE);
        if (dm == null) {
            sp.edit()
                    .remove(KEY_PENDING_DOWNLOAD_ID)
                    .remove(KEY_PENDING_FILE_NAME)
                    .remove(KEY_PENDING_REMOTE_CODE)
                    .remove(KEY_PENDING_DEST_PUBLIC)
                    .apply();
            return false;
        }
        DownloadManager.Query q = new DownloadManager.Query();
        q.setFilterById(pendingId);
        try (Cursor c = dm.query(q)) {
            if (c == null || !c.moveToFirst()) {
                sp.edit()
                        .remove(KEY_PENDING_DOWNLOAD_ID)
                        .remove(KEY_PENDING_FILE_NAME)
                        .remove(KEY_PENDING_REMOTE_CODE)
                        .remove(KEY_PENDING_DEST_PUBLIC)
                        .apply();
                return false;
            }
            int st = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
            if (st == DownloadManager.STATUS_PENDING
                    || st == DownloadManager.STATUS_RUNNING
                    || st == DownloadManager.STATUS_PAUSED) {
                return true;
            }
            if (st == DownloadManager.STATUS_SUCCESSFUL) {
                /* Hasta que {@link MainActivity} termine de abrir el instalador y limpie el pending. */
                return true;
            }
            sp.edit()
                    .remove(KEY_PENDING_DOWNLOAD_ID)
                    .remove(KEY_PENDING_FILE_NAME)
                    .remove(KEY_PENDING_REMOTE_CODE)
                    .remove(KEY_PENDING_DEST_PUBLIC)
                    .apply();
            return false;
        } catch (Exception e) {
            Log.w(TAG, "shouldSuppressUpdateDialog", e);
            return false;
        }
    }

    public static void clearPendingDownloadState(Context ctx) {
        try {
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit()
                    .remove(KEY_PENDING_DOWNLOAD_ID)
                    .remove(KEY_PENDING_FILE_NAME)
                    .remove(KEY_PENDING_REMOTE_CODE)
                    .remove(KEY_PENDING_DEST_PUBLIC)
                    .apply();
        } catch (Exception ignored) {
        }
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

        try {
            File pub = new File(
                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                    PUBLIC_UPDATE_APK_NAME);
            if (pub.exists()) {
                try {
                    if (!pub.delete()) {
                        Log.w(TAG, "No se pudo borrar APK previa en Download público");
                    }
                } catch (Exception e) {
                    Log.w(TAG, e.getMessage());
                }
            }
        } catch (Exception ignored) {
        }
        File basePriv = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (basePriv == null) {
            basePriv = activity.getExternalFilesDir(null);
        }
        if (basePriv != null && !basePriv.exists()) {
            try {
                basePriv.mkdirs();
            } catch (Exception ignored) {
            }
        }
        if (basePriv != null) {
            File prev = new File(basePriv, safe);
            if (prev.exists()) {
                try {
                    if (!prev.delete()) {
                        Log.w(TAG, "No se pudo borrar APK previa en almacén de la app");
                    }
                } catch (Exception e) {
                    Log.w(TAG, e.getMessage());
                }
            }
        }

        try {
            DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
            req.setAllowedNetworkTypes(
                    DownloadManager.Request.NETWORK_WIFI | DownloadManager.Request.NETWORK_MOBILE);
            /* Progreso en barra de notificaciones + entrada en app “Descargas” del sistema (Samsung). */
            req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE);
            req.setTitle("GestorNova " + vn);
            req.setDescription("Descargando " + vn + " — mirá el aviso de progreso; tocá al finalizar para analizar/instalar.");
            req.setMimeType("application/vnd.android.package-archive");
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.HONEYCOMB) {
                try {
                    req.setVisibleInDownloadsUi(true);
                } catch (Exception ignored) {
                }
            }
            boolean destPublic = false;
            try {
                req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, PUBLIC_UPDATE_APK_NAME);
                destPublic = true;
                Log.d(TAG, "Descarga OTA → Download/" + PUBLIC_UPDATE_APK_NAME);
            } catch (Throwable t) {
                Log.w(TAG, "Destino público no disponible, usando almacén de la app", t);
            }
            if (!destPublic) {
                req.setDestinationInExternalFilesDir(activity, Environment.DIRECTORY_DOWNLOADS, safe);
            }

            DownloadManager dm = (DownloadManager) activity.getSystemService(Context.DOWNLOAD_SERVICE);
            if (dm == null) {
                Toast.makeText(activity, "DownloadManager no disponible.", Toast.LENGTH_LONG).show();
                return;
            }
            long id = dm.enqueue(req);
            activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit()
                    .putLong(KEY_PENDING_DOWNLOAD_ID, id)
                    .putString(KEY_PENDING_FILE_NAME, destPublic ? PUBLIC_UPDATE_APK_NAME : safe)
                    .putBoolean(KEY_PENDING_DEST_PUBLIC, destPublic)
                    .putInt(KEY_PENDING_REMOTE_CODE, remoteCode)
                    .apply();
            Toast.makeText(
                            activity,
                            "Descargando actualización… Mirá la notificación arriba; tocála al terminar "
                                    + "para abrir el instalador (Samsung puede analizar el APK antes). "
                                    + "Si no aparece, abrí «Descargas» del sistema.",
                            Toast.LENGTH_LONG)
                    .show();
        } catch (Exception e) {
            Log.e(TAG, "enqueue", e);
            Toast.makeText(activity, "No se pudo iniciar la descarga: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }
}
