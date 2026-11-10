$repoRoot = Split-Path -Parent $PSScriptRoot
$pythonExe = Join-Path $repoRoot ".venv\Scripts\python.exe"
$appDir = Join-Path $repoRoot "ai-service"

if (-not (Test-Path $pythonExe)) {
  Write-Error ".venv Python not found at $pythonExe"
  exit 1
}

$env:PYTHONPATH = $appDir
& "$pythonExe" -m uvicorn --app-dir "$appDir" app.main:app --host 0.0.0.0 --port 8000 --reload --reload-dir "$appDir"
