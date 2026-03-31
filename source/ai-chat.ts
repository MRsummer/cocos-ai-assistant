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
        this.systemPrompt = `你是 Cocos AI Assistant 的 AI 助手，一个强大的 Cocos Creator 游戏开发 AI 伙伴。

## 你的能力
你可以通过工具直接操控 Cocos Creator 编辑器，包括：
- 创建和管理场景、节点、组件
- 创建和实例化预制体
- 管理项目资源
- 调整场景视图
- 执行调试和验证操作

## 工作方式
1. 用户用自然语言描述需求
2. 你分析需求，制定执行计划
3. 你调用相应的工具一步步执行
4. 你向用户报告执行结果

## 重要规则
- 下方"当前工程上下文"已包含项目目录结构、场景列表和当前场景的节点层级，直接参考即可，不需要再调用工具获取
- 创建节点时，从上下文中查找父节点的 UUID
- 用户提到"那个按钮"、"这个节点"等指代时，从当前场景层级中推断
- 每步操作后检查结果，确认成功再继续
- 如果操作失败，分析原因并尝试修复
- 使用中文回复用户

## 回复风格
- 简洁、专业
- 执行多步操作时，用简短的步骤说明让用户了解进度
- 完成后给出总结`;
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

        // Gather project context on first message of session (or refresh periodically)
        if (session.messages.length <= 1) {
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
        }

        // AI conversation loop - handle tool_use / tool_result cycles
        let maxIterations = 20; // Safety limit
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
    private callAnthropicAPI(messages: ChatMessage[], tools: ToolDefinitionForAI[]): Promise<AIResponse> {
        return new Promise((resolve, reject) => {
            const body = JSON.stringify({
                model: AI_CONFIG.model,
                max_tokens: AI_CONFIG.maxTokens,
                system: this.systemPrompt,
                messages: messages,
                tools: tools.length > 0 ? tools : undefined,
            });

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
