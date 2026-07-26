$ErrorActionPreference = "Stop"

$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$siteRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot "_site"))
$projectPrefix = $projectRoot.TrimEnd([char]'\') + '\'
if (-not $siteRoot.StartsWith(
  $projectPrefix,
  [StringComparison]::OrdinalIgnoreCase
)) {
  throw "Pages output directory is outside the project"
}

$pagesRepository = if ([string]::IsNullOrWhiteSpace($env:PAGES_REPOSITORY)) {
  "mealcompass-web/mealcompass-web.github.io"
} else {
  $env:PAGES_REPOSITORY.Trim()
}
if ($pagesRepository -notmatch "^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$") {
  throw "PAGES_REPOSITORY must use the owner/repository format"
}

& npm.cmd run build:pages
if ($LASTEXITCODE -ne 0) {
  throw "GitHub Pages build failed"
}
if (-not (Test-Path -LiteralPath (Join-Path $siteRoot "index.html") -PathType Leaf)) {
  throw "Pages build output is incomplete"
}

function Invoke-PagesGit {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
  & git -C $siteRoot @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Git command failed: git $($Arguments -join ' ')"
  }
}

$remoteUrl = "https://github.com/$pagesRepository.git"
Invoke-PagesGit -Arguments @("init")
Invoke-PagesGit -Arguments @("checkout", "-B", "main")
Invoke-PagesGit -Arguments @("add", "--all")
Invoke-PagesGit -Arguments @(
  "-c",
  "user.name=meal-compass-pages",
  "-c",
  "user.email=pages@users.noreply.github.com",
  "commit",
  "-m",
  "Deploy Meal Compass"
)
Invoke-PagesGit -Arguments @("push", "--force", $remoteUrl, "main")

Write-Host "GitHub Pages pushed: $pagesRepository"
Write-Host "Public URL: https://$($pagesRepository.Split('/')[0]).github.io/"
