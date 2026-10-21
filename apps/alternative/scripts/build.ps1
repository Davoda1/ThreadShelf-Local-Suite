# Development/build entry only. This script is excluded from runtime packages.
$ErrorActionPreference = 'Stop'
if (Get-Command py -ErrorAction SilentlyContinue) {
    & py -3 (Join-Path $PSScriptRoot 'build.py') @args
} else {
    & python (Join-Path $PSScriptRoot 'build.py') @args
}
exit $LASTEXITCODE
