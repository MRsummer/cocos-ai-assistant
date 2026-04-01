"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs_extra_1 = require("fs-extra");
const path_1 = require("path");
const vue_1 = require("vue");
const panelDataMap = new WeakMap();
module.exports = Editor.Panel.define({
    listeners: {
        show() { console.log('[AI Chat Panel] shown'); },
        hide() { console.log('[AI Chat Panel] hidden'); },
    },
    template: (0, fs_extra_1.readFileSync)((0, path_1.join)(__dirname, '../../../static/template/default/index.html'), 'utf-8'),
    style: (0, fs_extra_1.readFileSync)((0, path_1.join)(__dirname, '../../../static/style/default/index.css'), 'utf-8'),
    $: { app: '#app' },
    ready() {
        if (this.$.app) {
            const app = (0, vue_1.createApp)({});
            app.config.compilerOptions.isCustomElement = (tag) => tag.startsWith('ui-');
            app.component('AiChatApp', (0, vue_1.defineComponent)({
                setup() {
                    const messages = (0, vue_1.ref)([]);
                    const inputText = (0, vue_1.ref)('');
                    const isLoading = (0, vue_1.ref)(false);
                    const statusText = (0, vue_1.ref)('');
                    const serverRunning = (0, vue_1.ref)(false);
                    const toolSteps = (0, vue_1.ref)([]);
                    // Track which status entries we've already processed
                    let lastProcessedIndex = 0;
                    let statusPollTimer = null;
                    const quickPrompts = [
                        { icon: '🎮', label: '创建角色', prompt: '帮我在场景中创建一个2D玩家角色节点，添加Sprite和RigidBody2D组件' },
                        { icon: '🏞️', label: '设计场景', prompt: '帮我搭建一个2D横版游戏场景，包含背景、地面和几个平台' },
                        { icon: '📝', label: '生成脚本', prompt: '帮我分析当前场景结构，然后创建一个玩家控制脚本' },
                        { icon: '🚀', label: '一键出游戏', prompt: '帮我从零创建一个完整的2D跑酷游戏，包含场景搭建、角色、障碍物和UI' },
                    ];
                    // ─── Poll for AI status updates ───
                    const startStatusPolling = () => {
                        lastProcessedIndex = 0;
                        stopStatusPolling();
                        statusPollTimer = setInterval(async () => {
                            try {
                                const result = await Editor.Message.request('cocos-ai-assistant', 'ai-get-status');
                                if (!result || !result.history)
                                    return;
                                const history = result.history;
                                // Process new entries since last poll
                                for (let i = lastProcessedIndex; i < history.length; i++) {
                                    const status = history[i];
                                    processStatusUpdate(status);
                                }
                                lastProcessedIndex = history.length;
                                // Update current status text
                                if (result.current) {
                                    updateStatusText(result.current);
                                }
                            }
                            catch (_a) {
                                // Ignore polling errors
                            }
                        }, 500); // Poll every 500ms
                    };
                    const stopStatusPolling = () => {
                        if (statusPollTimer) {
                            clearInterval(statusPollTimer);
                            statusPollTimer = null;
                        }
                    };
                    const processStatusUpdate = (status) => {
                        var _a, _b, _c;
                        switch (status.type) {
                            case 'tool_call':
                                toolSteps.value.push({
                                    name: ((_a = status.data) === null || _a === void 0 ? void 0 : _a.name) || status.message,
                                    status: '⏳ 执行中',
                                    time: new Date(status.timestamp).toLocaleTimeString(),
                                });
                                messages.value.push({
                                    role: 'system',
                                    content: `⚙️ ${status.message}`,
                                    type: 'tool',
                                });
                                (0, vue_1.nextTick)(() => scrollToBottom());
                                break;
                            case 'tool_result':
                                // Update the last matching tool step
                                if (toolSteps.value.length > 0) {
                                    const last = toolSteps.value[toolSteps.value.length - 1];
                                    last.status = ((_b = status.data) === null || _b === void 0 ? void 0 : _b.isError) ? '❌ 失败' : '✅ 完成';
                                }
                                const icon = ((_c = status.data) === null || _c === void 0 ? void 0 : _c.isError) ? '❌' : '✅';
                                messages.value.push({
                                    role: 'system',
                                    content: `${icon} ${status.message}`,
                                    type: 'tool',
                                });
                                (0, vue_1.nextTick)(() => scrollToBottom());
                                break;
                        }
                    };
                    const updateStatusText = (status) => {
                        switch (status.type) {
                            case 'thinking':
                                statusText.value = '🧠 AI 正在思考...';
                                break;
                            case 'tool_call':
                                statusText.value = `⚙️ ${status.message}`;
                                break;
                            case 'tool_result':
                                statusText.value = `✅ ${status.message}`;
                                break;
                            case 'text':
                                statusText.value = '💬 AI 正在回复...';
                                break;
                            case 'done':
                                statusText.value = '✅ 完成';
                                break;
                            case 'error':
                                statusText.value = `❌ ${status.message}`;
                                break;
                        }
                    };
                    const sendMessage = async () => {
                        const text = inputText.value.trim();
                        if (!text || isLoading.value)
                            return;
                        messages.value.push({ role: 'user', content: text });
                        inputText.value = '';
                        isLoading.value = true;
                        statusText.value = '🧠 AI 正在思考...';
                        toolSteps.value = [];
                        await (0, vue_1.nextTick)();
                        scrollToBottom();
                        // Start polling for status updates
                        startStatusPolling();
                        try {
                            const result = await Editor.Message.request('cocos-ai-assistant', 'ai-chat', text);
                            if (result && result.success) {
                                if (result.result) {
                                    messages.value.push({ role: 'assistant', content: result.result });
                                }
                            }
                            else {
                                messages.value.push({
                                    role: 'assistant',
                                    content: `❌ ${(result === null || result === void 0 ? void 0 : result.error) || '请求失败'}`,
                                });
                            }
                        }
                        catch (error) {
                            messages.value.push({
                                role: 'assistant',
                                content: `❌ 错误: ${error.message}`,
                            });
                        }
                        // Stop polling
                        stopStatusPolling();
                        isLoading.value = false;
                        statusText.value = '';
                        toolSteps.value = [];
                        await (0, vue_1.nextTick)();
                        scrollToBottom();
                    };
                    const useQuickPrompt = (prompt) => {
                        inputText.value = prompt;
                        sendMessage();
                    };
                    const clearChat = async () => {
                        await Editor.Message.request('cocos-ai-assistant', 'ai-chat-clear');
                        messages.value = [];
                    };
                    const stopGeneration = async () => {
                        await Editor.Message.request('cocos-ai-assistant', 'ai-chat-stop');
                        stopStatusPolling();
                        isLoading.value = false;
                        statusText.value = '';
                    };
                    const scrollToBottom = () => {
                        const container = document.querySelector('.chat-messages');
                        if (container) {
                            container.scrollTop = container.scrollHeight;
                        }
                    };
                    const handleKeyDown = (e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            sendMessage();
                        }
                    };
                    const formatMessage = (content) => {
                        return content
                            .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
                            .replace(/`([^`]+)`/g, '<code>$1</code>')
                            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                            .replace(/\n/g, '<br>');
                    };
                    (0, vue_1.onMounted)(async () => {
                        // Load chat history
                        try {
                            const historyResult = await Editor.Message.request('cocos-ai-assistant', 'ai-chat-history');
                            if (historyResult && historyResult.success && historyResult.history) {
                                messages.value = historyResult.history;
                            }
                        }
                        catch (e) {
                            console.error('[AI Chat] Failed to load history:', e);
                        }
                        // Check server status periodically
                        setInterval(async () => {
                            try {
                                const status = await Editor.Message.request('cocos-ai-assistant', 'get-server-status');
                                serverRunning.value = (status === null || status === void 0 ? void 0 : status.running) || false;
                            }
                            catch ( /* ignore */_a) { /* ignore */ }
                        }, 3000);
                    });
                    (0, vue_1.onBeforeUnmount)(() => {
                        stopStatusPolling();
                    });
                    return {
                        messages, inputText, isLoading, statusText,
                        serverRunning, quickPrompts, toolSteps,
                        sendMessage, useQuickPrompt, clearChat,
                        stopGeneration, handleKeyDown,
                        formatMessage,
                    };
                },
                template: (0, fs_extra_1.readFileSync)((0, path_1.join)(__dirname, '../../../static/template/vue/ai-chat-app.html'), 'utf-8'),
            }));
            app.mount(this.$.app);
            panelDataMap.set(this, app);
        }
    },
    close() {
        const app = panelDataMap.get(this);
        if (app)
            app.unmount();
    },
});
