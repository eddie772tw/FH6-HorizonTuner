import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.zip.ZipFile;

/** Run from companion/: java scripts/VerifyFontApk.java APK [BASELINE_APK]. No SDK or extra dependency. */
public class VerifyFontApk {
    private static String hash(byte[] bytes) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    }

    public static void main(String[] args) throws Exception {
        if (args.length < 1 || args.length > 2) throw new IllegalArgumentException("APK [BASELINE_APK]");
        Path apk = Path.of(args[0]);
        Map<String, Path> entries = new LinkedHashMap<>();
        for (String font : new String[] {"outfit", "inter"}) {
            String path = "res/font/" + font + "_variable.ttf";
            entries.put(path, Path.of("theme/src/main/" + path));
        }
        for (String notice : new String[] {"Outfit-OFL.txt", "Inter-OFL.txt", "Inter-METADATA.pb", "provenance.json"}) {
            String path = "assets/font_notices/" + notice;
            entries.put(path, Path.of("theme/src/main/" + path));
        }
        long compressed = 0;
        long raw = 0;
        try (ZipFile zip = new ZipFile(apk.toFile())) {
            for (var item : entries.entrySet()) {
                var entry = zip.getEntry(item.getKey());
                if (entry == null) throw new IllegalStateException("Missing APK entry " + item.getKey());
                byte[] expected = Files.readAllBytes(item.getValue());
                byte[] actual;
                try (var stream = zip.getInputStream(entry)) { actual = stream.readAllBytes(); }
                if (!MessageDigest.isEqual(expected, actual)) throw new IllegalStateException("APK bytes differ: " + item.getKey());
                raw += actual.length;
                compressed += entry.getCompressedSize();
                System.out.printf("%s bytes=%d compressed=%d sha256=%s%n", item.getKey(), actual.length, entry.getCompressedSize(), hash(actual));
            }
        }
        long size = Files.size(apk);
        System.out.printf("APK bytes=%d sha256=%s%n", size, hash(Files.readAllBytes(apk)));
        System.out.printf("font_and_notice_entries raw=%d compressed=%d%n", raw, compressed);
        if (args.length == 2) {
            Path base = Path.of(args[1]);
            try (ZipFile zip = new ZipFile(base.toFile())) {
                for (var entry : entries.keySet()) {
                    if (zip.getEntry(entry) != null) throw new IllegalStateException("Baseline already has font entry " + entry);
                }
            }
            System.out.printf("BASELINE bytes=%d sha256=%s%n", Files.size(base), hash(Files.readAllBytes(base)));
            System.out.printf("APK_delta_bytes=%d%n", size - Files.size(base));
        }
    }
}
