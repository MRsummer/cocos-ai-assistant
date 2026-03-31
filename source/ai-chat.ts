import * as https from 'https';
import * as http from 'http';
import { MCPServer } from './mcp-server';

/**
 * AI Gateway configuration
 */
const AI_CONFIG = {
    baseUrl: 'https://ai-gateway.wepieoa.com',
    apiKey: 'sk-f4LMvSSYT6ewJAptLi9WNg',
    model: 'claude-sonnet-4-6',
    maxTokens: 8192,
    anthropicVersion: '2023-06-01',
};

/**
 * Message types for Anthropic Messages API
 */
export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string | ContentBlock[];
}

export interface ContentBlock {
    type: 'text' | 'tool_use' | 'tool_result' | 'image';
    text?: string;
    id?: string;
    name?: string;
    input?: any;
    tool_use_id?: string;
    content?: string | ContentBlock[];
    is_error?: boolean;
    source?: {
        type: 'base64';
        media_type: string;
        data: string;
    };
}

export interface ToolDefinitionForAI {
    name: string;
    description: string;
    input_schema: any;
}

export interface AIResponse {
    id: string;
    type: string;
    role: string;
    content: ContentBlock[];
    stop_reason: string;
    usage: {
        input_tokens: number;
        output_tokens: number;
    };
}

export interface ChatSession {
    id: string;
    messages: ChatMessage[];
    createdAt: string;
    title: string;
}

/**
 * Callback for streaming status updates to the panel
 */
export type StatusCallback = (status: {
    type: 'thinking' | 'tool_call' | 'tool_result' | 'text' | 'error' | 'done';
    message: string;
    data?: any;
}) => void;

/**
 * AI Chat Engine - manages conversations with the AI model
 * and automatically executes MCP tools based on AI responses
 */
export class AIChatEngine {
    private mcpServer: MCPServer | null = null;
    private sessions: Map<string, ChatSession> = new Map();
    private currentSessionId: string = '';
    private abortController: AbortController | null = null;
    private systemPrompt: string = '';

    constructor() {
        this.createNewSession();
    }

    /**
     * Set the MCP server reference for tool execution
     */
    public setMCPServer(server: MCPServer): void {
        this.mcpServer = server;
        this.buildSystemPrompt();
    }

    /**
     * Build the base system prompt
     */
    private buildSystemPrompt(): void {
        this.systemPrompt = `你是 Cocos AI Assistant，一个专业的 Cocos Creator 游戏开发 AI 伙伴。

## 你的能力
你可以通过工具直接操控 Cocos Creator 编辑器：
- 创建和管理场景、节点、组件
- 创建和实例化预制体
- **读取和精确修改**项目脚本和资源文件
- 生成游戏精灵图（generate_sprite_canvas 工具）
- 调试和验证

## ⚠️ 核心工作原则

### 修改现有代码时必须遵守：
1. **先读后改**：修改任何脚本前，必须先用 \`read_asset\` 读取当前完整内容
2. **精确修改**：用 \`patch_asset\` 做 SEARCH/REPLACE 局部修改，**绝对不要**用 save_asset 覆盖整个文件
3. **最小改动**：只改需要改的部分，不要重写不相关的代码
4. **改后验证**：修改后再用 \`read_asset\` 读一遍，确认改动正确、没有破坏其他逻辑

### 创建新脚本时必须遵守：
1. **了解已有代码**：创建新脚本前，先读取相关的已有脚本，了解接口和依赖
2. **正确的脚本结构**：Cocos Creator TypeScript 脚本必须遵循以下格式：

\`\`\`typescript
import { _decorator, Component, Node } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('ClassName')
export class ClassName extends Component {
    @property
    speed: number = 100;

    start() {
        // 初始化
    }

    update(deltaTime: number) {
        // 每帧更新
    }
}
\`\`\`

### Cocos Creator 开发要点：
- 节点操作用 \`this.node\`，获取位置用 \`this.node.position\`，设置位置用 \`this.node.setPosition(x, y, z)\`
- 获取组件用 \`this.getComponent(ComponentClass)\` 或 \`this.node.getComponent(ComponentClass)\`
- 子节点用 \`this.node.children\`，\`this.node.getChildByName('name')\`
- 输入监听：\`input.on(Input.EventType.TOUCH_START, callback, this)\`
- 键盘输入：\`input.on(Input.EventType.KEY_DOWN, callback, this)\`
- 碰撞检测：添加 Collider2D 组件 + 在脚本中 \`this.getComponent(Collider2D).on(Contact2DType.BEGIN_CONTACT, callback, this)\`
- 定时器：\`this.schedule(callback, interval)\`，\`this.scheduleOnce(callback, delay)\`
- 场景切换：\`director.loadScene('sceneName')\`
- UI 按钮事件：通过编辑器绑定或 \`button.node.on('click', callback, this)\`
- Label 文字：\`this.getComponent(Label).string = 'text'\`
- Sprite 换图：加载新 SpriteFrame 赋值给 \`sprite.spriteFrame\`
- 物理系统：PhysicsSystem2D.instance.enable = true（需在项目设置中开启）

## 工作流程
1. 用户描述需求
2. **制定计划**：简要列出要做的步骤（2-3句话）
3. 逐步执行：每步用工具操作，确认结果
4. 如果要修改现有文件：read_asset → patch_asset → read_asset 验证
5. 完成后简要总结

## 上下文使用
- 下方"当前工程上下文"包含项目目录、场景列表和节点层级，直接参考
- 创建节点时从上下文中查找父节点 UUID
- 用户指代"那个按钮"等时，从场景层级推断
- 使用中文回复，简洁专业`;
    }

