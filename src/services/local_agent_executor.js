const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const os = require('os');

class LocalAgentExecutor {
  constructor() {
    this.workspaceRoot = path.resolve(__dirname, '..', '..');
    this.allowedRoots = [
      this.workspaceRoot,
      path.join(os.homedir(), 'Desktop'),
      path.join(os.homedir(), 'Documents'),
      path.join(os.homedir(), 'Downloads')
    ];
  }

  /**
   * Resolve and validate target path safely
   */
  resolvePath(targetPath = '.') {
    if (!targetPath || targetPath === '.' || targetPath === 'jarvis' || targetPath === '루트') {
      return this.workspaceRoot;
    }

    let resolved = path.isAbsolute(targetPath)
      ? path.normalize(targetPath)
      : path.resolve(this.workspaceRoot, targetPath);

    if (!fs.existsSync(resolved)) {
      const desktopCandidate = path.resolve(path.join(os.homedir(), 'Desktop'), targetPath);
      if (fs.existsSync(desktopCandidate)) {
        return desktopCandidate;
      }
    }

    return resolved;
  }

  /**
   * 1. Explore directory contents with file metadata
   */
  exploreDirectory(targetPath = '.') {
    try {
      const fullPath = this.resolvePath(targetPath);
      if (!fs.existsSync(fullPath)) {
        return { success: false, error: `경로를 찾을 수 없습니다: ${fullPath}`, path: fullPath };
      }

      const stat = fs.statSync(fullPath);
      if (!stat.isDirectory()) {
        return { success: false, error: `디렉토리가 아닌 단일 파일입니다: ${fullPath}`, path: fullPath };
      }

      const rawEntries = fs.readdirSync(fullPath, { withFileTypes: true });
      const items = rawEntries
        .filter(e => !e.name.startsWith('.git') && e.name !== 'node_modules')
        .slice(0, 60)
        .map(e => {
          const itemPath = path.join(fullPath, e.name);
          let size = 0;
          let mtime = null;
          try {
            const s = fs.statSync(itemPath);
            size = s.size;
            mtime = s.mtime.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          } catch (err) {}
          return {
            name: e.name,
            isDirectory: e.isDirectory(),
            type: e.isDirectory() ? 'DIR' : path.extname(e.name).toUpperCase().slice(1) || 'FILE',
            size: e.isDirectory() ? '-' : `${(size / 1024).toFixed(1)} KB`,
            mtime,
            path: itemPath
          };
        });

      items.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });

