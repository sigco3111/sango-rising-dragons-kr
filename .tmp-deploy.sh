#!/bin/bash
set -eo pipefail
cd /Users/mac/work/sango-rising-dragons
git add -A
git commit -m "fix(autopilot): 무한 루프 방지 — 함수 반환값 무시 + 안전 카운터 50회

원인: stepPlayerAutopilot의 train/recruit/develop 분기가 trainOfficer/recruit/develop의
반환값을 무시하고 항상 '성공' 로그 + return true → 실패해도 CP/acted 미변경 → 같은 후보
무한 재시도 (특히 조련은 gold<150일 때 영원히 반복).

수정:
- state.ts: stepPlayerAutopilot의 train/recruit/develop 분기에 반환값 체크 추가
  · 실패 시 '✗ 스킵' 로그 후 continue (다음 후보 시도)
- state.ts: pickBestTrain에 gold<150 사전 체크 (후보 자체를 안 만듦)
- flow.ts: runAutopilotTurn에 _depth 카운터 (50회 시도 초과 시 안전 종료 로그 + AI 턴)
- flow.ts: continueAi 진입 시 depth 리셋
"
git push origin main 2>&1 | tail -3
TOK=$(cat ~/.hermes/secrets/vercel_token.txt)
vercel deploy --yes --prod --force --token "$TOK" 2>&1 | tail -8