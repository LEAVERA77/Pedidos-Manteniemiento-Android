package com.leavera.pedidosmg;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import java.io.File;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

public class MainActivity extends AppCompatActivity {

    private WebView webView;

    private ValueCallback<Uri[]> filePathCallback;
    private Uri cameraImageUri;
    private static final int RC_FILE_CHOOSER = 1001;

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

        webView = findViewById(R.id.webview);
        configurarWebView();
        pedirPermisos();
    }

    private void configurarWebView() {
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setGeolocationEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setSupportZoom(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setUserAgentString(
                s.getUserAgentString().replace("wv", "") + " PedidosMG/1.0"
        );

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
        });

        webView.loadUrl("file:///android_asset/index.html");
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
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }
}
