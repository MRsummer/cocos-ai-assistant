import { MCPServer } from './mcp-server';
import { AIChatEngine } from './ai-chat';
import { AIImageService, ImageGenRequest } from './ai-image';
import { GameTemplateService } from './game-templates';
import { readSettings, saveSettings } from './settings';
import { MCPServerSettings } from './types';
import { ToolManager } from './tools/tool-manager';

let mcpServer: MCPServer | null = null;
let toolManager: ToolManager;
let aiChat: AIChatEngine;
let aiImage: AIImageService;
let gameTemplates: GameTemplateService;

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
            // Collect status updates to return
            const updates: any[] = [];
            const result = await aiChat.chat(message, (status) => {
                updates.push(status);
                // Also broadcast to panel for real-time updates
                Editor.Message.broadcast('cocos-ai-assistant:ai-status', status);
            });
            return { success: true, result, updates };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
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
            // Use AI Chat to execute the template creation
            const prompt = `请按照以下模板创建游戏项目 "${gameName || template.name}":

模板: ${template.name}
描述: ${template.description}

场景结构:
${JSON.stringify(template.sceneStructure, null, 2)}

请执行以下步骤:
1. 创建场景节点结构
2. 为节点添加指定的组件
3. 设置节点位置和缩放
4. 完成后报告创建结果

注意：先用 scene_get_current_scene 获取当前场景信息，然后逐步创建节点。`;

            const updates: any[] = [];
            const result = await aiChat.chat(prompt, (status) => {
                updates.push(status);
                Editor.Message.broadcast('cocos-ai-assistant:ai-status', status);
            });

            // Create scripts if the template has any
            const createdFiles: string[] = [];
            for (const script of template.scripts) {
                try {
                    const content = Buffer.from(script.content);
                    await Editor.Message.request('asset-db', 'create-asset', script.path, content);
                    createdFiles.push(script.path);
                } catch (scriptError: any) {
                    console.warn(`[Cocos AI] Failed to create script ${script.name}: ${scriptError.message}`);
                }
            }

            return {
                success: true,
                message: `游戏 "${gameName || template.name}" 创建完成`,
                createdFiles,
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
