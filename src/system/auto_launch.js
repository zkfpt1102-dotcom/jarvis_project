const fs = require('fs');
const path = require('path');
const os = require('os');

class AutoLaunchManager {
  constructor() {
    this.startupDir = path.join(
      os.homedir(),
      'AppData',
      'Roaming',
      'Microsoft',
      'Windows',
      'Start Menu',
      'Programs',
      'Startup'
    );
    this.shortcutBat = path.join(this.startupDir, 'JARVIS_AutoLaunch.bat');
    this.vbsLauncher = path.join(this.startupDir, 'JARVIS_SilentBoot.vbs');
    this.projectRoot = path.resolve(__dirname, '..', '..');
  }

  /**
   * Check if Jarvis is registered for Windows startup
   * @returns {boolean}
   */
  isEnabled() {
    return fs.existsSync(this.vbsLauncher) || fs.existsSync(this.shortcutBat);
  }

  /**
   * Enable Windows startup: creates a silent background VBScript in the Windows Startup folder
   * that launches Jarvis on boot with the --autostart flag
   * @returns {boolean}
   */
  enable() {
    try {
      if (!fs.existsSync(this.startupDir)) {
        fs.mkdirSync(this.startupDir, { recursive: true });
      }

      // 1. Create a silent runner batch script
      const runBatContent = `@echo off\r\ncd /d "${this.projectRoot}"\r\nstart "" /b node server.js --autostart\r\n`;
      fs.writeFileSync(this.shortcutBat, runBatContent, 'utf-8');

      // 2. Create a VBScript to launch the batch script completely invisibly on Windows boot
      const vbsContent = `Set WshShell = CreateObject("WScript.Shell")\r\nWshShell.Run chr(34) & "${this.shortcutBat}" & chr(34), 0\r\nSet WshShell = Nothing\r\n`;
      fs.writeFileSync(this.vbsLauncher, vbsContent, 'utf-8');

      console.log('[JARVIS AUTO-LAUNCH] Enabled Windows startup at:', this.vbsLauncher);
      return true;
    } catch (err) {
      console.error('[JARVIS AUTO-LAUNCH] Failed to enable auto-launch:', err);
      return false;
    }
  }

  /**
   * Disable Windows startup
   * @returns {boolean}
   */
  disable() {
    try {
      let removed = false;
      if (fs.existsSync(this.vbsLauncher)) {
        fs.unlinkSync(this.vbsLauncher);
        removed = true;
      }
      if (fs.existsSync(this.shortcutBat)) {
        fs.unlinkSync(this.shortcutBat);
        removed = true;
      }
      console.log('[JARVIS AUTO-LAUNCH] Disabled Windows startup');
      return true;
    } catch (err) {
      console.error('[JARVIS AUTO-LAUNCH] Failed to disable auto-launch:', err);
      return false;
    }
  }
}

module.exports = new AutoLaunchManager();
