package com.leavera.pedidosmg;

import android.Manifest;
import android.app.Activity;
import android.app.DownloadManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ComponentName;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.DocumentsContract;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import java.io.File;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.io.OutputStream;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

import com.leavera.pedidosmg.work.PedidoPollingScheduler;

public class MainActivity extends AppCompatActivity {

    private static final String NOTIF_CHANNEL_ID = "pmg_pedidos_avisos";
    private static final int NOTIF_CHANNEL_IMPORTANCE = NotificationManager.IMPORTANCE_HIGH;

    private WebView webView;

    private ValueCallback<Uri[]> filePathCallback;
    private Uri cameraImageUri;
    private static final int RC_FILE_CHOOSER = 1001;
    private String pendingPedidoIdIntent;

    private final ActivityResultLauncher<String[]> permissionLauncher =
            registerForActivityResult(
                    new ActivityResultContracts.RequestMultiplePermissions(),
                    results -> {
                        boolean allOk = true;
                        for (boolean granted : results.values()) {
                            if (!granted) { allOk = false; break; }
                        }
                        if (!allOk) {
                            Toast.makeText(this,
                                    "Algunos permisos no fueron concedidos.",
                                    Toast.LENGTH_LONG).show();
                        }
                    }
            );

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // NO usar WindowCompat.setDecorFitsSystemWindows — eso requiere
        // gestión manual de insets y conflicta con fitsSystemWindows del XML.
        // El activity_main.xml con fitsSystemWindows="true" maneja todo.
        setContentView(R.layout.activity_main);

        crearCanalNotificacionesPedidos();

