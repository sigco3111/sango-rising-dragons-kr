#!/bin/bash
set -eo pipefail
cd /Users/mac/work/sango-rising-dragons
git add -A
git commit -m "revert: 전술 전투 위임 제거 (사용자 요청)

제거:
- BattleScene: battleAutopilot 필드, init(data.autopilot), create()의 autopilot 분기
- BattleScene: playerAiStep(), playerMoveAndMaybeAttack(), pickNextPlayerUnit() 메서드 전부
- BattleScene: finishAction()의 autopilot 체인
- BattleScene: updateTurnLabel()의 '🤖 위임 중' 표시 + 파란색 강조
- main.ts: launchBattle의 autopilot=getAutopilot() 전달 (원복)
- main.ts: getAutopilot import 제거
- README: 전투 위임 항목 제거

자동위임의 출정은 여전히 autoResolve로 자동 결산됨 (이전과 동일).
수동 전투는 사용자가 직접 지휘."
git push origin main 2>&1 | tail -3
TOK=$(cat ~/.hermes/secrets/vercel_token.txt)
vercel deploy --yes --prod --force --token "$TOK" 2>&1 | tail -8