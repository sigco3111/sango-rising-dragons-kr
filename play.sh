#!/bin/bash
# sango-rising-dragons 한소게임 한국어 버전 실행 스크립트

# 사용법:
#   ./play.sh dev      → Vite dev 서버 (개발용, HMR)
#   ./play.sh serve    → 정적 빌드 서빙 (플레이용, 권장)
#   ./play.sh build    → 정적 빌드만
#   ./play.sh open     → 정적 빌드를 Safari로 열기

set -e

cd "$(dirname "$0")"
PORT="${PORT:-8080}"

case "${1:-serve}" in
  dev)
    echo "🟢 Vite dev 서버 (개발 모드, HMR)"
    npm run dev
    ;;
  serve)
    if [ ! -d "dist" ]; then
      echo "⚠️  dist/ 폴더 없음. 빌드 중..."
      npm run build
    fi
    echo "🟢 정적 빌드 서빙 중: http://localhost:$PORT"
    echo "   중지: Ctrl+C"
    python3 -m http.server "$PORT" --directory dist
    ;;
  build)
    echo "🔨 정적 빌드 중..."
    npm run build
    echo "✅ 완료: dist/"
    ;;
  open)
    if [ ! -d "dist" ]; then
      npm run build
    fi
    echo "🌐 Safari로 열기..."
    open "dist/index.html"
    ;;
  *)
    echo "사용법: $0 {dev|serve|build|open}"
    exit 1
    ;;
esac
