#!/bin/bash
set -eo pipefail
cd /Users/mac/work/sango-rising-dragons
git add -A
git commit -m "feat(battle): 전투위임 — 위임 ON일 때 전술 전투에서 아군 AI 자동 조작

BattleScene.ts:
- init에 autopilot 옵션 추가 (playerSide는 그대로)
- create에서 autopilot일 때 450ms 후 playerAiStep 시작
- playerAiStep(): 매 아군 유닛 행동마다 호출
  · 저체력 유닛 우선 (HP 비율 기준)
  · 1순위: 스킬 (쿨타임 끝났고 45% 확률) — 저체력 적 우선
  · 2순위: 공격 범위 내 적 공격 (저체력 우선)
  · 3순위: 가장 가까운 적에게 이동 (이동 후 공격 가능하면 공격)
- finishAction에서 autopilot이면 다음 행동 360ms 후 체인
- updateTurnLabel: autopilot일 때 ' 🤖 위임 중' 표시 + 라벨 파란색

main.ts: launchBattle이 autopilot= getAutopilot()으로 자동 위임 전달
hud.ts: 직접 지휘 호출은 그대로 (사용자가 OFF일 때만 보게 됨)

README: 풀 자동위임 항목에 전술 전투 자동 조작 추가"
git push origin main 2>&1 | tail -3
TOK=$(cat ~/.hermes/secrets/vercel_token.txt)
vercel deploy --yes --prod --force --token "$TOK" 2>&1 | tail -8