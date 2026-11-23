package org.horizontuner.companion.core.hud

import com.google.gson.JsonParser
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.io.File
import java.security.MessageDigest
import java.util.UUID

/** Versioned PC-owned catalog; no style identifiers are compiled into Android. */
data class InstrumentStyle(val id: String, val label: String, val revision: String)
data class InstrumentCatalog(val revision: String, val styles: List<InstrumentStyle>, val raw: String)
data class InstrumentManifest(val style: String, val revision: String, val assets: List<HudManifestItem>, val raw: String)
data class CachedInstrument(val directory: File, val manifest: InstrumentManifest)

object InstrumentProtocol {
    private val hash = Regex("[a-f0-9]{64}")
    private val id = Regex("[a-z0-9][a-z0-9_-]{0,63}")
    fun validId(value: String) = id.matches(value)
    private fun validPath(path: String, style: String): Boolean =
        path.length <= 512 && !path.contains('\\') && !path.contains(':') && !path.contains('\u0000') &&
            path.split('/').all { it.isNotEmpty() && it != "." && it != ".." } &&
            (path.startsWith("shared/") || path.startsWith("$style/"))

    fun catalog(raw: String): InstrumentCatalog {
        require(raw.length <= 128 * 1024) { "Instrument catalog is too large" }
        val json = JsonParser.parseString(raw).asJsonObject
        require(json["schemaVersion"].asString == "companion-hud/v1") { "Unsupported instrument catalog" }
        val revision = json["revision"].asString
        require(hash.matches(revision))
        val styles = json.getAsJsonArray("styles").map {
            val item = it.asJsonObject
            InstrumentStyle(item["id"].asString, item["label"].asString, item["revision"].asString).also { style ->
                require(validId(style.id) && hash.matches(style.revision) && style.label.length in 1..128)
            }
        }
        require(styles.size <= 100 && styles.map { it.id }.distinct().size == styles.size)
        return InstrumentCatalog(revision, styles, raw)
    }

    fun manifest(raw: String, style: InstrumentStyle): InstrumentManifest {
        require(raw.length <= 1024 * 1024)
        val json = JsonParser.parseString(raw).asJsonObject
        require(json["schemaVersion"].asString == "companion-hud/v1")
        require(json["style"].asString == style.id && json["revision"].asString == style.revision) { "Instrument version changed; refresh catalog" }
        val assets = json.getAsJsonArray("assets").map {
            val item = it.asJsonObject
            HudManifestItem(item["path"].asString, item["sha256"].asString, item["sizeBytes"].asLong).also { asset ->
                require(validPath(asset.path, style.id) && hash.matches(asset.sha256)) { "Invalid instrument asset path or checksum" }
                require(asset.sizeBytes in 0..32L * 1024 * 1024) { "Instrument asset is too large" }
            }
        }
        require(assets.size in 1..2048 && assets.map { it.path }.distinct().size == assets.size)
        require(assets.sumOf { it.sizeBytes } <= 64L * 1024 * 1024)
        require(assets.any { it.path == "${style.id}/index.html" } && assets.any { it.path == "shared/companion.html" })
        val canonical = assets.joinToString("") { "${it.path}\u0000${it.sha256}\u0000${it.sizeBytes}\n" }
        require(sha256(canonical.toByteArray()) == style.revision) { "Instrument manifest checksum mismatch" }
        return InstrumentManifest(style.id, style.revision, assets, raw)
    }
    fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
}

/** Endpoint-scoped, checksum-verified installation. Failed updates retain the last complete revision. */
class InstrumentCache(base: File, origin: String) {
    private val root = File(base, InstrumentProtocol.sha256(origin.toByteArray()))
    private val mutex = locks.computeIfAbsent(root.absolutePath) { Mutex() }
    private companion object {
        val locks = java.util.concurrent.ConcurrentHashMap<String, Mutex>()
    }
    fun readCatalog(): InstrumentCatalog? = runCatching { InstrumentProtocol.catalog(File(root, "catalog.json").readText()) }.getOrNull()
    fun saveCatalog(catalog: InstrumentCatalog) { atomicWrite(File(root, "catalog.json"), catalog.raw.toByteArray()) }

