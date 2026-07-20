#!/bin/bash
set -eo pipefail
cd /Users/mac/work/sango-rising-dragons
git add -A
git commit -m "balance(ai+autopilot): C안 — 적 AI 약화 + 시작 보너스 + 위임 AI 고도화

밸런스 (state.ts):
- DEV_COST 400→300, RECRUIT_COST_GOLD 200→150, RECRUIT_COST_FOOD 300→200
- RECRUIT_AMOUNT 1500→2000
- 시작 자원 gold 1000→1500, food 2000→3500
- 시작 보너스 1: 수도 성벽 +1 (최대 5)
- 시작 보너스 2: 재야 장수 1명 무료 영입 (수도로)

밸런스 (ai.ts):
- 적 공성 threshold 1.45→1.7 (더 약한 적만 공격)
- 적 공성 빈도 65%→40% (덜 자주 공격)

위임 AI 고도화 (state.ts):
- pickBestAttack: 단순 ratio 비교 → 점수화
  · 적 약점 보너스 (벽 낮음 + 병력 적음 = 쉬운 먹잇감)
  · 체인 보너스 (이 공격 후 잔여 병력으로 인접한 다른 적까지 가능한지 시뮬레이션)
- pickBestMove: 전선 보강만 → 부대 합치기 추가
  · 약한 도시 (troops<5000)에서 강한 인접 아군 도시로 자동 이동
  · 최대 delta (격차) 도시 우선 병합
- march-move 로그: '전선 보강' vs '부대 합치기' 이유 명시

README: 위임 AI 항목에 적 약점 보너스/체인 보너스/부대 합치기 추가"
git push origin main 2>&1 | tail -3
TOK=$(cat ~/.hermes/secrets/vercel_token.txt)
vercel deploy --yes --prod --force --token "$TOK" 2>&1 | tail -8