const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const fs = require('fs');
const brain = require('./src/memory/brain');
const cadBlueprint = require('./src/services/cad_blueprint');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

const autoLaunch = require('./src/system/auto_launch');

const app = express();
const PORT = 3000;
const isBootStart = process.argv.includes('--autostart');

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
// Cache-Control headers to ensure latest scripts are always served
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

app.use(express.static(path.join(__dirname, 'src', 'renderer'), {
  etag: false,
  maxAge: 0
}));

// Direct Android APK Download Route
app.get('/download/apk', (req, res) => {
  const apkPath = path.join(__dirname, 'dist', 'jarvis-mobile.apk');
  const fallbackPath = path.join(__dirname, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
  const target = fs.existsSync(apkPath) ? apkPath : (fs.existsSync(fallbackPath) ? fallbackPath : null);
  if (target) {
    res.download(target, 'jarvis-mobile.apk');
  } else {
    res.status(404).send('APK is compiling or not found. Run build_apk.bat first.');
  }
});

// ==========================================
// Invisible Background Speech Bridge Relaying
// ==========================================
let speechBridgeClients = [];

app.get('/api/speech/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  speechBridgeClients = speechBridgeClients.filter(c => !c.writableEnded && !c.destroyed);
  speechBridgeClients.push(res);
  console.log(`[SPEECH BRIDGE] Electron HUD connected to speech stream. Total listeners: ${speechBridgeClients.length}`);

  req.on('close', () => {
    speechBridgeClients = speechBridgeClients.filter(c => c !== res);
  });
});

app.post('/api/speech/event', (req, res) => {
  const { transcript, isFinal } = req.body;
  if (transcript && transcript.trim().length > 0) {
    const payload = JSON.stringify({ transcript: transcript.trim(), isFinal: isFinal !== false, timestamp: Date.now() });
    speechBridgeClients = speechBridgeClients.filter(c => !c.writableEnded && !c.destroyed);
    // Send only to the single primary (latest active) client to ensure only 1 window answers and speaks
    const targetClients = speechBridgeClients.slice(-1);
    console.log(`[SPEECH RELAY] Broadcasting to ${targetClients.length} active client: "${transcript.trim()}"`);
    targetClients.forEach(client => {
      try {
        client.write(`data: ${payload}\n\n`);
      } catch (e) {}
    });
  }
  res.json({ success: true });
});

app.get('/api/bridge-status', (req, res) => {
  res.json({
    status: 'online',
    activeClients: speechBridgeClients.length,
    timestamp: Date.now()
  });
});

// ==========================================
// High-Quality Edge Neural TTS Engine (JARVIS Voice)
// ==========================================
const EDGE_NEURAL_VOICES = [
  {
    id: 'edge:ko-KR-InJoonNeural',
    voiceName: 'ko-KR-InJoonNeural',
    name: '★ [추천] Microsoft InJoon (자비스풍 진중하고 품격 있는 AI 집사 톤)',
    lang: 'ko-KR',
    gender: 'Male',
    isEdge: true
  },
  {
    id: 'edge:ko-KR-HyunsuMultilingualNeural',
    voiceName: 'ko-KR-HyunsuMultilingualNeural',
    name: 'Microsoft Hyunsu (지적이고 세련된 현대 한국어 남성 AI 비서)',
    lang: 'ko-KR',
    gender: 'Male',
    isEdge: true
  },
  {
    id: 'edge:ko-KR-SunHiNeural',
    voiceName: 'ko-KR-SunHiNeural',
    name: 'Microsoft Sun-Hi (또렷하고 세련된 한국어 여성 AI)',
    lang: 'ko-KR',
    gender: 'Female',
    isEdge: true
  },
  {
    id: 'edge:en-GB-RyanNeural',
    voiceName: 'en-GB-RyanNeural',
    name: 'Microsoft Ryan (아이언맨 원작 영화 오리지널 영국식 자비스 톤)',
    lang: 'en-GB',
    gender: 'Male',
    isEdge: true
  },
  {
    id: 'edge:en-US-GuyNeural',
    voiceName: 'en-US-GuyNeural',
    name: 'Microsoft Guy (스타일리시한 미국식 남성 AI 비서)',
    lang: 'en-US',
    gender: 'Male',
    isEdge: true
  }
];

app.get('/api/tts/voices', (req, res) => {
  res.json({ success: true, voices: EDGE_NEURAL_VOICES });
});