    private fun pack(style: String, revision: String) = File(File(root, style), revision)
    private fun valid(directory: File, manifest: InstrumentManifest) = manifest.assets.all {
        val file = File(directory, it.path)
        file.length() == it.sizeBytes && HudCacheContract.isAssetValid(file, it.sha256)
    }
    fun lastGood(style: String): CachedInstrument? = runCatching {
        require(InstrumentProtocol.validId(style))
        val revision = File(File(root, style), "current").readText().trim()
        require(Regex("[a-f0-9]{64}").matches(revision))
        val directory = pack(style, revision)
        val manifest = InstrumentProtocol.manifest(File(directory, "manifest.json").readText(), InstrumentStyle(style, style, revision))
        require(valid(directory, manifest))
        CachedInstrument(directory, manifest)
    }.getOrNull()

    suspend fun install(manifest: InstrumentManifest, download: suspend (HudManifestItem) -> ByteArray): CachedInstrument = mutex.withLock {
        require(InstrumentProtocol.manifest(manifest.raw, InstrumentStyle(manifest.style, manifest.style, manifest.revision)) == manifest)
        val destination = pack(manifest.style, manifest.revision)
        if (valid(destination, manifest)) {
            atomicWrite(File(destination, "manifest.json"), manifest.raw.toByteArray())
            atomicWrite(File(destination.parentFile, "current"), manifest.revision.toByteArray())
            return@withLock CachedInstrument(destination, manifest)
        }
        root.mkdirs()
        val staging = File(root, ".stage-${UUID.randomUUID()}").apply { mkdirs() }
        try {
            val existing = lastGood(manifest.style)
            for (asset in manifest.assets) {
                currentCoroutineContext().ensureActive()
                val objectFile = File(File(root, "objects"), asset.sha256)
                val objectValid = objectFile.length() == asset.sizeBytes && HudCacheContract.isAssetValid(objectFile, asset.sha256)
                val previous = existing?.directory?.let { File(it, asset.path) }
                val bytes = when {
                    objectValid -> objectFile.readBytes()
                    previous != null && previous.length() == asset.sizeBytes && HudCacheContract.isAssetValid(previous, asset.sha256) -> previous.readBytes()
                    else -> download(asset)
                }
                require(bytes.size.toLong() == asset.sizeBytes && InstrumentProtocol.sha256(bytes) == asset.sha256) { "Instrument download checksum mismatch" }
                if (!objectValid) atomicWrite(objectFile, bytes)
                val target = File(staging, asset.path)
                target.parentFile!!.mkdirs()
                target.writeBytes(bytes)
            }
            currentCoroutineContext().ensureActive()
            File(staging, "manifest.json").writeText(manifest.raw)
            destination.parentFile!!.mkdirs()
            if (destination.exists()) destination.deleteRecursively()
            check(staging.renameTo(destination)) { "Unable to commit instrument cache" }
            atomicWrite(File(destination.parentFile, "current"), manifest.revision.toByteArray())
            // Retain the new and previous complete revisions for recovery, not an unbounded update history.
            destination.parentFile!!.listFiles()?.filter { it.isDirectory && it != destination && it != existing?.directory }
                ?.forEach { it.deleteRecursively() }
            pruneUnreferencedObjects()
            CachedInstrument(destination, manifest)
        } finally { staging.deleteRecursively() }
    }
    private fun pruneUnreferencedObjects() {
        val retained = mutableSetOf<String>()
        root.listFiles()?.filter { it.isDirectory && InstrumentProtocol.validId(it.name) && it.name != "objects" }?.forEach { style ->
            style.listFiles()?.filter { it.isDirectory }?.forEach { revision ->
                runCatching {
                    val pack = InstrumentProtocol.manifest(File(revision, "manifest.json").readText(), InstrumentStyle(style.name, style.name, revision.name))
                    retained.addAll(pack.assets.map { it.sha256 })
                }
            }
        }
        File(root, "objects").listFiles()?.filter { it.name !in retained }?.forEach { it.delete() }
    }
    private fun atomicWrite(file: File, bytes: ByteArray) {
        file.parentFile!!.mkdirs()
        val temp = File(file.parentFile, ".${file.name}-${UUID.randomUUID()}")
        try {
            temp.outputStream().use { it.write(bytes); it.fd.sync() }
            check(temp.renameTo(file)) { "Unable to write instrument cache" }
        } finally { temp.delete() }
    }
}
