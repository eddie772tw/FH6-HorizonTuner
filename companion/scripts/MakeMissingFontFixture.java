import java.nio.file.Files;
import java.nio.file.Path;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.util.zip.ZipOutputStream;

/** Create a separate negative ZIP fixture; the input APK and original font bytes are never written. */
public class MakeMissingFontFixture {
    public static void main(String[] args) throws Exception {
        if (args.length != 2) throw new IllegalArgumentException("SOURCE_APK NEW_FIXTURE_PATH");
        Path source = Path.of(args[0]);
        Path output = Path.of(args[1]);
        if (Files.exists(output)) throw new IllegalArgumentException("Fixture path must be new");
        String removed = "res/font/outfit_variable.ttf";
        try (ZipFile input = new ZipFile(source.toFile())) {
            if (input.getEntry(removed) == null) throw new IllegalArgumentException("Source must contain " + removed);
            try (ZipOutputStream zip = new ZipOutputStream(Files.newOutputStream(output))) {
                for (var entries = input.entries(); entries.hasMoreElements();) {
                    var entry = entries.nextElement();
                    if (entry.getName().equals(removed)) continue;
                    zip.putNextEntry(new ZipEntry(entry.getName()));
                    try (var bytes = input.getInputStream(entry)) { bytes.transferTo(zip); }
                    zip.closeEntry();
                }
            }
        }
    }
}