app.post('/api/tts', async (req, res) => {
  try {
    const { text, voice = 'ko-KR-InJoonNeural', pitch = 1.0, rate = 1.0 } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Text required' });
    }

    const cleanVoice = (voice || 'ko-KR-InJoonNeural').replace(/^edge:/, '');
    const tts = new MsEdgeTTS();
    await tts.setMetadata(cleanVoice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    let rateStr = '+0%';
    const numRate = parseFloat(rate) || 1.0;
    if (numRate !== 1.0) {
      const pct = Math.round((numRate - 1.0) * 100);
      rateStr = pct >= 0 ? `+${pct}%` : `${pct}%`;
    }

    let pitchStr = '+0Hz';
    const numPitch = parseFloat(pitch) || 1.0;
    if (numPitch !== 1.0) {
      const hz = Math.round((numPitch - 1.0) * 50);
      pitchStr = hz >= 0 ? `+${hz}Hz` : `${hz}Hz`;
    }

    const { audioStream } = tts.toStream(text.trim(), {
      rate: rateStr,
      pitch: pitchStr
    });

    res.setHeader('Content-Type', 'audio/mpeg');
    audioStream.pipe(res);
  } catch (err) {
    console.error('[EDGE-TTS] Error synthesizing audio:', err);
    res.status(500).json({ error: err.message });
  }
});

// Custom Audio STT Endpoint using Gemini Audio Multimodal
app.post('/api/stt', async (req, res) => {
  try {
    const { audio, mimeType } = req.body;
    if (!audio) return res.status(400).json({ error: 'Audio data required' });
    const cfg = brain.loadConfig();
    const apiKey = cfg.gemini_api_key;
    if (!apiKey || apiKey.trim().length < 10) {
      return res.status(400).json({ reason: 'api_key_missing', error: 'Gemini API key not configured' });
    }

    const cleanBase64 = audio.includes(',') ? audio.split(',')[1] : audio;
    const audioMime = (mimeType || 'audio/webm').split(';')[0];

    const models = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash'];
    let transcript = '';

    for (const model of models) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey.trim()}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                {
                  inline_data: {
                    mime_type: audioMime,
                    data: cleanBase64
                  }
                },
                {
                  text: "사용자의 음성을 한국어 텍스트로 정확히 전사(STT)해줘. 다른 설명, 인사, 따옴표 없이 오직 사용자가 말한 문장만 출력해. 음성이 없거나 소음뿐이면 빈 문자열을 반환해."
                }
              ]
            }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 200
            }
          })
        });

        if (response.ok) {
          const data = await response.json();
          transcript = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
          transcript = transcript.replace(/^["']|["']$/g, '').trim();
          if (transcript) break;
        } else {
          const errText = await response.text();
          console.warn(`[STT] Model ${model} returned ${response.status}:`, errText);
        }
      } catch (err) {
        console.warn(`[STT] Error with ${model}:`, err.message);
      }
    }

    console.log('[STT RESULT]:', transcript);
    res.json({ transcript, success: true });
  } catch (err) {
    console.error('Error in /api/stt:', err);
    res.status(500).json({ error: err.message });
  }
});

