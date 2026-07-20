#!/bin/bash
set -eo pipefail
cd /Users/mac/work/sango-rising-dragons
git add -A
git commit -m "fix(events): troopsHome NaN 버그 — amount/v 양쪽 지원 + 세이브 sanitize

원인:
- ko/events.json의 황건의 잔당 '토벌' / 자연 치유 이벤트가 troopsHome 효과를
  base 형식과 다른 'amount' 필드로 작성됨 (한국어화 시점 실수).
- state.ts applyEffects troopsHome 핸들러는 e.v만 봄 → e.v=undefined → troops += NaN
- 일단 한 도시의 troops가 NaN 되면 recruit(+1500) 더해도 NaN + 1500 = NaN

수정:
1) ko/events.json 두 곳 amount → v (base와 통일)
2) state.ts applyEffects troopsHome: e.v ?? e.amount ?? 0 + Number.isFinite 가드
3) state.ts sanitizeGameState() 신규 — loadGame() 시 1회 자동 정화
   - 모든 도시 troops NaN → 1,000으로 복구
   - gold/food/cp/turn/aiGold/장수 level·exp 도 NaN 가드
   - __sangoSaveHeal 콘솔 훅으로 복구된 도시 수 확인 가능
4) 안전망: troopsHome delta가 finite 아니거나 0이면 mutation skip"
git push origin main 2>&1 | tail -3
TOK=$(cat ~/.hermes/secrets/vercel_token.txt)
vercel deploy --yes --prod --force --token "$TOK" 2>&1 | tail -8