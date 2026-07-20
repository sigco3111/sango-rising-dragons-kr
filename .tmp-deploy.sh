#!/bin/bash
set -eo pipefail
cd /Users/mac/work/sango-rising-dragons
git add -A
git commit -m "debug(recruit): before/after troops 로그 + window.__sangoRecruitLog 콘솔 훅

사용자 보고: 징병해도 UI에 병력이 안 보임 (출정 slider도 0)
코드 검사 결과 recruit() mutation 자체는 정상 — before/after 명시 로그 추가
사용자가 직접 콘솔에서 검증 가능:
  __sango.getG().cities['chenliu'].troops
  __sangoRecruitLog
stepPlayerAutopilot 분기에 변화 없으면 '✗ 실패 (변화 없음)' 로그로 silent fail 감지"
git push origin main 2>&1 | tail -3
TOK=$(cat ~/.hermes/secrets/vercel_token.txt)
vercel deploy --yes --prod --force --token "$TOK" 2>&1 | tail -8