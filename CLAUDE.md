# 주간 업무 보드 (Electron)

월–금 요일별 열 + 장기업무 열 칸반 보드(주간) + 월간 일정 달력. 트레이 상주, 로그인 자동 시작, 월별 CSV 자동 기록.

## 주간 ↔ 월간
한 창에서 헤더 탭(`#tabWeek`/`#tabMonth`)으로 전환, 마지막 선택은 `localStorage['weekly-board-view']`.
- **주간** = todo list 세부 관리. 월간에서 만든 일정은 **주간 보드에 절대 나타나지 않는다.**
- **월간** = 일정(미팅·납기 등) 관리 + 주간 업무 요약. 날짜 칸에 한일(초록 점+수)/할일(붉은 점+수)만 집계해 표시하고 제목은 숨긴다.
- 집계 기준은 **카드가 놓인 요일 칸 위치**(`daySummary()`) — `doneAt`/`due` 아님. 주말은 주간 보드에 열이 없어 요약 없음(일정만 등록 가능).
- 장기업무는 동그라미 집계에서 빼고 `due`가 그 날인 건만 `◇n` 마커로 표시.
- 날짜 칸 클릭 → 상세 패널(`#dayPanel`): 일정 추가/편집, 휴가 추가, 그 날 업무 목록(체크만 가능), "이 주 보드 열기". 월간 상단엔 다가오는 일정 D-day 줄.

## 휴가(연차·반차)
휴가는 **`type:'vacation'` 일정**으로 등록한다(별도 엔티티 아님) — 달력·D-day·상세 패널에 그대로 흐른다.
- `leave: 'full'`(연차 1일) / `'half'`(반차 0.5일). 반차는 하루짜리라 모달에서 종료일 칸을 숨기고 `end`를 비운다.
- 사용량 `leaveDays(s)`: 반차는 시작일 0.5, 연차는 기간 중 **근무일만** 1일씩. 근무일 판정은 `isOffDay()` — 주말과 **공휴일은 차감하지 않는다**(추석 낀 연차 과다 차감 방지). `leaveUsed(prefix)`는 `'YYYY'`/`'YYYY-MM'`/`'YYYY-MM-DD'` 접두사로 합산(`leaveOn`은 날짜 전체 키를 넘기는 래퍼).
- **기준 잔여일은 수기 입력**: `state.vacation['YYYY']`. 상단 칩(`#vacChip`, 보고 있는 달의 연도 기준)에 `남음 = 기준 − 사용`을 표시하고, 클릭하면 설정 모달(`#vacOverlay`). ≤1일 `.low`(오커) / ≤0일 `.over`(레드). 기준값 미입력이면 "잔여 입력" `.unset`.
- 휴가가 있는 날은 칸에 `.cal-cell.vac` 틴트 + 2줄 미리보기에서 휴가 바를 앞으로 당겨 가려지지 않게 한다. 월 요약줄에도 `· 휴가 n일`.

## 공휴일
출처는 **구글 대한민국 공휴일 iCal 피드**(인증 불필요, 2021–2031 수록). `DESCRIPTION`이 `공휴일`인 항목만 취해 기념일(식목일·어버이날·크리스마스 이브 등)은 버리고, 구글식 `"쉬는 날 삼일절"`은 `"삼일절 대체공휴일"`로 뒤집는다.
- `holidays.js` — electron 비의존 순수 node 모듈(파서 `parseIcs` + 수신 `fetchHolidays` + 방어선 `isSane`). main.js와 tools 양쪽에서 공용.
- `assets/holidays-kr.json` — 번들 기본값(약 6KB, `{ updatedAt, source, days: { 'YYYY-MM-DD': '추석' } }`). **첫 실행부터 오프라인으로 동작**. 재생성은 `node tools/update-holidays.js`.
- 런타임 갱신: main.js가 앱 시작 5초 뒤 `refreshHolidays()` — 데이터가 30일보다 오래됐을 때만 피드를 받아 `%APPDATA%/weekly-work-board/holidays-cache.json`에 쓰고 `holidays:updated`를 렌더러에 푸시(재시작 없이 다시 그림). **실패하면 조용히 번들로 계속 간다**(오프라인·피드 형식 변경 모두 무해). 임시공휴일 지정이 이 경로로 들어온다.
- `loadHolidays()`는 캐시/번들 중 `updatedAt`이 늦은 쪽을 쓴다 — 번들을 새로 커밋해도 묵은 캐시에 밀리지 않게.
- `isSane()`: 연도별 10일 미만이면 피드를 믿지 않고 버린다(피드 형식이 바뀌어 전부 걸러지는 사고 방지).
- 표시: 글자색만으로는 눈에 안 들어와서 **배경까지 바꾼다** — 월간 칸 `.cal-cell.holiday`(danger 15% 틴트 + 붉은 테두리 + `.hol-name`), 주간 열 `.col.holiday`(danger 11% 틴트 + 이름 띠 `.col-holiday`), 상세 패널 `.hol-badge`. 휴가 틴트(오커)보다 뒤에 둬서 겹치면 공휴일이 이기고, `.today` 액센트 테두리는 따로 살려 둔다. **주간 열 표시는 아티팩트에 없는 앱 전용 차이**.
- 브라우저(아티팩트)에서 열면 `boardAPI`가 없어 공휴일 없이 동작한다.

