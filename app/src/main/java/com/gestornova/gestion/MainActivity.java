package com.gestornova.gestion;

import android.Manifest;
import android.app.Activity;
import android.app.DownloadManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.DocumentsContract;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;
import android.location.Location;
import android.location.LocationManager;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.Toast;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import androidx.work.Constraints;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;

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

import org.json.JSONObject;

import com.gestornova.gestion.work.NotificacionesMovilPollWorker;
import com.gestornova.gestion.work.NotificacionesMovilPollingScheduler;
import com.gestornova.gestion.work.PedidoPollingScheduler;
import com.gestornova.gestion.work.UbicacionPollingScheduler;
import com.gestornova.gestion.work.UbicacionWorker;

public class MainActivity extends AppCompatActivity {

    private static final String TAG = "MainActivity";
    private static final String NOTIF_CHANNEL_ID = "pmg_pedidos_avisos";
    private static final int NOTIF_CHANNEL_IMPORTANCE = NotificationManager.IMPORTANCE_HIGH;
    /** Caché local de ubicación central (mapa principal + mapa dedicado HTML). */
    private static final String PREFS_UBICACION_CENTRAL = "gestornova_ubicacion_central";
    private static final String KEY_UBI_JSON = "cached_json";

    private WebView webView;
    /** Capa nativa encima del WebView hasta el primer {@code onPageFinished} del documento; sin temporizador fijo. */
    private LinearLayout splashOverlay;
    private boolean nativeSplashDismissed;

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

        splashOverlay = findViewById(R.id.splash_overlay);
        nativeSplashDismissed = false;

