package org.horizontuner.companion.core

import com.google.gson.Gson
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import org.horizontuner.companion.core.hud.*
import org.junit.Assert.*
import org.junit.Test
import java.nio.file.Files

class InstrumentCacheTest {
    private fun manifest(content: String, path: String = "sample/index.html"): InstrumentManifest {
        val files = mapOf("shared/companion.html" to "wrapper", path to content)
        val assets = files.toSortedMap().map { (name, bytes) ->
            mapOf("path" to name, "sha256" to InstrumentProtocol.sha256(bytes.toByteArray()), "sizeBytes" to bytes.toByteArray().size)
        }
        val canonical = assets.joinToString("") { "${it["path"]}\u0000${it["sha256"]}\u0000${it["sizeBytes"]}\n" }
        val revision = InstrumentProtocol.sha256(canonical.toByteArray())
        val raw = Gson().toJson(mapOf("schemaVersion" to "companion-hud/v1", "style" to "sample", "revision" to revision, "assets" to assets))
        return InstrumentProtocol.manifest(raw, InstrumentStyle("sample", "Host instrument", revision))
    }
    private fun bytes(asset: HudManifestItem, content: String) = if (asset.path.startsWith("shared/")) "wrapper".toByteArray() else content.toByteArray()

    @Test fun downloadsOnceAndReusesSharedAssetsAcrossUpdates() = runBlocking {
        val root = Files.createTempDirectory("hud-cache").toFile()
        try {
            val cache = InstrumentCache(root, "http://pc:8002")
            val first = manifest("first")
            cache.install(first) { bytes(it, "first") }
            val reused = cache.install(first) { error("Complete cache must not download again") }
            assertEquals("first", reused.directory.resolve("sample/index.html").readText())
            val downloaded = mutableListOf<String>()
            val second = manifest("second")
            cache.install(second) { downloaded.add(it.path); bytes(it, "second") }
            assertEquals(listOf("sample/index.html"), downloaded)
            assertEquals(second.revision, cache.lastGood("sample")!!.manifest.revision)
            assertNull(InstrumentCache(root, "http://another-pc:8002").lastGood("sample"))
        } finally { root.deleteRecursively() }
    }
    @Test fun failedOrCancelledUpdatesLeaveLastGoodRevisionUsable() = runBlocking {
        val root = Files.createTempDirectory("hud-cache").toFile()
        try {
            val cache = InstrumentCache(root, "http://pc:8002")
            val first = manifest("first")
            cache.install(first) { bytes(it, "first") }
            try { cache.install(manifest("second")) { "corrupt".toByteArray() }; fail("Corruption must fail") }
            catch (_: IllegalArgumentException) { }
            assertEquals(first.revision, cache.lastGood("sample")!!.manifest.revision)
            try { cache.install(manifest("third")) { throw CancellationException("disconnected") }; fail("Cancellation must propagate") }
            catch (_: CancellationException) { }
            assertEquals(first.revision, cache.lastGood("sample")!!.manifest.revision)
            assertFalse(root.walkTopDown().any { it.name.startsWith(".stage-") })
        } finally { root.deleteRecursively() }
    }
    @Test fun corruptedInstalledFileIsNotRenderedAndCanBeRepairedWithoutRedownloading() = runBlocking {
        val root = Files.createTempDirectory("hud-cache").toFile()
        try {
            val cache = InstrumentCache(root, "http://pc:8002")
            val manifest = manifest("first")
            val pack = cache.install(manifest) { bytes(it, "first") }
            pack.directory.resolve("sample/index.html").writeText("broken")
            assertNull(cache.lastGood("sample"))
            cache.install(manifest) { error("Verified content-addressed object is available") }
            assertEquals("first", cache.lastGood("sample")!!.directory.resolve("sample/index.html").readText())
        } finally { root.deleteRecursively() }
    }
    @Test fun rejectsTraversalAndManifestVersionMismatch() {
        for (path in listOf("sample/../../outside", "sample/./index.html", "/sample/index.html", "other/index.html")) {
            try { manifest("bad", path); fail("Unsafe path accepted: $path") }
            catch (_: IllegalArgumentException) { }
        }
        val first = manifest("first")
        try { InstrumentProtocol.manifest(first.raw, InstrumentStyle("sample", "Sample", "0".repeat(64))); fail("Stale version accepted") }
        catch (_: IllegalArgumentException) { }
    }
}
