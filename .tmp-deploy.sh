#!/bin/bash
set -eo pipefail
cd /Users/mac/work/sango-rising-dragons
git add -A
git commit -m "feat(hud): 엔터 키 = 턴 종료 단축키

- Enter 누르면 '턴 종료' 버튼과 동일 동작 (자동위임 ON이면 위임 진행)
- 입력 필드(input/textarea/contenteditable)에 포커스 있으면 무시
- 조합키(Shift/Ctrl/Meta/Alt + Enter)는 무시 (브라우저 단축키 보존)
- 게임 종료 후(G.over) 무시"
git push origin main 2>&1 | tail -3
TOK=$(cat ~/.hermes/secrets/vercel_token.txt)
vercel deploy --yes --prod --force --token "$TOK" 2>&1 | tail -8