# Mesure du temps de réponse de l'IA locale (Ollama) sur ce PC.
# Usage : powershell -File infra\perf\bench-ia.ps1 [-Model llama3.2] [-Runs 2]
# Coût : 0 € — tout tourne en local. Compte de démonstration local uniquement.
param(
  [string]$Api = "http://localhost:8080/api",
  [string]$Ollama = "http://localhost:11434",
  [string]$Model = "llama3.2",
  [int]$Runs = 2,
  [string]$Email = "ahmed@casting.com",
  [string]$Password = "password123"
)
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.Encoding]::UTF8

function Ms($sw) { [math]::Round($sw.Elapsed.TotalMilliseconds) }

# 1. Vitesse brute d'Ollama : lecture du prompt et écriture de la réponse (jetons/s)
$prompt = ("Tu es un expert casting. Profil : actrice de 28 ans, Lyon, parle français et anglais, danse et chant. " * 12) +
          "Explique en 3 phrases pourquoi ce profil convient à un rôle de jeune avocate bilingue."
$body = @{ model = $Model; prompt = $prompt; stream = $false; options = @{ num_predict = 120; temperature = 0.1 } } | ConvertTo-Json -Depth 4
Write-Host "== Ollama brut ($Model) =="
for ($i = 1; $i -le $Runs; $i++) {
  $r = Invoke-RestMethod -Method Post -Uri "$Ollama/api/generate" -Body ([Text.Encoding]::UTF8.GetBytes($body)) -ContentType "application/json" -TimeoutSec 600
  $load = [math]::Round($r.load_duration / 1e6)
  $pe   = if ($r.prompt_eval_duration) { [math]::Round($r.prompt_eval_count / ($r.prompt_eval_duration / 1e9), 1) } else { 0 }
  $ev   = [math]::Round($r.eval_count / ($r.eval_duration / 1e9), 1)
  $tot  = [math]::Round($r.total_duration / 1e6)
  Write-Host ("essai {0} : total {1} ms | chargement {2} ms | lecture {3} jetons/s | écriture {4} jetons/s ({5} jetons)" -f $i, $tot, $load, $pe, $ev, $r.eval_count)
}

# 2. Parcours réel de l'application : recherche (base) puis explication (IA)
$login = Invoke-RestMethod -Method Post -Uri "$Api/auth/login" -ContentType "application/json" -Body (@{ email = $Email; password = $Password } | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($login.accessToken)" }
$q = "Je cherche une femme entre 25 et 35 ans parlant anglais"
Write-Host "== Application =="
for ($i = 1; $i -le $Runs; $i++) {
  $sw = [Diagnostics.Stopwatch]::StartNew()
  $s = Invoke-RestMethod -Method Post -Uri "$Api/ai/search" -Headers $h -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes((@{ query = $q; page = 0; size = 10 } | ConvertTo-Json)))
  $tSearch = Ms $sw
  $ids = @($s.results | Select-Object -First 5 | ForEach-Object { $_.id })
  $sw.Restart()
  $e = Invoke-RestMethod -Method Post -Uri "$Api/ai/explain" -Headers $h -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes((@{ query = $q; actorIds = $ids } | ConvertTo-Json)))
  $tExplain = Ms $sw
  $n = @($e.PSObject.Properties).Count
  Write-Host ("essai {0} : cartes affichées en {1} ms | explication IA en {2} ms ({3} profils expliqués)" -f $i, $tSearch, $tExplain, $n)
}
