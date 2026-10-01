/**
 * SmartThings OAuth 2.0 Auto-Refresh Manager for J.A.R.V.I.S.
 * Manages OAuth 2.0 Authorization Code flow and 24/7 background token rotation.
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = process.env.JARVIS_CONFIG_PATH || path.join(__dirname, '..', '..', 'config.json');

class SmartThingsOAuthManager {
  constructor() {
    this.tokenEndpoint = 'https://api.smartthings.com/oauth/token';
    this.authorizeEndpoint = 'https://api.smartthings.com/oauth/authorize';
    this.refreshTimer = null;
    this.loadConfig();
    this.startAutoRefreshDaemon();
  }

  loadConfig() {
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
        const cfg = JSON.parse(raw);
        const st = cfg.smartthings || {};
        this.clientId = (st.client_id || st.clientId || '').trim();
        this.clientSecret = (st.client_secret || st.clientSecret || '').trim();
        this.accessToken = (st.token || '').trim();
        this.refreshToken = (st.refresh_token || st.refreshToken || '').trim();
        this.expiresAt = Number(st.token_expires_at) || 0;
        this.tvDeviceId = (st.tv_device_id || st.tvDeviceId || '').trim();
      }
    } catch (e) {
      console.warn('[SMARTTHINGS OAUTH] Error reading config:', e.message);
    }
  }

  saveConfig(updates = {}) {
    try {
      let cfg = {};
      if (fs.existsSync(CONFIG_PATH)) {
        cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      }
      if (!cfg.smartthings) cfg.smartthings = {};

      if (updates.clientId !== undefined) cfg.smartthings.client_id = updates.clientId;
      if (updates.clientSecret !== undefined) cfg.smartthings.client_secret = updates.clientSecret;
      if (updates.accessToken !== undefined) cfg.smartthings.token = updates.accessToken;
      if (updates.refreshToken !== undefined) cfg.smartthings.refresh_token = updates.refreshToken;
      if (updates.expiresAt !== undefined) cfg.smartthings.token_expires_at = updates.expiresAt;
      if (updates.tvDeviceId !== undefined) cfg.smartthings.tv_device_id = updates.tvDeviceId;

      fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
      this.loadConfig();
      return true;
    } catch (e) {
      console.error('[SMARTTHINGS OAUTH] Error saving config:', e.message);
      return false;
    }
  }

  /**
   * OAuth 인가 페이지 URL 생성
   */
  getAuthorizeUrl(redirectUri) {
    if (!this.clientId) {
      throw new Error('SmartThings Client ID가 등록되지 않았습니다.');
    }
    const scopes = 'r:devices:* w:devices:* x:devices:*';
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: scopes
    });
    return `${this.authorizeEndpoint}?${params.toString()}`;
  }

  /**
   * Authorization Code로 Access Token 및 Refresh Token 교환
   */
  async exchangeCodeForTokens(code, redirectUri) {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('SmartThings Client ID 또는 Client Secret이 설정되지 않았습니다.');
    }

    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const bodyParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      client_id: this.clientId,
      redirect_uri: redirectUri
    });

    console.log('[SMARTTHINGS OAUTH] Exchanging auth code for tokens...');
    const response = await fetch(this.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: bodyParams.toString()
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[SMARTTHINGS OAUTH] Token exchange failed:', response.status, errText);
      throw new Error(`SmartThings 토큰 발급 실패 (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const expiresIn = Number(data.expires_in) || 86400;
    const expiresAt = Date.now() + (expiresIn * 1000);

    this.saveConfig({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: expiresAt
    });

    console.log('[SMARTTHINGS OAUTH] Tokens successfully obtained & saved. Valid for:', expiresIn, 'seconds');
    return {
      success: true,
      accessToken: data.access_token,
      expiresIn: expiresIn,
      expiresAt: new Date(expiresAt).toLocaleString()
    };
  }

  /**
   * Refresh Token을 사용하여 Access Token 무한 자동 갱신
   */
  async refreshAccessToken() {
    this.loadConfig();
    if (!this.refreshToken) {
      console.warn('[SMARTTHINGS OAUTH] No refresh token available to refresh.');
      return { success: false, error: 'NO_REFRESH_TOKEN' };
    }
    if (!this.clientId || !this.clientSecret) {
      console.warn('[SMARTTHINGS OAUTH] Client ID or Secret missing.');
      return { success: false, error: 'NO_CREDENTIALS' };
    }

    try {
      console.log('[SMARTTHINGS OAUTH] Rotating SmartThings access token via refresh token...');
      const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
      const bodyParams = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken,
        client_id: this.clientId
      });

      const response = await fetch(this.tokenEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: bodyParams.toString()
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('[SMARTTHINGS OAUTH] Refresh token failed:', response.status, errText);
        return { success: false, status: response.status, error: errText };
      }

      const data = await response.json();
      const expiresIn = Number(data.expires_in) || 86400;
      const expiresAt = Date.now() + (expiresIn * 1000);

      this.saveConfig({
        accessToken: data.access_token,
        refreshToken: data.refresh_token || this.refreshToken,
        expiresAt: expiresAt
      });

      console.log('[SMARTTHINGS OAUTH SUCCESS] New access token active until:', new Date(expiresAt).toLocaleString());
      return {
        success: true,
        accessToken: data.access_token,
        expiresAt: new Date(expiresAt).toLocaleString()
      };
    } catch (err) {
      console.error('[SMARTTHINGS OAUTH EXCEPTION]:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * 24시간 토큰 만료를 방지하기 위해 1시간마다 확인하고 필요 시 자동 갱신하는 데몬
   */
  startAutoRefreshDaemon() {
    if (this.refreshTimer) clearInterval(this.refreshTimer);

    // 30분 주기로 만료 임박 여부 확인
    this.refreshTimer = setInterval(async () => {
      this.loadConfig();
      if (!this.refreshToken) return;

      const now = Date.now();
      const timeLeftMs = this.expiresAt - now;
      const fourHoursMs = 4 * 60 * 60 * 1000;

      // 만료까지 4시간 이하로 남았거나 이미 지났으면 자동 갱신
      if (timeLeftMs <= fourHoursMs) {
        console.log(`[SMARTTHINGS OAUTH] Token expires in ${Math.round(timeLeftMs / 60000)} mins. Triggering automatic refresh...`);
        await this.refreshAccessToken();
      }
    }, 30 * 60 * 1000);

    if (this.refreshTimer && typeof this.refreshTimer.unref === 'function') {
      this.refreshTimer.unref();
    }
  }

  getStatus() {
    this.loadConfig();
    const now = Date.now();
    const timeLeftMs = this.expiresAt ? (this.expiresAt - now) : 0;
    const timeLeftHours = timeLeftMs > 0 ? (timeLeftMs / (1000 * 60 * 60)).toFixed(1) : 0;

    return {
      hasClientId: Boolean(this.clientId),
      hasClientSecret: Boolean(this.clientSecret),
      hasRefreshToken: Boolean(this.refreshToken),
      hasAccessToken: Boolean(this.accessToken),
      isConfigured: Boolean(this.clientId && this.clientSecret && this.refreshToken),
      expiresAt: this.expiresAt ? new Date(this.expiresAt).toLocaleString() : null,
      timeLeftHours: Number(timeLeftHours),
      isExpired: this.expiresAt > 0 && now >= this.expiresAt
    };
  }
}

module.exports = new SmartThingsOAuthManager();
