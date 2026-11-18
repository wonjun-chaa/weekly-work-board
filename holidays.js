'use strict';
/* 대한민국 공휴일 데이터.
 *
 * 출처는 구글이 공개하는 대한민국 공휴일 iCal 피드(인증 불필요, 2021~2031년 수록).
 * DESCRIPTION이 "공휴일"인 항목만 취해 기념일(식목일·어버이날·크리스마스 이브 등)은 버린다.
 *
 * 이 파일은 electron을 require하지 않는 순수 node 모듈이라
 * main.js(런타임 갱신)와 tools/fetch-holidays.js(번들 생성) 양쪽에서 같이 쓴다. */

const https = require('https');

const ICS_URL = 'https://calendar.google.com/calendar/ical/' +
  'ko.south_korea%23holiday%40group.v.calendar.google.com/public/basic.ics';

function dash(ymd) {
  return ymd.slice(0, 4) + '-' + ymd.slice(4, 6) + '-' + ymd.slice(6, 8);
}

/* 'YYYYMMDD' 하루 더하기 — DTEND가 배타적이라 하루씩 늘려가며 채운다 */
function nextYmd(ymd) {
  const d = new Date(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8) + 1);
  return String(d.getFullYear()) +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0');
}

/* 구글은 대체공휴일을 "쉬는 날 삼일절"로 적는다 — 읽기 좋게 뒤집어 준다 */
function tidyName(summary) {
  const m = /^쉬는 ?날\s+(.+)$/.exec(summary);
  return m ? m[1] + ' 대체공휴일' : summary;
}

function parseIcs(text) {
  const unfolded = String(text).replace(/\r?\n[ \t]/g, '');
  const days = {};
  let cur = null;

  unfolded.split(/\r?\n/).forEach((line) => {
    if (line === 'BEGIN:VEVENT') { cur = {}; return; }
    if (line === 'END:VEVENT') {
      // DESCRIPTION이 "기념일"인 항목은 쉬는 날이 아니라서 버린다
      if (cur && cur.start && cur.summary && /공휴일/.test(cur.desc || '')) {
        const name = tidyName(cur.summary);
        let ymd = cur.start;
        const stop = cur.end && cur.end > cur.start ? cur.end : nextYmd(cur.start);
        for (let guard = 0; ymd < stop && guard < 40; guard++) {
          days[dash(ymd)] = name;
          ymd = nextYmd(ymd);
        }
      }
      cur = null;
      return;
    }
    if (!cur) return;
    const i = line.indexOf(':');
    if (i < 0) return;
    const field = line.slice(0, i);
    const value = line.slice(i + 1);
    if (field.startsWith('DTSTART')) cur.start = value.slice(0, 8);
    else if (field.startsWith('DTEND')) cur.end = value.slice(0, 8);
    else if (field === 'SUMMARY') cur.summary = value.trim();
    else if (field === 'DESCRIPTION') cur.desc = value;
  });

  return days;
}

/* 피드 형식이 바뀌어 전부 걸러지는 사고를 막는 방어선.
 * 설날·추석까지 합치면 한 해 15일은 넘으므로 10일 미만이면 믿지 않는다. */
function isSane(days) {
  const perYear = {};
  Object.keys(days).forEach((k) => {
    const y = k.slice(0, 4);
    perYear[y] = (perYear[y] || 0) + 1;
  });
  const years = Object.keys(perYear);
  if (years.length < 2) return false;
  return years.every((y) => perYear[y] >= 10);
}

function fetchIcs(timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = https.get(ICS_URL, { headers: { 'User-Agent': 'weekly-work-board' } }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error('HTTP ' + res.statusCode));
        return;
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs || 15000, () => { req.destroy(new Error('timeout')); });
  });
}

/* 성공하면 { updatedAt, source, days }, 못 믿을 데이터면 throw */
async function fetchHolidays(timeoutMs) {
  const days = parseIcs(await fetchIcs(timeoutMs));
  if (!isSane(days)) throw new Error('공휴일 데이터가 비정상입니다 (피드 형식 변경?)');
  return { updatedAt: new Date().toISOString(), source: ICS_URL, days: days };
}

module.exports = { ICS_URL, parseIcs, isSane, fetchHolidays };