        webView = findViewById(R.id.webview);
        capturePedidoIdFromIntent(getIntent());
        configurarWebView();
        pedirPermisos();
        iniciarNetworkWatchdog();
        PedidoPollingScheduler.schedule(this);
        AppUpdateChecker.checkAsync(this);
    }

    private void crearCanalNotificacionesPedidos() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel ch = new NotificationChannel(
                NOTIF_CHANNEL_ID,
                "Avisos de pedidos",
                NOTIF_CHANNEL_IMPORTANCE);
        ch.setDescription("Cuando un administrador te envía un pedido al mapa");
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.createNotificationChannel(ch);
    }

    private void configurarWebView() {
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);
        s.setGeolocationEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setCacheMode(WebSettings.LOAD_CACHE_ELSE_NETWORK);
        s.setSupportZoom(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setUserAgentString(
                s.getUserAgentString().replace("wv", "")
                        + " PedidosMG/" + BuildConfig.VERSION_NAME
        );

        webView.addJavascriptInterface(new AndroidPrintBridge(), "AndroidPrint");
        webView.addJavascriptInterface(new LocalNotifyBridge(), "AndroidLocalNotify");
        webView.addJavascriptInterface(new AndroidConfigBridge(), "AndroidConfig");
        webView.addJavascriptInterface(new AndroidDeviceBridge(), "AndroidDevice");

        webView.setWebChromeClient(new WebChromeClient() {

            @Override
            public void onGeolocationPermissionsShowPrompt(
                    String origin, GeolocationPermissions.Callback callback) {
                callback.invoke(origin, true, false);
            }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                request.grant(request.getResources());
            }

            @Override
            public boolean onShowFileChooser(
                    WebView wv,
                    ValueCallback<Uri[]> callback,
                    FileChooserParams params) {

                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;

                Intent galleryIntent = new Intent(Intent.ACTION_GET_CONTENT);
                galleryIntent.setType("image/*");
                galleryIntent.addCategory(Intent.CATEGORY_OPENABLE);

                Intent cameraIntent = crearIntentCamara();

                Intent chooser = Intent.createChooser(galleryIntent, "Seleccionar foto");
                if (cameraIntent != null) {
                    chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS,
                            new Intent[]{ cameraIntent });
                }
                startActivityForResult(chooser, RC_FILE_CHOOSER);
                return true;
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                view.loadUrl(url);
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                dispatchPendingPedidoIdToWeb();
            }
        });

        webView.loadUrl("file:///android_asset/index.html");
    }

    private void iniciarNetworkWatchdog() {
        Intent i = new Intent(this, NetworkWatchdogService.class);
        ContextCompat.startForegroundService(this, i);
    }

    private void detenerNetworkWatchdog() {
        stopService(new Intent(this, NetworkWatchdogService.class));
    }

    private Intent crearIntentCamara() {
        try {
            String ts = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault())
                    .format(new Date());
            File storageDir = getExternalFilesDir(Environment.DIRECTORY_PICTURES);
            if (storageDir == null) storageDir = getFilesDir();
            File foto = File.createTempFile("FOTO_" + ts + "_", ".jpg", storageDir);
            cameraImageUri = FileProvider.getUriForFile(
                    this, getPackageName() + ".fileprovider", foto);
            Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            intent.putExtra(MediaStore.EXTRA_OUTPUT, cameraImageUri);
            return intent;
        } catch (Exception e) {
            cameraImageUri = null;
            return null;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != RC_FILE_CHOOSER) return;
        if (filePathCallback == null) return;

        Uri[] uris = null;
        if (resultCode == Activity.RESULT_OK) {
            if (data == null || data.getData() == null) {
                if (cameraImageUri != null) uris = new Uri[]{ cameraImageUri };
            } else if (data.getClipData() != null) {
                int count = data.getClipData().getItemCount();
                uris = new Uri[count];
                for (int i = 0; i < count; i++)
                    uris[i] = data.getClipData().getItemAt(i).getUri();
            } else {
                uris = new Uri[]{ data.getData() };
            }
        }
        filePathCallback.onReceiveValue(uris);
        filePathCallback = null;
        cameraImageUri = null;
    }

    private void pedirPermisos() {
        List<String> necesarios = new ArrayList<>();
        necesarios.add(Manifest.permission.CAMERA);
        necesarios.add(Manifest.permission.ACCESS_FINE_LOCATION);
        necesarios.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            necesarios.add(Manifest.permission.READ_MEDIA_IMAGES);
            necesarios.add(Manifest.permission.POST_NOTIFICATIONS);
        } else {
            necesarios.add(Manifest.permission.READ_EXTERNAL_STORAGE);
        }
        List<String> faltantes = new ArrayList<>();
        for (String p : necesarios) {
            if (ContextCompat.checkSelfPermission(this, p)
                    != PackageManager.PERMISSION_GRANTED)
                faltantes.add(p);
        }
        if (!faltantes.isEmpty())
            permissionLauncher.launch(faltantes.toArray(new String[0]));
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.evaluateJavascript(
                    "if(typeof window.pollNotificacionesMovil==='function')window.pollNotificacionesMovil()",
                    null);
            dispatchPendingPedidoIdToWeb();
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        capturePedidoIdFromIntent(intent);
        dispatchPendingPedidoIdToWeb();
    }

    @Override
    protected void onDestroy() {
        if (isFinishing() && !isChangingConfigurations()) {
            detenerNetworkWatchdog();
        }
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    /** Expone impresión del WebView a JavaScript (window.AndroidPrint.printWebContent). */
    private class AndroidPrintBridge {
        @JavascriptInterface
        public void printWebContent() {
            runOnUiThread(() -> {
                if (webView == null) return;
                PrintManager pm = (PrintManager) getSystemService(PRINT_SERVICE);
                if (pm == null) {
                    Toast.makeText(MainActivity.this,
                            "Impresión no disponible en este dispositivo.",
                            Toast.LENGTH_SHORT).show();
                    return;
                }
                String jobName = "Pedido MG";
                PrintDocumentAdapter adapter = webView.createPrintDocumentAdapter(jobName);
                pm.print(jobName, adapter, new PrintAttributes.Builder().build());
            });
        }
    }

    /**
     * Llamado desde JS cuando hay filas nuevas en notificaciones_movil (Neon).
     */
    private class LocalNotifyBridge {
        @JavascriptInterface
        public void show(String rowId, String title, String body, String pedidoId) {
            final String safeTitle = title != null ? title : "Pedidos MG";
            final String safeBody = body != null ? body : "";
            runOnUiThread(() -> mostrarNotificacionPedido(rowId, safeTitle, safeBody, pedidoId));
        }
    }

    /** Expone lectura de assets/config.json y versión de la app a JavaScript para WebView file:// */
    private class AndroidConfigBridge {
        @JavascriptInterface
        public String getConfigJson() {
            try (InputStream in = getAssets().open("config.json")) {
                ByteArrayOutputStream bos = new ByteArrayOutputStream();
                byte[] buffer = new byte[4096];
                int n;
                while ((n = in.read(buffer)) != -1) bos.write(buffer, 0, n);
                return bos.toString(StandardCharsets.UTF_8.name());
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public String getAppVersion() {
            return com.leavera.pedidosmg.BuildConfig.VERSION_NAME;
        }

        @JavascriptInterface
        public int getVersionCode() {
            return com.leavera.pedidosmg.BuildConfig.VERSION_CODE;
        }
    }

    /** Utilidades nativas para WebView (copiar/exportar). */
    private class AndroidDeviceBridge {
        @JavascriptInterface
        public void copyText(String text) {
            try {
                ClipboardManager cm = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                if (cm == null) return;
                ClipData clip = ClipData.newPlainText("PedidosMG", text != null ? text : "");
                cm.setPrimaryClip(clip);
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "Copiado al portapapeles", Toast.LENGTH_SHORT).show());
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "No se pudo copiar", Toast.LENGTH_SHORT).show());
            }
        }

        @JavascriptInterface
        public boolean saveBase64File(String fileName, String mimeType, String base64Data) {
            try {
                String safeName = (fileName == null || fileName.trim().isEmpty()) ? "archivo" : fileName.trim();
                String mime = (mimeType == null || mimeType.trim().isEmpty()) ? "application/octet-stream" : mimeType.trim();
                String b64 = base64Data == null ? "" : base64Data.trim();
                int comma = b64.indexOf(',');
                if (comma >= 0) b64 = b64.substring(comma + 1);
                if (b64.isEmpty()) return false;
                byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
                Uri uri = saveToDownloads(safeName, mime, bytes);
                if (uri == null) return false;
                notifyExportSaved(uri, mime, safeName);
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "Archivo guardado en Descargas", Toast.LENGTH_LONG).show());
                return true;
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "No se pudo guardar el archivo", Toast.LENGTH_LONG).show());
                return false;
            }
        }

        /** Abre la carpeta Descargas/PedidosMG en el gestor de archivos del sistema (API 24+). */
        @JavascriptInterface
        public void openExportsFolder() {
            runOnUiThread(() -> {
                File dir = new File(Environment.getExternalStoragePublicDirectory(
                        Environment.DIRECTORY_DOWNLOADS), "PedidosMG");
                if (!dir.exists()) {
                    dir.mkdirs();
                }
                String absPath = dir.getAbsolutePath();
                if (openExportsFolderTryAll(dir)) {
                    return;
                }
                copyFolderPathToClipboard(absPath);
                Toast.makeText(MainActivity.this,
                        getString(R.string.open_downloads_fallback_clipboard, absPath),
                        Toast.LENGTH_LONG).show();
            });
        }
    }

    private static final String STORAGE_AUTHORITY = "com.android.externalstorage.documents";
    private static final String DOC_PEDIDOSMG = "primary:Download/PedidosMG";
    private static final String DOC_DOWNLOAD = "primary:Download";

    /**
     * Abre Descargas/PedidosMG probando varias rutas: FileProvider (más fiable en Android 11+),
     * UI de documentos del sistema, árbol SAF y pantalla de Descargas.
     */
    private boolean openExportsFolderTryAll(File dir) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return false;

        if (tryLaunchDirectoryViaFileProvider(dir)) return true;

        Uri uriPedidos = DocumentsContract.buildDocumentUri(STORAGE_AUTHORITY, DOC_PEDIDOSMG);
        Uri uriDownload = DocumentsContract.buildDocumentUri(STORAGE_AUTHORITY, DOC_DOWNLOAD);

        if (tryLaunchDirectoryDocumentsUiExplicit(uriPedidos)) return true;
        if (tryLaunchDirectoryView(uriPedidos)) return true;
        if (tryLaunchDirectoryWithPackage(uriPedidos, "com.google.android.apps.nbu.files")) return true;

        if (tryLaunchTreeFolder(STORAGE_AUTHORITY, DOC_PEDIDOSMG)) return true;
        if (tryLaunchTreeFolder(STORAGE_AUTHORITY, DOC_DOWNLOAD)) return true;

        if (tryLaunchDirectoryView(Uri.parse(
                "content://com.android.externalstorage.documents/document/primary%3ADownload%2FPedidosMG"))) return true;
        if (tryLaunchDirectoryView(Uri.parse(
                "content://com.android.externalstorage.documents/document/primary%3ADownload"))) return true;

        if (tryLaunchDirectoryDocumentsUiExplicit(uriDownload)) return true;
        if (tryLaunchDirectoryView(uriDownload)) return true;
        if (tryLaunchDirectoryWithPackage(uriDownload, "com.google.android.apps.nbu.files")) return true;

        if (tryLaunchDirectoryWithOemPackages(uriPedidos)) return true;

        if (tryLaunchSystemDownloadsUi()) {
            Toast.makeText(this, R.string.open_downloads_hint_pedidosmg_folder, Toast.LENGTH_LONG).show();
            return true;
        }
        return false;
    }

    /** URI content:// de esta app: muchos gestores abren la carpeta con permiso explícito. */
    private boolean tryLaunchDirectoryViaFileProvider(File dir) {
        try {
            if (!dir.exists() && !dir.mkdirs()) return false;
            if (!dir.isDirectory()) return false;
            Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", dir);
            int flags = Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                flags |= Intent.FLAG_GRANT_PREFIX_URI_PERMISSION;
            }
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(uri, DocumentsContract.Document.MIME_TYPE_DIR);
                intent.addFlags(flags);
                startActivity(intent);
                return true;
            } catch (Exception ignored) {
                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setData(uri);
                intent.addFlags(flags);
                startActivity(intent);
                return true;
            }
        } catch (Exception e) {
            return false;
        }
    }

    /** Abre la actividad “Archivos” de AOSP con la URI concreta (varía el nombre de clase según versión). */
    private boolean tryLaunchDirectoryDocumentsUiExplicit(Uri uri) {
        if (uri == null) return false;
        String[][] components = new String[][]{
                {"com.google.android.documentsui", "com.android.documentsui.files.FilesActivity"},
                {"com.android.documentsui", "com.android.documentsui.files.FilesActivity"},
                {"com.google.android.documentsui", "com.android.documentsui.FilesActivity"},
        };
        int flags = Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            flags |= Intent.FLAG_GRANT_PREFIX_URI_PERMISSION;
        }
        for (String[] pair : components) {
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setComponent(new ComponentName(pair[0], pair[1]));
                intent.setDataAndType(uri, DocumentsContract.Document.MIME_TYPE_DIR);
                intent.addFlags(flags);
                startActivity(intent);
                return true;
            } catch (Exception ignored) {
            }
        }
        return false;
    }

    private boolean tryLaunchTreeFolder(String authority, String treeDocumentId) {
        if (authority == null || treeDocumentId == null) return false;
        try {
            Uri treeUri = DocumentsContract.buildTreeDocumentUri(authority, treeDocumentId);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(treeUri, DocumentsContract.Document.MIME_TYPE_DIR);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                intent.addFlags(Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
            }
            startActivity(intent);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /** Pantalla nativa “Descargas” (al menos entra a Descargas; el usuario abre PedidosMG). */
    private boolean tryLaunchSystemDownloadsUi() {
        try {
            Intent intent = new Intent(DownloadManager.ACTION_VIEW_DOWNLOADS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private boolean tryLaunchDirectoryWithOemPackages(Uri uri) {
        if (uri == null) return false;
        String[] pkgs = {
                "com.sec.android.app.myfiles",
                "com.mi.android.globalFileexplorer",
        };
        for (String pkg : pkgs) {
            if (tryLaunchDirectoryWithPackage(uri, pkg)) return true;
        }
        return false;
    }

    private boolean tryLaunchDirectoryView(Uri uri) {
        if (uri == null) return false;
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, DocumentsContract.Document.MIME_TYPE_DIR);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            intent.addFlags(Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        }
        try {
            startActivity(intent);
            return true;
        } catch (Exception e) {
            try {
                Intent chooser = Intent.createChooser(intent, getString(R.string.open_downloads_chooser));
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(chooser);
                return true;
            } catch (Exception e2) {
                return false;
            }
        }
    }

    private boolean tryLaunchDirectoryWithPackage(Uri uri, String packageName) {
        if (uri == null || packageName == null) return false;
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setPackage(packageName);
            intent.setDataAndType(uri, DocumentsContract.Document.MIME_TYPE_DIR);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                intent.addFlags(Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
            }
            startActivity(intent);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private void copyFolderPathToClipboard(String path) {
        try {
            ClipboardManager cm = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
            if (cm == null) return;
            cm.setPrimaryClip(ClipData.newPlainText("PedidosMG", path));
        } catch (Exception ignored) {}
    }

    private void mostrarNotificacionPedido(String rowId, String title, String body, String pedidoId) {
        Intent open = new Intent(this, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        open.putExtra("pedidoId", pedidoId != null ? pedidoId : "");
        int req = 0;
        try {
            req = (int) (Long.parseLong(rowId) % Integer.MAX_VALUE);
        } catch (NumberFormatException e) {
            req = (rowId != null ? rowId.hashCode() : 0) & 0x7fffffff;
        }
        PendingIntent pi = PendingIntent.getActivity(
                this,
                req,
                open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder b = new NotificationCompat.Builder(this, NOTIF_CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_launcher_foreground)
                .setContentTitle(title)
                .setContentText(body.length() > 200 ? body.substring(0, 197) + "…" : body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(pi);

        try {
            NotificationManagerCompat.from(this).notify(req, b.build());
        } catch (SecurityException e) {
            Toast.makeText(this, "Activá notificaciones para Pedidos MG en Ajustes.", Toast.LENGTH_LONG).show();
        }
    }

    private void capturePedidoIdFromIntent(Intent intent) {
        if (intent == null) return;
        String pid = intent.getStringExtra("pedidoId");
        if (pid == null || pid.trim().isEmpty()) {
            pid = extractPedidoIdFromUri(intent.getData());
        }
        if (pid == null) return;
        pid = pid.trim();
        if (!pid.isEmpty()) pendingPedidoIdIntent = pid;
    }

    private String extractPedidoIdFromUri(Uri data) {
        if (data == null) return null;
        try {
            String qp = data.getQueryParameter("pedidoId");
            if (qp != null && !qp.trim().isEmpty()) return qp.trim();
        } catch (Exception ignored) {}
        try {
            String qp2 = data.getQueryParameter("id");
            if (qp2 != null && !qp2.trim().isEmpty()) return qp2.trim();
        } catch (Exception ignored) {}
        try {
            if ("pedido".equalsIgnoreCase(data.getHost())) {
                String last = data.getLastPathSegment();
                if (last != null && !last.trim().isEmpty()) return last.trim();
            }
        } catch (Exception ignored) {}
        return null;
    }

    private void dispatchPendingPedidoIdToWeb() {
        if (webView == null || pendingPedidoIdIntent == null || pendingPedidoIdIntent.isEmpty()) return;
        String jsPid = pendingPedidoIdIntent.replace("\\", "\\\\").replace("'", "\\'");
        String js =
                "if(typeof window.handleAndroidIntentPedidoId==='function'){" +
                        "window.handleAndroidIntentPedidoId('" + jsPid + "');" +
                        "}";
        webView.evaluateJavascript(js, null);
        pendingPedidoIdIntent = null;
    }

    private Uri saveToDownloads(String fileName, String mimeType, byte[] bytes) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
                values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
                values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/PedidosMG");
                values.put(MediaStore.MediaColumns.IS_PENDING, 1);
                Uri collection = MediaStore.Downloads.EXTERNAL_CONTENT_URI;
                Uri uri = getContentResolver().insert(collection, values);
                if (uri == null) return null;
                try (OutputStream os = getContentResolver().openOutputStream(uri)) {
                    if (os == null) return null;
                    os.write(bytes);
                }
                values.clear();
                values.put(MediaStore.MediaColumns.IS_PENDING, 0);
                getContentResolver().update(uri, values, null, null);
                return uri;
            }

            File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "PedidosMG");
            if (!dir.exists() && !dir.mkdirs()) return null;
            File out = new File(dir, fileName);
            try (FileOutputStream fos = new FileOutputStream(out)) {
                fos.write(bytes);
            }
            MediaScannerConnection.scanFile(
                    this,
                    new String[]{out.getAbsolutePath()},
                    new String[]{mimeType},
                    null
            );
            return FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", out);
        } catch (Exception e) {
            return null;
        }
    }

    private void notifyExportSaved(Uri uri, String mimeType, String fileName) {
        Intent open = new Intent(Intent.ACTION_VIEW);
        open.setDataAndType(uri, mimeType);
        open.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent pi = PendingIntent.getActivity(
                this,
                (int) (System.currentTimeMillis() % Integer.MAX_VALUE),
                Intent.createChooser(open, "Abrir archivo"),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, NOTIF_CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_launcher_foreground)
                .setContentTitle("Archivo exportado")
                .setContentText(fileName)
                .setStyle(new NotificationCompat.BigTextStyle().bigText("Archivo guardado en Descargas: " + fileName))
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setAutoCancel(true)
                .setContentIntent(pi);
        try {
            NotificationManagerCompat.from(this).notify((int) (System.currentTimeMillis() % Integer.MAX_VALUE), b.build());
        } catch (SecurityException ignored) {}
    }
}
