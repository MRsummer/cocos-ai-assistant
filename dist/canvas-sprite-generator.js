"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CanvasSpriteGenerator = void 0;
const https = __importStar(require("https"));
const http = __importStar(require("http"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
/**
 * AI Gateway configuration (shared with ai-chat)
 */
const AI_CONFIG = {
    baseUrl: 'https://ai-gateway.wepieoa.com',
    apiKey: 'sk-f4LMvSSYT6ewJAptLi9WNg',
    model: 'claude-opus-4-6',
    maxTokens: 16384,
    anthropicVersion: '2023-06-01',
};
const MAX_ROUNDS = 5;
const RENDER_TIMEOUT = 15000; // 15s for electron render
/**
 * Get a safe temp directory that works in Cocos Creator plugin environment
 */
function getSafeTempDir() {
    // Try multiple approaches since os.tmpdir() can fail in some plugin contexts
    try {
        const tmp = os.tmpdir();
        if (tmp)
            return path.join(tmp, 'cocos-ai-assistant');
    }
    catch (_a) { }
    // Fallback: use project temp directory
    try {
        if (Editor && Editor.Project && Editor.Project.path) {
            return path.join(Editor.Project.path, 'temp', 'cocos-ai-assistant');
        }
    }
    catch (_b) { }
    // Last resort
    return path.join(process.env.TMPDIR || process.env.TMP || process.env.TEMP || '/tmp', 'cocos-ai-assistant');
}
/**
 * System prompt for the canvas sprite generation agent
 */
const SPRITE_AGENT_SYSTEM_PROMPT = `你是一个精灵图（sprite）生成专家。用户会描述游戏风格和需要的精灵角色，你需要为每个精灵生成 Canvas 2D 绘制函数。

## 输出格式

严格输出 JSON 数组，不要输出其他文字。每个元素格式：

\`\`\`json
[
  {
    "name": "player",
    "description": "蓝色骑士，手持长剑",
    "width": 64,
    "height": 64,
    "frames": 3,
    "tags": ["角色", "玩家"],
    "draw": "function(ctx, w, h, frame) { ... }"
  }
]
\`\`\`

## 规则

1. **name**：英文小写 + 连字符，如 "player", "enemy-goblin", "item-potion"
2. **description**：中文简要描述外观
3. **width/height**：使用用户指定的尺寸，默认 64x64
4. **frames**：每个动作生成合理的帧数（通常 2-4 帧），一个精灵的所有动作帧加起来最多 8 帧
5. **tags**：中文标签数组
6. **draw 函数**：
   - 参数：ctx（CanvasRenderingContext2D）, w（宽度）, h（高度）, frame（当前帧索引，从 0 开始）
   - 根据 frame 索引绘制不同动作/姿态
   - 角色居中绘制在 (w/2, h/2) 附近
   - 只画角色本身，不画血条、阴影、名字等 UI 元素
   - 使用丰富的颜色和细节，让角色看起来精致
   - 动画帧之间要有明显的视觉差异

7. **Canvas API 限制**（重要）：
   - 禁止 roundRect()、Path2D、OffscreenCanvas、ctx.filter、ctx.reset()
   - 圆角矩形用 arc() + lineTo() 手写
   - arc() 的半径参数必须 Math.max(0, radius)
   - 文字用 ctx.fillText，measureText 只有 .width

8. 确保所有用户请求的精灵都包含在输出中，不要遗漏
9. 如果内容较多输出被截断，已输出的 JSON 元素必须是完整的（不要在一个对象中间截断）`;
/**
 * Canvas Sprite Generator
 * Uses an internal AI agent to generate Canvas 2D draw functions,
 * then renders them via Electron BrowserWindow to produce PNG images.
 */
class CanvasSpriteGenerator {
    /**
     * Generate sprites from description
     */
    async generate(request, onStatus) {
        try {
            // Step 1: Build prompt and call AI agent
            onStatus === null || onStatus === void 0 ? void 0 : onStatus({ type: 'generating', message: '正在生成精灵绘制代码...' });
            const spriteDefs = await this.callSpriteAgent(request, onStatus);
            if (!spriteDefs || spriteDefs.length === 0) {
                return { success: false, error: 'AI 未生成有效的精灵定义' };
            }
            onStatus === null || onStatus === void 0 ? void 0 : onStatus({ type: 'progress', message: `AI 生成了 ${spriteDefs.length} 个精灵定义，开始渲染...` });
            // Step 2: Render via Electron hidden window
            onStatus === null || onStatus === void 0 ? void 0 : onStatus({ type: 'rendering', message: `正在渲染 ${spriteDefs.length} 个精灵（共 ${spriteDefs.reduce((a, s) => a + s.frames, 0)} 帧）...` });
            const renderedImages = await this.renderSprites(spriteDefs);
            // Step 3: Save to temp and optionally import to project
            const tempDir = path.join(getSafeTempDir(), 'canvas-sprites');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            const results = [];
            let totalImages = 0;
            for (const sprite of spriteDefs) {
                const spriteImages = [];
                for (let f = 0; f < sprite.frames; f++) {
                    const key = `${sprite.name}-${f}`;
                    const base64 = renderedImages[key];
                    if (base64 && base64.startsWith('data:image/png')) {
                        // Save to temp file
                        const rawBase64 = base64.replace(/^data:image\/png;base64,/, '');
                        const fileName = `${sprite.name}-${f}.png`;
                        const filePath = path.join(tempDir, fileName);
                        fs.writeFileSync(filePath, Buffer.from(rawBase64, 'base64'));
                        const imageEntry = { frame: f, base64, filePath };
                        // Import to project if requested
                        if (request.importToProject) {
                            const importDir = request.importPath || 'db://assets/ai-sprites';
                            const importPath = `${importDir}/${fileName}`;
                            try {
                                onStatus === null || onStatus === void 0 ? void 0 : onStatus({ type: 'importing', message: `导入 ${fileName} 到项目...` });
                                const content = Buffer.from(rawBase64, 'base64');
                                await Editor.Message.request('asset-db', 'create-asset', importPath, content);
                                imageEntry.importedPath = importPath;
                            }
                            catch (e) {
                                console.warn(`[CanvasSprite] Failed to import ${fileName}: ${e.message}`);
                            }
                        }
                        spriteImages.push(imageEntry);
                        totalImages++;
                    }
                }
                results.push({
                    name: sprite.name,
                    description: sprite.description,
                    width: sprite.width,
                    height: sprite.height,
                    frames: sprite.frames,
                    tags: sprite.tags,
                    images: spriteImages,
                });
            }
            onStatus === null || onStatus === void 0 ? void 0 : onStatus({
                type: 'done',
                message: `✅ 成功生成 ${results.length} 个精灵，共 ${totalImages} 张图片`,
            });
            return {
                success: true,
                sprites: results,
                totalImages,
            };
        }
        catch (error) {
            onStatus === null || onStatus === void 0 ? void 0 : onStatus({ type: 'error', message: error.message });
            return { success: false, error: error.message };
        }
    }
    /**
     * Call the internal AI agent to generate Canvas draw functions
     */
    async callSpriteAgent(request, onStatus) {
        // Build user prompt
        const spriteDescs = request.sprites.map((s, i) => {
            const size = s.width && s.height ? `，尺寸 ${s.width}×${s.height}` : '';
            const actions = s.actions && s.actions.length > 0 ? `\n   动作：${s.actions.join('、')}` : '';
            return `${i + 1}. **${s.name}**：${s.description}${size}${actions}`;
        }).join('\n');
        const userPrompt = `## 游戏风格\n${request.style}\n\n## 需要生成的精灵\n${spriteDescs}\n\n请为以上所有精灵生成 draw 函数，严格输出 JSON 数组。`;
        // Multi-round conversation for long outputs
        const messages = [
            { role: 'user', content: userPrompt },
        ];
        let fullJson = '';
        for (let round = 0; round < MAX_ROUNDS; round++) {
            onStatus === null || onStatus === void 0 ? void 0 : onStatus({
                type: 'generating',
                message: round === 0
                    ? `正在使用 AI 生成 ${request.sprites.length} 个精灵的 Canvas 绘制代码...`
                    : `AI 输出较长，正在续写（第 ${round + 1} 轮）...`,
            });
            const response = await this.callLLM(messages);
            const content = response.content;
            const finishReason = response.stop_reason;
            // Extract text from content blocks
            let text = '';
            if (typeof content === 'string') {
                text = content;
            }
            else if (Array.isArray(content)) {
                text = content
                    .filter((b) => b.type === 'text')
                    .map((b) => b.text)
                    .join('');
            }
            fullJson += text;
            if (finishReason === 'max_tokens') {
                // Output was truncated, ask to continue
                messages.push({ role: 'assistant', content: text });
                messages.push({ role: 'user', content: '输出被截断了，请从截断处继续输出剩余的 JSON 内容。不要重复已输出的部分。' });
                continue;
            }
            break;
        }
        // Parse JSON
        let jsonStr = fullJson.trim();
        jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
        const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
        if (!arrayMatch) {
            throw new Error('AI 未返回有效的 JSON 数组');
        }
        let parsed;
        try {
            parsed = JSON.parse(arrayMatch[0]);
        }
        catch (_a) {
            throw new Error('JSON 解析失败，AI 返回的格式有误');
        }
        if (!Array.isArray(parsed) || parsed.length === 0) {
            throw new Error('AI 返回了空数组');
        }
        // Validate and normalize
        return parsed.map((s) => ({
            name: s.name || 'unnamed',
            description: s.description || '',
            width: s.width || 64,
            height: s.height || 64,
            frames: Math.min(s.frames || 1, 8),
            tags: s.tags || [],
            draw: s.draw || 'function(ctx,w,h,f){}',
        }));
    }
    /**
     * Render sprites using Electron BrowserWindow (hidden)
     */
    async renderSprites(sprites) {
        // Build sprite definitions for the HTML
        const spriteDefs = sprites.map(s => `{
            name: ${JSON.stringify(s.name)},
            width: ${s.width},
            height: ${s.height},
            frames: ${s.frames},
            draw: ${s.draw}
        }`);
        const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Sprite Renderer</title></head>
<body>
<script>
(function() {
    var sprites = [${spriteDefs.join(',\n')}];
    var assetMap = {};
    var scale = 2;
    var errors = [];
    for (var i = 0; i < sprites.length; i++) {
        var sprite = sprites[i];
        var frameCount = sprite.frames || 1;
        var w = sprite.width || 64;
        var h = sprite.height || 64;
        for (var f = 0; f < frameCount; f++) {
            var cvs = document.createElement('canvas');
            cvs.width = w * scale;
            cvs.height = h * scale;
            var ctx = cvs.getContext('2d');
            ctx.scale(scale, scale);
            try {
                sprite.draw(ctx, w, h, f);
            } catch(err) {
                errors.push(sprite.name + '-' + f + ': ' + err.message);
            }
            assetMap[sprite.name + '-' + f] = cvs.toDataURL('image/png');
            cvs.width = 0;
            cvs.height = 0;
        }
    }
    window.__assetMap = assetMap;
    window.__errors = errors;
    window.__done = true;
})();
</script>
</body></html>`;
        return new Promise((resolve, reject) => {
            try {
                // Use Electron's BrowserWindow (available in Cocos Creator environment)
                const { BrowserWindow } = require('electron');
                const win = new BrowserWindow({
                    show: false,
                    width: 400,
                    height: 300,
                    webPreferences: {
                        nodeIntegration: false,
                        contextIsolation: true,
                    },
                });
                // Write HTML to temp file
                const htmlPath = path.join(getSafeTempDir(), 'sprite-render.html');
                const htmlDir = path.dirname(htmlPath);
                if (!fs.existsSync(htmlDir)) {
                    fs.mkdirSync(htmlDir, { recursive: true });
                }
                fs.writeFileSync(htmlPath, html);
                let settled = false;
                const timeout = setTimeout(() => {
                    if (!settled) {
                        settled = true;
                        try {
                            win.close();
                        }
                        catch (_a) { }
                        reject(new Error('渲染超时'));
                    }
                }, RENDER_TIMEOUT);
                win.loadFile(htmlPath).then(() => {
                    // Wait for rendering to complete
                    const checkDone = async () => {
                        try {
                            const done = await win.webContents.executeJavaScript('window.__done');
                            if (done) {
                                const assetMap = await win.webContents.executeJavaScript('JSON.stringify(window.__assetMap)');
                                const errors = await win.webContents.executeJavaScript('JSON.stringify(window.__errors)');
                                clearTimeout(timeout);
                                if (!settled) {
                                    settled = true;
                                    try {
                                        win.close();
                                    }
                                    catch (_a) { }
                                    const parsedErrors = JSON.parse(errors || '[]');
                                    if (parsedErrors.length > 0) {
                                        console.warn('[CanvasSprite] Render errors:', parsedErrors);
                                    }
                                    resolve(JSON.parse(assetMap || '{}'));
                                }
                            }
                            else {
                                setTimeout(checkDone, 100);
                            }
                        }
                        catch (_b) {
                            setTimeout(checkDone, 100);
                        }
                    };
                    // Small delay then start checking
                    setTimeout(checkDone, 500);
                }).catch((err) => {
                    clearTimeout(timeout);
                    if (!settled) {
                        settled = true;
                        try {
                            win.close();
                        }
                        catch (_a) { }
                        reject(new Error(`加载渲染页面失败: ${err.message}`));
                    }
                });
            }
            catch (err) {
                reject(new Error(`创建渲染窗口失败: ${err.message}`));
            }
        });
    }
    /**
     * Call LLM via AI Gateway (Anthropic Messages API)
     */
    callLLM(messages) {
        return new Promise((resolve, reject) => {
            const body = JSON.stringify({
                model: AI_CONFIG.model,
                max_tokens: AI_CONFIG.maxTokens,
                system: SPRITE_AGENT_SYSTEM_PROMPT,
                messages,
            });
            const urlObj = new URL(AI_CONFIG.baseUrl + '/v1/messages');
            const options = {
                hostname: urlObj.hostname,
                port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
                path: urlObj.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': AI_CONFIG.apiKey,
                    'anthropic-version': AI_CONFIG.anthropicVersion,
                    'Content-Length': Buffer.byteLength(body),
                },
            };
            const transport = urlObj.protocol === 'https:' ? https : http;
            const req = transport.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    try {
                        if (res.statusCode && res.statusCode >= 400) {
                            reject(new Error(`API Error ${res.statusCode}: ${data.substring(0, 200)}`));
                            return;
                        }
                        const parsed = JSON.parse(data);
                        if (parsed.error) {
                            reject(new Error(`API Error: ${parsed.error.message || JSON.stringify(parsed.error)}`));
                            return;
                        }
                        resolve(parsed);
                    }
                    catch (e) {
                        reject(new Error(`Failed to parse response: ${e.message}`));
                    }
                });
            });
            req.on('error', (err) => {
                reject(new Error(`Request failed: ${err.message}`));
            });
            req.setTimeout(180000, () => {
                req.destroy();
                reject(new Error('Request timeout (180s)'));
            });
            req.write(body);
            req.end();
        });
    }
}
exports.CanvasSpriteGenerator = CanvasSpriteGenerator;