## 구조
- `main.js` — 메인 프로세스: 창/트레이/단일 인스턴스, 자동 시작(`setLoginItemSettings`, dev는 electron.exe+앱경로+`--hidden` 등록), IPC(`state:load/save`, `csv:open`, `holidays:load`), CSV 생성(1s 디바운스), 공휴일 갱신
- `holidays.js` — 공휴일 iCal 파서/수신(순수 node). `tools/update-holidays.js`로 `assets/holidays-kr.json` 재생성
- `preload.js` — `window.boardAPI` (contextBridge)
- `renderer/index.html` — UI 전체(단일 파일, CSS/JS 인라인). 아티팩트 버전과 동일 디자인이며 앱 전용 차이: doctype/head 래핑, async IIFE + boardAPI 저장, `doneAt` 기록, "CSV 폴더 열기" 버튼, **월간 보드 전체**(아티팩트에 없음)
- `assets/tray.png` — 트레이 아이콘(PowerShell System.Drawing으로 생성)

## 데이터
- 상태 파일: `%APPDATA%/weekly-work-board/board-state.json` (공휴일 캐시는 같은 폴더 `holidays-cache.json`, 별도 관리)
- 형태: `{ weeks: { 'YYYY-MM-DD(월요일)': { mon..fri: Card[] } }, longterm: Card[], longtermCategories: string[], schedules: Schedule[], vacation: { 'YYYY': number }, tagColors: { tag: 0-7 }, hideDone }`
- Schedule(월간 전용): `{ id, title, type: delivery|meeting|trip|vacation|etc, leave: ''|full|half, start: 'YYYY-MM-DD', end: '', time: 'HH:MM', memo, createdAt }` — `end`는 여러 날 걸칠 때만(단일일은 `''`), 둘째 날부터 칩에 `…` 접두. `leave`는 `type:'vacation'`에서만 의미 있음. 유형 색은 기존 태그 토큰 재사용(`.sc-delivery`→t5, meeting→t1, trip→t2, vacation→t6, etc→t7)이라 테마 4블록을 건드릴 필요 없음.
- Card: `{ id, title, memo, prio: high|mid|low, tag, due: 'YYYY-MM-DD', done, doneAt?, subs, createdAt }`
- 하위업무(`subs`): `[{ id, title, done }]` — 편집 모달에서만 수정(취소 시 폐기), 카드에는 `☑ 완료/전체` 칩만 표시. CSV에는 미포함.
- CSV: `문서/주간업무보드/업무기록-YYYY-MM.csv` (날짜/요일/제목/우선순위/태그/마감기한/완료/완료일/메모/등록일) + `장기업무.csv`. BOM+CRLF (엑셀 한글). **월간 일정·휴가는 CSV 미기록**(board-state.json에만).

## 디자인
- 톤앤매너: "유칼립투스 어스톤" — 그린그레이 중성색 + 틸 액센트 `--accent:#17766B`, 경고는 클레이 레드/오커(뮤트)
- 테마 토큰 4블록: `:root`(라이트) / `@media dark`(들여쓰기 다름 주의 — 일괄치환 시 누락된 전례 있음) / `[data-theme=dark]` / `[data-theme=light]`
- 태그 파스텔 8색: `--t{0-7}b/t` 토큰, `.tc0~.tc7` 클래스. 우선순위는 제목 앞 9px 점.

## 실행/주의
- `npm start` (electron .) · 바탕화면 바로가기 "주간 업무 보드.lnk"
- **extract-zip이 이 PC에서 조용히 실패** → electron 재설치 시 zip을 `Expand-Archive`로 `node_modules/electron/dist`에 수동 추출 + `path.txt`(내용 `electron.exe`) 필요
- 프로젝트 폴더 이동 시 자동 시작 레지스트리·바로가기 경로 깨짐. 미패키징(electron-builder 미적용).
- 아티팩트(프로토타입) 원본: claude.ai artifact `113c270d-...` — 렌더러 수정 시 디자인 변경은 양쪽 반영 여부 확인
