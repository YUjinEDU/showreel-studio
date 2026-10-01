# 쇼릴 엔진 API (template v2)

v2에서 추가: 자막(`caption`, `captions`), 장면별 전환 종류(`scenes[].cut`, `theme.cut`), 음악 스타일 `calm`·`pulse`, `stamp()`·`caption()`의 `w`(굵기) 옵션, 효과음 큐별 음량(`{t, g}`), 음량 목표(`music.lufs`). v1로 만든 쇼릴 폴더의 engine.js는 그대로 둔다(동결).

`engine.js`가 전역으로 제공하는 것 전부. `reel.js`에서 import 없이 바로 쓴다.

## 목차
1. 캔버스와 수학
2. 글자
3. 도형·재료
4. Reel.define 설정
5. 소리 (큐, 음악 구간 스타일, 음악 설정)
6. 렌더러 명령
7. 웹 플레이어와 발표 모드
8. window.reel 훅

## 1. 캔버스와 수학

| 이름 | 설명 |
| --- | --- |
| `W`, `H` | 1920, 1080 (고정) |
| `ctx` | 2D 컨텍스트. 직접 그려도 된다 |
| `P(t, a, b)` | t가 a→b 구간에서 0→1로 가는 진행률(범위 밖은 0 또는 1) |
| `cl(x, a, b)`, `lerp(a, b, x)` | 자르기, 선형 보간 |
| `eo3`, `eo5` | ease-out (3·5제곱). 등장에 기본으로 `eo5` |
| `eoX` | ease-out-expo. 테이프·선이 쭉 그어질 때 |
| `eio` | ease-in-out (3제곱). 이동·크기 변화 |
| `eback` | 되튀는 ease-out. 도장, 칩, 눈금이 튀어나올 때 |
| `A(hex, alpha)` | `'#RRGGBB'` → `rgba()` 문자열 |
| `mulberry32(seed)` | 결정론적 난수 생성기. `const r = mulberry32(1); r()` → 0~1 |

## 2. 글자

글꼴 종류 `k`: `'d'` 디스플레이, `'b'` 본문, `'m'` 모노(한글은 본문 글꼴로 대체).

공통 옵션 `o`:
`{ k, s: 크기px, w: 굵기, c: 색, a: 'left'|'center'|'right', ls: 자간px, al: 투명도, free, skim, overlapOk }`

| 함수 | 설명 |
| --- | --- |
| `text(s, x, y, o)` | 한 줄 그리기. y는 기준선(baseline) |
| `measure(s, o)` | 폭(px). 좌표 계산에 반드시 사용 |
| `rise(s, x, y, t0, t, o)` | 글자마다 기준선 아래에서 올라오는 마스크 등장. `o.st` 글자 간격(기본 .035초), `o.d` 글자당 시간(기본 .55초). 줄 폭을 반환. 왼쪽 정렬만 지원 |
| `typeOn(s, x, y, t0, t, cps, o)` | 타자 효과. `cps` 초당 글자 수, `o.caret`에 색을 주면 커서 표시 |
| `caption(s, t0, t1, t, o)` | 화면 아래 자막 띠 한 줄. t0에 나타나고 t1에 사라진다(로컬 시각). `o`: `{ y: 948, s: 40, c, bg, al }`. 읽기 시간 검사 대상 |
| `captions(list, t, o)` | `list = [[t0, t1, "자막"], ...]` 중 지금 해당하는 줄을 그린다. 장면 함수 마지막 줄에서 부른다 |

검사 옵션:
- `free: true`: 검사 제외(티커, 움직이는 배경 글자, HUD)
- `skim: true`: 장식·잔글씨. 읽기 시간 기준이 절반
- `overlapOk: true`: 의도된 겹침(도장 글자, 도장 아래 라벨)

## 3. 도형·재료

