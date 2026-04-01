import { MCPServer } from './mcp-server';
import { AIChatEngine } from './ai-chat';
import { AIImageService, ImageGenRequest } from './ai-image';
import { CanvasSpriteGenerator, CanvasSpriteRequest } from './canvas-sprite-generator';
import { GameTemplateService } from './game-templates';
import { readSettings, saveSettings } from './settings';
import { MCPServerSettings } from './types';
import { ToolManager } from './tools/tool-manager';

let mcpServer: MCPServer | null = null;
let toolManager: ToolManager;
let aiChat: AIChatEngine;
let aiImage: AIImageService;
let canvasSprites: CanvasSpriteGenerator;
let gameTemplates: GameTemplateService;

// Shared AI status for panel polling
let currentAiStatus: { type: string; message: string; data?: any; timestamp: number } | null = null;
let aiStatusHistory: { type: string; message: string; data?: any; timestamp: number }[] = [];

/**
 * Extension main process methods
 */
export const methods: { [key: string]: (...any: any) => any } = {
    // ─── Panel Management ─────────────────────────────────
    openPanel() {
        Editor.Panel.open('cocos-ai-assistant');
    },

    openAssetStudio() {
        Editor.Panel.open('cocos-ai-assistant.asset-studio');
    },

    openTemplates() {
        Editor.Panel.open('cocos-ai-assistant.templates');
    },

    // ─── MCP Server ───────────────────────────────────────
    async startServer() {
        if (mcpServer) {
            const enabledTools = toolManager.getEnabledTools();
            mcpServer.updateEnabledTools(enabledTools);
            await mcpServer.start();
        }
    },

    async stopServer() {
        if (mcpServer) {
            mcpServer.stop();
        }
    },

    getServerStatus() {
        const status = mcpServer ? mcpServer.getStatus() : { running: false, port: 0, clients: 0 };
        const settings = mcpServer ? mcpServer.getSettings() : readSettings();
        return { ...status, settings };
    },

    updateSettings(settings: MCPServerSettings) {
        saveSettings(settings);
        if (mcpServer) {
            mcpServer.stop();
            mcpServer = new MCPServer(settings);
            aiChat.setMCPServer(mcpServer);
            mcpServer.start();
        }
    },

    getToolsList() {
        return mcpServer ? mcpServer.getAvailableTools() : [];
    },

    async getServerSettings() {
        return mcpServer ? mcpServer.getSettings() : readSettings();
    },

    // ─── Tool Manager ─────────────────────────────────────
    async getToolManagerState() {
        return toolManager.getToolManagerState();
    },

    async getEnabledTools() {
        return toolManager.getEnabledTools();
    },

    // ─── AI Chat ──────────────────────────────────────────
    async aiChat(message: string) {
        try {
            // Reset status tracking
            aiStatusHistory = [];
            currentAiStatus = null;

            const updates: any[] = [];
            const result = await aiChat.chat(message, (status) => {
                const entry = { ...status, timestamp: Date.now() };
                updates.push(entry);
                currentAiStatus = entry;
                aiStatusHistory.push(entry);

                // Also try broadcast (may or may not reach panel)
                try {
                    Editor.Message.broadcast('cocos-ai-assistant:ai-status', status);
                } catch {}
            });

            // Mark as done
            currentAiStatus = { type: 'done', message: '完成', timestamp: Date.now() };

            return { success: true, result, updates };
        } catch (error: any) {
            currentAiStatus = { type: 'error', message: error.message, timestamp: Date.now() };
            return { success: false, error: error.message };
        }
    },

    // Polling endpoint for panel to get real-time AI status
    aiGetStatus() {
        return {
            current: currentAiStatus,
            history: aiStatusHistory,
        };
    },

    aiChatStop() {
        aiChat.stop();
        return { success: true };
    },

    aiChatHistory() {
        return { success: true, history: aiChat.getHistory() };
    },

    aiChatClear() {
        aiChat.clearCurrentSession();
        return { success: true };
    },

    aiChatNewSession() {
        const sessionId = aiChat.createNewSession();
        return { success: true, sessionId };
    },

    aiChatGetSessions() {
        return { success: true, sessions: aiChat.getAllSessions() };
    },

    // ─── AI Image ─────────────────────────────────────────
    async aiGenerateImage(request: ImageGenRequest) {
        try {
            const result = await aiImage.generateImage(request);
            return result;
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    },

    aiGetImagePresets() {
        return { success: true, presets: aiImage.getPresets() };
    },

    aiListGeneratedAssets() {
        return { success: true, assets: aiImage.listGeneratedAssets() };
    },

    aiDeleteGeneratedAsset(fileName: string) {
        return { success: aiImage.deleteGeneratedAsset(fileName) };
    },

    // ─── Canvas Sprite Generation ─────────────────────────
    async aiGenerateCanvasSprite(request: CanvasSpriteRequest) {
        try {
            const result = await canvasSprites.generate(request, (status) => {
                Editor.Message.broadcast('cocos-ai-assistant:sprite-status', status);
            });
            return result;
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    },

    // ─── Game Templates ───────────────────────────────────
    getGameTemplates() {
        return {
            success: true,
            templates: gameTemplates.getTemplates(),
            categories: gameTemplates.getCategories(),
        };
    },

    async createGameFromTemplate(templateId: string, gameName?: string) {
        const template = gameTemplates.getTemplate(templateId);
        if (!template) {
            return { success: false, error: `Template ${templateId} not found` };
        }

        try {
            // For complete templates (with scripts), use AI to create the full game
            const scriptList = template.scripts.map(s => `  - ${s.name}: ${s.description}`).join('\n');
            const prompt = `请使用内置模板创建完整的 "${gameName || template.name}" 游戏。

模板信息:
- 游戏: ${template.name}
- 描述: ${template.description}
- 操作: ${template.instructions}
${template.physicsRequired ? '- ⚠️ 需要在项目设置中开启 2D 物理引擎' : ''}

需要创建的脚本:
${scriptList}

场景结构:
${JSON.stringify(template.sceneStructure, null, 2)}

以下是每个脚本的完整代码，请用 save_asset 工具依次创建它们，然后搭建场景节点结构：

${template.scripts.map(s => `### ${s.path}\n\`\`\`typescript\n${s.content}\n\`\`\``).join('\n\n')}

执行步骤:
1. 先创建 db://assets/scripts/ 目录
2. 保存所有脚本文件（用上面提供的完整代码）
3. 搭建场景节点结构（创建节点、添加组件、设置位置）
4. 为节点绑定脚本组件和属性引用
5. 保存场景
6. 输出操作指南`;

            aiStatusHistory = [];
            currentAiStatus = null;

            const result = await aiChat.chat(prompt, (status) => {
                const entry = { ...status, timestamp: Date.now() };
                currentAiStatus = entry;
                aiStatusHistory.push(entry);
                try { Editor.Message.broadcast('cocos-ai-assistant:ai-status', status); } catch {}
            });

            currentAiStatus = { type: 'done', message: '完成', timestamp: Date.now() };

            return {
                success: true,
                message: `游戏 "${gameName || template.name}" 创建完成`,
                aiResult: result,
            };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    },
};

/**
 * Extension load
 */
export function load() {
    console.log('[Cocos AI Assistant] Extension loaded');

    // Initialize tool manager
    toolManager = new ToolManager();

    // Initialize MCP server
    const settings = readSettings();
    mcpServer = new MCPServer(settings);

    const enabledTools = toolManager.getEnabledTools();
    mcpServer.updateEnabledTools(enabledTools);

    // Initialize AI services
    aiChat = new AIChatEngine();
    aiChat.setMCPServer(mcpServer);

    aiImage = new AIImageService();
    canvasSprites = new CanvasSpriteGenerator();
    gameTemplates = new GameTemplateService();

    // Auto-start MCP server if configured
    if (settings.autoStart) {
        mcpServer.start().catch(err => {
            console.error('[Cocos AI] Failed to auto-start MCP server:', err);
        });
    }
}

/**
 * Extension unload
 */
export function unload() {
    if (mcpServer) {
        mcpServer.stop();
        mcpServer = null;
    }
    console.log('[Cocos AI Assistant] Extension unloaded');
}
