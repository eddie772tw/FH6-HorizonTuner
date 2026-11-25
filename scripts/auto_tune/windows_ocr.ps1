# Per-worker WinRT recognizers. Each line describes an independent saved frame.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    Add-Type -TypeDefinition @'
public static class VehicleTextPixels {
    public static byte[] Mask(byte[] input, int width, int height, bool light, int scale, int pad, int threshold) {
        int outWidth = width * scale + pad * 2, outHeight = height * scale + pad * 2;
        byte[] output = new byte[outWidth * outHeight * 4];
        for (int i = 0; i < output.Length; i++) output[i] = 255;
        for (int y = 0; y < height; y++) for (int x = 0; x < width; x++) {
            int p = (y * width + x) * 4;
            int b = input[p], g = input[p + 1], r = input[p + 2];
            int high = System.Math.Max(r, System.Math.Max(g, b)), low = System.Math.Min(r, System.Math.Min(g, b));
            bool ink = light ? (low > threshold && high - low < 90) || (r > 170 && g > 170 && b < 100) : high < 185;
            byte value = ink ? (byte)0 : (byte)255;
            for (int dy = 0; dy < scale; dy++) for (int dx = 0; dx < scale; dx++) {
                int q = ((y * scale + pad + dy) * outWidth + x * scale + pad + dx) * 4;
                output[q] = output[q + 1] = output[q + 2] = value;
            }
        }
        return output;
    }
}
'@
    $null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
    $null = [Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
    $null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
    $null = [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
    $null = [Windows.Graphics.Imaging.BitmapTransform, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
    $null = [Windows.Graphics.Imaging.BitmapBounds, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
    $null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
    $null = [Windows.Media.Ocr.OcrResult, Windows.Foundation, ContentType = WindowsRuntime]
    $null = [Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]
    $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetGenericArguments().Count -eq 1 -and
        $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    } | Select-Object -First 1
    function Await-WinRT($Operation, [Type]$ResultType) {
        $task = $asTask.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
        $task.Wait()
        return $task.Result
    }
    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
    if ($null -eq $engine) { throw 'No OCR engine for installed user-profile languages.' }
    $englishEngine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new('en-US'))
    $chineseEngine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new('zh-Hant-TW'))
} catch {
    [Console]::WriteLine((@{status='error'; error=$_.Exception.Message} | ConvertTo-Json -Compress))
    exit 1
}

function Read-Frame($ImagePath, $requests) {
    $stream = $null
    try {
        $file = Await-WinRT ([Windows.Storage.StorageFile]::GetFileFromPathAsync($ImagePath)) ([Windows.Storage.StorageFile])
        $stream = Await-WinRT ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
        $decoder = Await-WinRT ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
        if ($requests.Count -gt 64) { throw 'Too many OCR regions.' }
        $regions = @{}
        foreach ($request in $requests) {
            $bitmap = $null
            $processed = $null
            $region = @{ status = 'unknown'; text = '' }
            try {
                if ($request.name -notmatch '^[a-z][a-z0-9_]{0,40}$') { throw 'Invalid region name.' }
                $b = $request.bounds
                if ($b.x -lt 0 -or $b.y -lt 0 -or $b.width -le 0 -or $b.height -le 0 -or
                    $b.x + $b.width -gt 1.000001 -or $b.y + $b.height -gt 1.000001) { throw 'Invalid normalized crop.' }
                # Bounds refer to untransformed decoder pixels. No scaling or rotation.
                # https://learn.microsoft.com/en-us/uwp/api/windows.graphics.imaging.bitmaptransform.bounds
                $bounds = New-Object Windows.Graphics.Imaging.BitmapBounds
                $bounds.X = [uint32][Math]::Floor($decoder.PixelWidth * $b.x)
                $bounds.Y = [uint32][Math]::Floor($decoder.PixelHeight * $b.y)
                $bounds.Width = [uint32][Math]::Ceiling($decoder.PixelWidth * ($b.x + $b.width)) - $bounds.X
                $bounds.Height = [uint32][Math]::Ceiling($decoder.PixelHeight * ($b.y + $b.height)) - $bounds.Y
                $transform = New-Object Windows.Graphics.Imaging.BitmapTransform
                $transform.Bounds = $bounds
                $bitmap = Await-WinRT ($decoder.GetSoftwareBitmapAsync(
                    [Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8,
                    [Windows.Graphics.Imaging.BitmapAlphaMode]::Ignore,
                    $transform,
                    [Windows.Graphics.Imaging.ExifOrientationMode]::IgnoreExifOrientation,
                    [Windows.Graphics.Imaging.ColorManagementMode]::DoNotColorManage
                )) ([Windows.Graphics.Imaging.SoftwareBitmap])
                $scale = 1
                $padding = 0
                $recognize = $bitmap
                if ($request.mode -in @('light', 'dark')) {
                    $scale = $(if ($null -ne $request.scale) { [int]$request.scale } else { 2 })
                    $padding = $(if ($null -ne $request.padding) { [int]$request.padding } else { 24 })
                    $bytes = New-Object byte[] ($bitmap.PixelWidth * $bitmap.PixelHeight * 4)
                    $buffer = [System.Runtime.InteropServices.WindowsRuntime.WindowsRuntimeBufferExtensions]::AsBuffer($bytes)
                    $bitmap.CopyToBuffer($buffer)
                    $threshold = $(if ($null -ne $request.threshold) { [int]$request.threshold } else { 155 })
                    $masked = [VehicleTextPixels]::Mask($bytes, $bitmap.PixelWidth, $bitmap.PixelHeight, ($request.mode -eq 'light'), $scale, $padding, $threshold)
                    $maskedBuffer = [System.Runtime.InteropServices.WindowsRuntime.WindowsRuntimeBufferExtensions]::AsBuffer($masked)
                    # https://learn.microsoft.com/en-us/uwp/api/windows.graphics.imaging.softwarebitmap.createcopyfrombuffer
                    $processed = [Windows.Graphics.Imaging.SoftwareBitmap]::CreateCopyFromBuffer(
                        $maskedBuffer, [Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8,
                        $bitmap.PixelWidth * $scale + $padding * 2, $bitmap.PixelHeight * $scale + $padding * 2,
                        [Windows.Graphics.Imaging.BitmapAlphaMode]::Ignore)
                    $recognize = $processed

                }
                $recognizer = $engine
                if ($request.language -eq 'en-US' -and $null -ne $englishEngine) { $recognizer = $englishEngine }
                if ($request.language -eq 'zh-Hant-TW' -and $null -ne $chineseEngine) { $recognizer = $chineseEngine }
                $result = Await-WinRT ($recognizer.RecognizeAsync($recognize)) ([Windows.Media.Ocr.OcrResult])
                $region.status = 'ok'
                $region.text = $result.Text
            } catch {
                $region.error = $_.Exception.Message
            } finally {
                if ($null -ne $processed) { $processed.Dispose() }
                if ($null -ne $bitmap) { $bitmap.Dispose() }
            }
            $regions[$request.name] = $region
        }
        return @{status='ok'; regions=$regions}
    } finally {
        if ($null -ne $stream) { $stream.Dispose() }
    }
}

while ($null -ne ($line = [Console]::In.ReadLine())) {
    $requestId = $null
    try {
        $item = ConvertFrom-Json -InputObject $line
        $requestId = $item.id
        $answer = Read-Frame $item.path $item.regions
    } catch {
        $answer = @{status='error'; error=$_.Exception.Message}
    }
    $answer['id'] = $requestId
    [Console]::WriteLine(($answer | ConvertTo-Json -Depth 6 -Compress))
}