// Full Gemini Multimodal Audio Pipeline: Audio -> Speech & Nuance/Tone -> Brain Execution
app.post('/api/chat-audio', async (req, res) => {
  try {
    const { audio, mimeType } = req.body;
    if (!audio) return res.status(400).json({ error: 'Audio data required' });
    const cfg = brain.loadConfig();
    const apiKey = cfg.gemini_api_key;
    if (!apiKey || apiKey.trim().length < 10) {
      return res.status(400).json({ reason: 'api_key_missing', error: 'Gemini API key not configured' });
    }

    const cleanBase64 = audio.includes(',') ? audio.split(',')[1] : audio;
    const audioMime = (mimeType || 'audio/webm').split(';')[0];
    console.log(`[AUDIO INCOMING] Size: ${cleanBase64.length} bytes, Mime: ${audioMime}`);

    const models = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash'];
    let analysisResult = null;
    let quotaErrorOccurred = false;
    let modelErrorOccurred = false;

    for (const model of models) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 7000);

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey.trim()}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{
              parts: [
                {
                  inline_data: {
                    mime_type: audioMime,
                    data: cleanBase64
                  }
                },
                {
                  text: `사용자의 한국어 음성을 정밀하게 분석하십시오.
오디오 인터페이스로 입력된 목소리이며, 짧은 호출어("자비스", "관리창 열어줘", "원형 모드", "CAD 스튜디오 열어줘", "노래 꺼줘")도 정밀하게 감지하십시오.
사람의 말이 확실히 들렸을 때만 한국어 문장을 전사하고, 단순 숨소리/클릭음/침묵일 때는 transcript를 반드시 빈 문자열("")로 반환하십시오.
반드시 아래 JSON 포맷으로만 응답하십시오:
{
  "transcript": "사용자가 말한 정확한 한국어 (잡음뿐이면 '')",
  "tone": "목소리 톤 ('차분함', '지침', '다급함', '일반')",
  "confidence": 0.95
}`
                }
              ]
            }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 100,
              response_mime_type: "application/json"
            }
          })
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          const jsonText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
          try {
            analysisResult = JSON.parse(jsonText.replace(/```json/g, '').replace(/```/g, '').trim());
            console.log(`[AUDIO GEMINI ${model} OK]:`, JSON.stringify(analysisResult));
          } catch (pe) {
            console.warn('[AUDIO JSON PARSE FAIL]:', jsonText);
            analysisResult = { transcript: '', tone: '일반' };
          }
          quotaErrorOccurred = false;
          break; // 모델이 정상 200 응답을 주었으므로 대체 모델을 호출하지 않고 즉시 종료!
        } else if (response.status === 429) {
          quotaErrorOccurred = true;
          const errBody = await response.text();
          console.warn(`[AUDIO API ${model} QUOTA EXCEEDED 429]:`, errBody.slice(0, 120));
        } else {
          modelErrorOccurred = true;
          const errBody = await response.text();
          console.warn(`[AUDIO API ${model} HTTP ${response.status}]:`, errBody.slice(0, 120));
        }
      } catch (err) {
        modelErrorOccurred = true;
        console.warn(`[AUDIO PIPELINE ERR] ${model}:`, err.message);
      }
    }

    if (quotaErrorOccurred && !analysisResult) {
      return res.json({
        transcript: '',
        tone: '',
        reply: '',
        success: false,
        reason: 'quota_exceeded'
      });
    }

    if (modelErrorOccurred && !analysisResult) {
      return res.status(503).json({ success: false, reason: 'speech_service_unavailable', error: 'Gemini 음성 인식 서비스에 연결하지 못했습니다. API 키와 인터넷 연결을 확인해 주세요.' });
    }

    if (!analysisResult || !analysisResult.transcript || analysisResult.transcript.trim().length === 0) {
      return res.json({ transcript: '', tone: '', reply: '', success: false, reason: 'no_speech_detected' });
    }

    const transcript = analysisResult.transcript.trim();
    const tone = analysisResult.tone || '일반';
    console.log(`[AUDIO ANALYZED] Transcript: "${transcript}" | Tone: "${tone}"`);

    // Execute in Jarvis Brain with tone context
    const brainResult = await brain.processInput(transcript, { userTone: tone });

    res.json({
      success: true,
      transcript,
      tone,
      reply: brainResult.reply,
      actionType: brainResult.actionType,
      action: brainResult.action,
      widget: brainResult.dynamicWidget,
      learnedHabit: brainResult.learnedHabit,
      moodState: brainResult.moodState
    });
  } catch (err) {
    console.error('Error in /api/chat-audio:', err);
    res.status(500).json({ error: err.message });
  }
});

