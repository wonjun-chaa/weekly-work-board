const { app, BrowserWindow, Tray, Menu, ipcMain, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
const DAY_KO = ['월', '화', '수', '목', '금'];
const PRIO_KO = { high: '높음', mid: '보통', low: '낮음' };

let win = null;
let tray = null;
let quitting = false;
let csvTimer = null;

const startHidden = process.argv.slice(1).includes('--hidden');

function stateFile() {
  return path.join(app.getPath('userData'), 'board-state.json');
}
function csvDir() {
  return path.join(app.getPath('documents'), '주간업무보드');
}

/* ---------- single instance ---------- */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { win.show(); win.focus(); }
  });
}

/* ---------- auto launch ----------
 * Electron's app.setLoginItemSettings() writes the Run key on Windows
 * without quoting path/args. Both the electron.exe path and this project's
 * folder ("0. 개인") contain spaces, so the resulting command string is
 * unparsable and Windows silently fails to launch it at logon. We manage
 * the Run key ourselves with properly quoted values instead.
 */
const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const RUN_VALUE_NAME = 'WeeklyWorkBoard';
const LEGACY_RUN_VALUE_NAME = 'electron.app.Electron'; // name Electron used; may have a broken unquoted entry

function loginItemCommand() {
  const parts = ['"' + process.execPath + '"'];
  if (!app.isPackaged) parts.push('"' + path.resolve(__dirname) + '"');
  parts.push('--hidden');
  return parts.join(' ');
}
function getAutoLaunch() {
  if (process.platform !== 'win32') return app.getLoginItemSettings().openAtLogin;
  try {
    execFileSync('reg', ['query', RUN_KEY, '/v', RUN_VALUE_NAME], { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}
function setAutoLaunch(on) {
  if (process.platform !== 'win32') {
    app.setLoginItemSettings({ openAtLogin: on });
    return;
  }
  try { execFileSync('reg', ['delete', RUN_KEY, '/v', LEGACY_RUN_VALUE_NAME, '/f'], { stdio: 'ignore' }); } catch (e) {}
  if (on) {
    execFileSync('reg', ['add', RUN_KEY, '/v', RUN_VALUE_NAME, '/t', 'REG_SZ', '/d', loginItemCommand(), '/f'], { stdio: 'ignore' });
  } else {
    try { execFileSync('reg', ['delete', RUN_KEY, '/v', RUN_VALUE_NAME, '/f'], { stdio: 'ignore' }); } catch (e) {}
  }
}

/* ---------- CSV export ---------- */
function csvEscape(v) {
  return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
}
function fmtDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function isoDay(s) {
  return s ? String(s).slice(0, 10) : '';
}

function writeCsvFiles(state) {
  const dir = csvDir();
  fs.mkdirSync(dir, { recursive: true });

  // group weekday cards by calendar month
  const months = {};
  Object.keys(state.weeks || {}).forEach((wk) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(wk);
    if (!m) return;
    const monday = new Date(+m[1], +m[2] - 1, +m[3]);
    DAY_KEYS.forEach((dk, i) => {
      (state.weeks[wk][dk] || []).forEach((c) => {
        const d = new Date(monday);
        d.setDate(d.getDate() + i);
        const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        (months[key] = months[key] || []).push({ date: d, day: DAY_KO[i], c });
      });
    });
  });

  const header = ['날짜', '요일', '제목', '우선순위', '태그', '마감기한', '완료', '완료일', '메모', '등록일'];
  Object.keys(months).forEach((mk) => {
    const rows = months[mk].sort((a, b) => a.date - b.date);
    const lines = [header.map(csvEscape).join(',')];
    rows.forEach((r) => {
      lines.push([
        fmtDate(r.date), r.day, r.c.title, PRIO_KO[r.c.prio] || '',
        r.c.tag || '', r.c.due || '', r.c.done ? '완료' : '미완료',
        isoDay(r.c.doneAt), r.c.memo || '', isoDay(r.c.createdAt)
      ].map(csvEscape).join(','));
    });
    // BOM + CRLF so Excel opens Korean text correctly
    fs.writeFileSync(path.join(dir, '업무기록-' + mk + '.csv'), '\uFEFF' + lines.join('\r\n'), 'utf8');
  });

  const ltHeader = ['제목', '우선순위', '태그', '마감기한', '완료', '완료일', '메모', '등록일'];
  const ltLines = [ltHeader.map(csvEscape).join(',')];
  (state.longterm || []).forEach((c) => {
    ltLines.push([
      c.title, PRIO_KO[c.prio] || '', c.tag || '', c.due || '',
      c.done ? '완료' : '미완료', isoDay(c.doneAt), c.memo || '', isoDay(c.createdAt)
    ].map(csvEscape).join(','));
  });
  fs.writeFileSync(path.join(dir, '장기업무.csv'), '\uFEFF' + ltLines.join('\r\n'), 'utf8');
}

function scheduleCsv(state) {
  clearTimeout(csvTimer);
  csvTimer = setTimeout(() => {
    try { writeCsvFiles(state); } catch (e) { console.error('CSV 저장 실패:', e); }
  }, 1000);
}

/* ---------- IPC ---------- */
ipcMain.handle('state:load', () => {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
  } catch (e) {
    return null;
  }
});
ipcMain.handle('state:save', (e, state) => {
  try {
    fs.writeFileSync(stateFile(), JSON.stringify(state), 'utf8');
    scheduleCsv(state);
    return true;
  } catch (err) {
    console.error('상태 저장 실패:', err);
    return false;
  }
});
ipcMain.handle('csv:open', () => {
  const dir = csvDir();
  fs.mkdirSync(dir, { recursive: true });
  return shell.openPath(dir);
});

/* ---------- window & tray ---------- */
function createWindow() {
  win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 900,
    minHeight: 560,
    show: !startHidden,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', 'tray.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // closing the window keeps the app alive in the tray
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide();
    }
  });
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: '보드 열기', click: () => { win.show(); win.focus(); } },
    { label: 'CSV 폴더 열기', click: () => { fs.mkdirSync(csvDir(), { recursive: true }); shell.openPath(csvDir()); } },
    { type: 'separator' },
    {
      label: 'Windows 시작 시 자동 실행',
      type: 'checkbox',
      checked: getAutoLaunch(),
      click: (item) => { setAutoLaunch(item.checked); }
    },
    { type: 'separator' },
    { label: '종료', click: () => { quitting = true; app.quit(); } }
  ]);
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
  tray = new Tray(icon);
  tray.setToolTip('주간 업무 보드');
  tray.setContextMenu(buildTrayMenu());
  tray.on('double-click', () => { win.show(); win.focus(); });
  tray.on('right-click', () => tray.setContextMenu(buildTrayMenu()));
}

app.whenReady().then(() => {
  // enable auto-launch by default on first run
  if (!fs.existsSync(stateFile()) && !getAutoLaunch()) {
    setAutoLaunch(true);
  }
  createWindow();
  createTray();
});

app.on('before-quit', () => { quitting = true; });

// keep running in tray even when all windows are closed
app.on('window-all-closed', () => {});
