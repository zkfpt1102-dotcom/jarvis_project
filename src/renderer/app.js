// ==========================================================
// J.A.R.V.I.S. HUD CLIENT APPLICATION LOGIC
// ==========================================================

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const systemClock = document.getElementById('system-clock');
  const btnPin = document.getElementById('btn-pin');
  const btnMinimize = document.getElementById('btn-minimize');
  const btnMaximize = document.getElementById('btn-maximize');
  const btnClose = document.getElementById('btn-close');

  const userMoodVal = document.getElementById('user-mood-val');
  const userEnergyBar = document.getElementById('user-energy-bar');
  const userEnergyVal = document.getElementById('user-energy-val');
  const userStyleVal = document.getElementById('user-style-val');
  const btnOpenMemory = document.getElementById('btn-open-memory');

  const memoryModal = document.getElementById('memory-modal');
  const btnCloseMemory = document.getElementById('btn-close-memory');
  const memUserName = document.getElementById('mem-user-name');
  const memUserStyle = document.getElementById('mem-user-style');
  const memConciseness = document.getElementById('mem-conciseness');
  const memLearnedHabits = document.getElementById('mem-learned-habits');
  const memLogs = document.getElementById('mem-logs');

  const reactorCore = document.getElementById('reactor-core');
  const coreStateText = document.getElementById('core-state-text');
  const statusText = document.getElementById('status-text');
  const audioWaveCanvas = document.getElementById('audio-wave-canvas');

  const widgetEmptyState = document.getElementById('widget-empty-state');
  const dynamicWidgetMount = document.getElementById('dynamic-widget-mount');

  const messagesFeed = document.getElementById('messages-feed');
  const btnToggleVoice = document.getElementById('btn-toggle-voice');
  const btnToggleWakeWord = document.getElementById('btn-toggle-wakeword');
  const btnSessionBadge = document.getElementById('btn-session-badge');
  const btnClearFeed = document.getElementById('btn-clear-feed');
  const btnMic = document.getElementById('btn-mic');
  const textInput = document.getElementById('text-input');
  const btnSend = document.getElementById('btn-send');
  const quickChips = document.querySelectorAll('.chip-btn');
  const protocolBanner = document.getElementById('protocol-banner');
  if (protocolBanner && window.location.protocol === 'file:') {
    protocolBanner.style.display = 'flex';
  }

  // Mini HUD & Standby DOM Elements
  const jarvisMiniOverlay = document.getElementById('jarvis-mini-overlay');
  const standbyPill = document.getElementById('standby-pill');
  const miniReactorWrap = document.getElementById('mini-reactor-trigger');
  const miniReactorCore = document.getElementById('mini-reactor-core');
  const miniCoreStateText = document.getElementById('mini-core-state-text');
  const miniStatusText = document.getElementById('mini-status-text');
  const miniWaveCanvas = document.getElementById('mini-wave-canvas');
  const miniCaptionBox = document.getElementById('mini-caption-box');
  const miniCaptionSpeaker = document.getElementById('mini-caption-speaker');
  const miniCaptionText = document.getElementById('mini-caption-text');
  const btnMiniOpenDashboard = document.getElementById('btn-mini-open-dashboard');
  const btnMiniEndSession = document.getElementById('btn-mini-end-session');
  const btnSwitchToCircle = document.getElementById('btn-switch-to-circle');
  const btnSwitchToCircleWin = document.getElementById('btn-switch-to-circle-win');
  const btnToggleAutoLaunch = document.getElementById('btn-toggle-autolaunch');
  const btnOpenMobile = document.getElementById('btn-open-mobile');
  const btnOpenDirectives = document.getElementById('btn-open-directives');
  const mobileModal = document.getElementById('mobile-modal');
  const btnCloseMobile = document.getElementById('btn-close-mobile');
  const mobileIpAddress = document.getElementById('mobile-ip-address');
  const directivesModal = document.getElementById('directives-modal');
  const btnCloseDirectives = document.getElementById('btn-close-directives');
  const directivesListContainer = document.getElementById('directives-list-container');

  // App State
  let isVoiceOutputEnabled = true;
  let isWakeWordEnabled = true;
  let isSessionActive = false; // 연속 대화 세션 활성화 여부
  let sessionInactivityTimer = null;
  let isAwaitingCommand = false;
  let isListening = false;
  let isManualListening = false; // 마이크 버튼 직접 클릭 시 즉시 수동 수신 모드
  let isSpeaking = false;
  let recognition = null;
  let currentProfile = null;

  const selectMicrophone = document.getElementById('select-microphone');
  const btnRefreshMicrophones = document.getElementById('btn-refresh-microphones');
  const btnTestMicrophone = document.getElementById('btn-test-microphone');
  const microphoneTestStatus = document.getElementById('microphone-test-status');
  const desktopMicSettings = document.getElementById('desktop-mic-settings');
  if (desktopMicSettings && !window.jarvisAPI) desktopMicSettings.style.display = 'none';
  let selectedMicId = localStorage.getItem('jarvis_selected_mic_id') || '';

  // 3-State Dynamic UI Modes: 'STANDBY' | 'MINI_CIRCLE' | 'FULL_DASHBOARD'
  let currentUIMode = window.location.search.includes('boot=1') ? 'STANDBY' : 'MINI_CIRCLE';
  let isDashboardOpen = false;

  // 1. Digital Clock
  function updateClock() {
    const now = new Date();
    systemClock.textContent = now.toTimeString().split(' ')[0];
  }
  setInterval(updateClock, 1000);
  updateClock();

  // 2. Window Controls (IPC Bridge)
  if (window.jarvisAPI) {
    btnMinimize.addEventListener('click', () => window.jarvisAPI.minimize());
    btnMaximize.addEventListener('click', () => window.jarvisAPI.maximize());
    btnClose.addEventListener('click', () => window.jarvisAPI.close());
    btnPin.addEventListener('click', async () => {
      const isPinned = await window.jarvisAPI.toggleAlwaysOnTop();
      btnPin.classList.toggle('active', isPinned);
      btnPin.title = isPinned ? "고정 해제" : "항상 위에 고정";
    });
  }

  // 3. Audio Waveform Visualizer & Microphone Analyzer
  const waveCtx = audioWaveCanvas ? audioWaveCanvas.getContext('2d') : null;
  const miniWaveCtx = miniWaveCanvas ? miniWaveCanvas.getContext('2d') : null;
  let wavePhase = 0;
  let audioContext = null;
  let analyserNode = null;
  let micDataArray = null;
  let micStream = null;

  function triggerClapShockwave() {
    if (miniReactorCore) {
      miniReactorCore.classList.remove('shockwave');
      void miniReactorCore.offsetWidth;
      miniReactorCore.classList.add('shockwave');
    }
    if (reactorCore) {
      reactorCore.classList.remove('shockwave');
      void reactorCore.offsetWidth;
      reactorCore.classList.add('shockwave');
    }
  }

  function renderWaveform() {
    // A. Render on Dashboard Wave Canvas
    if (waveCtx && audioWaveCanvas) {
      waveCtx.clearRect(0, 0, audioWaveCanvas.width, audioWaveCanvas.height);
      const width = audioWaveCanvas.width;
      const height = audioWaveCanvas.height;
      const mid = height / 2;

      waveCtx.lineWidth = 2;
      waveCtx.strokeStyle = isSpeaking ? '#ffd700' : isListening ? '#00ffaa' : 'rgba(0, 240, 255, 0.4)';
      waveCtx.shadowColor = isSpeaking ? '#ffd700' : isListening ? '#00ffaa' : 'rgba(0, 240, 255, 0.2)';
      waveCtx.shadowBlur = isSpeaking ? 12 : isListening ? 8 : 3;

      if (isListening && analyserNode && micDataArray) {
        analyserNode.getByteTimeDomainData(micDataArray);
        waveCtx.beginPath();
        const sliceWidth = width / micDataArray.length;
        let x = 0;
        for (let i = 0; i < micDataArray.length; i++) {
          const v = micDataArray[i] / 128.0;
          const y = v * (height / 2);
          if (i === 0) waveCtx.moveTo(x, y);
          else waveCtx.lineTo(x, y);
          x += sliceWidth;
        }
        waveCtx.stroke();
      } else {
        waveCtx.beginPath();
        const freq = isSpeaking ? 0.08 : 0.03;
        const amp = isSpeaking ? 18 : 4;
        for (let x = 0; x < width; x += 4) {
          const y = mid + Math.sin(x * freq + wavePhase) * Math.cos(x * 0.01 + wavePhase * 0.5) * amp;
          if (x === 0) waveCtx.moveTo(x, y);
          else waveCtx.lineTo(x, y);
        }
        waveCtx.stroke();
      }
    }

    // B. Render on Mini Circle Wave Canvas (Real-time feedback for developer's voice)
    if (miniWaveCtx && miniWaveCanvas) {
      miniWaveCtx.clearRect(0, 0, miniWaveCanvas.width, miniWaveCanvas.height);
      const mWidth = miniWaveCanvas.width;
      const mHeight = miniWaveCanvas.height;
      const mMid = mHeight / 2;

      miniWaveCtx.lineWidth = 2.2;
      miniWaveCtx.strokeStyle = isSpeaking ? '#ffd700' : isListening ? '#00ffaa' : '#00f0ff';
      miniWaveCtx.shadowColor = isSpeaking ? '#ffd700' : isListening ? '#00ffaa' : 'rgba(0, 240, 255, 0.4)';
      miniWaveCtx.shadowBlur = isListening ? 12 : 5;

      if (isListening && analyserNode && micDataArray) {
        analyserNode.getByteTimeDomainData(micDataArray);
        miniWaveCtx.beginPath();
        const sliceWidth = mWidth / micDataArray.length;
        let mx = 0;
        for (let i = 0; i < micDataArray.length; i++) {
          const v = micDataArray[i] / 128.0;
          const my = v * mMid;
          if (i === 0) miniWaveCtx.moveTo(mx, my);
          else miniWaveCtx.lineTo(mx, my);
          mx += sliceWidth;
        }
        miniWaveCtx.stroke();
      } else {
        miniWaveCtx.beginPath();
        const freq = isSpeaking ? 0.09 : 0.035;
        const amp = isSpeaking ? 12 : 3;
        for (let x = 0; x < mWidth; x += 4) {
          const y = mMid + Math.sin(x * freq + wavePhase) * amp;
          if (x === 0) miniWaveCtx.moveTo(x, y);
          else miniWaveCtx.lineTo(x, y);
        }
        miniWaveCtx.stroke();
      }
    }

    wavePhase += isSpeaking ? 0.15 : 0.02;

    requestAnimationFrame(renderWaveform);
  }
  requestAnimationFrame(renderWaveform);

  // 4. Voice Engine (STT & TTS)
  async function initMicrophoneStream() {
    // 모바일 기기 및 웹 브라우저에서는 마이크 하드웨어 독점 점유(getUserMedia)를 방지하여
    // 안드로이드 통화/시스템 모드 고착 및 음성인식 충돌을 원천 차단
    const isMobile = !window.jarvisAPI && (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth <= 768);
    if (isMobile || !window.jarvisAPI) {
      if (micStream) {
        try { micStream.getTracks().forEach(t => t.stop()); } catch(e) {}
        micStream = null;
      }
      return true;
    }
    return Boolean(await ensureMicStreamForAudio());
  }

  // 4. Voice Engine (Continuous Session, Wake Word, STT & TTS)
  function playWakeChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      
      const now = ctx.currentTime;
      osc.frequency.setValueAtTime(784, now); // G5
      osc.frequency.exponentialRampToValueAtTime(1174.66, now + 0.12); // D6
      
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(now);
      osc.stop(now + 0.3);
    } catch (e) {
      console.warn('Audio chime notice:', e);
    }
  }

  function setUIMode(mode) {
    currentUIMode = mode;
    document.body.classList.remove('mode-standby', 'mode-mini-circle', 'mode-dashboard');

    // Notify Electron main process to dynamically resize and position window
    if (window.jarvisAPI && window.jarvisAPI.setUIMode) {
      window.jarvisAPI.setUIMode(mode);
    }

    if (mode === 'STANDBY') {
      isDashboardOpen = false;
      document.body.classList.add('mode-standby');
      isSessionActive = false;
      updateSessionUI();
      if (miniCaptionBox) miniCaptionBox.style.display = 'none';
    } else if (mode === 'MINI_CIRCLE') {
      isDashboardOpen = false;
      document.body.classList.add('mode-mini-circle');
      updateMiniHUDUI();
    } else if (mode === 'FULL_DASHBOARD') {
      isDashboardOpen = true;
      document.body.classList.add('mode-dashboard');
      updateSessionUI();
    }
  }

  // Initialize initial UI mode immediately on load
  setUIMode(currentUIMode);

  function updateMiniHUDUI() {
    if (!miniReactorCore) return;
    if (isSpeaking) {
      miniReactorCore.className = 'mini-core speaking';
      if (miniCoreStateText) miniCoreStateText.textContent = 'VOICE';
      if (miniStatusText) miniStatusText.textContent = '🔊 자비스 응답 중...';
    } else if (isSessionActive) {
      miniReactorCore.className = 'mini-core listening';
      if (miniCoreStateText) miniCoreStateText.textContent = 'REC';
      if (miniStatusText) miniStatusText.textContent = '🟢 듣고 있습니다 ("스팀 켜줘", "관리창 열어줘")';
    } else {
      miniReactorCore.className = 'mini-core';
      if (miniCoreStateText) miniCoreStateText.textContent = 'JARVIS';
      if (miniStatusText) miniStatusText.textContent = "⚡ 상시 대기 중 ('하이 자비스' / '자비스')";
    }
  }

  function startSession(initialCommand) {
    if (currentUIMode === 'STANDBY') {
      setUIMode('MINI_CIRCLE');
    }
    isSessionActive = true;
    playWakeChime();
    updateSessionUI();
    resetSessionInactivityTimer();

    if (initialCommand && initialCommand.length >= 2) {
      statusText.textContent = `🟢 연속 대화 세션: "${initialCommand}"`;
      textInput.value = initialCommand;
      handleUserSubmit(initialCommand);
    } else {
      statusText.textContent = "🟢 연속 대화 세션 시작 (듣고 있습니다 / 종료: '바이 자비스')";
      speakResponse("네 개발자님, 말씀하십시오.");
    }
  }

  function endSession(isExplicitClose = false, isFromVoice = false) {
    isSessionActive = false;
    clearTimeout(sessionInactivityTimer);
    updateSessionUI();
    updateMiniHUDUI();

    if (isFromVoice) {
      appendMessage('jarvis', '대화를 종료합니다.');
      if (miniCaptionBox) {
        miniCaptionBox.style.display = 'block';
        miniCaptionSpeaker.textContent = 'J.A.R.V.I.S.:';
        miniCaptionText.textContent = '대화를 종료합니다.';
      }
      speakResponse('대화를 종료합니다.');
    } else {
      statusText.textContent = isWakeWordEnabled 
        ? "⚡ 상시 호출 대기 중 ('하이 자비스' / '자비스')" 
        : (isDashboardOpen ? 'SYSTEM ONLINE: DASHBOARD READY' : 'SYSTEM ONLINE: STANDBY');
      coreStateText.textContent = 'JARVIS';
    }

    // 개발자님이 직접 "쉬어", "자비스 종료", "관리창 닫아" 등으로 종료를 명시적으로 요청했거나
    // 대시보드가 열려있지 않은 일반 대화 상태에서 무응답 대기 복귀 시 즉시 슬림 대기바(STANDBY)로 복귀
    if (isExplicitClose || !isDashboardOpen) {
      setTimeout(() => {
        isDashboardOpen = false;
        setUIMode('STANDBY');
      }, isExplicitClose ? 500 : 200);
    }
  }

  function resetSessionInactivityTimer(seconds = 8) {
    clearTimeout(sessionInactivityTimer);
    // 무응답 시: 사용자가 대시보드(FULL_DASHBOARD)를 열어둔 상태가 아니라면 8초 후 자동으로 슬림 대기바(STANDBY)로 복귀!
    sessionInactivityTimer = setTimeout(() => {
      if (!isDashboardOpen) {
        endSession(false, false);
      } else {
        isSessionActive = false;
        updateSessionUI();
      }
    }, seconds * 1000);
  }

  function updateSessionUI() {
    if (btnSessionBadge) {
      btnSessionBadge.style.display = isSessionActive ? 'inline-flex' : 'none';
    }
    if (isSessionActive) {
      statusText.textContent = "🟢 연속 대화 세션 진행 중 (종료: '바이 자비스')";
      coreStateText.textContent = 'ACTIVE';
      btnMic.classList.add('active');
      reactorCore.classList.add('listening');
    } else {
      statusText.textContent = isWakeWordEnabled 
        ? "⚡ 상시 호출 대기 중 ('하이 자비스' / '자비스')" 
        : 'SYSTEM ONLINE: STANDBY';
      coreStateText.textContent = 'JARVIS';
      btnMic.classList.remove('active');
      reactorCore.classList.remove('listening');
    }
    updateMiniHUDUI();
  }

  if (btnSessionBadge) {
    btnSessionBadge.addEventListener('click', () => {
      endSession(false);
    });
  }

  // Mini HUD & Dashboard Button Listeners
  if (btnMiniOpenDashboard) {
    btnMiniOpenDashboard.addEventListener('click', () => {
      setUIMode('FULL_DASHBOARD');
    });
  }

  let miniClickTimer = null;
  if (miniReactorWrap) {
    miniReactorWrap.addEventListener('click', () => {
      if (miniClickTimer) {
        clearTimeout(miniClickTimer);
        miniClickTimer = null;
        // 더블클릭 발생 ➔ 관리창 열기
        setUIMode('FULL_DASHBOARD');
        return;
      }
      miniClickTimer = setTimeout(() => {
        miniClickTimer = null;
        // 싱글클릭 발생 ➔ 마이크 토글!
        if (btnMic) btnMic.click();
      }, 250);
    });
  }

  const miniStatusPill = document.getElementById('mini-status-pill');
  if (miniStatusPill) {
    miniStatusPill.addEventListener('click', () => {
      if (btnMic) btnMic.click();
    });
  }

  if (btnMiniEndSession) {
    btnMiniEndSession.addEventListener('click', () => {
      endSession(true);
    });
  }

  // Smooth Window Dragging across all UI modes
  let hasDraggedPill = false;

  function enableWindowDrag(element, onDragEndCallback = null) {
    if (!element || !window.jarvisAPI || !window.jarvisAPI.moveWindowBy) return;

    element.addEventListener('mousedown', (e) => {
      if (e.target.closest('button, input, textarea, a, .win-btn, .mini-action-btn, #mini-reactor-trigger')) return;
      if (e.button !== 0) return;

      let isDragging = true;
      let startScreenX = e.screenX;
      let startScreenY = e.screenY;
      let movedTotal = 0;

      const onMouseMove = (moveEvent) => {
        if (!isDragging) return;
        const dx = moveEvent.screenX - startScreenX;
        const dy = moveEvent.screenY - startScreenY;
        if (dx !== 0 || dy !== 0) {
          movedTotal += Math.abs(dx) + Math.abs(dy);
          startScreenX = moveEvent.screenX;
          startScreenY = moveEvent.screenY;
          window.jarvisAPI.moveWindowBy(dx, dy);
        }
      };

      const onMouseUp = () => {
        isDragging = false;
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        if (movedTotal > 5 && onDragEndCallback) {
          onDragEndCallback();
        }
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  }

  const miniHudContainer = document.querySelector('.mini-hud-container');
  const hudTitlebar = document.querySelector('.hud-titlebar');

  enableWindowDrag(standbyPill, () => {
    hasDraggedPill = true;
    setTimeout(() => { hasDraggedPill = false; }, 250);
  });
  enableWindowDrag(miniHudContainer);
  enableWindowDrag(hudTitlebar);

  if (standbyPill) {
    standbyPill.addEventListener('click', () => {
      if (hasDraggedPill) return;
      const targetMode = isDashboardOpen ? 'FULL_DASHBOARD' : 'MINI_CIRCLE';
      setUIMode(targetMode);
      startSession(null);
    });
  }

  if (btnSwitchToCircle) {
    btnSwitchToCircle.addEventListener('click', () => {
      isDashboardOpen = false;
      setUIMode('MINI_CIRCLE');
    });
  }

  if (btnSwitchToCircleWin) {
    btnSwitchToCircleWin.addEventListener('click', () => {
      isDashboardOpen = false;
      setUIMode('MINI_CIRCLE');
    });
  }

  if (btnToggleAutoLaunch) {
    btnToggleAutoLaunch.addEventListener('click', async () => {
      try {
        const isCurrentOn = btnToggleAutoLaunch.classList.contains('active');
        const res = await fetch('/api/autolaunch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enable: !isCurrentOn })
        });
        const data = await res.json();
        btnToggleAutoLaunch.classList.toggle('active', data.enabled);
        btnToggleAutoLaunch.textContent = data.enabled ? '🖥️ 부팅 자동실행: ON' : '🖥️ 부팅 자동실행: OFF';
      } catch (e) {
        console.error('Auto-launch toggle error:', e);
      }
    });
  }

  if (btnOpenMobile) {
    btnOpenMobile.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/mobile-info');
        const data = await res.json();
        if (mobileIpAddress) {
          mobileIpAddress.textContent = data.mobileUrl || `http://${window.location.hostname}:3000`;
        }
      } catch (e) {
        if (mobileIpAddress) {
          mobileIpAddress.textContent = `http://${window.location.hostname}:3000`;
        }
      }
      if (mobileModal) mobileModal.style.display = 'flex';
    });
  }
  if (btnCloseMobile) {
    btnCloseMobile.addEventListener('click', () => {
      if (mobileModal) mobileModal.style.display = 'none';
    });
  }

  if (btnOpenDirectives) {
    btnOpenDirectives.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/directives');
        const data = await res.json();
        if (directivesListContainer) {
          directivesListContainer.innerHTML = '';
          const rules = data.custom_rules || [];
          if (rules.length === 0) {
            directivesListContainer.innerHTML = '<div style="color:#aaa; font-size:12px; padding:10px;">등록된 특이 자가 학습 규칙이 없습니다. "기사 헤드라인 읽지 마", "앞으로 ~해줘" 처럼 마이크로 말씀하시면 실시간으로 학습됩니다.</div>';
          } else {
            rules.forEach((rule, idx) => {
              const item = document.createElement('div');
              item.style.background = 'rgba(0, 240, 255, 0.08)';
              item.style.border = '1px solid rgba(0, 240, 255, 0.25)';
              item.style.borderRadius = '5px';
              item.style.padding = '8px 12px';
              item.style.fontSize = '12px';
              item.style.color = '#cbeeff';
              item.innerHTML = `<strong>${idx + 1}.</strong> ${rule}`;
              directivesListContainer.appendChild(item);
            });
          }
        }
      } catch (e) {
        console.error('Directives fetch error:', e);
      }
      if (directivesModal) directivesModal.style.display = 'flex';
    });
  }
  if (btnCloseDirectives) {
    btnCloseDirectives.addEventListener('click', () => {
      if (directivesModal) directivesModal.style.display = 'none';
    });
  }

  function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('Speech Recognition not supported in this runtime.');
      return;
    }

    const isMobile = !window.jarvisAPI && (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth <= 768);

    recognition = new SpeechRecognition();
    recognition.lang = 'ko-KR';
    recognition.interimResults = true; // 실시간 중간 인식
    recognition.maxAlternatives = 1;
    recognition.continuous = !isMobile; // 모바일에서는 단일 발화 모드로 안드로이드 크롬 마이크 안정성 보장

    recognition.onstart = () => {
      if (isManualListening) {
        isListening = true;
        btnMic.classList.add('active');
        reactorCore.classList.add('listening');
        statusText.textContent = "🎙️ 말씀해 주십시오 (경청 중)...";
        coreStateText.textContent = 'REC';
      } else if (isSessionActive) {
        isListening = true;
        btnMic.classList.add('active');
        reactorCore.classList.add('listening');
        statusText.textContent = "🟢 연속 대화 세션 진행 중 (종료: '바이 자비스')";
        coreStateText.textContent = 'ACTIVE';
      } else if (!isWakeWordEnabled) {
        isListening = true;
        btnMic.classList.add('active');
        reactorCore.classList.add('listening');
        statusText.textContent = 'LISTENING TO VOICE (말씀해 주십시오)...';
        coreStateText.textContent = 'REC';
      } else {
        isListening = false;
        btnMic.classList.remove('active');
        reactorCore.classList.remove('listening');
        statusText.textContent = "⚡ 상시 호출 대기 중 ('하이 자비스' / '자비스')";
        coreStateText.textContent = 'JARVIS';
      }
    };

  // ⚡ [Barge-in / 음성 즉시 끼어들기] 자비스가 말하는 도중 사용자가 말을 시작하면 즉각 발화 중단
  function interruptSpeaking() {
    if (isSpeaking || (window.speechSynthesis && window.speechSynthesis.speaking) || currentTTSAudio) {
      stopAllSpeech();
      isSpeaking = false;
      reactorCore.classList.remove('speaking');
      updateMiniHUDUI();
      if (isSessionActive) {
        reactorCore.classList.add('listening');
        btnMic.classList.add('active');
        statusText.textContent = "🟢 경청 중 (말씀하십시오)";
        coreStateText.textContent = 'REC';
      }
      console.log('[JARVIS BARGE-IN] Interrupted speech playback.');
    }
  }

  recognition.onresult = (event) => {
    // If speech-bridge is connected on desktop, bridge handles audio STT exclusively to avoid double submissions
    if (isBridgeConnected) return;

    let finalTranscript = '';
    let interimTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }

    const spoken = (finalTranscript || interimTranscript).trim();
    if (!spoken) return;

    // ⚡ [스마트 인터럽트 / 스피커 에코 방지]
    // 자비스가 말하던 도중에는 아무 소리에나 끊기지 않고, 오직 '자비스', '그만', '스톱', '멈춰', '잠깐'을 불렀을 때만 즉각 발화 중단!
    if (isSpeaking) {
      const interruptKeywordRegex = /(?:자비스|자베스|지배스|잡이|jarvis|스톱|그만|멈춰|잠깐|조용|타임|대기)/i;
      if (interruptKeywordRegex.test(spoken)) {
        console.log(`[JARVIS INTERRUPT] Keyword matched: "${spoken}". Interrupted speaking.`);
        interruptSpeaking();
      } else {
        // 자비스가 스피커로 출력 중인 자기 목소리가 마이크로 재유입된 것이므로 발화를 끊지 않고 무시
        return;
      }
    }

      // 1. 대화 세션 종료 명령 감지 ("바이 자비스", "자비스 바이", "바이", "쉬어", "자비스 쉬어", "대기 모드", "대기바로", "스탠바이", "그만", "들어가" 등)
      const endSessionRegex = /(?:바이|잘\s*가|굿바이|안녕히|쉬어|들어가|그만|대기|스탠바이|잘\s*자)\s*(?:자비스|자베스|지배스|잡이|jarvis)|(?:자비스|자베스|지배스|잡이|jarvis)\s*(?:바이|잘\s*가|굿바이|종료|쉬어|들어가|그만|꺼져|대기|스탠바이|잘\s*자)|^(?:대화\s*종료|바이|바이\s*바이|자비스\s*끝|그만\s*하자|쉬어|들어가|수고했어|퇴근해|그만|대기|스탠바이|대기\s*모드|대기\s*상태|대기바로|대기바로\s*가)$/i;
      if (endSessionRegex.test(spoken)) {
        if (finalTranscript || spoken.length <= 16) {
          endSession(true, true);
          return;
        }
      }

      // 1.5 관리창 / 관리탭 열기/닫기 명령 감지
      if (/(?:관리\s*창|관리\s*탭|관리\s*청|대시\s*보드|메인\s*창|메인\s*화면|컨트롤\s*패널).*((창.*)?(?:열어|켜|보여|띄워|실행|해줘))|^(?:관리\s*창|관리\s*탭|관리\s*청|대시\s*보드)$/i.test(spoken)) {
        setUIMode('FULL_DASHBOARD');
        speakResponse("개발자님, 관리 대시보드를 즉시 호출했습니다.");
        return;
      }
      if (/(?:관리\s*창|관리\s*탭|관리\s*청|대시\s*보드|메인\s*창|메인\s*화면).*((창.*)?(?:닫아|꺼|숨겨|내려|원형|축소))/i.test(spoken)) {
        isDashboardOpen = false;
        setUIMode('MINI_CIRCLE');
        speakResponse("원형 모드로 전환합니다.");
        return;
      }

      // 2. 수동 마이크 클릭 모드(isManualListening) 또는 연속 대화 세션 활성화 상태 (isSessionActive === true)
      // ➔ 매번 '자비스'를 다시 부를 필요 없이 곧바로 모든 주문을 수신하고 실행!
      if (isManualListening || isSessionActive) {
        if (isSessionActive) resetSessionInactivityTimer();
        if (miniCaptionBox) {
          miniCaptionBox.style.display = 'block';
          miniCaptionSpeaker.textContent = 'USER:';
          miniCaptionText.textContent = interimTranscript || finalTranscript;
        }
        if (interimTranscript) {
          textInput.value = interimTranscript;
        }
        if (finalTranscript) {
          textInput.value = finalTranscript;
          // 문장 앞머리에 혹시 붙어 있을 수 있는 '자비스' 및 변형 제거 후 쿼리 전달
          const cleanQuery = finalTranscript.replace(/^(?:하이|헤이|안녕|야|오케이|마이)?\s*(?:자비스|자베스|지배스|잡이|잡스|자비|차비스|jarvis)(?:야|아)?\s*/i, '').trim() || finalTranscript;
          if (isManualListening) {
            isManualListening = false;
            try { recognition.stop(); } catch (e) {}
            stopListening();
          }
          handleUserSubmit(cleanQuery);
        }
        return;
      }

      // 3. 대화 세션 비활성화 상태 ➔ 호출어("헤이 자비스", "하이 자비스", "마이자베스", "자비스")로 세션 시작!
      if (isWakeWordEnabled) {
        const wakeRegex = /(?:하이|헤이|안녕|야|오케이|마이|hey|hi|hello)?\s*(?:자비스|자베스|지배스|잡이|잡스|자비|차비스|jarvis)(?:야|아)?/i;
        const match = spoken.match(wakeRegex);

        if (match) {
          const matchIdx = spoken.toLowerCase().indexOf(match[0].toLowerCase());
          const followingText = spoken.slice(matchIdx + match[0].length).replace(/^[,.\s]+/, '').trim();

          const targetMode = isDashboardOpen ? 'FULL_DASHBOARD' : 'MINI_CIRCLE';
          setUIMode(targetMode);

          // A. 호출어 + 명령어를 한 번에 말한 경우 (예: "헤이 자비스, 계산기 열어줘")
          if (followingText.length >= 2) {
            startSession(followingText);
          } 
          // B. 호출어만 부른 경우 (예: "헤이 자비스", "자비스야")
          else if (finalTranscript || spoken.length <= match[0].length + 2) {
            startSession(null);
          }
          return;
        }

        // 세션 비활성 + 호출어 없음 ➔ 일반 주변 대화로 간주하고 무시
        return;
      }

      // 4. 수동 마이크 버튼 클릭 모드 (상시 호출 OFF 시)
      if (interimTranscript) {
        textInput.value = interimTranscript;
      }
      if (finalTranscript) {
        textInput.value = finalTranscript;
        handleUserSubmit(finalTranscript);
        stopListening();
      }
    };

    recognition.onerror = (event) => {
      console.warn('[SPEECH STATUS]', event.error);
      if (event.error === 'not-allowed') {
        appendMessage('J.A.R.V.I.S.', '⚠️ 마이크 권한이 차단되었습니다. 브라우저 주소창 왼쪽의 마이크 권한을 허용해 주십시오.', 'jarvis-msg');
        statusText.textContent = 'MIC PERMISSION BLOCKED';
      } else if (event.error === 'network') {
        console.warn('Google Speech Network restricted. Seamlessly switching to Gemini Native Audio Pipeline.');
        useGeminiAudio = true;
        if (isManualListening) {
          startGeminiAudioRecording();
        }
      } else if (event.error === 'audio-capture') {
        statusText.textContent = 'MIC HARDWARE BUSY (다른 프로그램 사용 중)';
      }
    };

    recognition.onend = () => {
      const isMobile = !window.jarvisAPI && (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth <= 768);
      // PC 크롬 환경이고 상시 호출 모드이거나 연속 대화 세션 중이라면 백그라운드 자동 루프 유지
      if (!isMobile && !useGeminiAudio && (isWakeWordEnabled || isSessionActive) && !isSpeaking) {
        setTimeout(() => {
          try {
            recognition.start();
          } catch (e) {}
        }, 300);
      } else if (!useGeminiAudio) {
        stopListening();
      }
    };
  }

  // --- GEMINI MULTIMODAL NATIVE AUDIO PIPELINE (Direct Mic & Nuance/Tone AI) ---
  let useGeminiAudio = Boolean(window.jarvisAPI);
  let geminiMediaRecorder = null;
  let geminiAudioChunks = [];
  let isGeminiRecording = false;
  let isGeminiStarting = false;
  let isHardwareConfigured = false;
  let vadInterval = null;
  let silenceStartTimestamp = null;
  let hasDetectedSpeech = false;
  let micTestInProgress = false;
  let discardNextRecording = false;
  let audioPipelineNeedsConfig = false;

  async function ensureMicStreamForAudio() {
    if (micStream && micStream.active && analyserNode && isHardwareConfigured) {
      return micStream;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true
      });

      if (!stream || !stream.active) {
        statusText.textContent = 'MIC ACCESS REQUIRED';
        return null;
      }

      micStream = stream;

      if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      if (analyserNode) {
        try { analyserNode.disconnect(); } catch (e) {}
      }
      const source = audioContext.createMediaStreamSource(micStream);
      analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = 256;
      analyserNode.smoothingTimeConstant = 0.2;
      micDataArray = new Uint8Array(analyserNode.frequencyBinCount);
      source.connect(analyserNode);

      isHardwareConfigured = true;
      const activeTrack = stream.getAudioTracks()[0];
      if (microphoneTestStatus && activeTrack) microphoneTestStatus.textContent = `연결됨: ${activeTrack.label || '기본 마이크'}`;
      refreshMicrophoneDevices();
      return micStream;
    } catch (err) {
      console.warn('Cannot acquire audio stream:', err);
      const reason = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
        ? 'Windows 설정 → 개인정보 및 보안 → 마이크에서 데스크톱 앱 접근을 허용해 주세요.'
        : err.name === 'NotFoundError' || err.name === 'OverconstrainedError'
          ? '선택한 마이크를 찾을 수 없습니다. 장치를 다시 연결하거나 기본 마이크를 선택해 주세요.'
          : `마이크를 열 수 없습니다: ${err.message}`;
      statusText.textContent = 'MIC ACCESS FAILED';
      if (microphoneTestStatus) microphoneTestStatus.textContent = reason;
      return null;
    }
  }

  async function refreshMicrophoneDevices() {
    if (!selectMicrophone || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    try {
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'audioinput');
      selectMicrophone.replaceChildren(new Option('Windows 기본 마이크', ''));
      devices.forEach((device, index) => {
        if (device.deviceId && device.deviceId !== 'default' && device.deviceId !== 'communications') {
          selectMicrophone.add(new Option(device.label || `마이크 ${index + 1}`, device.deviceId));
        }
      });
      if (selectedMicId && !devices.some(device => device.deviceId === selectedMicId)) {
        selectMicrophone.add(new Option('저장된 마이크 (연결되지 않음)', selectedMicId));
        if (microphoneTestStatus) microphoneTestStatus.textContent = '저장된 마이크가 연결되지 않았습니다. 다른 장치를 선택해 주세요.';
      }
      selectMicrophone.value = selectedMicId;
      if (!devices.length && microphoneTestStatus) microphoneTestStatus.textContent = '입력 마이크가 없습니다. Windows 입력 장치 설정을 확인해 주세요.';
    } catch (err) {
      if (microphoneTestStatus) microphoneTestStatus.textContent = `마이크 목록을 읽지 못했습니다: ${err.message}`;
    }
  }

  function releaseMicrophoneStream() {
    if (geminiMediaRecorder && geminiMediaRecorder.state !== 'inactive') {
      discardNextRecording = true;
      stopGeminiAudioRecording();
    }
    if (micStream) micStream.getTracks().forEach(track => track.stop());
    micStream = null;
    isManualListening = false;
    isHardwareConfigured = false;
    if (analyserNode) analyserNode.disconnect();
    analyserNode = null;
    micDataArray = null;
  }

  if (selectMicrophone) {
    selectMicrophone.addEventListener('change', async () => {
      micTestInProgress = true;
      selectedMicId = selectMicrophone.value;
      localStorage.setItem('jarvis_selected_mic_id', selectedMicId);
      releaseMicrophoneStream();
      const stream = await ensureMicStreamForAudio();
      micTestInProgress = false;
      if (stream && isWakeWordEnabled && !isSpeaking) startGeminiAudioRecording();
    });
  }
  if (btnRefreshMicrophones) btnRefreshMicrophones.addEventListener('click', refreshMicrophoneDevices);
  if (navigator.mediaDevices) navigator.mediaDevices.addEventListener('devicechange', refreshMicrophoneDevices);
  refreshMicrophoneDevices();

  if (btnTestMicrophone) {
    btnTestMicrophone.addEventListener('click', async () => {
      micTestInProgress = true;
      btnTestMicrophone.disabled = true;
      if (selectMicrophone) selectMicrophone.disabled = true;
      releaseMicrophoneStream();
      const stream = await ensureMicStreamForAudio();
      if (stream && analyserNode) {
        let peak = 0;
        const started = performance.now();
        while (performance.now() - started < 2500) {
          analyserNode.getByteTimeDomainData(micDataArray);
          let sum = 0;
          for (const sample of micDataArray) sum += ((sample - 128) / 128) ** 2;
          peak = Math.max(peak, Math.sqrt(sum / micDataArray.length));
          if (microphoneTestStatus) microphoneTestStatus.textContent = `말씀해 보세요 · 입력 레벨 ${Math.min(100, Math.round(peak * 5000))}%`;
          await new Promise(resolve => setTimeout(resolve, 80));
        }
        if (microphoneTestStatus) microphoneTestStatus.textContent = peak > 0.002
          ? `입력 확인됨 · 최대 레벨 ${Math.min(100, Math.round(peak * 5000))}%`
          : '입력 소리가 감지되지 않았습니다. Windows 입력 음량과 선택한 마이크를 확인해 주세요.';
      }
      micTestInProgress = false;
      btnTestMicrophone.disabled = false;
      if (selectMicrophone) selectMicrophone.disabled = false;
      if (stream && isWakeWordEnabled && !isSpeaking) startGeminiAudioRecording();
    });
  }

  async function startGeminiAudioRecording() {
    if (isSpeaking || micTestInProgress || audioPipelineNeedsConfig) return;
    // 백그라운드 Speech Bridge가 연결되어 활성화된 상태이고 수동 PTT가 아니면 중복 녹음 방지 (API 503 방지)
    if (isBridgeConnected && !isManualListening) {
      isGeminiStarting = false;
      return;
    }
    if (isGeminiRecording || isGeminiStarting) return;
    isGeminiStarting = true;

    try {
      const stream = await ensureMicStreamForAudio();
      if (!stream || isSpeaking) {
        isGeminiStarting = false;
        return;
      }

      const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
      let selectedMime = '';
      for (const m of mimeTypes) {
        if (MediaRecorder.isTypeSupported(m)) {
          selectedMime = m;
          break;
        }
      }

      if (geminiMediaRecorder && geminiMediaRecorder.state !== 'inactive') {
        try { geminiMediaRecorder.stop(); } catch (e) {}
      }

      geminiMediaRecorder = new MediaRecorder(stream, selectedMime ? { mimeType: selectedMime } : undefined);
      geminiAudioChunks = [];

      geminiMediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          geminiAudioChunks.push(e.data);
        }
      };

      geminiMediaRecorder.onstop = async () => {
        isGeminiRecording = false;
        isListening = false;
        btnMic.classList.remove('active');
        reactorCore.classList.remove('listening');
        if (vadInterval) {
          clearInterval(vadInterval);
          vadInterval = null;
        }

        if (discardNextRecording) {
          discardNextRecording = false;
          geminiAudioChunks = [];
          return;
        }

        const wasManual = isManualListening;
        isManualListening = false;

        const audioBlob = new Blob(geminiAudioChunks, { type: selectedMime || 'audio/webm' });
        console.log(`[AUDIO CAPTURED] Size: ${audioBlob.size} bytes, manual: ${wasManual}, speechDetected: ${hasDetectedSpeech}`);

        // 수동 입력(버튼/스페이스바)은 1500바이트 이상이면 무조건 전송, 자동 VAD는 발화 감지 시 3000바이트 이상 전송
        const minThreshold = wasManual ? 1500 : 3000;
        if ((!wasManual && !hasDetectedSpeech) || audioBlob.size < minThreshold) {
          statusText.textContent = isWakeWordEnabled 
            ? "⚡ 상시 호출 대기 중 ('하이 자비스' / '자비스')" 
            : 'SYSTEM ONLINE: STANDBY';
          coreStateText.textContent = 'JARVIS';
          if (useGeminiAudio && (isWakeWordEnabled || isSessionActive) && !isSpeaking) {
            setTimeout(() => {
              if (useGeminiAudio && !isSpeaking) startGeminiAudioRecording();
            }, 500);
          }
          return;
        }

        await processAudioViaGeminiPipeline(audioBlob);
      };

      geminiMediaRecorder.start(50);
      isGeminiRecording = true;
      isGeminiStarting = false;
      isListening = true;
      btnMic.classList.add('active');
      reactorCore.classList.add('listening');
      statusText.textContent = isManualListening ? "🎙️ 듣고 있습니다 (말씀하세요)..." : "⚡ 상시 대기 중 ('자비스' / 말씀하십시오)...";
      coreStateText.textContent = 'REC';

      // 오디오 인터페이스(RME Babyface ADAT 3+4) & 마이크 환경 전용 고정밀 노이즈 필터링 VAD
      hasDetectedSpeech = false;
      silenceStartTimestamp = null;
      const startTime = Date.now();
      let noiseFloor = 0.0004;
      let sampleCount = 0;
      let consecutiveSpeechFrames = 0;

      if (vadInterval) clearInterval(vadInterval);
      vadInterval = setInterval(() => {
        if (!isGeminiRecording || !analyserNode || !micDataArray) return;
        analyserNode.getByteTimeDomainData(micDataArray);

        let sum = 0;
        for (let i = 0; i < micDataArray.length; i++) {
          const diff = (micDataArray[i] - 128) / 128;
          sum += diff * diff;
        }
        const rms = Math.sqrt(sum / micDataArray.length);

        sampleCount++;
        // 처음 200ms 동안 환경 노이즈 동적 보정
        if (sampleCount < 6) {
          noiseFloor = Math.max(0.0002, (noiseFloor * 0.7) + (rms * 0.3));
        }

        // 실제 음성 임계치: RME + Reaper 자연스러운 발화(0.0015~0.004)에 맞춰 0.0014 이상이면 감지
        const speechThreshold = Math.max(0.0014, noiseFloor * 1.4);

        if (rms > speechThreshold) {
          consecutiveSpeechFrames++;
          // 2프레임(60ms) 이상 음성 유지 시 즉시 발화 인식 (첫 음절 잘림 방지)
          if (consecutiveSpeechFrames >= 2) {
            if (!hasDetectedSpeech) {
              hasDetectedSpeech = true;
              statusText.textContent = "🎙️ 음성 수신 중 (경청 중)...";
              reactorCore.classList.add('listening');
            }
            silenceStartTimestamp = null;
          }
        } else {
          consecutiveSpeechFrames = Math.max(0, consecutiveSpeechFrames - 1);
          if (hasDetectedSpeech) {
            if (!silenceStartTimestamp) {
              silenceStartTimestamp = Date.now();
            } else if (Date.now() - silenceStartTimestamp > 480) {
              // 단어 사이 자연스러운 쉼(0.48초)을 보장하여 말이 중간에 끊기지 않도록 안정적 전송
              console.log('[VAD] Speech complete (RMS:', rms.toFixed(4), '). Submitting to Gemini.');
              stopGeminiAudioRecording();
            }
          }
        }

        // 발화 중 최대 8초 안전 마감
        if (hasDetectedSpeech && (Date.now() - startTime > 8000)) {
          stopGeminiAudioRecording();
        }

        // 아무 말도 안 하고 3.5초 경과 시 불필요한 침묵 버퍼를 초기화하고 쾌적하게 다음 루프로 갱신
        if (!hasDetectedSpeech && (Date.now() - startTime > 3500)) {
          stopGeminiAudioRecording();
        }
      }, 30);

    } catch (err) {
      console.error('startGeminiAudioRecording error:', err);
      isGeminiRecording = false;
      isGeminiStarting = false;
    }
  }

  function stopGeminiAudioRecording() {
    if (vadInterval) {
      clearInterval(vadInterval);
      vadInterval = null;
    }
    if (geminiMediaRecorder && geminiMediaRecorder.state !== 'inactive') {
      try {
        geminiMediaRecorder.stop();
      } catch (e) {}
    }
    isGeminiRecording = false;
  }

  let lastAudioApiSubmissionTime = 0;

  async function processAudioViaGeminiPipeline(audioBlob) {
    const now = Date.now();
    if (now - lastAudioApiSubmissionTime < 1800) {
      console.log('[AUDIO PIPELINE] Throttled by cooldown to protect 15 RPM limit.');
      if (useGeminiAudio && !isSpeaking) {
        setTimeout(() => startGeminiAudioRecording(), 200);
      }
      return;
    }
    lastAudioApiSubmissionTime = now;

    statusText.textContent = '⚡ 자비스가 분석 중입니다...';
    coreStateText.textContent = 'THINK';

    console.log(`[AUDIO SUBMITTING] Blob size: ${audioBlob.size} bytes, type: ${audioBlob.type}`);
    const reader = new FileReader();
    reader.readAsDataURL(audioBlob);
    reader.onloadend = async () => {
      const base64data = reader.result;
      try {
        const res = await fetch('/api/chat-audio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audio: base64data,
            mimeType: audioBlob.type || 'audio/webm'
          })
        });
        const data = await res.json();
        console.log('[AUDIO PIPELINE RESPONSE]:', JSON.stringify(data));

        if (data.reason === 'api_key_missing') {
          audioPipelineNeedsConfig = true;
          statusText.textContent = 'Gemini API 키를 설정해 주세요';
          coreStateText.textContent = 'SETUP';
          appendMessage('J.A.R.V.I.S.', '음성 인식에 Gemini API 키가 필요합니다. 관리창의 AI 두뇌 설정에서 키를 저장해 주세요.', 'jarvis-msg');
          return;
        }
        if (data.reason === 'speech_service_unavailable') {
          statusText.textContent = '음성 인식 서비스 연결 실패';
          appendMessage('J.A.R.V.I.S.', data.error, 'jarvis-msg');
          return;
        }
        if (!res.ok) throw new Error(data.error || `음성 처리 오류 (${res.status})`);

        if (data.reason === 'quota_exceeded') {
          if (data.reply && data.reply.trim().length > 0) {
            appendMessage('J.A.R.V.I.S.', `⚠️ ${data.reply}`, 'jarvis-msg');
          }
          statusText.textContent = '분당 요청 한도 보호 중 (10초 후 음성 입력 재개)';
          coreStateText.textContent = 'WAIT';
          if (useGeminiAudio && !isSpeaking) {
            setTimeout(() => startGeminiAudioRecording(), 10000);
          }
          return;
        }

        if (data.success && data.transcript) {
          const toneBadge = data.tone ? ` <span style="font-size:11px; padding:2px 6px; border-radius:4px; background:rgba(0,240,255,0.12); border:1px solid rgba(0,240,255,0.3); color:#00f0ff; margin-left:6px;">${data.tone}</span>` : '';
          appendMessage('USER', `${data.transcript}${toneBadge}`, 'user-msg');

          appendMessage('J.A.R.V.I.S.', data.reply, 'jarvis-msg');
          if (miniCaptionBox) {
            miniCaptionBox.style.display = 'block';
            miniCaptionSpeaker.textContent = 'J.A.R.V.I.S.:';
            miniCaptionText.textContent = data.reply;
          }

          if (data.moodState) {
            updateSyncBar(data.moodState);
          }

          // ⚡ UI 제어 및 창 전환 액션 즉시 실행 ("관리창 열어줘", "원형 모드", "CAD 스튜디오 열어줘")
          if (data.actionType === 'OPEN_DASHBOARD') {
            setUIMode('FULL_DASHBOARD');
          } else if (data.actionType === 'CLOSE_DASHBOARD') {
            isDashboardOpen = false;
            setUIMode('MINI_CIRCLE');
          } else if (data.actionType === 'OPEN_CAD_STUDIO' || (data.action && data.action.type === 'OPEN_CAD_STUDIO')) {
            openCADStudioWindow(data.widget || null);
          } else if (data.actionType === 'STOP_MEDIA') {
            stopActiveMediaPlayer();
          }

          // OS 시스템 액션 실행 (앱 실행, 브라우저 등)
          if (data.action && window.jarvisAPI && window.jarvisAPI.executeOSAction) {
            window.jarvisAPI.executeOSAction(data.action);
          }

          if (data.widget) {
            renderDynamicWidget(data.widget);
          }

          console.log('[AUDIO PIPELINE SPEAKING]:', data.reply);
          speakResponse(data.reply);
        } else {
          statusText.textContent = isWakeWordEnabled 
            ? "⚡ 상시 호출 대기 중 ('하이 자비스' / '자비스')" 
            : 'SYSTEM ONLINE: STANDBY';
          coreStateText.textContent = 'JARVIS';
          if (!isBridgeConnected && useGeminiAudio && (isWakeWordEnabled || isSessionActive) && !isSpeaking) {
            setTimeout(() => {
              if (!isBridgeConnected && useGeminiAudio && !isSpeaking) startGeminiAudioRecording();
            }, 500);
          }
        }
      } catch (err) {
        console.error('Audio pipeline failed:', err);
        statusText.textContent = 'AUDIO PROCESSING FAILED';
        coreStateText.textContent = 'JARVIS';
        if (!isBridgeConnected && useGeminiAudio && (isWakeWordEnabled || isSessionActive) && !isSpeaking) {
          setTimeout(() => {
            if (!isBridgeConnected && useGeminiAudio && !isSpeaking) startGeminiAudioRecording();
          }, 1000);
        }
      }
    };
  }

  // ==============================================================================
  // INVISIBLE BACKGROUND SPEECH BRIDGE (0ms Ultra-Low Latency, Zero Quota Consumed)
  // ==============================================================================
  let speechEventSource = null;
  let isBridgeConnected = false;

  function initSpeechBridgeStream() {
    if (speechEventSource) {
      try { speechEventSource.close(); } catch (e) {}
    }

    try {
      speechEventSource = new EventSource('/api/speech/stream');

      speechEventSource.onopen = () => {
        console.log('[SPEECH BRIDGE] Stream endpoint connected.');
      };

      speechEventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && data.transcript) {
            isBridgeConnected = true;
            const rawText = data.transcript.trim();
            console.log('[SPEECH BRIDGE RECEIVED]:', rawText);
            handleBridgeSpeech(rawText);
          }
        } catch (err) {
          console.error('Error parsing speech event:', err);
        }
      };

      speechEventSource.onerror = (e) => {
        console.warn('[SPEECH BRIDGE] Stream disconnected, retrying in 3s...');
        isBridgeConnected = false;
        setTimeout(() => {
          if (!isBridgeConnected) initSpeechBridgeStream();
        }, 3000);
      };
    } catch (err) {
      console.error('[SPEECH BRIDGE] Init exception:', err);
    }
  }

  function handleBridgeSpeech(rawText) {
    if (!rawText || rawText.trim().length === 0) return;

    const trimmed = rawText.trim();

    // 만약 자비스가 스피커로 발화 중인 상태라면:
    if (isSpeaking || currentTTSAudio) {
      // 명시적인 중단 명령(그만, 멈춰, 조용, 스톱)일 때만 발화를 끊고,
      // 그 외 일반 문장은 스피커 소리가 마이크로 재유입된 하울링이므로 무시
      if (/그만|멈춰|조용|닥쳐|스톱|stop/i.test(trimmed)) {
        stopAllSpeech();
        isSpeaking = false;
      }
      return;
    }

    // 0. 대화 세션 종료 명령 감지 ("바이 자비스", "자비스 바이", "바이", "쉬어", "자비스 쉬어", "대기 모드", "대기바로", "스탠바이", "그만", "들어가" 등)
    const endSessionRegex = /(?:바이|잘\s*가|굿바이|안녕히|쉬어|들어가|그만|대기|스탠바이|잘\s*자)\s*(?:자비스|자베스|지배스|잡이|jarvis)|(?:자비스|자베스|지배스|잡이|jarvis)\s*(?:바이|잘\s*가|굿바이|종료|쉬어|들어가|그만|꺼져|대기|스탠바이|잘\s*자)|^(?:대화\s*종료|바이|바이\s*바이|자비스\s*끝|그만\s*하자|쉬어|들어가|수고했어|퇴근해|그만|대기|스탠바이|대기\s*모드|대기\s*상태|대기바로|대기바로\s*가)$/i;
    if (endSessionRegex.test(trimmed)) {
      endSession(true, true);
      return;
    }

    // 1. 명확한 시스템 명령어 패턴 (호출어 없이 바로 말해도 100% 즉각 실행)
    const isDirectCommand = /(?:cad|캐드|3d\s*설계|관리\s*[창청]|권리\s*[창청]|대[시쉬]\s*보드|원형\s*모드|노래|음악|유튜브|유투브|볼륨|소리|날씨)/i.test(trimmed) &&
                            /(?:열|켜|보여|실행|띄워|닫|꺼|숨겨|틀|재생|정지|멈춰|줄여|올려|어때|모드|봐|주라)/i.test(trimmed);

    // 2. 호출어 감지 ("자비스", "헤이 자비스", "하이 자비스", "Jarvis", "자비스야", "서비스", "자비슨", "야 자비스")
    const isWakeCall = /(?:어|야|헤이|하이|오케이)?\s*(?:자비스|자비슨|서비스|잡스|자베스|지배스|jarvis)(?:야|아|님)?/i.test(trimmed);

    if (isDirectCommand || isWakeCall || isSessionActive || !isWakeWordEnabled) {
      if (currentUIMode === 'STANDBY') {
        setUIMode('MINI_CIRCLE');
      }
      // 호출어 접두사 및 접미사 스마트 분리
      let cleanQuery = trimmed
        .replace(/^(?:어|야|헤이|하이|오케이|응|아니|아)?\s*(?:자비스|자비슨|서비스|잡스|자베스|지배스|jarvis)(?:야|아|님)?[,\s]*/i, '')
        .replace(/(?:자비스|자비슨|서비스|잡스|자베스|지배스|jarvis)(?:야|아|님)?$/i, '')
        .trim();

      // "자비스", "자비스야", "서비스" 등 단독 호출 시 대답하고 연속 대화 세션 활성화
      if (!cleanQuery || cleanQuery.length === 0 || /^(?:자비스|자비슨|서비스|잡스|자베스|지배스|jarvis)(?:야|아|님)?$/i.test(trimmed.trim())) {
        startSession(null);
        return;
      }

      // 연속 대화 세션 유지: 한 번 부르면 명시적으로 종료하기 전까지 계속 대화 상태 유지!
      isSessionActive = true;
      resetSessionInactivityTimer();
      updateSessionUI();
      statusText.textContent = '⚡ 명령 처리 중...';
      coreStateText.textContent = 'THINK';
      handleUserSubmit(cleanQuery);
    }
  }

  async function startListening() {
    if (isSpeaking || currentTTSAudio) stopAllSpeech();

    // Desktop/Electron or Gemini Audio mode: directly use Gemini Audio
    if (useGeminiAudio || window.jarvisAPI) {
      await startGeminiAudioRecording();
      return;
    }

    // Check protocol for Web Speech API
    if (window.location.protocol === 'file:') {
      appendMessage('J.A.R.V.I.S.', '⚠️ 현재 file:// 경로로 열려 있습니다. 크롬 보안 정책으로 인해 마이크 음성 인식은 http://localhost:3000 에서만 작동합니다. 브라우저 주소창에 http://localhost:3000 을 입력하시거나 [run_jarvis.bat]을 실행해 주십시오.', 'jarvis-msg');
      statusText.textContent = 'PROTOCOL RESTRICTION: USE LOCALHOST:3000';
      return;
    }

    // 스마트폰 햅틱 진동 피드백
    if (navigator.vibrate) {
      try { navigator.vibrate(35); } catch(e) {}
    }

    // Android Native High-Accuracy SpeechRecognizer Engine
    if (window.jarvisNative && window.jarvisNative.isAvailable) {
      isListening = true;
      btnMic.classList.add('active');
      reactorCore.classList.add('listening');
      statusText.textContent = "🎙️ 듣고 있습니다 (말씀하세요)...";
      window.jarvisNative.startListening();
      return;
    }

    if (recognition) {
      try {
        recognition.abort();
      } catch (e) {}

      setTimeout(() => {
        try {
          recognition.start();
        } catch (err) {
          console.warn('Recognition start error, falling back to Gemini audio:', err);
          useGeminiAudio = true;
          startGeminiAudioRecording();
        }
      }, 50);
    } else {
      useGeminiAudio = true;
      startGeminiAudioRecording();
    }
  }

  function stopListening() {
    if (window.jarvisNative && window.jarvisNative.isAvailable) {
      window.jarvisNative.stopListening();
    }
    if (isGeminiRecording) {
      stopGeminiAudioRecording();
    }
    isListening = false;
    btnMic.classList.remove('active');
    reactorCore.classList.remove('listening');
    if (!isSpeaking) {
      if (isSessionActive) {
        statusText.textContent = "🟢 연속 대화 세션 진행 중 (종료: '바이 자비스')";
        coreStateText.textContent = 'ACTIVE';
      } else {
        statusText.textContent = isWakeWordEnabled 
          ? "⚡ 상시 호출 대기 중 ('하이 자비스' / '자비스')" 
          : 'SYSTEM ONLINE: STANDBY';
        coreStateText.textContent = 'JARVIS';
      }
    }
  }

  btnMic.addEventListener('click', () => {
    if (useGeminiAudio || window.jarvisAPI) {
      if (isGeminiRecording) {
        stopGeminiAudioRecording();
      } else {
        isManualListening = true;
        startGeminiAudioRecording();
      }
      return;
    }

    if (isListening || isManualListening) {
      isManualListening = false;
      if (recognition) {
        try { recognition.stop(); } catch (e) {}
      }
      stopListening();
    } else {
      isManualListening = true;
      startListening();
    }
  });

  // Global Spacebar shortcut to activate voice when not typing
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && document.activeElement !== textInput && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      if (btnMic) btnMic.click();
    }
  });

  function updateWakeWordButtonUI() {
    if (!btnToggleWakeWord) return;
    btnToggleWakeWord.classList.toggle('active', isWakeWordEnabled);
    btnToggleWakeWord.style.borderColor = isWakeWordEnabled ? '#ffd700' : 'rgba(255, 215, 0, 0.4)';
    btnToggleWakeWord.style.color = isWakeWordEnabled ? '#ffd700' : 'rgba(255, 215, 0, 0.5)';
    btnToggleWakeWord.textContent = isWakeWordEnabled ? '⚡ 호출 대기: ON' : '⚡ 호출 대기: OFF';
    if (!isSpeaking && !isSessionActive) {
      statusText.textContent = isWakeWordEnabled 
        ? "⚡ 상시 호출 대기 중 ('하이 자비스' / '자비스')" 
        : 'SYSTEM ONLINE: STANDBY';
    }
  }

  if (btnToggleWakeWord) {
    btnToggleWakeWord.addEventListener('click', async () => {
      isWakeWordEnabled = !isWakeWordEnabled;
      updateWakeWordButtonUI();
      if (isWakeWordEnabled) {
        await initMicrophoneStream();
        startListening();
      } else {
        if (recognition) {
          try { recognition.stop(); } catch(e) {}
        }
        stopListening();
      }
    });
  }

  // ==========================================================
  // 4. TTS Output Engine (Microsoft Neural TTS & SpeechSynthesis)
  // ==========================================================
  let currentTTSAudio = null;

  let ttsPlaybackToken = 0;

  function stopAllSpeech() {
    ttsPlaybackToken++;
    if (window.jarvisNative && typeof window.jarvisNative.stopSpeech === 'function') {
      try { window.jarvisNative.stopSpeech(); } catch (e) {}
    }
    if (currentTTSAudio) {
      try {
        currentTTSAudio.pause();
        currentTTSAudio.currentTime = 0;
        currentTTSAudio.src = '';
        currentTTSAudio.onended = null;
        currentTTSAudio.onerror = null;
      } catch (e) {}
      currentTTSAudio = null;
    }
    if ('speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch (e) {}
    }
  }

  async function speakResponse(text) {
    if (!isVoiceOutputEnabled) return;

    const thisToken = ++ttsPlaybackToken;
    stopAllSpeech();
    ttsPlaybackToken = thisToken;

    // Clean text for speech
    let cleanSpeech = text
      .replace(/[*#_~`\[\]<>]/g, '')
      .replace(/🔥|⚡|📌|💻|📝|📊|📈|☕|🤖|🧠|🎙️|🌐|🚀/g, '')
      .replace(/[,.·~…\-]+\s*(개발자님|대표님)/g, ' $1')
      .replace(/,\s*(개발자님|대표님)/g, ' $1')
      .replace(/\.{2,}/g, '.')
      .replace(/,{2,}/g, ',');

    const savedVoiceURI = localStorage.getItem('jarvis_voice_uri') || 'edge:ko-KR-InJoonNeural';
    const savedPitch = parseFloat(localStorage.getItem('jarvis_voice_pitch') || '0.95');
    const savedRate = parseFloat(localStorage.getItem('jarvis_voice_rate') || '1.05');

    const handleSpeechStart = () => {
      isSpeaking = true;
      clearTimeout(sessionInactivityTimer);
      reactorCore.classList.add('speaking');
      statusText.textContent = 'JARVIS VOCALIZING... (말씀하시거나 화면 탭 시 즉시 중단)';
      coreStateText.textContent = 'VOICE';
      updateMiniHUDUI();
      duckMediaVolume(true);

      if (useGeminiAudio) {
        stopGeminiAudioRecording();
      } else if (recognition && (isWakeWordEnabled || isSessionActive)) {
        setTimeout(() => {
          try { recognition.start(); } catch (e) {}
        }, 150);
      }
    };

    const handleSpeechEnd = () => {
      isSpeaking = false;
      reactorCore.classList.remove('speaking');
      updateMiniHUDUI();
      duckMediaVolume(false);

      if (isSessionActive) {
        statusText.textContent = "🟢 연속 대화 중 (말씀하시면 계속 듣습니다 / 종료: '바이 자비스' / 👏 짝-짝)";
        coreStateText.textContent = 'ACTIVE';
        reactorCore.classList.add('listening');
        btnMic.classList.add('active');
        resetSessionInactivityTimer(15);
      } else {
        statusText.textContent = isWakeWordEnabled 
          ? "⚡ 상시 호출 대기 중 ('하이 자비스' / 👏 짝-짝)" 
          : 'SYSTEM ONLINE: STANDBY';
        coreStateText.textContent = 'JARVIS';
        btnMic.classList.remove('active');
        reactorCore.classList.remove('listening');
        if (!isDashboardOpen && currentUIMode === 'MINI_CIRCLE') {
          resetSessionInactivityTimer(15);
        }
      }

      if (isWakeWordEnabled || isSessionActive) {
        if (useGeminiAudio) {
          setTimeout(() => {
            if (useGeminiAudio && !isSpeaking) startGeminiAudioRecording();
          }, 300);
        } else if (recognition) {
          setTimeout(() => {
            try { recognition.start(); } catch (e) {}
          }, 200);
        }
      }
    };

    // Mobile Native High-Quality Android TTS Hook (0ms Offline & In-App Speaker)
    if (window.jarvisNative && window.jarvisNative.isAvailable) {
      handleSpeechStart();
      const spoke = await window.jarvisNative.speak(cleanSpeech);
      if (spoke) {
        const estMs = Math.max(1200, cleanSpeech.length * 135);
        setTimeout(() => {
          if (thisToken === ttsPlaybackToken) handleSpeechEnd();
        }, estMs);
        return;
      }
    }

    // 1. High-Quality Edge Neural Voice Engine (자비스 인준/현수/선희/라이언)
    if (savedVoiceURI.startsWith('edge:') || !savedVoiceURI) {
      const voiceKey = (savedVoiceURI || 'edge:ko-KR-InJoonNeural').replace(/^edge:/, '');
      try {
        handleSpeechStart();
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: cleanSpeech,
            voice: voiceKey,
            pitch: savedPitch,
            rate: savedRate
          })
        });

        if (thisToken !== ttsPlaybackToken) {
          console.log('[TTS SUPERSEDED] In-flight voice aborted due to newer directive.');
          return;
        }

        if (!res.ok) throw new Error(`TTS server HTTP error: ${res.status}`);

        const blob = await res.blob();
        if (thisToken !== ttsPlaybackToken) return;

        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);
        currentTTSAudio = audio;

        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          if (currentTTSAudio === audio) currentTTSAudio = null;
          handleSpeechEnd();
        };

        audio.onerror = (e) => {
          console.warn('[EDGE-TTS] Audio playback error, fallback to SpeechSynthesis:', e);
          URL.revokeObjectURL(audioUrl);
          if (currentTTSAudio === audio) currentTTSAudio = null;
          handleSpeechEnd();
        };

        await audio.play();
        return;
      } catch (err) {
        console.warn('[EDGE-TTS] Synthesis error, falling back to Web Speech:', err);
      }
    }

    if (thisToken !== ttsPlaybackToken) return;

    // 2. Web SpeechSynthesis Fallback
    if (!('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(cleanSpeech);
    utterance.pitch = savedPitch;
    utterance.rate = savedRate;
    utterance.lang = 'ko-KR';

    const voices = window.speechSynthesis.getVoices();
    let selectedVoice = voices.find(v => (v.voiceURI || v.name) === savedVoiceURI);
    if (!selectedVoice) {
      selectedVoice = voices.find(v => v.lang && (v.lang === 'ko-KR' || v.lang === 'ko_KR' || v.lang.toLowerCase().startsWith('ko'))) ||
                      voices.find(v => v.name && (v.name.includes('InJoon') || v.name.includes('Heami') || v.name.includes('SunHi') || v.name.includes('Korean') || v.name.includes('한국어')));
    }

    if (selectedVoice) {
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang || 'ko-KR';
    }

    utterance.onstart = handleSpeechStart;
    utterance.onend = handleSpeechEnd;
    utterance.onerror = (err) => {
      console.warn('Speech synthesis utterance error:', err);
      handleSpeechEnd();
    };

    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }

    setTimeout(() => {
      try {
        if (window.speechSynthesis.paused) window.speechSynthesis.resume();
        window.speechSynthesis.speak(utterance);
      } catch (e) {
        console.warn('Speech synthesis playback error:', e);
      }
    }, 25);
  }

  btnToggleVoice.addEventListener('click', () => {
    isVoiceOutputEnabled = !isVoiceOutputEnabled;
    btnToggleVoice.classList.toggle('active', isVoiceOutputEnabled);
    btnToggleVoice.textContent = isVoiceOutputEnabled ? '🔊 음성 ON' : '🔇 음성 OFF';
    if (!isVoiceOutputEnabled) stopAllSpeech();
  });

  // 4.5 오디오 및 볼륨 제어 엔진
  let currentMediaVolume = parseInt(localStorage.getItem('jarvis_volume') || '80', 10);

  function duckMediaVolume(isDucking) {
    // 부드러운 오디오 감쇄: 음악이 끊기거나 멈춘 것처럼 들리지 않도록 자연스럽게 65% 수준으로 조절
    const targetVol = isDucking ? Math.round(currentMediaVolume * 0.65) : currentMediaVolume;
    sendVolumeToIframes(targetVol);
  }

  function sendVolumeToIframes(vol) {
    const iframes = document.querySelectorAll('iframe[src*="youtube"]');
    iframes.forEach(iframe => {
      try {
        if (vol === 0) {
          iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'mute', args: [] }), '*');
        } else {
          iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'unMute', args: [] }), '*');
        }
        iframe.contentWindow.postMessage(JSON.stringify({
          event: 'command',
          func: 'setVolume',
          args: [vol]
        }), '*');
      } catch(e) {}
    });

    // 모든 HTML5 audio/video 태그 볼륨도 완벽 동기화
    document.querySelectorAll('audio, video').forEach(el => {
      try {
        el.volume = vol / 100;
        el.muted = (vol === 0);
      } catch(e) {}
    });
  }

  function setMediaVolume(vol) {
    currentMediaVolume = Math.min(Math.max(vol, 0), 100);
    localStorage.setItem('jarvis_volume', currentMediaVolume.toString());
    sendVolumeToIframes(currentMediaVolume);

    const sliders = document.querySelectorAll('.jarvis-volume-slider');
    sliders.forEach(s => s.value = currentMediaVolume);
    const volumeTexts = document.querySelectorAll('.jarvis-volume-val');
    volumeTexts.forEach(t => t.textContent = `${currentMediaVolume}%`);

    showVolumeOSD(currentMediaVolume);
  }

  window.setJarvisVolume = setMediaVolume;

  function showVolumeOSD(vol) {
    let osd = document.getElementById('jarvisVolumeOSD');
    if (!osd) {
      osd = document.createElement('div');
      osd.id = 'jarvisVolumeOSD';
      osd.style.position = 'fixed';
      osd.style.top = '28px';
      osd.style.left = '50%';
      osd.style.transform = 'translateX(-50%)';
      osd.style.zIndex = '999999';
      osd.style.background = 'rgba(8, 16, 28, 0.94)';
      osd.style.border = '1px solid #00f0ff';
      osd.style.boxShadow = '0 0 25px rgba(0, 240, 255, 0.5)';
      osd.style.borderRadius = '8px';
      osd.style.padding = '10px 24px';
      osd.style.display = 'flex';
      osd.style.alignItems = 'center';
      osd.style.gap = '14px';
      osd.style.backdropFilter = 'blur(10px)';
      osd.style.fontFamily = 'var(--font-hud)';
      osd.style.pointerEvents = 'none';
      osd.style.transition = 'opacity 0.3s ease';
      document.body.appendChild(osd);
    }

    const isMuted = vol === 0;
    const icon = isMuted ? '🔇' : vol > 60 ? '🔊' : '🔉';
    osd.innerHTML = `
      <span style="font-size: 20px;">${icon}</span>
      <div style="display:flex; flex-direction:column; gap:4px; width:160px;">
        <div style="display:flex; justify-content:space-between; font-size:11px; color:#00f0ff; font-weight:bold;">
          <span>AUDIO VOLUME</span>
          <span>${vol}%</span>
        </div>
        <div style="width:100%; height:6px; background:rgba(0,240,255,0.2); border-radius:3px; overflow:hidden;">
          <div style="width:${vol}%; height:100%; background:linear-gradient(90deg, #00f0ff, #00ffaa); box-shadow:0 0 8px #00f0ff;"></div>
        </div>
      </div>
    `;
    osd.style.opacity = '1';

    clearTimeout(window.volumeOSDTimer);
    window.volumeOSDTimer = setTimeout(() => {
      if (osd) osd.style.opacity = '0';
    }, 2200);
  }

  // ⚡ [Barge-in 글로벌 리스너] 화면 클릭 / 터치 / 키보드 입력 시 자비스 말 즉시 끊기
  window.addEventListener('keydown', (e) => {
    if (isSpeaking && (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter')) {
      interruptSpeaking();
    }
  });
  document.addEventListener('click', (e) => {
    if (isSpeaking && !e.target.closest('button, input, select, a, textarea')) {
      interruptSpeaking();
    }
  });

  function appendActionNotification(text, targetUrl = null) {
    const banner = document.createElement('div');
    banner.className = 'msg-bubble action-msg';
    banner.style.background = 'rgba(0, 240, 255, 0.15)';
    banner.style.border = '1px solid #00f0ff';
    banner.style.color = '#00f0ff';
    banner.style.margin = '4px 0 10px 0';
    banner.style.padding = '8px 12px';
    banner.style.borderRadius = '6px';
    banner.style.fontSize = '12px';
    banner.style.fontFamily = 'var(--font-hud)';
    banner.style.boxShadow = '0 0 10px rgba(0, 240, 255, 0.25)';
    
    let linkBtnHtml = '';
    if (targetUrl) {
      linkBtnHtml = `<a href="${targetUrl}" target="_blank" style="display:inline-block; margin-left:8px; padding:3px 10px; background:#00f0ff; color:#000; border-radius:4px; font-weight:bold; text-decoration:none; box-shadow:0 0 8px rgba(0,240,255,0.6);">웹 브라우저로 직접 열기 ↗</a>`;
    }

    banner.innerHTML = `<strong>🚀 시스템 명령 실행:</strong> ${text} ${linkBtnHtml}`;
    messagesFeed.appendChild(banner);
    messagesFeed.scrollTop = messagesFeed.scrollHeight;
  }

  // 새 탭 열기 알림 토스트 (자비스 화면을 덮어쓰지 않고 새 탭 안내 및 원터치 링크 제공)
  function showNewTabNotification(targetUrl, replyText) {
    const existing = document.getElementById('newTabToast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'newTabToast';
    toast.style.position = 'fixed';
    toast.style.bottom = '24px';
    toast.style.right = '24px';
    toast.style.zIndex = '99999';
    toast.style.background = 'rgba(8, 16, 28, 0.95)';
    toast.style.border = '1px solid #00f0ff';
    toast.style.boxShadow = '0 0 25px rgba(0, 240, 255, 0.45)';
    toast.style.borderRadius = '8px';
    toast.style.padding = '12px 18px';
    toast.style.display = 'flex';
    toast.style.alignItems = 'center';
    toast.style.gap = '12px';
    toast.style.backdropFilter = 'blur(10px)';
    toast.style.fontFamily = 'var(--font-hud)';

    let icon = '🚀';
    if (/youtube/i.test(targetUrl)) icon = '▶️';
    else if (/naver/i.test(targetUrl)) icon = '📰';
    else if (/google/i.test(targetUrl)) icon = '🔍';

    toast.innerHTML = `
      <div style="font-size: 22px;">${icon}</div>
      <div style="display:flex; flex-direction:column; max-width:260px;">
        <span style="color:#00f0ff; font-size:13px; font-weight:bold;">새 탭으로 연결 완료</span>
        <span style="color:#ccc; font-size:11px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${replyText || targetUrl}</span>
      </div>
      <button class="btn-open-ext-link" style="padding:6px 14px; background:#00f0ff; color:#000; border:none; border-radius:4px; font-weight:bold; font-size:12px; cursor:pointer; box-shadow:0 0 10px rgba(0,240,255,0.6); white-space:nowrap;">내 크롬 브라우저로 열기 ↗</button>
      <span style="color:#888; cursor:pointer; font-size:16px; margin-left:4px;" id="btnCloseNewTabToast">✕</span>
    `;

    const openBtn = toast.querySelector('.btn-open-ext-link');
    if (openBtn) {
      openBtn.addEventListener('click', () => {
        if (window.jarvisAPI && window.jarvisAPI.openExternal) {
          window.jarvisAPI.openExternal(targetUrl);
        } else {
          window.open(targetUrl, '_blank');
        }
      });
    }

    toast.querySelector('#btnCloseNewTabToast').addEventListener('click', () => toast.remove());
    document.body.appendChild(toast);

    setTimeout(() => {
      if (document.body.contains(toast)) toast.remove();
    }, 7000);
  }

  // 현재 재생 중인 모든 자비스 미디어 플레이어 정지 및 DOM 제거 (소리 중복 원천 차단)
  function stopActiveMediaPlayer() {
    const iframes = document.querySelectorAll('iframe');
    iframes.forEach(iframe => {
      try {
        iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'stopVideo', args: [] }), '*');
        iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }), '*');
        iframe.src = 'about:blank';
      } catch (e) {}
    });
    document.querySelectorAll('audio, video').forEach(el => {
      try { el.pause(); el.currentTime = 0; } catch (e) {}
    });
    const activeWrappers = document.querySelectorAll('.dynamic-media-card, .jarvis-media-player-bubble');
    activeWrappers.forEach(el => el.remove());
    if (dynamicWidgetMount && dynamicWidgetMount.children.length === 0 && widgetEmptyState) {
      widgetEmptyState.style.display = 'block';
    }
  }

  // 대화 피드 내 인라인 미디어 플레이어 추가 (미니 서클 모드 전용, 단 1개만 유지)
  function appendMediaMessage(widget) {
    stopActiveMediaPlayer();

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble jarvis-msg jarvis-media-player-bubble';
    bubble.style.maxWidth = '420px';
    bubble.style.border = '1px solid #00f0ff';
    bubble.style.boxShadow = '0 0 15px rgba(0, 240, 255, 0.3)';

    bubble.innerHTML = `
      <div class="msg-meta" style="display:flex; justify-content:space-between; align-items:center;">
        <span class="agent-tag">J.A.R.V.I.S. AUDIO DECK</span>
        <button class="btn-close-inline-media" style="background:none; border:none; color:#ff4466; cursor:pointer; font-weight:bold; font-size:14px;" title="재생 종료">✕ 정지</button>
      </div>
      <div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 6px; margin: 8px 0; background:#000;">
        <iframe 
          src="${widget.embedUrl}" 
          style="position: absolute; top:0; left: 0; width: 100%; height: 100%; border:0;" 
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
          allowfullscreen>
        </iframe>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px;">
        <span style="color:#00ffaa; font-size:11px;">🎵 실시간 단일 스트리밍 중</span>
        <button class="btn-open-chrome-media" style="background:rgba(0,240,255,0.12); border:1px solid #00f0ff; color:#00f0ff; border-radius:4px; padding:3px 8px; font-size:11px; cursor:pointer; font-weight:bold;">🌐 내 크롬(로그인)으로 보기 ↗</button>
      </div>
      <div style="display:flex; align-items:center; gap:8px; margin-top:8px; padding:4px 8px; background:rgba(0,240,255,0.06); border-radius:6px; border:1px solid rgba(0,240,255,0.2);">
        <span style="font-size:12px; color:#00f0ff;">🔉</span>
        <input type="range" class="jarvis-volume-slider" min="0" max="100" value="${currentMediaVolume}" style="flex:1; accent-color:#00f0ff; cursor:pointer;" oninput="window.setJarvisVolume(this.value)">
        <span class="jarvis-volume-val" style="color:#00f0ff; font-size:11px; font-weight:bold; min-width:32px;">${currentMediaVolume}%</span>
      </div>
    `;

    const chromeBtn = bubble.querySelector('.btn-open-chrome-media');
    if (chromeBtn) {
      chromeBtn.addEventListener('click', () => {
        if (window.jarvisAPI && window.jarvisAPI.openExternal) {
          window.jarvisAPI.openExternal(widget.watchUrl);
        } else {
          window.open(widget.watchUrl, '_blank');
        }
      });
    }

    bubble.querySelector('.btn-close-inline-media').addEventListener('click', () => {
      bubble.remove();
    });

    messagesFeed.appendChild(bubble);
    messagesFeed.scrollTop = messagesFeed.scrollHeight;
  }

  // 4.6 Autonomous Web Research Intelligence Briefing Card (Inline Feed)
  function appendResearchMessage(widget) {
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble jarvis-msg jarvis-research-bubble';
    bubble.style.maxWidth = '520px';
    bubble.style.border = '1px solid rgba(0, 240, 255, 0.7)';
    bubble.style.boxShadow = '0 0 20px rgba(0, 240, 255, 0.35)';
    bubble.style.background = 'linear-gradient(135deg, rgba(8, 20, 42, 0.95), rgba(4, 12, 28, 0.98))';
    bubble.style.borderRadius = '10px';
    bubble.style.padding = '14px 16px';
    bubble.style.position = 'relative';

    const findingsHtml = (widget.keyFindings || []).map((f, i) => `
      <li style="margin-bottom: 6px; line-height: 1.45; display: flex; align-items: flex-start; gap: 8px;">
        <span style="display:inline-flex; align-items:center; justify-content:center; width:18px; height:18px; border-radius:50%; background:rgba(0,240,255,0.2); border:1px solid #00f0ff; color:#00f0ff; font-size:10px; font-weight:bold; flex-shrink:0; margin-top:2px;">${i + 1}</span>
        <span style="color:#d5eafc; font-size:12px;">${f}</span>
      </li>
    `).join('');

    const sourcesHtml = (widget.sources && widget.sources.length > 0) ? `
      <div style="margin-top: 10px; padding-top: 8px; border-top: 1px dashed rgba(0, 240, 255, 0.25);">
        <div style="font-size: 10px; color: #7da5c4; font-family: var(--font-hud); margin-bottom: 6px; letter-spacing: 0.5px;">VERIFIED REAL-TIME SOURCES:</div>
        <div style="display:flex; flex-wrap:wrap; gap: 6px;">
          ${widget.sources.map(s => `
            <a href="${s.link}" target="_blank" class="research-source-chip" title="${s.title}" style="display:inline-flex; align-items:center; gap:4px; font-size:11px; padding:3px 8px; background:rgba(0, 240, 255, 0.08); border:1px solid rgba(0, 240, 255, 0.3); border-radius:4px; color:#00f0ff; text-decoration:none; max-width: 220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; transition:all 0.2s ease;">
              <span>🌐</span><span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${s.source}: ${s.title}</span> ↗
            </a>
          `).join('')}
        </div>
      </div>
    ` : '';

    bubble.innerHTML = `
      <div class="msg-meta" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:1px solid rgba(0, 240, 255, 0.2); padding-bottom:6px;">
        <span class="agent-tag" style="display:flex; align-items:center; gap:6px; color:#00f0ff; font-size:11px; letter-spacing:1px;">
          <span style="font-size:14px;">🌐</span> INTELLIGENCE DOSSIER
        </span>
        <span class="time-tag" style="font-size:10px; color:#7da5c4;">${widget.timestamp || new Date().toLocaleTimeString('ko-KR')}</span>
      </div>

      <div style="font-size: 15px; font-weight: bold; color: #fff; font-family: var(--font-hud); letter-spacing: 0.5px; margin-bottom: 8px; text-shadow: 0 0 10px rgba(0,240,255,0.4);">
        ${widget.title || widget.query}
      </div>

      <div style="background: rgba(0, 240, 255, 0.08); border-left: 3px solid #00f0ff; border-radius: 4px; padding: 8px 12px; margin-bottom: 10px; font-size: 12.5px; color: #e2f4ff; line-height: 1.5;">
        ${widget.executiveSummary || '정보를 성공적으로 수집 및 종합 분석했습니다.'}
      </div>

      ${widget.keyFindings && widget.keyFindings.length > 0 ? `
        <div style="font-size: 11px; font-weight: bold; color: #00ffaa; font-family: var(--font-hud); margin-bottom: 6px; letter-spacing: 0.8px;">
          KEY INTELLIGENCE FINDINGS
        </div>
        <ul style="list-style:none; padding:0; margin:0 0 8px 0;">
          ${findingsHtml}
        </ul>
      ` : ''}

      ${sourcesHtml}
    `;

    messagesFeed.appendChild(bubble);
    messagesFeed.scrollTop = messagesFeed.scrollHeight;
  }

  function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }

  // 4.63 Autonomous Local Agent HUD Console & Terminal Card
  function createAgentContentHTML(widget) {
    if (widget.actionType === 'EXPLORE') {
      const itemsHtml = (widget.items || []).map(item => `
        <div class="agent-item-row" style="display:flex; justify-content:space-between; align-items:center; padding:6px 10px; background:rgba(0,240,255,0.04); border:1px solid rgba(0,240,255,0.12); border-radius:4px; font-family:var(--font-hud); font-size:11px; cursor:pointer;" onclick="navigator.clipboard.writeText('${item.path.replace(/\\/g, '\\\\')}');" title="경로 복사: ${item.path}">
          <div style="display:flex; align-items:center; gap:8px;">
            <span>${item.isDirectory ? '📁' : item.type === 'JS' || item.type === 'JSON' ? '⚡' : '📄'}</span>
            <span style="color:${item.isDirectory ? '#ffd700' : '#cbeeff'}; font-weight:${item.isDirectory ? 'bold' : 'normal'};">${item.name}</span>
          </div>
          <div style="display:flex; gap:12px; color:#7da5c4; font-size:10px;">
            <span>${item.size}</span>
            <span>${item.mtime || ''}</span>
          </div>
        </div>
      `).join('');

      return `
        <div style="font-size:11px; color:#7da5c4; margin-bottom:8px;">
          📍 경로: <code style="color:#00f0ff;">${widget.path}</code> (${widget.totalItems || 0}개 항목)
        </div>
        <div style="display:flex; flex-direction:column; gap:4px; max-height:300px; overflow-y:auto; padding-right:4px;">
          ${itemsHtml || '<div style="color:#7da5c4;">폴더가 비어 있습니다.</div>'}
        </div>
      `;
    }

    if (widget.actionType === 'READ') {
      return `
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; color:#7da5c4; margin-bottom:8px;">
          <span>📍 파일: <code style="color:#00f0ff;">${widget.path}</code> (${widget.range || ''})</span>
          <span style="color:#00ffaa;">총 ${widget.totalLines || 0}줄</span>
        </div>
        <pre style="background:#030712; border:1px solid rgba(0,240,255,0.3); border-radius:6px; padding:12px; margin:0; font-family:'Consolas', 'Courier New', monospace; font-size:11.5px; color:#cbeeff; line-height:1.45; max-height:340px; overflow:auto; white-space:pre-wrap; word-break:break-all;"><code>${escapeHTML(widget.content || '(내용 없음)')}</code></pre>
      `;
    }

    if (widget.actionType === 'EXEC') {
      const isSuccess = widget.exitCode === 0;
      return `
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; color:#7da5c4; margin-bottom:8px;">
          <span>💻 실행 명령: <code style="color:#ffd700;">${widget.command}</code></span>
          <span style="color:${isSuccess ? '#00ffaa' : '#ff4466'}; font-weight:bold;">${isSuccess ? 'SUCCESS (0)' : 'FAILED (' + widget.exitCode + ')'} · ${widget.executionTime || ''}</span>
        </div>
        <pre style="background:#02060f; border:1px solid ${isSuccess ? 'rgba(0,240,255,0.3)' : 'rgba(255,68,102,0.4)'}; border-radius:6px; padding:12px; margin:0; font-family:'Consolas', monospace; font-size:11px; color:${isSuccess ? '#00ffaa' : '#ff7788'}; max-height:280px; overflow:auto; white-space:pre-wrap;"><code>${escapeHTML(widget.stdout || widget.stderr || widget.errorMsg || '(출력 없음)')}</code></pre>
      `;
    }

    if (widget.actionType === 'DIAGNOSE') {
      const recentHtml = (widget.recentChanges || []).map(c => `<li style="color:#00f0ff; margin-bottom:3px;">📝 ${c}</li>`).join('');
      const issuesHtml = (widget.recentIssues || []).map(i => `<li style="color:#ffd700; margin-bottom:3px;">⚠️ ${i}</li>`).join('');
      return `
        <div style="background:rgba(0,240,255,0.08); border-left:3px solid #00f0ff; border-radius:4px; padding:8px 12px; margin-bottom:10px; font-size:12px; color:#e2f4ff;">
          🩺 <strong>진단 총평:</strong> ${widget.healthSummary || '정상 가동 중'}
        </div>
        <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:6px; margin-bottom:10px; font-family:var(--font-hud);">
          <div style="background:rgba(0,0,0,0.3); padding:6px; border-radius:4px; border:1px solid rgba(0,240,255,0.2);">
            <div style="font-size:9px; color:#7da5c4;">NODE VER</div>
            <div style="font-size:11px; color:#fff; font-weight:bold;">${widget.system?.nodeVersion || '-'}</div>
          </div>
          <div style="background:rgba(0,0,0,0.3); padding:6px; border-radius:4px; border:1px solid rgba(0,240,255,0.2);">
            <div style="font-size:9px; color:#7da5c4;">MEMORY</div>
            <div style="font-size:11px; color:#00ffaa; font-weight:bold;">${widget.system?.memoryUsage || '-'}</div>
          </div>
          <div style="background:rgba(0,0,0,0.3); padding:6px; border-radius:4px; border:1px solid rgba(0,240,255,0.2);">
            <div style="font-size:9px; color:#7da5c4;">UPTIME</div>
            <div style="font-size:11px; color:#ffd700; font-weight:bold;">${widget.system?.uptime || '-'}</div>
          </div>
          <div style="background:rgba(0,0,0,0.3); padding:6px; border-radius:4px; border:1px solid rgba(0,240,255,0.2);">
            <div style="font-size:9px; color:#7da5c4;">PLATFORM</div>
            <div style="font-size:11px; color:#fff; font-weight:bold;">${widget.system?.platform || '-'}</div>
          </div>
        </div>
        ${widget.recentChanges && widget.recentChanges.length > 0 ? `
          <div style="font-size:11px; font-weight:bold; color:#00ffaa; font-family:var(--font-hud); margin-bottom:4px;">최근 수정된 시스템 코어 파일:</div>
          <ul style="list-style:none; padding:0 0 0 4px; margin:0 0 8px 0; font-size:11px;">${recentHtml}</ul>
        ` : ''}
        ${widget.recentIssues && widget.recentIssues.length > 0 ? `
          <div style="font-size:11px; font-weight:bold; color:#ffd700; font-family:var(--font-hud); margin-bottom:4px;">최근 포착된 피드백 및 감지 항목:</div>
          <ul style="list-style:none; padding:0 0 0 4px; margin:0 0 8px 0; font-size:11px;">${issuesHtml}</ul>
        ` : ''}
      `;
    }

    if (widget.actionType === 'SIMULATION') {
      const testsHtml = (widget.tests || []).map(t => {
        const isPass = t.passed;
        return `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:7px 10px; background:rgba(0,0,0,0.35); border:1px solid ${isPass ? 'rgba(0,255,170,0.25)' : 'rgba(255,68,102,0.35)'}; border-radius:5px; font-family:var(--font-hud); font-size:11px; margin-bottom:4px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="display:inline-block; padding:1px 5px; border-radius:3px; background:${isPass ? 'rgba(0,255,170,0.15)' : 'rgba(255,68,102,0.2)'}; color:${isPass ? '#00ffaa' : '#ff4466'}; font-weight:bold; font-size:10px;">${t.id}</span>
              <span style="color:#fff; font-weight:500;">${escapeHTML(t.name)}</span>
              <span style="color:#7da5c4; font-size:10px;">(${escapeHTML(t.input)})</span>
            </div>
            <div style="display:flex; align-items:center; gap:10px;">
              <span style="color:#7da5c4; font-size:10px;">실측: <span style="color:#cbeeff;">${escapeHTML(t.actual || t.expected)}</span></span>
              <span style="color:${isPass ? '#00ffaa' : '#ff4466'}; font-weight:bold;">${isPass ? '✓ PASS' : '✗ FAIL'}</span>
              <span style="color:#7da5c4; font-size:9px;">${t.duration || ''}</span>
            </div>
          </div>
        `;
      }).join('');

      return `
        <div style="background:${widget.allPassed ? 'rgba(0,255,170,0.08)' : 'rgba(255,68,102,0.08)'}; border-left:3px solid ${widget.allPassed ? '#00ffaa' : '#ff4466'}; border-radius:4px; padding:8px 12px; margin-bottom:10px; font-size:12px; color:#e2f4ff; display:flex; justify-content:space-between; align-items:center;">
          <div>🧪 <strong>시뮬레이션 실기 검증 결과:</strong> ${escapeHTML(widget.summary || '')}</div>
          <div style="font-family:var(--font-hud); font-size:11px; color:${widget.allPassed ? '#00ffaa' : '#ff4466'}; font-weight:bold;">
            ${widget.passedCount}/${widget.totalTests} 통과 (${widget.totalDuration})
          </div>
        </div>
        <div style="display:flex; flex-direction:column; max-height:300px; overflow-y:auto; padding-right:4px;">
          ${testsHtml}
        </div>
      `;
    }

    if (widget.actionType === 'WRITE') {
      const isSuccess = widget.success !== false;
      return `
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; color:#7da5c4; margin-bottom:8px;">
          <span>💾 저장 경로: <code style="color:${isSuccess ? '#00f0ff' : '#ff4466'};">${widget.path || widget.error}</code></span>
          <span style="color:${isSuccess ? '#00ffaa' : '#ff4466'}; font-weight:bold;">${isSuccess ? '✓ 저장 완료 · ' + widget.size : '✗ 저장 실패'}</span>
        </div>
        ${isSuccess && widget.serveUrl ? `
          <div style="display:flex; align-items:center; gap:10px; padding:8px 12px; background:rgba(0,240,255,0.07); border:1px solid rgba(0,240,255,0.25); border-radius:6px;">
            <span style="font-size:12px; color:#00ffaa;">🌐 브라우저 접속 URL:</span>
            <a href="${widget.serveUrl}" target="_blank" style="color:#00f0ff; font-size:12px; font-family:var(--font-hud); text-decoration:none; flex:1;">${widget.serveUrl} ↗</a>
          </div>
        ` : ''}
      `;
    }

    if (widget.actionType === 'GENERATE_APP') {
      const isSuccess = widget.success !== false;
      return `
        <div style="background:${isSuccess ? 'rgba(0,255,170,0.08)' : 'rgba(255,68,102,0.08)'}; border-left:3px solid ${isSuccess ? '#00ffaa' : '#ff4466'}; border-radius:4px; padding:8px 12px; margin-bottom:10px; font-size:12px; color:#e2f4ff;">
          🚀 <strong>AI 즉석 생성:</strong> ${escapeHTML(widget.description || widget.error || '')}
          ${isSuccess ? `<span style="float:right; color:#7da5c4; font-size:10px; font-family:var(--font-hud);">${widget.size} · ${widget.elapsed}</span>` : ''}
        </div>
        ${isSuccess ? `
          <div style="display:flex; flex-direction:column; gap:8px;">
            <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px; background:rgba(0,0,0,0.4); border:1px solid rgba(0,240,255,0.3); border-radius:6px;">
              <div>
                <div style="font-size:11px; color:#00ffaa; font-family:var(--font-hud); margin-bottom:3px;">✓ 파일 생성 완료</div>
                <div style="font-size:10px; color:#7da5c4; font-family:var(--font-hud);">${escapeHTML(widget.fileName)}</div>
              </div>
              <div style="display:flex; align-items:center; gap:8px;">
                <button onclick="window.jarvisOpenSim('${escapeHTML(widget.serveUrl)}', '${escapeHTML(widget.description || '시뮬레이션')}')" style="cursor:pointer; display:inline-flex; align-items:center; gap:6px; padding:6px 14px; background:linear-gradient(135deg, rgba(0,240,255,0.25), rgba(0,255,170,0.2)); border:1px solid #00f0ff; border-radius:6px; color:#00f0ff; font-size:12px; font-weight:bold; font-family:var(--font-hud); letter-spacing:0.5px;">
                  🖥️ 창으로 열기
                </button>
                <a href="${widget.serveUrl}" target="_blank" style="display:inline-flex; align-items:center; gap:5px; padding:6px 12px; background:rgba(255,255,255,0.05); border:1px solid rgba(0,240,255,0.3); border-radius:6px; color:#7da5c4; text-decoration:none; font-size:11px; font-family:var(--font-hud);">
                  🔗 새 탭 ↗
                </a>
              </div>
            </div>
          </div>
        ` : `<div style="color:#ff7788; font-size:12px; padding:8px;">${escapeHTML(widget.error || '알 수 없는 오류')}</div>`}
      `;
    }

    return `<div>${JSON.stringify(widget)}</div>`;
  }

  function appendAgentMessage(widget) {
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble jarvis-msg jarvis-agent-bubble';
    bubble.style.maxWidth = '540px';
    bubble.style.border = '1px solid #00f0ff';
    bubble.style.boxShadow = '0 0 20px rgba(0, 240, 255, 0.35)';
    bubble.style.background = 'linear-gradient(135deg, rgba(8, 20, 42, 0.95), rgba(4, 12, 28, 0.98))';
    bubble.style.borderRadius = '10px';
    bubble.style.padding = '14px 16px';
    bubble.style.position = 'relative';

    bubble.innerHTML = `
      <div class="msg-meta" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:1px solid rgba(0, 240, 255, 0.2); padding-bottom:6px;">
        <span class="agent-tag" style="display:flex; align-items:center; gap:6px; color:#00f0ff; font-size:11px; letter-spacing:1px;">
          <span>⚡</span> J.A.R.V.I.S. AGENT CONSOLE
        </span>
        <span class="time-tag" style="font-size:10px; color:#7da5c4;">${widget.timestamp || new Date().toLocaleTimeString('ko-KR')}</span>
      </div>
      <div style="font-size: 15px; font-weight: bold; color: #fff; font-family: var(--font-hud); letter-spacing: 0.5px; margin-bottom: 8px; text-shadow: 0 0 10px rgba(0,240,255,0.4);">
        ${widget.title}
      </div>
      ${createAgentContentHTML(widget)}
    `;

    messagesFeed.appendChild(bubble);
    messagesFeed.scrollTop = messagesFeed.scrollHeight;
  }

  function renderFileAgentContent(card, widget) {
    const wrapper = document.createElement('div');
    wrapper.className = 'dynamic-agent-wrapper';
    wrapper.style.padding = '14px 16px';
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.gap = '10px';

    wrapper.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(0,240,255,0.25); padding-bottom:8px;">
        <div style="font-size:15px; font-weight:bold; color:#fff; font-family:var(--font-hud); letter-spacing:0.5px; text-shadow:0 0 10px rgba(0,240,255,0.5);">
          ⚡ ${widget.title}
        </div>
        <span style="font-size:10px; color:#7da5c4; font-family:var(--font-hud);">J.A.R.V.I.S. AGENT TOOL</span>
      </div>
      ${createAgentContentHTML(widget)}
    `;

    card.appendChild(wrapper);
  }

  // 4.65 Dedicated High-Res CAD Studio Window Launcher
  function openCADStudioWindow(widgetData) {
    if (widgetData) {
      try {
        localStorage.setItem('jarvis_latest_blueprint', JSON.stringify(widgetData));
      } catch (e) {}
      fetch('/api/cad/latest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(widgetData)
      }).catch(() => {});
    }

    if (window.jarvisAPI && window.jarvisAPI.openCADWindow) {
      window.jarvisAPI.openCADWindow(widgetData);
    } else {
      window.open('/cad-studio.html', 'JARVIS_CAD_STUDIO', 'width=1280,height=860,resizable=yes');
    }
  }

  function closeCADStudioWindow() {
    if (window.jarvisAPI && window.jarvisAPI.closeCADWindow) {
      window.jarvisAPI.closeCADWindow();
    }
  }

  // 4.66 Dedicated High-Performance Simulation & Generated App Window Launcher
  function openSimulationAppWindow(url, title = 'J.A.R.V.I.S. Simulation') {
    if (!url) return;
    if (window.jarvisAPI && window.jarvisAPI.openSimulationWindow) {
      window.jarvisAPI.openSimulationWindow({ url, title, width: 1240, height: 840 });
    } else {
      const popup = window.open(url, 'JARVIS_SIM_' + Date.now(), 'width=1240,height=840,menubar=no,toolbar=no,location=no,status=no,resizable=yes');
      if (!popup || popup.closed || typeof popup.closed === 'undefined') {
        window.open(url, '_blank');
      }
    }
  }
  window.jarvisOpenSim = (url, title) => openSimulationAppWindow(url, title);

  // 4.7 3D/2D Holographic CAD Blueprint Engine & Parametric Controls
  function createBlueprintCADElement(widget, isCompact = false) {
    const container = document.createElement('div');
    container.className = 'blueprint-cad-container';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '10px';
    container.style.width = '100%';

    let dims = { ...widget.dimensions };
    let rotX = -25;
    let rotY = 35;
    let isAutoRotate = (dims.autoRotate === true);
    let isDragging = false;
    let lastMouseX = 0;
    let lastMouseY = 0;
    let animFrameId = null;

    const canvasWidth = isCompact ? 440 : 500;
    const canvasHeight = isCompact ? 240 : 270;

    container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:1px solid rgba(0,240,255,0.25); padding-bottom:8px;">
        <div>
          <div style="font-size:15px; font-weight:bold; color:#fff; font-family:var(--font-hud); letter-spacing:0.8px; text-shadow:0 0 10px rgba(0,240,255,0.5);">
            📐 ${widget.itemName || '접이식 식탁'} 3D CAD
          </div>
          <div style="font-size:11px; color:#7da5c4; margin-top:2px;">
            ${widget.description || '파라메트릭 3D 실시간 설계 렌더러'}
          </div>
        </div>
        <div style="display:flex; gap:6px; align-items:center;">
          <button class="btn-cad-open-window" style="background:rgba(255,215,0,0.16); border:1px solid #ffd700; color:#ffd700; font-size:11px; font-weight:bold; padding:4px 9px; border-radius:4px; cursor:pointer; box-shadow:0 0 10px rgba(255,215,0,0.25); display:flex; align-items:center; gap:4px;">
            🗗 전용 창 열기
          </button>
          <button class="btn-cad-autorotate" style="background:${isAutoRotate ? 'rgba(0,240,255,0.35)' : 'rgba(0,240,255,0.12)'}; border:1px solid #00f0ff; color:#00f0ff; font-size:11px; font-weight:bold; padding:4px 8px; border-radius:4px; cursor:pointer; box-shadow:${isAutoRotate ? '0 0 10px #00f0ff' : 'none'};">
            🔄 자동 회전
          </button>
          <button class="btn-cad-resetview" style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.2); color:#ccc; font-size:11px; padding:4px 8px; border-radius:4px; cursor:pointer;">
            🎯 리셋
          </button>
        </div>
      </div>

      <div style="position:relative; width:100%; border-radius:8px; overflow:hidden; border:1px solid rgba(0,240,255,0.35); box-shadow:inset 0 0 20px rgba(0,240,255,0.15), 0 0 15px rgba(0,240,255,0.1);">
        <canvas class="cad-canvas" width="${canvasWidth}" height="${canvasHeight}" style="display:block; width:100%; height:auto; background:#040914; cursor:grab;"></canvas>
        <div style="position:absolute; bottom:8px; left:12px; font-size:10px; font-family:var(--font-hud); color:rgba(0,240,255,0.7); pointer-events:none; letter-spacing:0.5px;">
          GRID: 100mm | REAL-TIME 3D PROJECTION
        </div>
        <div style="position:absolute; bottom:8px; right:12px; font-size:10px; font-family:var(--font-hud); color:#ffd700; pointer-events:none;">
          DRAG TO ROTATE 360°
        </div>
      </div>

      <!-- Real-Time Sliders -->
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; background:rgba(0,240,255,0.05); padding:10px 12px; border-radius:6px; border:1px solid rgba(0,240,255,0.2);">
        <div style="display:flex; flex-direction:column; gap:4px;">
          <div style="display:flex; justify-content:space-between; font-size:11px; font-weight:bold;">
            <span style="color:#7da5c4;">가로 폭 (Width)</span>
            <span class="label-cad-width" style="color:#00f0ff; font-family:var(--font-hud);">${dims.width} mm</span>
          </div>
          <input type="range" class="slider-cad-width" min="300" max="2400" step="25" value="${dims.width}" style="accent-color:#00f0ff; cursor:pointer; width:100%;">
        </div>

        <div style="display:flex; flex-direction:column; gap:4px;">
          <div style="display:flex; justify-content:space-between; font-size:11px; font-weight:bold;">
            <span style="color:#7da5c4;">세로 깊이 (Depth)</span>
            <span class="label-cad-depth" style="color:#00f0ff; font-family:var(--font-hud);">${dims.depth} mm</span>
          </div>
          <input type="range" class="slider-cad-depth" min="300" max="2400" step="25" value="${dims.depth}" style="accent-color:#00f0ff; cursor:pointer; width:100%;">
        </div>

        <div style="display:flex; flex-direction:column; gap:4px;">
          <div style="display:flex; justify-content:space-between; font-size:11px; font-weight:bold;">
            <span style="color:#7da5c4;">설치 높이 (Height)</span>
            <span class="label-cad-height" style="color:#00f0ff; font-family:var(--font-hud);">${dims.height} mm</span>
          </div>
          <input type="range" class="slider-cad-height" min="400" max="1200" step="25" value="${dims.height}" style="accent-color:#00f0ff; cursor:pointer; width:100%;">
        </div>

        <div style="display:flex; flex-direction:column; gap:4px;">
          <div style="display:flex; justify-content:space-between; font-size:11px; font-weight:bold;">
            <span style="color:#ffd700;">1단 벽면 접힘 각도</span>
            <span class="label-cad-angle" style="color:#ffd700; font-family:var(--font-hud);">${dims.foldAngle || 90}°</span>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            <input type="range" class="slider-cad-angle" min="0" max="90" step="5" value="${dims.foldAngle || 90}" style="flex:1; accent-color:#ffd700; cursor:pointer;">
            <button class="btn-cad-fold-toggle" style="padding:2px 8px; font-size:10px; font-weight:bold; background:rgba(255,215,0,0.15); border:1px solid #ffd700; color:#ffd700; border-radius:3px; cursor:pointer;">
              ${(dims.foldAngle || 90) === 0 ? '펼치기' : '접기'}
            </button>
          </div>
        </div>

        ${dims.hasSecondaryBoard ? `
        <div style="grid-column: 1 / -1; display:flex; flex-direction:column; gap:4px; margin-top:2px; padding-top:6px; border-top:1px dashed rgba(255,215,0,0.3);">
          <div style="display:flex; justify-content:space-between; font-size:11px; font-weight:bold;">
            <span style="color:#00ffaa;">🔗 2단 확장 결합 상판 (버터플라이 힌지)</span>
            <span class="label-cad-leaf2" style="color:#00ffaa; font-family:var(--font-hud);">${dims.leaf2Angle !== undefined ? dims.leaf2Angle : 180}° (${dims.leaf2Angle === 180 ? '완전 확장' : dims.leaf2Angle === 0 ? '2중 겹침' : '변형 중'})</span>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <input type="range" class="slider-cad-leaf2" min="0" max="180" step="5" value="${dims.leaf2Angle !== undefined ? dims.leaf2Angle : 180}" style="flex:1; accent-color:#00ffaa; cursor:pointer;">
            <button class="btn-cad-leaf2-toggle" style="padding:2px 10px; font-size:10px; font-weight:bold; background:rgba(0,255,170,0.15); border:1px solid #00ffaa; color:#00ffaa; border-radius:3px; cursor:pointer;">
              ${(dims.leaf2Angle || 180) === 180 ? '겹치기(0°)' : '180° 확장'}
            </button>
          </div>
        </div>
        ` : ''}
      </div>

      <!-- Real-time Specs Grid -->
      <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:6px; font-size:11px;">
        <div style="background:rgba(0,0,0,0.3); padding:6px 8px; border-radius:4px; border-left:2px solid #00f0ff;">
          <div style="color:#7da5c4; font-size:10px;">예상 무게</div>
          <div class="val-cad-weight" style="color:#fff; font-weight:bold; font-family:var(--font-hud);">${(((dims.width * dims.depth * 24) * 0.00000072) * (dims.hasSecondaryBoard ? 2 : 1)).toFixed(1)} kg</div>
        </div>
        <div style="background:rgba(0,0,0,0.3); padding:6px 8px; border-radius:4px; border-left:2px solid #00ffaa;">
          <div style="color:#7da5c4; font-size:10px;">권장 허용 하중</div>
          <div class="val-cad-load" style="color:#00ffaa; font-weight:bold; font-family:var(--font-hud);">${dims.hasSecondaryBoard ? 75 : Math.round(45 * (1200 / dims.width) * (600 / dims.depth))} kg</div>
        </div>
        <div style="background:rgba(0,0,0,0.3); padding:6px 8px; border-radius:4px; border-left:2px solid #ffd700;">
          <div style="color:#7da5c4; font-size:10px;">유압 쇼바 규격</div>
          <div style="color:#ffd700; font-weight:bold; font-size:10px;">${dims.hasSecondaryBoard ? '350N 헤비듀티' : '200N 가스 댐퍼'}</div>
        </div>
      </div>

      <div style="font-size:11px; color:#a2c4db; background:rgba(0,240,255,0.06); padding:6px 10px; border-radius:4px; line-height:1.4;">
        🪵 <strong>자재:</strong> ${widget.material || 'E0 친환경 자작나무 합판 (24T)'}
      </div>
    `;

    const canvas = container.querySelector('.cad-canvas');
    const ctx = canvas.getContext('2d');
    const dpr = Math.max(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(canvasWidth * dpr);
    canvas.height = Math.round(canvasHeight * dpr);
    ctx.scale(dpr, dpr);

    const btnOpenWindow = container.querySelector('.btn-cad-open-window');
    if (btnOpenWindow) {
      btnOpenWindow.addEventListener('click', () => {
        openCADStudioWindow({ ...widget, dimensions: dims });
      });
    }

    const sliderWidth = container.querySelector('.slider-cad-width');
    const sliderDepth = container.querySelector('.slider-cad-depth');
    const sliderHeight = container.querySelector('.slider-cad-height');
    const sliderAngle = container.querySelector('.slider-cad-angle');
    const btnFoldToggle = container.querySelector('.btn-cad-fold-toggle');
    const btnAutoRotate = container.querySelector('.btn-cad-autorotate');
    const btnResetView = container.querySelector('.btn-cad-resetview');

    const sliderLeaf2 = container.querySelector('.slider-cad-leaf2');
    const btnLeaf2Toggle = container.querySelector('.btn-cad-leaf2-toggle');
    const labelLeaf2 = container.querySelector('.label-cad-leaf2');

    const labelWidth = container.querySelector('.label-cad-width');
    const labelDepth = container.querySelector('.label-cad-depth');
    const labelHeight = container.querySelector('.label-cad-height');
    const labelAngle = container.querySelector('.label-cad-angle');
    const valWeight = container.querySelector('.val-cad-weight');
    const valLoad = container.querySelector('.val-cad-load');

    function updateCalculations() {
      const multiplier = dims.hasSecondaryBoard ? 2 : 1;
      const totalDepth = dims.hasSecondaryBoard && dims.leaf2Angle === 180 ? dims.depth * 2 : dims.depth;
      labelWidth.textContent = `${dims.width} mm`;
      labelDepth.textContent = dims.hasSecondaryBoard && dims.leaf2Angle === 180 ? `${dims.depth}×2 = ${totalDepth} mm` : `${dims.depth} mm`;
      labelHeight.textContent = `${dims.height} mm`;
      labelAngle.textContent = `${dims.foldAngle}°`;
      btnFoldToggle.textContent = dims.foldAngle === 0 ? '펼치기' : '접기';

      if (labelLeaf2) {
        labelLeaf2.textContent = `${dims.leaf2Angle}° (${dims.leaf2Angle === 180 ? '완전 확장 1200mm' : dims.leaf2Angle === 0 ? '2중 겹침 600mm' : '변형 중'})`;
      }
      if (btnLeaf2Toggle) {
        btnLeaf2Toggle.textContent = dims.leaf2Angle === 180 ? '겹치기(0°)' : '180° 확장';
      }

      const weight = (((dims.width * dims.depth * 24) * 0.00000072) * multiplier).toFixed(1);
      const load = dims.hasSecondaryBoard ? 75 : Math.round(45 * (1200 / dims.width) * (600 / dims.depth));
      valWeight.textContent = `${weight} kg`;
      valLoad.textContent = `${load} kg`;
    }

    function persistInlineChanges() {
      const updated = { ...widget, dimensions: dims, updatedAt: Date.now() };
      try {
        localStorage.setItem('jarvis_latest_blueprint', JSON.stringify(updated));
      } catch (e) {}
      fetch('/api/cad/latest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      }).catch(() => {});
    }

    sliderWidth.addEventListener('input', (e) => {
      dims.width = parseInt(e.target.value, 10);
      updateCalculations();
      persistInlineChanges();
    });
    sliderDepth.addEventListener('input', (e) => {
      dims.depth = parseInt(e.target.value, 10);
      updateCalculations();
      persistInlineChanges();
    });
    sliderHeight.addEventListener('input', (e) => {
      dims.height = parseInt(e.target.value, 10);
      updateCalculations();
      persistInlineChanges();
    });
    sliderAngle.addEventListener('input', (e) => {
      dims.foldAngle = parseInt(e.target.value, 10);
      updateCalculations();
      persistInlineChanges();
    });
    btnFoldToggle.addEventListener('click', () => {
      dims.foldAngle = dims.foldAngle === 0 ? 90 : 0;
      sliderAngle.value = dims.foldAngle;
      updateCalculations();
      persistInlineChanges();
    });

    if (sliderLeaf2) {
      sliderLeaf2.addEventListener('input', (e) => {
        dims.leaf2Angle = parseInt(e.target.value, 10);
        updateCalculations();
        persistInlineChanges();
      });
    }
    if (btnLeaf2Toggle) {
      btnLeaf2Toggle.addEventListener('click', () => {
        dims.leaf2Angle = (dims.leaf2Angle === 180) ? 0 : 180;
        if (sliderLeaf2) sliderLeaf2.value = dims.leaf2Angle;
        updateCalculations();
        persistInlineChanges();
      });
    }

    btnAutoRotate.addEventListener('click', () => {
      isAutoRotate = !isAutoRotate;
      dims.autoRotate = isAutoRotate;
      btnAutoRotate.style.background = isAutoRotate ? 'rgba(0,240,255,0.35)' : 'rgba(0,240,255,0.12)';
      btnAutoRotate.style.boxShadow = isAutoRotate ? '0 0 10px #00f0ff' : 'none';
      persistInlineChanges();
    });
    btnResetView.addEventListener('click', () => {
      rotX = -25;
      rotY = 35;
      dims = { ...widget.dimensions };
      sliderWidth.value = dims.width;
      sliderDepth.value = dims.depth;
      sliderHeight.value = dims.height;
      sliderAngle.value = dims.foldAngle || 90;
      updateCalculations();
    });

    // Mouse drag rotation
    canvas.addEventListener('mousedown', (e) => {
      isDragging = true;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      canvas.style.cursor = 'grabbing';
    });
    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - lastMouseX;
      const dy = e.clientY - lastMouseY;
      rotY += dx * 0.5;
      rotX = Math.max(-75, Math.min(75, rotX + dy * 0.5));
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
    });
    window.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        canvas.style.cursor = 'grab';
      }
    });

    // Touch support for mobile/tablets
    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        isDragging = true;
        lastMouseX = e.touches[0].clientX;
        lastMouseY = e.touches[0].clientY;
      }
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
      if (!isDragging || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - lastMouseX;
      const dy = e.touches[0].clientY - lastMouseY;
      rotY += dx * 0.6;
      rotX = Math.max(-75, Math.min(75, rotX + dy * 0.6));
      lastMouseX = e.touches[0].clientX;
      lastMouseY = e.touches[0].clientY;
    }, { passive: true });
    window.addEventListener('touchend', () => { isDragging = false; });

    // 3D Canvas Projection Render Loop
    function project3D(x, y, z, cx, cy) {
      const radY = (rotY * Math.PI) / 180;
      const radX = (rotX * Math.PI) / 180;
      const yOffset = y - (dims.height * 0.28);

      // Y-axis rotation
      const x1 = x * Math.cos(radY) + z * Math.sin(radY);
      const z1 = -x * Math.sin(radY) + z * Math.cos(radY);

      // X-axis rotation
      const y2 = yOffset * Math.cos(radX) - z1 * Math.sin(radX);
      const z2 = yOffset * Math.sin(radX) + z1 * Math.cos(radX);

      const fov = 2400;
      const factor = (fov / (fov + z2)) * (isCompact ? 0.20 : 0.23);
      return {
        px: cx + x1 * factor,
        py: cy + y2 * factor,
        depth: z2
      };
    }

    let hasConnected = false;
    function render3DCAD() {
      if (!container.isConnected) {
        if (!hasConnected) {
          animFrameId = requestAnimationFrame(render3DCAD);
          return;
        } else {
          if (animFrameId) cancelAnimationFrame(animFrameId);
          return;
        }
      }
      hasConnected = true;

      if (isAutoRotate) {
        rotY = (rotY + 0.6) % 360;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const cx = canvas.width / 2;
      const cy = canvas.height / 2 + 10;

      // A. Draw Blueprint Cyber Background Grid
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.08)';
      ctx.lineWidth = 1;
      const gridStep = 24;
      for (let gx = 0; gx < canvas.width; gx += gridStep) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, canvas.height);
        ctx.stroke();
      }
      for (let gy = 0; gy < canvas.height; gy += gridStep) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(canvas.width, gy);
        ctx.stroke();
      }

      // B. Draw Floor Ground Plane at Y = dims.height
      const floorY = dims.height;
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.2)';
      ctx.lineWidth = 1;
      for (let r = 250; r <= 850; r += 300) {
        ctx.beginPath();
        for (let a = 0; a <= 360; a += 15) {
          const ar = (a * Math.PI) / 180;
          const p = project3D(Math.cos(ar) * r, floorY, Math.sin(ar) * r, cx, cy);
          if (a === 0) ctx.moveTo(p.px, p.py);
          else ctx.lineTo(p.px, p.py);
        }
        ctx.closePath();
        ctx.stroke();
      }

      // C. Wall Mount Base Plane (Back Wall at Z = -dims.depth / 2)
      const wallZ = -dims.depth / 2;
      const wallHalfW = dims.width / 2;
      const wallTop = -80;
      const wallBottom = dims.height;

      ctx.beginPath();
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.28)';
      ctx.setLineDash([4, 4]);
      const w1 = project3D(-wallHalfW - 80, wallTop, wallZ, cx, cy);
      const w2 = project3D(wallHalfW + 80, wallTop, wallZ, cx, cy);
      const w3 = project3D(wallHalfW + 80, wallBottom, wallZ, cx, cy);
      const w4 = project3D(-wallHalfW - 80, wallBottom, wallZ, cx, cy);
      ctx.moveTo(w1.px, w1.py);
      ctx.lineTo(w2.px, w2.py);
      ctx.lineTo(w3.px, w3.py);
      ctx.lineTo(w4.px, w4.py);
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);

      // D. Folding Table Board Coordinates
      const foldRad = ((dims.foldAngle !== undefined ? dims.foldAngle : 90) * Math.PI) / 180;
      const halfW = dims.width / 2;
      const th = dims.thickness || 24;

      function getBoardCorner(lx, lz, ly) {
        const py = lz * Math.cos(foldRad) + ly * Math.sin(foldRad);
        const pz = wallZ + lz * Math.sin(foldRad) - ly * Math.cos(foldRad);
        return project3D(lx, py, pz, cx, cy);
      }

      const p000 = getBoardCorner(-halfW, 0, 0);
      const p100 = getBoardCorner(halfW, 0, 0);
      const p110 = getBoardCorner(halfW, dims.depth, 0);
      const p010 = getBoardCorner(-halfW, dims.depth, 0);

      const p001 = getBoardCorner(-halfW, 0, th);
      const p101 = getBoardCorner(halfW, 0, th);
      const p111 = getBoardCorner(halfW, dims.depth, th);
      const p011 = getBoardCorner(-halfW, dims.depth, th);

      // Draw Board Top Face
      ctx.fillStyle = 'rgba(0, 240, 255, 0.14)';
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 2.2;
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 8;

      ctx.beginPath();
      ctx.moveTo(p000.px, p000.py);
      ctx.lineTo(p100.px, p100.py);
      ctx.lineTo(p110.px, p110.py);
      ctx.lineTo(p010.px, p010.py);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Draw Board Bottom & Side Edges
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(p001.px, p001.py);
      ctx.lineTo(p101.px, p101.py);
      ctx.lineTo(p111.px, p111.py);
      ctx.lineTo(p011.px, p011.py);
      ctx.closePath();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(p000.px, p000.py); ctx.lineTo(p001.px, p001.py);
      ctx.moveTo(p100.px, p100.py); ctx.lineTo(p101.px, p101.py);
      ctx.moveTo(p110.px, p110.py); ctx.lineTo(p111.px, p111.py);
      ctx.moveTo(p010.px, p010.py); ctx.lineTo(p011.px, p011.py);
      ctx.stroke();

      // Glowing corner vertices
      ctx.fillStyle = '#ffffff';
      [p000, p100, p110, p010, p001, p101, p111, p011].forEach(pt => {
        ctx.beginPath();
        ctx.arc(pt.px, pt.py, 2.5, 0, Math.PI * 2);
        ctx.fill();
      });

      // D.2 Secondary Extendable Board (2단 확장 결합 상판)
      if (dims.hasSecondaryBoard) {
        const leaf2Rad = ((dims.leaf2Angle !== undefined ? dims.leaf2Angle : 180) * Math.PI) / 180;
        const alpha2 = foldRad + (Math.PI - leaf2Rad);

        function getBoard2Corner(lx, lz, ly) {
          const hinge2_Y = dims.depth * Math.cos(foldRad);
          const hinge2_Z = wallZ + dims.depth * Math.sin(foldRad);

          const py = hinge2_Y + lz * Math.cos(alpha2) + ly * Math.sin(alpha2);
          const pz = hinge2_Z + lz * Math.sin(alpha2) - ly * Math.cos(alpha2);
          return project3D(lx, py, pz, cx, cy);
        }

        const b2_000 = getBoard2Corner(-halfW, 0, 0);
        const b2_100 = getBoard2Corner(halfW, 0, 0);
        const b2_110 = getBoard2Corner(halfW, dims.depth, 0);
        const b2_010 = getBoard2Corner(-halfW, dims.depth, 0);

        const b2_001 = getBoard2Corner(-halfW, 0, th);
        const b2_101 = getBoard2Corner(halfW, 0, th);
        const b2_111 = getBoard2Corner(halfW, dims.depth, th);
        const b2_011 = getBoard2Corner(-halfW, dims.depth, th);

        // Draw Board 2 Top Face (Glowing Amber / Gold)
        ctx.fillStyle = 'rgba(255, 215, 0, 0.16)';
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 2.2;
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur = 9;

        ctx.beginPath();
        ctx.moveTo(b2_000.px, b2_000.py);
        ctx.lineTo(b2_100.px, b2_100.py);
        ctx.lineTo(b2_110.px, b2_110.py);
        ctx.lineTo(b2_010.px, b2_010.py);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Draw Board 2 Edges
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(b2_001.px, b2_001.py);
        ctx.lineTo(b2_101.px, b2_101.py);
        ctx.lineTo(b2_111.px, b2_111.py);
        ctx.lineTo(b2_011.px, b2_011.py);
        ctx.closePath();
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(b2_000.px, b2_000.py); ctx.lineTo(b2_001.px, b2_001.py);
        ctx.moveTo(b2_100.px, b2_100.py); ctx.lineTo(b2_101.px, b2_101.py);
        ctx.moveTo(b2_110.px, b2_110.py); ctx.lineTo(b2_111.px, b2_111.py);
        ctx.moveTo(b2_010.px, b2_010.py); ctx.lineTo(b2_011.px, b2_011.py);
        ctx.stroke();

        // Piano Hinge Dotted Seam Line
        ctx.strokeStyle = '#ffffff';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(b2_000.px, b2_000.py);
        ctx.lineTo(b2_100.px, b2_100.py);
        ctx.stroke();
        ctx.setLineDash([]);

        // Vertices for Board 2
        ctx.fillStyle = '#ffd700';
        [b2_110, b2_010, b2_111, b2_011].forEach(pt => {
          ctx.beginPath();
          ctx.arc(pt.px, pt.py, 2.8, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      // E. Heavy-Duty Hydraulic Damper Struts (Solid Cylinder Body + Chrome Rod)
      ctx.shadowBlur = 4;
      const strutMounts = [-halfW * 0.6, halfW * 0.6];
      strutMounts.forEach(sx => {
        const wallAnchor = project3D(sx, 220, wallZ, cx, cy);
        const tableAnchor = getBoardCorner(sx, dims.depth * 0.65, th);

        // Cylinder Body (Thick Gold Tube)
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 4.5;
        ctx.beginPath();
        ctx.moveTo(wallAnchor.px, wallAnchor.py);
        const midX = (wallAnchor.px * 0.45 + tableAnchor.px * 0.55);
        const midY = (wallAnchor.py * 0.45 + tableAnchor.py * 0.55);
        ctx.lineTo(midX, midY);
        ctx.stroke();

        // Chrome Piston Rod (Silver)
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(midX, midY);
        ctx.lineTo(tableAnchor.px, tableAnchor.py);
        ctx.stroke();

        // Ball Joints
        ctx.fillStyle = '#00f0ff';
        ctx.beginPath();
        ctx.arc(wallAnchor.px, wallAnchor.py, 3.5, 0, Math.PI * 2);
        ctx.arc(tableAnchor.px, tableAnchor.py, 3.5, 0, Math.PI * 2);
        ctx.fill();
      });

      // E.2 Kinematic Folding Support Legs with Leveler Glides (바닥 지지 접이식 다리)
      const legOffsets = [-halfW * 0.78, halfW * 0.78];
      const legZPos = dims.depth * 0.88;
      const legLength = dims.height - th;
      const legRot = foldRad - Math.PI / 2;

      legOffsets.forEach(lx => {
        const legTop = getBoardCorner(lx, legZPos, th);
        const legFoot_Y = (legZPos * Math.cos(foldRad)) + (legLength * Math.cos(legRot));
        const legFoot_Z = wallZ + (legZPos * Math.sin(foldRad)) + (legLength * Math.sin(legRot));
        const legFoot = project3D(lx, legFoot_Y, legFoot_Z, cx, cy);

        // Solid Leg Tube
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(legTop.px, legTop.py);
        ctx.lineTo(legFoot.px, legFoot.py);
        ctx.stroke();

        // Ground Leveler Glide
        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        ctx.arc(legFoot.px, legFoot.py, 4.5, 0, Math.PI * 2);
        ctx.fill();

        // Top Hinge Joint
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(legTop.px, legTop.py, 3, 0, Math.PI * 2);
        ctx.fill();
      });

      // F. Dimension Annotations
      ctx.shadowBlur = 0;
      ctx.font = 'bold 11px Orbitron, sans-serif';
      ctx.fillStyle = '#00f0ff';

      const midFrontX = (p010.px + p110.px) / 2;
      const midFrontY = (p010.py + p110.py) / 2 - 10;
      ctx.fillText(`W: ${dims.width}mm`, midFrontX - 32, midFrontY);

      const midSideX = (p100.px + p110.px) / 2 + 10;
      const midSideY = (p100.py + p110.py) / 2;
      ctx.fillText(`D: ${dims.depth}mm`, midSideX, midSideY);

      animFrameId = requestAnimationFrame(render3DCAD);
    }

    render3DCAD();
    return container;
  }

  // 대화 피드 내 인라인 3D 홀로그램 CAD 카드
  function appendBlueprintMessage(widget) {
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble jarvis-msg jarvis-blueprint-bubble';
    bubble.style.maxWidth = '520px';
    bubble.style.border = '1px solid rgba(0, 240, 255, 0.75)';
    bubble.style.boxShadow = '0 0 25px rgba(0, 240, 255, 0.35)';
    bubble.style.background = 'linear-gradient(135deg, rgba(6, 16, 36, 0.96), rgba(3, 10, 24, 0.98))';
    bubble.style.borderRadius = '10px';
    bubble.style.padding = '14px 16px';
    bubble.style.position = 'relative';

    const cadEl = createBlueprintCADElement(widget, true);
    bubble.appendChild(cadEl);

    messagesFeed.appendChild(bubble);
    messagesFeed.scrollTop = messagesFeed.scrollHeight;

    // Automatically pop open the dedicated high-res CAD Studio Window
    try {
      openCADStudioWindow(widget);
    } catch (e) {
      console.warn('Auto window open error:', e);
    }
  }

  // 5. Chat & Process Input (With De-duplication Guard)
  let lastProcessedQuery = '';
  let lastProcessedTime = 0;
  let isSubmittingQuery = false;

  window.handleUserSubmit = handleUserSubmit;

  async function handleUserSubmit(rawQuery) {
    window.handleUserSubmit = handleUserSubmit;
    if (currentUIMode === 'STANDBY') {
      setUIMode('MINI_CIRCLE');
    }

    const query = (rawQuery || textInput.value).trim();
    if (!query) return;

    const now = Date.now();
    // Block duplicate submissions within 2.5s window
    if (query === lastProcessedQuery && (now - lastProcessedTime < 2500)) {
      console.log('[USER SUBMIT BLOCKED] Duplicate query ignored:', query);
      return;
    }
    if (isSubmittingQuery) {
      console.log('[USER SUBMIT BLOCKED] Another query in flight:', query);
      return;
    }

    isSubmittingQuery = true;
    lastProcessedQuery = query;
    lastProcessedTime = now;

    textInput.value = '';

    // URL 열기 명령일 가능성이 있는 경우 브라우저 팝업 차단 방지를 위해 즉시 창을 사전 오픈
    let preOpenedWindow = null;
    const isInternalCommand = /(?:노래|음악|곡|뮤직|신나는|잔잔한|플레이리스트|오디오).*틀어/i.test(query) || /볼륨|소리|음량|음소거|뮤트/i.test(query);
    const mayOpenUrl = !isInternalCommand && /(?:뉴스\s*창|기사\s*창|웹사이트|사이트|링크|열어|켜|들어가|접속|검색)/i.test(query) && /(?:네이버|구글|유튜브|나무위키|넷플릭스|치지직|트위치|인스타|쿠팡|x\.com|github)/i.test(query);
    if (mayOpenUrl) {
      try {
        preOpenedWindow = window.open('about:blank', '_blank');
      } catch (e) {
        preOpenedWindow = null;
      }
    }

    // Render User Bubble
    appendMessage('USER', query, 'user-msg');

    // UI Status
    statusText.textContent = 'PROCESSING DIRECTIVE...';
    coreStateText.textContent = 'THINK';

    try {
      let result;
      if (window.jarvisAPI) {
        result = await window.jarvisAPI.processInput(query);
      } else if (window.jarvisNative && window.jarvisNative.isAvailable) {
        const raw = query.trim();

        // 자연어 정밀 파싱 헬퍼 함수
        function cleanSongQuery(q) {
          let s = (q || '').trim();
          s = s.replace(/^(?:어|야|헤이|하이|오케이|응|아니|아)\s+(?:자비스|자비슨|자비스야|자비스님)?\s*/i, '');
          s = s.replace(/^(?:자비스|자비슨|자비스야|자비스님)\s*/i, '');
          s = s.replace(/(?:삼성\s*뮤직|삼성음악|유튜브\s*뮤직|유투브\s*뮤직|유튜브|유투브|내\s*폰|스마트폰|핸드폰|폰|기기|저장소)(?:으로|로|에서|에)?\s*/gi, '');
          s = s.replace(/(?:플레이리스트|플리)\s*(?:목록\s*)?(?:안에\s*있는|안의|안에|에서|에\s*있는|에|의)?\s*/gi, '');
          s = s.replace(/(?:다운로드\s*된|다운\s*받은|다운\s*된|저장\s*된|들어\s*있는|저장되어\s*있는|다운되어\s*있는|있는)\s*(?:노래|음악|곡|음원|파일)?\s*(?:중에서|중에|중)?\s*/gi, '');
          s = s.replace(/(?:노래|음악|곡|음원|파일)\s*(?:중에서|중에|중)\s*/gi, '');
          s = s.replace(/(?:틀어\s*달라그러면|틀어\s*달라고|틀어\s*달라|틀어\s*줄래|틀어\s*줘봐|틀어\s*줘|틀어\s*봐|틀어|재생\s*해줄래|재생\s*해줘|재생\s*해|재생|켜\s*줄래|켜\s*줘|켜|실행\s*해줄래|실행\s*해줘|실행|검색\s*해줘|검색|찾아\s*줄래|찾아\s*줘|찾아\s*봐|찾아|들려\s*줄래|들려\s*줘|보여\s*줘|확인\s*해줘|있어\??|있니\??|있나\??|있음\??|들어있어\??)/gi, '');
          s = s.replace(/(?:^|\s+)(?:좀|한번|저기|혹시|얼른)(?:\s+|$)/gi, ' ');
          s = s.replace(/(?:이란|이라는|라는|란|의)?\s*(?:노래|음악|곡|음원|파일)(?:을|를)?\s*$/gi, '');
          s = s.replace(/(?:을|를)\s*$/g, '');
          let cleaned = s.trim();
          if (/^(?:곡|노래|음악|파일|음원|것)$/.test(cleaned)) return '';
          return cleaned;
        }

        function cleanCallTarget(q) {
          let s = (q || '').trim();
          s = s.replace(/^(?:어|야|헤이|하이|오케이|응|아니|아)\s+(?:자비스|자비슨|자비스야|자비스님)?\s*/i, '');
          s = s.replace(/^(?:자비스|자비슨|자비스야|자비스님)\s*/i, '');
          const phone = s.match(/01[016789][- ]?\d{3,4}[- ]?\d{4}/);
          if (phone) return phone[0];
          s = s.replace(/(?:에게|한테|로)?\s*(?:전화|통화)\s*(?:걸어\s*달라니까|걸어\s*달라고|걸어\s*달라|걸어\s*줘|걸어\s*봐|걸어|해\s*달라니까|해\s*달라고|해\s*달라|해\s*줘|해|연결\s*해줘|연결|발신\s*해줘|발신)/gi, '');
          s = s.replace(/(?:전화|통화)\s*(?:걸어\s*달라니까|걸어\s*달라고|걸어\s*달라|걸어\s*줘|걸어\s*봐|걸어|해\s*달라니까|해\s*달라고|해\s*달라|해\s*줘|해|연결\s*해줘|연결|발신\s*해줘|발신)\s*(?:에게|한테|로)?/gi, '');
          s = s.replace(/(?:에게|한테|로)\s*$/g, '');
          s = s.replace(/(?:^|\s+)(?:좀|한번|빨리|지금|얼른|줘|라니까|니까|라고|했잖아)\s*$/gi, '');
          s = s.trim();
          if (/^(?:니까|라니까|라고|왜|뭐|이상하게|그냥)$/.test(s)) return '';
          return s;
        }

        // 0. 웨이크워드("자비스", "야 자비스" 등) 및 불필요한 감탄사 선제거
        const cleanQuery = raw
          .replace(/^(?:어|야|헤이|하이|오케이|응|아니|아)\s+(?:자비스|자비슨|자비스야|자비스님)?\s*/i, '')
          .replace(/^(?:자비스|자비슨|자비스야|자비스님)\s*/i, '')
          .replace(/(?:자비스|자비스야|자비스님)$/i, '')
          .trim();

        // 1. 음원 존재 여부 확인 질의 ("~노래 있어?", "~디버그 있니?", "~신호등 들어있어?")
        const isCheckQuestion = /(?:있어|있니|있나|존재해|들어있어|다운받아져|있음)\b|\?$/.test(cleanQuery) && /(?:노래|음악|곡|음원|뮤직|파일|플레이리스트|플리)/.test(cleanQuery);
        if (isCheckQuestion) {
          const song = cleanSongQuery(cleanQuery);
          const checkRes = await window.jarvisNative.checkSongExists(song);
          if (checkRes && checkRes.exists) {
            result = {
              reply: `네 개발자님, 기기 저장소에 '${checkRes.title}' 음원이 확인되었습니다. 바로 재생해 드릴까요?`,
              actionType: 'CHAT'
            };
          } else {
            result = {
              reply: `개발자님, 기기 내 다운로드된 음원 중에는 '${song || cleanQuery}' 곡이 존재하지 않습니다. 유튜브 뮤직이나 스트리밍에서 찾아드릴까요?`,
              actionType: 'CHAT'
            };
          }
        }
        // 2. 플레이리스트 재생 또는 플레이리스트 내 특정 곡 재생
        else if (/(?:플레이리스트|플리|드라이브|노래방|ㄴㅎㅇ|믹싱본|멜로)/i.test(cleanQuery) && /(?:틀|재생|켜|들려|찾|줄래|해줘|곡|노래|음악|안에|2|4)/i.test(cleanQuery)) {
          let playlistName = "";
          const plMatch = cleanQuery.match(/(?:드라이브용\s*(?:-\s*기분이좋음|-\s*신남\+힐링|셀프|kpop|\d+)?|노래방|ㄴㅎㅇ|믹싱본|멜로)/i);
          if (plMatch) {
            playlistName = plMatch[0].trim();
          } else if (/드라이브/i.test(cleanQuery)) {
            playlistName = "드라이브용 2";
          }

          let songName = "";
          const insideMatch = cleanQuery.match(/(?:안에\s*있는|안의|안에|에서|에\s*있는|에)\s*([^틀재켜들찾줄해]+?)(?:을|를)?\s*(?:틀|재생|켜|들려|찾|줄래|해줘)/i);
          if (insideMatch && insideMatch[1].trim()) {
            songName = cleanSongQuery(insideMatch[1].trim());
          }

          if (songName) {
            // 특정 곡 요청 (예: "드라이브용 2 안에 디버그 틀어줘")
            const musicRes = await window.jarvisNative.playMusic(songName, "samsung");
            result = {
              reply: "음악을 재생합니다.",
              actionType: 'MEDIA',
              action: { type: 'MEDIA', query: songName, executed: true }
            };
          } else {
            // 플레이리스트 요청 (예: "드라이브용 2 틀어줘", "플레이리스트 틀어줘")
            const targetPl = playlistName || "드라이브용 2";
            const musicRes = await window.jarvisNative.playMusic(targetPl, "samsung_playlist");
            result = {
              reply: "음악을 재생합니다.",
              actionType: 'MEDIA',
              action: { type: 'MEDIA', query: targetPl, executed: true }
            };
          }
        }
        // 3. 하드웨어 스토리지 / 부재중 전화 / 카톡 제어
        else if (/용량|스토리지|저장공간|큰\s*파일/.test(cleanQuery)) {
          const st = await window.jarvisNative.getStorageOverview();
          let msg = `전체 저장공간은 ${st.totalGB}이며, 현재 ${st.usedGB}(${st.percentUsed}%)를 사용 중이고 남은 공간은 ${st.freeGB}입니다.`;
          if (st.largestFiles && st.largestFiles.length > 0) {
            msg += ` 가장 큰 파일은 "${st.largestFiles[0].name}" (${st.largestFiles[0].sizeMB})입니다.`;
          }
          result = { reply: msg, actionType: 'CHAT' };
        } else if (/부재중|전화\s*(누구|왔|확인)/.test(cleanQuery)) {
          const calls = await window.jarvisNative.getMissedCalls();
          if (calls.success && calls.count > 0) {
            const first = calls.calls[0];
            result = { reply: `최근 부재중 전화가 ${calls.count}건 있습니다. 가장 최근 기록은 ${first.time}에 ${first.caller} 님에게서 온 부재중 전화입니다.`, actionType: 'CHAT' };
          } else {
            result = { reply: "최근 부재중 전화 기록이 없거나 확인되지 않았습니다.", actionType: 'CHAT' };
          }
        } else if (/카카오톡|카톡/.test(cleanQuery) && /켜|열|실행|틀어/.test(cleanQuery)) {
          await window.jarvisNative.openApp("com.kakao.talk");
          result = { reply: "카카오톡을 즉시 실행했습니다.", actionType: 'OPEN_APP', action: { type: 'OPEN_APP', package: 'com.kakao.talk' } };
        }
        // 3-1. 전화 걸기 ("~에게 전화 걸어줘", "~한테 전화해", "전화 걸어줘 ~", "010... 전화해")
        else if (/(?:전화|통화)/.test(cleanQuery) && /(?:걸|해|연결|발신)/.test(cleanQuery)) {
          const target = cleanCallTarget(cleanQuery);

          if (target) {
            const callRes = await window.jarvisNative.makePhoneCall(target);
            if (callRes && callRes.success) {
              const displayName = callRes.name || target;
              result = { reply: `개발자님, ${displayName} 님에게 전화를 즉시 연결합니다.`, actionType: 'CALL', action: { type: 'CALL', target } };
            } else {
              result = { reply: `개발자님, 연락처에서 '${target}' 님을 찾지 못했습니다. 정확한 이름이나 전화번호를 말씀해 주십시오.`, actionType: 'CALL' };
            }
          } else {
            result = { reply: "누구에게 전화를 걸지 이름을 말씀해 주십시오.", actionType: 'CHAT' };
          }
        }
        // 3-2. 문자(SMS) 보내기 ("~에게 ~라고 문자 보내줘", "~한테 ~ 문자 전송")
        else if (/(?:문자|메시지|메세지|sms)/i.test(cleanQuery) && /(?:보내|전송|발송)/.test(cleanQuery)) {
          const smsMatch = cleanQuery.match(/(.+?)(?:에게|한테|로)\s+(?:'|")?(.+?)(?:'|")?\s*(?:라고|이라는|라는)?\s*(?:문자|메시지|메세지|sms)?\s*(?:보내\s*줘|보내|전송\s*해줘|전송|발송\s*해줘|발송)/i);
          let target = smsMatch ? cleanCallTarget(smsMatch[1]) : '';
          let message = smsMatch ? smsMatch[2].trim() : '';

          if (!target) {
            let clean = cleanQuery.replace(/(?:문자|메시지|메세지|sms)\s*(?:보내\s*줘|보내|전송\s*해줘|전송|발송\s*해줘|발송)/gi, '').trim();
            target = cleanCallTarget(clean);
            message = "안녕하세요";
          }

          if (target) {
            const smsRes = await window.jarvisNative.sendSms(target, message || "자비스 자동 메시지입니다.");
            if (smsRes && smsRes.success) {
              const displayName = smsRes.name || target;
              result = { reply: `개발자님, ${displayName} 님에게 메시지를 전송했습니다: "${message}"`, actionType: 'SMS', action: { type: 'SMS', target, message } };
            } else {
              result = { reply: `개발자님, '${target}' 님에게 문자 전송 중 오류가 발생했습니다.`, actionType: 'SMS' };
            }
          } else {
            result = { reply: "누구에게 어떤 문자를 보낼지 말씀해 주십시오.", actionType: 'CHAT' };
          }
        }
        // 3-3. 디바이스 볼륨 조절 ("소리 줄여줘", "볼륨 낮춰줘", "소리 키워줘")
        else if (/(?:볼륨|소리|음량)/.test(cleanQuery) && /(?:낮|줄|내|키|높|올|음소거|꺼)/.test(cleanQuery)) {
          let dir = 'down';
          if (/(?:키|높|올)/.test(cleanQuery)) dir = 'up';
          else if (/(?:음소거|꺼)/.test(cleanQuery)) dir = 'mute';
          await window.jarvisNative.adjustDeviceVolume(dir);
          result = { reply: `기기 미디어 볼륨을 ${dir === 'up' ? '높였습니다' : dir === 'mute' ? '음소거했습니다' : '낮췄습니다'}.`, actionType: 'CONTROL_VOLUME' };
        }
        // 4. 유튜브 뮤직 전용
        else if (/(?:유튜브\s*뮤직|유투브\s*뮤직|ytmusic)/i.test(cleanQuery) && /(?:틀|재생|켜|실행|찾|검색|들려)/.test(cleanQuery)) {
          const songName = cleanSongQuery(cleanQuery);
          await window.jarvisNative.playMusic(songName || "", "youtube_music");
          result = {
            reply: songName ? `유튜브 뮤직에서 '${songName}'을 재생합니다.` : "유튜브 뮤직을 실행했습니다.",
            actionType: 'MEDIA',
            action: { type: 'MEDIA', query: songName, executed: true }
          };
        }
        // 5. 유튜브 영상 전용
        else if (/(?:유튜브|유투브)/i.test(cleanQuery) && /(?:틀|재생|켜|실행|찾|검색|보여|들려)/.test(cleanQuery)) {
          let keyword = cleanQuery
            .replace(/(?:유튜브|유투브)(?:로|에서|에)?/gi, '')
            .replace(/(?:동영상|영상|뮤비|클립|노래|음악)/gi, '')
            .replace(/(?:틀어\s*줘|틀어\s*봐|틀어|재생\s*해줘|재생\s*해|재생|켜\s*줘|켜|실행\s*해줘|실행|검색\s*해줘|검색|찾아\s*줘|찾아\s*봐|찾아|보여\s*줘|보여|들려\s*줘)/gi, '')
            .replace(/(?:을|를)$/, '')
            .trim();
          await window.jarvisNative.playMusic(keyword || "", "youtube");
          result = {
            reply: keyword ? `유튜브에서 '${keyword}'을 찾아 실행합니다.` : "유튜브를 실행했습니다.",
            actionType: 'MEDIA',
            action: { type: 'MEDIA', query: keyword, executed: true }
          };
        }
        // 6. 삼성뮤직 / 기기 음원 고속 직결 Fast-Path ("디버그 틀어줘", "노래 틀어줘", "드라이브 틀어", "재생해줘" 등)
        else if (/(?:틀어\s*달라|틀어\s*줘|틀어\s*봐|틀어|재생\s*해줄래|재생\s*해줘|재생\s*해|재생|들려\s*줄래|들려\s*줘|들려)/.test(cleanQuery) && !/(?:동영상|영상|뮤비|유튜브|유투브|앱|창|카톡|문자|전화|메시지|메세지|콜)/.test(cleanQuery)) {
          let songName = cleanSongQuery(cleanQuery);
          let targetPl = "";

          if (/(?:플레이리스트|플리|드라이브|노래방|ㄴㅎㅇ|믹싱본|멜로)/i.test(cleanQuery)) {
            const plMatch = cleanQuery.match(/(?:드라이브용\s*(?:-\s*기분이좋음|-\s*신남\+힐링|셀프|kpop|\d+)?|노래방|ㄴㅎㅇ|믹싱본|멜로)/i);
            targetPl = plMatch ? plMatch[0].trim() : "드라이브용 2";
          }

          if (targetPl && !songName) {
            const musicRes = await window.jarvisNative.playMusic(targetPl, "samsung_playlist");
            result = {
              reply: "음악을 재생합니다.",
              actionType: 'MEDIA',
              action: { type: 'MEDIA', query: targetPl, executed: true }
            };
          } else {
            const targetSong = songName || "드라이브용 2";
            const platformType = !songName ? "samsung_playlist" : "samsung";
            const musicRes = await window.jarvisNative.playMusic(targetSong, platformType);
            result = {
              reply: "음악을 재생합니다.",
              actionType: 'MEDIA',
              action: { type: 'MEDIA', query: targetSong, executed: true }
            };
          }
        }
        // 8. 그 외 모든 자연어 대화/질문 -> 자비스 AI 브레인으로 정상 직결
        else {
          try {
            const res = await fetch('/api/process', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: query })
            });
            result = await res.json();
          } catch (fetchErr) {
            console.warn('Backend fetch failed, using fallback:', fetchErr);
            result = mockProcessInput(query);
          }
        }
      } else {
        try {
          const res = await fetch('/api/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: query })
          });
          result = await res.json();
        } catch (fetchErr) {
          console.warn('Backend fetch failed, using fallback:', fetchErr);
          result = mockProcessInput(query);
        }
      }

      // Update Sync Mood & State Bar
      updateSyncBar(result.moodState, result.userProfile);

      // Render Jarvis Bubble
      appendMessage('J.A.R.V.I.S.', result.reply, 'jarvis-msg');
      if (miniStatusText) miniStatusText.textContent = '🔊 자비스 응답 중...';
      if (miniCaptionBox) {
        miniCaptionBox.style.display = 'block';
        miniCaptionSpeaker.textContent = 'J.A.R.V.I.S.:';
        miniCaptionText.textContent = result.reply;
      }

      // If real PC command was executed, show HUD system notification with direct link button
      if (result.executedAction && result.executedAction.success) {
        const urlToOpen = (result.action && result.action.type === 'OPEN_URL') ? result.action.target : null;
        appendActionNotification(result.executedAction.description, urlToOpen);
      }

      // If OPEN_URL action: 시뮬레이션/앱은 독립 윈도우 창으로, 웹 링크는 새 탭으로 안전하게 오픈!
      const openTargetUrl = result.action ? (result.action.target || result.action.url) : null;
      if (result.action && result.action.type === 'OPEN_URL' && openTargetUrl) {
        const isSimulation = result.action.isSimulation ||
                             result.actionType === 'AGENT_GENERATE_APP' ||
                             openTargetUrl.includes('/generated/') ||
                             openTargetUrl.includes('cad-studio.html');

        if (isSimulation) {
          if (preOpenedWindow && !preOpenedWindow.closed) {
            preOpenedWindow.close();
          }
          const winTitle = result.action.title || 'J.A.R.V.I.S. 시뮬레이션 & 생성 스튜디오';
          openSimulationAppWindow(openTargetUrl, winTitle);
          showNewTabNotification(openTargetUrl, `🚀 [독립 창 실행] ${winTitle}을(를) 독립 윈도우 창으로 실행했습니다.`);
        } else {
          // 일렉트론 환경: 사용자의 기본 크롬 브라우저(로그인/구독/쿠키 유지)로 즉시 실행!
          if (window.jarvisAPI && window.jarvisAPI.openExternal) {
            if (preOpenedWindow && !preOpenedWindow.closed) preOpenedWindow.close();
            window.jarvisAPI.openExternal(openTargetUrl);
          } else {
            let openedTab = false;
            try {
              if (preOpenedWindow && !preOpenedWindow.closed) {
                preOpenedWindow.location.href = openTargetUrl;
                openedTab = true;
              } else {
                const win = window.open(openTargetUrl, '_blank');
                if (win && !win.closed && typeof win.closed !== 'undefined') {
                  openedTab = true;
                }
              }
            } catch (e) {
              openedTab = false;
            }
          }

          // 토스트 알림으로 새 탭 연결 사실을 명확히 알림 (자비스 화면 영구 보존)
          showNewTabNotification(openTargetUrl, result.reply);
        }
      } else if (preOpenedWindow && !preOpenedWindow.closed) {
        preOpenedWindow.close(); // URL 명령이 아니었으면 사전 오픈했던 빈 창 닫기
      }

      // Handle Volume Adjustment directive (상대 볼륨 및 절대 볼륨 정밀 반영)
      if (result.actionType === 'CONTROL_VOLUME' && result.action && result.action.target) {
        const tgt = result.action.target.toString().trim();
        if (tgt.startsWith('-')) {
          const delta = parseInt(tgt, 10);
          setMediaVolume(currentMediaVolume + delta); // e.g. 80 + (-10) = 70%
        } else if (tgt.startsWith('+')) {
          const delta = parseInt(tgt, 10);
          setMediaVolume(currentMediaVolume + delta);
        } else if (/mute|음소거/i.test(tgt)) {
          setMediaVolume(0);
        } else if (/down|줄여|낮춰|작게/i.test(tgt)) {
          const numMatch = tgt.match(/\d+/);
          const amt = numMatch ? parseInt(numMatch[0], 10) : 10;
          setMediaVolume(currentMediaVolume - amt);
        } else if (/up|키워|올려|높여|크게/i.test(tgt)) {
          const numMatch = tgt.match(/\d+/);
          const amt = numMatch ? parseInt(numMatch[0], 10) : 10;
          setMediaVolume(currentMediaVolume + amt);
        } else {
          const numMatch = tgt.match(/\d+/);
          if (numMatch) {
            setMediaVolume(parseInt(numMatch[0], 10));
          }
        }
      }

      // Handle Native CALL / SMS / APP / MEDIA / VOLUME action returned from backend brain
      if (result.actionType === 'CALL' && result.action && result.action.target) {
        if (window.jarvisNative && window.jarvisNative.isAvailable) {
          window.jarvisNative.makePhoneCall(result.action.target);
        }
      } else if (result.actionType === 'SMS' && result.action && result.action.target) {
        if (window.jarvisNative && window.jarvisNative.isAvailable) {
          window.jarvisNative.sendSms(result.action.target, result.action.message || "자비스 자동 메시지입니다.");
        }
      } else if (result.actionType === 'OPEN_APP' && result.action && result.action.package) {
        if (window.jarvisNative && window.jarvisNative.isAvailable) {
          window.jarvisNative.openApp(result.action.package);
        }
      } else if ((result.actionType === 'MEDIA' || result.actionType === 'SAMSUNG_MUSIC') && result.action && !result.action.executed) {
        if (window.jarvisNative && window.jarvisNative.isAvailable) {
          window.jarvisNative.playMusic(result.action.query || '', result.action.platform || 'samsung');
        }
      } else if (result.actionType === 'WINDOW_CONTROL' && result.action) {
        if (window.jarvisAPI) {
          if (result.action.command === 'close' || result.action.command === 'hide') {
            window.jarvisAPI.close();
          } else {
            window.jarvisAPI.minimize();
          }
        }
      } else if (result.actionType === 'CONTROL_VOLUME' && result.action && result.action.target) {
        if (window.jarvisNative && window.jarvisNative.isAvailable) {
          let dir = 'down';
          const t = String(result.action.target).toLowerCase();
          if (t.includes('up') || t.includes('+') || t.includes('키워') || t.includes('올려') || t.includes('높여')) dir = 'up';
          else if (t.includes('mute') || t.includes('음소거') || t.includes('꺼')) dir = 'mute';
          window.jarvisNative.adjustDeviceVolume(dir);
        }
      }

      // Speak Response
      speakResponse(result.reply);

      // If reply indicates session end ("대화를 종료합니다.")
      if (result.reply && result.reply.includes('대화를 종료합니다')) {
        setTimeout(() => {
          endSession(false);
          setUIMode('STANDBY');
        }, 800);
      }

      // Handle UI mode transition from actionType
      if (result.actionType === 'OPEN_DASHBOARD') {
        setUIMode('FULL_DASHBOARD');
      } else if (result.actionType === 'CLOSE_DASHBOARD') {
        isDashboardOpen = false;
        setUIMode('MINI_CIRCLE');
      }

      // Stop media player if requested
      if (result.actionType === 'STOP_MEDIA') {
        stopActiveMediaPlayer();
      }

      // Render Dynamic Widget if present (오직 단 1개의 플레이어만 렌더링하여 소리 중첩 원천 차단!)
      if (result.dynamicWidget) {
        if (result.dynamicWidget.type === 'MEDIA_PLAYER') {
          stopActiveMediaPlayer();
          if (isDashboardOpen) {
            renderDynamicWidget(result.dynamicWidget);
          } else {
            appendMediaMessage(result.dynamicWidget);
          }
        } else if (result.dynamicWidget.type === 'RESEARCH_REPORT') {
          if (isDashboardOpen) {
            renderDynamicWidget(result.dynamicWidget);
          } else {
            appendResearchMessage(result.dynamicWidget);
          }
        } else if (result.dynamicWidget.type === 'BLUEPRINT_CAD') {
          if (isDashboardOpen) {
            renderDynamicWidget(result.dynamicWidget);
          } else {
            appendBlueprintMessage(result.dynamicWidget);
          }
        } else if (result.dynamicWidget.type === 'FILE_AGENT_VIEW') {
          if (isDashboardOpen) {
            renderDynamicWidget(result.dynamicWidget);
          } else {
            appendAgentMessage(result.dynamicWidget);
          }
        } else {
          renderDynamicWidget(result.dynamicWidget);
        }
      }

      // Handle OPEN_CAD_STUDIO & CLOSE_CAD_STUDIO actions
      if (result.actionType === 'OPEN_CAD_STUDIO' || (result.action && result.action.type === 'OPEN_CAD_STUDIO')) {
        openCADStudioWindow(result.dynamicWidget || (result.action && result.action.widget) || null);
      } else if (result.actionType === 'CLOSE_CAD_STUDIO' || (result.action && result.action.type === 'CLOSE_CAD_STUDIO')) {
        closeCADStudioWindow();
      }

    } catch (err) {
      console.error('Error processing directive:', err);
      appendMessage('J.A.R.V.I.S.', `오류가 발생했습니다: ${err.message}`, 'jarvis-msg');
      statusText.textContent = 'SYSTEM ONLINE: STANDBY';
      coreStateText.textContent = 'JARVIS';
    } finally {
      isSubmittingQuery = false;
    }
  }

  function appendMessage(sender, text, cssClass) {
    const bubble = document.createElement('div');
    bubble.className = `msg-bubble ${cssClass}`;

    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    meta.innerHTML = `<span class="agent-tag">${sender}</span> <span class="time-tag">${new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>`;

    const body = document.createElement('div');
    body.className = 'msg-text';
    body.textContent = text;

    bubble.appendChild(meta);
    bubble.appendChild(body);
    messagesFeed.appendChild(bubble);
    messagesFeed.scrollTop = messagesFeed.scrollHeight;
  }

  function updateSyncBar(moodState, profile) {
    if (moodState) {
      const energyNum = moodState.energy !== undefined ? moodState.energy : (moodState.energy_level !== undefined ? moodState.energy_level : 85);
      userMoodVal.textContent = moodState.mood || "안정적 (Calm & Ready)";
      userEnergyBar.style.width = `${energyNum}%`;
      userEnergyVal.textContent = `${energyNum}%`;

      if (energyNum < 40) {
        userEnergyBar.style.background = 'linear-gradient(90deg, #ff3b5c, #ffb800)';
      } else {
        userEnergyBar.style.background = 'linear-gradient(90deg, #00f0ff, #00ffaa)';
      }
    }

    if (profile && profile.personality) {
      currentProfile = profile;
      userStyleVal.textContent = profile.personality.preferred_style;
      memUserName.textContent = profile.user_name || '개발자님';
      memUserStyle.textContent = profile.personality.preferred_style;
      memConciseness.textContent = profile.personality.conciseness_level;

      if (profile.learned_habits) {
        memLearnedHabits.innerHTML = profile.learned_habits.map(h => `<li>${h}</li>`).join('');
      }

      if (profile.history_logs) {
        memLogs.innerHTML = profile.history_logs.slice(0, 5).map(log => 
          `<div>[${log.mood}] "${log.user.slice(0, 25)}" ➔ 응답 완료</div>`
        ).join('');
      }
    }
  }

  // 6. Dynamic On-Demand Widget Renderers
  function renderDynamicWidget(widget) {
    widgetEmptyState.style.display = 'none';

    const card = document.createElement('div');
    card.className = 'spawned-card';

    // Header
    const cardHeader = document.createElement('div');
    cardHeader.className = 'card-header';
    cardHeader.innerHTML = `
      <div class="card-title">${widget.title || 'ON-DEMAND COMPONENT'}</div>
      <div class="card-actions">
        <button class="card-btn btn-close-widget">✕</button>
      </div>
    `;

    cardHeader.querySelector('.btn-close-widget').addEventListener('click', () => {
      card.remove();
      if (dynamicWidgetMount.children.length === 0) {
        widgetEmptyState.style.display = 'block';
      }
    });

    card.appendChild(cardHeader);

    // Body based on type
    if (widget.type === 'TABLE') {
      renderTableContent(card, widget);
    } else if (widget.type === 'CHART') {
      renderChartContent(card, widget);
    } else if (widget.type === 'STICKY_NOTE') {
      renderStickyNoteContent(card, widget);
    } else if (widget.type === 'PC_DIAGNOSTICS') {
      renderPCDiagnosticsContent(card);
    } else if (widget.type === 'MEDIA_PLAYER') {
      card.classList.add('dynamic-media-card');
      renderMediaPlayerContent(card, widget);
    } else if (widget.type === 'RESEARCH_REPORT') {
      card.classList.add('dynamic-research-card');
      renderResearchReportContent(card, widget);
    } else if (widget.type === 'BLUEPRINT_CAD') {
      card.classList.add('dynamic-blueprint-card');
      renderBlueprintCADContent(card, widget);
    } else if (widget.type === 'FILE_AGENT_VIEW') {
      card.classList.add('dynamic-agent-card');
      renderFileAgentContent(card, widget);
    }

    // Insert as first element
    dynamicWidgetMount.prepend(card);
  }

  // G. Dynamic Holographic CAD Blueprint Card (Dashboard Mode)
  function renderBlueprintCADContent(card, widget) {
    const wrapper = document.createElement('div');
    wrapper.className = 'dynamic-blueprint-wrapper';
    wrapper.style.padding = '14px 16px';

    const cadEl = createBlueprintCADElement(widget, false);
    wrapper.appendChild(cadEl);
    card.appendChild(wrapper);
  }

  // F. Dynamic Autonomous Research Dossier Card (Dashboard Mode)
  function renderResearchReportContent(card, widget) {
    const wrapper = document.createElement('div');
    wrapper.className = 'dynamic-research-wrapper';
    wrapper.style.padding = '14px 16px';
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.gap = '12px';

    const findingsHtml = (widget.keyFindings || []).map((f, i) => `
      <li style="display:flex; align-items:flex-start; gap:8px; margin-bottom:6px; line-height:1.45;">
        <span style="display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px; border-radius:50%; background:rgba(0,240,255,0.25); border:1px solid #00f0ff; color:#00f0ff; font-size:10px; font-weight:bold; flex-shrink:0; margin-top:1px;">${i + 1}</span>
        <span style="color:#d5eafc; font-size:12.5px;">${f}</span>
      </li>
    `).join('');

    const sourcesHtml = (widget.sources && widget.sources.length > 0) ? `
      <div style="margin-top: 4px; padding-top: 10px; border-top: 1px dashed rgba(0, 240, 255, 0.25);">
        <div style="font-size: 11px; color: #7da5c4; font-family: var(--font-hud); margin-bottom: 8px; letter-spacing: 0.5px;">VERIFIED REAL-TIME SOURCES:</div>
        <div style="display:flex; flex-wrap:wrap; gap: 8px;">
          ${widget.sources.map(s => `
            <a href="${s.link}" target="_blank" class="research-source-chip" title="${s.title}" style="display:inline-flex; align-items:center; gap:6px; font-size:11px; padding:5px 10px; background:rgba(0, 240, 255, 0.09); border:1px solid rgba(0, 240, 255, 0.35); border-radius:4px; color:#00f0ff; text-decoration:none; transition:all 0.2s ease;">
              <span>🌐</span><span>${s.source}: ${s.title.length > 30 ? s.title.slice(0, 30) + '...' : s.title}</span> ↗
            </a>
          `).join('')}
        </div>
      </div>
    ` : '';

    wrapper.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(0,240,255,0.25); padding-bottom:8px;">
        <div style="font-size:16px; font-weight:bold; color:#fff; font-family:var(--font-hud); letter-spacing:0.5px; text-shadow:0 0 10px rgba(0,240,255,0.5);">
          ${widget.title || widget.query}
        </div>
        <span style="font-size:11px; color:#7da5c4; font-family:var(--font-hud);">${widget.timestamp || ''}</span>
      </div>

      <div style="background:rgba(0,240,255,0.08); border-left:3px solid #00f0ff; border-radius:4px; padding:10px 14px; font-size:13px; color:#e2f4ff; line-height:1.55;">
        ${widget.executiveSummary || '정보를 성공적으로 수집 및 종합 분석했습니다.'}
      </div>

      ${widget.keyFindings && widget.keyFindings.length > 0 ? `
        <div>
          <div style="font-size: 11px; font-weight: bold; color: #00ffaa; font-family: var(--font-hud); margin-bottom: 8px; letter-spacing: 0.8px;">
            KEY INTELLIGENCE FINDINGS
          </div>
          <ul style="list-style:none; padding:0; margin:0;">
            ${findingsHtml}
          </ul>
        </div>
      ` : ''}

      ${sourcesHtml}
    `;

    card.appendChild(wrapper);
  }

  // E. Dynamic Media / Audio Deck Player
  function renderMediaPlayerContent(card, widget) {
    const wrapper = document.createElement('div');
    wrapper.className = 'dynamic-media-wrapper';
    wrapper.style.padding = '12px';

    wrapper.innerHTML = `
      <div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 8px; border: 1px solid #00f0ff; box-shadow: 0 0 20px rgba(0,240,255,0.3); background:#000;">
        <iframe 
          src="${widget.embedUrl}" 
          style="position: absolute; top:0; left: 0; width: 100%; height: 100%; border:0;" 
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
          allowfullscreen>
        </iframe>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px;">
        <span style="color:#00ffaa; font-size:12px; font-weight:bold;">🎵 실시간 음악 스트리밍 중</span>
        <a href="${widget.watchUrl}" target="_blank" style="padding:5px 12px; background:rgba(0,240,255,0.2); border:1px solid #00f0ff; color:#00f0ff; border-radius:4px; font-size:12px; text-decoration:none; font-weight:bold; box-shadow:0 0 8px rgba(0,240,255,0.4);">유튜브 새 탭 전체화면 ↗</a>
      </div>
      <div style="display:flex; align-items:center; gap:10px; margin-top:10px; padding:6px 10px; background:rgba(0,240,255,0.06); border-radius:6px; border:1px solid rgba(0,240,255,0.2);">
        <span style="font-size:13px; color:#00f0ff;">🔉</span>
        <input type="range" class="jarvis-volume-slider" min="0" max="100" value="${currentMediaVolume}" style="flex:1; accent-color:#00f0ff; cursor:pointer;" oninput="window.setJarvisVolume(this.value)">
        <span class="jarvis-volume-val" style="color:#00f0ff; font-size:11px; font-weight:bold; min-width:32px;">${currentMediaVolume}%</span>
      </div>
    `;

    card.appendChild(wrapper);
  }

  // A. Dynamic Table Generator (Interactive Clickable Rows Supported)
  function renderTableContent(card, widget) {
    const wrapper = document.createElement('div');
    wrapper.className = 'dynamic-table-wrapper';

    const table = document.createElement('table');
    table.className = 'dynamic-table';

    // Header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    widget.columns.forEach(col => {
      const th = document.createElement('th');
      th.textContent = col;
      headerRow.appendChild(th);
    });
    if (widget.rowLinks && widget.rowLinks.length > 0) {
      const thOpen = document.createElement('th');
      thOpen.textContent = '열기';
      thOpen.style.width = '50px';
      thOpen.style.textAlign = 'center';
      headerRow.appendChild(thOpen);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Body
    const tbody = document.createElement('tbody');
    widget.rows.forEach((row, rowIdx) => {
      const tr = document.createElement('tr');
      const hasLink = widget.rowLinks && widget.rowLinks[rowIdx];

      if (hasLink) {
        tr.style.cursor = 'pointer';
        tr.title = '클릭하면 브라우저에서 기사를 즉시 엽니다';
        tr.classList.add('clickable-row');
        tr.addEventListener('click', async () => {
          const targetUrl = widget.rowLinks[rowIdx];
          try {
            await fetch('/api/process', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: `${rowIdx + 1}번째 기사 열어줘` })
            });
            appendActionNotification(`브라우저에서 ${rowIdx + 1}위 기사 열기: ${row[1] || targetUrl}`);
          } catch (e) {
            window.open(targetUrl, '_blank');
          }
        });
      }

      row.forEach(cell => {
        const td = document.createElement('td');
        td.textContent = cell;
        tr.appendChild(td);
      });

      if (widget.rowLinks && widget.rowLinks.length > 0) {
        const tdOpen = document.createElement('td');
        tdOpen.style.textAlign = 'center';
        tdOpen.innerHTML = hasLink ? '<span style="color:#00f0ff; font-weight:bold;">↗</span>' : '-';
        tr.appendChild(tdOpen);
      }

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrapper.appendChild(table);
    card.appendChild(wrapper);
  }

  // B. Dynamic Chart Generator (Canvas-based)
  function renderChartContent(card, widget) {
    const canvas = document.createElement('canvas');
    canvas.width = 460;
    canvas.height = 180;
    canvas.style.width = '100%';
    canvas.style.height = '180px';
    canvas.style.background = 'rgba(0, 0, 0, 0.2)';
    canvas.style.borderRadius = '6px';
    card.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    const labels = widget.labels || ['A', 'B', 'C', 'D'];
    const datasets = widget.datasets || [];

    // Simple rich custom canvas chart rendering
    if (widget.chartType === 'line') {
      drawLineChart(ctx, canvas.width, canvas.height, labels, datasets[0]);
    } else {
      drawBarChart(ctx, canvas.width, canvas.height, labels, datasets);
    }
  }

  function drawBarChart(ctx, w, h, labels, datasets) {
    ctx.clearRect(0, 0, w, h);
    const padding = 35;
    const chartW = w - padding * 2;
    const chartH = h - padding * 2;
    const numGroups = labels.length;
    const groupW = chartW / numGroups;
    const numDatasets = datasets.length;
    const barW = (groupW * 0.7) / numDatasets;

    // Draw grid
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(w - padding, y);
      ctx.stroke();
    }

    // Draw bars
    labels.forEach((label, gIdx) => {
      const groupX = padding + gIdx * groupW;

      datasets.forEach((ds, dIdx) => {
        const val = ds.data[gIdx] || 0;
        const barH = (val / 100) * chartH;
        const x = groupX + (groupW * 0.15) + dIdx * barW;
        const y = padding + chartH - barH;

        ctx.fillStyle = ds.backgroundColor || '#00f0ff';
        ctx.fillRect(x, y, barW - 4, barH);

        // Value text
        ctx.fillStyle = '#fff';
        ctx.font = '10px Orbitron';
        ctx.fillText(val, x + 2, y - 4);
      });

      // Label text
      ctx.fillStyle = '#7da5c4';
      ctx.font = '11px Noto Sans KR';
      ctx.fillText(label, groupX + (groupW * 0.1), h - 10);
    });
  }

  function drawLineChart(ctx, w, h, labels, dataset) {
    if (!dataset) return;
    ctx.clearRect(0, 0, w, h);
    const padding = 35;
    const chartW = w - padding * 2;
    const chartH = h - padding * 2;
    const stepX = chartW / (labels.length - 1);

    ctx.strokeStyle = 'rgba(0, 240, 255, 0.1)';
    for (let i = 0; i <= 4; i++) {
      const y = padding + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(w - padding, y);
      ctx.stroke();
    }

    ctx.strokeStyle = dataset.borderColor || '#00f0ff';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 10;
    ctx.beginPath();

    const points = [];
    labels.forEach((label, idx) => {
      const val = dataset.data[idx] || 0;
      const x = padding + idx * stepX;
      const y = padding + chartH - (val / 100) * chartH;
      points.push({ x, y, val });
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Draw dots
    points.forEach(pt => {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#00f0ff';
      ctx.font = '10px Orbitron';
      ctx.fillText(pt.val + '%', pt.x - 8, pt.y - 8);
    });
  }

  // C. Dynamic Sticky Note
  function renderStickyNoteContent(card, widget) {
    card.classList.add('sticky-note-card');

    const contentDiv = document.createElement('div');
    contentDiv.className = 'sticky-content';
    contentDiv.textContent = widget.content;
    card.appendChild(contentDiv);

    const footer = document.createElement('div');
    footer.className = 'sticky-footer';
    footer.innerHTML = `
      <span>🕒 생성 시각: ${widget.timestamp || '방금'}</span>
      <button class="btn-desktop-save">💾 바탕화면에 파일로 저장</button>
    `;

    const saveBtn = footer.querySelector('.btn-desktop-save');
    saveBtn.addEventListener('click', async () => {
      if (window.jarvisAPI) {
        saveBtn.textContent = '저장 중...';
        const fileRes = await window.jarvisAPI.saveFileToDesktop({
          filename: `JARVIS_메모_${Date.now()}.txt`,
          content: `[J.A.R.V.I.S. 대표님 메모]\n일시: ${new Date().toLocaleString('ko-KR')}\n\n${widget.content}`
        });
        if (fileRes.success) {
          saveBtn.textContent = '✅ 바탕화면 저장 완료!';
          saveBtn.style.background = '#00ffaa';
          saveBtn.style.color = '#000';
          setTimeout(() => {
            saveBtn.textContent = '💾 바탕화면에 파일로 저장';
            saveBtn.style.background = '';
            saveBtn.style.color = '';
          }, 3000);
        } else {
          saveBtn.textContent = '❌ 실패';
        }
      }
    });

    card.appendChild(footer);
  }

  // D. Real PC Hardware Diagnostics
  async function renderPCDiagnosticsContent(card) {
    const container = document.createElement('div');
    container.className = 'telemetry-grid';
    container.innerHTML = '<div style="color:var(--text-dim); padding:10px;">하드웨어 텔레메트리 데이터 수신 중...</div>';
    card.appendChild(container);

    if (window.jarvisAPI) {
      const stats = await window.jarvisAPI.getHardwareStats();
      if (stats.success) {
        container.innerHTML = `
          <div class="telemetry-box">
            <div class="label">CPU PROCESSOR</div>
            <div class="val">${stats.cpu.loadPct}% <span style="font-size:11px;font-weight:normal;">(${stats.cpu.cores} 코어)</span></div>
            <div style="font-size:10px; color:#7da5c4; margin-top:3px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${stats.cpu.model}</div>
          </div>
          <div class="telemetry-box">
            <div class="label">SYSTEM RAM USAGE</div>
            <div class="val">${stats.memory.usagePct}%</div>
            <div style="font-size:10px; color:#7da5c4; margin-top:3px;">사용 ${stats.memory.usedGB}GB / 전체 ${stats.memory.totalGB}GB</div>
          </div>
          <div class="telemetry-box">
            <div class="label">OPERATING SYSTEM</div>
            <div class="val" style="font-size:12px;">${stats.os.info}</div>
            <div style="font-size:10px; color:#7da5c4; margin-top:3px;">호스트: ${stats.os.hostname}</div>
          </div>
          <div class="telemetry-box">
            <div class="label">UPTIME (가동 시간)</div>
            <div class="val">${stats.os.uptimeHours} 시간</div>
            <div style="font-size:10px; color:#00ffaa; margin-top:3px;">전원 및 냉각 정상 작동 중</div>
          </div>
        `;
      }
    }
  }

  // 7. Event Listeners for Input
  btnSend.addEventListener('click', () => handleUserSubmit());
  textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleUserSubmit();
  });

  // Mini / Mobile Chat Bar Listeners
  const miniTextInput = document.getElementById('mini-text-input');
  const btnMiniSend = document.getElementById('btn-mini-send');
  if (btnMiniSend && miniTextInput) {
    const submitMiniChat = () => {
      const q = miniTextInput.value.trim();
      if (q) {
        miniTextInput.value = '';
        handleUserSubmit(q);
      }
    };
    btnMiniSend.addEventListener('click', submitMiniChat);
    miniTextInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitMiniChat();
    });
  }

  // 스마트폰 카메라 촬영 및 이미지 비전 분석 파이프라인
  const btnCamera = document.getElementById('btn-camera');
  const fileCameraInput = document.getElementById('file-camera-input');
  if (btnCamera && fileCameraInput) {
    btnCamera.addEventListener('click', async () => {
      if (window.jarvisAPI && typeof window.jarvisAPI.selectImageFile === 'function') {
        try {
          const fileData = await window.jarvisAPI.selectImageFile();
          if (fileData && fileData.base64) {
            processImageAnalysis(fileData.base64, fileData.mimeType || 'image/jpeg');
            return;
          }
          if (fileData === null) return; // 사용자가 창을 닫거나 취소한 경우
        } catch (e) {
          console.warn('Native dialog failed, falling back to file input:', e);
        }
      }
      fileCameraInput.click();
    });

    fileCameraInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result;
        const mimeType = file.type || 'image/jpeg';
        processImageAnalysis(dataUrl, mimeType);
      };
      reader.readAsDataURL(file);
    });

    // 메인 창 이미지 파일 드래그 & 드롭 지원 (윈도우 전역 및 바디)
    const handleFileDrop = (files) => {
      if (!files || files.length === 0) return;
      const file = files[0];
      const isImg = (file.type && file.type.startsWith('image/')) || /\.(jpe?g|png|webp|bmp|gif)$/i.test(file.name || '');
      if (isImg) {
        const reader = new FileReader();
        reader.onload = () => {
          processImageAnalysis(reader.result, file.type || 'image/jpeg');
        };
        reader.readAsDataURL(file);
      }
    };

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
      window.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
      }, false);
      document.body.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
      }, false);
    });

    window.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    });

    window.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const dt = e.dataTransfer;
      if (dt && dt.files && dt.files.length > 0) {
        handleFileDrop(dt.files);
      }
    });

    document.body.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const dt = e.dataTransfer;
      if (dt && dt.files && dt.files.length > 0) {
        handleFileDrop(dt.files);
      }
    });

    async function processImageAnalysis(dataUrl, mimeType) {
      const base64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      const userText = textInput.value.trim() || '이 사진 속 가구의 배경을 빼고 3D 입체 설계도로 띄워줘.';

      // 대화창에 사용자 사진 미리보기 렌더링
      const imgPreview = document.createElement('div');
      imgPreview.className = 'msg-bubble user-msg';
      imgPreview.innerHTML = `
        <div class="msg-meta"><span class="agent-tag">USER</span> <span class="time-tag">방금</span></div>
        <div style="margin-top:6px;"><img src="${dataUrl.startsWith('data:') ? dataUrl : 'data:' + mimeType + ';base64,' + base64Data}" style="max-width:260px; max-height:200px; border-radius:8px; border:1px solid #00f0ff; box-shadow:0 0 10px rgba(0,240,255,0.4);" /></div>
        <div style="font-size:12px; color:#cbeeff; margin-top:4px;">📷 ${userText}</div>
      `;
      messagesFeed.appendChild(imgPreview);
      messagesFeed.scrollTop = messagesFeed.scrollHeight;

      statusText.textContent = '⚡ 가구 구조 역설계 및 3D CAD 모델링 중...';
      coreStateText.textContent = 'THINK';

      try {
        const res = await fetch('/api/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: userText,
            imageBase64: base64Data,
            mimeType: mimeType
          })
        });
        const result = await res.json();
        textInput.value = '';

        appendMessage('J.A.R.V.I.S.', result.reply, 'jarvis-msg');
        speakResponse(result.reply);
        statusText.textContent = '🟢 3D CAD 모델링 완료 (말씀하시면 대화 지속)';
        coreStateText.textContent = 'ACTIVE';
        isSessionActive = true;
        resetSessionInactivityTimer();

        // 3D CAD 스튜디오 호출 액션 처리
        if (result.actionType === 'OPEN_CAD_STUDIO' || (result.action && result.action.type === 'OPEN_CAD_STUDIO')) {
          openCADStudioWindow(result.dynamicWidget || (result.action && result.action.widget) || null);
        }
      } catch (err) {
        console.error('Vision analysis error:', err);
        appendMessage('J.A.R.V.I.S.', '사진 분석 중 오류가 발생했습니다: ' + err.message, 'jarvis-msg');
      } finally {
        fileCameraInput.value = '';
      }
    }
  }

  btnClearFeed.addEventListener('click', () => {
    messagesFeed.innerHTML = '';
  });

  quickChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const query = chip.getAttribute('data-query');
      if (query) handleUserSubmit(query);
    });
  });

  // Memory Modal
  btnOpenMemory.addEventListener('click', async () => {
    let profile = null;
    if (window.jarvisAPI) {
      profile = await window.jarvisAPI.getProfile();
    } else {
      try {
        const res = await fetch('/api/profile');
        profile = await res.json();
      } catch (e) {}
    }
    if (profile) updateSyncBar(null, profile);
    memoryModal.classList.add('active');
  });

  btnCloseMemory.addEventListener('click', () => {
    memoryModal.classList.remove('active');
  });

  memoryModal.addEventListener('click', (e) => {
    if (e.target === memoryModal) memoryModal.classList.remove('active');
  });

  // AI Settings Modal
  const btnOpenAISettings = document.getElementById('btn-open-ai-settings');
  const aiSettingsModal = document.getElementById('ai-settings-modal');
  const btnCloseAISettings = document.getElementById('btn-close-ai-settings');
  const inputGeminiKey = document.getElementById('input-gemini-key');
  const btnSaveKey = document.getElementById('btn-save-key');
  const btnClearKey = document.getElementById('btn-clear-key');
  const aiKeyStatus = document.getElementById('ai-key-status');

  async function checkAIConfig() {
    try {
      const res = await fetch('/api/config');
      const cfg = await res.json();
      if (cfg.hasGeminiKey) {
        btnOpenAISettings.textContent = '🧠 GEMINI 연동됨 ✅';
        btnOpenAISettings.style.borderColor = '#00ffaa';
        btnOpenAISettings.style.color = '#00ffaa';
        aiKeyStatus.textContent = `현재 활성화된 키: ${cfg.geminiKeyMasked}`;
      } else {
        btnOpenAISettings.textContent = '🧠 AI 두뇌 설정';
        btnOpenAISettings.style.borderColor = '#ffaa00';
        btnOpenAISettings.style.color = '#ffaa00';
        aiKeyStatus.textContent = '텍스트 명령은 사용할 수 있습니다. 음성 인식에는 Gemini API 키가 필요합니다.';
      }
    } catch (e) {}
  }

  if (btnOpenAISettings) {
    btnOpenAISettings.addEventListener('click', () => {
      checkAIConfig();
      aiSettingsModal.classList.add('active');
    });
  }

  if (btnCloseAISettings) {
    btnCloseAISettings.addEventListener('click', () => {
      aiSettingsModal.classList.remove('active');
    });
  }

  if (aiSettingsModal) {
    aiSettingsModal.addEventListener('click', (e) => {
      if (e.target === aiSettingsModal) aiSettingsModal.classList.remove('active');
    });
  }

  if (btnSaveKey) {
    btnSaveKey.addEventListener('click', async () => {
      const key = inputGeminiKey.value.trim();
      if (!key) {
        alert('Gemini API 키를 입력해 주십시오.');
        return;
      }
      btnSaveKey.textContent = '저장 중...';
      try {
        const res = await fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gemini_api_key: key })
        });
        const data = await res.json();
        if (data.success) {
          audioPipelineNeedsConfig = false;
          alert('✅ Gemini AI 키가 저장되었습니다. 음성 인식을 사용할 수 있습니다.');
          inputGeminiKey.value = '';
          aiSettingsModal.classList.remove('active');
          checkAIConfig();
          if (isWakeWordEnabled && !isSpeaking) startGeminiAudioRecording();
        } else {
          alert(`저장 실패: ${data.error || '알 수 없는 오류'}`);
        }
      } catch (err) {
        alert(`저장 실패: ${err.message}`);
      } finally {
        btnSaveKey.textContent = '저장 및 적용';
      }
    });
  }

  if (btnClearKey) {
    btnClearKey.addEventListener('click', async () => {
      if (confirm('등록된 API 키를 해제하고 내장 엔진으로 돌아가시겠습니까?')) {
        await fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gemini_api_key: "" })
        });
        inputGeminiKey.value = '';
        checkAIConfig();
        alert('API 키가 초기화되었습니다.');
      }
    });
  }

  // Standalone Browser Fallback (if server unreachable)
  function mockProcessInput(query) {
    const isMicCheck = /^아+|마이크|테스트|소리|들려/.test(query);
    const isGreeting = /안녕|하이|반가워|자비스/.test(query);

    let reply = "개발자님, 말씀하신 내용 접수했습니다. 필요한 작업이 있으시면 언제든 편히 지시해 주십시오.";
    if (isMicCheck) {
      reply = "네 개발자님, 마이크 음향 신호가 선명하게 수신되고 있습니다. 목소리가 아주 잘 들립니다.";
    } else if (isGreeting) {
      reply = "안녕하십니까 개발자님, 자비스 정상 가동 중입니다. 오늘 어떤 작업을 함께 시작할까요?";
    }

    return {
      reply: reply,
      actionType: 'CHAT',
      moodState: { mood: "집중 모드 (Focused)", energy: 85, stress: "안정" },
      dynamicWidget: null,
      userProfile: { user_name: "개발자님", personality: { preferred_style: "핵심 위주, 신속한 실행" } }
    };
  }

  // Voice & TTS Settings Modal Handlers
  const btnOpenVoiceSettings = document.getElementById('btn-open-voice-settings');
  const voiceSettingsModal = document.getElementById('voice-settings-modal');
  const btnCloseVoiceSettings = document.getElementById('btn-close-voice-settings');
  const selectVoice = document.getElementById('select-voice');
  const rangeVoicePitch = document.getElementById('range-voice-pitch');
  const rangeVoiceRate = document.getElementById('range-voice-rate');
  const labelPitchVal = document.getElementById('label-pitch-val');
  const labelRateVal = document.getElementById('label-rate-val');
  const btnTestVoice = document.getElementById('btn-test-voice');
  const btnSaveVoice = document.getElementById('btn-save-voice');

  const EDGE_VOICE_MODELS = [
    {
      id: 'edge:ko-KR-InJoonNeural',
      name: '★ [추천/자비스 톤] Microsoft InJoon (진중하고 품격 있는 한국어 남성 AI 집사)',
      lang: 'ko-KR'
    },
    {
      id: 'edge:ko-KR-HyunsuMultilingualNeural',
      name: 'Microsoft Hyunsu (지적이고 세련된 현대 한국어 남성 AI 비서)',
      lang: 'ko-KR'
    },
    {
      id: 'edge:ko-KR-SunHiNeural',
      name: 'Microsoft Sun-Hi (또렷하고 세련된 한국어 여성 AI)',
      lang: 'ko-KR'
    },
    {
      id: 'edge:en-GB-RyanNeural',
      name: 'Microsoft Ryan (아이언맨 영화 원작 영국식 브리티시 자비스 톤)',
      lang: 'en-GB'
    },
    {
      id: 'edge:en-US-GuyNeural',
      name: 'Microsoft Guy (스타일리시한 미국식 남성 AI)',
      lang: 'en-US'
    }
  ];

  function populateVoiceList() {
    if (!selectVoice) return;
    const savedVoiceURI = localStorage.getItem('jarvis_voice_uri') || 'edge:ko-KR-InJoonNeural';
    selectVoice.innerHTML = '';

    // 1. First add Edge Neural TTS models (High-Quality AI Voices)
    const optGroupNeural = document.createElement('optgroup');
    optGroupNeural.label = '⚡ 자비스 추천 고음질 뉴럴 AI 보이스 (Microsoft Edge Neural)';

    EDGE_VOICE_MODELS.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name;
      if (m.id === savedVoiceURI) opt.selected = true;
      optGroupNeural.appendChild(opt);
    });
    selectVoice.appendChild(optGroupNeural);

    // 2. Then add local system voices (SpeechSynthesis)
    if ('speechSynthesis' in window) {
      const localVoices = window.speechSynthesis.getVoices() || [];
      if (localVoices.length > 0) {
        const optGroupLocal = document.createElement('optgroup');
        optGroupLocal.label = '💻 윈도우/시스템 기본 로컬 음성 (Offline SAPI)';

        localVoices.forEach(voice => {
          const opt = document.createElement('option');
          opt.value = voice.voiceURI || voice.name;
          let label = voice.name;
          if (voice.name.includes('Heami')) {
            label = `Microsoft Heami (Windows 기본 기계음)`;
          } else {
            label = `${voice.name} (${voice.lang})`;
          }
          opt.textContent = label;
          if (opt.value === savedVoiceURI) opt.selected = true;
          optGroupLocal.appendChild(opt);
        });
        selectVoice.appendChild(optGroupLocal);
      }
    }
  }

  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = populateVoiceList;
  }
  setTimeout(populateVoiceList, 200);

  // Range updates
  if (rangeVoicePitch) {
    const savedPitch = localStorage.getItem('jarvis_voice_pitch') || '0.95';
    rangeVoicePitch.value = savedPitch;
    if (labelPitchVal) labelPitchVal.textContent = savedPitch;
    rangeVoicePitch.addEventListener('input', (e) => {
      if (labelPitchVal) labelPitchVal.textContent = e.target.value;
    });
  }

  if (rangeVoiceRate) {
    const savedRate = localStorage.getItem('jarvis_voice_rate') || '1.05';
    rangeVoiceRate.value = savedRate;
    if (labelRateVal) labelRateVal.textContent = savedRate;
    rangeVoiceRate.addEventListener('input', (e) => {
      if (labelRateVal) labelRateVal.textContent = e.target.value;
    });
  }

  if (btnOpenVoiceSettings) {
    btnOpenVoiceSettings.addEventListener('click', () => {
      populateVoiceList();
      voiceSettingsModal.classList.add('active');
    });
  }

  if (btnCloseVoiceSettings) {
    btnCloseVoiceSettings.addEventListener('click', () => {
      voiceSettingsModal.classList.remove('active');
    });
  }

  if (voiceSettingsModal) {
    voiceSettingsModal.addEventListener('click', (e) => {
      if (e.target === voiceSettingsModal) voiceSettingsModal.classList.remove('active');
    });
  }

  if (btnTestVoice) {
    btnTestVoice.addEventListener('click', async () => {
      stopAllSpeech();
      const selectedValue = selectVoice.value;
      const testPitch = parseFloat(rangeVoicePitch.value);
      const testRate = parseFloat(rangeVoiceRate.value);

      if (selectedValue.startsWith('edge:')) {
        const origText = btnTestVoice.innerHTML;
        btnTestVoice.textContent = '🔊 음성 합성 및 재생 중...';
        try {
          const testMsg = selectedValue.includes('Ryan') || selectedValue.includes('Guy')
            ? "Good day, sir. J.A.R.V.I.S. is online and ready for your command."
            : "안녕하십니까 개발자님, J.A.R.V.I.S. 시스템입니다. 현재 설정된 목소리 톤입니다.";

          const res = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: testMsg,
              voice: selectedValue.replace(/^edge:/, ''),
              pitch: testPitch,
              rate: testRate
            })
          });

          if (!res.ok) throw new Error(`Server returned ${res.status}`);

          const blob = await res.blob();
          const audioUrl = URL.createObjectURL(blob);
          const audio = new Audio(audioUrl);
          currentTTSAudio = audio;

          audio.onended = () => {
            btnTestVoice.innerHTML = origText;
            URL.revokeObjectURL(audioUrl);
          };
          audio.onerror = () => {
            btnTestVoice.innerHTML = origText;
          };
          await audio.play();
        } catch (e) {
          btnTestVoice.innerHTML = origText;
          alert('미리듣기 재생 오류: ' + e.message);
        }
      } else {
        const testUtterance = new SpeechSynthesisUtterance("안녕하십니까 개발자님, J.A.R.V.I.S. 시스템입니다. 현재 설정된 목소리 톤입니다.");
        const voices = window.speechSynthesis.getVoices();
        const selected = voices.find(v => (v.voiceURI || v.name) === selectedValue);
        if (selected) {
          testUtterance.voice = selected;
          testUtterance.lang = selected.lang;
          if (selected.lang.startsWith('en')) {
            testUtterance.text = "Good day, sir. J.A.R.V.I.S. is online and ready for your command.";
          }
        }
        testUtterance.pitch = testPitch;
        testUtterance.rate = testRate;
        window.speechSynthesis.speak(testUtterance);
      }
    });
  }

  if (btnSaveVoice) {
    btnSaveVoice.addEventListener('click', () => {
      localStorage.setItem('jarvis_voice_uri', selectVoice.value);
      localStorage.setItem('jarvis_voice_pitch', rangeVoicePitch.value);
      localStorage.setItem('jarvis_voice_rate', rangeVoiceRate.value);
      alert('✅ 보이스 설정이 저장되었습니다! 다음 대화부터 즉시 적용됩니다.');
      voiceSettingsModal.classList.remove('active');
    });
  }

  // Helper escape function
  function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
  }

  // ----------------------------------------------------------
  // Mobile & External Tunnel & PWA Installation Logic
  // ----------------------------------------------------------
  const tunnelUrlInput = document.getElementById('tunnel-url-input');
  const localIpInput = document.getElementById('local-ip-input');
  const tunnelStatusBadge = document.getElementById('tunnel-status-badge');
  const btnCopyTunnel = document.getElementById('btn-copy-tunnel');
  const btnCopyLocal = document.getElementById('btn-copy-local');
  const btnRefreshTunnel = document.getElementById('btn-refresh-tunnel');
  const btnPwaInstall = document.getElementById('btn-pwa-install');
  const pwaInstallBanner = document.getElementById('pwa-install-banner');

  // Mobile Detection & PWA Elements
  const mobileTopInstallBanner = document.getElementById('mobile-top-install-banner');
  const btnTopPwaInstall = document.getElementById('btn-top-pwa-install');
  const btnMiniPwaInstall = document.getElementById('btn-mini-pwa-install');
  const isMobileDevice = !window.jarvisAPI && (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth <= 768);

  // Register PWA Service Worker only on mobile devices (prevents stale desktop caching)
  if ('serviceWorker' in navigator) {
    if (isMobileDevice) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
          .then(reg => console.log('[JARVIS PWA] Service Worker registered with scope:', reg.scope))
          .catch(err => console.warn('[JARVIS PWA] Service Worker registration failed:', err));
      });
    } else {
      // Desktop / PC: Immediately purge all service workers and caches
      navigator.serviceWorker.getRegistrations().then(regs => {
        for (let r of regs) r.unregister();
      });
      if ('caches' in window) {
        caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
      }
    }
  }

  // ⚡ [모바일 오디오 & TTS 영구 언락커]
  // 모바일 크롬의 Autoplay 차단 정책을 화면 첫 터치(User Gesture) 즉시 해제하여 자비스 목소리가 100% 나오도록 보장
  let hasUnlockedMobileAudio = false;
  function unlockMobileAudioOnFirstTouch() {
    if (hasUnlockedMobileAudio) return;
    hasUnlockedMobileAudio = true;
    try {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.resume();
        const dummy = new SpeechSynthesisUtterance('');
        dummy.volume = 0;
        window.speechSynthesis.speak(dummy);
      }
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const dummyCtx = new AudioCtx();
        if (dummyCtx.state === 'suspended') {
          dummyCtx.resume();
        }
      }
      console.log('[JARVIS MOBILE] Audio & SpeechSynthesis unlocked via user touch.');
    } catch (e) {
      console.warn('[JARVIS MOBILE] Audio unlock note:', e);
    }
  }
  window.addEventListener('touchstart', unlockMobileAudioOnFirstTouch, { passive: true, once: true });
  window.addEventListener('click', unlockMobileAudioOnFirstTouch, { passive: true, once: true });

  // Handle Chrome beforeinstallprompt event (strictly mobile only, never on PC Electron)
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (isMobileDevice && !window.jarvisAPI) {
      if (pwaInstallBanner) pwaInstallBanner.style.display = 'block';
      if (mobileTopInstallBanner) mobileTopInstallBanner.style.display = 'flex';
      if (btnMiniPwaInstall) btnMiniPwaInstall.style.display = 'inline-flex';
    }
  });

  // If already on mobile browser, show install banner proactively; hide on desktop
  if (isMobileDevice && !window.jarvisAPI) {
    if (mobileTopInstallBanner) mobileTopInstallBanner.style.display = 'flex';
    if (btnMiniPwaInstall) btnMiniPwaInstall.style.display = 'inline-flex';
  } else {
    if (mobileTopInstallBanner) mobileTopInstallBanner.style.display = 'none';
    if (btnMiniPwaInstall) btnMiniPwaInstall.style.display = 'none';
  }

  async function triggerPWAInstall() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log('[JARVIS PWA] User install choice:', outcome);
      deferredPrompt = null;
      if (pwaInstallBanner) pwaInstallBanner.style.display = 'none';
      if (mobileTopInstallBanner) mobileTopInstallBanner.style.display = 'none';
      if (btnMiniPwaInstall) btnMiniPwaInstall.style.display = 'none';
    } else {
      alert('📱 [안드로이드 자비스 앱 설치 안내]\n\n크롬 브라우저 우측 상단의 메뉴 [ ⋮ ] ➔ [앱 설치] 또는 [홈 화면에 추가]를 눌러주시면 스마트폰 홈 화면에 자비스 전용 앱으로 즉시 설치됩니다!');
    }
  }

  if (btnPwaInstall) btnPwaInstall.addEventListener('click', triggerPWAInstall);
  if (btnTopPwaInstall) btnTopPwaInstall.addEventListener('click', triggerPWAInstall);
  if (btnMiniPwaInstall) btnMiniPwaInstall.addEventListener('click', triggerPWAInstall);

  async function refreshMobileInfo() {
    try {
      if (tunnelStatusBadge) {
        tunnelStatusBadge.textContent = '⚡ 주소 확인 중...';
        tunnelStatusBadge.style.color = '#ffb800';
      }
      const res = await fetch('/api/mobile-info');
      const data = await res.json();
      if (localIpInput) localIpInput.value = data.localUrl || `http://${data.localIp}:3000`;
      if (tunnelUrlInput) {
        if (data.tunnelUrl) {
          tunnelUrlInput.value = data.tunnelUrl;
          if (tunnelStatusBadge) {
            tunnelStatusBadge.textContent = '🟢 전 세계 접속 가능 (HTTPS)';
            tunnelStatusBadge.style.color = '#00ffaa';
            tunnelStatusBadge.style.background = 'rgba(0,255,170,0.2)';
          }
        } else {
          tunnelUrlInput.value = '보안 HTTPS 주소 연결 중 (잠시 후 새로고침)...';
          if (tunnelStatusBadge) {
            tunnelStatusBadge.textContent = '🟡 터널 연결 시도 중';
            tunnelStatusBadge.style.color = '#ffb800';
            tunnelStatusBadge.style.background = 'rgba(255,184,0,0.2)';
          }
        }
      }
    } catch (e) {
      console.warn('Error fetching mobile info:', e);
    }
  }

  if (btnOpenMobile) {
    btnOpenMobile.addEventListener('click', () => {
      refreshMobileInfo();
      if (mobileModal) mobileModal.classList.add('active');
    });
  }

  if (btnCloseMobile) {
    btnCloseMobile.addEventListener('click', () => {
      if (mobileModal) mobileModal.classList.remove('active');
    });
  }

  if (mobileModal) {
    mobileModal.addEventListener('click', (e) => {
      if (e.target === mobileModal) mobileModal.classList.remove('active');
    });
  }

  if (btnCopyTunnel) {
    btnCopyTunnel.addEventListener('click', () => {
      if (tunnelUrlInput && tunnelUrlInput.value && !tunnelUrlInput.value.includes('...')) {
        navigator.clipboard.writeText(tunnelUrlInput.value);
        btnCopyTunnel.textContent = '✅ 복사 완료';
        setTimeout(() => { btnCopyTunnel.textContent = '📋 주소 복사'; }, 2000);
      } else {
        alert('주소가 아직 생성 중입니다. 잠시 후 다시 시도해 주십시오.');
      }
    });
  }

  if (btnCopyLocal) {
    btnCopyLocal.addEventListener('click', () => {
      if (localIpInput && localIpInput.value) {
        navigator.clipboard.writeText(localIpInput.value);
        btnCopyLocal.textContent = '✅ 복사됨';
        setTimeout(() => { btnCopyLocal.textContent = '복사'; }, 2000);
      }
    });
  }

  if (btnRefreshTunnel) {
    btnRefreshTunnel.addEventListener('click', async () => {
      btnRefreshTunnel.textContent = '🔄 생성 중...';
      try {
        await fetch('/api/tunnel/start', { method: 'POST' });
        await refreshMobileInfo();
      } catch (e) {
        console.warn('Tunnel restart error:', e);
      } finally {
        btnRefreshTunnel.textContent = '🔄 갱신';
      }
    });
  }

  // ----------------------------------------------------------
  // Directives Modal Logic
  // ----------------------------------------------------------
  async function loadDirectivesList() {
    if (!directivesListContainer) return;
    try {
      const res = await fetch('/api/directives');
      const rules = await res.json();
      if (!rules || rules.length === 0) {
        directivesListContainer.innerHTML = '<div style="color:var(--text-dim); font-size:12px; padding:10px; text-align:center;">등록된 동적 자가 학습 규칙이 없습니다.<br>"앞으로 기사는 읽지 마", "내 이름은 OO이야" 처럼 말씀하시면 자동 등록됩니다.</div>';
        return;
      }
      directivesListContainer.innerHTML = rules.map((r, idx) => `
        <div style="background:rgba(0, 240, 255, 0.08); border-left:3px solid var(--border-cyan); border-radius:4px; padding:8px 12px; font-size:12px;">
          <div style="color:#fff; font-weight:700; margin-bottom:2px;">#${idx + 1} ${escapeHtml(r.description)}</div>
          <div style="color:var(--text-dim); font-size:11px;">감지 패턴: [${escapeHtml(r.triggerPattern)}] | 등록: ${escapeHtml(r.createdAt || '최근')}</div>
        </div>
      `).join('');
    } catch (e) {
      directivesListContainer.innerHTML = '<div style="color:#ff3b5c; font-size:12px;">규칙 목록을 불러오는 중 오류가 발생했습니다.</div>';
    }
  }

  if (btnOpenDirectives) {
    btnOpenDirectives.addEventListener('click', () => {
      loadDirectivesList();
      if (directivesModal) directivesModal.classList.add('active');
    });
  }

  if (btnCloseDirectives) {
    btnCloseDirectives.addEventListener('click', () => {
      if (directivesModal) directivesModal.classList.remove('active');
    });
  }

  if (directivesModal) {
    directivesModal.addEventListener('click', (e) => {
      if (e.target === directivesModal) directivesModal.classList.remove('active');
    });
  }

  // Init
  initSpeechRecognition();
  checkAIConfig();

  // Initialize UI Mode to STANDBY (waiting in background) or MINI_CIRCLE if not boot
  setUIMode('MINI_CIRCLE');

  // Check auto-launch & boot welcome greeting ("좋은 아침입니다, 개발자님.")
  async function initAutoLaunchAndBoot() {
    try {
      const res = await fetch('/api/autolaunch');
      const data = await res.json();
      if (btnToggleAutoLaunch) {
        btnToggleAutoLaunch.textContent = data.enabled ? '🖥️ 부팅 자동실행: ON' : '🖥️ 부팅 자동실행: OFF';
        btnToggleAutoLaunch.classList.toggle('active', data.enabled);
      }

      const urlParams = new URLSearchParams(window.location.search);
      const isBoot = data.isBootStart || urlParams.get('boot') === '1';

      if (isBoot) {
        setUIMode('MINI_CIRCLE');
        setTimeout(async () => {
          await initMicrophoneStream();
          playWakeChime();
          speakResponse("좋은 아침입니다, 개발자님.");
          startSession(null);
        }, 1000);
      }
    } catch (e) {
      console.warn('Auto-launch check error:', e);
    }
  }
  initAutoLaunchAndBoot();

  if (window.jarvisAPI) {
    window.jarvisAPI.getProfile().then(profile => {
      if (profile) updateSyncBar(profile.current_state, profile);
    });
  } else {
    fetch('/api/profile').then(res => res.json()).then(profile => {
      if (profile) updateSyncBar(profile.current_state, profile);
    }).catch(() => {});
  }

  // Connect to Invisible Background Speech Bridge
  if (!window.jarvisAPI) initSpeechBridgeStream();

  // Auto-start continuous wake word listening on launch / first interaction
  const isMobileClient = !window.jarvisAPI && (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth <= 768);
  if (isWakeWordEnabled && !isMobileClient) {
    updateWakeWordButtonUI();
    setTimeout(() => {
      if (!isBridgeConnected && useGeminiAudio) {
        startGeminiAudioRecording();
      } else if (recognition && window.location.protocol !== 'file:') {
        try {
          recognition.start();
        } catch (e) {}
      }
    }, 400);
  }

  const resumeWakeListenerOnGesture = async () => {
    if (isWakeWordEnabled && !isMobileClient) {
      try {
        if (!isBridgeConnected && useGeminiAudio) {
          startGeminiAudioRecording();
        } else if (recognition) {
          recognition.start();
        }
      } catch (e) {}
    }
    window.removeEventListener('click', resumeWakeListenerOnGesture);
  };
  window.addEventListener('click', resumeWakeListenerOnGesture);
});