// API Endpoints
app.post('/api/process', async (req, res) => {
  try {
    const { text, imageBase64, mimeType } = req.body;
    if (!text && !imageBase64) return res.status(400).json({ error: 'Text or image required' });
    const result = await brain.processInput(text || '이 사진을 분석하고 한국어로 설명해줘.', {
      image: imageBase64 ? { data: imageBase64, mimeType: mimeType || 'image/jpeg' } : null
    });
    res.json(result);
  } catch (err) {
    console.error('Error in /api/process:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/profile', (req, res) => {
  res.json(brain.profile);
});

const localAgent = require('./src/services/local_agent_executor');

// Dedicated CAD Studio Blueprint Endpoints
app.get('/api/cad/latest', (req, res) => {
  res.json(brain.lastBlueprint || null);
});

app.post('/api/cad/latest', (req, res) => {
  if (req.body) {
    brain.lastBlueprint = req.body;
    res.json({ success: true });
  } else {
    res.status(400).json({ error: 'No data' });
  }
});

// Photo-to-3D CAD Reverse-Engineering Endpoint
app.post('/api/cad/analyze-photo', async (req, res) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg', instruction = '' } = req.body || {};
    if (!imageBase64) {
      return res.status(400).json({ error: 'Image data is required' });
    }
    const config = brain.loadConfig();
    const apiKey = config.gemini_api_key;
    if (!apiKey) {
      return res.status(400).json({ error: 'Gemini API key is not configured' });
    }

    const blueprint = await cadBlueprint.synthesizeFromImage(imageBase64, mimeType, instruction, apiKey);
    brain.lastBlueprint = blueprint;
    res.json({ success: true, blueprint });
  } catch (err) {
    console.error('Error in /api/cad/analyze-photo:', err);
    res.status(500).json({ error: err.message });
  }
});

// Autonomous Local Agent Tools Endpoints (File Explorer, Reader, Code Exec, Self-Diagnosis)
app.post('/api/agent/explore', (req, res) => {
  const { path: targetPath } = req.body || {};
  res.json(localAgent.exploreDirectory(targetPath));
});

app.post('/api/agent/search', (req, res) => {
  const { query, path: rootPath } = req.body || {};
  if (!query) return res.status(400).json({ error: 'Query required' });
  res.json(localAgent.searchFiles(query, rootPath));
});

app.post('/api/agent/read', (req, res) => {
  const { path: filePath, startLine, endLine } = req.body || {};
  if (!filePath) return res.status(400).json({ error: 'Path required' });
  res.json(localAgent.readFileContent(filePath, startLine, endLine));
});

app.post('/api/agent/exec', async (req, res) => {
  const { command, cwd } = req.body || {};
  if (!command) return res.status(400).json({ error: 'Command required' });
  const result = await localAgent.executeCommand(command, cwd);
  res.json(result);
});

app.post('/api/agent/diagnose', async (req, res) => {
  const report = await localAgent.runSelfDiagnosis();
  res.json(report);
});

app.post('/api/agent/write', async (req, res) => {
  const { path: filePath, content } = req.body || {};
  if (!filePath) return res.status(400).json({ error: 'path required' });
  if (content === undefined) return res.status(400).json({ error: 'content required' });
  res.json(localAgent.writeFile(filePath, content));
});

app.post('/api/agent/generate-app', async (req, res) => {
  const { description } = req.body || {};
  if (!description) return res.status(400).json({ error: 'description required' });
  const cfg = brain.loadConfig();
  const apiKey = cfg.gemini_api_key;
  if (!apiKey || apiKey.trim().length < 10) return res.status(400).json({ error: 'Gemini API key not configured' });
  const result = await localAgent.generateAndServeApp(description, apiKey.trim());
  res.json(result);
});


const homeIoTHub = require('./src/services/home_iot_hub');

// ==========================================
// Home IoT Automation Hub Endpoints (SmartThings TV & LG ThinQ Aircon)
// ==========================================
app.get('/api/iot/status', async (req, res) => {
  try {
    const status = await homeIoTHub.getHomeStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/iot/tv', async (req, res) => {
  try {
    const { action, param } = req.body || {};
    if (!action) return res.status(400).json({ error: 'Action required' });
    const result = await homeIoTHub.controlTv(action, param);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/iot/aircon', async (req, res) => {
  try {
    const { action, param } = req.body || {};
    if (!action) return res.status(400).json({ error: 'Action required' });
    const result = await homeIoTHub.controlAircon(action, param);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/iot/config', (req, res) => {
  try {
    const cfg = homeIoTHub.loadConfig();
    const st = cfg.smartthings || {};
    const thinq = cfg.lg_thinq || {};
    res.json({
      success: true,
      smartthings: {
        isConfigured: !!(st.token && st.token.trim().length > 10),
        tvDeviceId: st.tv_device_id || st.tvDeviceId || '',
        tokenMasked: st.token ? `${st.token.slice(0, 4)}...${st.token.slice(-4)}` : ''
      },
      lg_thinq: {
        isConfigured: !!((thinq.token && thinq.token.trim().length > 10) || (thinq.api_key && thinq.api_key.trim().length > 10)),
        airconDeviceId: thinq.aircon_device_id || thinq.airconDeviceId || '',
        apiKeyMasked: thinq.api_key ? `${thinq.api_key.slice(0, 4)}...${thinq.api_key.slice(-4)}` : '',
        baseUrl: thinq.base_url || 'https://api.thinq.com/v1'
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/iot/config', (req, res) => {
  try {
    const { smartthings, lg_thinq } = req.body || {};
    const result = homeIoTHub.saveIotConfig({ smartthings, lg_thinq });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// SmartThings OAuth 2.0 Auto-Refresh Endpoints
// ==========================================
const smartThingsOAuth = require('./src/services/smartthings_oauth_manager');

app.get('/api/smartthings/oauth/status', (req, res) => {
  res.json(smartThingsOAuth.getStatus());
});

app.post('/api/smartthings/oauth/credentials', (req, res) => {
  try {
    const { client_id, client_secret } = req.body || {};
    if (!client_id || !client_secret) {
      return res.status(400).json({ success: false, error: 'client_id and client_secret are required' });
    }
    smartThingsOAuth.saveConfig({ clientId: client_id.trim(), clientSecret: client_secret.trim() });
    res.json({ success: true, message: 'OAuth 클라이언트 자격 증명이 저장되었습니다.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/smartthings/oauth/login', (req, res) => {
  try {
    const host = req.get('host') || `localhost:${PORT}`;
    const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    const redirectUri = `${protocol}://${host}/api/smartthings/oauth/callback`;
    const authorizeUrl = smartThingsOAuth.getAuthorizeUrl(redirectUri);
    res.redirect(authorizeUrl);
  } catch (err) {
    res.status(400).send(`<h3>SmartThings OAuth 초기화 오류</h3><p>${err.message}</p><p>Client ID 설정을 먼저 진행해 주십시오.</p>`);
  }
});

app.get('/api/smartthings/oauth/callback', async (req, res) => {
  const { code, error, error_description } = req.query;
  if (error) {
    return res.status(400).send(`<h3>SmartThings 인증 실패</h3><p>${error}: ${error_description}</p>`);
  }
  if (!code) {
    return res.status(400).send(`<h3>인증 코드가 전달되지 않았습니다.</h3>`);
  }

  try {
    const host = req.get('host') || `localhost:${PORT}`;
    const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    const redirectUri = `${protocol}://${host}/api/smartthings/oauth/callback`;
    const result = await smartThingsOAuth.exchangeCodeForTokens(code, redirectUri);

    // IoT Hub에 새 토큰 즉시 동기화
    homeIoTHub.reloadConfig();

    res.send(`
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>J.A.R.V.I.S. - SmartThings 인증 성공</title>
  <style>
    body { background: #0a0e17; color: #e0f2fe; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { background: rgba(15, 23, 42, 0.9); border: 1px solid #00f0ff; border-radius: 16px; padding: 40px; max-width: 480px; text-align: center; box-shadow: 0 0 30px rgba(0, 240, 255, 0.2); }
    h1 { color: #00f0ff; margin-top: 0; font-size: 24px; }
    p { color: #94a3b8; font-size: 15px; line-height: 1.6; }
    .badge { display: inline-block; background: rgba(0, 255, 170, 0.2); color: #00ffaa; border: 1px solid #00ffaa; border-radius: 20px; padding: 6px 16px; font-weight: bold; margin-bottom: 20px; }
    .btn { display: inline-block; margin-top: 24px; padding: 12px 28px; background: #00f0ff; color: #0a0e17; font-weight: bold; text-decoration: none; border-radius: 8px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">✓ 무한 자동 갱신 체인 연결 완료</div>
    <h1>삼성 SmartThings 연동 성공</h1>
    <p>J.A.R.V.I.S.가 삼성 인증 서버와의 갱신 토큰(Refresh Token)을 안전하게 획득했습니다.<br>이제 매일 24시간마다 백그라운드에서 자동으로 토큰이 갱신됩니다.</p>
    <a href="/" class="btn">자비스 홈으로 돌아가기</a>
  </div>
</body>
</html>
    `);
  } catch (err) {
    res.status(500).send(`<h3>토큰 교환 중 오류 발생</h3><p>${err.message}</p>`);
  }
});

app.post('/api/smartthings/oauth/refresh', async (req, res) => {
  try {
    const result = await smartThingsOAuth.refreshAccessToken();
    if (result.success) {
      homeIoTHub.reloadConfig();
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// SmartThings Webhook SmartApp Lifecycle Handler (Cafe 576 Standard)
// Automatically confirms URLs, generates tokens on install, and updates JARVIS
// ==========================================
app.post('/api/smartthings/webhook', async (req, res) => {
  const payload = req.body || {};
  const lifecycle = payload.lifecycle;
  console.log(`[ST WEBHOOK] Received lifecycle: ${lifecycle}`);

  try {
    if (lifecycle === 'CONFIRMATION') {
      const confirmationUrl = payload.confirmationData?.confirmationUrl;
      console.log(`[ST WEBHOOK CONFIRMATION] Target confirmation URL: ${confirmationUrl}`);
      if (confirmationUrl) {
        try {
          const confRes = await fetch(confirmationUrl);
          console.log(`[ST WEBHOOK CONFIRMATION] Verification response: ${confRes.status}`);
        } catch (e) {
          console.error('[ST WEBHOOK CONFIRMATION ERR]:', e.message);
        }
      }
      return res.json({ targetUrl: confirmationUrl });
    }

    if (lifecycle === 'CONFIGURATION') {
      const phase = payload.configurationData?.phase;
      if (phase === 'INITIALIZE') {
        return res.json({
          configurationData: {
            initialize: {
              name: 'JARVIS Token Keeper',
              description: 'J.A.R.V.I.S. SmartThings Infinite Token Automation',
              id: 'initialize',
              permissions: ['r:devices:*', 'w:devices:*', 'x:devices:*']
            }
          }
        });
      }
      if (phase === 'PAGE') {
        const installedAppId = smartThingsOAuth.installedAppId || payload.configurationData?.installedAppId || 'J.A.R.V.I.S.';
        return res.json({
          configurationData: {
            page: {
              pageId: payload.configurationData?.pageId || '1',
              name: 'J.A.R.V.I.S. Token Automation',
              complete: true,
              sections: [
                { name: `Installed App: ${installedAppId}` },
                { name: 'J.A.R.V.I.S. 무한 자동 갱신 엔진이 준비되었습니다.' },
                { name: '하단 완료 버튼을 눌러 설치를 완료해 주십시오.' }
              ]
            }
          }
        });
      }
      return res.json({});
    }

    if (lifecycle === 'INSTALL') {
      const installData = payload.installData || {};
      const authToken = installData.authToken;
      const refreshToken = installData.refreshToken;
      const installedAppId = installData.installedApp?.installedAppId;
      const locationId = installData.installedApp?.locationId;

      console.log('[ST WEBHOOK INSTALL SUCCESS!] AuthToken:', authToken?.slice(0, 10), 'RefreshToken:', refreshToken?.slice(0, 10));

      if (authToken) {
        smartThingsOAuth.saveConfig({
          accessToken: authToken,
          refreshToken: refreshToken || '',
          expiresAt: Date.now() + (24 * 3600 * 1000)
        });
        homeIoTHub.reloadConfig();
      }

      return res.json({
        installData: {
          status: 'SUCCESS'
        }
      });
    }

    if (lifecycle === 'UPDATE') {
      console.log('[ST WEBHOOK UPDATE SUCCESS!]');
      // Trigger token refresh upon update
      setTimeout(() => {
        smartThingsOAuth.refreshAccessToken().catch(() => {});
      }, 1000);
      return res.json({
        updateData: {
          status: 'SUCCESS'
        }
      });
    }

    return res.json({});
  } catch (err) {
    console.error('[ST WEBHOOK ERROR]:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/config', (req, res) => {
  const cfg = brain.loadConfig();
  res.json({
    hasGeminiKey: !!(cfg.gemini_api_key && cfg.gemini_api_key.trim().length > 10),
    geminiKeyMasked: cfg.gemini_api_key ? `${cfg.gemini_api_key.slice(0, 4)}...${cfg.gemini_api_key.slice(-4)}` : ""
  });
});

app.post('/api/config', (req, res) => {
  try {
    const { gemini_api_key } = req.body;
    const saved = brain.saveConfig({ gemini_api_key: gemini_api_key ? gemini_api_key.trim() : "" });
    if (!saved) return res.status(500).json({ success: false, error: '설정 파일을 저장하지 못했습니다.' });
    res.json({ success: true, message: "API 키가 저장되었습니다." });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/system', async (req, res) => {
  try {
    let si;
    try { si = require('systeminformation'); } catch (e) { si = null; }

    const cpus = os.cpus();
    const cpuModel = cpus && cpus.length > 0 ? cpus[0].model : "Standard Processor";
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memUsagePct = Math.round((usedMem / totalMem) * 100);
    const uptimeHrs = (os.uptime() / 3600).toFixed(1);

    let cpuLoadPct = 15;
    if (si) {
      try {
        const load = await si.currentLoad();
        cpuLoadPct = Math.round(load.currentLoad);
      } catch (err) {
        cpuLoadPct = Math.floor(Math.random() * 15) + 12;
      }
    }

    res.json({
      success: true,
      cpu: { model: cpuModel, cores: cpus.length, loadPct: cpuLoadPct },
      memory: {
        totalGB: (totalMem / (1024 ** 3)).toFixed(1),
        usedGB: (usedMem / (1024 ** 3)).toFixed(1),
        usagePct: memUsagePct
      },
      os: {
        info: `${os.type()} ${os.release()} (${os.arch()})`,
        hostname: os.hostname(),
        uptimeHours: uptimeHrs
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/save-memo', (req, res) => {
  try {
    const { filename, content } = req.body;
    const desktopPath = path.join(os.homedir(), 'Desktop');
    const safeFilename = filename || `JARVIS_Memo_${Date.now()}.txt`;
    const targetPath = path.join(desktopPath, safeFilename);

    fs.writeFileSync(targetPath, content, 'utf-8');
    res.json({ success: true, path: targetPath, filename: safeFilename });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/autolaunch', (req, res) => {
  res.json({
    enabled: autoLaunch.isEnabled(),
    isBootStart: isBootStart
  });
});

app.post('/api/autolaunch', (req, res) => {
  const { enable } = req.body;
  if (enable) {
    autoLaunch.enable();
  } else {
    autoLaunch.disable();
  }
  res.json({ enabled: autoLaunch.isEnabled() });
});

const tunnelService = require('./src/services/tunnel_service');

app.get('/api/tunnel', (req, res) => {
  res.json(tunnelService.getStatus());
});

app.post('/api/tunnel/start', async (req, res) => {
  try {
    const status = await tunnelService.start(PORT);
    res.json(status);
  } catch (err) {
    res.status(500).json({ active: false, error: err.message });
  }
});

app.post('/api/tunnel/stop', async (req, res) => {
  try {
    const status = await tunnelService.stop();
    res.json(status);
  } catch (err) {
    res.status(500).json({ active: false, error: err.message });
  }
});

function getBestLocalIp() {
  const nets = os.networkInterfaces();
  let candidate = 'localhost';
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        if (net.address.startsWith('192.168.')) {
          return net.address;
        }
        if (candidate === 'localhost') {
          candidate = net.address;
        }
      }
    }
  }
  return candidate;
}

app.get('/api/mobile-info', (req, res) => {
  const localIp = getBestLocalIp();
  const tunnelStatus = tunnelService.getStatus();
  res.json({
    localIp,
    localUrl: `http://${localIp}:${PORT}`,
    mobileUrl: tunnelStatus.url || `http://${localIp}:${PORT}`,
    tunnelUrl: tunnelStatus.url,
    isTunnelActive: tunnelStatus.active,
    tunnelProvider: tunnelStatus.provider
  });
});

app.get('/api/directives', (req, res) => {
  const directiveEngine = require('./src/memory/directive_engine');
  res.json(directiveEngine.directives);
});

const server = app.listen(PORT, '0.0.0.0', () => {
  const localIp = getBestLocalIp();

  console.log(`=======================================================`);
  console.log(`[J.A.R.V.I.S.] 로컬 & 모바일 연동 서버 가동 중`);
  console.log(`💻 PC 로컬 주소:      http://localhost:${PORT}`);
  console.log(`🏠 집 안(Wi-Fi) 주소:  http://${localIp}:${PORT}`);
  console.log(`=======================================================`);

  // Start secure HTTPS tunnel in background for external mobile access & Android PWA
  tunnelService.start(PORT).then(status => {
    if (status && status.active) {
      console.log(`🌍 집 밖(LTE/5G) 보안 HTTPS 주소: ${status.url}`);
    }
  }).catch(e => console.warn('Background tunnel startup:', e.message));
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log(`[J.A.R.V.I.S.] Port ${PORT} is already active.`);
  } else {
    console.error('Server error:', e);
  }
});