| 함수 | 설명 |
| --- | --- |
| `gridBg(bg, line, step = 240, lw = 2)` | 바탕을 칠하고 격자선(선택)을 그림. 화면보다 60px 넓게 칠해 흔들림에도 가장자리가 비지 않는다 |
| `stripes(pts, phase, c1, c2)` | 다각형 안에 45° 두 색 줄무늬(안전테이프, 경고 띠). `phase`를 `t * 120`처럼 주면 흐른다 |
| `stripeRect(x, y, w, h, phase, c1, c2)` | 사각형 줄무늬. `w`를 진행률로 늘리면 테이프가 그어진다 |
| `stamp(s, cx, cy, rot, p, { size, color, font, w })` | 고무도장. `p = P(t, a, a + .25)`로 찍으면 착지 ≈ a + 0.1초 |
| `rectDraw(x, y, w, h, p)` | 사각형 테두리를 p만큼 그림. 먼저 `strokeStyle`, `lineWidth` 설정 |
| `bezierPart(x0, y0, x1, y1, x2, y2, x3, y3, p)` | 3차 베지어를 p만큼 그림(갈래선, 연결선) |

엔진이 자동으로 하는 것:
- 장면 사이 전환(경계 −0.28초 ~ +0.22초). 종류는 `scenes[i].cut`(그 장면으로 들어올 때) 또는 `theme.cut` 기본값: `'wipe'` 대각선 줄무늬 띠(`theme.wipe` 두 색), `'fade'` 교차 페이드, `'cut'` 즉시 전환
- 장면마다 천천히 확대(`theme.push`, 기본 1.8%)
- 필름 그레인(`theme.grain`, 기본 .05)
- HUD: 왼쪽 위 장면 태그, 오른쪽 위 `meta.hudRight`, 아래 시간과 진행 막대(장면 경계 눈금)

## 4. Reel.define 설정

```js
Reel.define({
  meta:   { title, hudRight, dur: 30, fps: 30, poster: 19.6, music: 'reel-music.mp3' },
  fonts:  { families: { d, b, m }, faces: ['400 100px "Black Han Sans"', ...] },   // faces = 미리 불러올 글꼴(굵기별)
  theme:  { wipe: [c1, c2], hud: { light, dark, mark }, grain: .05, push: .018, safe: 48 },
  scenes: [{ a, b, dark, tag, name, music, draw }, ...],
  cues:   () => ({ ... }),
  music:  { bpm, offset, prog, endChord, endRoot, seed }
});
```

- `scenes[].a/b`: 시작·끝(초). 이어져야 한다(앞 장면의 b = 다음 장면의 a)
- `scenes[].dark`: 배경이 어두우면 true. HUD 글자색이 `hud.dark`로 바뀐다
- `scenes[].tag`: HUD 태그(예: `'02  뒤집힌 가정'`), `name`: 웹 플레이어의 챕터 이름
- `scenes[].prog`: 이 장면에서만 쓸 코드 진행(선택). 긴 쇼릴에서 막마다 분위기를 바꿀 때 쓴다
- `scenes[].cut`: 이 장면으로 들어오는 전환(`wipe` | `fade` | `cut`). 없으면 `theme.cut`, 그것도 없으면 `wipe`. 전환 효과음도 이것을 따른다
- `meta.poster`: 움직임 줄이기 설정 사용자와 썸네일에 보여줄 정지 시각
- 글꼴을 바꾸면 `index.html`의 Google Fonts `<link>`도 같이 바꾼다

## 5. 소리

### 큐 (모두 절대 시각, 초)

한 번 울리는 큐는 `t` 대신 `{t, g}`로 쓰면 그 큐만 음량을 바꿀 수 있다(예: `hits: [{t: 12.3, g: .5}]`). 도장이 여러 번 연달아 찍힐 때 뒤쪽을 작게 하는 식으로 쓴다.

