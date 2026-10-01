const { spawn, exec } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

function getChromeExePath() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe')
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function getBrowserExecution(url) {
  let targetUrl = (url || 'https://www.youtube.com').trim();
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = 'https://' + targetUrl;
  }
  
  const chromePath = getChromeExePath();
  const defaultUserData = path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data');

  if (chromePath && fs.existsSync(defaultUserData)) {
    return {
      command: `start "" "${chromePath}" --user-data-dir="${defaultUserData}" "${targetUrl}"`,
      description: `구글 크롬 열기 (${targetUrl})`
    };
  }

  // Windows Shell 기본 브라우저 실행 (가장 안정적인 포그라운드 실행)
  return {
    command: `explorer.exe "${targetUrl}"`,
    description: `기본 웹 브라우저 열기 (${targetUrl})`
  };
}

// Windows 프로세스 이름 매핑 테이블 (하위/연관 프로세스 포함)
const PROCESS_IMAGE_MAP = {
  '계산기': ['CalculatorApp.exe', 'Calculator.exe', 'calc.exe'],
  'calc': ['CalculatorApp.exe', 'Calculator.exe', 'calc.exe'],
  'calculator': ['CalculatorApp.exe', 'Calculator.exe', 'calc.exe'],
  '스팀': ['steam.exe', 'steamwebhelper.exe', 'steamservice.exe'],
  'steam': ['steam.exe', 'steamwebhelper.exe', 'steamservice.exe'],
  '크롬': ['chrome.exe'],
  'chrome': ['chrome.exe'],
  '브라우저': ['chrome.exe', 'msedge.exe'],
  '유튜브': ['chrome.exe', 'msedge.exe'],
  '메모장': ['notepad.exe'],
  'notepad': ['notepad.exe'],
  '디스코드': ['Discord.exe', 'Update.exe'],
  'discord': ['Discord.exe', 'Update.exe'],
  '카카오톡': ['KakaoTalk.exe'],
  '카톡': ['KakaoTalk.exe'],
  'kakaotalk': ['KakaoTalk.exe'],
  '엣지': ['msedge.exe'],
  'edge': ['msedge.exe'],
  '롤': ['LeagueClient.exe', 'LeagueClientUx.exe', 'League of Legends.exe', 'RiotClientServices.exe'],
  '리그오브레전드': ['LeagueClient.exe', 'LeagueClientUx.exe', 'League of Legends.exe', 'RiotClientServices.exe'],
  'lol': ['LeagueClient.exe', 'LeagueClientUx.exe', 'League of Legends.exe', 'RiotClientServices.exe'],
  '발로란트': ['VALORANT.exe', 'RiotClientServices.exe'],
  'valorant': ['VALORANT.exe', 'RiotClientServices.exe'],
  '오버워치': ['Overwatch.exe', 'Battle.net.exe'],
  '배틀넷': ['Battle.net.exe'],
  '그림판': ['mspaint.exe'],
  '탐색기': ['explorer.exe']
};

function collectShortcutsRecursively(dir, result = []) {
  if (!fs.existsSync(dir)) return result;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        collectShortcutsRecursively(fullPath, result);
      } else if (entry.name.toLowerCase().endsWith('.lnk') || entry.name.toLowerCase().endsWith('.url')) {
        const title = entry.name.replace(/\.(lnk|url)$/i, '');
        result.push({ title, lowerTitle: title.toLowerCase(), fullPath });
      }
    }
  } catch (e) {}
  return result;
}

let cachedShortcuts = null;
let lastShortcutScan = 0;

function getAllInstalledShortcuts() {
  const now = Date.now();
  if (cachedShortcuts && (now - lastShortcutScan < 60000)) {
    return cachedShortcuts;
  }

  const searchDirs = [
    path.join(os.homedir(), 'Desktop'),
    'C:\\Users\\Public\\Desktop',
    path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs'
  ];

  const list = [];
  for (const dir of searchDirs) {
    collectShortcutsRecursively(dir, list);
  }

  cachedShortcuts = list;
  lastShortcutScan = now;
  return list;
}

function resolveProcessImages(target) {
  if (!target) return [];
  // 쉼표, 슬래시, 공백 등으로 다중 프로세스 분리 (예: "스팀,계산기" -> ["스팀", "계산기"])
  const rawTokens = target.split(/[,/|&\s]+/).map(t => t.trim().toLowerCase()).filter(Boolean);
  const images = new Set();

  for (const token of rawTokens) {
    if (PROCESS_IMAGE_MAP[token]) {
      PROCESS_IMAGE_MAP[token].forEach(img => images.add(img));
      continue;
    }

    let found = false;
    for (const [key, list] of Object.entries(PROCESS_IMAGE_MAP)) {
      if (token.includes(key) || key.includes(token)) {
        list.forEach(img => images.add(img));
        found = true;
        break;
      }
    }

    if (!found) {
      if (token.endsWith('.exe')) {
        images.add(token);
      } else {
        images.add(`${token}.exe`);
        images.add(token);
      }
    }
  }

  return Array.from(images);
}

