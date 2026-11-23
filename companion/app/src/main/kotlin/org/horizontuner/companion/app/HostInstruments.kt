package org.horizontuner.companion.app

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.horizontuner.companion.core.hud.*
import java.io.File
import java.net.URLEncoder

internal class HostInstruments(base: File, private val session: NativeSession) {
    private val cache = InstrumentCache(base, session.origin)
    suspend fun catalog(): Pair<InstrumentCatalog, Boolean> = withContext(Dispatchers.IO) {
        try {
            val catalog = InstrumentProtocol.catalog(session.hudBytes("/companion/hud/catalog.json", 128 * 1024).toString(Charsets.UTF_8))
            cache.saveCatalog(catalog)
            catalog to false
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (error: Exception) { (cache.readCatalog() ?: throw error) to true }
    }
    suspend fun instrument(style: InstrumentStyle): Pair<CachedInstrument, Boolean> = withContext(Dispatchers.IO) {
        try {
            val raw = session.hudBytes("/companion/hud/manifests/${style.id}.json", 1024 * 1024).toString(Charsets.UTF_8)
            val manifest = InstrumentProtocol.manifest(raw, style)
            cache.install(manifest) { asset ->
                val path = asset.path.split('/').joinToString("/") { URLEncoder.encode(it, "UTF-8").replace("+", "%20") }
                session.hudBytes("/companion/hud/assets/${asset.sha256}/$path", asset.sizeBytes.toInt())
            } to false
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (error: Exception) { (cache.lastGood(style.id) ?: throw error) to true }
    }
}
