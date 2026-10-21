$ErrorActionPreference = 'Stop'
python (Join-Path $PSScriptRoot 'build-suite.py') @args
exit $LASTEXITCODE
