/**
 * J.A.R.V.I.S. Parametric 3D/2D Blueprint CAD & Generative Architecture Engine
 * Supports multi-component synthesis, dual-leaf folding, modular merging, and real-time kinematics.
 */

class CADBlueprintEngine {
  /**
   * Parse detailed natural language options into dimensions and structural flags
   * @param {string} instruction 
   * @param {object} currentDims 
   * @returns {{ dims: object, changes: string[] }}
   */
  parseDetailedOptions(instruction, currentDims) {
    const rawText = instruction || '';
    // Normalize comma in numbers (e.g. 1,800 -> 1800)
    const text = rawText.replace(/(\d+),(\d+)/g, '$1$2').trim();
    const dims = { ...currentDims };
    const changes = [];

    // 0. 자동 회전 제어 (Auto-Rotate Toggle)
    const isStopAutoRotate = /(?:자동\s*회전|회전).*(?:꺼|끄|중지|멈춰|차단|하지\s*마|그만|수동)|(?:자동\s*회전\s*(?:off|오프))/i.test(text);
    const isStartAutoRotate = /(?:자동\s*회전|회전).*(?:켜|시작|돌려|돌아가게|동작)|(?:자동\s*회전\s*(?:on|온))/i.test(text);
    if (isStopAutoRotate) {
      dims.autoRotate = false;
      changes.push('3D 뷰포트 자동 회전을 중지하고 고정 시점으로 전환');
    } else if (isStartAutoRotate) {
      dims.autoRotate = true;
      changes.push('3D 뷰포트 자동 회전을 활성화');
    }

    // 1. 단일 상판 복원 / 보조 상판 제거
    const isSingleRequest = /(?:다\s*없애|상판\s*(?:하나만|한\s*개만|하나)|하나로|단일|단일\s*상판|보조\s*상판\s*제거|원래대로|원상복구|기본형|한\s*개만|1단|다\s*지워)/i.test(text);
    // 2. 2단 결합 / 상판 추가
    const isCombineRequest = /(?:하나\s*더|또\s*하나|추가|합쳐|결합|2단|이단|더블|확장|듀얼|이어\s*붙여)/i.test(text);

    if (isSingleRequest) {
      if (dims.hasSecondaryBoard) {
        dims.hasSecondaryBoard = false;
        dims.leaf2Angle = 0;
        changes.push('보조 상판을 제거하고 깔끔한 단일 메인 상판 구조로 환원');
      }
    } else if (isCombineRequest) {
      if (!dims.hasSecondaryBoard) {
        dims.hasSecondaryBoard = true;
        dims.leaf2Angle = 180;
        dims.leafMode = 'EXTEND';
        changes.push('동일 규격 보드를 피아노 힌지로 결합한 2단 듀얼 리프 확장 구조로 전환');
      }
    }

    // 2.5 가로/세로 치수 서로 맞바꾸기 (Swap)
    const isSwapRequest = /(?:가로.*세로.*(?:바꿔|반전|맞바꿔|스왑)|세로.*가로.*(?:바꿔|반전|맞바꿔|스왑)|치수.*(?:반전|바꿔)|가로세로.*바꿔)/i.test(text);
    if (isSwapRequest) {
      const oldW = dims.width;
      dims.width = dims.depth;
      dims.depth = oldW;
      changes.push(`가로와 세로 치수를 맞바꾸어 가로 ${dims.width}mm, 세로 ${dims.depth}mm로 반전`);
    }

    // 3. 접힘/세움 상태 시뮬레이션 (foldAngle)
    const isFoldedToWall = /(?:접힐|접혀|접었|접히|붙었|벽면에\s*붙|벽에\s*붙|밀착|내렸|내려|접어|0도|접은\s*상태|벽쪽으로|세워져|세워(?:져|봐|줘)?|수직으로)/i.test(text);
    const isExpandedFlat = /(?:펼쳐|펼쳤|폈을|올려|수평|눕혀|사용\s*상태|90도|펼친\s*상태|펴(?:줘|봐)?)/i.test(text);

    if (isFoldedToWall) {
      dims.foldAngle = 0;
      changes.push('벽면에 수직으로 완전히 세워 접힌 상태(각도 0도)로 시뮬레이션');
    } else if (isExpandedFlat) {
      dims.foldAngle = 90;
      changes.push('수평 작업 위치(각도 90도)로 전개');
    }

    // 4. 2단 보조 상판 개별 접힘/펼침 (leaf2Angle)
    if (dims.hasSecondaryBoard) {
      const isLeaf2Fold = /(?:보조.*접|2단.*접|반으로\s*접|겹쳐|겹친|접힌\s*상태)/i.test(text) && !isFoldedToWall;
      const isLeaf2Extend = /(?:보조.*펼|2단.*펼|180도|완전\s*확장|활짝|전부\s*펴)/i.test(text);
      if (isLeaf2Fold) {
        dims.leaf2Angle = 0;
        changes.push('보조 상판을 2중 겹침(0도)으로 수납');
      } else if (isLeaf2Extend) {
        dims.leaf2Angle = 180;
        changes.push('보조 상판을 180도 수평 확장');
      }
    }

    // 5. 치수 분석: 부정형 문맥("~이 아니라", "~말고") 사전 정제
    let positiveText = text.replace(/(\d{3,4}\s*(?:에|x|X|\*|곱하기|바이|×)\s*\d{3,4}|\d{3,4})\s*(?:이\s*아니라|가\s*아니라|말고|말구|아닌|말구요)/g, '');

    // 5.1 치수 쌍 정밀 파싱 ("A에 B", "A x B", "가로 A 세로 B", "세로 B 가로 A")
    let pairedMatched = false;
    const explicitWFirst = positiveText.match(/(?:가로|너비|가루)\s*[:=]?\s*(\d{3,4}).*?(?:세로|깊이|폭)\s*[:=]?\s*(\d{3,4})/i);
    const explicitDFirst = positiveText.match(/(?:세로|깊이|폭)\s*[:=]?\s*(\d{3,4}).*?(?:가로|너비|가루)\s*[:=]?\s*(\d{3,4})/i);
    const pairMatch = positiveText.match(/(\d{3,4})\s*(?:에|x|X|\*|곱하기|바이|×)\s*(\d{3,4})/i);

    if (explicitWFirst) {
      dims.width = parseInt(explicitWFirst[1], 10);
      dims.depth = parseInt(explicitWFirst[2], 10);
      pairedMatched = true;
      changes.push(`규격을 가로 ${dims.width}mm, 세로 ${dims.depth}mm로 정밀 설정`);
    } else if (explicitDFirst) {
      dims.depth = parseInt(explicitDFirst[1], 10);
      dims.width = parseInt(explicitDFirst[2], 10);
      pairedMatched = true;
      changes.push(`규격을 가로 ${dims.width}mm, 세로 ${dims.depth}mm로 정밀 설정`);
    } else if (pairMatch) {
      dims.width = parseInt(pairMatch[1], 10);
      dims.depth = parseInt(pairMatch[2], 10);
      pairedMatched = true;
      changes.push(`규격을 가로 ${dims.width}mm, 세로 ${dims.depth}mm로 설정`);
    }

    // 5.2 개별 치수 조정 (단독 명시된 경우)
    if (!pairedMatched) {
      // Width - 가로/너비/가루
      const widthMatch = positiveText.match(/(?:가로|가루|너비)(?:\s*길이)?(?:를|은|는|이|가|로)?\s*[:=]?\s*(\d{3,4})|(\d{3,4})\s*(?:mm|밀리)?\s*(?:가로|가루|너비)/i);
      if (widthMatch) {
        const parsedW = parseInt(widthMatch[1] || widthMatch[2], 10);
        if (parsedW >= 300 && parsedW <= 2400) {
          dims.width = parsedW;
          changes.push(`가로 길이를 ${parsedW}mm로 설정`);
        }
      } else if (/(?:긴\s*상판|길게|더\s*길|크게|넓게|늘려|확장|와이드|대형)/i.test(text) && !isSwapRequest) {
        const newW = Math.min(2400, dims.width + 400);
        if (newW !== dims.width) {
          dims.width = newW;
          changes.push(`가로 길이를 ${newW}mm로 대폭 확장`);
        }
      } else if (/(?:작게|줄여|좁게|아담하게|짧게|슬림)/i.test(text) && !isSwapRequest) {
        const newW = Math.max(300, dims.width - 300);
        if (newW !== dims.width) {
          dims.width = newW;
          changes.push(`가로 길이를 ${newW}mm로 축소 조정`);
        }
      }

      // Depth - 세로/폭/깊이
      const depthMatch = positiveText.match(/(?:세로|깊이|폭)(?:\s*길이)?(?:를|은|는|이|가|로)?\s*[:=]?\s*(\d{3,4})|(\d{3,4})\s*(?:mm|밀리)?\s*(?:세로|깊이|폭)/i);
      if (depthMatch) {
        const parsedD = parseInt(depthMatch[1] || depthMatch[2], 10);
        if (parsedD >= 300 && parsedD <= 2400) {
          dims.depth = parsedD;
          changes.push(`세로 깊이를 ${parsedD}mm로 설정`);
        }
      } else if (/(?:깊게|폭\s*넓게|깊이\s*늘)/i.test(text) && !isSwapRequest) {
        const newD = Math.min(2400, dims.depth + 200);
        if (newD !== dims.depth) {
          dims.depth = newD;
          changes.push(`깊이를 ${newD}mm로 확장`);
        }
      } else if (/(?:깊이\s*줄|폭\s*좁게|슬림하게)/i.test(text) && !isSwapRequest) {
        const newD = Math.max(300, dims.depth - 150);
        if (newD !== dims.depth) {
          dims.depth = newD;
          changes.push(`깊이를 ${newD}mm로 축소`);
        }
      }
    }

    // 5.3 높이 (Height)
    const heightMatch = positiveText.match(/(?:높이)(?:\s*길이)?(?:를|은|는|이|가|로)?\s*[:=]?\s*(\d{3,4})|(\d{3,4})\s*(?:mm|밀리)?\s*(?:높이)/i);
    if (heightMatch) {
      const parsedH = parseInt(heightMatch[1] || heightMatch[2], 10);
      if (parsedH >= 400 && parsedH <= 1200) {
        dims.height = parsedH;
        changes.push(`설치 높이를 ${parsedH}mm로 설정`);
      }
    }


    return { dims, changes };
  }

