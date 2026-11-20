# Recette complète du cycle publicitaire (cahier v2), fenêtres visibles si -Visible.
# Chaque parcours crée ses comptes « recette.*@exemple.tn », effacés à la fin par nettoyer-recette.sql.
param([switch]$Visible)
$env:NODE_PATH = "$env:TEMP\pw\node_modules"
if ($Visible) { $env:HEADED = '1' } else { Remove-Item Env:HEADED -ErrorAction SilentlyContinue }
$parcours = 'test-six-roles','test-figuration','test-inscription-pro','test-demandes','test-agence-v0','test-v1','test-attentes','test-v2','test-role-figuration','test-intention-chat'
$bilan = @()
foreach ($p in $parcours) {
  $t = Get-Date
  $out = node "$PSScriptRoot\$p.js" 2>&1 | Out-String
  $ok = $LASTEXITCODE -eq 0 -and $out -notmatch '"erreurs": \[\s*"' -and $out -notmatch 'Error:'
  $bilan += [pscustomobject]@{ Parcours = $p; Resultat = $(if ($ok) { 'OK' } else { 'ECHEC' }); Secondes = [int]((Get-Date) - $t).TotalSeconds }
  Set-Content "$env:TEMP\recette-$p.txt" $out
}
Get-Content "$PSScriptRoot\nettoyer-recette.sql" -Raw | docker exec -i casting-postgres psql -U casting_user -d casting_db -v ON_ERROR_STOP=1 | Out-Null
$bilan | Format-Table -AutoSize | Out-String
