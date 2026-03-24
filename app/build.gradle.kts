import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
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
    }

    defaultConfig {
        applicationId = "com.gestornova.gestion"
        minSdk = 24
        targetSdk = 35  // Usar 35 para compatibilidad
        versionCode = 8
        versionName = "1.0.7"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
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
    implementation("androidx.core:core:1.12.0")

    implementation("androidx.work:work-runtime:2.9.1")
    // 42.7+ provoca mergeExtDex: MethodHandle.invoke solo con minSdk 26+; 42.2.x dexifica en API 24.
    implementation("org.postgresql:postgresql:42.2.29")
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