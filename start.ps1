# HeirArena 一键启动（Windows PowerShell）
# 用法：右键 "使用 PowerShell 运行"，或在终端执行 .\start.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

# ---- backend ----
$venv = Join-Path $root "backend\.venv"
if (-not (Test-Path (Join-Path $venv "Scripts\python.exe"))) {
    Write-Host "[backend] 创建虚拟环境并安装依赖…" -ForegroundColor Yellow
    python -m venv $venv
    & (Join-Path $venv "Scripts\python.exe") -m pip install --quiet -r (Join-Path $root "backend\requirements.txt")
}
if (-not (Test-Path (Join-Path $root "backend\.env"))) {
    Copy-Item (Join-Path $root "backend\.env.example") (Join-Path $root "backend\.env")
    Write-Host "[backend] 已生成 backend\.env（未填 API Key → 剧本模式）。" -ForegroundColor Yellow
}
Start-Process -FilePath (Join-Path $venv "Scripts\python.exe") `
    -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000" `
    -WorkingDirectory (Join-Path $root "backend")

# ---- frontend ----
if (-not (Test-Path (Join-Path $root "frontend\node_modules"))) {
    Write-Host "[frontend] 安装依赖…" -ForegroundColor Yellow
    Push-Location (Join-Path $root "frontend"); npm install; Pop-Location
}
Start-Process -FilePath "cmd.exe" -ArgumentList "/k", "npm run dev" -WorkingDirectory (Join-Path $root "frontend")

Start-Sleep -Seconds 3
Start-Process "http://localhost:5173/"
Write-Host "HeirArena 已启动：前端 http://localhost:5173  后端 http://127.0.0.1:8000/docs" -ForegroundColor Green