    /**
     * Gather current project context (directory, scenes, hierarchy)
     * Injected into system prompt before each AI call
     */
    private async gatherProjectContext(): Promise<string> {
        if (!this.mcpServer) return '';

        const contextParts: string[] = [];
        contextParts.push('\n\n## 当前工程上下文\n');

        // 1. 项目资源目录结构
        try {
            const assets = await this.mcpServer.executeToolCall('project_get_assets', { path: 'db://assets', pattern: '*' });
            if (assets && assets.success !== false) {
                const assetStr = typeof assets === 'string' ? assets : JSON.stringify(assets, null, 2);
                // 截断避免 token 过多
                const truncated = assetStr.length > 3000 ? assetStr.substring(0, 3000) + '\n... (已截断)' : assetStr;
                contextParts.push('### 项目资源目录\n```\n' + truncated + '\n```\n');
            }
        } catch (e: any) {
            console.log('[AIChatEngine] Failed to get assets:', e.message);
        }

        // 2. 场景列表
        try {
            const scenes = await this.mcpServer.executeToolCall('scene_get_scene_list', {});
            if (scenes && scenes.success !== false) {
                const scenesStr = typeof scenes === 'string' ? scenes : JSON.stringify(scenes, null, 2);
                contextParts.push('### 项目场景列表\n```\n' + scenesStr + '\n```\n');
            }
        } catch (e: any) {
            console.log('[AIChatEngine] Failed to get scene list:', e.message);
        }

        // 3. 当前场景节点层级（含组件信息）
        try {
            const hierarchy = await this.mcpServer.executeToolCall('scene_get_scene_hierarchy', { includeComponents: true });
            if (hierarchy && hierarchy.success !== false) {
                const hierarchyStr = typeof hierarchy === 'string' ? hierarchy : JSON.stringify(hierarchy, null, 2);
                // 层级树可能很大，截断到 5000 字符
                const truncated = hierarchyStr.length > 5000 ? hierarchyStr.substring(0, 5000) + '\n... (已截断)' : hierarchyStr;
                contextParts.push('### 当前场景节点层级\n```\n' + truncated + '\n```\n');
            }
        } catch (e: any) {
            console.log('[AIChatEngine] Failed to get hierarchy:', e.message);
        }

        return contextParts.join('');
    }

    /**
     * Get tool definitions formatted for Anthropic API
     */
    private getToolDefinitions(): ToolDefinitionForAI[] {
        if (!this.mcpServer) return [];

        const mcpTools = this.mcpServer.getAvailableTools();
        return mcpTools.map(tool => ({
            name: tool.name,
            description: tool.description,
            input_schema: tool.inputSchema || { type: 'object', properties: {} },
        }));
    }

    /**
     * Create a new chat session
     */
    public createNewSession(): string {
        const id = `session_${Date.now()}`;
        const session: ChatSession = {
            id,
            messages: [],
            createdAt: new Date().toISOString(),
            title: '新对话',
        };
        this.sessions.set(id, session);
        this.currentSessionId = id;
        return id;
    }

    /**
     * Get the current session
     */
    public getCurrentSession(): ChatSession | null {
        return this.sessions.get(this.currentSessionId) || null;
    }