| 키 | 형식 | 소리 | 쓰는 곳 |
| --- | --- | --- | --- |
| `hits` | `[t]` | 도장 쾅(임팩트 + 스네어 + 저음 톡) | `stamp()` 착지 |
| `booms` | `[t]` | 묵직한 임팩트 + 서브 드롭 | 결정적 숫자 등장 |
| `drops` | `[t]` | t 직전 0.3초 음악·드럼 정지 | 큰 한 방 바로 앞 |
| `swishes` | `[t]` | 짧게 내려가는 스위시 | 취소선, 밑줄 |
| `whooshes` | `[t]` | t에서 끝나는 부드러운 휘익 | 요소 대이동이 끝나는 순간 |
| `beeps` | `[t \| {t, f}]` | 짧은 사인 삑(기본 2750Hz) | 스캐너 레이저, 알림 |
| `scans` | `[t]` | 삐-빅 두 음 | 바코드 스캔, 항목 처리 |
| `pops` | `[t]` | 작은 블립(음 높이 조금씩 다름) | 많은 항목이 하나씩 등장 |
| `blips` | `[t]` | 칩·배지 팝 | 라벨 칩 등장 |
| `ticks` | `[[a, b]]` | a→b 동안 45ms 간격 틱(점점 높아짐) | 카운트업 |
| `plucks` | `[{t, note}]` | 플럭 한 음(MIDI 번호) | 목록·단계·막대 등장. 올라가는 음으로 쌓기 |
| `alarms` | `[t]` | 880/660Hz 네 번 + 임팩트 | 예외, 오류, 결품 |
| `keys` | `[t]` | 타자 소리 | `typeOn()` 글자마다 |
| `risers` | `[[a, b]]` | 노이즈 + 톱니파 상승 | 결론 직전 긴장 |
| `crashes` | `[t]` | 심벌 | 추가 강조(chorus 시작은 자동) |
| `freezes` | `[[a, b]]` | 드럼 멈춤, 음악 어두워짐 | "잠깐, 뭐지?" 순간 |
| `builds` | `[[a, b]]` | 점점 빨라지는 스네어 롤 | freeze 이후 다시 달릴 때(riser와 함께) |
| `end` | `t` | 엔딩 한 방 + 울리는 코드. 이후 그루브 정지 | 엔딩 타이틀 등장 |

자동: 장면 경계마다 전환 효과음(`wipe` 휘익 + 임팩트, `fade` 작은 휘익, `cut` 없음), `chorus` 구간 시작 심벌. `calm`·`pulse`는 자막이 흐르는 긴 설명 구간용이다.

### 음악 구간 스타일 (`scenes[].music`)

| 스타일 | 킥 | 스네어 | 하이햇 | 베이스 | 아르페지오 | 패드 |
| --- | --- | --- | --- | --- | --- | --- |
| `intro` | 장면 절반부터 4박 | — | 8분 약하게 | 절반부터 8분 | 서서히 커짐 | 어둡게 |
| `groove` | 4박 | 2·4박 | 16분 악센트 | 8분 | — | 중간 |
| `drive` | 4박 | 2·4박 | 16분 | 8분 + 옥타브 | 있음 | 중간 |
| `half` | 하프타임 | 3박 | 드물게 | 긴 음 | — | 아주 어둡게 |
| `chorus` | 4박 | 2·4박 + 클랩 | 16분 + 오픈 | 8분 + 옥타브 | 밝게 | 밝게 |
| `breakdown` | 마디마다 | — | 드물게 | 긴 음 | — | 중간 |
| `calm` | — | — | — | 긴 음 | 작고 어둡게 | 중간 |
| `pulse` | 마디마다 | — | 8분 조용히 | 8분 | 작고 어둡게 | 중간 |
| `silent` | — | — | — | — | — | — |

### 음악 설정 (`music`)

- `bpm`: 기본 150. 차분하면 110~120
- `offset`: 박자 격자 시작(초). 장면 경계가 박자 위에 떨어지게 고른다
- `prog`: `[[베이스 MIDI, [코드 MIDI...]], ...]` 한 마디에 하나씩 순환. 기본 Dm–B♭–F–C
  - 장조 예(C–G–Am–F): `[[36,[60,64,67]],[43,[59,62,67]],[45,[60,64,69]],[41,[60,65,69]]]`
