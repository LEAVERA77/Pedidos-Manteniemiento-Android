plugins {
    alias(libs.plugins.android.application)
}

android {
    namespace = "com.leavera.pedidosmg"
    compileSdk = 35  // Usar 35 en lugar de la sintaxis release(36) que no es válida

    buildFeatures {
        buildConfig = true
    }

    defaultConfig {
        applicationId = "com.leavera.pedidosmg"
        minSdk = 24
        targetSdk = 35  // Usar 35 para compatibilidad
        versionCode = 2
        versionName = "1.0.1"

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