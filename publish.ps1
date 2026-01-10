$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repoRoot

$remoteUrl = 'https://github.com/Artovastudio/Artrova.git'
$branch = 'main'

try { Stop-Process -Name git -Force -ErrorAction SilentlyContinue } catch {}
try { Stop-Process -Name ssh -Force -ErrorAction SilentlyContinue } catch {}
try { Stop-Process -Name curl -Force -ErrorAction SilentlyContinue } catch {}

& git config --global http.postBuffer 524288000 | Out-Null
& git config --global http.lowSpeedLimit 0 | Out-Null
& git config --global http.lowSpeedTime 999999 | Out-Null
& git config --global core.compression 0 | Out-Null

$existingRemote = ''
try { $existingRemote = (& git remote get-url origin 2>$null) } catch {}
if (-not $existingRemote) {
  & git remote add origin $remoteUrl
} elseif ($existingRemote -ne $remoteUrl) {
  & git remote set-url origin $remoteUrl
}

& git fetch origin | Out-Null

$headBranch = (& git rev-parse --abbrev-ref HEAD).Trim()
if ($headBranch -ne $branch) {
  & git branch -M $branch | Out-Null
}

& git add -A

$status = (& git status --porcelain)
if ($status) {
  & git commit -m "chore: reorganize assets and cleanup" | Out-Null
}

$maxRetries = 3
for ($i = 1; $i -le $maxRetries; $i++) {
  try {
    & git push -u origin $branch --progress
    Write-Host "PUSH_OK"
    exit 0
  } catch {
    if ($i -ge $maxRetries) { throw }
    Start-Sleep -Seconds (10 * $i)
  }
}
