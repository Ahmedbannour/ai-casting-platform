# Garde le site (port 4200) en marche : relance serveur-demo.js s'il s'arrête.
# Lancement : Start-Process powershell -ArgumentList '-ExecutionPolicy','Bypass','-File','scripts\site-permanent.ps1' -WindowStyle Hidden
$racine = Split-Path $PSScriptRoot -Parent
while ($true) {
  if (-not (Get-NetTCPConnection -LocalPort 4200 -State Listen -ErrorAction SilentlyContinue)) {
    Start-Process node -ArgumentList (Join-Path $PSScriptRoot 'serveur-demo.js'),'4200' -WorkingDirectory $racine -WindowStyle Hidden
  }
  Start-Sleep 5
}
