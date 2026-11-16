# Mise à l'échelle : temps de réponse en fonction du volume de données, puis débit en fonction du
# nombre d'utilisateurs simultanés. Résultats en CSV dans infra/perf/results/ (analyse : model.py).
# Coût : 0 € — tout tourne en local. Les données de test sont retirées à la fin (cleanup-perf.sql).
param(
  [int[]]$Volumes = @(0, 1000, 10000, 100000),   # acteurs fictifs ajoutés aux 102 acteurs de démo
  [int]$Runs = 7,
  [int]$ExplainRuns = 3,
  [int[]]$Users = @(1, 2, 4, 8, 16, 32),
  [string]$Base = "http://localhost:8080/api",
  [switch]$KeepData
)
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$OutputEncoding = New-Object Text.UTF8Encoding $false   # accents corrects vers psql
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$out = Join-Path $here "results"; New-Item -ItemType Directory -Force $out | Out-Null
$pgUser = docker exec casting-postgres printenv POSTGRES_USER
$pgDb = docker exec casting-postgres printenv POSTGRES_DB
function Sql([string]$file, [hashtable]$vars = @{}) {
  $args2 = @('exec', '-i', 'casting-postgres', 'psql', '-q', '-U', $pgUser, '-d', $pgDb, '-v', 'ON_ERROR_STOP=1')
  foreach ($k in $vars.Keys) { $args2 += @('-v', "$k=$($vars[$k])") }
  Get-Content (Join-Path $here $file) -Raw -Encoding UTF8 | & docker @args2 | Out-Null
}
# Début du test : les recherches lancées par le test seront retirées de l'historique à la fin
$startedAt = (docker exec casting-postgres psql -U $pgUser -d $pgDb -t -A -c "select now()").Trim()
function Count() { [int](docker exec casting-postgres psql -U $pgUser -d $pgDb -t -A -c "select count(*) from actors") }

$login = Invoke-RestMethod -Method Post "$Base/auth/login" -ContentType "application/json" `
  -Body '{"email":"ahmed@casting.com","password":"password123"}'
$h = @{ Authorization = "Bearer $($login.accessToken)" }
function Post($path, $obj) {
  $b = [Text.Encoding]::UTF8.GetBytes(($obj | ConvertTo-Json -Compress))
  Invoke-RestMethod -Method Post "$Base$path" -Headers $h -ContentType "application/json; charset=utf-8" -Body $b
}
$q = "femme entre 25 et 35 ans parlant anglais"
$endpoints = [ordered]@{
  "liste_page1"     = { Invoke-RestMethod "$Base/actors/search?page=0&size=24&sortBy=lastName" -Headers $h }
  "filtre_combine"  = { Invoke-RestMethod "$Base/actors/search?gender=Femme&minAge=25&maxAge=35&city=Paris&size=24" -Headers $h }
  "recherche_nom"   = { Invoke-RestMethod "$Base/actors/search?search=perf12&size=24" -Headers $h }
  "statistiques"    = { Invoke-RestMethod "$Base/dashboard/stats" -Headers $h }
  "ia_classement"   = { Post "/ai/search" @{ query = $q; page = 0; size = 10 } }
}

# ── 1. Temps de réponse selon le volume ──
Sql "cleanup-perf.sql"
$csv = Join-Path $out "volume.csv"
"acteurs,endpoint,essai,ms" | Set-Content $csv -Encoding UTF8
$done = 0
foreach ($v in $Volumes) {
  if ($v -gt $done) {
    Write-Host "Chargement de $($v - $done) acteurs fictifs…"
    $sw = [Diagnostics.Stopwatch]::StartNew()
    for ($s = $done + 1; $s -le $v; $s += 20000) { Sql "seed-perf-range.sql" @{ debut = $s; fin = [Math]::Min($v, $s + 19999) } }
    Write-Host ("  chargé en {0:N0} s" -f $sw.Elapsed.TotalSeconds)
    $done = $v
  }
  $n = Count
  Write-Host "== $n acteurs =="
  foreach ($name in $endpoints.Keys) {
    & $endpoints[$name] | Out-Null                       # échauffement
    for ($i = 1; $i -le $Runs; $i++) {
      $ms = (Measure-Command { & $endpoints[$name] | Out-Null }).TotalMilliseconds
      "$n,$name,$i,$([math]::Round($ms, 1))" | Add-Content $csv -Encoding UTF8
    }
  }
  # Explication par l'IA (top 5) : coût attendu indépendant du volume
  $ids = @((Post "/ai/search" @{ query = $q; page = 0; size = 10 }).results | Select-Object -First 5 | ForEach-Object { $_.id })
  for ($i = 1; $i -le $ExplainRuns; $i++) {
    $ms = (Measure-Command { Post "/ai/explain" @{ query = $q; actorIds = $ids } | Out-Null }).TotalMilliseconds
    "$n,ia_explication,$i,$([math]::Round($ms, 1))" | Add-Content $csv -Encoding UTF8
  }
  Write-Host "  mesures enregistrées"
}

# ── 2. Débit selon le nombre d'utilisateurs simultanés (au plus grand volume) ──
Add-Type -AssemblyName System.Net.Http
$client = New-Object System.Net.Http.HttpClient
$client.DefaultRequestHeaders.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", $login.accessToken)
$csv2 = Join-Path $out "concurrence.csv"
"acteurs,endpoint,utilisateurs,requetes,secondes,debit_req_s,latence_moy_ms" | Set-Content $csv2 -Encoding UTF8
$n = Count
$targets = [ordered]@{
  "filtre_combine" = "$Base/actors/search?gender=Femme&minAge=25&maxAge=35&city=Paris&size=24"
  "ia_classement"  = "POST"
}
foreach ($name in $targets.Keys) {
  foreach ($u in $Users) {
    $perUser = [Math]::Max(4, [int](48 / $u))
    $total = $u * $perUser
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $tasks = New-Object System.Collections.Generic.List[System.Threading.Tasks.Task]
    $sent = 0
    # u requêtes en vol en permanence : dès qu'une se termine, la suivante part
    while ($sent -lt $total -or $tasks.Count -gt 0) {
      while ($tasks.Count -lt $u -and $sent -lt $total) {
        if ($targets[$name] -eq "POST") {
          $body = New-Object System.Net.Http.StringContent((@{ query = $q; page = 0; size = 10 } | ConvertTo-Json -Compress), [Text.Encoding]::UTF8, "application/json")
          $tasks.Add($client.PostAsync("$Base/ai/search", $body))
        } else { $tasks.Add($client.GetAsync($targets[$name])) }
        $sent++
      }
      $i = [System.Threading.Tasks.Task]::WaitAny($tasks.ToArray())
      $tasks.RemoveAt($i)
    }
    $sec = $sw.Elapsed.TotalSeconds
    $x = $total / $sec
    "$n,$name,$u,$total,$([math]::Round($sec, 3)),$([math]::Round($x, 2)),$([math]::Round(1000 * $u / $x, 1))" | Add-Content $csv2 -Encoding UTF8
    Write-Host ("{0} · {1,2} utilisateurs : {2:N1} req/s" -f $name, $u, $x)
  }
}

# Retire de l'historique les recherches faites par le test (sinon elles masquent les vraies)
docker exec casting-postgres psql -U $pgUser -d $pgDb -q -c "delete from search_history where created_at >= '$startedAt' and query = '$q'" | Out-Null
if (-not $KeepData) { Sql "cleanup-perf.sql"; Write-Host "Données de test retirées ($(Count) acteurs)." }
Write-Host "Résultats : $out"
