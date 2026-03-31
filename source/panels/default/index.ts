import { readFileSync } from 'fs-extra';
import { join } from 'path';
import { createApp, App, defineComponent, ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';

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
                    const toolSteps = ref<{ name: string; status: string; time: string }[]>([]);

                    const quickPrompts = [
                        { icon: '🎮', label: '创建角色', prompt: '帮我在场景中创建一个2D玩家角色节点，添加Sprite和RigidBody2D组件' },
                        { icon: '🏞️', label: '设计场景', prompt: '帮我搭建一个2D横版游戏场景，包含背景、地面和几个平台' },
                        { icon: '📝', label: '生成脚本', prompt: '帮我分析当前场景结构，然后创建一个玩家控制脚本' },
                        { icon: '🚀', label: '一键出游戏', prompt: '帮我从零创建一个完整的2D跑酷游戏，包含场景搭建、角色、障碍物和UI' },
                    ];

                    // ─── Listen for real-time AI status broadcasts ───
                    const aiStatusHandler = (_event: any, status: any) => {
                        if (!status) return;

                        switch (status.type) {
                            case 'thinking':
                                statusText.value = '🧠 AI 正在思考...';
                                break;
                            case 'tool_call':
                                statusText.value = `⚙️ ${status.message}`;
                                // Add to tool steps log
                                toolSteps.value.push({
                                    name: status.data?.name || status.message,
                                    status: '执行中...',
                                    time: new Date().toLocaleTimeString(),
                                });
                                // Also add to chat as a real-time system message
                                messages.value.push({
                                    role: 'system',
                                    content: `⚙️ ${status.message}`,
                                    type: 'tool',
                                });
                                nextTick(() => scrollToBottom());
                                break;
                            case 'tool_result':
                                statusText.value = `✅ ${status.message}`;
                                // Update the last tool step
                                if (toolSteps.value.length > 0) {
                                    const last = toolSteps.value[toolSteps.value.length - 1];
                                    last.status = status.data?.isError ? '❌ 失败' : '✅ 完成';
                                }
                                // Add result to chat
                                const icon = status.data?.isError ? '❌' : '✅';
                                messages.value.push({
                                    role: 'system',
                                    content: `${icon} ${status.message}`,
                                    type: 'tool',
                                });
                                nextTick(() => scrollToBottom());
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
                        if (!text || isLoading.value) return;

                        messages.value.push({ role: 'user', content: text });
                        inputText.value = '';
                        isLoading.value = true;
                        statusText.value = '🧠 AI 正在思考...';
                        toolSteps.value = [];

                        await nextTick();
                        scrollToBottom();

                        try {
                            const result = await Editor.Message.request('cocos-ai-assistant', 'ai-chat', text);
                            if (result && result.success) {
                                // The real-time broadcast already added tool steps to messages
                                // Just add the final AI response text
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
                        toolSteps.value = [];
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
                        return content
                            .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
                            .replace(/`([^`]+)`/g, '<code>$1</code>')
                            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                            .replace(/\n/g, '<br>');
                    };

                    onMounted(async () => {
                        // Register broadcast listener for real-time AI status
                        (Editor.Message as any).addBroadcastListener('cocos-ai-assistant:ai-status', aiStatusHandler);

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

                    onBeforeUnmount(() => {
                        (Editor.Message as any).removeBroadcastListener('cocos-ai-assistant:ai-status', aiStatusHandler);
                    });

                    return {
                        messages, inputText, isLoading, statusText,
                        serverRunning, quickPrompts, toolSteps,
                        sendMessage, useQuickPrompt, clearChat,
                        stopGeneration, handleKeyDown,
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
