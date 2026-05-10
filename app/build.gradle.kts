plugins {
    alias(libs.plugins.android.application)
    // Kotlin viene integrado en AGP 9+; no aplicar org.jetbrains.kotlin.android.
    alias(libs.plugins.kotlin.compose)
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
        versionCode = 39
        versionName = "1.0.39"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        // Release: GitHub Pages (actualizar sin nuevo APK vía Pedidos-MG).
        buildConfigField(
            "String",
            "WEB_APP_URL",
            "\"https://leavera77.github.io/Pedidos-MG/\""
        )
    }

    /*
     * Firma release fija (ruta absoluta). keystore.properties en la raíz del repo puede existir como
     * respaldo documental pero NO se usa aquí. Ojo: contraseñas en este archivo quedan en el historial de Git;
     * en equipos compartidos preferí variables locales o otro mecanismo.
     */
    signingConfigs {
        create("release") {
            storeFile = file("C:/Keystore/keystore")
            storePassword = "leavera77"
            keyAlias = "pmmant"
            keyPassword = "leavera77"
        }
    }

    buildTypes {
        debug {
            // No sobreescribir WEB_APP_URL: defaultConfig ya apunta a GitHub Pages (HTTPS).
            // file:///android_asset/index.html hace que el Neon serverless (@neondatabase/serverless) falle
            // en WebView con "Failed to fetch" al conectar (misma app que en navegador sí funciona).
        }
        release {
            signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    /*
     * Windows + Android Studio: `lintVitalAnalyzeRelease` suele chocar con JARs en `lint-cache/migrated-jars`
     * bloqueados por otro proceso (IDE, segundo daemon, indexación). Para `assembleRelease` local no hace falta
     * lint “vital” en cada build; ejecutá `.\gradlew :app:lint` cuando quieras el informe.
     */
    lint {
        checkReleaseBuilds = false
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
 *
 * **OneDrive / `packageRelease`:** no dejes `GESTORNOVA_RELEASE_COPY_DIR` en variables de entorno **permanentes**
 * del usuario Windows ni en **Android Studio → Settings → Build → Gradle → Environment variables** mientras
 * compilás el proyecto: puede provocar `AccessDeniedException` en `baselineProfiles` bajo la carpeta de releases.
 * Usá `scripts/build-release-and-export.ps1` o definí la variable **solo** en la sesión de PowerShell del paso de copia.
 *
 * Importante: no usar `Copy.into(OneDrive)` en tiempo de **configuración** del script: en algunos entornos
 * Gradle/AGP termina intentando escribir `baselineProfiles` bajo esa ruta durante `packageRelease` y falla con
 * AccessDenied. Las tareas de copia leen `GESTORNOVA_RELEASE_COPY_DIR` solo en **doLast**.
 */

// APK renombrado: salida estándar en app/build; copia al final (env solo en ejecución).
tasks.register("renameReleaseApk") {
    group = "build"
    description = "Copia la APK release renombrada a release-export/ o a GESTORNOVA_RELEASE_COPY_DIR."
    dependsOn("assembleRelease")
    doLast {
        val raw = System.getenv("GESTORNOVA_RELEASE_COPY_DIR")?.trim()?.takeIf { it.isNotEmpty() }
        val destRoot = raw?.let { rootProject.file(it) } ?: rootProject.file("release-export")
        destRoot.mkdirs()
        val vName = android.defaultConfig.versionName ?: "0.0.0"
        val vCode = android.defaultConfig.versionCode ?: 0
        val outName = "GestorNova-$vName($vCode)-release.apk"
        val rel = layout.buildDirectory.get().asFile.resolve("outputs/apk/release")
        val src =
            sequenceOf(rel.resolve("app-release.apk"), rel.resolve("app-release-unsigned.apk"))
                .firstOrNull { it.isFile }
                ?: error("No hay APK en ${rel.absolutePath}")
        copy {
            from(src)
            into(destRoot)
            rename { outName }
        }
        logger.lifecycle("GestorNova: copiado release → ${destRoot.resolve(outName).absolutePath}")
    }
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
            System.getenv("GESTORNOVA_RELEASE_COPY_DIR")?.trim()?.takeIf { it.isNotEmpty() }
                ?: error(
                    "Definí la variable de entorno GESTORNOVA_RELEASE_COPY_DIR (ruta absoluta de la carpeta destino)."
                )
        val rel = layout.buildDirectory.get().asFile.resolve("outputs/apk/release")
        val src =
            sequenceOf(rel.resolve("app-release.apk"), rel.resolve("app-release-unsigned.apk"))
                .firstOrNull { it.isFile }
                ?: error(
                    "No hay APK en ${rel.absolutePath}. Revisá firma en app/build.gradle.kts y que assembleRelease haya generado app-release.apk."
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

