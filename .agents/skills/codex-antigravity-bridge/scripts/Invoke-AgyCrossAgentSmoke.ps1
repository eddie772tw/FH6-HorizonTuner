[CmdletBinding()]
param(
    [string]$Workspace = (Get-Location).Path,
    [string]$AgyPath,
    [string]$Marker = 'FH6-CODEX-AGY-SMOKE',
    [ValidateRange(10, 600)]
    [int]$TimeoutSeconds = 90,
    [switch]$TestReadFile,
    [string]$TestRelativeFilePath = '.agents/skills/README.md'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$workspacePath = [System.IO.Path]::GetFullPath($Workspace)
if (-not (Test-Path -LiteralPath $workspacePath -PathType Container)) {
    throw "Workspace does not exist: $workspacePath"
}

if ([string]::IsNullOrWhiteSpace($AgyPath)) {
    $agyCommand = Get-Command agy -ErrorAction SilentlyContinue
    if ($null -ne $agyCommand) {
        $AgyPath = $agyCommand.Source
    } else {
        $AgyPath = Join-Path $env:LOCALAPPDATA 'agy\bin\agy.exe'
    }
}
if (-not (Test-Path -LiteralPath $AgyPath -PathType Leaf)) {
    throw "agy executable not found: $AgyPath"
}

$branch = ((& git -C $workspacePath branch --show-current 2>$null) | Select-Object -First 1).Trim()
if ($LASTEXITCODE -ne 0) {
    throw "Unable to resolve the current Git branch."
}
$statusLines = @(& git -C $workspacePath status --short 2>$null)
if ($LASTEXITCODE -ne 0) {
    throw "Unable to read Git status."
}
$statusLines = @($statusLines | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })

$prompt = if ($TestReadFile) {
    $targetFile = [System.IO.Path]::Combine($workspacePath, $TestRelativeFilePath)
    "CROSS_AGENT_READFILE_TEST marker=$Marker. Read the first 5 lines of '$targetFile'. Reply with exactly: AGY_READFILE_OK:$Marker"
} else {
    "CROSS_AGENT_SMOKE_TEST marker=$Marker. Do not use tools. Reply with exactly: AGY_HANDSHAKE_OK:$Marker"
}

$startInfo = [System.Diagnostics.ProcessStartInfo]::new()
$startInfo.FileName = $AgyPath
$startInfo.WorkingDirectory = $workspacePath
$startInfo.UseShellExecute = $false
$startInfo.RedirectStandardOutput = $true
$startInfo.RedirectStandardError = $true
$startInfo.CreateNoWindow = $true

$arguments = @('--add-dir', $workspacePath, '--print', '--sandbox', '--print-timeout', "${TimeoutSeconds}s", '-p', $prompt)
if ($startInfo.PSObject.Properties.Name -contains 'ArgumentList') {
    foreach ($argument in $arguments) { [void]$startInfo.ArgumentList.Add($argument) }
} else {
    $quoted = $arguments | ForEach-Object {
        if ($_ -match '[\s"]') { '"' + ($_ -replace '(\\*)"', '$1$1\"' -replace '(\\+)$', '$1$1') + '"' } else { $_ }
    }
    $startInfo.Arguments = $quoted -join ' '
}

$process = [System.Diagnostics.Process]::new()
$process.StartInfo = $startInfo
$startedAt = [DateTimeOffset]::UtcNow
[void]$process.Start()
$stdoutTask = $process.StandardOutput.ReadToEndAsync()
$stderrTask = $process.StandardError.ReadToEndAsync()
$completed = $process.WaitForExit($TimeoutSeconds * 1000)
$timedOut = -not $completed
if ($timedOut) {
    try { $process.Kill() } catch { }
    $process.WaitForExit()
}
$stdout = $stdoutTask.GetAwaiter().GetResult()
$stderr = $stderrTask.GetAwaiter().GetResult()
$elapsedMs = [int](([DateTimeOffset]::UtcNow - $startedAt).TotalMilliseconds)
$combinedOutput = "$stdout`n$stderr"
$expectedToken = if ($TestReadFile) { "AGY_READFILE_OK:$Marker" } else { "AGY_HANDSHAKE_OK:$Marker" }
$observedToken = if ($combinedOutput -match [regex]::Escape($expectedToken)) { $expectedToken } else { $null }
$permissionDenied = $combinedOutput -match '(?i)permission|auto-denied|allow-rule|system protection boundary'
$passed = (-not $timedOut) -and ($process.ExitCode -eq 0) -and ($null -ne $observedToken)

$failureClass = if ($passed) { $null }
elseif ($timedOut) { 'timeout' }
elseif ($permissionDenied) { 'permission_denied' }
elseif ($process.ExitCode -ne 0) { 'auth_or_startup_failure' }
else { 'agent_response_mismatch' }

$diagnosticHint = if ($permissionDenied) {
    "Headless tool execution encountered permission issues. Ensure ~/.gemini/antigravity-cli/settings.json has 'enableTerminalSandbox: true' and 'toolPermission: proceed-in-sandbox'. Run Set-AgyBridgeSettings.ps1 to configure."
} else { $null }

$result = [ordered]@{
    protocol = if ($TestReadFile) { 'agy-fixed-token-readfile-v1' } else { 'agy-fixed-token-v1' }
    channel = 'agy-headless'
    markerExpected = $expectedToken
    markerObserved = $observedToken
    passed = $passed
    failureClass = $failureClass
    diagnosticHint = $diagnosticHint
    exitCode = $process.ExitCode
    timedOut = $timedOut
    elapsedMs = $elapsedMs
    branch = $branch
    dirtyCount = $statusLines.Count
    dirtyPaths = @($statusLines | ForEach-Object { if ($_.Length -gt 2) { $_.Substring(2).Trim() } else { $_.Trim() } })
    nextInputRequired = $passed
}

$result | ConvertTo-Json -Depth 5
if (-not $passed) { exit 1 }
