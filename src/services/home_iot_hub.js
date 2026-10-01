/**
 * Integrated Home IoT Automation Hub for JARVIS
 * Bridges Samsung SmartThings (TV) & LG ThinQ (System Air Conditioners per room)
 */

const fs = require('fs');
const path = require('path');
const smartthingsClient = require('./smartthings_client');
const thinqClient = require('./thinq_client');

const CONFIG_PATH = process.env.JARVIS_CONFIG_PATH || path.join(__dirname, '..', '..', 'config.json');

class HomeIoTHub {
  constructor() {
    this.smartthings = smartthingsClient;
    this.thinq = thinqClient;
    this.rooms = {
      '거실': 'aef2e97e9bcb25a318b57e30af938cc9888aac8f2970afa7896674464f70fd1e',
      '안방': 'b320676d04dbff59fbfd30aad88487582ab171f322d5bcbbb5c3c6760cf983b4',
      '컴퓨터방': 'b9b3834b14ba3d579236ff31a6e8daedf1496088dd886315451e6d9e4fbd6fcb'
    };

    this.cachedStatus = {
      tv: {
        power: 'off',
        volume: 20,
        muted: false,
        name: '삼성 스마트 TV'
      },
      aircons: {
        '거실': { power: 'off', targetTemp: 24, currentTemp: 24, opMode: '냉방 (Cool)', windStrength: '자동 (Auto)' },
        '안방': { power: 'off', targetTemp: 24, currentTemp: 25.5, opMode: '냉방 (Cool)', windStrength: '자동 (Auto)' },
        '컴퓨터방': { power: 'off', targetTemp: 24, currentTemp: 25.5, opMode: '냉방 (Cool)', windStrength: '자동 (Auto)' }
      },
      lastUpdated: new Date().toISOString()
    };

    this.reloadConfig();
  }

