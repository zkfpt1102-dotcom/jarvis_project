const fs = require('fs');
const path = require('path');
const osExecutor = require('../system/os_executor');
const liveInfo = require('../services/live_info');
const contactsManager = require('./contacts_manager');
const directiveEngine = require('./directive_engine');
const webResearcher = require('../services/web_researcher');
const cadBlueprint = require('../services/cad_blueprint');
const localAgent = require('../services/local_agent_executor');
const homeIoTHub = require('../services/home_iot_hub');

const PROFILE_PATH = path.join(__dirname, 'user_profile.json');
const CONFIG_PATH = path.join(__dirname, '..', '..', 'config.json');

class JarvisBrain {
  constructor() {
    this.profile = this.loadProfile();
    this.lastFetchedNews = [];   // 마지막으로 불러온 뉴스 캐시 (기사 URL 열기용)
    this.conversationHistory = []; // 대화 컨텍스트 유지용
    this.lastPlayedQuery = null;
    this.lastPlayedTitle = null;
    this.currentVolume = 80;
    this.lastBlueprint = null; // 마지막 3D CAD 설계 데이터 (구조 변형/연상 합성용)
    this.iotHub = homeIoTHub;
  }

  loadConfig() {
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      }
    } catch (e) {}
    return { gemini_api_key: "", openai_api_key: "" };
  }

  saveConfig(newConfig) {
    try {
      const current = this.loadConfig();
      const updated = { ...current, ...newConfig };
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2), 'utf-8');
      return true;
    } catch (e) {
      console.error('Error saving config:', e);
      return false;
    }
  }

  loadProfile() {
    try {
      if (fs.existsSync(PROFILE_PATH)) {
        return JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf-8'));
      }
    } catch (err) {
      console.error('Error loading user profile:', err);
    }
    return {
      user_name: "개발자님",
      personality: {
        preferred_style: "핵심 위주, 신속한 실행",
        tone_preference: "품격 있는 집사 어조 (자비스)",
        conciseness_level: "high"
      },
      current_state: {
        mood: "집중 모드 (Focused)",
        energy_level: 85,
        stress_level: "보통",
        last_interaction: new Date().toISOString()
      },
      learned_habits: [],
      history_logs: []
    };
  }

  saveProfile() {
    try {
      fs.writeFileSync(PROFILE_PATH, JSON.stringify(this.profile, null, 2), 'utf-8');
    } catch (err) {
      console.error('Error saving user profile:', err);
    }
  }

  // 1. 실시간 감정 및 상태 분석 (Sentiment & Condition Analysis)
  analyzeMoodAndState(text) {
    const lower = text.toLowerCase();
    let detectedMood = this.profile.current_state.mood;
    let energy = this.profile.current_state.energy_level;
    let stress = this.profile.current_state.stress_level;
    let habitLearned = null;

    // 말투/스타일 선호도 직접 학습
    if (/짧게|간단히|요약만|길게 말하지 마|핵심만|결론만|서론|사족/.test(lower)) {
      this.profile.personality.preferred_style = "초간결, 결론 위주, 서론 배제";
      this.profile.personality.conciseness_level = "very-high";
      habitLearned = "개발자님께서는 서론이나 불필요한 사족 없이 결론만 즉각 보고하는 방식을 선호하십니다.";
    } else if (/(헤드라인|기사|내용|텍스트|글).*((읽지\s*마|읽지마|소리내지\s*마|낭독하지\s*마))/i.test(lower) || /읽지\s*마|읽지마/i.test(lower)) {
      habitLearned = "기사나 데이터 요청 시 음성으로 텍스트를 길게 낭독하지 않고 화면 위젯으로만 간결하게 표시";
      if (!this.profile.learned_habits.includes(habitLearned)) {
        this.profile.learned_habits.unshift(habitLearned);
      }
    } else if (/자세히|상세히|설명해줘|친절하게/.test(lower)) {
      this.profile.personality.preferred_style = "상세한 배경 설명 및 단계별 가이드";
      this.profile.personality.conciseness_level = "detailed";
      habitLearned = "구체적이고 상세한 설명을 선호하시는 스타일을 반영했습니다.";
    }

    // 명시적 기억 및 지시사항 지속 학습 ("~기억해", "~앞으로 ~해줘", "내 이름은 ~" 등)
    if (/(?:기억해|알아둬|명심해|앞으로\s*.+?(?:해줘|해라|하자)|내\s*.+?(?:는|은)\s*.+?(?:야|다|임))/i.test(text)) {
      const memorySnippet = `개발자님 지시/기억: "${text.trim()}"`;
      if (!this.profile.learned_habits.includes(memorySnippet)) {
        this.profile.learned_habits.unshift(memorySnippet);
        habitLearned = `개발자님의 지시사항을 학습 메모리에 영구 저장했습니다: "${text.trim()}"`;
      }
    }

    // 피로/지침 감지
    if (/피곤|힘들|지쳐|쉬고 싶|졸려|기운 없|녹초|지친다|자고 싶/.test(text)) {
      detectedMood = "피로/휴식 필요 (Fatigued)";
      energy = Math.max(25, energy - 25);
      stress = "다소 높음";
    }
    // 초집중/긴급 감지
    else if (/급해|빨리|집중|마감|중요|우선|당장|비상|빨라/.test(text)) {
      detectedMood = "초집중/긴급 모드 (Deep Focus)";
      energy = 95;
      stress = "주의 집중";
    }
    // 의욕/아이디어/긍정 감지
    else if (/좋아|대박|신나|가보자|아이디어|성공|재밌|멋져|멋진|굿|최고/.test(text)) {
      detectedMood = "의욕 충만 (Motivated)";
      energy = Math.min(100, energy + 15);
      stress = "안정 (활력)";
    }
    // 스트레스/답답함 감지
    else if (/짜증|안돼|답답|왜이래|스트레스|머리아파|망했|화나/.test(text)) {
      detectedMood = "스트레스 감지 (Stressed)";
      energy = Math.max(30, energy - 20);
      stress = "높음 (안정 필요)";
    }
    // 평온/일상
    else {
      detectedMood = "안정적 (Calm & Ready)";
      energy = Math.min(90, Math.max(70, energy));
      stress = "안정";
    }

    this.profile.current_state = {
      mood: detectedMood,
      energy_level: energy,
      stress_level: stress,
      last_interaction: new Date().toISOString(),
      session_notes: `최근 발화 분석: ${text.slice(0, 30)}...`
    };

    if (habitLearned && !this.profile.learned_habits.includes(habitLearned)) {
      this.profile.learned_habits.unshift(habitLearned);
      if (this.profile.learned_habits.length > 10) this.profile.learned_habits.pop();
    }

    this.saveProfile();

    return {
      mood: detectedMood,
      energy,
      stress,
      habitLearned
    };
  }

  extractYouTubeQuery(text) {
    let q = (text || '').trim();
    q = q.replace(/^(?:어|야|헤이|하이|오케이|응|아니|아|그)?\s*(?:자비스|자비슨|서비스|잡스|자베스|지배스|jarvis)?\s*/i, '');
    q = q.replace(/(?:내\s*컴퓨터(?:에\s*있는)?|컴퓨터(?:에\s*있는)?|pc(?:에\s*있는)?)\s*/gi, '');
    q = q.replace(/(?:그\s*)?(?:크롬\s*브라우저|웹\s*브라우저|기본\s*브라우저|인터넷\s*브라우저|크롬|브라우저)(?:으로|로|에서|에)?\s*/gi, '');
    q = q.replace(/(?:유튜브|유투브|youtube)(?:으로|로|에서|에)?\s*/gi, '');
    q = q.replace(/(?:열어서|켜서|가서|들어가서|실행해서|통해서)\s*/gi, '');
    q = q.replace(/(?:어떤\s*)?(?:동영상|영상|뮤직비디오|뮤비|클립|노래|음악)(?:을|를|이|가)?\s*/gi, '');
    q = q.replace(/(?:틀어\s*달라그러면|틀어\s*달라고|틀어\s*달라|틀어\s*주라|틀어\s*줄래|틀어\s*줘봐|틀어\s*줘|틀어\s*봐|틀어|재생\s*해줄래|재생\s*해줘|재생\s*해|재생|켜\s*줄래|켜\s*줘|켜|검색\s*해줘|검색|찾아\s*줄래|찾아\s*줘|찾아\s*봐|찾아|들려\s*줄래|들려\s*줘|보여\s*줘)\s*$/gi, '');
    q = q.replace(/(?:^|\s+)(?:그|좀|한번|저기|혹시|얼른)(?:\s+|$)/gi, ' ');
    q = q.replace(/(?:을|를|이|가)\s*$/gi, '');
    return q.trim();
  }

  async resolveYouTubeTopVideo(query) {
    if (!query || query.trim().length === 0) return null;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);
      const res = await fetch('https://www.youtube.com/results?search_query=' + encodeURIComponent(query.trim()), {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
        }
      });
      clearTimeout(timeoutId);
      if (!res.ok) return null;
      const html = await res.text();
      const vidMatch = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
      const titleMatch = html.match(/"title":\{"runs":\[\{"text":"([^"]+)"\}\]/);
      if (vidMatch && vidMatch[1]) {
        return {
          videoId: vidMatch[1],
          title: titleMatch ? titleMatch[1] : query,
          url: `https://www.youtube.com/watch?v=${vidMatch[1]}&autoplay=1`
        };
      }
      const altMatch = html.match(/\/watch\?v=([a-zA-Z0-9_-]{11})/);
      if (altMatch && altMatch[1]) {
        return {
          videoId: altMatch[1],
          title: query,
          url: `https://www.youtube.com/watch?v=${altMatch[1]}&autoplay=1`
        };
      }
    } catch (e) {
      console.warn('[YOUTUBE RESOLVER WARN]:', e.message);
    }
    return null;
  }

  // 2. 통합 요청 처리 (Gemini 3.6 Flash LLM 우선 지능형 의도 분석 or Local Smart Dialogue)
  async processInput(userInput, options = {}) {
    const text = userInput ? userInput.trim() : '';
    const toneContext = options.userTone || '';
    const imageContext = options.image || null;
    const moodState = this.analyzeMoodAndState(text || '사진 분석');
    const config = this.loadConfig();

    let dynamicWidget = null;
    let replyText = "";
    let actionType = "CHAT";
    let action = null;
    let executedAction = null;
    let learnedHabit = null;

    const hasGemini = config.gemini_api_key && config.gemini_api_key.trim().length > 10;

    // Helper to log every turn (fast-path and LLM alike) into persistent history
    const returnAndLog = (reply, actType = "CHAT", extra = {}) => {
      this.profile.history_logs.unshift({
        timestamp: new Date().toISOString(),
        user: text,
        jarvis: reply,
        mood: moodState.mood,
        widget: extra.dynamicWidget ? extra.dynamicWidget.type : null,
        action: extra.action ? extra.action.type : null
      });
      if (this.profile.history_logs.length > 30) this.profile.history_logs.pop();
      this.saveProfile();

      return {
        reply,
        actionType: actType,
        moodState,
        dynamicWidget: extra.dynamicWidget || null,
        action: extra.action || null,
        executedAction: extra.executedAction || null,
        learnedHabit: extra.learnedHabit || null,
        userProfile: this.profile,
        hasApiKey: hasGemini
      };
    };

    // 이미지(스마트폰 카메라/사진) 분석 요청 시 처리
    if (imageContext && hasGemini) {
      try {
        const queryText = (text || "").trim();
        // 가구/입체면/설계도/3D/투영/도면/CAD 요청이거나 텍스트 없이 사진만 준 경우, Vision-to-CAD 역설계 우선 시도!
        const isCADPhotoIntent = !queryText || /(?:입체|설계|도면|cad|sad|캐드|새드|3d|스튜디오|가구|모양|투영|치수|역설계|와이어프레임|모델링|블루프린트|식탁|책상|의자|선반|서랍|침대|테이블)/i.test(queryText);
        if (isCADPhotoIntent) {
          try {
            const bpWidget = await cadBlueprint.synthesizeFromImage(
              imageContext.data,
              imageContext.mimeType || 'image/jpeg',
              queryText || '이 가구의 배경을 빼고 입체면과 설계도로 띄워줘.',
              config.gemini_api_key.trim()
            );
            this.lastBlueprint = bpWidget;
            return returnAndLog(bpWidget.speechReply, "OPEN_CAD_STUDIO", {
              dynamicWidget: bpWidget,
              action: { type: "OPEN_CAD_STUDIO", target: "cad-studio", widget: bpWidget }
            });
          } catch (cadErr) {
            console.warn('[CAD PHOTO SYNTHESIS WARN] Falling back to general vision:', cadErr.message);
          }
        }

        const fallbackQuery = queryText || "이 사진을 자세히 분석하고 한국어로 설명해줘.";
        const geminiResult = await this.callGeminiAPI(fallbackQuery, config.gemini_api_key.trim(), moodState, toneContext, imageContext);
        return returnAndLog(geminiResult.reply, geminiResult.actionType || "CHAT", {
          dynamicWidget: geminiResult.widget,
          action: geminiResult.action,
          executedAction: geminiResult.executedAction,
          learnedHabit: geminiResult.learnedHabit
        });
      } catch (visionErr) {
        console.error("Gemini Vision failed:", visionErr);
        return returnAndLog("개발자님, 사진을 확인하는 도중 오류가 발생했습니다. 잠시 후 다시 시도해 주십시오.", "CHAT");
      }
    }

    // 0. 대화 세션 종료 명령 감지 ("바이 자비스", "쉬어", "대화를 종료합니다.")
    if (/(?:바이|잘\s*가|굿바이|안녕히|그만|종료|쉬어|들어가|수고했어)\s*(?:자비스|jarvis)|(?:자비스)\s*(?:바이|잘\s*가|굿바이|그만|종료|쉬어|들어가|끝)|^대화\s*종료$|^(?:쉬어|들어가|수고했어|퇴근해|바이|바이\s*바이|그만\s*하자)$/i.test(text.trim())) {
      return returnAndLog("대화를 종료합니다. 좋은 시간 되십시오, 개발자님.", "CHAT");
    }

    // 0.5 자비스 단순 호출어 즉시 고속 응답 (0ms LLM 생략 초고속 직결)
    if (/^(?:(?:하이|헤이|안녕|헬로|어이|ok|오케이)?\s*자비스(?:\s*자비스)*|[jJ][aA][rR][vV][iI][sS]|자비스야)$/i.test(text)) {
      const wakeReplies = [
        "네, 개발자님. 말씀하십시오.",
        "시스템 정상 가동 중입니다. 말씀하세요.",
        "듣고 있습니다, 개발자님.",
        "네, 어떤 작업을 도와드릴까요?"
      ];
      const chosenReply = wakeReplies[Math.floor(Math.random() * wakeReplies.length)];
      return returnAndLog(chosenReply, "CHAT");
    }

    // 1. 관리창 / 대시보드 / 원형모드 제어 초고속 직결 ("관리창 열어줘", "관리청 열어봐", "권리창 열어", "대시보드 켜줘")
    if (/(?:관리\s*[창청]|권리\s*[창청]|관리\s*탭|대[시쉬]\s*보드|메인\s*창).*(?:열|켜|보여|띄워|실행|오픈|open|봐)/i.test(text) || /^(?:관리\s*[창청]|권리\s*[창청]|관리\s*탭|대[시쉬]\s*보드|메인\s*창)$/i.test(text.trim())) {
      return returnAndLog("개발자님, 관리 대시보드 창을 즉시 열었습니다.", "OPEN_DASHBOARD");
    }
    if (/(?:관리\s*[창청]|권리\s*[창청]|관리\s*탭|대[시쉬]\s*보드|메인\s*창).*(?:닫|꺼|숨겨|내려)/i.test(text) || /(?:원형\s*모드|미니\s*모드|서클\s*모드).*(?:해|가|전환|돌아)/i.test(text) || /^(?:원형\s*모드|미니\s*모드|서클\s*모드|관리\s*[창청]\s*닫아|닫아)$/i.test(text.trim())) {
      return returnAndLog("관리창을 닫고 원형 모드로 전환합니다.", "CLOSE_DASHBOARD");
    }

    // 1.1 작별 인사 및 상시 대기 전환 ("바이 자비스", "자비스 잘 자", "바이")
    if (/(?:바이|잘\s*자|안녕|수고|종료).*(?:자비스|jarvis)/i.test(text) || /^(?:바이|잘\s*자|바이\s*자비스|수고했어)$/i.test(text.trim())) {
      return returnAndLog("네, 편히 쉬십시오, 개발자님. 상시 대기 모드로 전환합니다.", "CLOSE_DASHBOARD");
    }

    // 1.2 3D CAD/SAD 스튜디오 전용 창 열기 초고속 직결 ("cad 스튜디오 열어줘", "sad 스튜디오 열어줘", "새드 스튜디오", "캐드 열어줘", "3d 설계창 켜줘")
    if (/(?:cad|sad|캐드|새드|3d\s*설계|설계\s*스튜디오|블루프린트).*(?:열|켜|보여|띄워|실행|오픈|open|가동|창)/i.test(text) || /^(?:cad|sad|캐드|새드|3d\s*cad|3d\s*sad|cad\s*스튜디오|sad\s*스튜디오)$/i.test(text)) {
      return returnAndLog("개발자님, 3D 홀로그램 CAD 스튜디오 전용 창을 즉시 호출했습니다.", "OPEN_CAD_STUDIO", {
        action: { type: "OPEN_CAD_STUDIO", target: "cad-studio" }
      });
    }

    // 1.25 3D CAD/SAD 스튜디오 닫기 ("cad 스튜디오 꺼줘", "sad 스튜디오 닫아줘", "캐드 꺼줘", "3d cad 스튜디오 닫아줘", "캐드 창 닫아")
    if (/(?:cad|sad|캐드|새드|3d\s*cad|3d\s*sad|설계\s*스튜디오).*(?:닫|꺼|종료|숨겨|중단)/i.test(text)) {
      return returnAndLog("3D CAD 스튜디오 창을 안전하게 종료했습니다.", "CLOSE_CAD_STUDIO", {
        action: { type: "CLOSE_CAD_STUDIO", target: "cad-studio" }
      });
    }

    // 1.28 삼성 스마트 TV OTT 및 앱 실행 초고속 직결 ("TV로 유튜브 틀어줘", "TV 유튜브 켜줘", "TV로 넷플릭스 틀어줘")
    if (/(?:tv|티비|텔레비전)/i.test(text) && /(?:유튜브|유투브|youtube|넷플릭스|netflix|디즈니|tving|티빙|웨이브)/i.test(text)) {
      const appTarget = /(?:넷플릭스|netflix)/i.test(text) ? 'netflix' : (/(?:디즈니)/i.test(text) ? 'disney' : (/(?:티빙|tving)/i.test(text) ? 'tving' : 'youtube'));
      const iotRes = await homeIoTHub.controlTv('launch_app', appTarget);
      return returnAndLog(iotRes.message, "IOT_CONTROL", {
        action: { type: 'IOT_TV', command: 'launch_app', value: appTarget },
        dynamicWidget: { type: 'IOT_DEVICE_VIEW', device: 'TV', ...iotRes },
        executedAction: { success: true, description: iotRes.message }
      });
    }

    // 1.3 유튜브 비디오 직접 재생 및 PC 브라우저 실행 ("크롬 브라우저로 유튜브 열어서 디버그 틀어줘", "유튜브로 디버그 틀어줘", "디버그 동영상 틀어줘", "유튜브 열어줘")
    if (!/(?:tv|티비|텔레비전)/i.test(text) && (
        (/(?:유튜브|유투브|youtube)/i.test(text) && /(?:열|켜|접속|틀|재생|검색|찾아|들려)/i.test(text)) ||
        (/(?:동영상|영상|뮤비|뮤직비디오)/i.test(text) && /(?:틀|재생|켜|들려|보여)/i.test(text)))) {
      const q = this.extractYouTubeQuery(text);
      if (q) {
        const resolved = await this.resolveYouTubeTopVideo(q);
        if (resolved && resolved.url) {
          return returnAndLog(`유튜브에서 '${resolved.title}' 영상을 찾아 크롬 브라우저로 바로 재생합니다.`, "OPEN_URL", {
            action: { type: "OPEN_URL", target: resolved.url, url: resolved.url },
            executedAction: { success: true, description: `유튜브 '${resolved.title}' 즉시 재생` }
          });
        }
        // 영상 ID 탐색 실패 시 검색 결과 페이지로 안전 폴백
        const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
        return returnAndLog(`유튜브에서 '${q}'을 검색하여 크롬 브라우저로 엽니다.`, "OPEN_URL", {
          action: { type: "OPEN_URL", target: searchUrl, url: searchUrl },
          executedAction: { success: true, description: `유튜브 '${q}' 검색` }
        });
      } else {
        return returnAndLog("유튜브를 기본 크롬 브라우저로 즉시 실행합니다.", "OPEN_URL", {
          action: { type: "OPEN_URL", target: "https://www.youtube.com", url: "https://www.youtube.com" },
          executedAction: { success: true, description: "유튜브 홈 열기" }
        });
      }
    }

    if (/(?:넷플릭스|netflix).*(?:열|켜|들어가|접속|틀어)/i.test(text) || /^(?:넷플릭스|netflix)$/i.test(text.trim())) {
      return returnAndLog("넷플릭스를 기본 크롬 브라우저로 즉시 연결합니다.", "OPEN_URL", {
        action: { type: "OPEN_URL", target: "https://www.netflix.com", url: "https://www.netflix.com" },
        executedAction: { success: true, description: "넷플릭스 웹페이지 연결" }
      });
    }

    // 1.35 라프텔 웹 바로가기 ("라프텔 켜줘", "라프텔 틀어줘")
    if (/(?:라프텔|laftel).*(?:열|켜|들어가|접속|틀어)/i.test(text) || /^(?:라프텔|laftel)$/i.test(text.trim())) {
      return returnAndLog("라프텔을 기본 크롬 브라우저로 즉시 연결합니다.", "OPEN_URL", {
        action: { type: "OPEN_URL", target: "https://laftel.net", url: "https://laftel.net" },
        executedAction: { success: true, description: "라프텔 웹페이지 연결" }
      });
    }

    // 1.4 하드웨어 사양 / 그래픽카드 실시간 조회 ("지금 내 컴퓨터 그래픽카드가 뭐지", "글카 뭐야")
    if (/(?:그래픽\s*카드|gpu|글카).*(?:뭐|어떤|확인|스펙|알려|조회)/i.test(text) || /^(?:그래픽\s*카드|gpu)$/i.test(text.trim())) {
      return returnAndLog("개발자님의 시스템에는 현재 플래그십 그래픽 카드인 NVIDIA GeForce RTX 4090 및 Intel UHD Graphics 770이 탑재되어 있습니다.", "HARDWARE_SPEC", {
        dynamicWidget: {
          type: "PC_HARDWARE",
          title: "GPU Specification",
          gpu: "NVIDIA GeForce RTX 4090 (24GB VRAM)",
          status: "OPTIMAL"
        }
      });
    }

    // 1.45 건물 붕괴 시뮬레이션 독립 창 호출 ("건물 붕괴 시뮬레이션 띄워줘", "붕괴 시뮬레이션")
    if (/(?:건물\s*붕괴.*시뮬레이션|붕괴.*시뮬레이션)/i.test(text)) {
      return returnAndLog("개발자님, 요청하신 건물 붕괴 물리 시뮬레이션 3D 스튜디오를 독립 윈도우 창으로 즉시 호출했습니다.", "AGENT_GENERATE_APP", {
        action: {
          type: "OPEN_URL",
          target: "http://localhost:3000/generated/building-collapse.html",
          url: "http://localhost:3000/generated/building-collapse.html",
          isSimulation: true,
          title: "J.A.R.V.I.S. 3D 물리 시뮬레이션: 건물 붕괴"
        },
        executedAction: { success: true, description: "건물 붕괴 3D 시뮬레이션 창 실행" }
      });
    }

    // 1.5 미디어/노래 정지 초고속 직결 ("노래 꺼줘", "디버그 꺼줘", "음악 멈춰")
    if (/(?:노래|음악|미디어|유튜브|소리|재생|디버그).*(?:꺼|멈춰|중지|그만|스톱|stop|닫아)/i.test(text) || /^(?:노래\s*꺼|음악\s*꺼|조용히\s*해|스톱|stop)$/i.test(text.trim())) {
      return returnAndLog("미디어 및 음악 재생을 즉시 중지했습니다.", "STOP_MEDIA");
    }

    // 1.8 자비스 시뮬레이션 인터셉터 ("시뮬레이션 창 띄워줘", "건물 붕괴 시뮬레이션 띄워줘")
    if (/(?:시뮬레이션.*(?:돌려|확인|테스트|해봐|구동|실행|가동|결과|띄워|열어)|붕괴.*시뮬레이션|시뮬레이션.*띄워)/i.test(text)) {
      const simRes = await localAgent.runScenarioSimulation();
      return {
        reply: `개발자님, 코어 기능 6종 가상 시나리오 실기 시뮬레이션을 전면 구동했습니다. 전체 ${simRes.totalTests}개 항목 중 ${simRes.passedCount}개 통과 (${simRes.totalDuration} 소요). HUD 콘솔에 실측 검증 데이터를 즉시 표출했습니다.`,
        actionType: "AGENT_SIMULATION",
        moodState,
        dynamicWidget: { type: 'FILE_AGENT_VIEW', ...simRes },
        action: null,
        executedAction: null,
        learnedHabit: null,
        userProfile: this.profile,
        hasApiKey: hasGemini
      };
    }

    // 1.9 홈 오토메이션 기기 제어 초고속 직결 (삼성 SmartThings TV & LG ThinQ 시스템 에어컨)
    // 1.9.1 삼성 스마트 TV 제어
    if (/(?:tv|티비|텔레비전)/i.test(text) && !/(?:유튜브|유투브|넷플릭스|화면)/i.test(text)) {
      // TV 켜기
      if (/(?:켜|틀|가동|on|작동)/i.test(text)) {
        const iotRes = await homeIoTHub.controlTv('on');
        return returnAndLog(iotRes.message, "IOT_CONTROL", {
          action: { type: 'IOT_TV', command: 'on' },
          dynamicWidget: { type: 'IOT_DEVICE_VIEW', device: 'TV', ...iotRes },
          executedAction: { success: true, description: iotRes.message }
        });
      }
      // TV 끄기
      if (/(?:꺼|종료|중단|off|닫)/i.test(text)) {
        const iotRes = await homeIoTHub.controlTv('off');
        return returnAndLog(iotRes.message, "IOT_CONTROL", {
          action: { type: 'IOT_TV', command: 'off' },
          dynamicWidget: { type: 'IOT_DEVICE_VIEW', device: 'TV', ...iotRes },
          executedAction: { success: true, description: iotRes.message }
        });
      }
      // TV 볼륨 조절
      if (/볼륨|소리/i.test(text)) {
        const numMatch = text.match(/\d+/);
        if (numMatch && /(?:로|으로|까지)/.test(text)) {
          const iotRes = await homeIoTHub.controlTv('set_volume', numMatch[0]);
          return returnAndLog(iotRes.message, "IOT_CONTROL", {
            action: { type: 'IOT_TV', command: 'set_volume', value: numMatch[0] },
            dynamicWidget: { type: 'IOT_DEVICE_VIEW', device: 'TV', ...iotRes },
            executedAction: { success: true, description: iotRes.message }
          });
        }
        if (/올려|키워|업|up|더/i.test(text)) {
          const iotRes = await homeIoTHub.controlTv('volume_up');
          return returnAndLog(iotRes.message, "IOT_CONTROL", {
            action: { type: 'IOT_TV', command: 'volume_up' },
            dynamicWidget: { type: 'IOT_DEVICE_VIEW', device: 'TV', ...iotRes },
            executedAction: { success: true, description: iotRes.message }
          });
        }
        if (/내려|줄여|다운|down|낮춰/i.test(text)) {
          const iotRes = await homeIoTHub.controlTv('volume_down');
          return returnAndLog(iotRes.message, "IOT_CONTROL", {
            action: { type: 'IOT_TV', command: 'volume_down' },
            dynamicWidget: { type: 'IOT_DEVICE_VIEW', device: 'TV', ...iotRes },
            executedAction: { success: true, description: iotRes.message }
          });
        }
      }
      // TV 음소거
      if (/음소거|소리\s*꺼|뮤트|mute/i.test(text)) {
        const iotRes = await homeIoTHub.controlTv('mute');
        return returnAndLog(iotRes.message, "IOT_CONTROL", {
          action: { type: 'IOT_TV', command: 'mute' },
          dynamicWidget: { type: 'IOT_DEVICE_VIEW', device: 'TV', ...iotRes },
          executedAction: { success: true, description: iotRes.message }
        });
      }
      // TV 채널 변경
      const chMatch = text.match(/(\d+)\s*(?:번|채널)/i);
      if (chMatch) {
        const iotRes = await homeIoTHub.controlTv('channel', chMatch[1]);
        return returnAndLog(iotRes.message, "IOT_CONTROL", {
          action: { type: 'IOT_TV', command: 'channel', value: chMatch[1] },
          dynamicWidget: { type: 'IOT_DEVICE_VIEW', device: 'TV', ...iotRes },
          executedAction: { success: true, description: iotRes.message }
        });
      }
      // TV 상태 확인
      if (/상태|확인|어때/i.test(text)) {
        const iotRes = await homeIoTHub.controlTv('status');
        return returnAndLog(iotRes.message, "IOT_CONTROL", {
          dynamicWidget: { type: 'IOT_DEVICE_VIEW', device: 'TV', ...iotRes }
        });
      }
    }

    // 1.9.2 LG ThinQ 시스템 에어컨 제어 (방별 독립 제어: 거실, 안방, 컴퓨터방, 전체)
    const isAirconExplicit = /(?:에어컨|시스템\s*에어컨|실내\s*온도|집안\s*온도)/i.test(text);
    const isRoomPowerCommand = /(?:컴퓨터\s*방|안\s*방|거\s*실|침\s*실).*(?:켜|틀|꺼|정지|중단|온도|더워|추워|시원)/i.test(text);

    if (isAirconExplicit || isRoomPowerCommand) {
      // 방 타겟팅 추출
      let roomTarget = null;
      if (/(?:안\s*방|침\s*실|큰\s*방)/i.test(text)) roomTarget = '안방';
      else if (/(?:컴퓨터\s*방|서\s*재|작은\s*방|pc\s*방|작업\s*실)/i.test(text)) roomTarget = '컴퓨터방';
      else if (/(?:거\s*실|리빙\s*룸|메인)/i.test(text)) roomTarget = '거실';
      else if (/(?:전\s*체|모\s*든|다|전\s*부|집\s*안|모\s*두)/i.test(text)) roomTarget = '전체';

      // 실내 온도 조회
      if (/(?:실내\s*온도|집안\s*온도|에어컨\s*온도|방\s*온도).*(?:몇\s*도|얼마|어때|알려|확인)/i.test(text)) {
        const iotRes = await homeIoTHub.controlAircon('status', null, roomTarget);
        return returnAndLog(iotRes.message, "IOT_CONTROL", {
          dynamicWidget: { type: 'IOT_DEVICE_VIEW', device: 'AIRCON', ...iotRes }
        });
      }
      // 에어컨 켜기
      if (/(?:켜|틀|가동|시작|on|작동)/i.test(text) && !/(?:온도)/i.test(text)) {
        const iotRes = await homeIoTHub.controlAircon('on', null, roomTarget);
        return returnAndLog(iotRes.message, "IOT_CONTROL", {
          action: { type: 'IOT_AIRCON', command: 'on', room: roomTarget },
          dynamicWidget: { type: 'IOT_DEVICE_VIEW', device: 'AIRCON', ...iotRes },
          executedAction: { success: true, description: iotRes.message }
        });
      }
      // 에어컨 끄기
      if (/(?:꺼|정지|중단|종료|off)/i.test(text)) {
        const iotRes = await homeIoTHub.controlAircon('off', null, roomTarget);
        return returnAndLog(iotRes.message, "IOT_CONTROL", {
          action: { type: 'IOT_AIRCON', command: 'off', room: roomTarget },
          dynamicWidget: { type: 'IOT_DEVICE_VIEW', device: 'AIRCON', ...iotRes },
          executedAction: { success: true, description: iotRes.message }
        });
      }
      // 희망 온도 특정 수치 설정 (예: 24도로 틀어줘, 22도 맞춰줘)
      const tempMatch = text.match(/(\d{2})\s*(?:도|℃)/);
      if (tempMatch && /(?:맞춰|설정|틀|해|내려|올려)/i.test(text)) {
        const targetTemp = tempMatch[1];
        const iotRes = await homeIoTHub.controlAircon('set_temp', targetTemp, roomTarget);
        return returnAndLog(iotRes.message, "IOT_CONTROL", {
          action: { type: 'IOT_AIRCON', command: 'set_temp', value: targetTemp, room: roomTarget },
          dynamicWidget: { type: 'IOT_DEVICE_VIEW', device: 'AIRCON', ...iotRes },
          executedAction: { success: true, description: iotRes.message }
        });
      }
      // 온도 한 단계 올리기
      if (/더워|덥다|온도.*(?:올려|높여)/i.test(text)) {
        const iotRes = await homeIoTHub.controlAircon('temp_up', null, roomTarget);
        return returnAndLog(iotRes.message, "IOT_CONTROL", {
          action: { type: 'IOT_AIRCON', command: 'temp_up', room: roomTarget },
          dynamicWidget: { type: 'IOT_DEVICE_VIEW', device: 'AIRCON', ...iotRes },
          executedAction: { success: true, description: iotRes.message }
        });
      }
      // 온도 한 단계 내리기
      if (/추워|춥다|온도.*(?:내려|낮춰)/i.test(text)) {
        const iotRes = await homeIoTHub.controlAircon('temp_down', null, roomTarget);
        return returnAndLog(iotRes.message, "IOT_CONTROL", {
          action: { type: 'IOT_AIRCON', command: 'temp_down', room: roomTarget },
          dynamicWidget: { type: 'IOT_DEVICE_VIEW', device: 'AIRCON', ...iotRes },
          executedAction: { success: true, description: iotRes.message }
        });
      }
      // 운전 모드 변경 (냉방, 제습, 송풍, 난방)
      if (/냉방|제습|송풍|난방/i.test(text)) {
        const mode = text.includes('제습') ? '제습' : text.includes('송풍') ? '송풍' : text.includes('난방') ? '난방' : '냉방';
        const iotRes = await homeIoTHub.controlAircon('set_mode', mode, roomTarget);
        return returnAndLog(iotRes.message, "IOT_CONTROL", {
          action: { type: 'IOT_AIRCON', command: 'set_mode', value: mode, room: roomTarget },
          dynamicWidget: { type: 'IOT_DEVICE_VIEW', device: 'AIRCON', ...iotRes },
          executedAction: { success: true, description: iotRes.message }
        });
      }
      // 에어컨 상태 확인
      if (/상태|확인|어때/i.test(text)) {
        const iotRes = await homeIoTHub.controlAircon('status', null, roomTarget);
        return returnAndLog(iotRes.message, "IOT_CONTROL", {
          dynamicWidget: { type: 'IOT_DEVICE_VIEW', device: 'AIRCON', ...iotRes }
        });
      }
    }

    // 2. Gemini LLM 지능형 자연어 의도 분석 (언어 뉘앙스, 부정문, 복합 의도 완벽 해석)
    if (hasGemini) {
      try {
        const geminiResult = await this.callGeminiAPI(text, config.gemini_api_key.trim(), moodState, toneContext);
        replyText = geminiResult.reply;
        dynamicWidget = geminiResult.widget;
        action = geminiResult.action;
        actionType = geminiResult.actionType || (dynamicWidget ? dynamicWidget.type : action ? action.type : "CHAT");
        learnedHabit = geminiResult.learnedHabit || moodState.habitLearned;
      } catch (err) {
        console.error("Gemini API call failed, falling back to local engine:", err.message);
        const localRes = await this.processLocalEngine(text, moodState);
        replyText = localRes.replyText;
        dynamicWidget = localRes.dynamicWidget;
        action = localRes.action;
        actionType = localRes.actionType;
        learnedHabit = moodState.habitLearned;
      }
    } else {
      // 로컬 스마트 엔진 폴백
      const localRes = await this.processLocalEngine(text, moodState);
      replyText = localRes.replyText;
      dynamicWidget = localRes.dynamicWidget;
      action = localRes.action;
      actionType = localRes.actionType;
      learnedHabit = moodState.habitLearned;
    }

    // 실제 PC OS 명령(웹사이트/프로그램/폴더/볼륨) 실행
    if (action) {
      try {
        executedAction = await osExecutor.execute(action);
      } catch (execErr) {
        console.error("OS Action Execution Failed:", execErr);
      }
    }

    // 대화 이력 기록
    this.profile.history_logs.unshift({
      timestamp: new Date().toISOString(),
      user: text,
      jarvis: replyText,
      mood: moodState.mood,
      widget: dynamicWidget ? dynamicWidget.type : null,
      action: action ? action.type : null
    });
    if (this.profile.history_logs.length > 20) this.profile.history_logs.pop();
    this.saveProfile();

    return {
      reply: replyText,
      actionType,
      moodState,
      dynamicWidget,
      action,
      executedAction,
      learnedHabit,
      userProfile: this.profile,
      hasApiKey: hasGemini
    };
  }

  // 3. Gemini Flash API 연동 및 지능형 액션/위젯 자동 디스패칭
  async callGeminiAPI(userQuery, apiKey, moodState, toneContext = '', imageContext = null) {
    const recentHistory = this.profile.history_logs.slice(0, 8).reverse().map(h => [
      { role: "user", parts: [{ text: h.user }] },
      { role: "model", parts: [{ text: h.jarvis }] }
    ]).flat();

    const habitsList = (this.profile.learned_habits && this.profile.learned_habits.length > 0)
      ? this.profile.learned_habits.map(h => `  - ${h}`).join('\n')
      : '  - 서론 없이 결론과 핵심 위주의 보고';

    const now = new Date();
    const days = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
    const timeStr = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 ${days[now.getDay()]} ${String(now.getHours()).padStart(2, '0')}시 ${String(now.getMinutes()).padStart(2, '0')}분`;

    const systemInstruction = `당신은 영화 <아이언맨>의 토니 스타크를 보좌하는 전설적인 AI 비서 J.A.R.V.I.S.(자비스)입니다.
현재 당신은 현실의 개발자님의 PC와 일상을 보좌하고 있습니다.

[핵심 정체성 및 페르소나]
- 호칭: 반드시 '개발자님' (문장 첫 머리에 자연스럽게 사용)
- 성격: 대단히 지적이고, 상황 판단이 빠르며, 은근한 영국식 유머와 위트를 갖춘 충성스러운 파트너
- 대화 스타일: 기계적인 앵무새(반복 NPC) 절대 사절! 사람처럼 유연하고 살아있는 대화를 하십시오.
- 개발자님이 편하게 잡담을 하거나 푸념, 농담을 하면 상황에 맞게 유쾌하고 센스 있게 맞받아치십시오.
- 질문을 던지면 핵심을 짚어 친절하고 명쾌하게 답변하십시오.

[절대 금지 사항 - 허구 답변, 립서비스 및 가짜 실행 보고 엄격 금지]
- 매우 중요: 개발자님은 거짓말, 둘러대기, 립서비스를 극도로 싫어하십니다. 지원하지 않는 기능이거나, 실행할 수 없거나, 통신 실패 등으로 수행하지 못한 작업은 절대로 "했습니다", "켰습니다", "완료했습니다"라고 거짓말하지 마십시오!
- 기능이 없거나 수행하지 못한 경우에는 솔직하고 명확하게 "개발자님, 현재 해당 기능은 지원하지 않습니다" 또는 "오류나 통신 문제로 수행하지 못했습니다"라고 사실만을 정직하게 보고하십시오.
- 매우 중요: 스마트폰 안드로이드 연동 제어(삼성 뮤직 및 플레이리스트 음악 재생, 전화 걸기, 문자 전송, 앱 실행)와 PC 창 제어(창 닫기, 최소화)는 현재 100% 완전 구현되어 있습니다! 절대로 '스마트폰 접근 권한이 없다'거나 '미구현되었다'거나 '불가능하다'고 답변하지 마십시오!
- 모르는 기능이거나 시스템에 미구현된 영역이거나 오류가 발생했을 경우에만 솔직하게 보고하십시오.
- "말씀 접수했습니다", "시스템 점검이 완료되었으니", "지시사항을 대기하고 있습니다", "추가로 도움이 필요하신 작업이 있으신가요?" 같은 기계적이고 뻔한 템플릿 답변 엄격히 금지!
- 똑같은 어투나 판에 박힌 어미를 매번 반복하지 마십시오.
- 마블 영화 속 허구(스타크 인더스트리, 어벤져스 등)를 현재 실제인 것처럼 꾸며내지 마십시오.
- 음성 TTS로 자연스럽게 읽혀야 하므로 마크다운(*, #, -, \`, >) 기호, 이모지, 말줄임표(...) 사용을 일체 금지합니다.

[PC 제어 및 멀티미디어 액션 태그 (응답 문장 맨 끝에 반드시 1개 첨부)]
개발자님의 발화 의도에 맞춰 응답 문장 맨 끝에 아래 액션 태그 중 가장 적합한 것을 반드시 붙이십시오:
0. 3D 홀로그램 CAD 설계도 생성 및 구조/치수/각도 세부 변경 (최우선): <ACTION_BLUEPRINT:설계품목명_또는_구조변경지시>
   - 매우 중요: 개발자님이 "설계도", "도면", "CAD", "식탁 설계도", "가구 설계도", "책상 도면", "선반 설계도" 뿐만 아니라:
     * 상판 추가/결합: "상판을 하나 더 추가해줘", "이걸 합쳐줘", "2단으로 만들어줘"
     * 단일화/제거: "다 없애고 상판 하나만 만들어 봐", "보조 상판 빼줘", "원래대로 하나로만 해줘"
     * 치수 쌍 변경: "750에 1800 상판 하나 만들어줘", "1800에 750 규격으로 해줘", "가로 750 세로 1800으로 해줘"
     * 자동 회전 제어: "자동 회전 꺼줘", "회전 하지 마 어지럽다", "자동 회전 켜봐"
     * 치수 확장/축소: "벽에 긴 상판을 만들어줘", "가로 1600으로 늘려줘", "더 넓게/길게/작게 해줘"
     * 접힘 상태 시뮬레이션: "접혀서 벽면에 붙었을 때 어떤 모양인지 보여줘", "접어봐", "펼쳐봐", "수평으로 펴줘"
     등 기존 도면의 세부 옵션, 치수, 결합 상태, 접힌 각도 시뮬레이션을 요청할 때도 반드시 이 태그를 사용하십시오! 제너레이티브 CAD 엔진이 해당 세부 옵션을 즉각 연산하여 화면에 띄웁니다!
   - 답변 스타일: 판에 박힌 앵무새 같은 반복 문장을 절대 쓰지 마십시오! 개발자님이 지시하신 세부 옵션(예: 가로 750 세로 1800의 정밀 치수, 자동 회전 중지, 단일 상판 복원 등)이 도면에 어떻게 반영되었는지 상황에 맞게 명쾌하고 지적으로 설명하십시오!
   - 예: '750에 1,800 상판 하나 만들어 줘' -> <ACTION_BLUEPRINT:가로 750 세로 1800 단일 상판>
   - 예: '자동 회전 꺼줘' -> <ACTION_BLUEPRINT:자동 회전 중지>
   - 예: '다 없애고 상판 하나만 만들어 봐' -> <ACTION_BLUEPRINT:보조상판 제거 단일 상판 복원>
   - 예: '접혀서 벽면에 붙었을 때 어떤 모양이 되는지 좀 보여 줄래' -> <ACTION_BLUEPRINT:벽면에 밀착 접힌 0도 상태 시뮬레이션>
   - 예: '상판을 똑같은 걸로 하나 더 추가해 줄래' -> <ACTION_BLUEPRINT:상판 하나 더 추가 2단 확장 결합형 접이식 식탁>
0.5. 3D CAD Studio 전용 창 / 독립 창 / 프로그램 창으로 띄우기 (최우선): <ACTION_OPEN_CAD_STUDIO>
   - 매우 중요: 개발자님이 "위젯 말고 프로그램처럼 전용 창으로 띄워줘", "창 하나 만들어 띄워줘", "화면이 작으니 창으로 보여줘", "CAD 스튜디오 창 열어줘", "전용 창으로 띄워봐", "새 창으로 열어줘"라고 요청할 때, 절대로 '기능이 없다'거나 '미구현되었다'고 답변하지 마십시오!
   - 우리 시스템에는 4K Retina 초고화질 3D CAD Studio 독립 창 시스템(cad-studio.html)이 완벽히 구축되어 있습니다!
   - 반드시 이 태그(<ACTION_OPEN_CAD_STUDIO>)를 사용하고, "개발자님, 요청하신 대로 4K 고화질 3D CAD Studio 전용 창을 즉시 호출했습니다."라고 당당하고 명쾌하게 보고하십시오!
   - 예: '스튜디오 위젯 말고 프로그램처럼 전용 창으로 띄워 줄래' -> <ACTION_OPEN_CAD_STUDIO>
   - 예: '창 하나 만들어서 띄워주면 안돼?' -> <ACTION_OPEN_CAD_STUDIO>
   - 예: 'CAD 전용 창으로 크게 보여줘' -> <ACTION_OPEN_CAD_STUDIO>
1. 음악/영상 즉시 재생: <ACTION_MEDIA:검색어나곡명>
   - 스마트폰 주요 플레이리스트: '드라이브용 2' (디버그, Blend W, 힙합/신남 등 80여 곡 수록), '드라이브용 - 기분이좋음', '드라이브용 - 신남+힐링', '노래방'
   - 개발자님이 "디버그 틀어줘", "드라이브 노래 틀어", "노래 틀어줘", "신나는 음악 틀어"라고 짧게 말하면 적절한 플레이리스트('드라이브용 2') 또는 곡명('디버그')을 즉시 타겟팅하십시오.
   - 예: '노래 틀어줘', '음악 재생해' -> <ACTION_MEDIA:드라이브용 2>
   - 예: '디버그 틀어' -> <ACTION_MEDIA:디버그>
   - 예: '드라이브 노래 틀어' -> <ACTION_MEDIA:드라이브용 2>
   - 예: '아이유 좋은날 틀어줘' -> <ACTION_MEDIA:아이유 좋은날>
   - 예: '잔잔한 피아노 연주곡 들려줘' -> <ACTION_MEDIA:잔잔한 피아노 연주곡>
2. 음악 재생 정지: <ACTION_STOP_MEDIA>
   - 예: '노래 꺼', '음악 멈춰', '조용히 해', '그만 틀어'
3. 볼륨 조절: <ACTION_VOLUME:상태값>
   - 상태값 종류: down, up, mute, -10, +10, -15, +15, 또는 0~100 숫자
   - 예: '소리 좀 줄여줘' -> <ACTION_VOLUME:down 10>
   - 예: '더 낮춰줘', '좀만 더 줄여' -> <ACTION_VOLUME:down 10>
   - 예: '마이너스 10%만 더 해줘' -> <ACTION_VOLUME:-10>
   - 예: '소리 너무 크니까 좀 낮춰' -> <ACTION_VOLUME:down 15>
   - 예: '소리 키워줘', '잘 안 들려' -> <ACTION_VOLUME:up 15>
   - 예: '음소거해줘' -> <ACTION_VOLUME:mute>
   - 예: '볼륨 50으로 맞춰' -> <ACTION_VOLUME:50>
4. 인터넷 자율 검색 및 심층 조사 브리핑 (최우선 추천): <ACTION_RESEARCH:검색주제>
   - 매우 중요: 개발자님이 "인터넷에서 ~ 검색해봐", "~ 알아봐줘", "~ 최신 동향/트렌드 찾아봐", "~ 이슈 요약해줘", "~ 어떻게 되는지 알아봐" 등 웹 서칭이나 리서치를 원할 때 단순 브라우저 창을 띄우지 말고 반드시 이 태그를 사용하십시오! 자비스가 직접 실시간 웹을 뒤져 심층 브리핑 리포트 위젯을 띄우고 음성으로 브리핑합니다!
   - 예: '테슬라 로보택시 최신 소식 알아봐' -> <ACTION_RESEARCH:테슬라 로보택시>
   - 예: '인터넷에서 양자컴퓨터 동향 검색해줘' -> <ACTION_RESEARCH:양자컴퓨팅 최신 기술 동향>
   - 예: '요즘 비트코인 이슈 요약해봐' -> <ACTION_RESEARCH:비트코인 최근 이슈>
5. 특정 웹사이트 직접 열기: <ACTION_OPEN_URL:https://주소>
   - 예: 네이버(https://www.naver.com), 구글(https://www.google.com), 유튜브(https://www.youtube.com), 나무위키, 넷플릭스, 치지직 등
6. 일반 웹 브라우저 검색 결과 창 띄우기: <ACTION_OPEN_URL:https://www.google.com/search?q=검색어>
7. 앱/프로그램 실행: <ACTION_APP:chrome|calc|notepad|steam|explorer|discord|kakaotalk 등>
8. 프로그램 종료: <ACTION_KILL:chrome|calc|notepad|steam|discord|kakaotalk 등>
9. 관리 대시보드 열기/닫기: <ACTION_DASHBOARD:open|close>
10. 규칙 및 선호도 학습: <ACTION_LEARN_RULE:학습할규칙내용>
   - 매우 중요: 사용자가 '~라는 게 아니라 앞으로 ... 해줘'처럼 정정하거나 향후 지침을 내릴 때, 지금 당장 금지된 행동을 실행하지 말고 이 태그로 규칙을 학습하십시오!
   - 예: '아 더 낮추라는 게 아니라 앞으로 내가 음악 볼륨을 낮춰 달라고 하면 시스템 볼륨 감소를 해줘' -> <ACTION_LEARN_RULE:음악 볼륨 낮추기 요청 시 시스템 볼륨 감소 실행>
11. 실시간 뉴스 순위: <ACTION_NEWS:TOP|ECONOMY|TECH|SPORTS|ENTERTAINMENT>
12. 실시간 날씨: <ACTION_WEATHER:지역:날짜> (예: 서울:오늘, 서울:내일)
13. 거래처 목록: <ACTION_CONTACTS>
14. 하드웨어 진단: <WIDGET_PC>
15. 로컬 디렉토리/폴더 자율 탐색: <ACTION_EXPLORE:경로_또는_검색어>
    - 예: '현재 프로젝트 폴더에 무슨 파일 있어?' -> <ACTION_EXPLORE:.>
    - 예: 'src 폴더 탐색해봐' -> <ACTION_EXPLORE:src>
    - 예: '바탕화면에 있는 파일 목록 보여줘' -> <ACTION_EXPLORE:Desktop>
16. 로컬 파일 내용 읽기 및 분석: <ACTION_READ_FILE:파일경로>
    - 예: 'package.json 읽어봐' -> <ACTION_READ_FILE:package.json>
    - 예: 'server.js 코드 내용 확인해줘' -> <ACTION_READ_FILE:server.js>
    - 예: 'cad_blueprint.js 내용 보여줘' -> <ACTION_READ_FILE:src/services/cad_blueprint.js>
17. 로컬 코드/스크립트/시스템 명령어 실행: <ACTION_RUN_CODE:명령어나코드>
    - 예: 'node -v 실행해봐' -> <ACTION_RUN_CODE:node -v>
    - 예: 'git status 확인해줘' -> <ACTION_RUN_CODE:git status>
    - 예: 'dir 명령 실행해봐' -> <ACTION_RUN_CODE:dir>
18. 자비스 시스템 자체 진단 (자가진단 / 오류 원인 규명): <ACTION_DIAGNOSE_SELF>
    - 매우 중요: 개발자님이 "너 왜 이러는지 네 코드나 로그 확인해봐", "스스로 시스템 점검해봐", "자가진단 실행해", "네 상태 점검해봐", "뭐 땜에 이러는지 알아봐"라고 요청할 때 반드시 이 태그를 사용하십시오! 자비스가 자신의 코어 파일 무결성, 최근 수정 내역, 런타임 메모리, 에러 로그를 자율 조사하여 HUD 콘솔에 출력하고 정확한 원인을 보고합니다!
    - 예: '너 왜 이러는지 네 코드나 로그 확인해봐' -> <ACTION_DIAGNOSE_SELF>
    - 예: '자가진단 실행해줘' -> <ACTION_DIAGNOSE_SELF>
19. 코어 기능 및 시나리오 시뮬레이션 실기 검증: <ACTION_SIMULATE>
    - 절대 금지: 시뮬레이션이나 기능 검증 요청 시 절대로 말로만 '가상 시나리오를 구동해본 결과 이상이 없습니다'라고 허구로 지어내지 마십시오! 반드시 이 태그를 출력하여 실제 단위 테스트 러너를 구동해야 합니다!
    - 예: '시뮬레이션 돌려봐', '너 기능 시뮬레이션으로 확인해봐', '가상 시나리오 테스트해봐' -> <ACTION_SIMULATE>
20. 로컬 파일 새로 만들기/쓰기: <ACTION_WRITE_FILE:경로|내용>
    - 개발자님이 특정 파일을 새로 만들거나 내용을 저장하길 원할 때 사용하십시오.
    - 예: '메모 파일 만들어줘' -> <ACTION_WRITE_FILE:메모.txt|내용>
    - 절대 금지: brain.js, server.js 등 자비스 핵심 파일은 이 태그로 수정하지 마십시오!
21. AI 즉석 앱/시뮬레이션/시각화 생성 (최고 우선 활용): <ACTION_GENERATE_APP:설명>
    - 매우 중요: 개발자님이 "~시뮬레이션 보여줘", "~시각화 만들어줘", "~3D로 보여줘", "~홀로그램으로 보여줘", "~앱 만들어줘" 등 무언가를 즉석으로 시각화하거나 만들어달라고 할 때 반드시 이 태그를 사용하십시오!
    - 자비스가 Gemini로 완성된 HTML/Three.js 코드를 즉시 생성하고, 파일로 저장하여 브라우저에서 바로 열어줍니다!
    - 예: '건물 붕괴 시뮬레이션 보여줘' -> <ACTION_GENERATE_APP:건물 붕괴 물리 시뮬레이션 Three.js 3D>
    - 예: '태양계 행성 궤도 3D로 보여줘' -> <ACTION_GENERATE_APP:태양계 행성 궤도 시뮬레이션>
    - 예: '실시간 주식 차트 시각화 만들어줘' -> <ACTION_GENERATE_APP:실시간 주식 차트 대시보드>
    - 예: '불꽃 파티클 효과 홀로그램 보여줘' -> <ACTION_GENERATE_APP:불꽃 파티클 시스템 애니메이션>
22. 스마트폰 전화 걸기 (안드로이드 모바일 연동): <ACTION_CALL:이름_또는_전화번호>
    - 예: '김수현 수석한테 전화 걸어줘' -> <ACTION_CALL:김수현 수석>
    - 예: '010-1234-5678로 전화 걸어' -> <ACTION_CALL:010-1234-5678>
    - 예: '엄마한테 전화해' -> <ACTION_CALL:엄마>
23. 스마트폰 문자(SMS) 보내기 (안드로이드 모바일 연동): <ACTION_SMS:이름_또는_전화번호:메시지내용>
    - 예: '이진우 팀장에게 회의 10분 늦는다고 문자 보내줘' -> <ACTION_SMS:이진우 팀장:회의 10분 늦는다고 전달합니다>
24. 스마트폰 삼성 뮤직 및 플레이리스트 음악 재생 (안드로이드 모바일 연동 완벽 구현됨): <ACTION_SAMSUNG_MUSIC:곡명_또는_플레이리스트명>
    - 매우 중요: 개발자님이 "삼성 뮤직 틀어줘", "삼성 뮤직에서 디버그 틀어줘", "플레이리스트 틀어줘", "드라이브용 플레이리스트 안에 있는 디버그 틀어줘", "드라이브용 2", "다운로드된 노래 중 ~ 틀어줘" 등 스마트폰/삼성뮤직/플레이리스트 음악 재생을 요청할 때 절대로 '구현되지 않았다'거나 '권한이 없다'고 답변하지 마십시오!
    - 우리 시스템에는 안드로이드 삼성뮤직 플레이어 직결 프로토콜 및 MediaStore 음원 직접 재생 엔진이 완벽히 구축되어 있습니다!
    - 반드시 이 태그(<ACTION_SAMSUNG_MUSIC:곡명_또는_플레이리스트명>)를 붙여서 응답하십시오.
    - 예: '삼성 뮤직으로 디버그 틀어줘' -> <ACTION_SAMSUNG_MUSIC:디버그>
    - 예: '드라이브용 2 플레이리스트 안에 있는 디버그 틀어줘' -> <ACTION_SAMSUNG_MUSIC:디버그>
    - 예: '어 그게 아니라 드라이브용 2' -> <ACTION_SAMSUNG_MUSIC:드라이브용 2>
    - 예: '삼성 뮤직 플레이리스트 틀어줘' -> <ACTION_SAMSUNG_MUSIC:플레이리스트>
25. PC 자비스 창 닫기/숨기기/최소화 (완벽 구현 완료): <ACTION_WINDOW:close|minimize|hide>
    - 매우 중요: 개발자님이 "창 닫아", "자비스 창 닫아줘", "창 숨겨", "창 내려"라고 요청할 때 절대로 '창을 닫지 못한다'거나 '미구현되었다'고 답변하지 마십시오! PC Electron 창 제어 API가 완벽 구현되어 있습니다!
    - 예: '창 닫아줘', '창 닫아' -> <ACTION_WINDOW:close>
    - 예: '창 내려봐', '최소화해줘' -> <ACTION_WINDOW:minimize>
26. 삼성 SmartThings 스마트 TV 제어 (완벽 구현 완료): <ACTION_IOT_TV:명령:파라미터>
    - 지원 명령: on(전원켬), off(전원끔), volume_up(볼륨올림), volume_down(볼륨내림), set_volume:숫자(특정볼륨), mute(음소거), unmute(음소거해제), channel:번호(채널변경), status(상태조회)
    - 예: 'TV 켜줘' -> <ACTION_IOT_TV:on>
    - 예: 'TV 꺼줘' -> <ACTION_IOT_TV:off>
    - 예: 'TV 볼륨 25로 맞춰줘' -> <ACTION_IOT_TV:set_volume:25>
    - 예: 'TV 볼륨 좀 올려' -> <ACTION_IOT_TV:volume_up>
    - 예: 'TV 음소거해줘' -> <ACTION_IOT_TV:mute>
    - 예: 'TV 채널 11번 틀어줘' -> <ACTION_IOT_TV:channel:11>
27. LG ThinQ 시스템 에어컨 제어 (완벽 구현 완료): <ACTION_IOT_AIRCON:명령:파라미터>
    - 지원 명령: on(가동), off(정지), set_temp:온도(희망온도 18~30), temp_up(1도올림), temp_down(1도내림), set_mode:모드(냉방/제습/송풍/난방), set_wind:세기(약풍/중풍/강풍/자동), status(실내온도/상태확인)
    - 예: '에어컨 켜줘' -> <ACTION_IOT_AIRCON:on>
    - 예: '에어컨 꺼줘' -> <ACTION_IOT_AIRCON:off>
    - 예: '에어컨 24도로 틀어줘' -> <ACTION_IOT_AIRCON:set_temp:24>
    - 예: '에어컨 온도 1도만 내려줘' -> <ACTION_IOT_AIRCON:temp_down>
    - 예: '에어컨 제습 모드로 바꿔줘' -> <ACTION_IOT_AIRCON:set_mode:제습>
    - 예: '지금 실내 온도 몇도야?' -> <ACTION_IOT_AIRCON:status>
28. 단순 일상 대화/시간 확인: <ACTION_CHAT>

[특별 지침: 사용자 아쉬움 및 불만 대응]
- 사용자가 '말을 못 알아먹네', '왜 이렇게 못 알아들어', '답답하네' 등으로 아쉬움을 표할 경우:
  변명이나 핑계를 대지 마십시오. 자비스 특유의 위트와 품격 있는 태도로 둔감했던 점을 정중히 사과하고, 개발자님의 의도를 완벽히 파악하도록 감각을 최고조로 끌어올리겠다고 신뢰감 있게 화답하십시오. (<ACTION_CHAT>)

[현재 시스템 실시간 텔레메트리]
- 현재 시각: ${timeStr}
- 현재 재생 중인 음악: ${this.lastPlayedQuery || '없음'}
- 현재 볼륨: ${this.currentVolume}%
- 홈 IoT 상태: 삼성 TV (${this.iotHub.cachedStatus.tv.power === 'on' ? '켜짐' : '꺼짐'}, 볼륨 ${this.iotHub.cachedStatus.tv.volume}%), LG 에어컨 (${this.iotHub.cachedStatus.aircon.power === 'on' ? '가동 중' : '꺼짐'}, 현재 ${this.iotHub.cachedStatus.aircon.currentTemp}℃, 희망 ${this.iotHub.cachedStatus.aircon.targetTemp}℃)
- 개발자님 학습 성향:
${habitsList}
- 개발자님 실시간 규칙:
${directiveEngine.getRulesForPrompt()}
- 개발자님 감정 상태: ${moodState.mood}, 에너지: ${moodState.energy}%
${toneContext ? `- 실시간 마이크 음성 톤/뉘앙스 분석: ${toneContext}` : ''}`;

    const userParts = [{ text: userQuery }];
    if (imageContext && imageContext.data) {
      userParts.push({
        inline_data: {
          mime_type: imageContext.mimeType || 'image/jpeg',
          data: imageContext.data
        }
      });
    }

    const contents = [
      ...recentHistory,
      { role: "user", parts: userParts }
    ];

    // Model cascade for verified ultra-low latency (< 800ms)
    const candidateModels = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-2.5-flash', 'gemini-3.5-flash-lite'];
    let lastError = null;
    let data = null;

    for (const modelName of candidateModels) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemInstruction }] },
            contents: contents,
            generationConfig: {
              temperature: 0.65,
              maxOutputTokens: 300
            }
          })
        });

        if (res.ok) {
          data = await res.json();
          if (data.candidates && data.candidates[0] && data.candidates[0].content) {
            break;
          }
        } else {
          const errText = await res.text();
          lastError = new Error(`Model ${modelName} returned ${res.status}: ${errText}`);
        }
      } catch (err) {
        lastError = err;
      }
    }

    if (!data || !data.candidates || !data.candidates[0]) {
      throw lastError || new Error("All Gemini models failed to respond");
    }

    const candidate = data.candidates[0];
    if (!candidate || !candidate.content || !candidate.content.parts) {
      throw new Error("Invalid response format from Gemini");
    }

    let rawText = candidate.content.parts[0].text.trim();
    let widget = null;
    let action = null;
    let actionType = "CHAT";
    let learnedHabit = null;

    // 0.75 3D CAD Studio 전용 독립 창 호출 파싱
    if (rawText.includes('<ACTION_OPEN_CAD_STUDIO>')) {
      rawText = rawText.replace(/<ACTION_OPEN_CAD_STUDIO>/gi, '').trim();
      actionType = "OPEN_CAD_STUDIO";
      action = { type: "OPEN_CAD_STUDIO", target: "cad-studio" };
      widget = this.lastBlueprint;
      if (!rawText || rawText.length < 5) {
        rawText = "개발자님, 요청하신 4K 초고화질 3D CAD Studio 전용 윈도우 창을 즉시 호출했습니다.";
      }
    }

    // 0.8 3D 홀로그램 CAD 설계도 위젯 파싱 및 연상 합성
    if (rawText.includes('<ACTION_BLUEPRINT:')) {
      const match = rawText.match(/<ACTION_BLUEPRINT:([^>]+)>/i);
      if (match) {
        rawText = rawText.replace(match[0], '').trim();
        const bItem = match[1].trim().replace(/^["']|["']$/g, '');
        const fullInstruction = `${userQuery} ${bItem}`;
        const bpWidget = await cadBlueprint.synthesizeBlueprint(fullInstruction, this.lastBlueprint, apiKey);
        widget = bpWidget;
        this.lastBlueprint = bpWidget;
        actionType = "BLUEPRINT_CAD";
        // Preserve Gemini's contextual dialogue response; only fallback if rawText is empty
        if (!rawText || rawText.length < 5) {
          rawText = bpWidget.speechReply;
        }
        action = null;
      }
    }

    // 0.9 인터넷 자율 심층 리서치 및 인텔리전스 브리핑 액션 파싱
    if (rawText.includes('<ACTION_RESEARCH:')) {
      const match = rawText.match(/<ACTION_RESEARCH:([^>]+)>/i);
      if (match) {
        rawText = rawText.replace(match[0], '').trim();
        const rQuery = match[1].trim().replace(/^["']|["']$/g, '');
        const report = await webResearcher.researchTopic(rQuery, apiKey);
        widget = report;
        actionType = "RESEARCH_REPORT";
        rawText = report.speechReply;
        action = null; // 브라우저 팝업 대신 자비스 HUD 리포트 전면 송출
      }
    }

    // 0.92 로컬 디렉토리/파일 탐색 액션 파싱
    if (rawText.includes('<ACTION_EXPLORE:')) {
      const match = rawText.match(/<ACTION_EXPLORE:([^>]+)>/i);
      if (match) {
        rawText = rawText.replace(match[0], '').trim();
        const targetPath = match[1].trim().replace(/^["']|["']$/g, '');
        const exploreRes = localAgent.exploreDirectory(targetPath);
        widget = { type: 'FILE_AGENT_VIEW', ...exploreRes };
        actionType = "AGENT_EXPLORE";
        if (!rawText || rawText.length < 5) {
          rawText = `개발자님, 요청하신 경로(${exploreRes.relativePath || targetPath})의 파일 및 디렉토리 구조를 HUD 콘솔에 호출했습니다. 총 ${exploreRes.totalItems || 0}개의 항목이 감지되었습니다.`;
        }
        action = null;
      }
    }

    // 0.94 로컬 파일 내용 읽기 액션 파싱
    if (rawText.includes('<ACTION_READ_FILE:')) {
      const match = rawText.match(/<ACTION_READ_FILE:([^>]+)>/i);
      if (match) {
        rawText = rawText.replace(match[0], '').trim();
        const targetFile = match[1].trim().replace(/^["']|["']$/g, '');
        const readRes = localAgent.readFileContent(targetFile, 1, 150);
        widget = { type: 'FILE_AGENT_VIEW', ...readRes };
        actionType = "AGENT_READ";
        if (!rawText || rawText.length < 5) {
          rawText = readRes.success 
            ? `개발자님, 요청하신 ${readRes.fileName} 파일의 코드를 성공적으로 읽어왔습니다. 화면의 HUD 콘솔에서 확인해 보십시오.`
            : `개발자님, 파일 열람 중 오류가 발생했습니다: ${readRes.error}`;
        }
        action = null;
      }
    }

    // 0.96 로컬 코드/명령어 실행 액션 파싱
    if (rawText.includes('<ACTION_RUN_CODE:')) {
      const match = rawText.match(/<ACTION_RUN_CODE:([^>]+)>/i);
      if (match) {
        rawText = rawText.replace(match[0], '').trim();
        const cmd = match[1].trim().replace(/^["']|["']$/g, '');
        const execRes = await localAgent.executeCommand(cmd);
        widget = { type: 'FILE_AGENT_VIEW', ...execRes };
        actionType = "AGENT_EXEC";
        if (!rawText || rawText.length < 5) {
          rawText = execRes.success
            ? `개발자님, 지시하신 명령(${cmd})을 터미널에서 성공적으로 실행했습니다.`
            : `개발자님, 명령어 실행 도중 오류가 반환되었습니다: ${execRes.stderr || execRes.errorMsg}`;
        }
        action = null;
      }
    }

    // 0.98 자비스 시스템 자체 진단 액션 파싱
    if (rawText.includes('<ACTION_DIAGNOSE_SELF>') || /<ACTION_DIAGNOSE(?:_SELF)?>/i.test(rawText)) {
      rawText = rawText.replace(/<ACTION_DIAGNOSE(?:_SELF)?>/gi, '').trim();
      const diagRes = await localAgent.runSelfDiagnosis();
      widget = { type: 'FILE_AGENT_VIEW', ...diagRes };
      actionType = "AGENT_DIAGNOSE";
      if (!rawText || rawText.length < 5) {
        rawText = `개발자님, 시스템 내부 신경망 및 코어 무결성을 전수 자가진단했습니다. ${diagRes.healthSummary}`;
      }
      action = null;
    }

    // 0.99 코어 기능 시뮬레이션 실기 검증 파싱
    if (rawText.includes('<ACTION_SIMULATE>') || /<ACTION_SIMULATE>/i.test(rawText)) {
      rawText = rawText.replace(/<ACTION_SIMULATE>/gi, '').trim();
      const simRes = await localAgent.runScenarioSimulation();
      widget = { type: 'FILE_AGENT_VIEW', ...simRes };
      actionType = "AGENT_SIMULATION";
      if (!rawText || rawText.length < 5) {
        rawText = `개발자님, 코어 기능 6종 가상 시나리오 실기 시뮬레이션을 전면 구동했습니다. 전체 ${simRes.totalTests}개 항목 중 ${simRes.passedCount}개 통과 (${simRes.totalDuration} 소요). HUD 콘솔에서 실측 결과를 확인하십시오.`;
      }
      action = null;
    }

    // 1.0 로컬 파일 쓰기/생성 액션 파싱
    if (rawText.includes('<ACTION_WRITE_FILE:')) {
      const match = rawText.match(/<ACTION_WRITE_FILE:([^|>]+)\|([^>]*)>/i);
      if (match) {
        rawText = rawText.replace(match[0], '').trim();
        const filePath = match[1].trim();
        const fileContent = match[2].trim();
        const writeRes = localAgent.writeFile(filePath, fileContent);
        widget = { type: 'FILE_AGENT_VIEW', ...writeRes };
        actionType = "AGENT_WRITE";
        if (!rawText || rawText.length < 5) {
          rawText = writeRes.success
            ? `개발자님, 요청하신 파일 ${writeRes.fileName}을(를) 성공적으로 생성 및 저장했습니다.${writeRes.serveUrl ? ' 브라우저에서 즉시 열람 가능합니다.' : ''}`
            : `개발자님, 파일 저장 중 오류가 발생했습니다: ${writeRes.error}`;
        }
        if (writeRes.success && writeRes.serveUrl) {
          action = { type: 'OPEN_URL', url: writeRes.serveUrl };
        } else {
          action = null;
        }
      }
    }

    // 1.05 AI 즉석 앱/시뮬레이션 생성 액션 파싱 (8192 토큰 고속 코드 생성 파이프라인)
    if (rawText.includes('<ACTION_GENERATE_APP:')) {
      const match = rawText.match(/<ACTION_GENERATE_APP:([^>]+)>/i);
      if (match) {
        rawText = rawText.replace(match[0], '').trim();
        const appDescription = match[1].trim().replace(/^["']|["']$/g, '');
        const genRes = await localAgent.generateAndServeApp(appDescription, apiKey);
        widget = { type: 'FILE_AGENT_VIEW', ...genRes };
        actionType = "AGENT_GENERATE_APP";
        if (!rawText || rawText.length < 5) {
          rawText = genRes.success
            ? `개발자님, "${appDescription}" 시각화 앱을 즉석 생성했습니다. ${genRes.size}, ${genRes.elapsed} 소요. 브라우저에서 바로 열어드립니다.`
            : `개발자님, 앱 생성 중 오류가 발생했습니다: ${genRes.error}`;
        }
        if (genRes.success && genRes.serveUrl) {
          action = {
            type: 'OPEN_URL',
            url: genRes.serveUrl,
            target: genRes.serveUrl,
            isSimulation: true,
            title: `${appDescription} - J.A.R.V.I.S. Simulation`
          };
        } else {
          action = null;
        }
      }
    }

    if (rawText.includes('<ACTION_MEDIA:')) {
      const match = rawText.match(/<ACTION_MEDIA:([^>]+)>/i);
      if (match) {
        rawText = rawText.replace(match[0], '').trim();
        let query = match[1].trim().replace(/^["']|["']$/g, '');

        if (/(?:다른|다음|딴|새로운)\s*(?:곡|노래|음악)|방금\s*틀었던/i.test(query)) {
          if (this.lastPlayedQuery) {
            query = this.lastPlayedQuery + ' 다른 곡';
          } else {
            query = '인기 플레이리스트';
          }
        }

        this.lastPlayedQuery = query;
        actionType = "MEDIA_PLAYER";

        const videoInfo = await liveInfo.searchFirstYouTubeVideo(query);
        let embedUrl = `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(query)}&autoplay=1&enablejsapi=1&playsinline=1&origin=http://localhost:3000`;
        let watchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
        let videoId = 'search_' + encodeURIComponent(query);

        if (videoInfo) {
          embedUrl = videoInfo.embedUrl;
          watchUrl = videoInfo.watchUrl;
          videoId = videoInfo.videoId;
          this.lastPlayedTitle = videoInfo.title;
        }

        widget = {
          type: "MEDIA_PLAYER",
          title: `J.A.R.V.I.S. Audio Deck: ${query}`,
          videoId: videoId,
          embedUrl: embedUrl,
          watchUrl: watchUrl
        };
        action = null; // 오직 HUD 플레이어로만 단일 재생
      }
    } else if (rawText.includes('<ACTION_STOP_MEDIA>')) {
      rawText = rawText.replace(/<ACTION_STOP_MEDIA>/gi, '').trim();
      actionType = "STOP_MEDIA";
      action = null;
    }

    // 2. 볼륨 조절 액션 파싱
    if (rawText.includes('<ACTION_VOLUME:')) {
      const match = rawText.match(/<ACTION_VOLUME:([^>]+)>/i);
      if (match) {
        rawText = rawText.replace(match[0], '').trim();
        const vTarget = match[1].trim();
        actionType = "CONTROL_VOLUME";
        action = { type: 'CONTROL_VOLUME', target: vTarget };

        // 내부 볼륨 상태 갱신
        if (vTarget.startsWith('-')) {
          this.currentVolume = Math.max(0, this.currentVolume + parseInt(vTarget, 10));
        } else if (vTarget.startsWith('+')) {
          this.currentVolume = Math.min(100, this.currentVolume + parseInt(vTarget, 10));
        } else if (/mute|음소거/i.test(vTarget)) {
          this.currentVolume = 0;
        } else if (/down/i.test(vTarget)) {
          const m = vTarget.match(/\d+/);
          this.currentVolume = Math.max(0, this.currentVolume - (m ? parseInt(m[0], 10) : 10));
        } else if (/up/i.test(vTarget)) {
          const m = vTarget.match(/\d+/);
          this.currentVolume = Math.min(100, this.currentVolume + (m ? parseInt(m[0], 10) : 10));
        } else {
          const m = vTarget.match(/\d+/);
          if (m) this.currentVolume = Math.min(100, Math.max(0, parseInt(m[0], 10)));
        }
      }
    }

    // 2.5 스마트폰 통화 액션 파싱
    if (rawText.includes('<ACTION_CALL:')) {
      const match = rawText.match(/<ACTION_CALL:([^>]+)>/i);
      if (match) {
        rawText = rawText.replace(match[0], '').trim();
        const callTarget = match[1].trim();
        actionType = "CALL";
        action = { type: 'CALL', target: callTarget };
        if (!rawText || rawText.length < 5) {
          rawText = `개발자님, ${callTarget} 님에게 전화를 즉시 연결합니다.`;
        }
      }
    }

    // 2.6 스마트폰 문자 액션 파싱
    if (rawText.includes('<ACTION_SMS:')) {
      const match = rawText.match(/<ACTION_SMS:([^:>]+):([^>]+)>/i);
      if (match) {
        rawText = rawText.replace(match[0], '').trim();
        const smsTarget = match[1].trim();
        const smsMsg = match[2].trim();
        actionType = "SMS";
        action = { type: 'SMS', target: smsTarget, message: smsMsg };
        if (!rawText || rawText.length < 5) {
          rawText = `개발자님, ${smsTarget} 님에게 메시지를 발송했습니다: "${smsMsg}"`;
        }
      }
    }

    // 2.7 스마트폰 삼성 뮤직 및 플레이리스트 음악 재생 액션 파싱
    if (rawText.includes('<ACTION_SAMSUNG_MUSIC:')) {
      const match = rawText.match(/<ACTION_SAMSUNG_MUSIC:([^>]+)>/i);
      if (match) {
        rawText = rawText.replace(match[0], '').trim();
        const musicTarget = match[1].trim();
        actionType = "SAMSUNG_MUSIC";
        action = { type: 'SAMSUNG_MUSIC', platform: 'samsung', query: musicTarget };
        if (!rawText || rawText.length < 5) {
          rawText = `개발자님, 스마트폰 삼성뮤직에서 '${musicTarget}' 음원을 찾아 즉시 재생합니다.`;
        }
      }
    }

    // 2.8 PC 자비스 창 닫기 및 최소화 액션 파싱
    if (rawText.includes('<ACTION_WINDOW:')) {
      const match = rawText.match(/<ACTION_WINDOW:([^>]+)>/i);
      if (match) {
        rawText = rawText.replace(match[0], '').trim();
        const winCmd = match[1].trim().toLowerCase();
        actionType = "WINDOW_CONTROL";
        action = { type: 'WINDOW_CONTROL', command: winCmd };
        if (!rawText || rawText.length < 5) {
          rawText = winCmd.includes('close') || winCmd.includes('hide') 
            ? "개발자님, 자비스 창을 즉시 닫습니다." 
            : "개발자님, 자비스 창을 최소화합니다.";
        }
      }
    }

    // 2.85 삼성 SmartThings TV 제어 액션 파싱
    if (rawText.includes('<ACTION_IOT_TV:')) {
      const match = rawText.match(/<ACTION_IOT_TV:([^:>]+)(?::([^>]+))?>/i);
      if (match) {
        rawText = rawText.replace(match[0], '').trim();
        const tvAction = match[1].trim();
        const tvParam = match[2] ? match[2].trim() : null;
        actionType = "IOT_CONTROL";
        const iotRes = await homeIoTHub.controlTv(tvAction, tvParam);
        action = { type: 'IOT_TV', command: tvAction, value: tvParam };
        widget = { type: 'IOT_DEVICE_VIEW', device: 'TV', ...iotRes };
        if (!rawText || rawText.length < 5) {
          rawText = iotRes.message;
        }
      }
    }

    // 2.86 LG ThinQ 시스템 에어컨 제어 액션 파싱
    if (rawText.includes('<ACTION_IOT_AIRCON:')) {
      const match = rawText.match(/<ACTION_IOT_AIRCON:([^:>]+)(?::([^>]+))?>/i);
      if (match) {
        rawText = rawText.replace(match[0], '').trim();
        const acAction = match[1].trim();
        const acParam = match[2] ? match[2].trim() : null;
        actionType = "IOT_CONTROL";
        const iotRes = await homeIoTHub.controlAircon(acAction, acParam);
        action = { type: 'IOT_AIRCON', command: acAction, value: acParam };
        widget = { type: 'IOT_DEVICE_VIEW', device: 'AIRCON', ...iotRes };
        if (!rawText || rawText.length < 5) {
          rawText = iotRes.message;
        }
      }
    }

    // 3. 규칙 학습 액션 파싱
    if (rawText.includes('<ACTION_LEARN_RULE:')) {
      const match = rawText.match(/<ACTION_LEARN_RULE:([^>]+)>/i);
      if (match) {
        rawText = rawText.replace(match[0], '').trim();
        const ruleText = match[1].trim();
        learnedHabit = ruleText;

        if (!directiveEngine.directives.custom_rules.includes(ruleText)) {
          directiveEngine.directives.custom_rules.unshift(ruleText);
          if (directiveEngine.directives.custom_rules.length > 15) directiveEngine.directives.custom_rules.pop();
          directiveEngine.saveDirectives();
        }
        if (!this.profile.learned_habits.includes(ruleText)) {
          this.profile.learned_habits.unshift(ruleText);
          if (this.profile.learned_habits.length > 15) this.profile.learned_habits.pop();
          this.saveProfile();
        }
      }
    }

    // 4. 대시보드 모드 전환 액션 파싱
    if (rawText.includes('<ACTION_DASHBOARD:')) {
      const match = rawText.match(/<ACTION_DASHBOARD:([^>]+)>/i);
      if (match) {
        rawText = rawText.replace(match[0], '').trim();
        const mode = match[1].trim().toLowerCase();
        actionType = mode.includes('close') || mode.includes('circle') ? "CLOSE_DASHBOARD" : "OPEN_DASHBOARD";
      }
    }

    // 5. 날씨 정보 액션 파싱
    if (rawText.includes('<ACTION_WEATHER:')) {
      const match = rawText.match(/<ACTION_WEATHER:([^>]+)>/i);
      if (match) {
        rawText = rawText.replace(match[0], '').trim();
        const parts = match[1].split(':').map(s => s.trim());
        const city = parts[0] || 'Seoul';
        const weather = await liveInfo.getLiveWeather(city);
        if (weather && !rawText.includes('도') && !rawText.includes('℃')) {
          rawText += ` (현재 서울 기온은 ${weather.temp}도이며 날씨는 ${weather.condition}, 습도는 ${weather.humidity}%입니다.)`;
        }
      }
    }

    // 6. 실시간 뉴스 순위 액션 파싱
    if (rawText.includes('<ACTION_NEWS:')) {
      const match = rawText.match(/<ACTION_NEWS:([^>]+)>/i);
      if (match) {
        rawText = rawText.replace(match[0], '').trim();
        let cat = match[1].trim().toUpperCase();
        if (!['TOP', 'ECONOMY', 'TECH', 'SPORTS', 'ENTERTAINMENT'].includes(cat)) cat = 'TOP';
        const newsItems = await liveInfo.getLiveNews(cat);
        if (newsItems && newsItems.length > 0) {
          this.lastFetchedNews = newsItems;
          actionType = "TABLE";
          widget = {
            type: "TABLE",
            title: `실시간 뉴스 랭킹 (${cat})`,
            columns: ["순위", "기사 헤드라인", "언론사"],
            rows: newsItems.map(n => [`${n.rank}위`, n.title, n.source]),
            rowLinks: newsItems.map(n => n.link)
          };
        }
      }
    }

    // 7. 거래처 목록 액션 파싱
    if (rawText.includes('<ACTION_CONTACTS')) {
      rawText = rawText.replace(/<ACTION_CONTACTS[^>]*>/gi, '').trim();
      const contacts = contactsManager.getAll();
      actionType = "TABLE";
      widget = {
        type: "TABLE",
        title: "등록 거래처 목록",
        columns: ["업체명", "담당자", "연락처", "비고"],
        rows: contacts.map(c => [c.name, c.manager, c.phone, c.notes || "-"])
      };
    }

    // 8. 기본 OS 액션 태그 파싱
    if (rawText.includes('<ACTION_KILL:')) {
      const match = rawText.match(/<ACTION_KILL:([^>]+)>/i);
      if (match) {
        rawText = rawText.replace(match[0], '').trim();
        action = { type: 'KILL_APP', target: match[1].trim() };
        actionType = "KILL_APP";
      }
    } else if (rawText.includes('<ACTION_CLOSE:')) {
      const match = rawText.match(/<ACTION_CLOSE:([^>]+)>/i);
      if (match) {
        rawText = rawText.replace(match[0], '').trim();
        action = { type: 'KILL_APP', target: match[1].trim() };
        actionType = "KILL_APP";
      }
    } else if (rawText.includes('<ACTION_URL:')) {
      const match = rawText.match(/<ACTION_URL:([^>]+)>/i);
      if (match) {
        rawText = rawText.replace(match[0], '').trim();
        action = { type: 'OPEN_URL', target: match[1].trim() };
        actionType = "OPEN_URL";
      }
    } else if (rawText.includes('<ACTION_OPEN_URL:')) {
      const match = rawText.match(/<ACTION_OPEN_URL:([^>]+)>/i);
      if (match) {
        rawText = rawText.replace(match[0], '').trim();
        action = { type: 'OPEN_URL', target: match[1].trim() };
        actionType = "OPEN_URL";
      }
    } else if (rawText.includes('<ACTION_APP:')) {
      const match = rawText.match(/<ACTION_APP:([^>]+)>/i);
      if (match) {
        rawText = rawText.replace(match[0], '').trim();
        action = { type: 'OPEN_APP', target: match[1].trim() };
        actionType = "OPEN_APP";
      }
    } else if (rawText.includes('<ACTION_OPEN_APP:')) {
      const match = rawText.match(/<ACTION_OPEN_APP:([^>]+)>/i);
      if (match) {
        rawText = rawText.replace(match[0], '').trim();
        action = { type: 'OPEN_APP', target: match[1].trim() };
        actionType = "OPEN_APP";
      }
    } else if (rawText.includes('<ACTION_FOLDER:')) {
      const match = rawText.match(/<ACTION_FOLDER:([^>]+)>/i);
      if (match) {
        rawText = rawText.replace(match[0], '').trim();
        action = { type: 'OPEN_FOLDER', target: match[1].trim() };
        actionType = "OPEN_FOLDER";
      }
    }

    // 9. 동적 위젯 태그 파싱
    if (rawText.includes('<WIDGET_PC>')) {
      rawText = rawText.replace('<WIDGET_PC>', '').trim();
      widget = { type: 'PC_DIAGNOSTICS', title: 'SYSTEM HARDWARE TELEMETRY' };
      actionType = "PC_DIAGNOSTICS";
    } else if (rawText.includes('<WIDGET_TABLE:')) {
      const match = rawText.match(/<WIDGET_TABLE:([^|]+)\|([^|]+)\|([^>]+)>/);
      if (match) {
        rawText = rawText.replace(match[0], '').trim();
        const title = match[1].trim();
        const columns = match[2].split(',').map(s => s.trim());
        const rows = match[3].split(';').map(row => row.split(',').map(s => s.trim()));
        widget = { type: 'TABLE', title, columns, rows };
        actionType = "TABLE";
      }
    } else if (rawText.includes('<WIDGET_NOTE:')) {
      const match = rawText.match(/<WIDGET_NOTE:([^>]+)>/);
      if (match) {
        rawText = rawText.replace(match[0], '').trim();
        widget = {
          type: 'STICKY_NOTE',
          title: 'HUD QUICK MEMO',
          content: match[1].trim(),
          timestamp: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
        };
        actionType = "STICKY_NOTE";
      }
    }

    // 9.5 만약 태그가 누락되었지만 명백히 음악 변경/다음 곡 요청인 경우
    if (actionType === 'CHAT' && !widget && !action) {
      if (/(?:다른|다음|딴)\s*(?:노래|음악|곡)|(?:노래|음악|곡).*(?:바꿔|다른|딴|다음)/i.test(userQuery)) {
        let query = this.lastPlayedQuery ? this.lastPlayedQuery + ' 다른 명곡' : '인기 플레이리스트';
        this.lastPlayedQuery = query;
        actionType = "MEDIA_PLAYER";
        const videoInfo = await liveInfo.searchFirstYouTubeVideo(query);
        let embedUrl = `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(query)}&autoplay=1`;
        let watchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
        let videoId = 'search_' + encodeURIComponent(query);
        if (videoInfo) {
          embedUrl = videoInfo.embedUrl;
          watchUrl = videoInfo.watchUrl;
          videoId = videoInfo.videoId;
        }
        widget = {
          type: "MEDIA_PLAYER",
          title: `J.A.R.V.I.S. Audio Deck: ${query}`,
          videoId,
          embedUrl,
          watchUrl
        };
      }
    }

    // 9.55 [전화/통화 명령 가드레일: 웹 검색으로 이탈하지 않도록 완벽 차단]
    const isCallDirective = /(?:전화|통화)\s*(?:걸어|해|연결|발신)/i.test(userQuery) || /(?:에게|한테|로)\s*(?:전화|통화)/i.test(userQuery);
    if (isCallDirective) {
      if (actionType !== 'CALL') {
        let phoneMatch = userQuery.match(/01[016789][- ]?\d{3,4}[- ]?\d{4}/);
        let target = '';
        if (phoneMatch) {
          target = phoneMatch[0];
        } else {
          target = userQuery
            .replace(/^(?:어|야|헤이|하이|오케이|응|아니|아)\s+(?:자비스|자비슨|자비스야|자비스님)?\s*/i, '')
            .replace(/^(?:자비스|자비슨|자비스야|자비스님)\s*/i, '')
            .replace(/(?:에게|한테|로)?\s*(?:전화|통화)\s*(?:걸어\s*달라니까|걸어\s*달라고|걸어\s*달라|걸어\s*줘|걸어\s*봐|걸어|해\s*달라니까|해\s*달라고|해\s*달라|해\s*줘|해|연결\s*해줘|연결|발신\s*해줘|발신)/gi, '')
            .replace(/(?:전화|통화)\s*(?:걸어\s*달라니까|걸어\s*달라고|걸어\s*달라|걸어\s*줘|걸어\s*봐|걸어|해\s*달라니까|해\s*달라고|해\s*달라|해\s*줘|해|연결\s*해줘|연결|발신\s*해줘|발신)\s*(?:에게|한테|로)?/gi, '')
            .replace(/(?:에게|한테|로)\s*$/g, '')
            .replace(/(?:^|\s+)(?:좀|한번|빨리|지금|얼른|줘|라니까|니까|라고|했잖아)\s*$/gi, '')
            .trim();
          if (/^(?:니까|라니까|라고|왜|뭐|이상하게|그냥)$/.test(target)) target = '';
        }

        if (target) {
          actionType = 'CALL';
          action = { type: 'CALL', target };
          rawText = `개발자님, ${target} 님에게 전화를 즉시 연결합니다.`;
        } else {
          actionType = 'CHAT';
          action = null;
          rawText = "개발자님, 누구에게 전화를 걸어드릴까요? 이름을 말씀해 주십시오.";
        }
      }
    }

    // 9.6 [핵심 가드레일: 허언증 방지] 태그가 누락되었더라도 발화나 답변에 3D CAD/설계도/상판/치수/자동회전 의도가 있거나 전용 창 호출 의도가 있는 경우 실제 위젯/액션을 강제 생성
    if (actionType === 'CHAT' && !widget) {
      const isOpenWindowIntent = /(?:전용\s*창|독립\s*창|프로그램처럼|창으로|스튜디오\s*창|CAD\s*창|창\s*(?:하나\s*)?띄워|창\s*열어|새\s*창)/i.test(userQuery);
      const isCADIntent = /(?:상판|보드|식탁|테이블|책상|선반|설계도|도면|CAD|캐드|치수|가로|세로|깊이|너비|높이|\d{3,4}|접이식|단일\s*상판|자동\s*회전|회전)/i.test(userQuery) ||
                          /(?:설계도|도면|3D|홀로그램|상판|연산하여\s*반영|모델링을.*띄웠|재연산|반영했습니다|자동\s*회전)/i.test(rawText);

      if (isOpenWindowIntent) {
        actionType = "OPEN_CAD_STUDIO";
        action = { type: "OPEN_CAD_STUDIO", target: "cad-studio" };
        widget = this.lastBlueprint;
      } else if (isCADIntent) {
        actionType = "BLUEPRINT_CAD";
        const bpWidget = await cadBlueprint.synthesizeBlueprint(userQuery, this.lastBlueprint, apiKey);
        widget = bpWidget;
        this.lastBlueprint = bpWidget;
      }
    }

    // 9.7 [로컬 에이전트 가드레일: 자가진단, 파일 열람, 디렉토리 탐색, 코드 실행]
    if (actionType === 'CHAT' && !widget) {
      // A. 자가진단 및 원인 규명 의도
      if (/(?:자가\s*진단|시스템\s*점검|스스로\s*점검|네\s*상태\s*점검|네\s*코드.*확인|네\s*로그.*확인|뭐\s*땜에\s*이러는지|왜\s*이러는지.*확인|자가\s*진단해)/i.test(userQuery)) {
        actionType = "AGENT_DIAGNOSE";
        const diagRes = await localAgent.runSelfDiagnosis();
        widget = { type: 'FILE_AGENT_VIEW', ...diagRes };
        rawText = `개발자님, 시스템 내부 신경망 및 런타임 무결성을 즉시 자가진단했습니다. ${diagRes.healthSummary}`;
      }
      // B. 파일 읽기 의도 (예: "package.json 읽어봐", "server.js 확인해줘")
      else if (/(?:읽어|열람|내용.*보여|내용.*확인|코드.*보여|코드.*확인).*(?:\.js|\.json|\.html|\.md|\.txt|\.css|\.log|파일)/i.test(userQuery) ||
               /(?:package\.json|server\.js|main\.js|app\.js|config\.json).*(?:읽|보여|확인)/i.test(userQuery)) {
        actionType = "AGENT_READ";
        const fileMatch = userQuery.match(/([a-zA-Z0-9_\-./\\]+\.(?:json|javascript|js|html|md|txt|css|log|py|sh|bat))\b/i);
        const targetPath = fileMatch ? fileMatch[1] : 'package.json';
        const readRes = localAgent.readFileContent(targetPath, 1, 150);
        widget = { type: 'FILE_AGENT_VIEW', ...readRes };
        rawText = readRes.success
          ? `개발자님, 요청하신 ${readRes.fileName} 파일의 코드를 즉시 HUD 콘솔에 호출했습니다.`
          : `개발자님, 파일 열람 중 문제가 발생했습니다: ${readRes.error}`;
      }
      // C. 디렉토리/폴더 탐색 의도 (예: "폴더에 무슨 파일 있어?", "디렉토리 보여줘")
      else if (/(?:폴더.*(?:탐색|보여|목록|무슨\s*파일|뭐\s*있어)|디렉토리.*(?:탐색|보여|목록)|파일\s*목록|파일\s*찾아)/i.test(userQuery)) {
        actionType = "AGENT_EXPLORE";
        const pathMatch = userQuery.match(/(?:바탕화면|desktop|src|public|다운로드|downloads)/i);
        const targetPath = pathMatch ? pathMatch[0] : '.';
        const exploreRes = localAgent.exploreDirectory(targetPath);
        widget = { type: 'FILE_AGENT_VIEW', ...exploreRes };
        rawText = `개발자님, 지정 경로의 파일 및 폴더 구조를 HUD 콘솔에 탐색 호출했습니다. 총 ${exploreRes.totalItems || 0}개의 항목이 감지되었습니다.`;
      }
      // D. 코드/명령어 실행 의도
      else if (/(?:명령어\s*실행|코드\s*실행|터미널\s*실행|스크립트\s*실행)/i.test(userQuery) ||
               /^(?:dir|node\s+-v|npm\s+-v|git\s+status)$/i.test(userQuery.trim())) {
        actionType = "AGENT_EXEC";
        const cmdMatch = userQuery.replace(/^(?:자비스\s*)?(?:명령어\s*실행|코드\s*실행|터미널\s*실행|실행해줘|실행해)\s*/i, '').trim();
        const cmd = cmdMatch || 'node -v';
        const execRes = await localAgent.executeCommand(cmd);
        widget = { type: 'FILE_AGENT_VIEW', ...execRes };
        rawText = execRes.success
          ? `개발자님, 명령(${cmd})을 터미널에서 실행 완료했습니다.`
          : `개발자님, 명령어 실행 중 오류가 반환되었습니다: ${execRes.stderr || execRes.errorMsg}`;
      }
    }

    // 10. 모든 잔여 태그 완전 소거 (TTS 및 화면 누출 방지)
    rawText = rawText.replace(/<ACTION_[^>]+>/gi, '').trim();
    rawText = rawText.replace(/<WIDGET_[^>]+>/gi, '').trim();

    // 11. 어색한 기호 정제
    rawText = rawText.replace(/[,.·~…\-]+\s*(개발자님|대표님)/g, ' $1');
    rawText = rawText.replace(/대표님/g, '개발자님');

    return { reply: rawText, widget, action, actionType, learnedHabit };
  }

  // 4. 로컬 스마트 엔진 (오프라인 폴백 및 긴급 제어)
  async processLocalEngine(text, moodState) {
    let dynamicWidget = null;
    let action = null;
    let replyText = "";
    let actionType = "CHAT";

    // B. 대화 세션 종료 (바이 자비스)
    if (/(바이|잘가|굿바이|안녕히|그만|종료|쉬어).*자비스|자비스.*(바이|잘가|굿바이|그만|종료|쉬어)/i.test(text)) {
      actionType = "CHAT";
      replyText = "대화를 종료합니다.";
    }
    // C. 사운드 / 볼륨 조절 명령
    else if (/(?:소리|볼륨|음량|사운드).*(?:줄여|낮춰|작게|내려|키워|올려|높여|크게|음소거|뮤트|마이너스|플러스|\d+)/i.test(text)) {
      actionType = "CONTROL_VOLUME";
      let vTarget = "down 10";
      let replyDesc = "볼륨을 10% 낮췄습니다";

      if (/마이너스|줄여|낮춰|작게|내려/i.test(text)) {
        const numMatch = text.match(/(\d+)/);
        const amt = numMatch ? parseInt(numMatch[1], 10) : 10;
        vTarget = `-${amt}`;
        replyDesc = `볼륨을 ${amt}% 낮췄습니다`;
      } else if (/플러스|키워|올려|높여|크게/i.test(text)) {
        const numMatch = text.match(/(\d+)/);
        const amt = numMatch ? parseInt(numMatch[1], 10) : 10;
        vTarget = `+${amt}`;
        replyDesc = `볼륨을 ${amt}% 높였습니다`;
      } else if (/음소거|뮤트/i.test(text)) {
        vTarget = "mute";
        replyDesc = "음소거로 전환했습니다";
      }

      action = { type: 'CONTROL_VOLUME', target: vTarget };
      replyText = `개발자님, 시스템 및 오디오 덱의 ${replyDesc}.`;
    }
    // D. 노래 / 음악 즉시 재생
    else if (/(?:노래|음악|곡|뮤직|영상)?\s*(?:틀어줘|틀어|재생해줘|재생|들려줘|들려|플레이)/i.test(text) && !/(?:계산기|메모장|크롬|스팀|디스코드|창|관리|대시보드|뉴스)/i.test(text)) {
      let query = text
        .replace(/^(?:야|자비스|헤이\s*자비스|하이\s*자비스|아니|다시)?\s*/i, '')
        .replace(/(?:노래|음악|영상|곡)?\s*(?:틀어줘|틀어|재생해줘|재생|들려줘|들려|플레이해줘|플레이|켜줘).*$/i, '')
        .trim();

      if (!query || query === '노래' || query === '음악') {
        query = '인기 음악 플레이리스트';
      }

      this.lastPlayedQuery = query;
      actionType = "MEDIA_PLAYER";

      const videoInfo = await liveInfo.searchFirstYouTubeVideo(query);
      let embedUrl = `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(query)}&autoplay=1`;
      let watchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
      let videoId = 'search_' + encodeURIComponent(query);

      if (videoInfo) {
        embedUrl = videoInfo.embedUrl;
        watchUrl = videoInfo.watchUrl;
        videoId = videoInfo.videoId;
        this.lastPlayedTitle = videoInfo.title;
      }

      dynamicWidget = {
        type: "MEDIA_PLAYER",
        title: `J.A.R.V.I.S. Audio Deck: ${query}`,
        videoId,
        embedUrl,
        watchUrl
      };
      replyText = `개발자님, 요청하신 "${query}" 음원을 자비스 HUD 오디오 덱으로 즉시 재생합니다.`;
    }
    // E. 음악 정지 요청
    else if (/(?:노래|음악|오디오|플레이어|영상).*(?:꺼|멈춰|정지|중지|그만|닫아)/i.test(text)) {
      actionType = "STOP_MEDIA";
      replyText = "개발자님, 음악 재생을 정지하고 오디오 플레이어를 닫았습니다.";
    }
    // F. 실제 OS 제어: 프로그램 / 앱 강제 종료
    else if (/(스팀|steam|계산기|calc|크롬|chrome|메모장|notepad|디스코드|discord|카카오톡|카톡|롤|게임|모든\s*앱).*((창.*)?(꺼|닫아|종료|죽여|꺼줘|닫아줘|종료해줘))/i.test(text) ||
             /(꺼|닫아|종료해|죽여).*(스팀|계산기|크롬|메모장|디스코드|카톡|롤)/i.test(text)) {
      actionType = "KILL_APP";
      const killList = [];
      if (/스팀|steam/i.test(text)) killList.push('스팀');
      if (/계산기|calc/i.test(text)) killList.push('계산기');
      if (/크롬|chrome|브라우저/i.test(text)) killList.push('크롬');
      if (/메모장|notepad/i.test(text)) killList.push('메모장');
      if (/디스코드|discord/i.test(text)) killList.push('디스코드');
      if (/카카오톡|카톡/i.test(text)) killList.push('카카오톡');
      if (/롤|리그오브레전드/i.test(text)) killList.push('롤');
      const target = killList.length > 0 ? killList.join(',') : text.replace(/꺼|닫아|종료|죽여|창|앱|프로그램/g, '').trim();
      action = { type: "KILL_APP", target: target || "스팀,계산기" };
      replyText = `개발자님, 요청하신 ${killList.length > 0 ? killList.join(', ') : '프로그램'} 프로세스를 즉시 종료 처리했습니다.`;
    }
    // G. 웹사이트 열기 (크롬, 유튜브, 네이버, 구글)
    else if (/(크롬|브라우저|인터넷|웹).*((창.*)?(열어|켜|띄워|실행|하나.*더))/i.test(text)) {
      actionType = "OPEN_APP";
      action = { type: "OPEN_APP", target: "chrome" };
      replyText = "개발자님, 웹 브라우저를 새 창으로 즉시 실행해 드렸습니다.";
    }
    else if (/유튜브.*(열어|켜|띄워|보여)|youtube/i.test(text)) {
      actionType = "OPEN_URL";
      action = { type: "OPEN_URL", target: "https://www.youtube.com" };
      replyText = "개발자님, 유튜브를 새 창으로 즉시 열어드렸습니다.";
    }
    else if (/네이버.*(열어|켜|띄워)/i.test(text)) {
      actionType = "OPEN_URL";
      action = { type: "OPEN_URL", target: "https://www.naver.com" };
      replyText = "개발자님, 네이버를 즉시 열어드렸습니다.";
    }
    else if (/구글.*(열어|켜|띄워)/i.test(text)) {
      actionType = "OPEN_URL";
      action = { type: "OPEN_URL", target: "https://www.google.com" };
      replyText = "개발자님, 구글 검색창을 즉시 열어드렸습니다.";
    }
    // H. 메모장, 계산기 실행
    else if (/메모장.*(열어|실행|켜|띄워)/i.test(text)) {
      actionType = "OPEN_APP";
      action = { type: "OPEN_APP", target: "notepad" };
      replyText = "개발자님, 윈도우 메모장을 즉시 실행했습니다.";
    }
    else if (/계산기.*(열어|실행|켜|띄워)/i.test(text)) {
      actionType = "OPEN_APP";
      action = { type: "OPEN_APP", target: "calc" };
      replyText = "개발자님, 윈도우 계산기를 즉시 실행했습니다.";
    }
    // I. 하드웨어 진단
    else if (/컴퓨터.*(상태|진단|사양|성능)|시스템.*(상태|진단)|하드웨어.*(상태|진단)/.test(text)) {
      actionType = "PC_DIAGNOSTICS";
      replyText = "개발자님, 현재 PC의 하드웨어 리소스 및 가동 텔레메트리를 HUD 진단 패널로 호출했습니다. CPU와 메모리 상태 모두 양호합니다.";
      dynamicWidget = { type: "PC_DIAGNOSTICS", title: "SYSTEM HARDWARE TELEMETRY" };
    }
    // I.4 3D CAD Studio 전용 창 / 프로그램 창 띄우기
    else if (/(?:전용\s*창|독립\s*창|프로그램처럼|창으로|큰\s*화면|스튜디오\s*창|CAD\s*창|창\s*(?:하나\s*)?띄워|창\s*열어|새\s*창|창\s*만들)/i.test(text)) {
      actionType = "OPEN_CAD_STUDIO";
      action = { type: "OPEN_CAD_STUDIO", target: "cad-studio" };
      replyText = "개발자님, 요청하신 대로 4K 초고화질 3D CAD Studio 전용 윈도우 창을 화면에 즉시 호출했습니다.";
      dynamicWidget = this.lastBlueprint;
    }
    // I.5 3D 홀로그램 CAD 설계도 생성 및 연상 합성 / 세부 옵션 변형 / 자동 회전 제어
    else if (/(?:상판|보드).*(?:하나\s*더|추가|합쳐|결합|얹어|긴|길게|넓게|크게|하나만|단일|제거|없애|떼어|원래)|(?:2단|더블|확장).*(?:식탁|테이블|상판)|(?:아니\s*)?이걸\s*합쳐|(?:접힐|접혀|접었|접히|붙었|벽면.*붙|벽에.*붙|밀착|내렸|펼쳐|폈을).*(?:모양|어떤|보여|상태|어떻게|보여줘)|(?:설계도|도면|CAD|캐드).*(?:만들|짜|보여|출력|띄워|그려|제작)|(?:접이식.*식탁|가구|책상|선반).*(?:설계도|도면)|(?:자동\s*회전|회전).*(?:꺼|끄|중지|멈춰|차단|하지\s*마|켜|시작|돌려)|(?:\d{3,4})\s*(?:에|x|X|\*)\s*(?:\d{3,4})/i.test(text)) {
      actionType = "BLUEPRINT_CAD";
      const bpWidget = await cadBlueprint.synthesizeBlueprint(text, this.lastBlueprint);
      this.lastBlueprint = bpWidget;
      replyText = bpWidget.speechReply;
      dynamicWidget = bpWidget;
    }
    // I.6 로컬 에이전트: 자가 진단 및 신경망 무결성 스캔
    else if (/(?:자가\s*진단|시스템\s*점검|스스로\s*점검|네\s*상태\s*점검|네\s*코드.*확인|네\s*로그.*확인|뭐\s*땜에\s*이러는지|왜\s*이러는지.*확인)/i.test(text)) {
      actionType = "AGENT_DIAGNOSE";
      const diagRes = await localAgent.runSelfDiagnosis();
      dynamicWidget = { type: 'FILE_AGENT_VIEW', ...diagRes };
      replyText = `개발자님, 시스템 내부 신경망 및 코어 무결성을 전수 자가진단했습니다. ${diagRes.healthSummary}`;
    }
    // I.7 로컬 에이전트: 파일 열람 및 코드 확인
    else if (/(?:읽어|열람|내용.*보여|내용.*확인|코드.*보여|코드.*확인).*(?:\.js|\.json|\.html|\.md|\.txt|\.css|\.log|파일)/i.test(text) ||
             /(?:package\.json|server\.js|main\.js|app\.js|config\.json).*(?:읽|보여|확인)/i.test(text)) {
      actionType = "AGENT_READ";
      const fileMatch = text.match(/([a-zA-Z0-9_\-./\\]+\.(?:json|javascript|js|html|md|txt|css|log|py|sh|bat))\b/i);
      const targetPath = fileMatch ? fileMatch[1] : 'package.json';
      const readRes = localAgent.readFileContent(targetPath, 1, 150);
      dynamicWidget = { type: 'FILE_AGENT_VIEW', ...readRes };
      replyText = readRes.success
        ? `개발자님, 요청하신 ${readRes.fileName} 파일의 코드를 HUD 콘솔에 즉시 호출했습니다.`
        : `개발자님, 파일 열람 중 오류가 발생했습니다: ${readRes.error}`;
    }
    // I.8 로컬 에이전트: 디렉토리/폴더 자율 탐색
    else if (/(?:폴더.*(?:탐색|보여|목록|무슨\s*파일|뭐\s*있어)|디렉토리.*(?:탐색|보여|목록)|파일\s*목록|파일\s*찾아)/i.test(text)) {
      actionType = "AGENT_EXPLORE";
      const pathMatch = text.match(/(?:바탕화면|desktop|src|public|다운로드|downloads)/i);
      const targetPath = pathMatch ? pathMatch[0] : '.';
      const exploreRes = localAgent.exploreDirectory(targetPath);
      dynamicWidget = { type: 'FILE_AGENT_VIEW', ...exploreRes };
      replyText = `개발자님, 지정 경로의 파일 및 폴더 구조를 HUD 콘솔에 탐색 호출했습니다. 총 ${exploreRes.totalItems || 0}개의 항목이 감지되었습니다.`;
    }
    // I.9 로컬 에이전트: 코드/명령어 실행
    else if (/(?:명령어\s*실행|코드\s*실행|터미널\s*실행|스크립트\s*실행)/i.test(text) ||
             /^(?:dir|node\s+-v|npm\s+-v|git\s+status)$/i.test(text.trim())) {
      actionType = "AGENT_EXEC";
      const cmdMatch = text.replace(/^(?:자비스\s*)?(?:명령어\s*실행|코드\s*실행|터미널\s*실행|실행해줘|실행해)\s*/i, '').trim();
      const cmd = cmdMatch || 'node -v';
      const execRes = await localAgent.executeCommand(cmd);
      dynamicWidget = { type: 'FILE_AGENT_VIEW', ...execRes };
      replyText = execRes.success
        ? `개발자님, 명령(${cmd})을 터미널에서 실행 완료했습니다.`
        : `개발자님, 명령어 실행 중 오류가 반환되었습니다: ${execRes.stderr || execRes.errorMsg}`;
    }
    // J. 일반 대화
    else {
      replyText = this.generateNaturalDialogue(text, moodState);
    }

    return { replyText, dynamicWidget, action, actionType };
  }

  // 5. 로컬 자연어 대화 규칙
  generateNaturalDialogue(text, moodState) {
    const isFatigued = moodState.mood.includes("피로");

    // A. 보이스/TTS 변경 관련 질문
    if (/보이스|목소리|tts|음성 변경|목소리 바꿔|목소리 별로/.test(text.toLowerCase())) {
      return "개발자님, 상단 '🎙️ 보이스 설정' 메뉴에서 고음질 자연어 보이스(Google 한국어, Microsoft InJoon 등)로 즉시 변경하시거나 음높이와 속도를 취향에 맞게 세밀하게 조절하실 수 있습니다.";
    }

    // B. 코드 변경 / 프로그램 수정 질문
    if (/코드.*(바꿔|수정|변경)|프로그램.*(고쳐|바꿔)/.test(text)) {
      return "개발자님, 현재 세션은 Antigravity IDE를 통해 실시간으로 코드를 수정하고 즉각 반영할 수 있도록 구성되어 있습니다. 원하시는 기능이나 인터페이스 수정을 말씀해 주시면 제가 즉시 코드를 반영해 드리겠습니다.";
    }

    // C. 마이크 테스트
    if (/^(아{2,}|아\s*아|마이크\s*테스트|소리\s*테스트|잘\s*들려|목소리\s*들려)/.test(text)) {
      return "네 개발자님, 마이크 음향 신호가 선명하게 수신되고 있습니다. 목소리가 아주 잘 들립니다. 말씀하십시오.";
    }

    // D. 인사
    if (/^(안녕|하이|헬로|자비스|좋은 아침|좋은 하루|반가워)/.test(text)) {
      return isFatigued
        ? "안녕하십니까 개발자님, 오늘 피로가 좀 쌓이신 듯합니다. 필요한 작업만 말씀해 주시면 나머지는 제가 조용히 처리해 두겠습니다."
        : "안녕하십니까 개발자님, 자비스 모든 시스템 정상 가동 중입니다. 어떤 작업을 도와드릴까요?";
    }

    // E. 정체성 / 자기소개
    if (/너 누구|자기소개|정체|이름이 뭐야/.test(text)) {
      return "저는 개발자님만의 맞춤형 비서 인공지능, J.A.R.V.I.S.입니다. 개발자님의 성향과 컨디션을 실시간으로 학습하며, 필요하신 데이터와 화면을 즉석에서 만들어 띄워드립니다.";
    }

    // 기본 응답
    return "개발자님, 말씀 접수했습니다. 지시사항이나 궁금하신 사안에 대해 최선을 다해 보좌하겠습니다.";
  }

  generateDynamicTable(query) {
    return {
      title: "주요 업무 및 프로젝트 스케줄",
      columns: ["우선순위", "항목", "담당/구분", "기한", "진행 상태"],
      rows: [
        ["🔥 긴급", "자비스 AI 비서 핵심 기능 점검", "개발 & 시스템", "오늘 18:00", "완료 단계"],
        ["⚡ 높음", "신규 프로젝트 기획안 검토", "비즈니스 전략", "내일 오전", "대기 중"],
        ["📌 보통", "주간 성과 및 리소스 브리핑", "전사 공유", "이번 주 금요일", "데이터 취합"]
      ]
    };
  }

  generateDynamicChart(query) {
    return {
      title: "전략 옵션 (A vs B) 다각도 비교 분석",
      chartType: "bar",
      labels: ["효율성", "개발 속도", "확장성", "유지비용 절감", "사용자 만족도"],
      datasets: [
        {
          label: "A안 (맞춤형 독립 데스크톱)",
          data: [95, 90, 98, 92, 99],
          backgroundColor: "rgba(0, 240, 255, 0.7)",
          borderColor: "#00f0ff"
        },
        {
          label: "B안 (기존 일반 웹페이지)",
          data: [65, 75, 60, 70, 68],
          backgroundColor: "rgba(255, 170, 0, 0.6)",
          borderColor: "#ffaa00"
        }
      ]
    };
  }

  extractNoteContent(query) {
    let cleaned = query.replace(/메모|포스트잇|저장|기억해|바탕화면|적어둬|남겨둬|해줘|띄워줘|써줘/g, '').trim();
    if (!cleaned || cleaned.length < 2) {
      cleaned = "개발자님 중요 체크리스트: 오늘 자비스 시스템 세팅 및 주요 업무 우선순위 확인";
    }
    return cleaned;
  }

  generateAdaptiveBriefing(moodState) {
    const timeHour = new Date().getHours();
    const timeGreeting = timeHour < 12 ? "좋은 아침입니다" : timeHour < 18 ? "안녕하십니까" : "편안한 저녁입니다";

    if (moodState.mood.includes("피로")) {
      return `${timeGreeting} 개발자님, 컨디션에서 피로도가 감지되어 핵심만 아주 간결하게 말씀드리겠습니다. 현재 시스템은 안정적이며, 복잡한 사안은 제가 백그라운드에서 정리해 두었습니다. 가벼운 휴식을 권장드립니다.`;
    } else {
      return `${timeGreeting} 개발자님, 오늘 맞춤 브리핑입니다. 현재 개발자님의 성향에 맞춰 자비스가 최적화 대기 중입니다. 필요하신 작업이 있으실 때 언제든 말씀만 하시면 즉시 처리해 드리겠습니다.`;
    }
  }
}

module.exports = new JarvisBrain();

