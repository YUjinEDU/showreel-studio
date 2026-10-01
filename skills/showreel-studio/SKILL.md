---
name: showreel-studio
description: "조사 내용·보고서를 발표용 한국어 모션그래픽 영상(기본 2분 안팎, 요청 시 30초 요약 또는 3~5분 자막형 숏동영상)으로 만든다. MP4(합성 사운드트랙 포함), 장면마다 멈추는 발표 모드가 있는 웹 플레이어, 장면별 발표 대본을 만든다. 스토리보드 → 사용자 승인 → 템플릿으로 구현 → 자동 검사·검토 → 렌더링·웹 게시까지 조율한다. '쇼릴 만들어줘', '발표용 영상', '발표에서 보여줄 애니메이션', '조사 결과를 영상으로', '모션그래픽으로', '2분 영상', '30초 요약 영상', '3~5분 숏동영상', '발표자 없이 보는 설명 영상', '모르는 사람에게 주제 소개 영상', '슬라이드 대신 영상' 같은 요청에 사용한다. '쇼릴 문구만 고쳐', '장면 하나 다시', '음악만 바꿔', '15초 버전', '다른 보고서로 새 쇼릴', '쇼릴 다시 렌더링' 같은 후속 요청에도 사용한다. 정적 차트·슬라이드·문서 작성에는 쓰지 않는다."
---

# 쇼릴 스튜디오 오케스트레이터

**기본값**: 용도는 발표 보조, 길이는 2분 안팎이다(내용에 따라 90초~2분 30초). 결과물은 MP4, 웹 플레이어(발표 모드), 발표 대본이다.

**경로 표기**: `{SKILL_DIR}`는 이 스킬이 설치된 폴더다. 플러그인으로 설치했다면 `${CLAUDE_PLUGIN_ROOT}/skills/showreel-studio`이고, 스킬을 불렀을 때 표시되는 "Base directory for this skill" 경로와 같다. 템플릿·렌더러·스크립트는 여기에 있다. 결과물은 사용자 프로젝트의 현재 폴더 아래 `showreel/`(작업 폴더)와 `reports/`(최종 MP4·대본)에 만든다. 사용자가 다른 위치를 원하면 그 위치를 쓴다.

**준비물**: Node.js 18 이상, Chrome 또는 Edge(없으면 `CHROME_PATH` 환경변수로 실행 파일 지정). 첫 실행 때 `new-reel.js`가 `showreel/tools/`에 렌더러를 복사하고 `npm install`(puppeteer-core, ffmpeg-static)을 한다.

| 모드 | 요청 표현 | 길이 | 설명을 맡는 것 | 승인 단계 | 렌더링 |
| --- | --- | --- | --- | --- | --- |
| 발표 보조 (기본) | 발표용, 발표에서 보여줄 | 90초~2분 30초 | 발표자 대본 | 필수 | 약 4분 |
| 30초 요약 | 30초, 요약, 티저, 이력서용 | 30초 | 화면 문구 | 필수(사용자가 생략 요청 가능) | 약 1분 |
| 숏동영상 | 3~5분, 숏동영상, 발표자 없이, 모르는 사람에게 설명, 슬라이드 대신 | 3~5분 | 자막 | **필수**. 사용자가 생략을 요청해도 한 번은 권한다(만든 뒤 고치는 비용이 가장 크다) | 약 10분 |

모드는 브리프(`00_brief.md`)와 스토리보더 프롬프트에 명시한다. 숏동영상 모드의 세부 규칙은 `reel-storyboard/references/explainer-mode.md`(구성·자막·정직성), `reel-build` 9절(파일 나누기·자막·전환), `reel-review` 5-2절(추가 점검)에 있다.

## 실행 모드: 혼합

