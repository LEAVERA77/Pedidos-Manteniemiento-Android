import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    // Kotlin viene integrado en AGP 9+; no aplicar org.jetbrains.kotlin.android.
    alias(libs.plugins.kotlin.compose)
}

/**
 * Firma release automática: creá en la raíz del repo `keystore.properties` (no va a Git; ver
 * `keystore.properties.example`). Propiedades: **storeFilePath** o **storeFile** (ruta al archivo
 * keystore), storePassword, keyAlias, keyPassword. Preferí `storeFilePath` si el archivo no tiene extensión.
 */
val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("keystore.properties")
val releaseKeystoreConfigured = if (keystorePropertiesFile.exists()) {
    keystorePropertiesFile.inputStream().use { keystoreProperties.load(it) }
    true
} else {
    false
}

android {
    namespace = "com.gestornova.gestion"
    compileSdk = 35  // Usar 35 en lugar de la sintaxis release(36) que no es válida

    buildFeatures {
        buildConfig = true
        compose = true
    }

    defaultConfig {
        applicationId = "com.gestornova.gestion"
        minSdk = 24
        targetSdk = 35  // Usar 35 para compatibilidad
        versionCode = 35
        versionName = "1.0.35"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        // Release: GitHub Pages (actualizar sin nuevo APK vía Pedidos-MG).
        buildConfigField(
            "String",
            "WEB_APP_URL",
            "\"https://leavera77.github.io/Pedidos-MG/\""
        )
    }

    signingConfigs {
        if (releaseKeystoreConfigured) {
            create("release") {
                val storePath =
                    keystoreProperties.getProperty("storeFilePath")?.trim()?.takeIf { it.isNotEmpty() }
                        ?: keystoreProperties.getProperty("storeFile")?.trim()?.takeIf { it.isNotEmpty() }
                        ?: error("keystore.properties: falta storeFilePath o storeFile (ruta al keystore)")
                val storeFileResolved = rootProject.file(storePath)
                if (!storeFileResolved.exists()) {
                    error("Keystore no encontrado: ${storeFileResolved.absolutePath}")
                }
                storeFile = storeFileResolved
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            // No sobreescribir WEB_APP_URL: defaultConfig ya apunta a GitHub Pages (HTTPS).
            // file:///android_asset/index.html hace que el Neon serverless (@neondatabase/serverless) falle
            // en WebView con "Failed to fetch" al conectar (misma app que en navegador sí funciona).
        }
        release {
            isMinifyEnabled = false
            if (releaseKeystoreConfigured) {
                signingConfig = signingConfigs.getByName("release")
            }
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
            excludes += "META-INF/LICENSE*"
            excludes += "META-INF/NOTICE*"
        }
    }
}

dependencies {
    implementation(libs.appcompat)
    implementation(libs.material)
    implementation(libs.activity)
    implementation(libs.constraintlayout)
    testImplementation(libs.junit)
    androidTestImplementation(libs.ext.junit)
    androidTestImplementation(libs.espresso.core)

    // Agregar esto para FileProvider
    implementation("androidx.core:core-ktx:1.15.0")

    implementation("androidx.biometric:biometric:1.1.0")
    implementation("androidx.work:work-runtime:2.9.1")
    // minSdk 24: 42.7.x falla en D8 (MethodHandle / min-api 26). 42.2.x + NeonJdbc (maxResultBuffer=0) evita ManagementFactory.
    implementation("org.postgresql:postgresql:42.2.29")

    // MVP técnico nativo (Compose + Retrofit)
    val composeBom = platform(libs.compose.bom)
    implementation(composeBom)
    androidTestImplementation(composeBom)
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.graphics)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.compose.material3)
    implementation("androidx.compose.material:material-icons-extended")
    debugImplementation(libs.compose.ui.tooling)
    implementation(libs.activity.compose)
    implementation(libs.navigation.compose)
    implementation(libs.lifecycle.runtime.ktx)
    implementation(libs.lifecycle.viewmodel.compose)
    implementation(libs.lifecycle.runtime.compose)
    implementation(libs.retrofit)
    implementation(libs.retrofit.gson)
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging)
    implementation(libs.datastore.preferences)
    implementation(libs.kotlinx.coroutines.android)
}