  loadConfig() {
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      }
    } catch (e) {
      console.error('[IOT HUB] Error loading config.json:', e.message);
    }
    return {};
  }

  reloadConfig() {
    const cfg = this.loadConfig();
    const stCfg = cfg.smartthings || {};
    const thinqCfg = cfg.lg_thinq || {};

    this.smartthings.updateConfig({
      token: stCfg.token || '',
      tvDeviceId: stCfg.tv_device_id || stCfg.tvDeviceId || '',
      tvMac: stCfg.tv_mac || ''
    });

    this.thinq.updateConfig({
      baseUrl: thinqCfg.base_url || thinqCfg.baseUrl,
      apiKey: thinqCfg.api_key || thinqCfg.apiKey || '',
      token: thinqCfg.token || thinqCfg.pat_token || '',
      airconDeviceId: thinqCfg.aircon_device_id || thinqCfg.airconDeviceId || ''
    });

    if (thinqCfg.rooms) {
      this.rooms = { ...this.rooms, ...thinqCfg.rooms };
    }
  }

  saveIotConfig(newIotConfig) {
    try {
      const cfg = this.loadConfig();
      if (newIotConfig.smartthings) {
        cfg.smartthings = { ...(cfg.smartthings || {}), ...newIotConfig.smartthings };
      }
      if (newIotConfig.lg_thinq) {
        cfg.lg_thinq = { ...(cfg.lg_thinq || {}), ...newIotConfig.lg_thinq };
      }
      fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
      this.reloadConfig();
      return { success: true };
    } catch (e) {
      console.error('[IOT HUB] Error saving IoT config:', e.message);
      return { success: false, error: e.message };
    }
  }

  /**
   * 방 이름에 따른 에어컨 기기 식별
   */
  resolveAirconTarget(roomQuery) {
    if (!roomQuery) {
      return {
        isAll: false,
        label: '거실',
        deviceIds: [this.rooms['거실'] || this.thinq.airconDeviceId]
      };
    }

    const q = String(roomQuery).trim();

    if (/(?:전\s*체|모\s*든|다|전\s*부|집\s*안|모\s*두)/i.test(q)) {
      return {
        isAll: true,
        label: '모든 방 (거실, 안방, 컴퓨터방)',
        deviceIds: Object.values(this.rooms)
      };
    }

    if (/(?:안\s*방|침\s*실|큰\s*방)/i.test(q)) {
      return {
        isAll: false,
        label: '안방',
        deviceIds: [this.rooms['안방'] || 'b320676d04dbff59fbfd30aad88487582ab171f322d5bcbbb5c3c6760cf983b4']
      };
    }

    if (/(?:컴퓨터\s*방|서\s*재|작은\s*방|pc\s*방|작업\s*실)/i.test(q)) {
      return {
        isAll: false,
        label: '컴퓨터방',
        deviceIds: [this.rooms['컴퓨터방'] || 'b9b3834b14ba3d579236ff31a6e8daedf1496088dd886315451e6d9e4fbd6fcb']
      };
    }

    // 기본값: 거실
    return {
      isAll: false,
      label: '거실',
      deviceIds: [this.rooms['거실'] || this.thinq.airconDeviceId]
    };
  }

  /**
   * 삼성 TV 제어 디스패처
   */
  async controlTv(action, param = null) {
    this.reloadConfig();
    const isReady = this.smartthings.isConfigured();

    let result = null;
    let message = "";

    switch (action) {
      case 'on':
      case 'turnOn':
        if (isReady) result = await this.smartthings.turnOn();
        if (!isReady) {
          message = "삼성 SmartThings 토큰이 설정되지 않아 TV를 켤 수 없습니다.";
        } else if (result && result.success) {
          this.cachedStatus.tv.power = 'on';
          message = "삼성 스마트 TV 전원을 켰습니다.";
        } else if (result && result.status === 401) {
          message = "삼성 스마트 TV 연동 토큰(PAT)이 만료되었거나 승인되지 않아(HTTP 401) TV를 켤 수 없습니다. SmartThings 토큰 갱신이 필요합니다.";
        } else if (result && result.error && result.error.includes('ConflictError')) {
          this.cachedStatus.tv.power = 'on';
          message = "삼성 스마트 TV에 전원 신호를 전송했습니다. (TV 설정에서 '모바일로 켜기' 활성화 시 꺼진 상태에서도 켜집니다.)";
        } else {
          message = `삼성 TV 전원 켜기 실패: ${result ? result.message : '알 수 없는 오류'}`;
        }
        break;

      case 'off':
      case 'turnOff':
        if (isReady) result = await this.smartthings.turnOff();
        this.cachedStatus.tv.power = 'off';
        if (isReady && result && !result.success && result.error && result.error.includes('ConflictError')) {
          message = "삼성 스마트 TV가 이미 종료되어 있거나 대기 모드 상태입니다.";
        } else if (isReady && result && result.success) {
          message = "삼성 스마트 TV 전원을 껐습니다.";
        } else if (isReady && result && !result.success) {
          message = `삼성 TV 종료 신호 전송 완료 (${result.message.slice(0, 40)})`;
        } else {
          message = "삼성 스마트 TV 전원을 종료했습니다.";
        }
        break;

      case 'volume_up':
      case 'volumeUp':
        if (isReady) result = await this.smartthings.volumeUp();
        this.cachedStatus.tv.volume = Math.min(100, (this.cachedStatus.tv.volume || 20) + 2);
        message = `삼성 TV 볼륨을 올렸습니다. (현재: ${this.cachedStatus.tv.volume}%)`;
        break;

      case 'volume_down':
      case 'volumeDown':
        if (isReady) result = await this.smartthings.volumeDown();
        this.cachedStatus.tv.volume = Math.max(0, (this.cachedStatus.tv.volume || 20) - 2);
        message = `삼성 TV 볼륨을 내렸습니다. (현재: ${this.cachedStatus.tv.volume}%)`;
        break;

      case 'set_volume':
      case 'setVolume': {
        const v = Math.min(100, Math.max(0, parseInt(param, 10) || 20));
        if (isReady) result = await this.smartthings.setVolume(v);
        this.cachedStatus.tv.volume = v;
        message = `삼성 TV 볼륨을 ${v}%로 설정했습니다.`;
        break;
      }

      case 'mute':
        if (isReady) result = await this.smartthings.setMute(true);
        this.cachedStatus.tv.muted = true;
        message = "삼성 TV를 음소거했습니다.";
        break;

      case 'unmute':
        if (isReady) result = await this.smartthings.setMute(false);
        this.cachedStatus.tv.muted = false;
        message = "삼성 TV 음소거를 해제했습니다.";
        break;

      case 'channel':
      case 'setChannel': {
        const ch = String(param || '11');
        if (isReady) result = await this.smartthings.setChannel(ch);
        message = `삼성 TV 채널을 ${ch}번으로 변경했습니다.`;
        break;
      }

      case 'launch_app':
      case 'launchApp':
      case 'app':
      case 'youtube':
      case 'netflix': {
        const appTarget = action === 'youtube' ? 'youtube' : (action === 'netflix' ? 'netflix' : (param || 'youtube'));
        const appLabel = appTarget.toLowerCase().includes('netflix') ? '넷플릭스' : '유튜브';
        if (isReady) {
          // TV가 꺼져 있을 경우 전원 On 신호 먼저 전송
          if (this.cachedStatus.tv.power !== 'on') {
            await this.smartthings.turnOn().catch(() => {});
          }
          result = await this.smartthings.launchApp(appTarget);
        }
        this.cachedStatus.tv.power = 'on';
        message = isReady && result && result.success
          ? `삼성 스마트 TV에서 ${appLabel} 앱을 실행했습니다.`
          : `삼성 스마트 TV에서 ${appLabel} 앱 실행 신호를 전송했습니다.`;
        break;
      }

      case 'status':
      default:
        if (isReady) {
          const liveStatus = await this.smartthings.getTvStatus();
          if (liveStatus.success) {
            this.cachedStatus.tv.power = liveStatus.power;
            if (liveStatus.volume !== null) this.cachedStatus.tv.volume = liveStatus.volume;
            this.cachedStatus.tv.muted = liveStatus.muted;
          }
        }
        message = `삼성 TV 상태: 전원 ${this.cachedStatus.tv.power === 'on' ? '켜짐' : '꺼짐'}, 볼륨 ${this.cachedStatus.tv.volume}%, 음소거 ${this.cachedStatus.tv.muted ? '설정' : '해제'}`;
        break;
    }

    this.cachedStatus.lastUpdated = new Date().toISOString();
    return {
      success: true,
      device: 'TV',
      action,
      param,
      message,
      isLiveApi: isReady && Boolean(result?.success),
      tvStatus: this.cachedStatus.tv
    };
  }

  /**
   * LG 시스템 에어컨 제어 디스패처 (방별 독립 제어 지원)
   * @param {string} action - 'on' | 'off' | 'set_temp' | 'temp_up' | 'temp_down' | 'set_mode' | 'set_wind' | 'status'
   * @param {any} param - 희망 온도, 모드명 등
   * @param {string} targetRoom - '거실' | '안방' | '컴퓨터방' | '전체' | null
   */
  async controlAircon(action, param = null, targetRoom = null) {
    this.reloadConfig();
    const isReady = this.thinq.isConfigured();
    const target = this.resolveAirconTarget(targetRoom);

    let message = "";
    let lastResult = null;

    for (const dId of target.deviceIds) {
      let res = null;
      switch (action) {
        case 'on':
        case 'turnOn':
          if (isReady) res = await this.thinq.turnOn(dId);
          break;
        case 'off':
        case 'turnOff':
          if (isReady) res = await this.thinq.turnOff(dId);
          break;
        case 'set_temp':
        case 'setTemp': {
          const t = Math.min(30, Math.max(16, parseFloat(param) || 24));
          if (isReady) res = await this.thinq.setTargetTemperature(t, dId);
          break;
        }
        case 'set_mode':
        case 'setMode':
          if (isReady) res = await this.thinq.setMode(param || '냉방', dId);
          break;
        case 'set_wind':
        case 'setWind':
          if (isReady) res = await this.thinq.setWindStrength(param || '자동', dId);
          break;
      }
      lastResult = res;
    }

    switch (action) {
      case 'on':
      case 'turnOn':
        message = `${target.label} 에어컨을 가동했습니다.`;
        break;
      case 'off':
      case 'turnOff':
        message = `${target.label} 에어컨을 껐습니다.`;
        break;
      case 'set_temp':
      case 'setTemp': {
        const t = Math.min(30, Math.max(16, parseFloat(param) || 24));
        message = `${target.label} 에어컨 희망 온도를 ${t}도로 맞췄습니다.`;
        break;
      }
      case 'set_mode':
      case 'setMode':
        message = `${target.label} 에어컨 운전 모드를 '${param || '냉방'}'(으)로 변경했습니다.`;
        break;
      case 'set_wind':
      case 'setWind':
        message = `${target.label} 에어컨 바람 세기를 '${param || '자동'}'(으)로 조절했습니다.`;
        break;
      case 'status':
      default: {
        const targetId = target.deviceIds[0];
        if (isReady && targetId) {
          const live = await this.thinq.getAirConditionerStatus(targetId);
          if (live.success) {
            message = `${target.label} 에어컨 상태: 전원 ${live.power === 'on' ? '가동 중' : '꺼짐'}, 현재 실내 ${live.currentTemp}℃, 희망 ${live.targetTemp}℃, 모드 ${live.opMode}`;
          } else {
            message = `${target.label} 에어컨 상태 조회 실패 (${live.message})`;
          }
        } else {
          message = `${target.label} 에어컨 상태: 대기 중`;
        }
        break;
      }
    }

    this.cachedStatus.lastUpdated = new Date().toISOString();
    return {
      success: true,
      device: 'AIRCON',
      room: target.label,
      action,
      param,
      message,
      isLiveApi: isReady && Boolean(lastResult?.success)
    };
  }

  /**
   * 홈 IoT 전체 기기 상태 요약
   */
  async getHomeStatus() {
    this.reloadConfig();
    return {
      success: true,
      smartthingsConfigured: this.smartthings.isConfigured(),
      thinqConfigured: this.thinq.isConfigured(),
      devices: {
        tv: this.cachedStatus.tv,
        rooms: this.rooms
      },
      lastUpdated: this.cachedStatus.lastUpdated
    };
  }
}

module.exports = new HomeIoTHub();
