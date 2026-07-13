# 주간 업무 보드 (Electron)

월–금 요일별 열 + 장기업무 열 칸반 보드. 트레이 상주, 로그인 자동 시작, 월별 CSV 자동 기록.

## 구조
- `main.js` — 메인 프로세스: 창/트레이/단일 인스턴스, 자동 시작(`setLoginItemSettings`, dev는 electron.exe+앱경로+`--hidden` 등록), IPC(`state:load/save`, `csv:open`), CSV 생성(1s 디바운스)
- `preload.js` — `window.boardAPI` (contextBridge)
- `renderer/index.html` — UI 전체(단일 파일, CSS/JS 인라인). 아티팩트 버전과 동일 디자인이며 앱 전용 차이: doctype/head 래핑, async IIFE + boardAPI 저장, `doneAt` 기록, "CSV 폴더 열기" 버튼
- `assets/tray.png` — 트레이 아이콘(PowerShell System.Drawing으로 생성)

## 데이터
- 상태 파일: `%APPDATA%/weekly-work-board/board-state.json`
- 형태: `{ weeks: { 'YYYY-MM-DD(월요일)': { mon..fri: Card[] } }, longterm: Card[], tagColors: { tag: 0-7 }, hideDone }`
- Card: `{ id, title, memo, prio: high|mid|low, tag, due: 'YYYY-MM-DD', done, doneAt?, createdAt }`
- CSV: `문서/주간업무보드/업무기록-YYYY-MM.csv` (날짜/요일/제목/우선순위/태그/마감기한/완료/완료일/메모/등록일) + `장기업무.csv`. BOM+CRLF (엑셀 한글).

## 디자인
- 톤앤매너: "유칼립투스 어스톤" — 그린그레이 중성색 + 틸 액센트 `--accent:#17766B`, 경고는 클레이 레드/오커(뮤트)
- 테마 토큰 4블록: `:root`(라이트) / `@media dark`(들여쓰기 다름 주의 — 일괄치환 시 누락된 전례 있음) / `[data-theme=dark]` / `[data-theme=light]`
- 태그 파스텔 8색: `--t{0-7}b/t` 토큰, `.tc0~.tc7` 클래스. 우선순위는 제목 앞 9px 점.

## 실행/주의
- `npm start` (electron .) · 바탕화면 바로가기 "주간 업무 보드.lnk"
- **extract-zip이 이 PC에서 조용히 실패** → electron 재설치 시 zip을 `Expand-Archive`로 `node_modules/electron/dist`에 수동 추출 + `path.txt`(내용 `electron.exe`) 필요
- 프로젝트 폴더 이동 시 자동 시작 레지스트리·바로가기 경로 깨짐. 미패키징(electron-builder 미적용).
- 아티팩트(프로토타입) 원본: claude.ai artifact `113c270d-...` — 렌더러 수정 시 디자인 변경은 양쪽 반영 여부 확인