| 단계 | 실행 모드 | 담당 | 선택 이유 |
| --- | --- | --- | --- |
| 1. 스토리보드 | 서브에이전트 위임 | `reel-storyboarder` | 원자료 → 스토리보드 한 편. 결과만 받으면 된다 |
| 2. 사용자 승인 | 메인 | — | 영상은 만든 뒤 고치는 비용이 커서 방향을 먼저 확정한다 |
| 3. 폴더 준비 | 메인(스크립트) | `scripts/new-reel.js` | 결정론적 복사 작업 |
| 4. 구현 | 지속형 에이전트 | `reel-builder` | 검토 의견을 받아 같은 맥락에서 여러 번 고쳐야 한다 |
| 5. 검토 | 서브에이전트 위임(라운드마다) | `reel-reviewer` | 매 라운드 새 눈으로 본다. 코드는 고치지 않는다 |
| 6. 렌더링·게시·보고 | 메인 | — | MP4 렌더링, 웹 게시(Artifact 도구)는 메인만 할 수 있다 |

Workflow는 쓰지 않는다. 라운드 수가 적고(최대 2), 사용자 승인이 중간에 들어가기 때문이다.

## 파일 구조

```
showreel/
├── tools/                      # 공용 렌더러 + node_modules (한 번 설치)
└── reels/{slug}/               # 쇼릴 하나 = 폴더 하나
    ├── index.html  engine.js  music.js  reel.js  reel-music.mp3
    ├── _work/                  # 과정 기록 (사용자가 나중에 확인)
    │   ├── 00_brief.md         # 요청, 원자료, 길이, 제약 (메인)
    │   ├── 01_storyboard.md    # reel-storyboarder
    │   ├── 02_build_log.md     # reel-builder
    │   ├── 03_review_r{n}.md   # reel-reviewer
    │   └── meta.json           # builder agentId, 아티팩트 URL, 최종 MP4 경로, 라운드 기록 (메인)
    └── build/                  # sheet.png, audit.json, artifact.html, reel-music.wav
reports/{YYYY-MM-DD}_{topic}-showreel.mp4      # 최종 영상
```

`slug` 형식: `{YYYY-MM-DD}-{주제 영문 kebab}` (예: `2026-09-29-warehouse`).

## 0단계: 기존 작업 확인

1. 요청에서 대상 쇼릴을 찾는다. `showreel/reels/`를 나열하고, 사용자가 말한 주제·날짜와 맞는 폴더가 있는지 본다.
2. 분기:
   - 폴더가 없음 → 새로 만든다(1단계부터).
   - 폴더가 있고 부분 수정 요청 → 「부분 재실행」 표로 간다.
   - 폴더가 있는데 새로 만들어 달라고 함 → 새 slug(날짜나 `-v2` 접미사)로 만든다. 기존 폴더는 지우지 않는다.
3. `showreel/tools/render.js`가 없으면 3단계의 `new-reel.js`가 설치한다. Node.js가 없으면 사용자에게 설치를 안내하고 멈춘다.

## 1단계: 스토리보드 — 서브에이전트

1. `_work/00_brief.md`에 요청 원문, 원자료 경로, 용도(발표 보조 / 30초 요약), 길이(기본 2분), 톤·제약, 참고할 이전 검토 의견을 적는다. 폴더가 아직 없으므로 `showreel/reels/{slug}/_work/`를 먼저 만든다.
2. Agent 도구로 호출한다.
   - `subagent_type: "showreel:reel-storyboarder"` (플러그인 설치 기준. 프로젝트 `.claude/agents/`에 직접 넣었다면 `"reel-storyboarder"`)
   - `prompt`: "쇼릴 스토리보드를 작성하라(장면별 발표 대본 포함). 브리프: showreel/reels/{slug}/_work/00_brief.md. 원자료: {경로}. 길이 약 {N}초. 출력: showreel/reels/{slug}/_work/01_storyboard.md"
3. 완료 알림을 기다린다.

## 2단계: 사용자 승인 — 메인

