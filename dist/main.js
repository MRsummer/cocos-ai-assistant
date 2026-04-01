"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.methods = void 0;
exports.load = load;
exports.unload = unload;
const mcp_server_1 = require("./mcp-server");
const ai_chat_1 = require("./ai-chat");
const ai_image_1 = require("./ai-image");
const canvas_sprite_generator_1 = require("./canvas-sprite-generator");
const game_templates_1 = require("./game-templates");
const settings_1 = require("./settings");
const tool_manager_1 = require("./tools/tool-manager");
let mcpServer = null;
let toolManager;
let aiChat;
let aiImage;
let canvasSprites;
let gameTemplates;
// Shared AI status for panel polling
let currentAiStatus = null;
let aiStatusHistory = [];
/**
 * Extension main process methods
 */
exports.methods = {
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
        const settings = mcpServer ? mcpServer.getSettings() : (0, settings_1.readSettings)();
        return Object.assign(Object.assign({}, status), { settings });
    },
    updateSettings(settings) {
        (0, settings_1.saveSettings)(settings);
        if (mcpServer) {
            mcpServer.stop();
            mcpServer = new mcp_server_1.MCPServer(settings);
            aiChat.setMCPServer(mcpServer);
            mcpServer.start();
        }
    },
    getToolsList() {
        return mcpServer ? mcpServer.getAvailableTools() : [];
    },
    async getServerSettings() {
        return mcpServer ? mcpServer.getSettings() : (0, settings_1.readSettings)();
    },
    // ─── Tool Manager ─────────────────────────────────────
    async getToolManagerState() {
        return toolManager.getToolManagerState();
    },
    async getEnabledTools() {
        return toolManager.getEnabledTools();
    },
    // ─── AI Chat ──────────────────────────────────────────
    async aiChat(message) {
        try {
            // Reset status tracking
            aiStatusHistory = [];
            currentAiStatus = null;
            const updates = [];
            const result = await aiChat.chat(message, (status) => {
                const entry = Object.assign(Object.assign({}, status), { timestamp: Date.now() });
                updates.push(entry);
                currentAiStatus = entry;
                aiStatusHistory.push(entry);
                // Also try broadcast (may or may not reach panel)
                try {
                    Editor.Message.broadcast('cocos-ai-assistant:ai-status', status);
                }
                catch (_a) { }
            });
            // Mark as done
            currentAiStatus = { type: 'done', message: '完成', timestamp: Date.now() };
            return { success: true, result, updates };
        }
        catch (error) {
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
    async aiGenerateImage(request) {
        try {
            const result = await aiImage.generateImage(request);
            return result;
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    },
    aiGetImagePresets() {
        return { success: true, presets: aiImage.getPresets() };
    },
    aiListGeneratedAssets() {
        return { success: true, assets: aiImage.listGeneratedAssets() };
    },
    aiDeleteGeneratedAsset(fileName) {
        return { success: aiImage.deleteGeneratedAsset(fileName) };
    },
    // ─── Canvas Sprite Generation ─────────────────────────
    async aiGenerateCanvasSprite(request) {
        try {
            const result = await canvasSprites.generate(request, (status) => {
                Editor.Message.broadcast('cocos-ai-assistant:sprite-status', status);
            });
            return result;
        }
        catch (error) {
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
    async createGameFromTemplate(templateId, gameName) {
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
            const updates = [];
            const result = await aiChat.chat(prompt, (status) => {
                updates.push(status);
                Editor.Message.broadcast('cocos-ai-assistant:ai-status', status);
            });
            // Create scripts if the template has any
            const createdFiles = [];
            for (const script of template.scripts) {
                try {
                    const content = Buffer.from(script.content);
                    await Editor.Message.request('asset-db', 'create-asset', script.path, content);
                    createdFiles.push(script.path);
                }
                catch (scriptError) {
                    console.warn(`[Cocos AI] Failed to create script ${script.name}: ${scriptError.message}`);
                }
            }
            return {
                success: true,
                message: `游戏 "${gameName || template.name}" 创建完成`,
                createdFiles,
                aiResult: result,
            };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    },
};
/**
 * Extension load
 */
function load() {
    console.log('[Cocos AI Assistant] Extension loaded');
    // Initialize tool manager
    toolManager = new tool_manager_1.ToolManager();
    // Initialize MCP server
    const settings = (0, settings_1.readSettings)();
    mcpServer = new mcp_server_1.MCPServer(settings);
    const enabledTools = toolManager.getEnabledTools();
    mcpServer.updateEnabledTools(enabledTools);
    // Initialize AI services
    aiChat = new ai_chat_1.AIChatEngine();
    aiChat.setMCPServer(mcpServer);
    aiImage = new ai_image_1.AIImageService();
    canvasSprites = new canvas_sprite_generator_1.CanvasSpriteGenerator();
    gameTemplates = new game_templates_1.GameTemplateService();
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
function unload() {
    if (mcpServer) {
        mcpServer.stop();
        mcpServer = null;
    }
    console.log('[Cocos AI Assistant] Extension unloaded');
}
