#!/bin/bash
set -eo pipefail
cd /Users/mac/work/sango-rising-dragons
git add -A
git commit -m "fix(hud): 엔터 단축키 — 모달 떠 있을 때 무시

#modalWrap.classList에 'hidden' 없으면 (모달이 보이는 상태) 엔터가
턴 종료로 트리거되지 않도록 가드 추가.
기존 입력 필드(input/textarea/contenteditable) 가드는 그대로 유지."
git push origin main 2>&1 | tail -3
TOK=$(cat ~/.hermes/secrets/vercel_token.txt)
vercel deploy --yes --prod --force --token "$TOK" 2>&1 | tail -8