plugins {
    id("com.android.application")
    kotlin("android")
    id("org.jetbrains.kotlin.plugin.compose")
}

// Release builds are available only through the checked delivery entry point.
// Debug builds keep their existing local/CI version and signing behavior.
val deliveryMode = providers.environmentVariable("HORIZONTUNER_APK_DELIVERY_MODE").orNull
val deliveryVersionCode = providers.environmentVariable("HORIZONTUNER_ANDROID_VERSION_CODE").orNull
val deliveryVersionName = providers.environmentVariable("HORIZONTUNER_ANDROID_VERSION_NAME").orNull
val deliveryAssets = layout.buildDirectory.dir("generated/delivery-assets")
val validateOfficialApkConfiguration = tasks.register("validateOfficialApkConfiguration") {
    doLast {
        require(deliveryMode in listOf("production", "test-only")) {
            "Release requires scripts/build_companion_apk.py and explicit signing configuration; no debug fallback."
        }
        for (name in listOf("HORIZONTUNER_KEYSTORE_PATH", "HORIZONTUNER_KEYSTORE_PASSWORD", "HORIZONTUNER_KEY_ALIAS", "HORIZONTUNER_KEY_PASSWORD")) {
            require(!System.getenv(name).isNullOrBlank()) { "Missing release setting: $name" }
        }
        require(file(System.getenv("HORIZONTUNER_KEYSTORE_PATH")).isFile) { "Release keystore must exist." }
        require(deliveryVersionCode?.toIntOrNull()?.let { it in 2..2100000000 } == true) { "Invalid Android versionCode." }
        require(!deliveryVersionName.isNullOrBlank()) { "Missing Android versionName." }
        require(deliveryAssets.get().file("delivery-source.json").asFile.isFile) {
            "Missing delivery-source.json; use scripts/build_companion_apk.py."
        }
    }
}

android {
    namespace = "org.horizontuner.companion.app"
    compileSdk = 36
    buildToolsVersion = "35.0.0"

    defaultConfig {
        applicationId = "org.horizontuner.companion"
        minSdk = 33
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        create("release") {
            val keystoreFile = System.getenv("HORIZONTUNER_KEYSTORE_PATH")
            if (!keystoreFile.isNullOrBlank()) {
                storeFile = file(keystoreFile)
                storePassword = System.getenv("HORIZONTUNER_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("HORIZONTUNER_KEY_ALIAS")
                keyPassword = System.getenv("HORIZONTUNER_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            isDebuggable = false
            if (deliveryMode == "test-only") {
                applicationIdSuffix = ".contracttest"
            }
            signingConfig = signingConfigs.getByName("release")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
        debug {
            // standard debug build
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    sourceSets.getByName("release").assets.srcDir(deliveryAssets)

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

androidComponents {
    onVariants(selector().withBuildType("release")) { variant ->
        variant.outputs.forEach { output ->
            output.versionCode.set(deliveryVersionCode?.toIntOrNull() ?: 1)
            output.versionName.set(
                (deliveryVersionName ?: "0.1.0") + if (deliveryMode == "test-only") "-test-only" else "",
            )
        }
    }
}

tasks.matching { it.name == "preReleaseBuild" }.configureEach {
    dependsOn(validateOfficialApkConfiguration)
}
tasks.register("assembleOfficialRelease") {
    group = "build"
    description = "Build the signed APK through scripts/build_companion_apk.py (no debug fallback)."
    dependsOn("assembleRelease")
}

kotlin {
    jvmToolchain(17)
}

dependencies {
    implementation("com.google.code.gson:gson:2.11.0")
    testImplementation("junit:junit:4.13.2")
    implementation(project(":protocol-core"))
    implementation(project(":theme"))

    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.4")
    implementation("androidx.camera:camera-core:1.5.3")
    implementation("androidx.camera:camera-camera2:1.5.3")
    implementation("androidx.camera:camera-lifecycle:1.5.3")
    implementation("androidx.camera:camera-view:1.5.3")
    implementation("com.google.mlkit:barcode-scanning:17.3.0")
    implementation("androidx.compose.ui:ui:1.9.4")
    implementation("androidx.compose.foundation:foundation:1.9.4")
    implementation("androidx.compose.material3:material3:1.3.2")
}
