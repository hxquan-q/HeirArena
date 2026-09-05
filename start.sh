#!/usr/bin/env bash
# HeirArena 一键启动（macOS / Linux）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"

# ---- backend ----
if [ ! -x "$ROOT/backend/.venv/bin/python" ]; then
  echo "[backend] 创建虚拟环境并安装依赖…"
  python3 -m venv "$ROOT/backend/.venv"
  "$ROOT/backend/.venv/bin/python" -m pip install --quiet -r "$ROOT/backend/requirements.txt"
fi
if [ ! -f "$ROOT/backend/.env" ]; then
  cp "$ROOT/backend/.env.example" "$ROOT/backend/.env"
  echo "[backend] 已生成 backend/.env（未填 API Key → 剧本模式）。"
fi
(cd "$ROOT/backend" && exec "$ROOT/backend/.venv/bin/python" -m uvicorn app.main:app --host 127.0.0.1 --port 8000) &
BACKEND_PID=$!

# ---- frontend ----
if [ ! -d "$ROOT/frontend/node_modules" ]; then
  echo "[frontend] 安装依赖…"
  (cd "$ROOT/frontend" && npm install)
fi
(cd "$ROOT/frontend" && exec npm run dev) &
FRONTEND_PID=$!

trap 'kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true' EXIT INT TERM
echo "HeirArena 已启动：前端 http://localhost:5173  后端 http://127.0.0.1:8000/docs  (Ctrl+C 退出)"
wait