- `endChord`, `endRoot`: 엔딩 코드와 베이스
- `seed`: 노이즈·패드 위상 난수 시드
- `lufs`: 음량 목표(예: -16). 없으면 피크 정규화만 한다. 짧고 꽉 찬 30초 쇼릴은 그래도 약 -14 LUFS가 나오지만, `calm`·`pulse`가 많은 긴 설명 영상은 -19 LUFS 안팎으로 작게 나온다. 숏동영상은 `lufs: -16`을 기본으로 쓴다. 16 kHz 저역 통과 → 목표 음량으로 증폭 → 트루 피크 약 -1 dBFS 리미터 순서로 처리한다

믹스는 최대 −1.5 dBFS로 피크 정규화된다. 기본 편곡이면 통합 음량이 약 −14 LUFS(스트리밍 기준)로 나온다. 확인: `ffmpeg -i build/reel-music.wav -af ebur128 -f null -`.

## 6. 렌더러 명령

프로젝트 루트에서:

```
node showreel/tools/render.js --help                                   # 전체 사용법
node showreel/tools/render.js sheet  showreel/reels/{slug} [--times 1.5,4,9 | --holds] [--cols 2|3] [--out file.png]
node showreel/tools/render.js frames showreel/reels/{slug} --times 21.7,27.6 [--out-dir dir]   # 원본 해상도 PNG
node showreel/tools/render.js audit  showreel/reels/{slug}             # 문제마다 전역 시각 구간 + 장면
node showreel/tools/render.js audio  showreel/reels/{slug} [--out build/check.mp3]   # --out 없으면 reel-music.mp3를 덮어씀
node showreel/tools/render.js video  showreel/reels/{slug} [--out reports/{date}_{topic}-showreel.mp4]
node showreel/tools/render.js bundle showreel/reels/{slug}             # build/artifact.html (웹 게시용 단일 파일)
```

모든 `--times`는 전역 시각(영상 시작부터의 초)이다.

새 쇼릴: `node {showreel-studio 스킬 폴더}/scripts/new-reel.js {slug} --title "제목" --date YYYY-MM-DD --eyebrow "..."`

## 7. 웹 플레이어와 발표 모드

- 버튼: 재생, 처음부터, 소리 켜기, 발표 모드, 전체 화면. 스크럽 막대와 챕터(장면) 버튼이 있다.
- **발표 모드**(버튼 또는 P 키): 각 장면의 완성 화면에서 멈춘다. 멈추는 시각은 `holdOf(i)` = 장면 끝 − 0.30초이며, 마지막 장면은 끝에서 멈춘다.
  - 다음: → / PageDown / 스페이스 / 엔터 / 화면 클릭. 등장 애니메이션 도중이면 먼저 완성 화면으로 건너뛴다.
  - 이전: ← / PageUp. 이전 장면의 완성 화면으로 간다.
  - 프레젠터 리모컨은 대부분 PageDown/PageUp을 보내므로 그대로 쓸 수 있다.
- 전체 화면: F 키 또는 버튼. 화면 비율을 유지하고 남는 곳은 검게 둔다.
- 소리: 브라우저 정책 때문에 사용자가 "소리 켜기"를 눌러야 나온다. 발표 모드에서는 멈출 때 음악도 멈추고, 다음 장면부터 이어서 나온다.

## 8. window.reel 훅

`ready`(글꼴 로드 Promise), `DUR`, `FPS`, `cues`, `scenes`, `music`, `pause()`, `renderAt(t)`, `frameJPEG(t, q)`, `audit(step)`, `presenter.{next, prev, set, holdOf}`. 렌더러가 쓰며, 브라우저 콘솔에서 `reel.renderAt(12.3)`으로 특정 시각을 확인할 수도 있다.
