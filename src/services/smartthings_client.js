/**
 * Samsung SmartThings REST API Client for JARVIS
 * Supports TV device controls: Power, Volume, Mute, Channel, Input Sources, Status
 */

const dgram = require('dgram');

class SmartThingsClient {
  constructor(config = {}) {
    this.baseUrl = 'https://api.smartthings.com/v1';
    this.token = config.token || '';
    this.tvDeviceId = config.tvDeviceId || '';
    this.tvMac = config.tvMac || '';
  }

  updateConfig(config = {}) {
    if (config.token !== undefined) this.token = config.token;
    if (config.tvDeviceId !== undefined) this.tvDeviceId = config.tvDeviceId;
    if (config.tvMac !== undefined) this.tvMac = config.tvMac;
  }

  sendWol(macAddress) {
    const targetMac = (macAddress || this.tvMac || '').replace(/[:-]/g, '').trim();
    if (targetMac.length !== 12) return false;
    try {
      const magicPacket = Buffer.alloc(102);
      magicPacket.fill(0xff, 0, 6);
      const macBuffer = Buffer.from(targetMac, 'hex');
      for (let i = 0; i < 16; i++) {
        macBuffer.copy(magicPacket, 6 + i * 6);
      }
      const client = dgram.createSocket('udp4');
      client.bind(() => {
        client.setBroadcast(true);
        client.send(magicPacket, 0, magicPacket.length, 9, '255.255.255.255', () => {
          try { client.close(); } catch (e) {}
        });
      });
      return true;
    } catch (e) {
      console.warn('[SMARTTHINGS WOL WARN]:', e.message);
      return false;
    }
  }

  isConfigured() {
    return Boolean(this.token && this.token.trim().length > 10);
  }

