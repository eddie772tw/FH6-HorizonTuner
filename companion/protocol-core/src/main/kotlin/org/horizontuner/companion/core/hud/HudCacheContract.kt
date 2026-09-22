package org.horizontuner.companion.core.hud

import java.io.File
import java.io.InputStream
import java.security.MessageDigest

data class HudManifestItem(
    val path: String,
    val sha256: String,
    val sizeBytes: Long
)

data class HudManifest(
    val manifest: List<HudManifestItem>
)

object HudCacheContract {

    /**
     * Compute SHA-256 hex string for a given input stream.
     */
    fun computeSha256(inputStream: InputStream): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val buffer = ByteArray(8192)
        var read: Int
        while (inputStream.read(buffer).also { read = it } != -1) {
            digest.update(buffer, 0, read)
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    /**
     * Check if a cached file matches the expected SHA-256 hash.
     */
    fun isAssetValid(cachedFile: File, expectedSha256: String): Boolean {
        if (!cachedFile.exists() || !cachedFile.isFile) return false
        return try {
            cachedFile.inputStream().use { input ->
                val actual = computeSha256(input)
                actual.equals(expectedSha256, ignoreCase = true)
            }
        } catch (_: Exception) {
            false
        }
    }
}
