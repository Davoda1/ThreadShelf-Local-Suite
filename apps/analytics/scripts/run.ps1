[CmdletBinding()]
param([switch]$Pinned,[switch]$System,[switch]$Build,[switch]$Test,[switch]$Package,[switch]$Run)
$ErrorActionPreference='Stop'
$projectDir=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $projectDir
if((@($Build,$Test,$Package,$Run)|Where-Object{$_}).Count -gt 1){throw 'Select only one action.'}
if($System -and $Pinned){throw 'Select pinned LTS (default/-Pinned) or -System.'}
if(-not $System){
 [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
 if($env:PROCESSOR_ARCHITECTURE -eq 'ARM64'){throw 'This project targets Windows x64.'}
 $toolingDir=Join-Path $projectDir '.tooling'; $downloadDir=Join-Path $toolingDir 'downloads'
 New-Item -ItemType Directory -Path $downloadDir -Force|Out-Null
 $sumPath=Join-Path $downloadDir 'SHASUMS256.txt'
 Invoke-WebRequest -UseBasicParsing -Uri 'https://nodejs.org/dist/v24.19.0/SHASUMS256.txt' -OutFile $sumPath
 $pattern='^([a-fA-F0-9]{64})\s+(node-v[0-9.]+-win-x64\.zip)$'
 $entry=@(Get-Content -LiteralPath $sumPath|ForEach-Object{if($_ -match $pattern){@{Hash=$Matches[1];File=$Matches[2]}}})
 if($entry.Count -ne 1){throw 'Cannot resolve pinned Node.js 24.19.0 LTS.'}
 $archivePath=Join-Path $downloadDir $entry[0].File
 if((Test-Path -LiteralPath $archivePath) -and (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash -ne $entry[0].Hash){Remove-Item -LiteralPath $archivePath -Force}
 if(-not(Test-Path -LiteralPath $archivePath)){
  $nodeVersion=($entry[0].File -split '-')[1]
  Invoke-WebRequest -UseBasicParsing -Uri ('https://nodejs.org/dist/'+$nodeVersion+'/'+$entry[0].File) -OutFile ($archivePath+'.part')
  Move-Item -LiteralPath ($archivePath+'.part') -Destination $archivePath -Force
 }
 if((Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash -ne $entry[0].Hash){throw 'Node.js archive checksum mismatch.'}
 $nodeDir=Join-Path $toolingDir ([IO.Path]::GetFileNameWithoutExtension($entry[0].File))
 $downloadedNode=Join-Path $nodeDir 'node.exe'; $extract=-not(Test-Path -LiteralPath $downloadedNode)
 if(-not $extract){try{& $downloadedNode --version|Out-Null; $extract=$LASTEXITCODE -ne 0}catch{$extract=$true}}
 if($extract){Expand-Archive -LiteralPath $archivePath -DestinationPath $toolingDir -Force}
 $env:Path=$nodeDir+[IO.Path]::PathSeparator+$env:Path
}
$nodeCommand=Get-Command node.exe -ErrorAction Stop
$npmCommand=Get-Command npm.cmd -ErrorAction Stop
function Invoke-Checked([string]$Program,[string[]]$Arguments){& $Program @Arguments; if($LASTEXITCODE -ne 0){throw ('Command failed: '+$Program+' ('+$LASTEXITCODE+')')}}
Invoke-Checked $nodeCommand.Source @('-e',"if(Number(process.versions.node.split('.')[0])<24) throw Error('Node 24+ required')")
Invoke-Checked $nodeCommand.Source @('--version'); Invoke-Checked $npmCommand.Source @('--version')
Invoke-Checked $npmCommand.Source @('ci','--ignore-scripts','--no-audit','--no-fund')
Invoke-Checked $nodeCommand.Source @('scripts/ensure-electron.mjs')
Invoke-Checked $npmCommand.Source @('run','build')
if($Test){Invoke-Checked $npmCommand.Source @('test')}
elseif($Package){Invoke-Checked $npmCommand.Source @('test'); Invoke-Checked $npmCommand.Source @('run','package','--','--win32','--source')}
elseif($Run){Invoke-Checked $npmCommand.Source @('start')}