1. 스토리보드를 읽고 사용자에게 다음을 요약해 보여준다.
   - 한 줄 메시지, 막 구성과 전체 길이, 장면 표(시간·메시지·핵심 문구·수치), 시각 정체성, 음악 톤, 사용자 결정 사항
   - 장면이 많으면 막 단위로 묶어 보여준다. 대본은 두세 장면만 예시로 보여주고, 전체는 파일 경로로 안내한다
2. 승인이나 수정 요청을 기다린다. 사용자가 "확인 없이 끝까지"라고 요청한 경우에만 이 단계를 건너뛴다.
3. 수정 요청이 있으면 같은 에이전트 유형을 다시 호출해 해당 장면만 고치게 한다(재호출 규칙은 에이전트 정의에 있음). 승인되면 스토리보드 머리에 `승인: {날짜}`를 적는다.

## 3단계: 폴더 준비 — 스크립트

```
node {SKILL_DIR}/scripts/new-reel.js {slug} --title "{제목}" --date {YYYY-MM-DD} --eyebrow "{분류 · 날짜}"
```

1단계에서 `_work/`만 먼저 만들었다면 `--force`를 붙인다. `_work/`의 파일은 템플릿에 없으므로 덮어써지지 않는다.

## 4단계: 구현 — 지속형 에이전트

1. Agent 도구로 호출한다.
   - `subagent_type: "showreel:reel-builder"`
   - `prompt`: "승인된 스토리보드 showreel/reels/{slug}/_work/01_storyboard.md 를 showreel/reels/{slug}/ 의 reel.js로 구현하라. 원자료: {경로}. 구현 기록: _work/02_build_log.md. MP4는 렌더링하지 않는다."
2. 결과로 받은 `agentId`를 `_work/meta.json`의 `builderAgentId`에 바로 적는다. 수정 라운드에서 같은 에이전트에게 `SendMessage`로 지시해야 하기 때문이다. `SendMessage`가 지연 로딩 도구면 ToolSearch(`select:SendMessage`)로 먼저 불러온다.
3. 완료 알림을 기다린다.

## 5단계: 검토 루프 — 서브에이전트 (최대 2라운드)

라운드 n = 1, 2:
1. Agent 도구로 `subagent_type: "showreel:reel-reviewer"`를 호출한다. `prompt`: "쇼릴 showreel/reels/{slug}/ 를 검토하라. 라운드 {n}. 스토리보드 _work/01_storyboard.md, 원자료 {경로}. 출력 _work/03_review_r{n}.md"
2. 판정이 `pass`면 6단계로 간다.
3. `fix`면 `SendMessage({to: builderAgentId, message: "검토 의견 showreel/reels/{slug}/_work/03_review_r{n}.md 를 반영하라. must부터."})`로 지시하고 완료를 기다린다.
4. 2라운드 뒤에도 must가 남으면 멈추고, 남은 must 목록을 사용자에게 보여주며 진행 방법을 묻는다.

## 6단계: 렌더링·게시·보고 — 메인

1. 렌더링한다. 30초에 약 1분, 2분에 약 4분이 걸린다. 백그라운드로 실행하고 완료 알림을 기다린다.
   ```
   node showreel/tools/render.js video showreel/reels/{slug} --out reports/{date}_{topic}-showreel.mp4
   node showreel/tools/render.js bundle showreel/reels/{slug}
   ```
2. 결과를 검증한다. 파일이 있는지, 길이가 `dur`와 같은지, 영상과 오디오 스트림이 둘 다 있는지 본다.
   발표 대본을 `reports/{date}_{topic}-showreel-notes.md`로 내보낸다. 장면 번호, 시작 시각, 챕터 이름, 화면 핵심 문구, 대본을 쓰고, 맨 위에 발표 모드 조작법(→/PageDown 다음, ← 이전, F 전체 화면)을 적는다. 스토리보드에서 옮기되, 구현 중 바뀐 문구는 `reel.js` 기준으로 맞춘다.
   `showreel/tools/node_modules/ffmpeg-static/ffmpeg(.exe) -hide_banner -i {mp4}`
