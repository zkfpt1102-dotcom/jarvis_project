let localtunnel;
try {
  localtunnel = require('localtunnel');
} catch (e) {
  localtunnel = null;
}

class TunnelService {
  constructor() {
    this.activeTunnel = null;
    this.tunnelUrl = null;
    this.provider = null;
    this.isStarting = false;
    this.error = null;
  }

  async start(port = 3000) {
    if (this.tunnelUrl && this.activeTunnel) {
      return { active: true, url: this.tunnelUrl, provider: this.provider };
    }

    if (this.isStarting) {
      // Wait for in-progress startup
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 500));
        if (this.tunnelUrl) return { active: true, url: this.tunnelUrl, provider: this.provider };
      }
    }

    this.isStarting = true;
    this.error = null;

    // 1. Try Cloudflare Tunnel (via dynamic import untun to support Electron CommonJS)
    try {
      console.log('[TUNNEL] Starting Cloudflare Quick Tunnel on port', port, '...');
      const { startTunnel } = await import('untun');
      const tunnel = await startTunnel({ port });
      const url = await tunnel.getURL();
      if (url && url.startsWith('http')) {
        this.activeTunnel = tunnel;
        this.tunnelUrl = url;
        this.provider = 'Cloudflare Quick Tunnel';
        this.isStarting = false;
        console.log('[TUNNEL SUCCESS] Cloudflare HTTPS URL:', this.tunnelUrl);
        return { active: true, url: this.tunnelUrl, provider: this.provider };
      }
    } catch (cfErr) {
      console.warn('[TUNNEL] Cloudflare tunnel failed, trying localtunnel fallback:', cfErr.message);
    }

    // 2. Fallback to localtunnel
    if (localtunnel) {
      try {
        console.log('[TUNNEL] Starting Localtunnel fallback on port', port, '...');
        const randSub = 'jarvis-' + Math.random().toString(36).substring(2, 8);
        const lt = await localtunnel({ port, subdomain: randSub });
        if (lt && lt.url) {
          this.activeTunnel = lt;
          this.tunnelUrl = lt.url;
          this.provider = 'Localtunnel (Secure HTTPS)';
          this.isStarting = false;

          lt.on('close', () => {
            this.activeTunnel = null;
            this.tunnelUrl = null;
            this.provider = null;
          });

          console.log('[TUNNEL SUCCESS] Localtunnel HTTPS URL:', this.tunnelUrl);
          return { active: true, url: this.tunnelUrl, provider: this.provider };
        }
      } catch (ltErr) {
        console.error('[TUNNEL] Localtunnel fallback also failed:', ltErr.message);
        this.error = ltErr.message;
      }
    }

    this.isStarting = false;
    return { active: false, url: null, error: this.error || 'Failed to start tunnel' };
  }

  async stop() {
    if (this.activeTunnel) {
      try {
        if (typeof this.activeTunnel.close === 'function') {
          await this.activeTunnel.close();
        }
      } catch (e) {
        console.warn('Error closing tunnel:', e);
      }
    }
    this.activeTunnel = null;
    this.tunnelUrl = null;
    this.provider = null;
    return { active: false, url: null };
  }

  getStatus() {
    return {
      active: !!this.tunnelUrl,
      url: this.tunnelUrl,
      provider: this.provider,
      error: this.error
    };
  }
}

module.exports = new TunnelService();
