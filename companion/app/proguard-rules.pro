# HorizonTuner Companion ProGuard / R8 Rules

# Preserve WebView JavaScript Interfaces
-keepattributes JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Preserve Companion JavaScript Bridge
-keepclassmembers class org.horizontuner.companion.app.CompanionJavascriptBridge {
    public *;
}

# Kotlin Coroutines
-keepnames class kotlinx.coroutines.internal.MainDispatcherFactory {}
-keepnames class kotlinx.coroutines.CoroutineExceptionHandler {}

# ML Kit Barcode Scanning
-keep class com.google.mlkit.vision.barcode.** { *; }
-dontwarn com.google.mlkit.vision.barcode.**

# CameraX
-keep class androidx.camera.core.** { *; }
-dontwarn androidx.camera.core.**
