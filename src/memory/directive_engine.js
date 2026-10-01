/**
 * J.A.R.V.I.S. Self-Adaptive Dynamic Directives Engine
 * Enables user to modify Jarvis's behavior, speech habits, and rules dynamically via voice.
 */

const fs = require('fs');
const path = require('path');

const DIRECTIVES_PATH = path.join(__dirname, 'runtime_directives.json');

class DirectiveEngine {
  constructor() {
    this.directives = this.loadDirectives();
  }

  loadDirectives() {
    try {
      if (fs.existsSync(DIRECTIVES_PATH)) {
        return JSON.parse(fs.readFileSync(DIRECTIVES_PATH, 'utf-8'));
      }
    } catch (e) {
      console.warn('Could not read runtime_directives.json:', e);
    }
    return {
      speech_preferences: {
        suppress_headline_readout: true,
        concise_answers: true,
        suppress_closing_honorific: false
      },
      custom_triggers: {},
      custom_rules: [
        "뉴스나 기사 순위 호출 시 기사 헤드라인을 음성으로 낭독하지 않고 화면 테이블 위젯으로만 즉시 표시함"
      ]
    };
  }

  saveDirectives() {
    try {
      fs.writeFileSync(DIRECTIVES_PATH, JSON.stringify(this.directives, null, 2), 'utf-8');
      return true;
    } catch (e) {
      console.error('Failed to save runtime_directives.json:', e);
      return false;
    }
  }

  /**
   * Detect if the user's speech is an instruction to modify Jarvis's behavior
   * @param {string} text
   * @returns {{ modified: boolean, ruleDescription?: string, replyText?: string }}
   */
  processSpeechDirective(text) {
    const raw = text.trim();
    const lower = raw.toLowerCase();

    // 1. "기사/헤드라인 읽지 마 / 읽지 말라고"
    if (/(헤드라인|기사|뉴스|본문|제목).*((읽지\s*마|읽지마|낭독하지\s*마|소리내지\s*마|말하지\s*마|말라고|하지\s*말라고))/i.test(lower) || /읽지\s*마|읽지마|읽지\s*말라고/i.test(lower)) {
      this.directives.speech_preferences.suppress_headline_readout = true;
      const rule = "기사나 뉴스 요청 시 긴 텍스트/헤드라인을 음성으로 낭독하지 않고 화면 테이블 위젯으로만 조용히 띄움";
      if (!this.directives.custom_rules.includes(rule)) {
        this.directives.custom_rules.unshift(rule);
      }
      this.saveDirectives();
      return {
        modified: true,
        ruleDescription: rule,
        replyText: "개발자님, 시스템 동작 규칙에 즉시 반영했습니다. [규칙: 기사 헤드라인 음성 낭독 차단] 앞으로는 화면에 위젯으로만 조용하게 띄워드리겠습니다."
      };
    }

    // 2. "앞으로 ~해줘" / "앞으로 ~하지 마" / "~빼줘" 등 명시적 규칙 부여
    const ruleMatch = raw.match(/앞으로(?:는)?\s*(.+?)(?:해줘|하지\s*마|말아줘|하자|해라|빼줘|넣어줘|부탁해|바꿔줘|수정해줘|알려줘)|앞으론\s*(.+)/i);
    if (ruleMatch) {
      const instruction = (ruleMatch[1] || ruleMatch[2] || '').trim();
      if (instruction.length >= 2) {
        const rule = `개발자님 음성 지시: "${instruction}"`;
        if (!this.directives.custom_rules.includes(rule)) {
          this.directives.custom_rules.unshift(rule);
          if (this.directives.custom_rules.length > 15) this.directives.custom_rules.pop();
        }
        this.saveDirectives();
        return {
          modified: true,
          ruleDescription: rule,
          replyText: `개발자님, 말씀하신 지시사항을 자비스 동작 규칙에 영구 반영했습니다: "${instruction}". 앞으로 이 규칙을 최우선 준수하여 보좌하겠습니다.`
        };
      }
    }

    // 3. "자비스 규칙 보여줘" / "학습된 규칙 뭐야"
    if (/(자비스|학습|동작)?\s*(규칙|지침|설정).*((보여|알려|뭐\s*있|확인|리스트))/i.test(lower)) {
      const rules = this.directives.custom_rules;
      const formatted = rules.length > 0 ? rules.map((r, i) => `${i + 1}. ${r}`).join('\n') : "현재 등록된 특이 규칙이 없습니다.";
      return {
        modified: false,
        replyText: `개발자님, 현재 자비스 시스템에 반영된 실시간 자가 학습 규칙입니다:\n${formatted}`
      };
    }

    return { modified: false };
  }

  isHeadlineReadoutSuppressed() {
    return this.directives.speech_preferences.suppress_headline_readout !== false;
  }

  getRulesForPrompt() {
    if (!this.directives.custom_rules || this.directives.custom_rules.length === 0) {
      return "- 특별한 추가 런타임 제약 없음";
    }
    return this.directives.custom_rules.map(r => `  - ${r}`).join('\n');
  }
}

module.exports = new DirectiveEngine();
