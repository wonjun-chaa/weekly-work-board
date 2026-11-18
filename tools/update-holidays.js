'use strict';
/* assets/holidays-kr.json 재생성 — `node tools/update-holidays.js`
 *
 * 앱은 시작할 때 알아서 갱신하므로 평소엔 돌릴 일이 없다.
 * 번들 기본값 자체를 최신으로 올리고 싶을 때(= 커밋에 반영하고 싶을 때)만 쓴다. */

const fs = require('fs');
const path = require('path');
const { fetchHolidays } = require('../holidays');

const OUT = path.join(__dirname, '..', 'assets', 'holidays-kr.json');

fetchHolidays(20000).then((data) => {
  const keys = Object.keys(data.days).sort();
  const sorted = {};
  keys.forEach((k) => { sorted[k] = data.days[k]; });

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({
    updatedAt: data.updatedAt,
    source: data.source,
    days: sorted
  }, null, 0) + '\n');

  const perYear = {};
  keys.forEach((k) => { perYear[k.slice(0, 4)] = (perYear[k.slice(0, 4)] || 0) + 1; });
  console.log('저장: ' + OUT);
  console.log('총 ' + keys.length + '일 · 연도별 ' + JSON.stringify(perYear));
}).catch((e) => {
  console.error('실패:', e.message);
  process.exit(1);
});
