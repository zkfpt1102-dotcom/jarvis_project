/**
 * LG ThinQ Connect Official REST API Client for JARVIS
 * Built for LG Smart Appliances (System Air Conditioner)
 */

const crypto = require('crypto');

class ThinQClient {
  constructor(config = {}) {
    this.baseUrl = config.baseUrl || 'https://api-kic.lgthinq.com';
    this.apiKey = config.apiKey || '';
    this.token = config.token || '';
    this.airconDeviceId = config.airconDeviceId || '';
    this.country = 'KR';
  }

  updateConfig(config = {}) {
    if (config.baseUrl !== undefined && config.baseUrl) this.baseUrl = config.baseUrl;
    if (config.apiKey !== undefined && config.apiKey) this.apiKey = config.apiKey;
    if (config.token !== undefined) this.token = config.token;
    if (config.airconDeviceId !== undefined) this.airconDeviceId = config.airconDeviceId;
  }

  isConfigured() {
    return Boolean(this.token && this.token.trim().length > 10);
  }

  async request(endpoint, options = {}) {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'THINQ_TOKEN_MISSING',
        message: 'LG ThinQ PAT 토큰이 설정되지 않았습니다.'
      };
    }

    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${this.baseUrl}${cleanEndpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    try {
      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'x-api-key': this.apiKey,
        'x-client-id': `thinq-open-${crypto.randomUUID()}`,
        'x-message-id': crypto.randomUUID(),
        'x-country': this.country,
        'Authorization': `Bearer ${this.token.trim()}`,
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
          message: `LG ThinQ 통신 실패 (HTTP ${response.status}): ${errorText.slice(0, 100)}`
        };
      }

      const data = await response.json();
      return { success: true, data };
    } catch (err) {
      clearTimeout(timeoutId);
      return {
        success: false,
        error: err.name === 'AbortError' ? 'TIMEOUT' : err.message,
        message: err.name === 'AbortError' ? 'LG ThinQ 요청 시간 초과' : `LG ThinQ 통신 오류: ${err.message}`
      };
    }
  }

  /**
   * 등록된 모든 LG 스마트 기기 목록 조회
   */
  async listDevices() {
    const res = await this.request('/devices');
    if (!res.success) return res;

    const list = res.data?.response || res.data?.items || [];
    return {
      success: true,
      devices: list.map(d => ({
        deviceId: d.deviceId,
        name: d.deviceInfo?.alias || d.deviceInfo?.modelName || d.deviceId,
        modelName: d.deviceInfo?.modelName,
        deviceType: d.deviceInfo?.deviceType
      }))
    };
  }

  /**
   * LG 시스템 에어컨 실시간 상태 조회
   */
  async getAirConditionerStatus(targetDeviceId) {
    const deviceId = targetDeviceId || this.airconDeviceId;
    if (!deviceId) {
      return {
        success: false,
        error: 'AIRCON_DEVICE_ID_MISSING',
        message: 'LG 시스템 에어컨 Device ID가 지정되지 않았습니다.'
      };
    }

    const res = await this.request(`/devices/${deviceId}/state`);
    if (!res.success) return res;

    const r = res.data?.response || {};
    const opMode = r.operation?.airConOperationMode;
    const isPowerOn = opMode === 'POWER_ON';
    const currentTemp = r.temperature?.currentTemperature ?? 24;
    const targetTemp = r.temperature?.targetTemperature ?? 24;
    const humidity = r.airQualitySensor?.humidity ?? null;
    const jobMode = r.airConJobMode?.currentJobMode ?? 'COOL';
    const wind = r.airFlow?.windStrength ?? 'AUTO';

    return {
      success: true,
      deviceId,
      power: isPowerOn ? 'on' : 'off',
      currentTemp,
      targetTemp,
      humidity,
      opMode: this.normalizeJobMode(jobMode),
      windStrength: this.normalizeWind(wind),
      raw: r
    };
  }

  /**
   * 에어컨 제어 명령 전송
   */
  async sendControlCommand(commandPayload, targetDeviceId) {
    const deviceId = targetDeviceId || this.airconDeviceId;
    if (!deviceId) {
      return {
        success: false,
        error: 'AIRCON_DEVICE_ID_MISSING',
        message: 'LG 시스템 에어컨 Device ID가 지정되지 않았습니다.'
      };
    }

    return await this.request(`/devices/${deviceId}/control`, {
      method: 'POST',
      body: commandPayload
    });
  }

  /**
   * 에어컨 전원 켜기
   */
  async turnOn(targetDeviceId) {
    return await this.sendControlCommand({
      operation: {
        airConOperationMode: 'POWER_ON'
      }
    }, targetDeviceId);
  }

  /**
   * 에어컨 전원 끄기
   */
  async turnOff(targetDeviceId) {
    return await this.sendControlCommand({
      operation: {
        airConOperationMode: 'POWER_OFF'
      }
    }, targetDeviceId);
  }

  /**
   * 희망 온도 설정 (16 ~ 30도)
   */
  async setTargetTemperature(temp, targetDeviceId) {
    const target = Math.min(30, Math.max(16, parseFloat(temp) || 24));
    return await this.sendControlCommand({
      temperature: {
        coolTargetTemperature: target
      }
    }, targetDeviceId);
  }

  /**
   * 운전 모드 변경 (COOL, DRY, FAN, AI, HEAT)
   */
  async setMode(modeStr, targetDeviceId) {
    const code = this.mapModeToCode(modeStr);
    return await this.sendControlCommand({
      airConJobMode: {
        currentJobMode: code
      }
    }, targetDeviceId);
  }

  /**
   * 바람 세기 조절 (LOW, MID, HIGH, POWER, AUTO)
   */
  async setWindStrength(strengthStr, targetDeviceId) {
    const code = this.mapWindToCode(strengthStr);
    return await this.sendControlCommand({
      airFlow: {
        windStrength: code
      }
    }, targetDeviceId);
  }

  normalizeJobMode(code) {
    const map = {
      'COOL': '냉방 (Cool)',
      'DRY': '제습 (Dry)',
      'FAN': '송풍 (Fan)',
      'AI': '인공지능 (AI)',
      'HEAT': '난방 (Heat)'
    };
    return map[code] || code;
  }

  normalizeWind(code) {
    const map = {
      'LOW': '약풍 (Low)',
      'MID': '중풍 (Mid)',
      'HIGH': '강풍 (High)',
      'POWER': '파워냉방 (Power)',
      'AUTO': '자동 (Auto)'
    };
    return map[code] || code;
  }

  mapModeToCode(str) {
    const s = String(str).toLowerCase();
    if (s.includes('제습') || s.includes('dry')) return 'DRY';
    if (s.includes('송풍') || s.includes('fan')) return 'FAN';
    if (s.includes('인공지능') || s.includes('ai') || s.includes('자동')) return 'AI';
    if (s.includes('난방') || s.includes('heat')) return 'HEAT';
    return 'COOL';
  }

  mapWindToCode(str) {
    const s = String(str).toLowerCase();
    if (s.includes('약') || s.includes('low') || s.includes('미풍')) return 'LOW';
    if (s.includes('중') || s.includes('mid') || s.includes('보통')) return 'MID';
    if (s.includes('강') || s.includes('high')) return 'HIGH';
    if (s.includes('파워') || s.includes('터보') || s.includes('power')) return 'POWER';
    return 'AUTO';
  }
}

module.exports = new ThinQClient();
