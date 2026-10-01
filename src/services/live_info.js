/**
 * J.A.R.V.I.S. Real-Time Live Intelligence Service
 * Provides actual real-world news headlines, weather, and live data.
 * Zero fictional mock data. 100% real-world facts.
 */

const fs = require('fs');
const path = require('path');

class LiveInfoService {
  /**
   * Fetch 100% actual real-time news headlines from Google News Korea RSS
   * @param {'TOP'|'ECONOMY'|'TECH'|'POLITICS'|'ENTERTAINMENT'|'SPORTS'} category
   * @returns {Promise<Array<{ rank: number, title: string, source: string, link: string }>>}
   */
  async getLiveNews(category = 'TOP') {
    let url = 'https://news.google.com/rss?hl=ko&gl=KR&ceid=KR:ko';
    if (category === 'TECH' || category === 'IT') {
      url = 'https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=ko&gl=KR&ceid=KR:ko';
    } else if (category === 'ECONOMY' || category === 'BUSINESS' || category === 'FINANCE') {
      url = 'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=ko&gl=KR&ceid=KR:ko';
    } else if (category === 'SPORTS') {
      url = 'https://news.google.com/rss/headlines/section/topic/SPORTS?hl=ko&gl=KR&ceid=KR:ko';
    } else if (category === 'ENTERTAINMENT') {
      url = 'https://news.google.com/rss/headlines/section/topic/ENTERTAINMENT?hl=ko&gl=KR&ceid=KR:ko';
    }

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      const xml = await res.text();
      const items = [];

      const itemMatches = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
      for (let i = 0; i < Math.min(itemMatches.length, 6); i++) {
        const block = itemMatches[i];
        const titleMatch = block.match(/<title>(.*?)<\/title>/);
        const sourceMatch = block.match(/<source[^>]*>(.*?)<\/source>/);
        const linkMatch = block.match(/<link>(.*?)<\/link>/);

        let title = titleMatch ? titleMatch[1] : '';
        let source = sourceMatch ? sourceMatch[1] : '언론사';
        let link = linkMatch ? linkMatch[1] : '';

        // Decode HTML entities
        title = title
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'")
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .trim();

        // Strip trailing source if Google News appended " - 언론사명"
        if (source && title.endsWith(` - ${source}`)) {
          title = title.slice(0, -(source.length + 3)).trim();
        }

        if (title.length > 5) {
          items.push({
            rank: items.length + 1,
            title,
            source,
            link
          });
        }
      }

      return items;
    } catch (err) {
      console.error('[JARVIS LIVE NEWS ERROR]', err);
      return [];
    }
  }

  /**
   * Fetch actual live weather for Korea / specified city
   * @param {string} city
   * @returns {Promise<{ temp: string, condition: string, humidity: string, location: string } | null>}
   */
  async getLiveWeather(city = 'Seoul') {
    try {
      const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, {
        signal: AbortSignal.timeout(3500)
      });
      const data = await res.json();
      const current = data.current_condition[0];

      // Korean weather condition translation
      const descEng = (current.weatherDesc && current.weatherDesc[0] ? current.weatherDesc[0].value : '').toLowerCase();
      let conditionKo = '맑음';
      if (descEng.includes('rain') || descEng.includes('shower')) conditionKo = '비';
      else if (descEng.includes('snow')) conditionKo = '눈';
      else if (descEng.includes('cloud') || descEng.includes('overcast')) conditionKo = '구름 많음/흐림';
      else if (descEng.includes('clear') || descEng.includes('sunny')) conditionKo = '맑음';
      else if (descEng.includes('fog') || descEng.includes('mist')) conditionKo = '안개';
      else if (descEng.includes('thunder')) conditionKo = '뇌우';

      return {
        temp: current.temp_C,
        condition: conditionKo,
        humidity: current.humidity,
        feelsLike: current.FeelsLikeC,
        location: city === 'Seoul' ? '서울' : city
      };
    } catch (err) {
      console.warn('[JARVIS LIVE WEATHER ERROR]', err);
      return null;
    }
  }

  /**
   * Search YouTube for the first video ID for direct instant playback
   * @param {string} query
   * @returns {Promise<{ videoId: string, watchUrl: string, embedUrl: string } | null>}
   */
  async searchFirstYouTubeVideo(query) {
    if (!query || query.trim().length === 0) return null;
    const cleanQ = query.trim();

    const fetchVideoId = async (q) => {
      try {
        const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
          signal: AbortSignal.timeout(4500)
        });
        const html = await res.text();
        const match = html.match(/\/watch\?v=([a-zA-Z0-9_-]{11})/);
        if (match && match[1]) {
          return match[1];
        }
        return null;
      } catch (e) {
        return null;
      }
    };

    try {
      let videoId = await fetchVideoId(cleanQ);
      if (!videoId) {
        // 2차 재시도: 곡명 뒤에 '노래'를 덧붙여 탐색 성공률 극대화
        videoId = await fetchVideoId(`${cleanQ} 노래`);
      }

      if (videoId) {
        return {
          videoId,
          watchUrl: `https://www.youtube.com/watch?v=${videoId}&autoplay=1`,
          embedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1&playsinline=1&origin=http://localhost:3000`
        };
      }
      return null;
    } catch (err) {
      console.warn('[JARVIS YOUTUBE SEARCH ERROR]', err);
      return null;
    }
  }
}

module.exports = new LiveInfoService();