  async request(endpoint, options = {}) {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'SMARTTHINGS_TOKEN_MISSING',
        message: 'Samsung SmartThings Personal Access Token(PAT)이 설정되지 않았습니다. config.json에 smartthings.token을 입력해 주십시오.'
      };
    }

    const url = `${this.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    try {
      const headers = {
        'Authorization': `Bearer ${this.token.trim()}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(options.headers || {})
      };

      const response = await fetch(url, {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          status: response.status,
          error: errorText,
          message: `SmartThings API 오류 (HTTP ${response.status}): ${errorText.slice(0, 100)}`
        };
      }

      const data = await response.json();
      return { success: true, data };
    } catch (err) {
      clearTimeout(timeoutId);
      return {
        success: false,
        error: err.name === 'AbortError' ? 'TIMEOUT' : err.message,
        message: err.name === 'AbortError' ? 'SmartThings API 요청 시간 초과' : `SmartThings 통신 실패: ${err.message}`
      };
    }
  }

  /**
   * 등록된 모든 스마트 기기 목록 조회
   */
  async listDevices() {
    const res = await this.request('/devices');
    if (!res.success) return res;
    const items = (res.data && res.data.items) ? res.data.items : [];
    return {
      success: true,
      devices: items.map(d => ({
        deviceId: d.deviceId,
        name: d.name || d.label,
        label: d.label,
        deviceTypeName: d.deviceTypeName,
        categories: (d.components && d.components[0] && d.components[0].categories) || []
      }))
    };
  }

  /**
   * TV 상태 조회
   */
  async getTvStatus(targetDeviceId) {
    const deviceId = targetDeviceId || this.tvDeviceId;
    if (!deviceId) {
      return {
        success: false,
        error: 'TV_DEVICE_ID_MISSING',
        message: '삼성 TV Device ID가 지정되지 않았습니다.'
      };
    }

    const res = await this.request(`/devices/${deviceId}/status`);
    if (!res.success) return res;

    const main = res.data?.components?.main || {};
    const switchState = main.switch?.switch?.value || 'unknown';
    const volume = main.audioVolume?.volume?.value ?? null;
    const muted = main.audioMute?.mute?.value === 'muted';
    const inputSource = main.mediaInputSource?.inputSource?.value || null;
    const tvChannel = main.tvChannel?.tvChannel?.value || null;

    return {
      success: true,
      deviceId,
      power: switchState, // 'on' | 'off'
      volume,
      muted,
      inputSource,
      tvChannel,
      raw: res.data
    };
  }

  /**
   * 특정 기기 명령 실행 (Commands API)
   */
  async executeCommand(commandPayload, targetDeviceId) {
    const deviceId = targetDeviceId || this.tvDeviceId;
    if (!deviceId) {
      return {
        success: false,
        error: 'TV_DEVICE_ID_MISSING',
        message: '삼성 TV Device ID가 지정되지 않았습니다.'
      };
    }

    const commands = Array.isArray(commandPayload) ? commandPayload : [commandPayload];
    return await this.request(`/devices/${deviceId}/commands`, {
      method: 'POST',
      body: { commands }
    });
  }

  /**
   * TV 전원 켜기 (Switch On)
   */
  async turnOn(targetDeviceId) {
    // 꺼져 있는 삼성 TV는 WoL 매직 패킷으로 슬립 모드를 해제해야 켜집니다.
    if (this.tvMac) {
      this.sendWol();
    }
    return await this.executeCommand({
      component: 'main',
      capability: 'switch',
      command: 'on'
    }, targetDeviceId);
  }

  /**
   * TV 전원 끄기 (Switch Off)
   */
  async turnOff(targetDeviceId) {
    return await this.executeCommand({
      component: 'main',
      capability: 'switch',
      command: 'off'
    }, targetDeviceId);
  }

  /**
   * 볼륨 설정 (0 ~ 100)
   */
  async setVolume(volumeLevel, targetDeviceId) {
    const vol = Math.min(100, Math.max(0, parseInt(volumeLevel, 10)));
    return await this.executeCommand({
      component: 'main',
      capability: 'audioVolume',
      command: 'setVolume',
      arguments: [vol]
    }, targetDeviceId);
  }

  /**
   * 볼륨 한 단계 올리기
   */
  async volumeUp(targetDeviceId) {
    return await this.executeCommand({
      component: 'main',
      capability: 'audioVolume',
      command: 'volumeUp'
    }, targetDeviceId);
  }

  /**
   * 볼륨 한 단계 내리기
   */
  async volumeDown(targetDeviceId) {
    return await this.executeCommand({
      component: 'main',
      capability: 'audioVolume',
      command: 'volumeDown'
    }, targetDeviceId);
  }

  /**
   * 음소거 설정 / 해제
   */
  async setMute(isMuted, targetDeviceId) {
    return await this.executeCommand({
      component: 'main',
      capability: 'audioMute',
      command: isMuted ? 'mute' : 'unmute'
    }, targetDeviceId);
  }

  /**
   * TV 채널 변경
   */
  async setChannel(channelNumber, targetDeviceId) {
    return await this.executeCommand({
      component: 'main',
      capability: 'tvChannel',
      command: 'setTvChannel',
      arguments: [String(channelNumber)]
    }, targetDeviceId);
  }

  /**
   * 외부 입력 변경 (예: HDMI1, HDMI2, TV 등)
   */
  async setInputSource(sourceName, targetDeviceId) {
    return await this.executeCommand({
      component: 'main',
      capability: 'mediaInputSource',
      command: 'setInputSource',
      arguments: [sourceName]
    }, targetDeviceId);
  }

  /**
   * TV 앱 실행 (유튜브, 넷플릭스, 디즈니+, 티빙 등)
   */
  async launchApp(appName, targetDeviceId) {
    const APP_MAP = {
      'youtube': { id: '111299001912', label: 'YouTube' },
      '유튜브': { id: '111299001912', label: 'YouTube' },
      '유투브': { id: '111299001912', label: 'YouTube' },
      'netflix': { id: '3201512006785', label: 'Netflix' },
      '넷플릭스': { id: '3201512006785', label: 'Netflix' },
      'disney': { id: '3201901019364', label: 'Disney+' },
      '디즈니': { id: '3201901019364', label: 'Disney+' },
      '디즈니플러스': { id: '3201901019364', label: 'Disney+' },
      'tving': { id: '3201504001965', label: 'Tving' },
      '티빙': { id: '3201504001965', label: 'Tving' },
      'wavve': { id: '3201611010984', label: 'Wavve' },
      '웨이브': { id: '3201611010984', label: 'Wavve' }
    };

    const key = String(appName || 'youtube').toLowerCase().trim();
    const appInfo = APP_MAP[key] || { id: '111299001912', label: 'YouTube' };

    return await this.executeCommand({
      component: 'main',
      capability: 'custom.launchapp',
      command: 'launchApp',
      arguments: [appInfo.id, appInfo.label]
    }, targetDeviceId);
  }
}

module.exports = new SmartThingsClient();
