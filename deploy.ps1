$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repoRoot

$remoteUrl = 'https://github.com/Artovastudio/Artrova.git'
$mainBranch = 'main'
$pagesBranch = 'gh-pages'

function ExecGit([string[]]$gitArgs) {
  & git @gitArgs
  if ($LASTEXITCODE -ne 0) {
    $joined = ($gitArgs -join ' ')
    throw "git $joined failed (exit $LASTEXITCODE)"
  }
}

# 0) Ensure origin
$hasOrigin = $false
try {
  $originUrl = (& git remote get-url origin 2>$null)
  if ($LASTEXITCODE -eq 0 -and $originUrl) { $hasOrigin = $true }
} catch {}

if (-not $hasOrigin) {
  ExecGit @('remote','add','origin',$remoteUrl)
} else {
  if ($originUrl.Trim() -ne $remoteUrl) {
    ExecGit @('remote','set-url','origin',$remoteUrl)
  }
}

# 1) Cleanup known-unused (safe, only if exists)
$pathsToDelete = @(
  'tools',
  'assets\\images',
  'assets\\images_backup',
  'data\\valore_projects.json',
  'image-inventory.csv',
  'rename-plan.csv'
)

foreach ($p in $pathsToDelete) {
  if (Test-Path -LiteralPath $p) {
    try { ExecGit @('rm','-r','-f',$p) } catch {}
    if (Test-Path -LiteralPath $p) {
      Remove-Item -Recurse -Force -LiteralPath $p
    }
  }
}

# remove backup files in repo root if any
Get-ChildItem -File -Force -Path $repoRoot -Filter '*.bak*' -ErrorAction SilentlyContinue | ForEach-Object {
  try { ExecGit @('rm','-f', $_.FullName) } catch {}
  try { Remove-Item -Force -LiteralPath $_.FullName } catch {}
}

# 2) Commit changes on main (if any)
ExecGit @('checkout',$mainBranch)
ExecGit @('add','-A')

$porcelain = (& git status --porcelain)
if ($porcelain) {
  ExecGit @('commit','-m','chore: cleanup and prepare deploy')
}

# 3) Push main
ExecGit @('push','-u','origin',$mainBranch,'--progress')

# 4) Deploy to GitHub Pages via gh-pages worktree (only site files)
$worktreeDir = Join-Path $repoRoot '.gh-pages-worktree'
if (Test-Path -LiteralPath $worktreeDir) {
  try { ExecGit @('worktree','remove','--force',$worktreeDir) } catch {}
  if (Test-Path -LiteralPath $worktreeDir) { Remove-Item -Recurse -Force -LiteralPath $worktreeDir }
}

ExecGit @('fetch','origin','--prune')

$remotePagesExists = $false
try {
  & git show-ref --verify --quiet "refs/remotes/origin/$pagesBranch"
  if ($LASTEXITCODE -eq 0) { $remotePagesExists = $true }
} catch {}

if ($remotePagesExists) {
  ExecGit @('worktree','add','-B',$pagesBranch,$worktreeDir,"origin/$pagesBranch")
} else {
  ExecGit @('worktree','add','-B',$pagesBranch,$worktreeDir)
}

# wipe worktree content
Get-ChildItem -Force -LiteralPath $worktreeDir | Where-Object { $_.Name -ne '.git' } | Remove-Item -Recurse -Force

# allowlist to publish
$publishFiles = @(
  'index.html',
  'admin.html',
  'admin_v2.html',
  'service-worker.js',
  'manifest.json',
  'robots.txt',
  'sitemap.xml',
  'assets',
  'data',
  'images'
)

foreach ($item in $publishFiles) {
  $src = Join-Path $repoRoot $item
  $dst = Join-Path $worktreeDir $item
  if (Test-Path -LiteralPath $src) {
    if (Test-Path -LiteralPath $src -PathType Container) {
      New-Item -ItemType Directory -Force -Path $dst | Out-Null
      & robocopy $src $dst /MIR /NFL /NDL /NJH /NJS /NC /NS | Out-Null
    } else {
      Copy-Item -Force -LiteralPath $src -Destination $dst
    }
  }
}

# (optional) prevent Jekyll from ignoring dirs that start with underscores
New-Item -ItemType File -Force -Path (Join-Path $worktreeDir '.nojekyll') | Out-Null

Push-Location $worktreeDir
try {
  ExecGit @('add','-A')
  $pagesStatus = (& git status --porcelain)
  if ($pagesStatus) {
    ExecGit @('commit','-m','deploy: GitHub Pages')
  }
  ExecGit @('push','-u','origin',$pagesBranch,'--force','--progress')
} finally {
  Pop-Location
}

# cleanup worktree
try { ExecGit @('worktree','remove','--force',$worktreeDir) } catch {}
if (Test-Path -LiteralPath $worktreeDir) { Remove-Item -Recurse -Force -LiteralPath $worktreeDir }

Write-Host "DEPLOY_OK"
Write-Host "If GitHub Pages is enabled for branch '$pagesBranch', your site URL will be:"
Write-Host "https://artovastudio.github.io/Artrova/"