    /**
     * Get all sessions
     */
    public getAllSessions(): ChatSession[] {
        return Array.from(this.sessions.values()).sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
    }

    /**
     * Clear the current session
     */
    public clearCurrentSession(): void {
        const session = this.getCurrentSession();
        if (session) {
            session.messages = [];
            session.title = '新对话';
        }
    }

    /**
     * Get conversation history for the panel
     */
    public getHistory(): { role: string; content: string }[] {
        const session = this.getCurrentSession();
        if (!session) return [];

        const history: { role: string; content: string }[] = [];
        for (const msg of session.messages) {
            if (typeof msg.content === 'string') {
                history.push({ role: msg.role, content: msg.content });
            } else if (Array.isArray(msg.content)) {
                // Extract text blocks for display
                const textParts = msg.content
                    .filter((b: ContentBlock) => b.type === 'text' && b.text)
                    .map((b: ContentBlock) => b.text!)
                    .join('\n');
                if (textParts) {
                    history.push({ role: msg.role, content: textParts });
                }
            }
        }
        return history;
    }

    /**
     * Stop the current AI request
     */
    public stop(): void {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    }

    /**
     * Send a message to the AI and process the response
     * Handles the tool_use / tool_result loop automatically
     */
    public async chat(userMessage: string, onStatus?: StatusCallback): Promise<string> {
        const session = this.getCurrentSession();
        if (!session) {
            throw new Error('No active session');
        }

        // Add user message
        session.messages.push({ role: 'user', content: userMessage });

        // Update session title from first message
        if (session.messages.length === 1) {
            session.title = userMessage.substring(0, 30) + (userMessage.length > 30 ? '...' : '');
        }

        // Build the tools list
        const tools = this.getToolDefinitions();

        // Gather project context every turn (refresh scene hierarchy after AI operations)
        onStatus?.({ type: 'thinking', message: '正在收集工程上下文...' });
        try {
            const context = await this.gatherProjectContext();
            if (context) {
                this.buildSystemPrompt(); // Reset base prompt
                this.systemPrompt += context;
                console.log(`[AIChatEngine] Injected project context (${context.length} chars)`);
            }
        } catch (e: any) {
            console.log('[AIChatEngine] Failed to gather context:', e.message);
        }

        // AI conversation loop - handle tool_use / tool_result cycles
        let maxIterations = 50; // Safety limit
        let finalText = '';

        while (maxIterations > 0) {
            maxIterations--;

            onStatus?.({ type: 'thinking', message: 'AI 正在思考...' });

            let response: AIResponse;
            try {
                response = await this.callAnthropicAPI(session.messages, tools);
            } catch (error: any) {
                const errMsg = `AI 请求失败: ${error.message}`;
                onStatus?.({ type: 'error', message: errMsg });
                return errMsg;
            }

            // Process the response content
            const assistantContent = response.content;
            session.messages.push({ role: 'assistant', content: assistantContent });

            // Extract text from the response
            const textBlocks = assistantContent.filter(b => b.type === 'text');
            const toolUseBlocks = assistantContent.filter(b => b.type === 'tool_use');

            // Emit text blocks
            for (const block of textBlocks) {
                if (block.text) {
                    finalText += block.text + '\n';
                    onStatus?.({ type: 'text', message: block.text });
                }
            }

            // If no tool calls, we're done
            if (toolUseBlocks.length === 0 || response.stop_reason === 'end_turn') {
                if (toolUseBlocks.length === 0) {
                    onStatus?.({ type: 'done', message: '完成' });
                    break;
                }
            }

            // Execute tool calls
            if (toolUseBlocks.length > 0) {
                const toolResults: ContentBlock[] = [];

                for (const toolBlock of toolUseBlocks) {
                    const toolName = toolBlock.name!;
                    const toolInput = toolBlock.input || {};
                    const toolId = toolBlock.id!;

                    onStatus?.({
                        type: 'tool_call',
                        message: `正在执行: ${toolName}`,
                        data: { name: toolName, input: toolInput },
                    });

                    let result: any;
                    let isError = false;

                    try {
                        if (this.mcpServer) {
                            result = await this.mcpServer.executeToolCall(toolName, toolInput);
                        } else {
                            result = { success: false, error: 'MCP Server not available' };
                            isError = true;
                        }
                    } catch (error: any) {
                        result = { success: false, error: error.message };
                        isError = true;
                    }

                    const resultStr = typeof result === 'string' ? result : JSON.stringify(result);

                    onStatus?.({
                        type: 'tool_result',
                        message: `${toolName}: ${isError ? '失败' : '成功'}`,
                        data: { name: toolName, result: resultStr, isError },
                    });

                    toolResults.push({
                        type: 'tool_result',
                        tool_use_id: toolId,
                        content: resultStr,
                        is_error: isError,
                    });
                }

                // Add tool results as a user message (Anthropic API format)
                session.messages.push({ role: 'user', content: toolResults });
            }

            // If the stop reason is end_turn after tool execution, continue the loop
            // to let AI process the tool results
            if (response.stop_reason === 'end_turn' && toolUseBlocks.length > 0) {
                continue;
            }

            // Check if we should stop
            if (response.stop_reason === 'end_turn' && toolUseBlocks.length === 0) {
                onStatus?.({ type: 'done', message: '完成' });
                break;
            }
        }

        if (maxIterations <= 0) {
            const msg = '⚠️ 达到最大执行轮次限制，已停止';
            onStatus?.({ type: 'error', message: msg });
            finalText += '\n' + msg;
        }

        return finalText.trim();
    }

