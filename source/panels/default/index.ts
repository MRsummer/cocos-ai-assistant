import { readFileSync } from 'fs-extra';
import { join } from 'path';
import { createApp, App, defineComponent, ref, computed, onMounted, nextTick } from 'vue';

const panelDataMap = new WeakMap<any, App>();

module.exports = Editor.Panel.define({
    listeners: {
        show() { console.log('[AI Chat Panel] shown'); },
        hide() { console.log('[AI Chat Panel] hidden'); },
    },
    template: readFileSync(join(__dirname, '../../../static/template/default/index.html'), 'utf-8'),
    style: readFileSync(join(__dirname, '../../../static/style/default/index.css'), 'utf-8'),
    $: { app: '#app' },
    ready() {
        if (this.$.app) {
            const app = createApp({});
            app.config.compilerOptions.isCustomElement = (tag) => tag.startsWith('ui-');

            app.component('AiChatApp', defineComponent({
                setup() {
                    const messages = ref<{ role: string; content: string; type?: string }[]>([]);
                    const inputText = ref('');
                    const isLoading = ref(false);
                    const statusText = ref('');
                    const serverRunning = ref(false);

                    const quickPrompts = [
                        { icon: '🎮', label: '创建角色', prompt: '帮我在场景中创建一个2D玩家角色节点，添加Sprite和RigidBody2D组件' },
                        { icon: '🏞️', label: '设计场景', prompt: '帮我搭建一个2D横版游戏场景，包含背景、地面和几个平台' },
                        { icon: '📝', label: '生成脚本', prompt: '帮我分析当前场景结构，然后创建一个玩家控制脚本' },
                        { icon: '🚀', label: '一键出游戏', prompt: '帮我从零创建一个完整的2D跑酷游戏，包含场景搭建、角色、障碍物和UI' },
                    ];

                    const sendMessage = async () => {
                        const text = inputText.value.trim();
                        if (!text || isLoading.value) return;

                        messages.value.push({ role: 'user', content: text });
                        inputText.value = '';
                        isLoading.value = true;
                        statusText.value = '思考中...';

                        try {
                            const result = await Editor.Message.request('cocos-ai-assistant', 'ai-chat', text);
                            if (result && result.success) {
                                // Process status updates
                                if (result.updates) {
                                    for (const update of result.updates) {
                                        if (update.type === 'tool_call') {
                                            messages.value.push({
                                                role: 'system',
                                                content: `⚙️ ${update.message}`,
                                                type: 'tool',
                                            });
                                        }
                                    }
                                }
                                if (result.result) {
                                    messages.value.push({ role: 'assistant', content: result.result });
                                }
                            } else {
                                messages.value.push({
                                    role: 'assistant',
                                    content: `❌ ${result?.error || '请求失败'}`,
                                });
                            }
                        } catch (error: any) {
                            messages.value.push({
                                role: 'assistant',
                                content: `❌ 错误: ${error.message}`,
                            });
                        }

                        isLoading.value = false;
                        statusText.value = '';
                        await nextTick();
                        scrollToBottom();
                    };

                    const useQuickPrompt = (prompt: string) => {
                        inputText.value = prompt;
                        sendMessage();
                    };

                    const clearChat = async () => {
                        await Editor.Message.request('cocos-ai-assistant', 'ai-chat-clear');
                        messages.value = [];
                    };

                    const stopGeneration = async () => {
                        await Editor.Message.request('cocos-ai-assistant', 'ai-chat-stop');
                        isLoading.value = false;
                        statusText.value = '';
                    };

                    const toggleServer = async () => {
                        if (serverRunning.value) {
                            await Editor.Message.request('cocos-ai-assistant', 'stop-server');
                        } else {
                            await Editor.Message.request('cocos-ai-assistant', 'start-server');
                        }
                    };

                    const scrollToBottom = () => {
                        const container = document.querySelector('.chat-messages');
                        if (container) {
                            container.scrollTop = container.scrollHeight;
                        }
                    };

                    const handleKeyDown = (e: KeyboardEvent) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            sendMessage();
                        }
                    };

                    const formatMessage = (content: string) => {
                        // Basic markdown-like formatting
                        return content
                            .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
                            .replace(/`([^`]+)`/g, '<code>$1</code>')
                            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                            .replace(/\n/g, '<br>');
                    };

                    onMounted(async () => {
                        // Load chat history
                        try {
                            const historyResult = await Editor.Message.request('cocos-ai-assistant', 'ai-chat-history');
                            if (historyResult && historyResult.success && historyResult.history) {
                                messages.value = historyResult.history;
                            }
                        } catch (e) {
                            console.error('[AI Chat] Failed to load history:', e);
                        }

                        // Check server status
                        setInterval(async () => {
                            try {
                                const status = await Editor.Message.request('cocos-ai-assistant', 'get-server-status');
                                serverRunning.value = status?.running || false;
                            } catch (e) { /* ignore */ }
                        }, 3000);
                    });

                    return {
                        messages, inputText, isLoading, statusText,
                        serverRunning, quickPrompts,
                        sendMessage, useQuickPrompt, clearChat,
                        stopGeneration, toggleServer, handleKeyDown,
                        formatMessage,
                    };
                },
                template: readFileSync(join(__dirname, '../../../static/template/vue/ai-chat-app.html'), 'utf-8'),
            }));

            app.mount(this.$.app);
            panelDataMap.set(this, app);
        }
    },
    close() {
        const app = panelDataMap.get(this);
        if (app) app.unmount();
    },
});
