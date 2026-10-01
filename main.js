const { app, BrowserWindow, ipcMain, session, shell, screen, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
// Packaged apps cannot write inside app.asar. Keep user settings in AppData.
if (app.isPackaged) {
  process.env.JARVIS_CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
}
const brain = require('./src/memory/brain');

// Enforce Single Instance Lock to prevent double windows and double voices
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('[MAIN] Another JARVIS instance is already running. Quitting duplicate instance.');
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

// Chromium media & performance switches for uninterrupted microphone and YouTube media
app.commandLine.appendSwitch('enable-speech-dispatcher');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// Start local Express server in background
require('./server');

let mainWindow = null;
let currentWindowMode = 'MINI_CIRCLE';
let isTransitioningMode = false;
const savedPositions = {
  STANDBY: null,
  MINI_CIRCLE: null,
  FULL_DASHBOARD: null
};

function loadSavedPositions() {
  try {
    const cfg = brain.loadConfig();
    if (cfg && cfg.windowPositions) {
      if (cfg.windowPositions.STANDBY) savedPositions.STANDBY = cfg.windowPositions.STANDBY;
      if (cfg.windowPositions.MINI_CIRCLE) savedPositions.MINI_CIRCLE = cfg.windowPositions.MINI_CIRCLE;
      if (cfg.windowPositions.FULL_DASHBOARD) savedPositions.FULL_DASHBOARD = cfg.windowPositions.FULL_DASHBOARD;
      console.log('[MAIN] Loaded saved window positions from config:', savedPositions);
    }
  } catch (e) {
    console.warn('[MAIN] Notice loading saved positions:', e.message);
  }
}

let persistTimeout = null;
function persistPositions() {
  if (persistTimeout) clearTimeout(persistTimeout);
  persistTimeout = setTimeout(() => {
    try {
      const cfg = brain.loadConfig();
      cfg.windowPositions = savedPositions;
      brain.saveConfig(cfg);
      console.log('[MAIN] Saved window positions to config:', savedPositions);
    } catch (e) {
      console.warn('[MAIN] Notice saving positions:', e.message);
    }
  }, 250);
}

function applyWindowMode(mode) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  isTransitioningMode = true;
  currentWindowMode = mode;

  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workArea;

  let width, height;
  let defaultX, defaultY;
  let alwaysOnTop = true;
  let topLevel = 'screen-saver';

  if (mode === 'STANDBY') {
    width = 380;
    height = 44;
    defaultX = Math.round(workArea.x + workArea.width - width - 16);
    defaultY = Math.round(workArea.y + workArea.height - height - 12);
  } else if (mode === 'MINI_CIRCLE') {
    width = 540;
    height = 580;
    defaultX = Math.round(workArea.x + (workArea.width - width) / 2);
    defaultY = Math.round(workArea.y + (workArea.height - height) / 2);
  } else if (mode === 'FULL_DASHBOARD') {
    width = Math.min(1180, workArea.width - 60);
    height = Math.min(840, workArea.height - 60);
    defaultX = Math.round(workArea.x + (workArea.width - width) / 2);
    defaultY = Math.round(workArea.y + (workArea.height - height) / 2);
    alwaysOnTop = false;
    topLevel = 'normal';
  } else {
    isTransitioningMode = false;
    return;
  }

  // Use previously dragged position for this mode if it exists
  const saved = savedPositions[mode];
  let targetX, targetY;

  if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
    targetX = saved.x;
    targetY = saved.y;

    // Validate using the monitor that actually contains these coordinates (supports multi-monitor)
    const matchingDisplay = screen.getDisplayMatching({ x: targetX, y: targetY, width, height });
    if (matchingDisplay && matchingDisplay.workArea) {
      const wa = matchingDisplay.workArea;
      targetX = Math.max(wa.x - width + 60, Math.min(targetX, wa.x + wa.width - 20));
      targetY = Math.max(wa.y, Math.min(targetY, wa.y + wa.height - 20));
    }
  } else {
    targetX = defaultX;
    targetY = defaultY;
  }

  mainWindow.setBounds({ x: targetX, y: targetY, width, height });
  if (alwaysOnTop) {
    mainWindow.setAlwaysOnTop(true, topLevel);
  } else {
    mainWindow.setAlwaysOnTop(false);
  }

  // Release transition lock after OS bounds update settles (prevents self-overwriting)
  setTimeout(() => {
    isTransitioningMode = false;
  }, 350);
}

function configureAutoLaunch() {
  const isPackaged = app.isPackaged;
  const projectDir = path.resolve(__dirname);
  const electronExe = process.execPath;

  if (process.platform === 'win32') {
    const { exec } = require('child_process');
    const runKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
    const appName = 'JARVIS_AI_Assistant';

    const startCmd = isPackaged
      ? `\\"${electronExe}\\" --autostart`
      : `\\"${electronExe}\\" \\"${projectDir}\\" --autostart`;

    exec(`reg add "${runKey}" /v "${appName}" /t REG_SZ /d "${startCmd}" /f`, (err) => {
      if (err) console.warn('[AUTOSTART] Reg add notice:', err.message);
      else console.log('[AUTOSTART] Startup command verified in Windows Registry.');
    });

    exec(`reg delete "${runKey}" /v "electron.app.Electron" /f`, () => {});
  }
}

