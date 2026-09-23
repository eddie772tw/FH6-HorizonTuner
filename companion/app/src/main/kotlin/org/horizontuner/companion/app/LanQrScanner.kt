package org.horizontuner.companion.app

import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicReference
import java.util.concurrent.atomic.AtomicBoolean

@Composable
@androidx.annotation.OptIn(ExperimentalGetImage::class)
internal fun LanQrScanner(onScanned: (String) -> Boolean, onClose: () -> Unit) {
    val lifecycleOwner = LocalLifecycleOwner.current
    val cleanupRef = remember { AtomicReference<ScannerCleanup?>(null) }
    val disposed = remember { AtomicBoolean(false) }
    val lifecycleLock = remember { Any() }
    var scannerError by remember { mutableStateOf<String?>(null) }
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(Modifier.fillMaxSize()) {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { viewContext ->
                    val previewView = PreviewView(viewContext).apply {
                        // A TextureView keeps the preview visible inside Compose's Dialog on MIUI.
                        implementationMode = PreviewView.ImplementationMode.COMPATIBLE
                        scaleType = PreviewView.ScaleType.FILL_CENTER
                    }
                    val cameraProviderFuture = ProcessCameraProvider.getInstance(viewContext)
                    val executor = Executors.newSingleThreadExecutor()
                    val scanner = BarcodeScanning.getClient(
                        BarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build(),
                    )
                    val delivered = AtomicBoolean(false)
                    val processing = AtomicBoolean(false)
                    cameraProviderFuture.addListener({
                        runCatching {
                            val provider = cameraProviderFuture.get()
                            synchronized(lifecycleLock) {
                                if (disposed.get()) {
                                    scanner.close()
                                    executor.shutdown()
                                    return@runCatching
                                }
                                val preview = Preview.Builder().build().also { it.surfaceProvider = previewView.surfaceProvider }
                                val analysis = ImageAnalysis.Builder()
                                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                                    .build()
                                analysis.setAnalyzer(executor) { proxy ->
                                    val mediaImage = proxy.image
                                    if (mediaImage == null || delivered.get() || !processing.compareAndSet(false, true)) {
                                        proxy.close()
                                    } else {
                                        val image = InputImage.fromMediaImage(mediaImage, proxy.imageInfo.rotationDegrees)
                                        scanner.process(image)
                                            .addOnSuccessListener { barcodes ->
                                                val raw = barcodes.firstNotNullOfOrNull { it.rawValue }
                                                if (raw != null && onScanned(raw)) delivered.set(true)
                                                else if (raw != null) scannerError = "QR 碼無效或已過期，請掃描有效的配對碼"
                                            }
                                            .addOnFailureListener { scannerError = "無法讀取 QR 碼，請再試一次" }
                                            .addOnCompleteListener { processing.set(false); proxy.close() }
                                    }
                                }
                                try {
                                    val cameraSelector = if (provider.hasCamera(CameraSelector.DEFAULT_BACK_CAMERA)) {
                                        CameraSelector.DEFAULT_BACK_CAMERA
                                    } else if (provider.hasCamera(CameraSelector.DEFAULT_FRONT_CAMERA)) {
                                        CameraSelector.DEFAULT_FRONT_CAMERA
                                    } else {
                                        CameraSelector.DEFAULT_BACK_CAMERA
                                    }
                                    provider.bindToLifecycle(lifecycleOwner, cameraSelector, preview, analysis)
                                    cleanupRef.set(ScannerCleanup(provider, executor, scanner, listOf(preview, analysis)))
                                } catch (failure: Exception) {
                                    scanner.close()
                                    executor.shutdown()
                                    scannerError = failure.message ?: "無法啟動相機"
                                }
                            }
                        }.onFailure { failure ->
                            scanner.close()
                            executor.shutdown()
                            scannerError = failure.message ?: "無法啟動相機"
                        }
                    }, androidx.core.content.ContextCompat.getMainExecutor(viewContext))
                    previewView
                },
            )
            scannerError?.let { Text(it, modifier = Modifier.padding(top = 80.dp, start = 20.dp, end = 20.dp)) }
            Button(onClick = onClose, modifier = Modifier.padding(20.dp)) { Text("取消掃描") }
        }
    }
    DisposableEffect(lifecycleOwner) {
        onDispose {
            synchronized(lifecycleLock) {
                disposed.set(true)
                cleanupRef.getAndSet(null)?.let { cleanup ->
                    runCatching { cleanup.provider.unbind(*cleanup.useCases.toTypedArray()) }
                    cleanup.scanner.close()
                    cleanup.executor.shutdown()
                }
            }
        }
    }
}

private data class ScannerCleanup(
    val provider: ProcessCameraProvider,
    val executor: java.util.concurrent.ExecutorService,
    val scanner: com.google.mlkit.vision.barcode.BarcodeScanner,
    val useCases: List<androidx.camera.core.UseCase>,
)
