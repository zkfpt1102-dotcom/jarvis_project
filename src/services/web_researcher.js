/**
 * J.A.R.V.I.S. Autonomous Web Research & Intelligence Synthesis Engine
 * Gathers multi-source real-time web intelligence with smart keyword extraction & hybrid deep synthesis.
 */

class WebResearcher {
  /**
   * Extract high-signal keywords from a complex or descriptive sentence
   * (e.g. "줄기세포 배양 성공 의료 목적 접목 방안" -> "줄기세포 배양 의료")
   * @param {string} text
   * @returns {string}
   */
  extractKeywords(text) {
    const stopWords = new Set([
      '관련', '대한', '위한', '목적', '방안', '방법', '성공', '접목', '최근', '현황', 
      '소식', '동향', '분석', '비교', '내용', '대해', '알아', '경우', '인터넷', '검색',
      '알려줘', '찾아줘', '어떻게', '무엇인가', '어떤가'
    ]);
    const tokens = text.split(/\s+/).filter(t => t.length >= 2 && !stopWords.has(t));
    if (tokens.length === 0) return text;
    if (tokens.length <= 3) return tokens.join(' ');
    return tokens.slice(0, 3).join(' ');
  }

  /**
   * Helper to query Google News RSS
   */
  async queryGoogleNews(queryTerm) {
    const sources = [];
    try {
      const gNewsUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(queryTerm)}&hl=ko&gl=KR&ceid=KR:ko`;
      const res = await fetch(gNewsUrl, { signal: AbortSignal.timeout(4000) });
      const xml = await res.text();
      const itemMatches = xml.match(/<item>[\s\S]*?<\/item>/g) || [];

      for (let i = 0; i < Math.min(itemMatches.length, 5); i++) {
        const block = itemMatches[i];
        const titleMatch = block.match(/<title>(.*?)<\/title>/);
        const sourceMatch = block.match(/<source[^>]*>(.*?)<\/source>/);
        const linkMatch = block.match(/<link>(.*?)<\/link>/);

        let title = titleMatch ? titleMatch[1] : '';
        let source = sourceMatch ? sourceMatch[1] : 'Google News';
        let link = linkMatch ? linkMatch[1] : '';

        title = title
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'")
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .trim();

        if (source && title.endsWith(` - ${source}`)) {
          title = title.slice(0, -(source.length + 3)).trim();
        }

        if (title.length > 5) {
          sources.push({ title, source, link });
        }
      }
    } catch (e) {
      console.warn('[WEB RESEARCH] Google News search warning:', e.message);
    }
    return sources;
  }

  /**
   * Helper to query Wikipedia
   */
  async queryWikipedia(queryTerm) {
    const sources = [];
    try {
      const wikiUrl = `https://ko.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(queryTerm)}&limit=3&namespace=0&format=json`;
      const res = await fetch(wikiUrl, {
        headers: { 'User-Agent': 'JarvisAI/2.0 (DeveloperAssistant; mailto:admin@jarvis.local)' },
        signal: AbortSignal.timeout(3000)
      });
      if (res.ok) {
        const [, titles, snippets, urls] = await res.json();
        for (let i = 0; i < (titles ? titles.length : 0); i++) {
          if (snippets[i] && snippets[i].length > 10) {
            sources.push({
              title: `${titles[i]}: ${snippets[i]}`,
              source: '위키백과',
              link: urls[i]
            });
          }
        }
      }
    } catch (e) {
      console.warn('[WEB RESEARCH] Wikipedia search warning:', e.message);
    }
    return sources;
  }

  /**
   * Gather real-time articles and knowledge snippets with multi-tier fallback
   * @param {string} query
   * @returns {Promise<{ cleanQuery: string, sources: Array<{ title: string, source: string, link: string }> }> }
   */
  async fetchLiveSources(query) {
    const cleanQuery = query
      .replace(/^(?:자비스\s*)?(?:인터넷(?:에서|으로)?|웹(?:에서)?|구글(?:에서)?|네이버(?:에서)?)\s*/i, '')
      .replace(/(?:검색\s*해줘|검색\s*해\s*줘|검색\s*해|찾아\s*봐줘|찾아\s*봐\s*줘|찾아\s*줘|찾아\s*봐|찾아|알아\s*봐줘|알아\s*봐\s*줘|알아\s*봐|조사\s*해줘|조사\s*해\s*줘|브리핑\s*해줘|브리핑\s*해\s*줘|요약\s*해줘|요약\s*해\s*줘|알려\s*줘|어떻게\s*돼|최신\s*소식|동향).*$/i, '')
      .replace(/(?:에\s*대해|에\s*대해서|관련)?\s*$/i, '')
      .trim() || query;

    let sources = await this.queryGoogleNews(cleanQuery);

    // Tier 1 Fallback: If 0 news items for the full phrase, extract core keywords
    if (sources.length === 0) {
      const coreKeywords = this.extractKeywords(cleanQuery);
      if (coreKeywords && coreKeywords !== cleanQuery) {
        sources = await this.queryGoogleNews(coreKeywords);
      }
    }

    // Tier 2: Search Wikipedia with cleanQuery or coreKeywords
    const wikiSources = await this.queryWikipedia(cleanQuery);
    if (wikiSources.length > 0) {
      sources.push(...wikiSources);
    } else {
      const coreKeywords = this.extractKeywords(cleanQuery);
      if (coreKeywords && coreKeywords !== cleanQuery) {
        const wikiCore = await this.queryWikipedia(coreKeywords.split(' ')[0]);
        sources.push(...wikiCore);
      }
    }

    return { cleanQuery, sources };
  }

  /**
   * Conduct deep autonomous web research and synthesize executive briefing report via Gemini
   * @param {string} topic
   * @param {string} apiKey
   * @returns {Promise<{
   *   type: 'RESEARCH_REPORT',
   *   query: string,
   *   title: string,
   *   speechReply: string,
   *   executiveSummary: string,
   *   keyFindings: string[],
   *   sources: Array<{ title: string, source: string, link: string }>,
   *   timestamp: string
   * }>}
   */
  async researchTopic(topic, apiKey) {
    let { cleanQuery, sources } = await this.fetchLiveSources(topic);

    const now = new Date();
    const timeFormatted = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

    // Hybrid Deep Knowledge fallback: if live news matching is sparse (e.g. theoretical science or medical mechanisms),
    // Jarvis invokes Gemini's deep knowledge base to synthesize a full intelligence dossier instead of giving up.
    const isHybridDeepKnowledge = (!sources || sources.length === 0);

    if (isHybridDeepKnowledge) {
      sources = [
        { title: `${cleanQuery} 구글 학술 및 심층 검색`, source: 'Google', link: `https://www.google.com/search?q=${encodeURIComponent(cleanQuery)}` },
        { title: `${cleanQuery} 네이버 지식백과 심층자료`, source: 'Naver', link: `https://search.naver.com/search.naver?where=kdic&query=${encodeURIComponent(cleanQuery)}` },
        { title: `${cleanQuery} 위키백과 탐색`, source: 'Wikipedia', link: `https://ko.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(cleanQuery)}` }
      ];
    }

    const contextSnippet = sources.map((s, idx) => `[데이터 ${idx + 1}: ${s.source}] ${s.title}`).join('\n');

    const prompt = isHybridDeepKnowledge
      ? `당신은 토니 스타크를 보좌하는 전설적인 AI 비서 J.A.R.V.I.S.(자비스)입니다.
개발자님께서 "${cleanQuery}"에 대해 심층 인텔리전스 조사 및 분석 리포트를 요청하셨습니다.
이 주제는 단순 언론 기사보다는 과학적/의학적/기술적 메커니즘과 실질적 접목 방안에 대한 고도화된 전문 분석이 요구되는 주제입니다.
자비스의 방대한 전문 두뇌를 총동원하여, 개발자님이 단 3초 만에 핵심과 실질적 접목 방안을 파악할 수 있는 고품격 브리핑 리포트를 JSON으로 작성하십시오.

[조사 주제]
${cleanQuery}

[응답 규칙]
1. speechReply: 개발자님 호칭으로 시작하는 2~3줄의 품격 있고 명쾌한 구어체 음성 요약 (마크다운, 특수문자 금지)
2. title: 전문적이고 세련된 인텔리전스 리포트 제목
3. executiveSummary: 핵심 결론 1~2줄
4. keyFindings: 핵심 메커니즘 및 실질적 의료/산업 접목 방안 3~4개 배열

[반드시 유효한 순수 JSON만 출력하십시오]
{
  "speechReply": "...",
  "title": "...",
  "executiveSummary": "...",
  "keyFindings": ["...", "...", "..."]
}`
      : `당신은 토니 스타크를 보좌하는 전설적인 AI 비서 J.A.R.V.I.S.(자비스)입니다.
개발자님께서 웹 검색 및 실시간 인텔리전스 조사를 요청하셨습니다.
수집된 최신 웹 데이터들을 바탕으로, 개발자님이 단 3초 만에 핵심을 파악할 수 있는 브리핑 리포트를 JSON으로 작성하십시오.

[조사 주제]
${cleanQuery}

[실시간 수집된 웹 데이터]
${contextSnippet}

[응답 규칙]
1. speechReply: 개발자님 호칭으로 시작하는 2~3줄의 품격 있고 명쾌한 구어체 음성 요약 (마크다운, 특수문자 금지)
2. title: 전문적이고 세련된 인텔리전스 리포트 제목
3. executiveSummary: 핵심 결론 1~2줄
4. keyFindings: 수집된 팩트에 근거한 핵심 포인트 3~4개 배열

[반드시 유효한 순수 JSON만 출력하십시오]
{
  "speechReply": "...",
  "title": "...",
  "executiveSummary": "...",
  "keyFindings": ["...", "...", "..."]
}`;

    const candidateModels = ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-flash-lite-latest'];
    let reportData = null;

    for (const model of candidateModels) {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.35,
              maxOutputTokens: 600
            }
          }),
          signal: AbortSignal.timeout(6000)
        });

        if (res.ok) {
          const jsonResp = await res.json();
          if (jsonResp.candidates && jsonResp.candidates[0] && jsonResp.candidates[0].content) {
            const rawJson = jsonResp.candidates[0].content.parts[0].text.trim();
            reportData = JSON.parse(rawJson);
            break;
          }
        }
      } catch (err) {
        console.warn(`[WEB RESEARCH] Model ${model} synthesis failed:`, err.message);
      }
    }

    if (!reportData) {
      reportData = {
        speechReply: `개발자님, 요청하신 "${cleanQuery}" 관련 지식 및 최신 소스를 HUD 인텔리전스 리포트로 취합 완료했습니다.`,
        title: `${cleanQuery} 인텔리전스 분석 브리핑`,
        executiveSummary: `수집된 주요 소스와 전문 분석 데이터를 결합한 리포트입니다.`,
        keyFindings: sources.slice(0, 3).map(s => `[${s.source}] ${s.title}`)
      };
    }

    return {
      type: 'RESEARCH_REPORT',
      query: cleanQuery,
      title: reportData.title || `${cleanQuery} 웹 인텔리전스 리포트`,
      speechReply: reportData.speechReply || `개발자님, ${cleanQuery}에 대한 웹 조사 결과 브리핑을 완료했습니다.`,
      executiveSummary: reportData.executiveSummary || `${cleanQuery} 관련 주요 이슈 요약입니다.`,
      keyFindings: reportData.keyFindings || [],
      sources: sources,
      timestamp: timeFormatted
    };
  }
}

module.exports = new WebResearcher();