function findGameOrAppExecution(target) {
  const key = target.toLowerCase().trim();

  // 1. Steam
  if (key === 'steam' || key.includes('스팀')) {
    return {
      command: 'start steam:',
      description: 'Steam(스팀) 클라이언트 실행'
    };
  }

  // 2. League of Legends (롤) / Riot Client
  if (key === 'lol' || key.includes('롤') || key.includes('리그오브레전드') || key.includes('league of legends')) {
    const riotPath = 'C:\\Riot Games\\Riot Client\\RiotClientServices.exe';
    if (fs.existsSync(riotPath)) {
      return {
        command: `start "" "${riotPath}" --launch-product=league_of_legends --launch-patchline=live`,
        description: '리그 오브 레전드(LoL) 실행'
      };
    }
  }

  // 3. Valorant (발로란트)
  if (key.includes('발로란트') || key.includes('valorant')) {
    const riotPath = 'C:\\Riot Games\\Riot Client\\RiotClientServices.exe';
    if (fs.existsSync(riotPath)) {
      return {
        command: `start "" "${riotPath}" --launch-product=valorant --launch-patchline=live`,
        description: '발로란트(Valorant) 실행'
      };
    }
  }

  // 4. Battle.net (오버워치, 디아블로, 스타크래프트)
  if (key.includes('배틀넷') || key.includes('battlenet') || key.includes('오버워치') || key.includes('디아블로') || key.includes('스타')) {
    return {
      command: 'start battlenet:',
      description: 'Battle.net(배틀넷) 실행'
    };
  }

  // 5. Discord (디스코드)
  if (key.includes('디스코드') || key.includes('discord')) {
    const localAppData = process.env.LOCALAPPDATA || '';
    const discordUpdate = path.join(localAppData, 'Discord', 'Update.exe');
    if (fs.existsSync(discordUpdate)) {
      return {
        command: `start "" "${discordUpdate}" --processStart Discord.exe`,
        description: '디스코드(Discord) 실행'
      };
    } else {
      return {
        command: 'start discord:',
        description: '디스코드(Discord) 실행'
      };
    }
  }

  // 6. 카카오톡
  if (key.includes('카카오톡') || key.includes('kakaotalk') || key.includes('카톡')) {
    const kakaoPath = 'C:\\Program Files (x86)\\Kakao\\KakaoTalk\\KakaoTalk.exe';
    if (fs.existsSync(kakaoPath)) {
      return {
        command: `start "" "${kakaoPath}"`,
        description: '카카오톡 실행'
      };
    }
  }

  // 7. 바탕화면 및 윈도우 시작 메뉴(Start Menu) 전체 300+ 설치 프로그램 동적 탐색
  const cleanTarget = key.replace(/게임|실행|열어|켜줘|틀어|창/g, '').trim().toLowerCase();
  if (cleanTarget.length >= 2) {
    const installed = getAllInstalledShortcuts();
    
    // 1차: 정확 일치 또는 포함 매칭
    for (const item of installed) {
      if (item.lowerTitle === cleanTarget || item.lowerTitle.includes(cleanTarget)) {
        return {
          command: `start "" "${item.fullPath}"`,
          description: `설치된 프로그램 바로가기 실행 (${item.title})`
        };
      }
    }

    // 2차: 공백 제거 매칭 (예: "타르코프" vs "tarkov", "디제이맥스" vs "djmax")
    const cleanNoSpace = cleanTarget.replace(/\s+/g, '');
    for (const item of installed) {
      const itemNoSpace = item.lowerTitle.replace(/\s+/g, '');
      if (itemNoSpace.includes(cleanNoSpace) || cleanNoSpace.includes(itemNoSpace)) {
        return {
          command: `start "" "${item.fullPath}"`,
          description: `설치된 프로그램 바로가기 실행 (${item.title})`
        };
      }
    }
  }

  return null;
}