3. 웹 게시: Artifact 도구로 `build/artifact.html`을 게시하고 `files`에 `{"reel-music.mp3": "showreel/reels/{slug}/reel-music.mp3"}`를 넣는다.
   - 처음 게시할 때: `icon: "film"`, 한 문장 `description`. 받은 URL을 `_work/meta.json`의 `artifactUrl`에 적는다.
   - 다시 게시할 때: `url`에 `artifactUrl`을 넣어 같은 링크를 유지한다.
   - 템플릿 페이지는 아티팩트 규칙(제목, 단일 다크 테마의 명시적 배경, 모바일 폭, CDN 허용 목록)을 이미 지킨다. `index.html`의 페이지 틀을 크게 바꿨다면 artifact-design 규칙을 다시 확인한다.
   - **Artifact 도구가 없는 환경**이면 게시를 건너뛰고 로컬 재생 방법을 안내한다: `npx --yes http-server showreel/reels/{slug} -p 8080` 후 브라우저에서 `http://localhost:8080` (음악을 `fetch`로 읽으므로 `index.html`을 파일로 직접 열면 소리가 나지 않는다). 다른 곳에 올리려면 `build/artifact.html`과 `reel-music.mp3`를 같은 폴더에 두면 된다.
   숏동영상 모드는 발표 대본 대신 **자막 대본**을 `reports/{date}_{topic}-captions.md`로 내보낸다(전역 시각, 장면, 자막). 나중에 목소리를 입힐 때 녹음 대본으로 쓴다.
4. 사용자에게 보고한다.
   - MP4 경로와 사양, 웹 링크(비공개이며 공유는 페이지의 Share 메뉴에서 한다), 발표 대본 경로
   - 발표 방법: PPT에는 MP4를 넣고, 설명하며 넘길 때는 웹 플레이어의 발표 모드를 쓴다
   - 장면 구성 한 줄씩
   - 검토 결과(라운드 수, 남은 should)
   - 음악은 직접 청취 확인이 안 됐으면 그렇다고 밝히고 피드백을 요청한다

## 부분 재실행

| 요청 | 처리 |
| --- | --- |
| 문구·수치만 수정 | builderAgentId가 살아 있으면 SendMessage, 아니면 `reel-builder`를 새로 호출(이전 `02_build_log.md`를 읽게 함) → reviewer 1라운드 → 6단계 |
| 장면 하나 다시 | storyboarder로 해당 장면만 고침 → 승인 → builder → reviewer → 6단계 |
| 음악만 변경(템포, 조성, 구간 스타일, 큐) | builder가 `reel.js`의 `music`·`cues`·`scenes[].music`만 고침 → `audio`로 확인 → 6단계. reviewer는 소리 대조만 |
| 길이 변경(예: 30초 요약본) | 새 slug로 1단계부터. 원래 스토리보드를 원자료로 함께 넘겨 줄이게 한다 |
| 발표 대본만 수정 | storyboarder로 대본만 고침 → reviewer의 대본 대조만 → 대본 파일만 다시 내보냄(영상 렌더링 없음) |
| 다시 렌더링만 | 6단계만 |
| 템플릿 자체 개선 | `{SKILL_DIR}/assets/template/`을 고친다(플러그인으로 설치했다면 업데이트 때 덮어써지므로 원 저장소에 반영한다). 기존 쇼릴 폴더의 engine.js는 그대로 둔다(동결). 새 기능이 필요한 쇼릴에만 엔진을 복사해 넣는다 |

## 숏동영상 모드 운영 메모

- 구현은 builder 한 명이 장 단위로 진행한다. 장 하나가 끝날 때마다 builder가 자체 확인(sheet·audit)을 하므로, 메인은 중간 보고를 기다렸다가 사용자에게 진행 상황을 짧게 알린다.
- 검토는 라운드마다 reviewer 한 명이 전체를 본다(최대 2라운드). 장이 많아 한 번에 보기 어려우면 reviewer가 장별 시트로 나눠 본다(스킬 5-2절).
- 렌더링(약 10분)은 백그라운드로 실행하고 완료 알림을 기다린다.

