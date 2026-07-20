# 삼국・起龍 — 한국어 한글화 포크

> **三国・起龍 (Romance of the Three Kingdoms)**
> ryantsai/sango-rising-dragons의 한국어 한글화 포크

[원본 저장소](https://github.com/ryantsai/sango-rising-dragons) · [한글화 포크](https://github.com/sigco3111/sango-rising-dragons-kr)

西元 190년, 한실 기울다. 군웅이 일어나 천하를 다투는 난세 —
**한글화된 인터페이스**로 클래식 3국지 전략/턴제 전투 게임을 즐기세요.

## ✨ 한글화 현황

| 항목 | 상태 | 진행률 |
|---|---|---|
| 도시 이름 (20개) | ✅ 완료 | 100% |
| 장수 이름 (49명) | ✅ 완료 | 100% |
| 진영/군주 (11개) | ✅ 완료 | 100% |
| 진영 설명 | ✅ 완료 | 100% |
| 아이템 (5개) | ✅ 완료 | 100% |
| 스킬 (7개) | ✅ 완료 | 100% |
| 이벤트 제목/텍스트 (12개) | ✅ 완료 | 100% |
| UI 텍스트 (HTML + TS) | ✅ 완료 | ~95% |
| 인트로 모달 텍스트 | 🟡 부분 | 확장 중 |
| 게임 설명/팁 | 🔴 미진행 | 예정 |
| 추가 한국어 콘텐츠 | 🔴 미진행 | 예정 |

> **원작자 라이선스 확인 필요** — 원본 저장소에 LICENSE 파일이 명시되지 않아, 한국어화 포크 배포 전 원작자(`@ryantsai`)에게 허락을 받아야 합니다. 연락처는 원본 저장소 Issues/PR을 통해 확인 가능합니다.

## 🎮 게임 특징

- **전략 레이어**: 매 턴 한 달, 명령 포인트(3 + 도시수/2)로 도시 경영
  - 🌾 개간 / 🪙 통상 / 🧱 축성 / ⚔ 징병 / 🔍 수색 / 🎯 조련 / 🚩 출정
- **전술 전투**: 턴제 보드 전투, 6종 유닛 상성, 7종 장수 스킬
  - 돌격 / 일기당천 / 화계 / 화우 / 고무 / 철벽 / 신사
- **풍부한 콘텐츠**: 49명 장수, 20개 도시, 11개 진영, 12개 역사 이벤트
- **자동 저장/계속**: 매 턴 localStorage 자동 저장
- **모드 친화적**: `public/data/ko/`에 JSON만 추가하면 신규 콘텐츠 반영

## 🚀 빠른 시작

### 방법 1: 정적 빌드 서빙 (권장, 가장 안정)

```bash
# 의존성 설치
npm install

# 정적 빌드
./play.sh build

# 정적 서버 시작
./play.sh serve
# → 브라우저에서 http://localhost:8080 열기
```

### 방법 2: Vite 개발 서버 (HMR)

```bash
npm install
./play.sh dev
# → http://localhost:5173
```

### 방법 3: 브라우저에서 직접 열기

```bash
./play.sh build
./play.sh open
```

`file://` 프로토콜에서 fetch()가 제한될 수 있어 **방법 1 추천**.

## 🛠 빌드 요구사항

- **Node.js** 22+ (테스트됨)
- **npm** 10+ (테스트됨)
- **Python 3** (정적 서버용, 선택)

빌드 시간: **~2.2초** (17 modules, M4 Mac 기준)

## 🗂 프로젝트 구조

```
sango-rising-dragons/
├── index.html              # 메인 HTML (lang="ko")
├── package.json
├── tsconfig.json
├── vite.config.*           # Vite 설정
├── public/
│   ├── assets/             # Kenney CC0 아트/음향
│   ├── data/
│   │   ├── manifest.json   # {"packs": ["ko", "base"]}
│   │   ├── base/           # 원본 중국어 데이터
│   │   │   ├── cities.json     (20개)
│   │   │   ├── officers.json   (49명)
│   │   │   ├── factions.json   (11개)
│   │   │   ├── events.json     (12개)
│   │   │   ├── items.json      (5개)
│   │   │   └── skills.json     (7개)
│   │   └── ko/             # 한국어 모드팩 (덮어쓰기)
│   │       ├── cities.json
│   │       ├── officers.json
│   │       ├── factions.json
│   │       ├── events.json
│   │       ├── items.json
│   │       └── skills.json
├── src/
│   ├── main.ts            # 진입점
│   ├── content.ts         # 데이터 로더 (ko → base 머지)
│   ├── hud.ts             # UI (한국어 적용 완료)
│   ├── state.ts           # 게임 상태
│   ├── flow.ts            # 게임 흐름
│   ├── types.ts
│   ├── scenes/
│   │   ├── BootScene.ts
│   │   ├── MapScene.ts    # 전략 맵
│   │   └── BattleScene.ts # 전술 전투
│   ├── ai.ts
│   └── ...
├── screenshots/           # 게임 스크린샷
├── docs/                   # 추가 문서
├── play.sh                 # 실행 스크립트
└── README.md
```

## 🌍 한국어 모드팩 구조

`public/data/ko/` 폴더는 원본 데이터를 덮어쓰는 한국어 모드팩입니다.
`manifest.json`의 `packs` 배열에 따라 로드되며, **앞에 있을수록 우선순위**가 높습니다.

```json
// public/data/manifest.json
{
  "packs": ["ko", "base"]  // ko가 base를 덮어씀
}
```

### 새 한국어 콘텐츠 추가

예: 한국어 전용 신규 장수 추가 시:

```bash
# 1. 새 모드팩 디렉토리 생성
mkdir -p public/data/mypack

# 2. officers.json 작성 (덮어쓰거나 추가)
cat > public/data/mypack/officers.json << 'EOF'
[
  {"id": "son_goku", "name": "손오공", "faction": "neutral",
   "ldr": 99, "war": 99, "int": 99, "pol": 99, "troop": "cavalry", "skill": "charge"}
]
EOF

# 3. manifest.json에 추가
# {"packs": ["ko", "mypack", "base"]}
```

새 모드는 `mypack`이 `base`보다 우선이지만 `ko`보다 후순위.

## 🤝 기여 방법

### 번역 개선
1. `public/data/ko/`의 JSON 파일 편집
2. `./play.sh serve`로 즉시 확인
3. PR 제출

### 새 한국어 콘텐츠
- `public/data/<newpack>/` 에 JSON 추가
- 위 "새 콘텐츠 추가" 섹션 참고

### 코드 기여
- TypeScript (`src/*.ts`)
- 한국어 폰트 / 디자인
- 한국어 시나리오 모드

## 📜 크레딧

- **원작자**: [@ryantsai](https://github.com/ryantsai) — 게임 코드, 디자인
- **게임 엔진**: [Phaser 3](https://phaser.io)
- **빌드 도구**: [Vite 6](https://vitejs.dev), [TypeScript 5](https://www.typescriptlang.org)
- **아트/음향**: [Kenney.nl](https://kenney.nl) (CC0)
- **한글화**: [sigco3111](https://github.com/sigco3111)

## 📄 라이선스

원본 저장소의 라이선스가 명시되지 않았습니다.
포크는 **학습/연구 목적**으로만 사용 권장.

## 🔗 관련 링크

- [원본 저장소 (ryantsai/sango-rising-dragons)](https://github.com/ryantsai/sango-rising-dragons)
- [이슈 트래커](https://github.com/sigco3111/sango-rising-dragons-kr/issues)
- [스크린샷](./screenshots/)

---

**⛩️ 천하가 내 이름을 알게 되리라.**
