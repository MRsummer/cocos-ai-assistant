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
                    const serverRunning = ref(false);

                    // Progress tracking (replaces individual tool messages)
                    const progressPhase = ref('🧠 AI 正在思考...');
                    const progressDetail = ref('');
                    const completedSteps = ref(0);
                    const totalSteps = ref(0);

                    const progressPercent = computed(() => {
                        if (totalSteps.value <= 0) return 0;
                        return Math.min(100, Math.round((completedSteps.value / totalSteps.value) * 100));
                    });

                    // Filtered messages: only user + assistant text (no tool/system noise)
                    const displayMessages = computed(() => {
                        return messages.value.filter(m => m.role === 'user' || (m.role === 'assistant' && m.type !== 'tool'));
                    });

                    let lastProcessedIndex = 0;
                    let statusPollTimer: any = null;

                    const quickPrompts = [
                        { icon: '🐦', label: 'Flappy Bird', prompt: '帮我创建一个完整的 Flappy Bird 游戏' },
                        { icon: '🏃', label: '跑酷游戏', prompt: '帮我创建一个完整的无尽跑酷游戏' },
                        { icon: '💎', label: '消除游戏', prompt: '帮我创建一个完整的三消游戏' },
                        { icon: '🚀', label: '自定义游戏', prompt: '' },
                    ];

                    // ─── Poll for AI status updates (simplified) ───
                    const startStatusPolling = () => {
                        lastProcessedIndex = 0;
                        completedSteps.value = 0;
                        totalSteps.value = 0;
                        stopStatusPolling();

                        statusPollTimer = setInterval(async () => {
                            try {
                                const result = await Editor.Message.request('cocos-ai-assistant', 'ai-get-status');
                                if (!result || !result.history) return;

                                const history = result.history as any[];

                                // Count completed steps
                                for (let i = lastProcessedIndex; i < history.length; i++) {
                                    const status = history[i];
                                    if (status.type === 'tool_call') {
                                        totalSteps.value++;
                                    }
                                    if (status.type === 'tool_result') {
                                        completedSteps.value++;
                                    }
                                }
                                lastProcessedIndex = history.length;

                                // Update progress display from current status
                                if (result.current) {
                                    updateProgress(result.current);
                                }
                            } catch {
                                // Ignore polling errors
                            }
                        }, 500);
                    };

                    const stopStatusPolling = () => {
                        if (statusPollTimer) {
                            clearInterval(statusPollTimer);
                            statusPollTimer = null;
                        }
                    };

                    const updateProgress = (status: any) => {
                        switch (status.type) {
                            case 'thinking':
                                progressPhase.value = '🧠 AI 正在思考...';
                                progressDetail.value = '';
                                break;
                            case 'tool_call':
                                progressPhase.value = '⚙️ 正在构建游戏';
                                // Show friendly tool name
                                progressDetail.value = friendlyToolName(status.data?.name || status.message);
                                break;
                            case 'tool_result':
                                // Keep current phase, just update detail
                                const icon = status.data?.isError ? '❌' : '✅';
                                progressDetail.value = `${icon} ${friendlyToolName(status.data?.name || status.message)}`;
                                break;
                            case 'text':
                                progressPhase.value = '💬 AI 正在总结...';
                                progressDetail.value = '';
                                break;
                            case 'done':
                                progressPhase.value = '✅ 完成';
                                progressDetail.value = '';
                                break;
                            case 'error':
                                progressPhase.value = '❌ 出错了';
                                progressDetail.value = status.message;
                                break;
                        }
                    };

                    // Map internal tool names to friendly Chinese descriptions
                    const friendlyToolName = (name: string): string => {
                        if (!name) return '';
                        const map: Record<string, string> = {
                            'scene_get_current_scene': '获取场景信息',
                            'scene_get_scene_hierarchy': '读取场景层级',
                            'scene_get_scene_list': '获取场景列表',
                            'scene_open_scene': '打开场景',
                            'scene_save_scene': '保存场景',
                            'node_create_node': '创建节点',
                            'node_delete_node': '删除节点',
                            'node_set_property': '设置节点属性',
                            'node_get_property': '读取节点属性',
                            'node_move_node': '移动节点',
                            'component_add_component': '添加组件',
                            'component_set_component_property': '设置组件属性',
                            'component_get_component_property': '读取组件属性',
                            'component_remove_component': '移除组件',
                            'prefab_create_prefab': '创建预制体',
                            'prefab_instantiate_prefab': '实例化预制体',
                            'project_save_asset': '保存文件',
                            'project_read_asset': '读取文件',
                            'project_patch_asset': '修改代码',
                            'project_get_assets': '获取资源列表',
                            'project_create_directory': '创建目录',
                            'project_reimport_asset': '重新导入资源',
                        };
                        // Check exact match first
                        if (map[name]) return map[name];
                        // Try partial match
                        for (const [key, val] of Object.entries(map)) {
                            if (name.includes(key)) return val;
                        }
                        // Fallback: clean up the name
                        return name.replace(/_/g, ' ').replace(/^正在执行:\s*/, '');
                    };

                    const sendMessage = async () => {
                        const text = inputText.value.trim();
                        if (!text || isLoading.value) return;

                        messages.value.push({ role: 'user', content: text });
                        inputText.value = '';
                        isLoading.value = true;
                        progressPhase.value = '🧠 AI 正在思考...';
                        progressDetail.value = '';

                        await nextTick();
                        scrollToBottom();

                        startStatusPolling();

                        try {
                            const result = await Editor.Message.request('cocos-ai-assistant', 'ai-chat', text);
                            if (result && result.success) {
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

                        stopStatusPolling();

                        isLoading.value = false;
                        progressPhase.value = '';
                        progressDetail.value = '';
                        completedSteps.value = 0;
                        totalSteps.value = 0;
                        await nextTick();
                        scrollToBottom();
                    };

                    const useQuickPrompt = (prompt: string) => {
                        if (!prompt) {
                            // "自定义游戏" — just focus the input
                            const textarea = document.querySelector('.input-wrapper textarea') as HTMLTextAreaElement;
                            if (textarea) textarea.focus();
                            return;
                        }
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
                        progressPhase.value = '';
                        progressDetail.value = '';
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
                        try {
                            const historyResult = await Editor.Message.request('cocos-ai-assistant', 'ai-chat-history');
                            if (historyResult && historyResult.success && historyResult.history) {
                                messages.value = historyResult.history;
                            }
                        } catch (e) {
                            console.error('[AI Chat] Failed to load history:', e);
                        }

                        setInterval(async () => {
                            try {
                                const status = await Editor.Message.request('cocos-ai-assistant', 'get-server-status');
                                serverRunning.value = status?.running || false;
                            } catch { /* ignore */ }
                        }, 3000);
                    });

                    onBeforeUnmount(() => {
                        stopStatusPolling();
                    });

                    return {
                        messages, displayMessages, inputText, isLoading,
                        progressPhase, progressDetail, completedSteps, totalSteps, progressPercent,
                        serverRunning, quickPrompts,
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