        webView = findViewById(R.id.webview);
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        // Render por software en emulador ralentiza mucho el mapa; usar composición por defecto (GPU).
        // Si un AVD concreto cierra el WebView por GLES, descomenta temporalmente:
        // if (isProbablyEmulator()) webView.setLayerType(WebView.LAYER_TYPE_SOFTWARE, null);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // Prioridad alta mientras la app está visible (mejor fluidez en AVD / dispositivos lentos).
            webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, true);
        }
        capturePedidoIdFromIntent(getIntent());
        configurarWebView();
        pedirPermisos();
        // Aplazar servicios pesados: en AVDs con poca RAM (p. ej. 1536 MB) el pico al abrir evita OOM.
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            if (isFinishing() || isDestroyed()) return;
            iniciarNetworkWatchdog();
            PedidoPollingScheduler.schedule(this);
            NotificacionesMovilPollingScheduler.schedule(this);
            UbicacionPollingScheduler.schedule(this);
            AppUpdateChecker.checkAsync(this);
        }, 800);
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

    /**
     * Oculta el splash nativo la primera vez que el WebView notifica carga completa del documento.
     * Sin temporizador fijo; ignora {@code onPageFinished} posteriores (p. ej. navegación en SPA).
     */
    private void dismissNativeSplashOnce() {
        if (nativeSplashDismissed) {
            return;
        }
        nativeSplashDismissed = true;
        if (splashOverlay == null) {
            return;
        }
        splashOverlay.animate()
                .alpha(0f)
                .setDuration(180)
                .withEndAction(() -> {
                    splashOverlay.setVisibility(View.GONE);
                    splashOverlay.setAlpha(1f);
                    splashOverlay.setClickable(false);
                    splashOverlay.setFocusable(false);
                });
    }

    private static boolean isProbablyEmulator() {
        String fp = Build.FINGERPRINT != null ? Build.FINGERPRINT : "";
        String model = Build.MODEL != null ? Build.MODEL : "";
        String prod = Build.PRODUCT != null ? Build.PRODUCT : "";
        String hw = Build.HARDWARE != null ? Build.HARDWARE : "";
        return fp.startsWith("generic")
                || fp.startsWith("unknown")
                || model.toLowerCase(Locale.US).contains("emulator")
                || model.contains("google_sdk")
                || prod.contains("sdk_gphone")
                || prod.contains("emulator")
                || hw.contains("goldfish")
                || hw.contains("ranchu");
    }

    private void configurarWebView() {
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        // Evita que el sistema escale texto dentro del WebView (botones redondos / barra).
        s.setTextZoom(100);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);
        s.setGeolocationEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        // DEFAULT respeta Cache-Control de GitHub Pages; pull-to-refresh no está en WebView estándar.
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            // Menos presión de memoria raster previa al viewport (mapa Leaflet / tiles).
            s.setOffscreenPreRaster(false);
        }
        s.setUserAgentString(
                s.getUserAgentString().replace("wv", "")
                        + " GestorNova/" + BuildConfig.VERSION_NAME
                        + " Nexxo/" + BuildConfig.VERSION_NAME
        );

        webView.setVerticalScrollBarEnabled(true);
        webView.setHorizontalScrollBarEnabled(false);

        webView.addJavascriptInterface(new AndroidPrintBridge(), "AndroidPrint");
        webView.addJavascriptInterface(new LocalNotifyBridge(), "AndroidLocalNotify");
        webView.addJavascriptInterface(new AndroidConfigBridge(), "AndroidConfig");
        webView.addJavascriptInterface(new AndroidMapLocationBridge(), "AndroidInterface");
        webView.addJavascriptInterface(new AndroidSessionBridge(), "AndroidSession");
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
            public boolean onConsoleMessage(ConsoleMessage message) {
                String line = "JS " + message.messageLevel() + ": " + message.message()
                        + " @ " + message.sourceId() + ":" + message.lineNumber();
                switch (message.messageLevel()) {
                    case ERROR:
                        Log.e(TAG, line);
                        break;
                    case WARNING:
                        Log.w(TAG, line);
                        break;
                    default:
                        Log.i(TAG, line);
                        break;
                }
                return true;
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
            /**
             * Deprecado: en algunos WebView de dispositivos físicos (p. ej. Samsung) este callback se dispara
             * también para teselas del mapa, scripts CDN, etc. Si llamamos a {@link #handleWebViewUrl} aquí,
             * esos hosts no coinciden con GitHub Pages y se abre el navegador externo → mapa gris y sin API.
             * minSdk es 24: siempre existe {@link #shouldOverrideUrlLoading(WebView, WebResourceRequest)} con
             * {@code isForMainFrame} para distinguir documento principal vs subrecursos.
             */
            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return false;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // Solo el documento principal: si se devuelve true para tiles/XHR, el mapa queda gris (release WebView).
                if (request != null && !request.isForMainFrame()) {
                    return false;
                }
                return handleWebViewUrl(request != null ? request.getUrl() : null);
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
                if (request != null && request.isForMainFrame() && errorResponse != null) {
                    Log.w(TAG, "WebView HTTP " + errorResponse.getStatusCode() + " " + request.getUrl());
                }
                super.onReceivedHttpError(view, request, errorResponse);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                        && request != null && request.isForMainFrame() && error != null) {
                    Log.w(TAG, "WebView error: " + error.getErrorCode() + " " + error.getDescription());
                }
                super.onReceivedError(view, request, error);
            }

            @Override
            @SuppressWarnings("deprecation")
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
                    Log.w(TAG, "WebView error: " + errorCode + " " + description + " url=" + failingUrl);
                }
                super.onReceivedError(view, errorCode, description, failingUrl);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                dismissNativeSplashOnce();
                dispatchPendingPedidoIdToWeb();
                maybeInjectUbicacionCentralJs(url);
            }
        });

        webView.loadUrl(BuildConfig.WEB_APP_URL);
    }

    /**
     * Solo se carga el origen de {@link BuildConfig#WEB_APP_URL}; otros enlaces abren en el navegador
     * para no exponer los puentes JS a orígenes ajenos.
     * Debug con {@code file:///android_asset/...}: toda navegación bajo {@code /android_asset/} queda en el WebView.
     */
    private boolean handleWebViewUrl(Uri uri) {
        if (uri == null) {
            return false;
        }
        String scheme = uri.getScheme();
        if (scheme == null) return false;
        if ("javascript".equalsIgnoreCase(scheme)) return false;
        if ("about".equalsIgnoreCase(scheme)) return false;
        if ("data".equalsIgnoreCase(scheme) || "blob".equalsIgnoreCase(scheme)) return false;

        Uri base = Uri.parse(BuildConfig.WEB_APP_URL);
        if ("file".equalsIgnoreCase(scheme)) {
            String path = uri.getPath();
            if (path != null && path.startsWith("/android_asset/")) {
                return false;
            }
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (Exception e) {
                Toast.makeText(this, "No se pudo abrir el enlace", Toast.LENGTH_SHORT).show();
            }
            return true;
        }

        String allowedHost = base.getHost();
        String host = uri.getHost();
        if (allowedHost != null && host != null && host.equalsIgnoreCase(allowedHost)) {
            return false;
        }
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (Exception e) {
            Toast.makeText(this, "No se pudo abrir el enlace", Toast.LENGTH_SHORT).show();
        }
        return true;
    }

    /** Inyecta ubicación cacheada en la página del mapa dedicado (misma sesión WebView). */
    private void maybeInjectUbicacionCentralJs(String url) {
        if (url == null || !url.contains("mapa-ubicacion-central") || webView == null) {
            return;
        }
        try {
            String raw = getSharedPreferences(PREFS_UBICACION_CENTRAL, MODE_PRIVATE)
                    .getString(KEY_UBI_JSON, "");
            if (raw == null || raw.isEmpty()) {
                return;
            }
            JSONObject o = new JSONObject(raw);
            double la = o.optDouble("lat", Double.NaN);
            double lo = o.optDouble("lng", Double.NaN);
            if (!Double.isFinite(la) || !Double.isFinite(lo)) {
                return;
            }
            int zoom = o.optInt("zoom", 13);
            String nom = o.optString("nombre", "");
            String js = String.format(Locale.US,
                    "try{window.setUbicacionCentralFromAndroid&&window.setUbicacionCentralFromAndroid(%f,%f,%d,%s);}catch(e){}",
                    la, lo, zoom, JSONObject.quote(nom));
            webView.evaluateJavascript(js, null);
        } catch (Exception e) {
            Log.w(TAG, "maybeInjectUbicacionCentralJs", e);
        }
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
            Log.w(TAG, "crearIntentCamara", e);
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
    protected void onPause() {
        if (webView != null) {
            webView.onPause();
        }
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        AppUpdateChecker.checkAsync(this);
        Constraints netConstraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();
        OneTimeWorkRequest drainNotif = new OneTimeWorkRequest.Builder(NotificacionesMovilPollWorker.class)
                .setConstraints(netConstraints)
                .build();
        WorkManager.getInstance(this).enqueueUniqueWork(
                "notificaciones_movil_drain_on_resume",
                ExistingWorkPolicy.REPLACE,
                drainNotif);
        OneTimeWorkRequest drainUbic = new OneTimeWorkRequest.Builder(UbicacionWorker.class)
                .setConstraints(netConstraints)
                .build();
        WorkManager.getInstance(this).enqueueUniqueWork(
                "ubicacion_tecnico_push_on_resume",
                ExistingWorkPolicy.REPLACE,
                drainUbic);
        if (webView != null) {
            webView.onResume();
            webView.evaluateJavascript(
                    "if(typeof window.pollNotificacionesMovil==='function')window.pollNotificacionesMovil()",
                    null);
            webView.evaluateJavascript(
                    "if(typeof window.gnSincronizarPedidosDesdeAndroid==='function')window.gnSincronizarPedidosDesdeAndroid()",
                    null);
            webView.evaluateJavascript(
                    "(function(){ try { if (typeof sincronizarTenantOperativoDesdeMiConfiguracionApi==='function') void sincronizarTenantOperativoDesdeMiConfiguracionApi({ silent: true }); } catch(e) {} })();",
                    null);
            /* Segundo intento: el WebView a veces aún no rehidrató `app.u` en el primer frame tras onResume. */
            final WebView wvResume = webView;
            wvResume.postDelayed(() -> {
                try {
                    wvResume.evaluateJavascript(
                            "(function(){ try { if (typeof sincronizarTenantOperativoDesdeMiConfiguracionApi==='function') void sincronizarTenantOperativoDesdeMiConfiguracionApi({ silent: true }); } catch(e) {} })();",
                            null);
                } catch (Exception ignored) {
                }
            }, 750);
            webView.evaluateJavascript(
                    "(function(){ try { if (typeof notificarNeonConectadoParaUpdateCheck === 'function') notificarNeonConectadoParaUpdateCheck(); } catch(e) {} })();",
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
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        if (webView == null) {
            return;
        }
        webView.post(() -> {
            try {
                webView.requestLayout();
                android.view.View parent = (android.view.View) webView.getParent();
                if (parent != null) {
                    parent.requestLayout();
                }
            } catch (Exception ignored) {
            }
            webView.evaluateJavascript(
                    "(function(){try{if(typeof window.__pmgNotifyViewportResize==='function')"
                            + "window.__pmgNotifyViewportResize();"
                            + "else window.dispatchEvent(new Event('resize'));}catch(e){}})();",
                    null
            );
        });
    }

    @Override
    protected void onDestroy() {
        if (isFinishing() && !isChangingConfigurations()) {
            detenerNetworkWatchdog();
        }
        destroyWebViewSafely();
        super.onDestroy();
    }

    /** Libera el WebView para evitar fugas y cierres al salir de la actividad. */
    private void destroyWebViewSafely() {
        if (webView == null) return;
        try {
            webView.stopLoading();
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            android.view.ViewGroup parent = (android.view.ViewGroup) webView.getParent();
            if (parent != null) {
                parent.removeView(webView);
            }
            webView.destroy();
        } catch (Exception e) {
            Log.w(TAG, "destroyWebViewSafely", e);
        } finally {
            webView = null;
        }
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
                String jobName = "GestorNova";
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
            final String safeTitle = title != null ? title : "GestorNova";
            final String safeBody = body != null ? body : "";
            runOnUiThread(() -> mostrarNotificacionPedido(rowId, safeTitle, safeBody, pedidoId));
        }
    }

    /** Guarda id de usuario y rol para WorkManager (ubicación técnico en Neon). */
    private class AndroidSessionBridge {
        @JavascriptInterface
        public void setUser(int userId, String rol) {
            getSharedPreferences(UbicacionWorker.PREFS_SESSION, Context.MODE_PRIVATE).edit()
                    .putInt(UbicacionWorker.KEY_USER_ID, userId)
                    .putString(UbicacionWorker.KEY_ROL, rol != null ? rol : "")
                    .apply();
        }

        /** Persiste el tenant activo (misma sesión que {@link #setUser}) cuando cambia en la web admin. */
        @JavascriptInterface
        public void setTenantId(int tenantId) {
            if (tenantId < 1) return;
            getSharedPreferences(UbicacionWorker.PREFS_SESSION, Context.MODE_PRIVATE).edit()
                    .putInt(UbicacionWorker.KEY_TENANT_ID, tenantId)
                    .apply();
        }

        @JavascriptInterface
        public void clearUser() {
            getSharedPreferences(UbicacionWorker.PREFS_SESSION, Context.MODE_PRIVATE).edit().clear().apply();
        }
    }

    /** Expone lectura de assets/config.json y versión de la app a JavaScript (HTML remoto o file://). */
    private class AndroidConfigBridge {
        @JavascriptInterface
        public String getConfigJson() {
            try {
                if (webView != null) {
                    String current = webView.getUrl();
                    // Con HTTPS (ej. GitHub Pages) el config válido está en el sitio; assets suelen ser plantilla.
                    if (current != null && !current.startsWith("file:")) {
                        return "";
                    }
                }
            } catch (Exception ignored) {
            }
            try (InputStream in = getAssets().open("config.json")) {
                ByteArrayOutputStream bos = new ByteArrayOutputStream();
                byte[] buffer = new byte[4096];
                int n;
                while ((n = in.read(buffer)) != -1) bos.write(buffer, 0, n);
                return bos.toString(StandardCharsets.UTF_8.name());
            } catch (Exception e) {
                Log.w(TAG, "getConfigJson: no se pudo leer assets/config.json", e);
                return "";
            }
        }

        @JavascriptInterface
        public String getAppVersion() {
            return BuildConfig.VERSION_NAME;
        }

        @JavascriptInterface
        public int getVersionCode() {
            return BuildConfig.VERSION_CODE;
        }

        /** Llamado desde JS cuando el WebView conecta a Neon — dispara verificación de actualización. */
        @JavascriptInterface
        public void requestUpdateCheck() {
            runOnUiThread(() -> AppUpdateChecker.checkAsync(MainActivity.this));
        }

        /**
         * JSON desde tabla app_version en Neon (misma forma que el manifest HTTP).
         * Si falla el parse, se intenta el manifest.
         */
        @JavascriptInterface
        public void applyUpdateCheckFromNeon(String json) {
            AppUpdateChecker.checkWithRemoteJson(MainActivity.this, json);
        }

        /** JSON { lat, lng, zoom, nombre } guardado al confirmar en mapa-ubicacion-central o vía bridge. */
        @JavascriptInterface
        public String getUbicacionCentralCachedJson() {
            try {
                return getSharedPreferences(PREFS_UBICACION_CENTRAL, MODE_PRIVATE)
                        .getString(KEY_UBI_JSON, "");
            } catch (Exception e) {
                return "";
            }
        }
    }

    /**
     * Mapa dedicado (mapa-ubicacion-central.html): confirma punto y persiste en SharedPreferences.
     */
    private class AndroidMapLocationBridge {
        @JavascriptInterface
        public void setLocation(double lat, double lng, String address) {
            try {
                JSONObject o = new JSONObject();
                o.put("lat", lat);
                o.put("lng", lng);
                o.put("zoom", 15);
                o.put("nombre", address != null ? address : "");
                getSharedPreferences(PREFS_UBICACION_CENTRAL, MODE_PRIVATE)
                        .edit()
                        .putString(KEY_UBI_JSON, o.toString())
                        .apply();
                runOnUiThread(() -> Toast.makeText(MainActivity.this,
                        "Ubicación guardada en el dispositivo",
                        Toast.LENGTH_SHORT).show());
            } catch (Exception e) {
                Log.w(TAG, "AndroidInterface.setLocation", e);
            }
        }
    }

    /** Utilidades nativas para WebView (copiar/exportar). */
    private class AndroidDeviceBridge {
        @JavascriptInterface
        public void copyText(String text) {
            try {
                ClipboardManager cm = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                if (cm == null) return;
                ClipData clip = ClipData.newPlainText("GestorNova", text != null ? text : "");
                cm.setPrimaryClip(clip);
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "Copiado al portapapeles", Toast.LENGTH_SHORT).show());
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "No se pudo copiar", Toast.LENGTH_SHORT).show());
            }
        }

        /** AVD / emulador: el mapa puede no recibir bien la rueda; el front usa zoom alternativo (Leaflet). */
        @JavascriptInterface
        public boolean isEmulator() {
            return isProbablyEmulator();
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
                Log.e(TAG, "saveBase64File", e);
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "No se pudo guardar el archivo", Toast.LENGTH_LONG).show());
                return false;
            }
        }

        /**
         * GPS para geocerca (Haversine validado en API). Llama en el hilo UI a {@code callback(json)}.
         * json: ok, lat, lng, accuracy | error (sin_permiso_ubicacion, sin_ubicacion, exception).
         */
        @JavascriptInterface
        public void getCurrentLocationForGeocerca(String jsCallback) {
            final String cb = jsCallback != null ? jsCallback.trim() : "";
            runOnUiThread(() -> {
                if (webView == null || cb.isEmpty()) return;
                if (!cb.matches("^[a-zA-Z0-9_.]+$")) return;
                if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.ACCESS_FINE_LOCATION)
                        != PackageManager.PERMISSION_GRANTED) {
                    webView.evaluateJavascript(cb + "({\"ok\":false,\"error\":\"sin_permiso_ubicacion\"})", null);
                    return;
                }
                try {
                    LocationManager lm = (LocationManager) getSystemService(LOCATION_SERVICE);
                    Location best = null;
                    if (lm != null) {
                        for (String p : new String[]{LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER}) {
                            try {
                                Location l = lm.getLastKnownLocation(p);
                                if (l != null && (best == null || l.getTime() > best.getTime())) {
                                    best = l;
                                }
                            } catch (SecurityException ignored) {
                            }
                        }
                    }
                    if (best == null) {
                        webView.evaluateJavascript(cb + "({\"ok\":false,\"error\":\"sin_ubicacion\"})", null);
                        return;
                    }
                    JSONObject o = new JSONObject();
                    o.put("ok", true);
                    o.put("lat", best.getLatitude());
                    o.put("lng", best.getLongitude());
                    o.put("accuracy", best.hasAccuracy() ? best.getAccuracy() : JSONObject.NULL);
                    webView.evaluateJavascript(cb + "(" + o.toString() + ")", null);
                } catch (Exception e) {
                    Log.w(TAG, "getCurrentLocationForGeocerca", e);
                    webView.evaluateJavascript(cb + "({\"ok\":false,\"error\":\"exception\"})", null);
                }
            });
        }

        /** Abre la carpeta Descargas/GestorNova en el gestor de archivos del sistema (API 24+). */
        @JavascriptInterface
        public void openExportsFolder() {
            runOnUiThread(() -> {
                File dir = new File(Environment.getExternalStoragePublicDirectory(
                        Environment.DIRECTORY_DOWNLOADS), "GestorNova");
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
    private static final String DOC_EXPORTS = "primary:Download/GestorNova";
    private static final String DOC_DOWNLOAD = "primary:Download";

    /**
     * Abre Descargas/GestorNova probando varias rutas: FileProvider (más fiable en Android 11+),
     * UI de documentos del sistema, árbol SAF y pantalla de Descargas.
     */
    private boolean openExportsFolderTryAll(File dir) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return false;

        if (tryLaunchDirectoryViaFileProvider(dir)) return true;

        Uri uriPedidos = DocumentsContract.buildDocumentUri(STORAGE_AUTHORITY, DOC_EXPORTS);
        Uri uriDownload = DocumentsContract.buildDocumentUri(STORAGE_AUTHORITY, DOC_DOWNLOAD);

        if (tryLaunchDirectoryDocumentsUiExplicit(uriPedidos)) return true;
        if (tryLaunchDirectoryView(uriPedidos)) return true;
        if (tryLaunchDirectoryWithPackage(uriPedidos, "com.google.android.apps.nbu.files")) return true;

        if (tryLaunchTreeFolder(STORAGE_AUTHORITY, DOC_EXPORTS)) return true;
        if (tryLaunchTreeFolder(STORAGE_AUTHORITY, DOC_DOWNLOAD)) return true;

        if (tryLaunchDirectoryView(Uri.parse(
                "content://com.android.externalstorage.documents/document/primary%3ADownload%2FGestorNova"))) return true;
        if (tryLaunchDirectoryView(Uri.parse(
                "content://com.android.externalstorage.documents/document/primary%3ADownload"))) return true;

        if (tryLaunchDirectoryDocumentsUiExplicit(uriDownload)) return true;
        if (tryLaunchDirectoryView(uriDownload)) return true;
        if (tryLaunchDirectoryWithPackage(uriDownload, "com.google.android.apps.nbu.files")) return true;

        if (tryLaunchDirectoryWithOemPackages(uriPedidos)) return true;

        if (tryLaunchSystemDownloadsUi()) {
            Toast.makeText(this, R.string.open_downloads_hint_exports_folder, Toast.LENGTH_LONG).show();
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

    /** Pantalla nativa “Descargas” (al menos entra a Descargas; el usuario abre GestorNova). */
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
            cm.setPrimaryClip(ClipData.newPlainText("GestorNova", path));
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
            Toast.makeText(this, "Activá notificaciones para GestorNova en Ajustes.", Toast.LENGTH_LONG).show();
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
        for (String key : new String[]{"pedidoId", "id", "p"}) {
            try {
                String qp = data.getQueryParameter(key);
                if (qp != null && !qp.trim().isEmpty()) return qp.trim();
            } catch (Exception ignored) {}
        }
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
                values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/GestorNova");
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

            File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "GestorNova");
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
            Log.e(TAG, "saveToDownloads", e);
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
        } catch (SecurityException e) {
            Log.w(TAG, "notifyExportSaved: notificación no mostrada", e);
        }
    }
}