/**
 * `config.json` con credenciales no va al repo (.gitignore). Sin archivo, la WebView falla al arrancar.
 * Si falta, se genera una copia desde [config.example.json] (placeholders); editá Neon/API en local antes de producción.
 */
tasks.register("ensureConfigJson") {
    group = "build"
    description = "Crea app/src/main/assets/config.json desde config.example.json solo si no existe."
    doLast {
        val assetsDir = layout.projectDirectory.dir("src/main/assets").asFile
        val dst = assetsDir.resolve("config.json")
        val src = assetsDir.resolve("config.example.json")
        if (dst.exists()) return@doLast
        if (!src.exists()) {
            throw GradleException("Falta ${src.name} en ${assetsDir.path}")
        }
        src.copyTo(dst, overwrite = false)
        logger.lifecycle(
            "GestorNova: creado assets/config.json desde config.example.json — completá neon.connectionString y demás en local."
        )
    }
}

tasks.named("preBuild").configure {
    dependsOn("ensureConfigJson")
}

/**
 * Carpeta destino de la tarea [renameReleaseApk].
 * Por defecto: [rootProject]/release-export/ (disco local; compatible con Gradle 9).
 * Opcional: variable de entorno `GESTORNOVA_RELEASE_COPY_DIR` = ruta absoluta (ej. carpeta en Google Drive).
 *
 * No enlaces `app/build` ni la salida de `packageRelease` a Google Drive: Gradle 9 inspecciona esas rutas y suele fallar con
 * AccessDeniedException en "Mi unidad". La APK release se genera siempre en `app/build/outputs/apk/release/`; esta tarea solo copia.
 */
val gestornovaReleaseCopyDir: String? =
    System.getenv("GESTORNOVA_RELEASE_COPY_DIR")?.trim()?.takeIf { it.isNotEmpty() }

// APK renombrado: primero siempre en build estándar; esta tarea solo copia a release-export/ o a GESTORNOVA_RELEASE_COPY_DIR.
tasks.register<Copy>("renameReleaseApk") {
    dependsOn("assembleRelease")
    from(layout.buildDirectory.dir("outputs/apk/release")) {
        include("app-release.apk", "app-release-unsigned.apk")
    }
    val destRoot =
        gestornovaReleaseCopyDir?.let { rootProject.file(it) }
            ?: rootProject.file("release-export")
    into(destRoot)
    val vName = android.defaultConfig.versionName ?: "0.0.0"
    val vCode = android.defaultConfig.versionCode ?: 0
    rename { "GestorNova-$vName($vCode)-release.apk" }
    doNotTrackState("Destino puede ser carpeta externa (Drive); no rastrear para el incremental build")
}

/**
 * Copia `app-release.apk` firmada a la carpeta en `GESTORNOVA_RELEASE_COPY_DIR` **sin renombrar**
 * (útil para `keytool -printcert -jarfile .../app-release.apk` o scripts OTA).
 */
tasks.register("exportReleaseApkFlat") {
    group = "build"
    description =
        "Copia app-release.apk a GESTORNOVA_RELEASE_COPY_DIR (variable de entorno; mismo nombre de archivo)."
    dependsOn("assembleRelease")
    doLast {
        val dir =
            gestornovaReleaseCopyDir?.trim()?.takeIf { it.isNotEmpty() }
                ?: error(
                    "Definí la variable de entorno GESTORNOVA_RELEASE_COPY_DIR (ruta absoluta de la carpeta destino)."
                )
        val rel = layout.buildDirectory.get().asFile.resolve("outputs/apk/release")
        val src =
            sequenceOf(rel.resolve("app-release.apk"), rel.resolve("app-release-unsigned.apk"))
                .firstOrNull { it.isFile }
                ?: error(
                    "No hay APK en ${rel.absolutePath}. Con firma: revisá keystore.properties. Sin firma: solo existe app-release-unsigned.apk."
                )
        val destDir = rootProject.file(dir)
        destDir.mkdirs()
        val destApk = destDir.resolve("app-release.apk")
        copy {
            from(src)
            into(destDir)
            rename { "app-release.apk" }
        }
        logger.lifecycle("GestorNova: copiado ${src.name} → ${destApk.absolutePath}")
    }
}