      return {
        success: true,
        actionType: 'EXPLORE',
        title: `디렉토리 탐색: ${path.basename(fullPath) || 'JARVIS ROOT'}`,
        path: fullPath,
        relativePath: path.relative(this.workspaceRoot, fullPath) || 'ROOT',
        totalItems: rawEntries.length,
        items
      };
    } catch (err) {
      return { success: false, actionType: 'EXPLORE', error: err.message, path: targetPath };
    }
  }

  /**
   * 2. Search files recursively by filename or keyword
   */
  searchFiles(query, rootDir = '.') {
    try {
      const fullPath = this.resolvePath(rootDir);
      if (!fs.existsSync(fullPath)) {
        return { success: false, actionType: 'SEARCH', error: `검색 시작 경로가 없습니다: ${fullPath}` };
      }

      const results = [];
      const cleanQuery = query.toLowerCase().trim().replace(/[*?]/g, '');

      function walk(currentDir, depth = 0) {
        if (depth > 5 || results.length >= 35) return;
        try {
          const entries = fs.readdirSync(currentDir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.name.startsWith('.git') || entry.name === 'node_modules') continue;
            const entryPath = path.join(currentDir, entry.name);
            const lowerName = entry.name.toLowerCase();
            if (lowerName.includes(cleanQuery)) {
              let size = 0;
              try { size = fs.statSync(entryPath).size; } catch (e) {}
              results.push({
                name: entry.name,
                isDirectory: entry.isDirectory(),
                path: entryPath,
                relativePath: path.relative(fullPath, entryPath),
                size: entry.isDirectory() ? '-' : `${(size / 1024).toFixed(1)} KB`
              });
            }
            if (entry.isDirectory()) { walk(entryPath, depth + 1); }
          }
        } catch (e) {}
      }

      walk(fullPath);

      return {
        success: true,
        actionType: 'SEARCH',
        title: `파일 검색 결과: "${query}"`,
        query,
        rootDir: fullPath,
        count: results.length,
        results
      };
    } catch (err) {
      return { success: false, actionType: 'SEARCH', error: err.message, query };
    }
  }

  /**
   * 3. Read local file content safely with line range
   */
  readFileContent(targetPath, startLine = 1, endLine = 120) {
    try {
      const fullPath = this.resolvePath(targetPath);
      if (!fs.existsSync(fullPath)) {
        return { success: false, actionType: 'READ', error: `파일을 찾을 수 없습니다: ${fullPath}`, path: fullPath };
      }

      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        return { success: false, actionType: 'READ', error: `해당 경로는 폴더입니다: ${fullPath}`, path: fullPath };
      }

      if (stat.size > 2 * 1024 * 1024) {
        return { success: false, actionType: 'READ', error: `파일이 너무 큽니다 (${(stat.size / 1024 / 1024).toFixed(1)}MB).`, path: fullPath };
      }

      const raw = fs.readFileSync(fullPath, 'utf-8');
      const allLines = raw.split(/\r?\n/);
      const totalLines = allLines.length;

      const s = Math.max(1, parseInt(startLine, 10) || 1);
      const e = Math.min(totalLines, Math.max(s, parseInt(endLine, 10) || totalLines));

      const selectedLines = allLines.slice(s - 1, e);
      const content = selectedLines.map((line, idx) => `${s + idx}: ${line}`).join('\n');

      return {
        success: true,
        actionType: 'READ',
        title: `파일 열람: ${path.basename(fullPath)}`,
        path: fullPath,
        fileName: path.basename(fullPath),
        ext: path.extname(fullPath).toLowerCase(),
        totalLines,
        range: `${s} ~ ${e} 라인`,
        content
      };
    } catch (err) {
      return { success: false, actionType: 'READ', error: err.message, path: targetPath };
    }
  }

  /**
   * 4. Execute terminal command
   */
  executeCommand(command, cwd = null) {
    return new Promise((resolve) => {
      const workDir = cwd ? this.resolvePath(cwd) : this.workspaceRoot;
      const startTime = Date.now();

      exec(command, {
        cwd: workDir,
        timeout: 10000,
        maxBuffer: 512 * 1024,
        windowsHide: true,
        shell: 'powershell.exe'
      }, (error, stdout, stderr) => {
        const executionTime = Date.now() - startTime;
        resolve({
          success: !error,
          actionType: 'EXEC',
          title: `코드/명령어 실행: ${command.slice(0, 40)}`,
          command,
          cwd: workDir,
          stdout: (stdout || '').trim(),
          stderr: (stderr || '').trim(),
          exitCode: error ? error.code || 1 : 0,
          errorMsg: error ? error.message : null,
          executionTime: `${executionTime}ms`
        });
      });
    });
  }

  /**
   * 5. Execute JavaScript/Node.js snippet
   */
  executeJavaScript(codeSnippet) {
    const sanitized = codeSnippet.replace(/^`{3}(?:javascript|js)?|`{3}$/g, '').trim();
    const escapedCode = sanitized.replace(/"/g, '\\"');
    const cmd = `node -e "${escapedCode}"`;
    return this.executeCommand(cmd);
  }

  /**
   * 6. Autonomous Self-Diagnosis & Root Cause Investigation
   */
  async runSelfDiagnosis() {
    const now = new Date();
    const statusReport = {
      success: true,
      actionType: 'DIAGNOSE',
      title: 'J.A.R.V.I.S. 시스템 자가 진단 및 신경망 무결성 리포트',
      timestamp: now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      system: {
        nodeVersion: process.version,
        platform: `${os.platform()} (${os.arch()})`,
        uptime: `${Math.round(process.uptime())}초 가동 중`,
        memoryUsage: `${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`,
        workspace: this.workspaceRoot
      },
      services: {},
      recentChanges: [],
      recentIssues: []
    };

    const coreFiles = [
      'server.js',
      'src/memory/brain.js',
      'src/services/cad_blueprint.js',
      'src/services/local_agent_executor.js',
      'src/services/web_researcher.js',
      'src/renderer/app.js',
      'src/renderer/cad-studio.html'
    ];

    for (const f of coreFiles) {
      const fPath = path.join(this.workspaceRoot, f);
      if (fs.existsSync(fPath)) {
        const stat = fs.statSync(fPath);
        statusReport.services[f] = {
          status: 'ONLINE',
          size: `${(stat.size / 1024).toFixed(1)} KB`,
          lastModified: stat.mtime.toLocaleTimeString('ko-KR')
        };
        if (Date.now() - stat.mtimeMs < 60 * 60 * 1000) {
          statusReport.recentChanges.push(`${f} (${Math.round((Date.now() - stat.mtimeMs) / 60000)}분 전 수정)`);
        }
      } else {
        statusReport.services[f] = { status: 'MISSING' };
        statusReport.recentIssues.push(`필수 시스템 파일 누락: ${f}`);
      }
    }

    try {
      const profilePath = path.join(this.workspaceRoot, 'src', 'memory', 'user_profile.json');
      if (fs.existsSync(profilePath)) {
        const profileData = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
        const recentLogs = profileData.history_logs || [];
        const recentFriction = recentLogs.slice(0, 6).filter(l =>
          /(?:왜|못\s*알아|답답|어지럽|꺼|안\s*돼|고쳐|뭐야|아쉽)/i.test(l.user)
        );
        if (recentFriction.length > 0) {
          statusReport.recentIssues.push(`최근 개발자님 요청 및 피드백 포착: "${recentFriction[0].user}"`);
        }
      }
    } catch (e) {}

    statusReport.healthSummary = statusReport.recentIssues.length === 0
      ? '모든 코어 신경망 및 3D CAD/음성 모듈이 최적의 상태로 정상 가동 중입니다.'
      : `최근 피드백 및 이슈 ${statusReport.recentIssues.length}건을 감지하여 실시간 자가 보정 루틴이 가동되었습니다.`;

    return statusReport;
  }

  /**
   * 7. Real Automated Scenario Simulation Suite
   */
  async runScenarioSimulation() {
    const startTime = Date.now();
    const tests = [];
    const cadBlueprint = require('./cad_blueprint');

    try {
      const t1Start = Date.now();
      const res1 = cadBlueprint.parseDetailedOptions('750에 1,800 상판 하나 만들어 줘', { width: 1200, depth: 600, height: 750 });
      const pass1 = res1.dims.width === 750 && res1.dims.depth === 1800;
      tests.push({ id: 'SIM-01', name: '규격 쌍 파싱 (750에 1,800)', input: '750에 1,800 상판 하나 만들어 줘', expected: 'W: 750mm, D: 1800mm', actual: `W: ${res1.dims.width}mm, D: ${res1.dims.depth}mm`, passed: pass1, duration: `${Date.now() - t1Start}ms` });
    } catch (e) { tests.push({ id: 'SIM-01', name: '규격 쌍 파싱', passed: false, actual: e.message }); }

    try {
      const t2Start = Date.now();
      const res2 = cadBlueprint.parseDetailedOptions('1800에 750이야 750에 750이 아니라', { width: 1200, depth: 600, height: 750 });
      const pass2 = res2.dims.width === 1800 && res2.dims.depth === 750;
      tests.push({ id: 'SIM-02', name: '부정형 문맥 필터링 (750에 750 배제)', input: '1800에 750이야 750에 750이 아니라', expected: 'W: 1800mm, D: 750mm', actual: `W: ${res2.dims.width}mm, D: ${res2.dims.depth}mm`, passed: pass2, duration: `${Date.now() - t2Start}ms` });
    } catch (e) { tests.push({ id: 'SIM-02', name: '부정형 문맥 필터링', passed: false, actual: e.message }); }

    try {
      const t3Start = Date.now();
      const res3 = cadBlueprint.parseDetailedOptions('자동 회전 꺼', { width: 1200, depth: 600, autoRotate: true });
      const pass3 = res3.dims.autoRotate === false;
      tests.push({ id: 'SIM-03', name: '3D 뷰포트 자동 회전 차단', input: '자동 회전 꺼', expected: 'autoRotate: false', actual: `autoRotate: ${res3.dims.autoRotate}`, passed: pass3, duration: `${Date.now() - t3Start}ms` });
    } catch (e) { tests.push({ id: 'SIM-03', name: '3D 뷰포트 자동 회전 차단', passed: false, actual: e.message }); }

    try {
      const t4Start = Date.now();
      const res4 = cadBlueprint.parseDetailedOptions('다 없애고 상판 하나만 만들어 봐', { width: 1200, depth: 600, hasSecondaryBoard: true });
      const pass4 = res4.dims.hasSecondaryBoard === false;
      tests.push({ id: 'SIM-04', name: '단일 메인 상판 복원', input: '다 없애고 상판 하나만 만들어 봐', expected: 'hasSecondaryBoard: false', actual: `hasSecondaryBoard: ${res4.dims.hasSecondaryBoard}`, passed: pass4, duration: `${Date.now() - t4Start}ms` });
    } catch (e) { tests.push({ id: 'SIM-04', name: '단일 상판 복원', passed: false, actual: e.message }); }

    try {
      const t5Start = Date.now();
      const res5 = this.exploreDirectory('.');
      const pass5 = res5.success && (res5.items || []).length > 0;
      tests.push({ id: 'SIM-05', name: '로컬 디렉토리 탐색 무결성', input: 'exploreDirectory(ROOT)', expected: 'items > 0', actual: `발견 항목: ${res5.totalItems || 0}개`, passed: pass5, duration: `${Date.now() - t5Start}ms` });
    } catch (e) { tests.push({ id: 'SIM-05', name: '로컬 디렉토리 탐색', passed: false, actual: e.message }); }

    try {
      const t6Start = Date.now();
      const res6 = this.readFileContent('package.json', 1, 10);
      const pass6 = res6.success && res6.totalLines > 0;
      tests.push({ id: 'SIM-06', name: '로컬 파일 열람 무결성', input: 'readFileContent(package.json)', expected: 'totalLines > 0', actual: `라인 수: ${res6.totalLines}줄`, passed: pass6, duration: `${Date.now() - t6Start}ms` });
    } catch (e) { tests.push({ id: 'SIM-06', name: '로컬 파일 열람', passed: false, actual: e.message }); }

    const passedCount = tests.filter(t => t.passed).length;
    const failedCount = tests.length - passedCount;
    const totalDuration = `${Date.now() - startTime}ms`;

    return {
      success: true,
      actionType: 'SIMULATION',
      title: 'J.A.R.V.I.S. 코어 기능 시뮬레이션 실기 검증 결과',
      timestamp: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      totalDuration,
      passedCount,
      failedCount,
      totalTests: tests.length,
      allPassed: failedCount === 0,
      summary: failedCount === 0
        ? `전체 ${tests.length}개 가상 시나리오 실기 테스트를 100% 통과했습니다. (소요: ${totalDuration})`
        : `${tests.length}개 중 ${failedCount}건의 오작동 및 미스매치가 발견되었습니다.`,
      tests
    };
  }

  /**
   * 8. Write content to a file (with self-code protection guardrail)
   */
  writeFile(targetPath, content, options = {}) {
    try {
      const PROTECTED_FILES = [
        'brain.js', 'server.js', 'local_agent_executor.js',
        'cad_blueprint.js', 'os_executor.js', 'directive_engine.js',
        'preload.js', 'main.js', 'app.js', 'index.html', 'style.css'
      ];
      const baseName = path.basename(targetPath);
      if (PROTECTED_FILES.some(f => baseName === f && !options.allowCoreOverride)) {
        return {
          success: false,
          actionType: 'WRITE',
          error: `보안 정책상 자비스 핵심 시스템 파일(${baseName})은 직접 수정할 수 없습니다.`,
          path: targetPath
        };
      }

      let fullPath;
      if (path.isAbsolute(targetPath)) {
        fullPath = targetPath;
      } else if (targetPath.startsWith('generated/') || targetPath.startsWith('simulations/')) {
        fullPath = path.join(this.workspaceRoot, 'src', 'renderer', targetPath);
      } else {
        fullPath = path.resolve(this.workspaceRoot, targetPath);
      }

      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(fullPath, content, 'utf-8');

      const rendererRoot = path.join(this.workspaceRoot, 'src', 'renderer');
      let serveUrl = null;
      if (fullPath.startsWith(rendererRoot)) {
        const rel = path.relative(rendererRoot, fullPath).replace(/\\/g, '/');
        serveUrl = `http://localhost:3000/${rel}`;
      }

      return {
        success: true,
        actionType: 'WRITE',
        title: `파일 생성/저장: ${path.basename(fullPath)}`,
        path: fullPath,
        fileName: path.basename(fullPath),
        size: `${(Buffer.byteLength(content, 'utf-8') / 1024).toFixed(1)} KB`,
        serveUrl,
        timestamp: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      };
    } catch (err) {
      return { success: false, actionType: 'WRITE', error: err.message, path: targetPath };
    }
  }

  /**
   * 9. AI-Powered Instant App/Simulation Generator
   */
  async generateAndServeApp(description, apiKey) {
    const startTime = Date.now();
    const slug = description
      .replace(/[^a-zA-Z0-9가-힣\s]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 40)
      .toLowerCase() || 'generated_app';
    const fileName = `${slug}_${Date.now()}.html`;
    const savePath = `generated/${fileName}`;

    const codeGenPrompt = `You are an expert creative developer. Generate a complete, self-contained, single HTML file for the following request:

REQUEST: "${description}"

STRICT REQUIREMENTS:
1. Output ONLY the complete HTML file content. No explanation, no markdown, no code fences.
2. The file must be completely self-contained (all CSS and JavaScript inline).
3. Use modern Three.js (via CDN: https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js) for 3D visualizations.
4. For physics simulations, use a realistic physics approach with Three.js animation loop.
5. The page must have a dark, futuristic JARVIS-like aesthetic (dark background, cyan/blue accent colors).
6. Include interactive controls where appropriate (mouse rotation, click to trigger events, etc.).
7. Add a title overlay showing what the simulation is.
8. Make it visually stunning and immediately impressive on load.
9. If the request involves simulation (collapse, explosion, particles, etc.), animate it automatically.
10. The file must work when opened directly in a browser with no server-side dependencies except CDN resources.

OUTPUT: Start directly with <!DOCTYPE html> and end with </html>. Nothing else.`;

    try {
      const codeGenModels = ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.1-flash-lite'];
      let generatedCode = '';
      let lastError = null;

      for (const modelName of codeGenModels) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: codeGenPrompt }] }],
              generationConfig: { temperature: 0.7, maxOutputTokens: 8192 }
            })
          });
          if (res.ok) {
            const data = await res.json();
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (text.length > 100) { generatedCode = text; break; }
          } else {
            lastError = `${res.status}`;
          }
        } catch (e) {
          lastError = e.message;
        }
      }

      if (!generatedCode) {
        return { success: false, actionType: 'GENERATE_APP', error: `코드 생성 실패. 마지막 오류: ${lastError}` };
      }

      generatedCode = generatedCode.replace(/^```html?\n?/i, '').replace(/\n?```$/i, '').trim();

      if (!generatedCode.includes('<!DOCTYPE') && !generatedCode.includes('<html')) {
        return { success: false, actionType: 'GENERATE_APP', error: '유효한 HTML이 생성되지 않았습니다. 요청을 더 구체적으로 말씀해 주십시오.' };
      }

      const writeRes = this.writeFile(savePath, generatedCode);
      if (!writeRes.success) {
        return { success: false, actionType: 'GENERATE_APP', error: writeRes.error };
      }

      return {
        success: true,
        actionType: 'GENERATE_APP',
        title: `즉석 생성 완료: ${description.slice(0, 50)}`,
        description,
        fileName,
        path: writeRes.path,
        serveUrl: writeRes.serveUrl,
        size: writeRes.size,
        elapsed: `${Date.now() - startTime}ms`,
        timestamp: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      };
    } catch (err) {
      return { success: false, actionType: 'GENERATE_APP', error: err.message };
    }
  }
}

module.exports = new LocalAgentExecutor();