  /**
   * Generative synthesis of 3D CAD blueprints from natural language or modification requests
   * @param {string} rawInstruction 
   * @param {object|null} currentBlueprint 
   * @param {string|null} apiKey 
   */
  async synthesizeBlueprint(rawInstruction, currentBlueprint = null, apiKey = null) {
    const instruction = (rawInstruction || '').trim();

    let category = 'FOLDING_TABLE';
    let itemName = '벽걸이형 접이식 식탁 (Wall-Mounted Folding Table)';
    let defaultDims = { 
      width: 1200, 
      depth: 600, 
      height: 750, 
      thickness: 24, 
      foldAngle: 90,
      hasSecondaryBoard: false,
      leaf2Angle: 180,
      leafMode: 'EXTEND', // 'EXTEND' (연장 결합) or 'TIER' (2단 적층)
      autoRotate: false
    };

    if (currentBlueprint && currentBlueprint.dimensions) {
      defaultDims = { ...defaultDims, ...currentBlueprint.dimensions };
      itemName = currentBlueprint.itemName || itemName;
      category = currentBlueprint.category || category;
    }

    // Identify category if starting fresh
    if (!currentBlueprint) {
      if (/책상|데스크|컴퓨터\s*책상/i.test(instruction)) {
        itemName = '인체공학적 워크스테이션 원목 데스크';
        category = 'DESK';
        defaultDims = { width: 1400, depth: 700, height: 740, thickness: 30, foldAngle: 90, hasSecondaryBoard: false, leaf2Angle: 0 };
      } else if (/선반|수납장|책장/i.test(instruction)) {
        itemName = '벽면 결착식 3단 모듈형 선반';
        category = 'SHELF';
        defaultDims = { width: 900, depth: 320, height: 1100, thickness: 20, foldAngle: 90, hasSecondaryBoard: true, leafMode: 'TIER' };
      }
    }

    // Apply granular natural language options
    const { dims, changes } = this.parseDetailedOptions(instruction, defaultDims);
    defaultDims = dims;

    // Update item name & category dynamically based on components
    if (defaultDims.hasSecondaryBoard) {
      category = 'FOLDING_TABLE_DUAL';
      itemName = '2단 결합 확장형 접이식 식탁 (Dual-Leaf Folding Table)';
    } else {
      if (category === 'FOLDING_TABLE_DUAL') {
        category = 'FOLDING_TABLE';
        itemName = '벽걸이형 접이식 식탁 (Wall-Mounted Folding Table)';
      }
    }

    let material = defaultDims.hasSecondaryBoard 
      ? 'E0 등급 고밀도 자작나무 합판 (24T) + 1200mm 피아노 버터플라이 힌지 + 유압 댐퍼 쇼바 (350N)'
      : 'E0 등급 고밀도 자작나무 합판 (24T) + 가스 유압 쇼바 힌지 (200N)';
    let loadCapacity = defaultDims.hasSecondaryBoard ? 75 : 45;
    let description = defaultDims.hasSecondaryBoard
      ? '기존 상판에 동일 규격 보드를 버터플라이 힌지로 결합하여 최대 1200×1200mm까지 확장 가능한 2단 듀얼 리프 접이식 식탁'
      : '공간 효율을 극대화한 벽면 부착형 유압 힌지 접이식 테이블';

    // Build dynamic, non-repetitive speech reply based on changes
    let speechReply = '';
    if (changes.length > 0) {
      speechReply = `개발자님, 요청하신 세부 옵션을 반영하여 ${changes.join(', ')}하도록 3D 홀로그램 CAD 설계를 즉시 갱신했습니다.`;
    } else if (defaultDims.hasSecondaryBoard) {
      speechReply = `개발자님, 2단 듀얼 리프 결합 접이식 식탁의 3D 설계도입니다. 힌지 결착 구조와 연장 상판의 시뮬레이션을 점검하십시오.`;
    } else {
      speechReply = `개발자님, 요청하신 ${itemName}의 3D 홀로그램 CAD 설계도를 호출했습니다. 마우스로 회전하여 3차원 구조를 점검하시고, 슬라이더로 치수와 접힘 각도를 실시간 조정해 보십시오.`;
    }

    const multiplier = defaultDims.hasSecondaryBoard ? 2 : 1;
    const estimatedWeight = (((defaultDims.width * defaultDims.depth * defaultDims.thickness) * 0.00000072) * multiplier).toFixed(1);

    const parts = [
      { name: '1차 메인 상판 (Primary Board)', qty: 1, spec: `${defaultDims.width} × ${defaultDims.depth} × ${defaultDims.thickness} mm` }
    ];

    if (defaultDims.hasSecondaryBoard) {
      parts.push({ name: '2차 결합 확장 상판 (Secondary Board)', qty: 1, spec: `${defaultDims.width} × ${defaultDims.depth} × ${defaultDims.thickness} mm` });
      parts.push({ name: '피아노 버터플라이 힌지 (Butterfly Hinge)', qty: 1, spec: `${defaultDims.width} mm 연속 결착형` });
      parts.push({ name: '고하중 유압 댐퍼 쇼바 (Dual Gas Strut)', qty: 2, spec: '350N 헤비듀티 하중 등급' });
    } else {
      parts.push({ name: '유압식 댐퍼 힌지 (Gas Strut Damper)', qty: 2, spec: '200N 하중 등급 / 90° 스토퍼' });
    }

    parts.push({ name: '벽면 고정 지지대 (Wall Mount Base)', qty: 1, spec: `${defaultDims.width} × 120 × 24 mm` });
    parts.push({ name: '세이프티 락 래치 (Safety Lock Latch)', qty: 1, spec: '원터치 마그네틱 결착' });
    parts.push({ name: '칼브럭 앙카 볼트 (Anchor Bolts)', qty: 8, spec: 'M8 × 60mm 콘크리트 전용' });

    return {
      type: 'BLUEPRINT_CAD',
      title: `${itemName} 3D CAD 설계도`,
      itemName,
      category,
      description,
      dimensions: defaultDims,
      autoRotate: defaultDims.autoRotate === true,
      material,
      loadCapacity,
      estimatedWeight,
      parts,
      speechReply,
      timestamp: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
      updatedAt: Date.now()
    };
  }

