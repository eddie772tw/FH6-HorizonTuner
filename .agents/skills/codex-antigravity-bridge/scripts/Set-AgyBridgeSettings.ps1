[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$SettingsPath,
    [switch]$ValidateOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($SettingsPath)) {
    $SettingsPath = Join-Path $env:USERPROFILE '.gemini\antigravity-cli\settings.json'
}

$settingsFile = [System.IO.Path]::GetFullPath($SettingsPath)
$settingsDir = [System.IO.Path]::GetDirectoryName($settingsFile)

$currentConfig = @{}
$fileExists = Test-Path -LiteralPath $settingsFile -PathType Leaf

if ($fileExists) {
    try {
        $rawContent = Get-Content -LiteralPath $settingsFile -Raw -Encoding UTF8
        if (-not [string]::IsNullOrWhiteSpace($rawContent)) {
            $parsed = $rawContent | ConvertFrom-Json
            if ($null -ne $parsed) {
                foreach ($prop in $parsed.PSObject.Properties) {
                    $currentConfig[$prop.Name] = $prop.Value
                }
            }
        }
    } catch {
        Write-Warning "Unable to parse existing settings.json: $_"
    }
}

$isTerminalSandboxEnabled = ($currentConfig.ContainsKey('enableTerminalSandbox') -and $currentConfig['enableTerminalSandbox'] -eq $true)
$isToolPermissionProceedInSandbox = ($currentConfig.ContainsKey('toolPermission') -and $currentConfig['toolPermission'] -eq 'proceed-in-sandbox')

$isValid = $isTerminalSandboxEnabled -and $isToolPermissionProceedInSandbox

if ($ValidateOnly) {
    $report = [ordered]@{
        settingsPath = $settingsFile
        exists = $fileExists
        enableTerminalSandbox = if ($currentConfig.ContainsKey('enableTerminalSandbox')) { $currentConfig['enableTerminalSandbox'] } else { $null }
        toolPermission = if ($currentConfig.ContainsKey('toolPermission')) { $currentConfig['toolPermission'] } else { $null }
        isValid = $isValid
    }
    $report | ConvertTo-Json -Depth 3
    if (-not $isValid) { exit 1 } else { exit 0 }
}

if (-not $fileExists -or -not $isValid) {
    if (-not (Test-Path -LiteralPath $settingsDir -PathType Container)) {
        [void][System.IO.Directory]::CreateDirectory($settingsDir)
    }

    $currentConfig['enableTerminalSandbox'] = $true
    $currentConfig['toolPermission'] = 'proceed-in-sandbox'

    $jsonOutput = $currentConfig | ConvertTo-Json -Depth 5
    [System.IO.File]::WriteAllText($settingsFile, $jsonOutput, [System.Text.Encoding]::UTF8)
}

$finalReport = [ordered]@{
    settingsPath = $settingsFile
    status = if ($isValid) { 'already_configured' } else { 'updated' }
    enableTerminalSandbox = $currentConfig['enableTerminalSandbox']
    toolPermission = $currentConfig['toolPermission']
    isValid = $true
}

$finalReport | ConvertTo-Json -Depth 3
exit 0
