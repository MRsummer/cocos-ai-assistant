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

                    // Plan steps tracking
                    interface PlanStep {
                        text: string;
                        status: 'pending' | 'running' | 'done' | 'error';
                    }
                    const planSteps = ref<PlanStep[]>([]);
                    const progressDetail = ref('');
                    const progressPhase = ref('');

                    // Only show user messages + assistant final messages (no intermediate tool noise)
                    const displayMessages = computed(() => {
                        return messages.value.filter(m =>
                            m.role === 'user' ||
                            (m.role === 'assistant' && m.type !== 'tool' && m.type !== 'intermediate')
                        );
                    });

                    let lastProcessedIndex = 0;
                    let statusPollTimer: any = null;
                    let currentStepIndex = -1;

                    const quickPrompts = [
                        { icon: '🐦', label: 'Flappy Bird', prompt: '帮我创建一个完整的 Flappy Bird 游戏' },
                        { icon: '🏃', label: '跑酷游戏', prompt: '帮我创建一个完整的无尽跑酷游戏' },
                        { icon: '💎', label: '消除游戏', prompt: '帮我创建一个完整的三消游戏' },
                        { icon: '🚀', label: '自定义游戏', prompt: '' },
                    ];

                    // ─── Parse plan steps from AI text ───
                    const parsePlanFromText = (text: string) => {
                        // Match patterns like "1. xxx" or "步骤1: xxx" or "第一步：xxx"
                        const lines = text.split('\n');
                        const steps: PlanStep[] = [];

                        for (const line of lines) {
                            const trimmed = line.trim();
                            // Match: "1. text", "1) text", "步骤1: text", "Step 1: text"
                            const match = trimmed.match(/^(?:(?:步骤|第|Step\s*)?(\d+)[.):：、]?\s*[:：]?\s*)(.+)/i)
                                || trimmed.match(/^[-*]\s+(.+)/);
                            if (match) {
                                const stepText = match[match.length - 1].replace(/\*\*/g, '').trim();
                                if (stepText.length > 2 && stepText.length < 100) {
                                    steps.push({ text: stepText, status: 'pending' });
                                }
                            }
                        }

                        // Only use as plan if we got 2+ steps
                        if (steps.length >= 2) {
                            planSteps.value = steps;
                            currentStepIndex = -1;
                        }
                    };

                    // ─── Poll for AI status updates ───
                    const startStatusPolling = () => {
                        lastProcessedIndex = 0;
                        currentStepIndex = -1;
                        planSteps.value = [];
                        progressDetail.value = '';
                        progressPhase.value = '🧠 AI 正在规划...';
                        stopStatusPolling();

                        statusPollTimer = setInterval(async () => {
                            try {
                                const result = await Editor.Message.request('cocos-ai-assistant', 'ai-get-status');
                                if (!result || !result.history) return;

                                const history = result.history as any[];

                                for (let i = lastProcessedIndex; i < history.length; i++) {
                                    const status = history[i];
                                    processStatus(status);
                                }
                                lastProcessedIndex = history.length;

                                if (result.current) {
                                    updateCurrentStatus(result.current);
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

                    const processStatus = (status: any) => {
                        if (status.type === 'text' && status.message) {
                            // Try to parse plan from first text output
                            if (planSteps.value.length === 0) {
                                parsePlanFromText(status.message);
                            }
                        }

                        if (status.type === 'tool_call') {
                            // Advance to next step if we have a plan
                            if (planSteps.value.length > 0) {
                                // Mark current step as done
                                if (currentStepIndex >= 0 && currentStepIndex < planSteps.value.length) {
                                    // Don't mark done until tool_result
                                }
                                // Find next pending step or advance current
                                if (currentStepIndex < 0 || (currentStepIndex < planSteps.value.length &&
                                    planSteps.value[currentStepIndex].status === 'done')) {
                                    currentStepIndex++;
                                    if (currentStepIndex < planSteps.value.length) {
                                        planSteps.value[currentStepIndex].status = 'running';
                                    }
                                } else if (currentStepIndex >= 0 && currentStepIndex < planSteps.value.length &&
                                    planSteps.value[currentStepIndex].status === 'pending') {
                                    planSteps.value[currentStepIndex].status = 'running';
                                }
                            }
                            progressPhase.value = '⚙️ 正在构建';
                        }

                        if (status.type === 'tool_result') {
                            // Mark current step as done on successful tool results
                            if (planSteps.value.length > 0 && currentStepIndex >= 0 && currentStepIndex < planSteps.value.length) {
                                planSteps.value[currentStepIndex].status = status.data?.isError ? 'error' : 'done';
                            }
                        }
                    };

                    const updateCurrentStatus = (status: any) => {
                        switch (status.type) {
                            case 'thinking':
                                progressPhase.value = planSteps.value.length > 0 ? '🧠 AI 正在思考下一步...' : '🧠 AI 正在规划...';
                                progressDetail.value = '';
                                break;
                            case 'tool_call':
                                progressPhase.value = '⚙️ 正在执行';
                                progressDetail.value = friendlyToolName(status.data?.name || '');
                                break;
                            case 'tool_result': {
                                const icon = status.data?.isError ? '❌' : '✅';
                                progressDetail.value = `${icon} ${friendlyToolName(status.data?.name || '')}`;
                                break;
                            }
                            case 'text':
                                progressPhase.value = '💬 AI 正在总结...';
                                progressDetail.value = '';
                                break;
                            case 'done':
                                progressPhase.value = '✅ 全部完成';
                                progressDetail.value = '';
                                // Mark all remaining steps as done
                                for (const step of planSteps.value) {
                                    if (step.status === 'pending' || step.status === 'running') {
                                        step.status = 'done';
                                    }
                                }
                                break;
                            case 'error':
                                progressPhase.value = '❌ 出错了';
                                progressDetail.value = status.message;
                                break;
                        }
                    };

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
                        if (map[name]) return map[name];
                        for (const [key, val] of Object.entries(map)) {
                            if (name.includes(key)) return val;
                        }
                        return name.replace(/_/g, ' ').replace(/^正在执行:\s*/, '');
                    };

                    const sendMessage = async () => {
                        const text = inputText.value.trim();
                        if (!text || isLoading.value) return;

                        messages.value.push({ role: 'user', content: text });
                        inputText.value = '';
                        isLoading.value = true;
                        planSteps.value = [];
                        progressPhase.value = '🧠 AI 正在规划...';
                        progressDetail.value = '';

                        await nextTick();
                        scrollToBottom();

                        startStatusPolling();

                        try {
                            const result = await Editor.Message.request('cocos-ai-assistant', 'ai-chat', text);
                            if (result && result.success) {
                                // Only add final summary if it's meaningful
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
                        await nextTick();
                        scrollToBottom();
                    };

                    const useQuickPrompt = (prompt: string) => {
                        if (!prompt) {
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
                        planSteps.value = [];
                    };

                    const stopGeneration = async () => {
                        await Editor.Message.request('cocos-ai-assistant', 'ai-chat-stop');
                        stopStatusPolling();
                        isLoading.value = false;
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
                        planSteps, progressPhase, progressDetail,
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
