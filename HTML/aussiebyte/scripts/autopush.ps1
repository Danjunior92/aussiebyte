param(
  [string]$Message,
  [string]$RemoteUrl = 'https://github.com/Danjunior92/aussiebyte.git',
  [switch]$ForceRemote
)

# Auto-push script for Windows PowerShell
# Stages all changes, creates a commit (uses timestamped message if none provided), and pushes to origin main.

Set-Location -Path $PSScriptRoot\..  # change to repo root (scripts/..)

# Ensure git is available
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Error "git is not installed or not in PATH"
  exit 1
}

# Ensure origin remote exists and points to the expected URL (or set when forced)
try {
  $currentOrigin = git remote get-url origin 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $currentOrigin) {
    Write-Output "No origin remote found. Adding origin -> $RemoteUrl"
    git remote add origin $RemoteUrl
  } elseif ($currentOrigin -ne $RemoteUrl) {
    if ($ForceRemote) {
      Write-Output "Origin remote differs ($currentOrigin). Updating to $RemoteUrl (forced)."
      git remote remove origin
      git remote add origin $RemoteUrl
    } else {
      Write-Output "Origin remote points to: $currentOrigin (not $RemoteUrl). Use -ForceRemote to overwrite."
    }
  } else {
    Write-Output "Origin remote is correctly set."
  }
} catch {
  Write-Output "Warning: unable to verify origin remote. Continuing."
}

# Stage all changes
git add -A

# If there are no staged changes, skip commit but still try to push tracking info
$changes = git diff --cached --name-only
if (-not $changes) {
  Write-Output "No changes to commit. Proceeding to push (if needed)."
} else {
  if (-not $Message) {
    $Message = "Auto-update: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
  }
  git commit -m "$Message"
}

# Push to origin main and set upstream if not set
$branch = git rev-parse --abbrev-ref HEAD
if (-not $branch) { $branch = 'main' }

# Use push with set-upstream only when the branch has no upstream
# Quote '@{u}' so PowerShell doesn't interpret it as a hashtable
git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>$null
if ($LASTEXITCODE -eq 0) {
  git push origin $branch
} else {
  git push -u origin $branch
}

Write-Output "Push complete."
