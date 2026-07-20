#!/bin/bash
set -eo pipefail
cd /Users/mac/work/sango-rising-dragons
echo "=== 커밋 ==="
git add -A
git commit -m "feat(autopilot): 풀 자동위임 — 출정/수색/조련 포함, 엔딩까지 자동 진행

B안 (사용자 확정):
- 출정 강도: AI와 동일 ratio>1.4 (보수적), CP>=4일 때 ratio>1.0 완화 (공격적)
- 조련: 항상 가능 (가장 약한 장수 우선)
- 출정 전투: 자동 결산 (모달 생략)

state.ts:
- pickBestAttack/Move/Search/Train 함수 추가 (각각 우선순위별 후보 선택)
- buildAutopilotQueue 확장: P1 attack → P2 move → P3 search → P4 train → P5 develop/recruit
- stepPlayerAutopilot: 각 액션별 분기 + 상세 로그
  · march-attack: bus.emit('autopilotMarch', setup) → flow.ts가 자동 결산 후 재진입
  · search: searchTalent 인라인 (모달 생략) + 결과 로그
- armyPower 정적 import (ESM require 회피)

flow.ts:
- bus.on('autopilotMarch') 핸들러: CP 차감 + 자동결산 + 부대 잔여 source 복귀 후 다음 step
- runAutopilotTurn: march 핸들러가 비동기 재진입하므로 pendingMarch 체크
- endTurn 로그 메시지 풀 자동위임 강조로 변경

README: 자동위임 섹션 추가 (게임 특징 → 풀 자동위임)"
echo "=== 푸시 ==="
git push origin main 2>&1 | tail -3
echo "=== 강제 재배포 ==="
TOK=$(cat ~/.hermes/secrets/vercel_token.txt)
vercel deploy --yes --prod --force --token "$TOK" 2>&1 | tail -8