    /**
     * Call the Anthropic Messages API via AI Gateway
     */
    /**
     * Log LLM request to file for debugging
     */
    private logLLMRequest(payload: any): void {
        try {
            const fs = require('fs');
            const path = require('path');
            const logDir = path.join(Editor.Project.path, 'temp', 'ai-logs');
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const logFile = path.join(logDir, `request-${timestamp}.json`);

            fs.writeFileSync(logFile, JSON.stringify(payload, null, 2), 'utf-8');
            console.log(`[AIChatEngine] LLM request logged to ${logFile}`);

            // Also write a latest.json for quick access
            const latestFile = path.join(logDir, 'latest-request.json');
            fs.writeFileSync(latestFile, JSON.stringify(payload, null, 2), 'utf-8');
        } catch (e: any) {
            console.warn('[AIChatEngine] Failed to log request:', e.message);
        }
    }

    /**
     * Log LLM response to file for debugging
     */
    private logLLMResponse(response: any): void {
        try {
            const fs = require('fs');
            const path = require('path');
            const logDir = path.join(Editor.Project.path, 'temp', 'ai-logs');
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const logFile = path.join(logDir, `response-${timestamp}.json`);

            fs.writeFileSync(logFile, JSON.stringify(response, null, 2), 'utf-8');
            console.log(`[AIChatEngine] LLM response logged to ${logFile}`);

            // Also write latest
            const latestFile = path.join(logDir, 'latest-response.json');
            fs.writeFileSync(latestFile, JSON.stringify(response, null, 2), 'utf-8');
        } catch (e: any) {
            console.warn('[AIChatEngine] Failed to log response:', e.message);
        }
    }

    private callAnthropicAPI(messages: ChatMessage[], tools: ToolDefinitionForAI[]): Promise<AIResponse> {
        return new Promise((resolve, reject) => {
            const requestPayload = {
                model: AI_CONFIG.model,
                max_tokens: AI_CONFIG.maxTokens,
                system: this.systemPrompt,
                messages: messages,
                tools: tools.length > 0 ? tools : undefined,
            };

            const body = JSON.stringify(requestPayload);

            // Log full request to file for debugging
            this.logLLMRequest(requestPayload);

            const urlObj = new URL(AI_CONFIG.baseUrl + '/v1/messages');

            const options: https.RequestOptions = {
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
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    try {
                        if (res.statusCode && res.statusCode >= 400) {
                            reject(new Error(`API Error ${res.statusCode}: ${data}`));
                            return;
                        }
                        const parsed = JSON.parse(data);
                        if (parsed.error) {
                            reject(new Error(`API Error: ${parsed.error.message || JSON.stringify(parsed.error)}`));
                            return;
                        }
                        // Log response for debugging
                        this.logLLMResponse(parsed);
                        resolve(parsed as AIResponse);
                    } catch (e: any) {
                        reject(new Error(`Failed to parse response: ${e.message}`));
                    }
                });
            });

            req.on('error', (err) => {
                reject(new Error(`Request failed: ${err.message}`));
            });

            // Set timeout
            req.setTimeout(120000, () => {
                req.destroy();
                reject(new Error('Request timeout (120s)'));
            });

            req.write(body);
            req.end();
        });
    }
}