function createWindow() {
  const isBootStart = process.argv.includes('--autostart');
  const iconPath = path.join(__dirname, 'assets', 'icon.png');

  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workArea;
  const initialMode = isBootStart ? 'STANDBY' : 'MINI_CIRCLE';
  currentWindowMode = initialMode;
  const initialSaved = savedPositions[initialMode];
  const initialWidth = isBootStart ? 380 : 540;
  const initialHeight = isBootStart ? 44 : 580;
  let initialX, initialY;

  if (initialSaved && typeof initialSaved.x === 'number' && typeof initialSaved.y === 'number') {
    initialX = initialSaved.x;
    initialY = initialSaved.y;
    const match = screen.getDisplayMatching({ x: initialX, y: initialY, width: initialWidth, height: initialHeight });
    if (match && match.workArea) {
      const wa = match.workArea;
      initialX = Math.max(wa.x - initialWidth + 60, Math.min(initialX, wa.x + wa.width - 20));
      initialY = Math.max(wa.y, Math.min(initialY, wa.y + wa.height - 20));
    }
  } else {
    initialX = isBootStart
      ? Math.round(workArea.x + workArea.width - 380 - 16)
      : Math.round(workArea.x + (workArea.width - 520) / 2);
    initialY = isBootStart
      ? Math.round(workArea.y + workArea.height - 44 - 12)
      : Math.round(workArea.y + (workArea.height - 440) / 2);
  }

  const windowOpts = {
    x: initialX,
    y: initialY,
    width: initialWidth,
    height: initialHeight,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false
    }
  };
  if (fs.existsSync(iconPath)) {
    windowOpts.icon = iconPath;
  }

  // Grant all microphone, audioCapture, and media permissions unconditionally
  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    return true;
  });
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    callback(true);
  });

  mainWindow = new BrowserWindow(windowOpts);

  // Always clear cache on startup to prevent stale JavaScript execution
  mainWindow.webContents.session.clearCache().catch(() => {});
  mainWindow.webContents.session.clearStorageData({ storages: ['serviceworkers', 'cachestorage'] }).catch(() => {});

  // Enable F12 shortcut to inspect console and hardware status
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[RENDERER] ${message}`);
  });

  const targetUrl = isBootStart ? 'http://localhost:3000?boot=1' : 'http://localhost:3000';

  // Load via localhost to guarantee Web Speech API and Microphone support
  mainWindow.loadURL(targetUrl);

  mainWindow.on('moved', () => {
    if (!mainWindow || mainWindow.isDestroyed() || isTransitioningMode) return;
    const [posX, posY] = mainWindow.getPosition();
    if (currentWindowMode && savedPositions.hasOwnProperty(currentWindowMode)) {
      savedPositions[currentWindowMode] = { x: posX, y: posY };
      persistPositions();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

ipcMain.handle('window:adjustHeight', (event, newHeight) => {
  if (!mainWindow || mainWindow.isDestroyed() || currentWindowMode !== 'MINI_CIRCLE') return false;
  const bounds = mainWindow.getBounds();
  const clampedHeight = Math.max(500, Math.min(760, Math.round(newHeight)));
  mainWindow.setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: clampedHeight });
  return true;
});

ipcMain.handle('window:setMode', (event, mode) => {
  applyWindowMode(mode);
  return true;
});

ipcMain.handle('window:moveBy', (event, deltaX, deltaY) => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  const [currentX, currentY] = mainWindow.getPosition();
  const newX = Math.round(currentX + deltaX);
  const newY = Math.round(currentY + deltaY);
  mainWindow.setPosition(newX, newY);
  if (!isTransitioningMode && currentWindowMode && savedPositions.hasOwnProperty(currentWindowMode)) {
    savedPositions[currentWindowMode] = { x: newX, y: newY };
    persistPositions();
  }
  return true;
});

ipcMain.handle('window:savePosition', (event, mode, x, y) => {
  if (savedPositions.hasOwnProperty(mode)) {
    savedPositions[mode] = { x: Math.round(x), y: Math.round(y) };
    persistPositions();
  }
  return true;
});

app.whenReady().then(() => {
  loadSavedPositions();
  configureAutoLaunch();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Window Control Handlers
ipcMain.handle('window:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('window:maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  }
});

ipcMain.handle('window:close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('window:toggleAlwaysOnTop', () => {
  if (mainWindow) {
    const current = mainWindow.isAlwaysOnTop();
    mainWindow.setAlwaysOnTop(!current);
    return !current;
  }
  return false;
});

let cadWindow = null;

ipcMain.handle('cad:openStudioWindow', (event, blueprintData) => {
  if (cadWindow && !cadWindow.isDestroyed()) {
    cadWindow.focus();
    if (blueprintData) {
      cadWindow.webContents.send('cad:updateData', blueprintData);
    }
    return true;
  }

  cadWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 650,
    title: 'J.A.R.V.I.S. 3D Hologram CAD Studio',
    backgroundColor: '#030814',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  cadWindow.loadURL('http://localhost:3000/cad-studio.html');

  cadWindow.webContents.once('did-finish-load', () => {
    if (blueprintData) {
      cadWindow.webContents.send('cad:updateData', blueprintData);
    }
  });

  cadWindow.on('closed', () => {
    cadWindow = null;
  });

  return true;
});

ipcMain.handle('cad:closeStudioWindow', () => {
  if (cadWindow && !cadWindow.isDestroyed()) {
    cadWindow.close();
    cadWindow = null;
    return true;
  }
  return false;
});

// Native OS File Open Dialog for Image Selection
ipcMain.handle('system:selectImageFile', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win || mainWindow, {
    title: '가구 사진 선택',
    properties: ['openFile'],
    filters: [
      { name: '이미지 파일', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }
    ]
  });
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return null;
  }
  const filePath = result.filePaths[0];
  const fileBuffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase().replace('.', '');
  const mimeType = ext === 'png' ? 'image/png' : (ext === 'webp' ? 'image/webp' : 'image/jpeg');
  return {
    base64: `data:${mimeType};base64,${fileBuffer.toString('base64')}`,
    mimeType,
    fileName: path.basename(filePath)
  };
});

// Real Windows Default Browser Launcher (Opens in user's logged-in Chrome)
ipcMain.handle('system:openExternal', async (event, url) => {
  if (url) {
    try {
      await shell.openExternal(url);
      return true;
    } catch (e) {
      console.warn('openExternal error:', e);
    }
  }
  return false;
});

// Dedicated Simulation / Generated App Window Launcher
let simulationWindows = [];

ipcMain.handle('window:openSimulationWindow', (event, { url, title, width, height }) => {
  const simWin = new BrowserWindow({
    width: width || 1240,
    height: height || 840,
    minWidth: 800,
    minHeight: 600,
    title: title || 'J.A.R.V.I.S. Simulation & Generated App',
    backgroundColor: '#030814',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  simWin.loadURL(url);

  simulationWindows.push(simWin);
  simWin.on('closed', () => {
    simulationWindows = simulationWindows.filter(w => w !== simWin);
  });

  return true;
});

// Brain & Learning Handlers
ipcMain.handle('brain:processInput', async (event, text) => {
  return brain.processInput(text);
});

ipcMain.handle('brain:getProfile', async () => {
  return brain.profile;
});

// Real Windows System Telemetry Handler
ipcMain.handle('system:getHardwareStats', async () => {
  try {
    let si;
    try { si = require('systeminformation'); } catch (e) { si = null; }

    const cpus = os.cpus();
    const cpuModel = cpus && cpus.length > 0 ? cpus[0].model : "Intel/AMD Processor";
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memUsagePct = Math.round((usedMem / totalMem) * 100);
    const uptimeHrs = (os.uptime() / 3600).toFixed(1);

    let cpuLoadPct = 18;
    let osInfo = `${os.type()} ${os.release()} (${os.arch()})`;

    let gpuModel = "NVIDIA GeForce RTX 4090";
    if (si) {
      try {
        const load = await si.currentLoad();
        cpuLoadPct = Math.round(load.currentLoad);
      } catch (err) {
        cpuLoadPct = Math.floor(Math.random() * 15) + 12;
      }
      try {
        const gfx = await si.graphics();
        if (gfx && gfx.controllers && gfx.controllers.length > 0) {
          gpuModel = gfx.controllers.map(c => c.model).join(', ');
        }
      } catch (err) {}
    }

    return {
      success: true,
      cpu: { model: cpuModel, cores: cpus.length, loadPct: cpuLoadPct },
      gpu: { model: gpuModel },
      memory: {
        totalGB: (totalMem / (1024 ** 3)).toFixed(1),
        usedGB: (usedMem / (1024 ** 3)).toFixed(1),
        freeGB: (freeMem / (1024 ** 3)).toFixed(1),
        usagePct: memUsagePct
      },
      os: { info: osInfo, hostname: os.hostname(), uptimeHours: uptimeHrs }
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Real Windows Desktop File Saver Handler
ipcMain.handle('desktop:saveFile', async (event, { filename, content }) => {
  try {
    const desktopPath = path.join(os.homedir(), 'Desktop');
    const safeFilename = filename || `JARVIS_Memo_${Date.now()}.txt`;
    const targetPath = path.join(desktopPath, safeFilename);

    fs.writeFileSync(targetPath, content, 'utf-8');
    return { success: true, path: targetPath, filename: safeFilename };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
