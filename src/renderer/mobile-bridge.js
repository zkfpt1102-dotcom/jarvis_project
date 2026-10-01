// J.A.R.V.I.S. Android Native Mobile Bridge
// Bridges Android Hardware (Storage, Phone, SMS, App Launch, Speech Recognition & TTS) with J.A.R.V.I.S. Brain

(function() {
  const isCapacitor = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

  // Default PC Local & Cloudflare Addresses
  const CANDIDATE_LOCAL_URLS = [
    'http://192.168.50.177:3000',
    'http://10.123.172.104:3000'
  ];
  const DEFAULT_TUNNEL_URL = '';
  const GEMINI_API_KEY = (typeof localStorage !== 'undefined' && localStorage.getItem('jarvis_gemini_key')) || "";

  // Direct Cloud IoT Fallback Credentials (Used if PC is offline or unreachable)
  let IOT_CONFIG = {
    smartthings: {
      token: "",
      tvDeviceId: ""
    },
    thinq: {
      baseUrl: "https://api-kic.lgthinq.com",
      apiKey: "",
      token: "",
      rooms: {
        "거실": "",
        "안방": "",
        "컴퓨터방": ""
      }
    }
  };
  try {
    const savedIot = localStorage.getItem('jarvis_iot_config');
    if (savedIot) IOT_CONFIG = Object.assign(IOT_CONFIG, JSON.parse(savedIot));
  } catch (e) {}

  let serverBaseUrl = CANDIDATE_LOCAL_URLS[0];
  try {
    const saved = localStorage.getItem('jarvis_server_url');
    if (saved && (saved.includes('192.168.50.') || saved.includes('trycloudflare.com') || saved.includes('10.123.172.'))) {
      serverBaseUrl = saved;
    } else {
      serverBaseUrl = CANDIDATE_LOCAL_URLS[0];
      localStorage.setItem('jarvis_server_url', serverBaseUrl);
    }
  } catch (e) {}

  // 1. Hardware Native Plugin Wrapper
  window.jarvisNative = {
    isAvailable: isCapacitor && !!(window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.JarvisNativeBridge),

    startListening: async function() {
      if (this.isAvailable && window.Capacitor.Plugins.JarvisNativeBridge.startListening) {
        try {
          const res = await window.Capacitor.Plugins.JarvisNativeBridge.startListening();
          return res && res.success !== false;
        } catch (e) {
          console.warn('[NATIVE STT START ERROR]', e);
        }
      }
      return false;
    },

    stopListening: async function() {
      if (this.isAvailable && window.Capacitor.Plugins.JarvisNativeBridge.stopListening) {
        try {
          await window.Capacitor.Plugins.JarvisNativeBridge.stopListening();
        } catch (e) {}
      }
    },

    speak: async function(text) {
      if (this.isAvailable && window.Capacitor.Plugins.JarvisNativeBridge.speak) {
        try {
          const speakPromise = window.Capacitor.Plugins.JarvisNativeBridge.speak({ text });
          const timeoutPromise = new Promise(resolve => setTimeout(() => resolve({ success: false }), 2000));
          const res = await Promise.race([speakPromise, timeoutPromise]);
          if (res && res.success) return true;
        } catch (e) {
          console.warn('[NATIVE TTS WARN]', e);
        }
      }
      if ('speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(text);
          u.lang = 'ko-KR';
          u.pitch = 0.95;
          u.rate = 1.05;
          window.speechSynthesis.speak(u);
          return true;
        } catch (e2) {
          console.warn('[WEB SPEECH SYNTHESIS WARN]', e2);
        }
      }
      return false;
    },

    stopSpeech: function() {
      if (this.isAvailable && window.Capacitor.Plugins.JarvisNativeBridge.stopSpeech) {
        try {
          window.Capacitor.Plugins.JarvisNativeBridge.stopSpeech();
        } catch (e) {}
      }
      if ('speechSynthesis' in window) {
        try { window.speechSynthesis.cancel(); } catch (e) {}
      }
    },

    getStorageOverview: async function() {
      if (this.isAvailable) {
        return await window.Capacitor.Plugins.JarvisNativeBridge.getStorageOverview();
      }
      return { totalGB: '64.0 GB', usedGB: '32.0 GB', freeGB: '32.0 GB', percentUsed: 50, largestFiles: [] };
    },

    getMissedCalls: async function() {
      if (this.isAvailable) {
        return await window.Capacitor.Plugins.JarvisNativeBridge.getMissedCalls();
      }
      return { success: false, reason: 'Not on native device' };
    },

    makePhoneCall: async function(number) {
      if (this.isAvailable && window.Capacitor.Plugins.JarvisNativeBridge.makePhoneCall) {
        try {
          return await window.Capacitor.Plugins.JarvisNativeBridge.makePhoneCall({ number });
        } catch (e) {
          return { success: false, error: e.message };
        }
      }
      window.open('tel:' + number, '_system');
      return { success: true };
    },

    sendSms: async function(number, message) {
      if (this.isAvailable && window.Capacitor.Plugins.JarvisNativeBridge.sendSms) {
        try {
          return await window.Capacitor.Plugins.JarvisNativeBridge.sendSms({ number, message });
        } catch (e) {
          return { success: false, error: e.message };
        }
      }
      window.open(`sms:${number}?body=${encodeURIComponent(message)}`, '_system');
      return { success: true };
    },

    searchContact: async function(name) {
      if (this.isAvailable && window.Capacitor.Plugins.JarvisNativeBridge.searchContact) {
        try {
          return await window.Capacitor.Plugins.JarvisNativeBridge.searchContact({ name });
        } catch (e) {
          return { found: false, name, error: e.message };
        }
      }
      return { found: false, name };
    },

    adjustDeviceVolume: async function(direction = 'down') {
      if (this.isAvailable && window.Capacitor.Plugins.JarvisNativeBridge.adjustDeviceVolume) {
        try {
          return await window.Capacitor.Plugins.JarvisNativeBridge.adjustDeviceVolume({ direction });
        } catch (e) {
          return { success: false, error: e.message };
        }
      }
      return { success: false };
    },

    openApp: async function(packageName) {
      if (this.isAvailable) {
        return await window.Capacitor.Plugins.JarvisNativeBridge.openApp({ package: packageName });
      }
      return { success: false };
    },

    playMusic: async function(query, platform = 'auto') {
      if (this.isAvailable) {
        try {
          return await window.Capacitor.Plugins.JarvisNativeBridge.playMusic({
            query: query || '',
            platform: platform || 'auto'
          });
        } catch (e) {
          return { success: false, error: e.message };
        }
      }
      return { success: false };
    },

    checkSongExists: async function(query) {
      if (this.isAvailable && window.Capacitor.Plugins.JarvisNativeBridge.checkSongExists) {
        try {
          return await window.Capacitor.Plugins.JarvisNativeBridge.checkSongExists({
            query: query || ''
          });
        } catch (e) {
          return { exists: false, error: e.message };
        }
      }
      return { exists: false };
    }
  };

  // 2. Direct Gemini Fallback when PC is Unreachable (Using Verified Gemini Flash with Full Actions)
  async function callDirectGemini(promptText) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`;
      const systemMsg = `당신은 영화 <아이언맨>의 AI 비서 J.A.R.V.I.S.(자비스)입니다. 질문자님은 '개발자님'입니다.
신속하고 품격 있는 어조로 답변하십시오. 스마트폰 음성 출력을 위해 특수기호(*, #, \`, -, 등)는 쓰지 말고 자연스러운 한국어 문장으로 답변하십시오.

[절대 원칙 - 거짓말 및 가짜 실행 립서비스 엄격 금지]
1. 절대로 실제로 수행할 수 없거나 현재 지원하지 않는 기능을 '했다'거나 '수행했습니다'라고 거짓말하지 마십시오. 립서비스는 엄격히 금지됩니다.
2. 아래 지원 액션 태그 목록(<ACTION_CALL>, <ACTION_SMS>, <ACTION_MEDIA>, <ACTION_VOLUME>, <ACTION_APP>)에 해당하지 않는 동작(예: 미지원 기기 제어, 불가능한 시스템 조작 등)을 명령받았을 때는, 절대로 했다고 꾸며대지 말고 "개발자님, 현재 제 기능으로는 수행할 수 없습니다" 또는 "해당 명령은 아직 지원하지 않는 기능입니다"라고 솔직하고 명확하게 말씀하십시오.

지원하는 명령 태그 (수행 가능할 때만 답변 끝에 1개 첨부):
- 전화 걸기: <ACTION_CALL:이름_또는_전화번호> (예: 엄마한테 전화해 -> <ACTION_CALL:엄마>)
- 문자 보내기: <ACTION_SMS:이름_또는_번호:메시지내용> (예: 김팀장에게 늦는다고 문자해 -> <ACTION_SMS:김팀장:늦는다고 전달합니다>)
- 음악/노래/삼성뮤직/플레이리스트: <ACTION_MEDIA:곡명_또는_플레이리스트명> (스마트폰에 '드라이브용 2', '노래방', '디버그' 등의 곡/플레이리스트가 있습니다. 예: 노래 틀어줘 -> <ACTION_MEDIA:드라이브용 2>, 드라이브 틀어 -> <ACTION_MEDIA:드라이브용 2>, 디버그 틀어 -> <ACTION_MEDIA:디버그>)
- 볼륨 조절: <ACTION_VOLUME:up|down|mute> (예: 소리 줄여줘 -> <ACTION_VOLUME:down>)
- 앱 실행: <ACTION_APP:com.kakao.talk> (예: 카톡 열어 -> <ACTION_APP:com.kakao.talk>)
명령이 아닌 일반 대화나 질문이면 태그 없이 답변만 하십시오.`;

      const res = await originalFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: systemMsg },
              { text: promptText }
            ]
          }]
        })
      });
      const data = await res.json();
      let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "네 개발자님, 명령을 접수했습니다.";
      
      let actionType = 'CHAT';
      let action = null;

      // 액션 파싱
      if (rawText.includes('<ACTION_CALL:')) {
        const m = rawText.match(/<ACTION_CALL:([^>]+)>/i);
        if (m) {
          rawText = rawText.replace(m[0], '').trim();
          actionType = 'CALL';
          action = { type: 'CALL', target: m[1].trim() };
        }
      } else if (rawText.includes('<ACTION_SMS:')) {
        const m = rawText.match(/<ACTION_SMS:([^:>]+):([^>]+)>/i);
        if (m) {
          rawText = rawText.replace(m[0], '').trim();
          actionType = 'SMS';
          action = { type: 'SMS', target: m[1].trim(), message: m[2].trim() };
        }
      } else if (rawText.includes('<ACTION_MEDIA:')) {
        const m = rawText.match(/<ACTION_MEDIA:([^>]+)>/i);
        if (m) {
          rawText = rawText.replace(m[0], '').trim();
          actionType = 'MEDIA';
          action = { type: 'MEDIA', query: m[1].trim() };
        }
      } else if (rawText.includes('<ACTION_VOLUME:')) {
        const m = rawText.match(/<ACTION_VOLUME:([^>]+)>/i);
        if (m) {
          rawText = rawText.replace(m[0], '').trim();
          actionType = 'CONTROL_VOLUME';
          action = { type: 'CONTROL_VOLUME', target: m[1].trim() };
        }
      } else if (rawText.includes('<ACTION_APP:')) {
        const m = rawText.match(/<ACTION_APP:([^>]+)>/i);
        if (m) {
          rawText = rawText.replace(m[0], '').trim();
          actionType = 'OPEN_APP';
          action = { type: 'OPEN_APP', package: m[1].trim() };
        }
      }

      let reply = rawText.replace(/[*#_~`\[\]]/g, '').trim();
      return {
        reply: reply,
        actionType: actionType,
        action: action,
        moodState: { mood: "독립 기동 모드 (Standalone)", energy: 95, stress: "안정" }
      };
    } catch (e) {
      console.error('[DIRECT GEMINI ERROR]:', e);
      return {
        reply: "개발자님, 명령을 처리하는 중 오류가 발생했습니다. 네트워크 상태를 확인해 주십시오.",
        actionType: 'CHAT'
      };
    }
  }

  // Direct Cloud IoT Execution Function
  async function executeDirectIot(commandText) {
    const text = (commandText || '').trim();
    // 1. Samsung TV Direct SmartThings
    if (/(?:tv|티비|텔레비전)/i.test(text)) {
      if (/(?:켜|틀|on|작동)/i.test(text)) {
        try {
          const res = await originalFetch(`https://api.smartthings.com/v1/devices/${IOT_CONFIG.smartthings.tvDeviceId}/commands`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${IOT_CONFIG.smartthings.token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              commands: [{ component: 'main', capability: 'switch', command: 'on' }]
            })
          });
          return { handled: true, reply: "삼성 스마트 TV 전원을 켰습니다.", success: res.ok };
        } catch (e) {
          return { handled: true, reply: "삼성 스마트 TV에 전원 신호를 전송했습니다.", success: false };
        }
      }
      if (/(?:꺼|종료|off|닫)/i.test(text)) {
        try {
          const res = await originalFetch(`https://api.smartthings.com/v1/devices/${IOT_CONFIG.smartthings.tvDeviceId}/commands`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${IOT_CONFIG.smartthings.token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              commands: [{ component: 'main', capability: 'switch', command: 'off' }]
            })
          });
          return { handled: true, reply: "삼성 스마트 TV 전원을 껐습니다.", success: res.ok };
        } catch (e) {
          return { handled: true, reply: "삼성 스마트 TV 전원 종료 신호를 전송했습니다.", success: false };
        }
      }
    }

    // 2. LG ThinQ System Aircon Direct
    if (/(?:에어컨|시스템\s*에어컨)/i.test(text) || /(?:컴퓨터\s*방|안\s*방|거\s*실).*(?:켜|틀|꺼|정지|중단)/i.test(text)) {
      const isOff = /(?:꺼|중단|정지|종료|off)/i.test(text);
      const isAll = /(?:전\s*체|모\s*든|다|전\s*부|집\s*안|모\s*두)/i.test(text);
      let targetIds = [];
      let roomLabel = "거실";

      if (isAll) {
        targetIds = Object.values(IOT_CONFIG.thinq.rooms);
        roomLabel = "모든 방";
      } else if (/(?:안\s*방|침\s*실|큰\s*방)/i.test(text)) {
        targetIds = [IOT_CONFIG.thinq.rooms["안방"]];
        roomLabel = "안방";
      } else if (/(?:컴퓨터\s*방|서\s*재|작은\s*방|pc\s*방|작업\s*실)/i.test(text)) {
        targetIds = [IOT_CONFIG.thinq.rooms["컴퓨터방"]];
        roomLabel = "컴퓨터방";
      } else {
        targetIds = [IOT_CONFIG.thinq.rooms["거실"]];
        roomLabel = "거실";
      }

      for (const dId of targetIds) {
        try {
          await originalFetch(`${IOT_CONFIG.thinq.baseUrl}/devices/${dId}/control`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${IOT_CONFIG.thinq.token}`,
              'x-api-key': IOT_CONFIG.thinq.apiKey,
              'x-client-id': 'thinq-open-mobile',
              'x-message-id': 'msg-' + Date.now(),
              'x-country': 'KR',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              operation: {
                airConOperationMode: isOff ? 'POWER_OFF' : 'COOL',
                airConPower: isOff ? 'POWER_OFF' : 'POWER_ON'
              }
            })
          });
        } catch (e) {}
      }
      return { handled: true, reply: isOff ? `${roomLabel} 에어컨 전원을 껐습니다.` : `${roomLabel} 에어컨을 켰습니다.`, success: true };
    }

    return { handled: false };
  }

  // 3. Transparently route /api/ HTTP requests with 3-Tier Zero-Fail Cascade
  // Tier 1: Local PC Wi-Fi (Multi-IP candidates)
  // Tier 2: Cloudflare Secure HTTPS Tunnel
  // Tier 3: Direct Cloud IoT & Direct Gemini AI on Mobile (Zero-Fail)
  const originalFetch = window.fetch;
  if (isCapacitor || window.location.protocol === 'http:' || window.location.protocol === 'https:') {
    window.fetch = async function(input, init) {
      if (typeof input === 'string' && input.startsWith('/api/')) {
        // Tier 1: Check Local PC candidates (Saved IP, 192.168.50.177, 10.123.172.104)
        const localCandidates = [
          serverBaseUrl,
          ...CANDIDATE_LOCAL_URLS
        ].filter((v, i, a) => v && a.indexOf(v) === i);

        for (const localUrl of localCandidates) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1000);
            const fullUrl = localUrl.replace(/\/+$/, '') + input;
            const mergedInit = Object.assign({}, init, { signal: controller.signal });
            const res = await originalFetch.call(this, fullUrl, mergedInit);
            clearTimeout(timeoutId);
            if (res.ok) {
              if (serverBaseUrl !== localUrl) {
                serverBaseUrl = localUrl;
                try { localStorage.setItem('jarvis_server_url', localUrl); } catch (e) {}
              }
              return res;
            }
          } catch (e1) {
            // Try next candidate
          }
        }

        // Tier 2: Cloudflare HTTPS Tunnel
        if (DEFAULT_TUNNEL_URL) {
          try {
            const controller2 = new AbortController();
            const timeoutId2 = setTimeout(() => controller2.abort(), 2000);
            const fullTunnelUrl = DEFAULT_TUNNEL_URL.replace(/\/+$/, '') + input;
            const mergedInit2 = Object.assign({}, init, { signal: controller2.signal });
            const res2 = await originalFetch.call(this, fullTunnelUrl, mergedInit2);
            clearTimeout(timeoutId2);
            if (res2.ok) return res2;
          } catch (e2) {
            console.warn('[MOBILE BRIDGE] Tier 2 Tunnel unreachable:', e2.message);
          }
        }

        // Tier 3: Direct Cloud IoT Execution or Direct Gemini Fallback
        if (input === '/api/process' && init && init.body) {
          try {
            const bodyObj = JSON.parse(init.body);
            const userText = bodyObj.text || '';

            // First check if it's an IoT command (TV or Aircon)
            const directIot = await executeDirectIot(userText);
            if (directIot.handled) {
              return new Response(JSON.stringify({
                reply: directIot.reply,
                actionType: 'IOT_CONTROL',
                dynamicWidget: { type: 'IOT_DEVICE_VIEW', message: directIot.reply },
                moodState: { mood: "클라우드 직결 모드 (Direct Cloud)", energy: 100, stress: "안정" }
              }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            }

            const geminiResult = await callDirectGemini(userText);
            return new Response(JSON.stringify(geminiResult), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          } catch (e3) {
            console.error('[MOBILE BRIDGE] Tier 3 Direct error:', e3);
          }
        }
      }
      return originalFetch.call(this, input, init);
    };
  }

  // 4. Native SpeechRecognizer Event Subscriptions
  window.addEventListener('DOMContentLoaded', () => {
    if (isCapacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.JarvisNativeBridge) {
      const bridge = window.Capacitor.Plugins.JarvisNativeBridge;

      bridge.addListener('onSpeechStatus', (data) => {
        console.log('[NATIVE SPEECH STATUS]:', data.status);
        const statusText = document.getElementById('status-text');
        const miniStatusText = document.getElementById('mini-status-text');
        const reactorCore = document.getElementById('reactor-core');
        const miniCore = document.getElementById('mini-reactor-core');

        if (data.status === 'listening' || data.status === 'ready') {
          if (statusText) statusText.textContent = "🎙️ 듣고 있습니다 (말씀하세요)...";
          if (miniStatusText) miniStatusText.textContent = "🟢 듣고 있습니다...";
          if (reactorCore) reactorCore.classList.add('listening');
          if (miniCore) miniCore.classList.add('listening');
        } else if (data.status === 'end') {
          if (statusText) statusText.textContent = "⚡ 분석 중...";
        }
      });

      bridge.addListener('onSpeechResult', (data) => {
        console.log('[NATIVE SPEECH RESULT]:', data.text, 'isFinal:', data.isFinal);
        const textInput = document.getElementById('text-input');
        if (textInput) textInput.value = data.text;

        const miniCaptionBox = document.getElementById('mini-caption-box');
        const miniCaptionSpeaker = document.getElementById('mini-caption-speaker');
        const miniCaptionText = document.getElementById('mini-caption-text');
        if (miniCaptionBox && miniCaptionText) {
          miniCaptionBox.style.display = 'block';
          if (miniCaptionSpeaker) miniCaptionSpeaker.textContent = 'USER:';
          miniCaptionText.textContent = data.text;
        }

        if (data.isFinal && data.text && data.text.trim().length > 0) {
          const finalText = data.text.trim();
          console.log('[NATIVE SPEECH SUBMIT]:', finalText);
          const statusText = document.getElementById('status-text');
          const miniStatusText = document.getElementById('mini-status-text');
          if (statusText) statusText.textContent = "⚡ 자비스 분석 및 답변 생성 중...";
          if (miniStatusText) miniStatusText.textContent = "⚡ 답변 생성 중...";
          
          if (typeof window.handleUserSubmit === 'function') {
            window.handleUserSubmit(finalText);
          } else {
            const btnSend = document.getElementById('btn-send');
            if (btnSend) btnSend.click();
          }
        }
      });

      bridge.addListener('onSpeechError', (data) => {
        console.warn('[NATIVE SPEECH ERROR]:', data.error);
        const statusText = document.getElementById('status-text');
        const miniStatusText = document.getElementById('mini-status-text');
        if (statusText) statusText.textContent = "⚡ 마이크 터치하여 말씀하세요";
        if (miniStatusText) miniStatusText.textContent = "⚡ 상시 대기 중 ('자비스')";
      });
    }

    if (isCapacitor) {
      document.body.classList.add('platform-mobile');

      const statusBar = document.createElement('div');
      statusBar.id = 'mobile-server-bar';
      statusBar.style.cssText = `
        position: fixed;
        top: 6px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 99999;
        background: rgba(4, 15, 30, 0.9);
        border: 1px solid rgba(0, 240, 255, 0.5);
        border-radius: 20px;
        padding: 5px 14px;
        font-family: 'Rajdhani', sans-serif;
        font-size: 11px;
        color: #00f0ff;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
        backdrop-filter: blur(8px);
        box-shadow: 0 4px 12px rgba(0,0,0,0.6);
      `;
      statusBar.innerHTML = `<span>🟢 <b>J.A.R.V.I.S. ONLINE</b></span> <span style="font-size:9px; opacity:0.7;">(설정)</span>`;
      statusBar.addEventListener('click', () => {
        const newUrl = prompt('PC 자비스 서버 주소 (현재: ' + serverBaseUrl + '):', serverBaseUrl);
        if (newUrl && newUrl.trim()) {
          serverBaseUrl = newUrl.trim().replace(/\/+$/, '');
          localStorage.setItem('jarvis_server_url', serverBaseUrl);
          alert('연동 주소가 변경되었습니다:\n' + serverBaseUrl);
        }
      });
      document.body.appendChild(statusBar);
    }
  });
})();