## 오류 처리

| 상황 | 대응 |
| --- | --- |
| `subagent_type`을 찾을 수 없음 | 새로 만든 에이전트 정의는 Claude Code를 다시 시작해야 로드된다. 급하면 `general-purpose`로 호출하고 프롬프트 첫 줄에 "에이전트 정의 파일(플러그인: `${CLAUDE_PLUGIN_ROOT}/agents/{name}.md`, 프로젝트: `.claude/agents/{name}.md`)을 읽고 그 역할과 원칙을 따르라"를 넣는다 |
| Chrome/Edge를 찾지 못함 | `CHROME_PATH` 환경변수로 실행 파일 경로를 지정하게 안내한다 |
| ffmpeg가 없음 | `cd showreel/tools && node node_modules/ffmpeg-static/install.js` |
| `window.reel missing` | reel.js 오류. 오류 메시지를 builder에게 보내 고치게 한다 |
| builder가 응답하지 않음 | SendMessage로 상태를 확인한다. 그래도 안 되면 `reel-builder`를 새로 호출하고 `_work/02_build_log.md`와 최신 검토 파일을 읽게 한다 |
| 글꼴 로드 실패 경고 | 네트워크 문제일 수 있다. 한 번 다시 렌더링하고, 또 실패하면 대체 글꼴로 렌더링됐다고 보고한다 |
| 사용량 한도·권한 거부 | 다시 시도하지 않는다. `_work/`의 부분 산출물을 확인해 어디까지 됐는지 `_work/incident.md`에 적고 보고한다 |

## 테스트 시나리오

### 정상 흐름
1. 사용자: "창고 조사 결과로 발표용 영상 만들어줘."
2. 0단계: 새 slug `2026-09-29-warehouse-talk`. 같은 이름이 있으면 `-v2`.
3. 1–2단계: 스토리보드 6막 16장면, 약 2분, 장면별 대본 → 사용자에게 막 단위 요약 → 승인.
4. 3–4단계: 폴더 생성, builder 구현. `audit`에서 reading-critical 0건.
5. 5단계: reviewer r1 `fix`(must 2) → builder 수정 → r2 `pass`.
6. 6단계: `reports/2026-09-29_warehouse-talk-showreel.mp4`(약 2분, 영상+오디오), 발표 대본, 웹 링크(발표 모드), 보고.

### 오류 흐름
1. reviewer r2에서도 "엔딩 문구가 0.7초만 보임"(must)이 남는다.
2. 메인은 렌더링하지 않고 남은 must와 선택지(장면 길이 +0.8초 / 문구 삭제)를 사용자에게 제시한다.
3. 사용자가 고르면 builder에게 SendMessage → reviewer r3(사용자 승인으로 추가한 라운드) → 6단계.

### 숏동영상 흐름
1. 사용자: "회의 자료로 모르는 사람에게 보여줄 5분 영상 만들어줘."
2. 1단계: 브리프에 모드=숏동영상, 청중, WHY·WHAT 범위를 적고 storyboarder 호출 → 6~7장, 장면 25~35개, 자막 전체 목록.
3. 2단계: 장 단위로 요약해 승인받는다(생략 요청이 있어도 한 번 권함).
4. 4~5단계: builder가 `scenes/chN.js`로 나눠 구현 → reviewer r1(자막·목표 표시 점검 포함).
5. 6단계: MP4(약 5분, 렌더링 약 10분), 웹, 자막 대본 `reports/{date}_{topic}-captions.md`.

### 레퍼런스
완성 예제: `reel-build` 스킬의 `references/example-showreel-reel.js` (이 플러그인의 작동 방식을 소개하는 30초 쇼릴).
