<#
.SYNOPSIS
  Nightly watcher for open issues on brashler/Flit.

.DESCRIPTION
  Queries the GitHub API for open issues (PRs filtered out), writes a
  timestamped report and a latest.json snapshot to
  %LOCALAPPDATA%\Flit\issue-watch\. Unauthenticated: public repo, a few
  requests per night, far below rate limits.

  Scheduled via Windows Task Scheduler (task name: "Flit Issue Watch").
#>

$ErrorActionPreference = 'Stop'

$repo = 'brashler/Flit'
$outDir = Join-Path $env:LOCALAPPDATA 'Flit\issue-watch'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$headers = @{
  'User-Agent' = 'flit-issue-watch (https://github.com/brashler/Flit)'
  'Accept'     = 'application/vnd.github+json'
}

$uri = "https://api.github.com/repos/$repo/issues?state=open&per_page=100"
try {
  $response = Invoke-RestMethod -Uri $uri -Headers $headers -TimeoutSec 30
} catch {
  $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  "$stamp ERROR querying GitHub: $($_.Exception.Message)" |
    Out-File -Append -FilePath (Join-Path $outDir 'watch.log') -Encoding utf8
  exit 1
}

# The issues endpoint also lists pull requests; drop them.
$issues = @($response | Where-Object { -not $_.pull_request })

$stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
$summary = @("$stamp - $($issues.Count) open issue(s) on $repo")
foreach ($issue in $issues) {
  $summary += "  #$($issue.number) [$($issue.user.login)] $($issue.title) - $($issue.html_url)"
}
$summary | Out-File -Append -FilePath (Join-Path $outDir 'watch.log') -Encoding utf8

$snapshot = [ordered]@{
  checkedAt = (Get-Date).ToUniversalTime().ToString('o')
  repo      = $repo
  openCount = $issues.Count
  issues    = @($issues | ForEach-Object {
      [ordered]@{
        number = $_.number
        title  = $_.title
        author = $_.user.login
        url    = $_.html_url
        labels = @($_.labels | ForEach-Object { $_.name })
      }
    })
}
$snapshot | ConvertTo-Json -Depth 4 |
  Out-File -FilePath (Join-Path $outDir 'latest.json') -Encoding utf8

# Console output ends up in the task's last-run result if anyone watches.
$summary | ForEach-Object { Write-Output $_ }
exit 0
