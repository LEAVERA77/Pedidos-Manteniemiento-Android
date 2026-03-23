plugins {
    alias(libs.plugins.android.application)
}

android {
    namespace = "com.leavera.pedidosmg"
    compileSdk = 35  // Usar 35 en lugar de la sintaxis release(36) que no es válida

    defaultConfig {
        applicationId = "com.leavera.pedidosmg"
        minSdk = 24
        targetSdk = 35  // Usar 35 para compatibilidad
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
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
}