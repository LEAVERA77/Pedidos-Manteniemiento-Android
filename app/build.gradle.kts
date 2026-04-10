import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    // Kotlin viene integrado en AGP 9+; no aplicar org.jetbrains.kotlin.android.
    alias(libs.plugins.kotlin.compose)
}

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
        versionCode = 20
        versionName = "1.0.20"

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
                storeFile = file(keystoreProperties.getProperty("storeFile")!!)
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            // Android Studio / emulador: UI desde app/src/main/assets/index.html (Nexxo).
            buildConfigField(
                "String",
                "WEB_APP_URL",
                "\"file:///android_asset/index.html\""
            )
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

    implementation("androidx.work:work-runtime:2.9.1")
    // 42.7+ provoca mergeExtDex: MethodHandle.invoke solo con minSdk 26+; 42.2.x dexifica en API 24.
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

// APK renombrado fuera del build/ (no toca salidas AGP → sin conflicto Gradle 9).
tasks.register<Copy>("renameReleaseApk") {
    dependsOn("assembleRelease")
    from(layout.buildDirectory.dir("outputs/apk/release")) {
        include("app-release.apk", "app-release-unsigned.apk")
    }
    into(file("G:/Mi unidad/Programas/Actualizaciones Android/release/release"))
    val vName = android.defaultConfig.versionName ?: "0.0.0"
    val vCode = android.defaultConfig.versionCode ?: 0
    rename { "GestorNova-$vName($vCode)-release.apk" }
}