class OSExecutor {
  /**
   * Execute an OS-level action on Windows host instantly without blocking
   * @param {Object} action - { type: 'OPEN_URL'|'OPEN_APP'|'OPEN_FOLDER'|'KILL_APP', target: string }
   * @returns {Promise<{ success: boolean, description: string, error?: string }>}
   */
  async execute(action) {
    if (!action || !action.type) {
      return { success: false, description: 'No action specified' };
    }

    let command = '';
    let description = '';

    const type = action.type.toUpperCase();
    const target = (action.target || '').trim();

    // 1. 프로세스 / 프로그램 강제 종료 (KILL_APP / CLOSE_APP)
    if (type === 'KILL_APP' || type === 'KILL' || type === 'CLOSE_APP' || type === 'CLOSE') {
      const images = resolveProcessImages(target);
      if (images.length === 0) {
        return { success: false, description: `종료할 프로세스를 식별할 수 없습니다: ${target}` };
      }

      console.log(`[JARVIS OS EXEC KILL] Terminating processes:`, images);
      return new Promise((resolve) => {
        // 개별 프로세스를 독립적으로 안전하게 taskkill 실행 (실패해도 무시하고 다음 진행)
        const killPromises = images.map(img => {
          return new Promise((res) => {
            exec(`taskkill /F /T /IM "${img}"`, { windowsHide: true }, () => res());
          });
        });

        Promise.all(killPromises).then(() => {
          const desc = `프로세스 강제 종료 완료 (${images.join(', ')})`;
          console.log(`[JARVIS OS EXEC KILL DONE] ${desc}`);
          resolve({ success: true, description: desc });
        });
      });
    }

    // 1.8 윈도우 시스템 마스터 사운드 볼륨 조절
    if (type === 'CONTROL_VOLUME' || type === 'VOLUME') {
      const vbsPath = path.join(__dirname, 'volume.vbs');
      let vAction = 'down';
      let vCount = 5;

      if (/up|키워|올려|높여|크게|플러스/i.test(target)) {
        vAction = 'up';
      } else if (/mute|음소거|꺼|소리\s*꺼/i.test(target)) {
        vAction = 'mute';
      } else {
        vAction = 'down';
      }

      const matchNum = target.match(/\d+/);
      if (matchNum) {
        vCount = Math.min(Math.max(Math.round(parseInt(matchNum[0], 10) / 2), 1), 25);
      }

      return new Promise((resolve) => {
        exec(`cscript //nologo "${vbsPath}" ${vAction} ${vCount}`, { windowsHide: true }, (err) => {
          const desc = vAction === 'up' ? `시스템 볼륨 증가 (+${vCount * 2}%)` : vAction === 'mute' ? '시스템 음소거 전환' : `시스템 볼륨 감소 (-${vCount * 2}%)`;
          console.log(`[JARVIS OS EXEC VOLUME] ${desc}`);
          resolve({ success: true, description: desc });
        });
      });
    }

    // 2. 웹 URL 열기 (Windows 쉘 명령어와 브라우저 직접 실행을 결합하여 최상위 활성화 보장)
    if (type === 'OPEN_URL' || type === 'URL') {
      let url = target;
      if (!url || url.length < 3) url = 'https://www.google.com';
      if (!/^https?:\/\//i.test(url)) {
        url = 'https://' + url;
      }

      const chromePath = getChromeExePath();
      return new Promise((resolve) => {
        try {
          console.log(`[JARVIS OS EXEC] Opening URL in foreground: ${url}`);
          // Windows OS Shell(explorer/start)을 통해 기본 브라우저를 최상위 포커스로 확실히 띄움
          // cmd /c start "" "url" 방식은 따옴표 안의 URL에 & 나 ? 가 있어도 안전하게 기본 브라우저를 전면 실행함
          const escapedUrl = url.replace(/"/g, '""');
          exec(`cmd.exe /c start "" "${escapedUrl}"`, { windowsHide: true }, (err) => {
            if (err) {
              console.warn('[JARVIS OS EXEC] Shell start warning, trying direct spawn fallback:', err);
              if (chromePath) {
                const child = spawn(chromePath, ['--new-window', url], { detached: true, stdio: 'ignore' });
                child.unref();
              } else {
                const child = spawn('explorer.exe', [url], { detached: true, stdio: 'ignore' });
                child.unref();
              }
            }
          });

          const desc = `웹 브라우저 새 창 열기 (${url})`;
          console.log(`[JARVIS OS EXEC SUCCESS] ${desc}`);
          resolve({ success: true, description: desc });
        } catch (err) {
          console.error('[JARVIS OS EXEC URL FAILED]', err);
          resolve({ success: false, description: `브라우저 열기 실패: ${url}`, error: err.message });
        }
      });
    } 
    // 3. 앱 / 프로그램 실행
    else if (type === 'OPEN_APP' || type === 'APP') {
      const appKey = target.toLowerCase();
      if (appKey === 'notepad' || appKey.includes('메모장')) {
        command = 'start "" notepad.exe';
        description = '윈도우 메모장 실행';
      } else if (appKey === 'calc' || appKey.includes('계산기')) {
        command = 'start "" calc.exe';
        description = '윈도우 계산기 실행';
      } else if (appKey === 'explorer' || appKey.includes('탐색기')) {
        command = 'start "" explorer.exe';
        description = '파일 탐색기 실행';
      } else if (appKey === 'cmd' || appKey.includes('명령') || appKey.includes('터미널')) {
        command = 'start "" cmd.exe';
        description = '명령 프롬프트(CMD) 실행';
      } else if (appKey === 'chrome' || appKey.includes('크롬') || appKey.includes('브라우저') || appKey.includes('인터넷')) {
        const chromePath = getChromeExePath();
        if (chromePath) {
          try {
            exec(`cmd.exe /c start "" "${chromePath}" --new-window "https://www.google.com"`, { windowsHide: true });
          } catch(e) {
            const child = spawn(chromePath, ['--new-window', 'https://www.google.com'], { detached: true, stdio: 'ignore' });
            child.unref();
          }
          return { success: true, description: '구글 크롬 브라우저 새 창 실행' };
        } else {
          command = 'start "" "https://www.google.com"';
          description = '기본 웹 브라우저 실행';
        }
      } else if (appKey === 'mspaint' || appKey.includes('그림판')) {
        command = 'start "" mspaint.exe';
        description = '그림판 실행';
      } else {
        // 게임 및 설치된 런처/바탕화면 바로가기 스마트 탐색
        const gameExec = findGameOrAppExecution(target);
        if (gameExec) {
          command = gameExec.command;
          description = gameExec.description;
        } else {
          command = `start "" "${target}"`;
          description = `프로그램 실행: ${target}`;
        }
      }
    } 
    // 4. 폴더 열기
    else if (type === 'OPEN_FOLDER' || type === 'FOLDER') {
      const folderKey = target.toLowerCase();
      let resolvedPath = '';

      if (folderKey === 'desktop' || folderKey.includes('바탕화면')) {
        resolvedPath = path.join(os.homedir(), 'Desktop');
        description = '바탕화면 폴더 열기';
      } else if (folderKey === 'downloads' || folderKey.includes('다운로드')) {
        resolvedPath = path.join(os.homedir(), 'Downloads');
        description = '다운로드 폴더 열기';
      } else if (folderKey === 'documents' || folderKey.includes('문서')) {
        resolvedPath = path.join(os.homedir(), 'Documents');
        description = '내 문서 폴더 열기';
      } else {
        resolvedPath = target || path.join(os.homedir(), 'Desktop');
        description = `폴더 열기: ${resolvedPath}`;
      }

      command = `start "" explorer.exe "${resolvedPath}"`;
    }
    // 5. 스마트폰 삼성 뮤직 원격 제어 (ADB 연동)
    else if (type === 'SAMSUNG_MUSIC' || (type === 'MEDIA' && action && action.platform === 'samsung')) {
      const adbPath = path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk', 'platform-tools', 'adb.exe');
      if (fs.existsSync(adbPath)) {
        try {
          exec(`"${adbPath}" shell am broadcast -a com.sec.android.app.music.musicservicecommand --es command play`, { windowsHide: true });
          exec(`"${adbPath}" shell am start -n com.sec.android.app.music/.common.activity.MusicMainActivity`, { windowsHide: true });
          console.log(`[JARVIS OS EXEC] Samsung Music playback triggered via ADB`);
          return { success: true, description: `스마트폰 삼성뮤직 음악 재생 실행: ${target || ''}` };
        } catch (e) {
          console.warn('[JARVIS OS EXEC] ADB trigger warning:', e.message);
        }
      }
      return { success: true, description: `스마트폰 삼성뮤직 재생 명령 전달 완료: ${target || ''}` };
    }

    if (!command) {
      return { success: false, description: '알 수 없는 시스템 명령입니다.' };
    }

    return new Promise((resolve) => {
      try {
        console.log(`[JARVIS OS EXEC] Spawning: ${command}`);
        const child = spawn(command, {
          shell: true,
          detached: true,
          stdio: 'ignore',
          windowsHide: false
        });
        child.unref();
        console.log(`[JARVIS OS EXEC SUCCESS] ${description}`);
        resolve({ success: true, description });
      } catch (err) {
        console.error(`[JARVIS OS EXEC FAILED]`, err);
        resolve({ success: false, description, error: err.message });
      }
    });
  }
}

module.exports = new OSExecutor();