  /**
   * Generative Reverse-Engineering of 3D CAD Blueprint from Furniture/Object Photo
   * Analyzes photo using Gemini Vision, strips background, extracts structural components and 3D mesh primitives.
   * @param {string} imageBase64 - Base64 encoded image
   * @param {string} mimeType - e.g. 'image/jpeg' or 'image/png'
   * @param {string} userInstruction - Optional user hint (e.g. "원목 식탁 입체로 띄워줘")
   * @param {string} apiKey - Gemini API Key
   */
  async synthesizeFromImage(imageBase64, mimeType = 'image/jpeg', userInstruction = '', apiKey = null) {
    if (!apiKey) {
      throw new Error('Gemini API 키가 설정되지 않았습니다.');
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');

    const systemPrompt = `You are J.A.R.V.I.S. High-Precision 3D CAD Reverse-Engineering Vision Engine.
Analyze the provided photograph of a piece of furniture, fixture, or architectural object with forensic architectural precision.

### CORE OBJECTIVE:
Reconstruct the EXACT 3D solid geometry and modular assembly of the target furniture shown in the photo.
The resulting 3D CAD blueprint must immediately look like the REAL FURNITURE in the photo, fully assembled and physically coherent.

### REVERSE-ENGINEERING & ASSEMBLY RULES:
1. BACKGROUND ISOLATION:
   Completely ignore floors, carpets, walls, sofas in the background, or decorative room objects. Focus 100% on the single target furniture item.

2. WATERTIGHT SOLID ASSEMBLY (NO FLOATING OR DISCONNECTED PLANES):
   - All panels, boards, and walls must have REALISTIC METRIC THICKNESS (18mm to 30mm for boards, 40mm to 60mm for legs/posts). NEVER use zero-thickness or razor-thin planes.
   - Ground Contact: Floor legs, casters, or bottom bases must start precisely at y = 0.
   - Physical Contact & Cohesion: Side walls must sit flush on the bottom base plate; shelves and tops must rest securely on top of supporting walls or legs. Components must fit together like real precision CNC/flat-pack furniture.

3. DYNAMIC SPECIALTY FURNITURE PROTOCOL:
   - If the object is a LIFT-TOP COFFEE TABLE (리프트업 소파 테이블 / 거실 수납 테이블):
     * Bottom Base Plate (바닥판): Full width and depth resting on 4 legs (y = 60~80, thickness 18mm).
     * Outer Enclosure Walls: Left side panel, Right side panel, Front wall, and Back wall forming the storage box.
     * Internal Divider (세로 칸막이): Dividing the open display shelf (left) from the hidden lift-up storage cavity (right).
     * Fixed Low Top Board (고정 보조 상판): Flat top covering the lower open section (height ~380mm).
     * Elevated Lift-up Main Top (리프트업 가동 메인 상판): Raised higher (~560-600mm) and angled/offset forward, revealing the storage cavity beneath!
     * Steel Lift-Up Hinge Arms (리프트 힌지 브라켓 암 2조): Steel linkage arms connecting the inner cavity to the raised top.
     * 4 Cylindrical/Square Support Legs (하부 다리 4개): Starting at y = 0 up to y = 60~80mm at the 4 base corners.
   - If the object is an OFFICE CHAIR / LOUNGE CHAIR:
     * 5-star base or 4 legs on floor, gas-lift / column, seat cushion base, lumbar backrest frame, armrests.
   - If the object is a CABINET / SHELF / DESK:
     * Solid outer carcass box, modular drawers/doors with handles, continuous desktop or shelving levels.

4. HOLOGRAPHIC BLUEPRINT COLOR CODING:
   - Primary working tops / seats: "#00f0ff" (Luminous Cyan)
   - Outer cabinet carcass & side walls: "#38bdf8" (Sky Blue)
   - Vertical support legs / columns: "#ffd700" (Gold Neon)
   - Moving elements & lift mechanisms / hardware: "#ff3b5c" (Coral Red)
   - Bottom base plates & internal dividers: "#a855f7" (Neon Violet)

Output ONLY valid JSON matching this schema with NO markdown codeblocks:
{
  "itemName": "가구 품목명 (한국어, 예: '모던 리프트업 수납형 거실 소파 테이블')",
  "category": "TABLE" | "DESK" | "SHELF" | "CABINET" | "CHAIR" | "BED" | "SOFA" | "FURNITURE_CUSTOM",
  "description": "사진에서 감지된 가구의 정확한 구조적 특징, 2단 비대칭 수납 및 리프트업 가동 설계 요약 (1~2문장)",
  "dimensions": {
    "width": 1050,
    "depth": 550,
    "height": 580,
    "thickness": 20
  },
  "material": "상세 자재 및 하드웨어 사양 (예: 20T LPM 무광 화이트 코팅 MDF + 유압식 댐퍼 리프트업 스틸 하드웨어 + 분체도장 강철 다리)",
  "loadCapacity": 85,
  "estimatedWeight": 22.0,
  "components": [
    {
      "name": "하부 원통형 지지 다리 (4ea)",
      "shape": "box",
      "x": -480,
      "y": 0,
      "z": -230,
      "w": 40,
      "h": 70,
      "d": 40,
      "color": "#ffd700"
    }
  ],
  "parts": [
    { "name": "리프트업 가동 상판", "qty": 1, "spec": "650 × 550 × 20 mm LPM MDF" },
    { "name": "고정형 보조 상판", "qty": 1, "spec": "400 × 550 × 20 mm LPM MDF" },
    { "name": "스틸 리프트 힌지 어셈블리", "qty": 2, "spec": "고탄성 가스 스프링 댐퍼 링크" }
  ],
  "speechReply": "개발자님, 사진 속 가구의 배경을 분리하고, 2단 분할 리프트업 상판과 수납 박스 구조를 3D 입체 CAD 설계도로 정밀 역설계했습니다."
}`;

    const candidateModels = [
      'gemini-3.6-flash',
      'gemini-3.7-flash',
      'gemini-3.5-flash',
      'gemini-flash-lite-latest'
    ];
    let lastError = null;
    let analysis = null;

    for (const model of candidateModels) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const payload = {
          contents: [
            {
              role: "user",
              parts: [
                { text: `${systemPrompt}\n\n사용자 지시: ${userInstruction || '이 사진 속 가구의 배경을 빼고 실제 사진 속 가구 형태와 정확히 일치하도록 부품들을 3D 입체 설계도로 역설계해줘.'}` },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: cleanBase64
                  }
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 4096,
            responseMimeType: "application/json"
          }
        };

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          const data = await res.json();
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
          const cleanedText = text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
          analysis = JSON.parse(cleanedText);
          console.log(`[CAD VISION SUCCESS] Analyzed by ${model}: ${analysis.itemName} (${analysis.components?.length} components)`);
          break;
        } else {
          const errText = await res.text();
          lastError = new Error(`Vision ${model} status ${res.status}: ${errText.slice(0, 150)}`);
          console.warn(`[CAD VISION TRY FAIL] ${model} failed: ${res.status}`);
        }
      } catch (err) {
        lastError = err;
        console.warn(`[CAD VISION TRY EXCEPTION] ${model}: ${err.message}`);
      }
    }

