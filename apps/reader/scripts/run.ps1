[CmdletBinding()]
param(
    [switch]$Latest, [switch]$Build, [switch]$Test, [switch]$Package,
    [switch]$ResolveOnly, [string]$NodeVersion = '24.19.0', [string]$ElectronVersion = '44.9.1'
)
$ErrorActionPreference = 'Stop'
$projectDir = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $projectDir
if ((@($Build, $Test, $Package, $ResolveOnly) | Where-Object { $_ }).Count -gt 1) { throw 'Select only one of -Build, -Test, -Package, or -ResolveOnly.' }
if ($Latest) {
    if ($PSBoundParameters.ContainsKey('NodeVersion') -or $PSBoundParameters.ContainsKey('ElectronVersion')) { throw '-Latest cannot be combined with exact version options.' }
    $NodeVersion = ''; $ElectronVersion = ''
}
foreach ($version in @($NodeVersion, $ElectronVersion)) {
    if ($version -and $version -notmatch '^v?[1-9][0-9]*\.[0-9]+\.[0-9]+$') { throw ('Expected an exact stable version: ' + $version) }
}
if ($env:OS -ne 'Windows_NT') { throw 'This script targets Windows. Use scripts/run.sh on GNU/Linux.' }
function Invoke-Checked([string]$Program, [string[]]$Arguments) {
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw ('Command failed with exit code ' + $LASTEXITCODE + ': ' + $Program) }
}
function Get-OfficialFile([string]$Uri, [string]$Destination) {
    Invoke-WebRequest -UseBasicParsing -Uri $Uri -OutFile $Destination -TimeoutSec 300
}
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$architecture = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
$arch = switch ($architecture.ToUpperInvariant()) { 'ARM64' { 'arm64' }; 'AMD64' { 'x64' }; default { throw 'Unsupported CPU architecture.' } }
$toolingDir = Join-Path $projectDir '.tooling'
$downloadDir = Join-Path $toolingDir 'downloads'
New-Item -ItemType Directory -Path $downloadDir -Force | Out-Null
$sumPath = Join-Path $downloadDir ('node-sums.' + [Guid]::NewGuid().ToString('N'))
$indexPath = Join-Path $downloadDir ('node-index.' + [Guid]::NewGuid().ToString('N'))
$preserve = @{}
foreach ($name in @('Path', 'TSLR_NODE_VERSION', 'TSLR_NODE_CHANNEL', 'TSLR_NODE_INDEX_FILE', 'TSLR_NODE_SHA256', 'TSLR_ELECTRON_VERSION', 'ELECTRON_OVERRIDE_DIST_PATH', 'NODE_USE_ENV_PROXY', 'ONNXRUNTIME_NODE_INSTALL', 'ELECTRON_SKIP_BINARY_DOWNLOAD')) {
    $preserve[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
try {
    $env:TSLR_NODE_CHANNEL = if ($Latest) { 'current' } else { 'lts' }
    if (-not $NodeVersion) {
        Write-Host ('Checking official Node.js ' + $env:TSLR_NODE_CHANNEL + ' releases online...')
        try { Get-OfficialFile 'https://nodejs.org/dist/index.json' $indexPath }
        catch { throw ('Cannot check current Node releases. No cached version is being called latest; retry online or select exact versions explicitly. ' + $_) }
        $releases = Get-Content -LiteralPath $indexPath -Raw | ConvertFrom-Json
        $candidates = @($releases | Where-Object {
            $_.version -match '^v[1-9][0-9]*\.[0-9]+\.[0-9]+$' -and
            [int]($_.version.TrimStart('v').Split('.')[0]) -ge 24 -and
            (($Latest -and $_.lts -is [bool] -and $_.lts -eq $false) -or (-not $Latest -and $_.lts -is [string] -and $_.lts.Length -gt 0))
        } | Sort-Object -Property @{ Expression = { [version]($_.version.TrimStart('v')) }; Descending = $true })
        if ($candidates.Count -eq 0) { throw ('No supported stable Node ' + $env:TSLR_NODE_CHANNEL + ' release found.') }
        $NodeVersion = $candidates[0].version
        $env:TSLR_NODE_INDEX_FILE = $indexPath
    } else {
        $NodeVersion = 'v' + $NodeVersion.TrimStart('v')
        $env:TSLR_NODE_CHANNEL = 'exact'
        $env:TSLR_NODE_INDEX_FILE = $null
    }
    if ([int]($NodeVersion.TrimStart('v').Split('.')[0]) -lt 24) { throw 'Node 24 or newer is required.' }
    $archiveName = 'node-' + $NodeVersion + '-win-' + $arch + '.zip'
    $nodeUrl = 'https://nodejs.org/dist/' + $NodeVersion
    Get-OfficialFile ($nodeUrl + '/SHASUMS256.txt') $sumPath
    $pattern = '^([a-fA-F0-9]{64})\s+' + [regex]::Escape($archiveName) + '$'
    $checksums = @(Get-Content -LiteralPath $sumPath | ForEach-Object { if ($_ -match $pattern) { $Matches[1] } })
    if ($checksums.Count -ne 1) { throw ('Official checksum missing for ' + $archiveName) }
    $expectedHash = $checksums[0]
    $archivePath = Join-Path $downloadDir $archiveName
    if (-not (Test-Path -LiteralPath $archivePath) -or (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash -ne $expectedHash) {
        $part = $archivePath + '.part.' + [Guid]::NewGuid().ToString('N')
        try {
            Get-OfficialFile ($nodeUrl + '/' + $archiveName) $part
            if ((Get-FileHash -LiteralPath $part -Algorithm SHA256).Hash -ne $expectedHash) { throw 'Node archive checksum mismatch.' }
            Move-Item -LiteralPath $part -Destination $archivePath -Force
        } finally { if (Test-Path -LiteralPath $part) { Remove-Item -LiteralPath $part -Force } }
    }
    if ((Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash -ne $expectedHash) { throw 'Node archive checksum mismatch.' }
    $nodeDir = Join-Path $toolingDir ([IO.Path]::GetFileNameWithoutExtension($archiveName))
    $downloadedNode = Join-Path $nodeDir 'node.exe'
    $extractNode = -not (Test-Path -LiteralPath $downloadedNode)
    if (-not $extractNode) {
        try { $actualVersion = & $downloadedNode --version; $extractNode = $LASTEXITCODE -ne 0 -or $actualVersion -ne $NodeVersion } catch { $extractNode = $true }
    }
    if ($extractNode) {
        if (Test-Path -LiteralPath $nodeDir) { Remove-Item -LiteralPath $nodeDir -Recurse -Force }
        Expand-Archive -LiteralPath $archivePath -DestinationPath $toolingDir -Force
    }
    $actualVersion = & $downloadedNode --version
    if ($LASTEXITCODE -ne 0 -or $actualVersion -ne $NodeVersion) { throw 'Extracted Node version does not match the selected release.' }
    $env:Path = $nodeDir + [IO.Path]::PathSeparator + $env:Path
    $env:TSLR_NODE_VERSION = $NodeVersion
    $env:TSLR_NODE_SHA256 = $expectedHash.ToLowerInvariant()
    if ($env:HTTPS_PROXY -or $env:HTTP_PROXY) { $env:NODE_USE_ENV_PROXY = '1' }
    $resolveArgs = @('scripts/runtime-policy.mjs')
    if ($ElectronVersion) { $resolveArgs += @('--electron-version', $ElectronVersion) }
    $resolvedElectron = & $downloadedNode @resolveArgs
    if ($LASTEXITCODE -ne 0) { throw 'Electron release resolution failed.' }
    $env:TSLR_ELECTRON_VERSION = [string]$resolvedElectron
    $env:ELECTRON_OVERRIDE_DIST_PATH = Join-Path $toolingDir ('electron-' + $resolvedElectron + '-win32-' + $arch + '/dist')
    # npm.cmd may redirect to a global npm prefix. Use the selected distribution
    # directly so installation, packaging and the toolchain record agree.
    $npmCLI = Join-Path $nodeDir 'node_modules/npm/bin/npm-cli.js'
    $npmVersion = & $downloadedNode $npmCLI --version
    if ($LASTEXITCODE -ne 0) { throw 'The selected Node distribution does not contain a working npm.' }
    Write-Host ('Selected Node ' + $NodeVersion + ' (' + $env:TSLR_NODE_CHANNEL + '); npm ' + $npmVersion + '; Electron ' + $resolvedElectron + ' (stable).')
    Write-Host 'Exact selections recorded in .tooling/toolchain.json.'
    if ($ResolveOnly) { return }
    $env:ONNXRUNTIME_NODE_INSTALL = 'skip'
    $env:ELECTRON_SKIP_BINARY_DOWNLOAD = '1'
    Invoke-Checked $downloadedNode @($npmCLI, 'ci', '--include=optional')
    Invoke-Checked $downloadedNode @('scripts/ensure-electron.mjs')
    Invoke-Checked $downloadedNode @($npmCLI, 'run', 'build')
    if ($Test) { Invoke-Checked $downloadedNode @($npmCLI, 'test') }
    elseif ($Package) { Invoke-Checked $downloadedNode @($npmCLI, 'run', 'package', '--', '--win32') }
    elseif (-not $Build) { Invoke-Checked $downloadedNode @($npmCLI, 'start') }
} finally {
    foreach ($name in $preserve.Keys) { [Environment]::SetEnvironmentVariable($name, $preserve[$name], 'Process') }
    foreach ($file in @($sumPath, $indexPath)) { if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file -Force } }
}
