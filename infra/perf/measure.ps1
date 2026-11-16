# Mesure des temps de réponse de l'API (médiane et pire cas sur N appels).
param([int]$Runs = 5, [string]$Base = "http://localhost:8080/api")
$login = Invoke-RestMethod -Method Post "$Base/auth/login" -ContentType "application/json" `
    -Body '{"email":"ahmed@casting.com","password":"password123"}'
$h = @{ Authorization = "Bearer $($login.accessToken)" }

function Measure-Call($name, [scriptblock]$call) {
    & $call | Out-Null   # échauffement
    $times = 1..$Runs | ForEach-Object { (Measure-Command { & $call | Out-Null }).TotalMilliseconds }
    $s = $times | Sort-Object
    "{0,-48} médiane {1,6:N0} ms   max {2,6:N0} ms" -f $name, $s[[int][math]::Floor($s.Count / 2)], $s[-1]
}
function Ai($q, $page = 0) {
    $body = [Text.Encoding]::UTF8.GetBytes((@{ query = $q; page = $page; size = 10 } | ConvertTo-Json))
    Invoke-RestMethod -Method Post "$Base/ai/search" -Headers $h -ContentType "application/json; charset=utf-8" -Body $body
}

Measure-Call "Tableau de bord : liste page 1"          { Invoke-RestMethod "$Base/actors/search?page=0&size=20" -Headers $h }
Measure-Call "Tableau de bord : page 200"              { Invoke-RestMethod "$Base/actors/search?page=200&size=20" -Headers $h }
Measure-Call "Tableau de bord : tri par âge"           { Invoke-RestMethod "$Base/actors/search?sortBy=age&size=20" -Headers $h }
Measure-Call "Tableau de bord : femme 25-35 à Paris"   { Invoke-RestMethod "$Base/actors/search?gender=Femme&minAge=25&maxAge=35&city=paris" -Headers $h }
Measure-Call "Tableau de bord : recherche nom 'perf12'" { Invoke-RestMethod "$Base/actors/search?search=perf12" -Headers $h }
Measure-Call "Statistiques"                            { Invoke-RestMethod "$Base/dashboard/stats" -Headers $h }
Measure-Call "IA : femme 25-35 ans parlant anglais"    { Ai "femme entre 25 et 35 ans parlant anglais" }
Measure-Call "IA : homme 40 ans à Paris, danse"        { Ai "acteur homme de 40 ans à Paris qui fait de la danse" }
Measure-Call "IA : même recherche, page 5"             { Ai "femme entre 25 et 35 ans parlant anglais" 5 }

$r = Ai "femme entre 25 et 35 ans parlant anglais"
"Résultats IA : $($r.totalResults) au total, $($r.results.Count) par page, page suivante : $($r.hasMore)"