    if (!analysis) {
      throw new Error(`가구 사진 3D 역설계 분석 실패 (${lastError?.message || 'AI 서비스 일시적 지연'}). 다시 한번 사진을 입력해 주십시오.`);
    }

    const dims = {
      width: analysis.dimensions?.width || 1100,
      depth: analysis.dimensions?.depth || 550,
      height: analysis.dimensions?.height || 580,
      thickness: analysis.dimensions?.thickness || 20,
      foldAngle: 90,
      autoRotate: false
    };

    // Synthesize physically coherent, watertight precision 3D assembly
    const precisionComponents = this.assemblePrecision3DGeometry(analysis, dims);

    return {
      type: 'BLUEPRINT_CAD',
      title: `${analysis.itemName || '사진 기반 가구'} 3D CAD 설계도`,
      itemName: analysis.itemName || '사진 기반 가구',
      category: analysis.category || 'FURNITURE_CUSTOM',
      description: analysis.description || '사진에서 추출된 가구의 3D 입체 구조',
      dimensions: dims,
      autoRotate: false,
      material: analysis.material || '맞춤 원목 및 금속 프레임',
      loadCapacity: analysis.loadCapacity || 70,
      estimatedWeight: analysis.estimatedWeight || 15.0,
      components: precisionComponents,
      parts: analysis.parts && analysis.parts.length > 0 ? analysis.parts : this.generatePrecisionBOM(analysis, dims),
      sourcePhoto: cleanBase64 ? `data:${mimeType};base64,${cleanBase64}` : null,
      speechReply: analysis.speechReply || `개발자님, 사진 속 ${analysis.itemName}의 배경을 제거하고 3D 입체 설계도로 투영했습니다.`,
      timestamp: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
      updatedAt: Date.now()
    };
  }

  /**
   * Parametric Geometry & Watertight Assembly Solver
   * Enforces 100% seam-to-seam CNC alignment without floating/disconnected planes.
   */
  assemblePrecision3DGeometry(analysis, dims) {
    const itemName = analysis.itemName || '';
    const desc = analysis.description || '';
    const cat = (analysis.category || '').toUpperCase();
    const W = dims.width || 1100;
    const D = dims.depth || 550;
    const H = dims.height || 580;
    const T = dims.thickness || 20;

    const isLiftTop = /리프트|lift/i.test(itemName) || /리프트|lift/i.test(desc) || cat.includes('LIFT');
    const isChair = /의자|체어|chair|스툴|stool/i.test(itemName) || cat === 'CHAIR';
    const isDesk = /책상|데스크|desk/i.test(itemName) || cat === 'DESK';
    const isCabinet = /서랍|수납|장식장|선반|cabinet|drawer|shelf/i.test(itemName) || cat === 'CABINET' || cat === 'SHELF';

    // 1. Specialty Assembly: Dual-Split Lift-Top Multi-Storage Coffee Table
    if (isLiftTop) {
      const legH = 70;
      const closedH = Math.min(420, Math.round(H * 0.7)); // Closed carcass top height (~400mm)
      const boxH = closedH - legH; // Box wall height (~330mm)
      const splitRatio = 0.36; // Left open section (36%), Right lift section (64%)
      const leftW = Math.round(W * splitRatio);
      const rightW = W - leftW;
      const divX = -W / 2 + leftW;
      const legInset = 35;
      const legSize = 38;

      return [
        // 4 Solid Support Legs (Floor y=0 to base y=legH)
        { name: "하부 지지 다리 (FL)", shape: "box", x: -W/2 + legInset, y: 0, z: D/2 - legInset - legSize, w: legSize, h: legH, d: legSize, color: "#ffd700" },
        { name: "하부 지지 다리 (FR)", shape: "box", x: W/2 - legInset - legSize, y: 0, z: D/2 - legInset - legSize, w: legSize, h: legH, d: legSize, color: "#ffd700" },
        { name: "하부 지지 다리 (BL)", shape: "box", x: -W/2 + legInset, y: 0, z: -D/2 + legInset, w: legSize, h: legH, d: legSize, color: "#ffd700" },
        { name: "하부 지지 다리 (BR)", shape: "box", x: W/2 - legInset - legSize, y: 0, z: -D/2 + legInset, w: legSize, h: legH, d: legSize, color: "#ffd700" },

        // Bottom Solid Base Plate (Resting precisely on top of all 4 legs)
        { name: "하부 메인 베이스 플레이트 (Bottom Base)", shape: "box", x: -W/2, y: legH, z: -D/2, w: W, h: T, d: D, color: "#a855f7" },

        // Outer Carcass Walls (Sitting directly flush on top of base plate)
        { name: "좌측 측면 외벽 (Left Wall)", shape: "box", x: -W/2, y: legH + T, z: -D/2, w: T, h: boxH - T, d: D, color: "#38bdf8" },
        { name: "우측 측면 외벽 (Right Wall)", shape: "box", x: W/2 - T, y: legH + T, z: -D/2, w: T, h: boxH - T, d: D, color: "#38bdf8" },
        { name: "후면 백 플레이트 (Rear Wall)", shape: "box", x: -W/2 + T, y: legH + T, z: -D/2, w: W - 2*T, h: boxH - T, d: T, color: "#38bdf8" },
        { name: "우측 수납함 전면벽 (Front Right Wall)", shape: "box", x: divX, y: legH + T, z: D/2 - T, w: rightW, h: boxH - T, d: T, color: "#38bdf8" },
        { name: "좌측 오픈 수납 턱 (Front Open Lip)", shape: "box", x: -W/2 + T, y: legH + T, z: D/2 - T, w: leftW - T, h: 45, d: T, color: "#38bdf8" },

        // Center Vertical Divider (Dividing open shelf from lift cavity)
        { name: "중앙 수납 분할 칸막이 (Center Divider)", shape: "box", x: divX, y: legH + T, z: -D/2 + T, w: T, h: boxH - T, d: D - 2*T, color: "#a855f7" },

        // Left Fixed Top Surface (Flush covering left open section)
        { name: "좌측 고정 보조 상판 (Fixed Low Top)", shape: "box", x: -W/2, y: closedH, z: -D/2, w: leftW + T, h: T, d: D, color: "#00f0ff" },

        // Right Elevated Lift-up Top Surface (Raised and offset forward)
        { name: "우측 리프트업 메인 상판 (Elevated Lift Top)", shape: "box", x: divX + T, y: H, z: -D/2 + 120, w: rightW - T, h: T, d: D, color: "#00f0ff" },

        // Steel Scissor / Gas-Lift Linkage Arms
        { name: "좌측 스틸 리프트 힌지 암 (L-Arm)", shape: "box", x: divX + 22, y: Math.round((closedH + H)/2) - 35, z: -25, w: 18, h: H - closedH, d: 35, color: "#ff3b5c" },
        { name: "우측 스틸 리프트 힌지 암 (R-Arm)", shape: "box", x: W/2 - T - 40, y: Math.round((closedH + H)/2) - 35, z: -25, w: 18, h: H - closedH, d: 35, color: "#ff3b5c" }
      ];
    }

    // 2. Specialty Assembly: Ergonomic Chair
    if (isChair) {
      return this.buildChairAssembly(W, D, H, T);
    }

    // 3. Specialty Assembly: Drawer / Carcass Cabinet
    if (isCabinet) {
      return this.buildCabinetAssembly(W, D, H, T);
    }

    // 4. Default: Precision Solid Table / Desk Assembly
    return this.buildStandardTableAssembly(W, D, H, T);
  }

  buildChairAssembly(W, D, H, T) {
    const seatH = Math.round(H * 0.45);
    const legR = Math.round(W * 0.42);
    return [
      // 5-Star Floor Casters & Base
      { name: "하부 5스타 베이스 기둥 (Base)", shape: "box", x: -legR, y: 0, z: -legR, w: legR * 2, h: 60, d: legR * 2, color: "#a855f7" },
      // Gas-lift Hydraulic Cylinder
      { name: "중앙 가스 리프트 실린더 (Cylinder)", shape: "box", x: -35, y: 60, z: -35, w: 70, h: seatH - 80, d: 70, color: "#ffd700" },
      // Seat Mechanism Box
      { name: "틸팅 메커니즘 박스 (Mechanism)", shape: "box", x: -140, y: seatH - 30, z: -160, w: 280, h: 30, d: 320, color: "#ff3b5c" },
      // Seat Cushion
      { name: "인체공학 메쉬 시트 좌판 (Seat)", shape: "box", x: -Math.round(W*0.35), y: seatH, z: -Math.round(D*0.35), w: Math.round(W*0.7), h: 45, d: Math.round(D*0.7), color: "#00f0ff" },
      // Left Armrest
      { name: "좌측 조절식 암레스트 (L-Arm)", shape: "box", x: -Math.round(W*0.42), y: seatH + 45, z: -100, w: 35, h: 180, d: 200, color: "#ffd700" },
      // Right Armrest
      { name: "우측 조절식 암레스트 (R-Arm)", shape: "box", x: Math.round(W*0.42) - 35, y: seatH + 45, z: -100, w: 35, h: 180, d: 200, color: "#ffd700" },
      // Backrest Frame & Slats
      { name: "등받이 척추 백본 프레임 (Spine)", shape: "box", x: -35, y: seatH + 30, z: -Math.round(D*0.35), w: 70, h: H - seatH - 50, d: 40, color: "#ffd700" },
      { name: "인체공학 통기성 등받이 (Backrest)", shape: "box", x: -Math.round(W*0.32), y: seatH + 80, z: -Math.round(D*0.38), w: Math.round(W*0.64), h: H - seatH - 100, d: 30, color: "#00f0ff" }
    ];
  }

  buildCabinetAssembly(W, D, H, T) {
    const legH = 50;
    const bodyH = H - legH;
    const drawerH = Math.round((bodyH - 2*T) / 3);
    return [
      // 4 Base Feet
      { name: "하부 받침 다리 (FL)", shape: "box", x: -W/2 + 20, y: 0, z: D/2 - 50, w: 35, h: legH, d: 35, color: "#ffd700" },
      { name: "하부 받침 다리 (FR)", shape: "box", x: W/2 - 55, y: 0, z: D/2 - 50, w: 35, h: legH, d: 35, color: "#ffd700" },
      { name: "하부 받침 다리 (BL)", shape: "box", x: -W/2 + 20, y: 0, z: -D/2 + 15, w: 35, h: legH, d: 35, color: "#ffd700" },
      { name: "하부 받침 다리 (BR)", shape: "box", x: W/2 - 55, y: 0, z: -D/2 + 15, w: 35, h: legH, d: 35, color: "#ffd700" },
      // Bottom Base
      { name: "바닥 베이스 판 (Bottom)", shape: "box", x: -W/2, y: legH, z: -D/2, w: W, h: T, d: D, color: "#a855f7" },
      // Side Walls
      { name: "좌측 측판 (Left Wall)", shape: "box", x: -W/2, y: legH + T, z: -D/2, w: T, h: bodyH - 2*T, d: D, color: "#38bdf8" },
      { name: "우측 측판 (Right Wall)", shape: "box", x: W/2 - T, y: legH + T, z: -D/2, w: T, h: bodyH - 2*T, d: D, color: "#38bdf8" },
      // Rear Backplate
      { name: "후면 백보드 (Backboard)", shape: "box", x: -W/2 + T, y: legH + T, z: -D/2, w: W - 2*T, h: bodyH - 2*T, d: T, color: "#38bdf8" },
      // Top Surface
      { name: "상부 메인 상판 (Top Board)", shape: "box", x: -W/2, y: H - T, z: -D/2, w: W, h: T, d: D, color: "#00f0ff" },
      // 3 Drawers
      { name: "1단 서랍 전면 패널 (Drawer 1)", shape: "box", x: -W/2 + T + 6, y: legH + T + 4, z: D/2 - T, w: W - 2*T - 12, h: drawerH - 8, d: T, color: "#00ffaa" },
      { name: "2단 서랍 전면 패널 (Drawer 2)", shape: "box", x: -W/2 + T + 6, y: legH + T + drawerH + 4, z: D/2 - T, w: W - 2*T - 12, h: drawerH - 8, d: T, color: "#00ffaa" },
      { name: "3단 서랍 전면 패널 (Drawer 3)", shape: "box", x: -W/2 + T + 6, y: legH + T + drawerH*2 + 4, z: D/2 - T, w: W - 2*T - 12, h: drawerH - 8, d: T, color: "#00ffaa" }
    ];
  }

  buildStandardTableAssembly(W, D, H, T) {
    const legSize = 45;
    const apronH = 65;
    return [
      // Top Surface
      { name: "메인 상판 (Primary Surface)", shape: "box", x: -W/2, y: H - T, z: -D/2, w: W, h: T, d: D, color: "#00f0ff" },
      // 4 Solid Legs
      { name: "좌측 전면 다리 (FL Leg)", shape: "box", x: -W/2 + 20, y: 0, z: D/2 - 20 - legSize, w: legSize, h: H - T, d: legSize, color: "#ffd700" },
      { name: "우측 전면 다리 (FR Leg)", shape: "box", x: W/2 - 20 - legSize, y: 0, z: D/2 - 20 - legSize, w: legSize, h: H - T, d: legSize, color: "#ffd700" },
      { name: "좌측 후면 다리 (BL Leg)", shape: "box", x: -W/2 + 20, y: 0, z: -D/2 + 20, w: legSize, h: H - T, d: legSize, color: "#ffd700" },
      { name: "우측 후면 다리 (BR Leg)", shape: "box", x: W/2 - 20 - legSize, y: 0, z: -D/2 + 20, w: legSize, h: H - T, d: legSize, color: "#ffd700" },
      // 4 Aprons (Under-top reinforcement beams)
      { name: "전면 에이프런 빔 (Front Apron)", shape: "box", x: -W/2 + 20 + legSize, y: H - T - apronH, z: D/2 - 20 - legSize, w: W - 40 - 2*legSize, h: apronH, d: 20, color: "#a855f7" },
      { name: "후면 에이프런 빔 (Rear Apron)", shape: "box", x: -W/2 + 20 + legSize, y: H - T - apronH, z: -D/2 + 20, w: W - 40 - 2*legSize, h: apronH, d: 20, color: "#a855f7" },
      { name: "좌측 에이프런 빔 (Left Apron)", shape: "box", x: -W/2 + 20, y: H - T - apronH, z: -D/2 + 20 + legSize, w: 20, h: apronH, d: D - 40 - 2*legSize, color: "#a855f7" },
      { name: "우측 에이프런 빔 (Right Apron)", shape: "box", x: W/2 - 40, y: H - T - apronH, z: -D/2 + 20 + legSize, w: 20, h: apronH, d: D - 40 - 2*legSize, color: "#a855f7" }
    ];
  }

  generatePrecisionBOM(analysis, dims) {
    return [
      { name: "메인 리프트업 상판", qty: 1, spec: `${Math.round(dims.width * 0.64)} × ${dims.depth} × ${dims.thickness} mm LPM 화이트` },
      { name: "고정형 오픈 보조 상판", qty: 1, spec: `${Math.round(dims.width * 0.36)} × ${dims.depth} × ${dims.thickness} mm LPM 화이트` },
      { name: "하부 베이스 플레이트", qty: 1, spec: `${dims.width} × ${dims.depth} × ${dims.thickness} mm 하중지지 베이스` },
      { name: "외벽 및 중앙 수납 프레임 세트", qty: 1, spec: `측판, 전후면판, 내부 분할 칸막이 어셈블리` },
      { name: "스틸 리프트업 힌지 링크 기구", qty: 2, spec: `유압 가스 스프링 댐퍼 일체형 링크 하드웨어` },
      { name: "하부 원통형 받침 다리", qty: 4, spec: `Ø40 × 70 mm 스틸 파우더 코팅` }
    ];
  }

  /**
   * Basic backward compatibility method
   */
  generateBlueprint(rawItemName) {
    return this.synthesizeBlueprint(rawItemName);
  }
}

module.exports = new CADBlueprintEngine();
