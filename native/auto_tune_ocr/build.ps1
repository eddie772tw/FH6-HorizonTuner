param(
    [Parameter(Mandatory=$true)][string]$RuntimeSdk,
    [Parameter(Mandatory=$true)][string]$ModelDirectory,
    [Parameter(Mandatory=$true)][string]$OutputDirectory
)
$ErrorActionPreference = 'Stop'
$sdk = (Resolve-Path -LiteralPath $RuntimeSdk).Path
$model = (Resolve-Path -LiteralPath $ModelDirectory).Path
$output = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force -Path $output | Out-Null
$vswhere = Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'Microsoft Visual Studio/Installer/vswhere.exe'
$vs = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (!$vs) { throw 'Visual Studio C++ x64 build tools are required.' }
$source = Join-Path $PSScriptRoot 'ocr.cpp'
$build = Join-Path $output 'compile.cmd'
@"
@echo off
call "$vs\Common7\Tools\VsDevCmd.bat" -arch=x64 -host_arch=x64 >nul
if errorlevel 1 exit /b 1
cl /nologo /std:c++17 /utf-8 /MT /O2 /EHsc /LD /I"$sdk" "$source" /Fo"$output\ocr.obj" /Fe:"$output\fh6_ocr.dll" /link "$sdk\onnxruntime.lib" gdiplus.lib
exit /b %errorlevel%
"@ | Set-Content -LiteralPath $build -Encoding ascii
& cmd.exe /d /c $build
if ($LASTEXITCODE) { throw "OCR native build failed ($LASTEXITCODE)." }
foreach ($name in 'onnxruntime.dll','onnxruntime_providers_shared.dll') {
    Copy-Item -LiteralPath (Join-Path $sdk $name) -Destination $output -Force
}
foreach ($name in 'det.onnx','rec.onnx','keys.txt') {
    Copy-Item -LiteralPath (Join-Path $model $name) -Destination $output -Force
}
$redist = Get-ChildItem -Path "$vs\VC\Redist\MSVC\*\x64\Microsoft.VC*.CRT" -Directory |
    Sort-Object FullName -Descending | Select-Object -First 1
if (!$redist) { throw 'MSVC x64 redistributable files were not found.' }
Get-ChildItem -LiteralPath $redist.FullName -Filter '*.dll' | Copy-Item -Destination $output -Force
$files = Get-ChildItem -LiteralPath $output -File | Where-Object Extension -in '.dll','.onnx','.txt'
$manifest = @{}
foreach ($file in $files) {
    $algorithm = [Security.Cryptography.SHA256]::Create()
    $stream = [IO.File]::OpenRead($file.FullName)
    try { $manifest[$file.Name] = [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
    finally { $stream.Dispose(); $algorithm.Dispose() }
}
$manifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $output 'sha256.json') -Encoding utf8
