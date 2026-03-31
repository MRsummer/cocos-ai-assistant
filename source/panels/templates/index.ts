import { readFileSync } from 'fs-extra';
import { join } from 'path';
import { createApp, App, defineComponent, ref, computed, onMounted } from 'vue';

const panelDataMap = new WeakMap<any, App>();

module.exports = Editor.Panel.define({
    listeners: {
        show() { console.log('[Templates Panel] shown'); },
        hide() { console.log('[Templates Panel] hidden'); },
    },
    template: readFileSync(join(__dirname, '../../../static/template/templates/index.html'), 'utf-8'),
    style: readFileSync(join(__dirname, '../../../static/style/templates/index.css'), 'utf-8'),
    $: { app: '#app' },
    ready() {
        if (this.$.app) {
            const app = createApp({});
            app.config.compilerOptions.isCustomElement = (tag) => tag.startsWith('ui-');

            app.component('TemplatesApp', defineComponent({
                setup() {
                    const templates = ref<any[]>([]);
                    const categories = ref<any[]>([]);
                    const selectedCategory = ref('all');
                    const selectedTemplate = ref<any>(null);
                    const gameName = ref('');
                    const isCreating = ref(false);
                    const createResult = ref('');

                    const filteredTemplates = computed(() => {
                        if (selectedCategory.value === 'all') return templates.value;
                        return templates.value.filter((t: any) => t.category === selectedCategory.value);
                    });

                    const loadTemplates = async () => {
                        try {
                            const result = await Editor.Message.request('cocos-ai-assistant', 'get-game-templates');
                            if (result && result.success) {
                                templates.value = result.templates;
                                categories.value = [{ id: 'all', name: '全部' }, ...result.categories];
                            }
                        } catch (e) {
                            console.error('[Templates] Failed to load:', e);
                        }
                    };

                    const selectTemplate = (template: any) => {
                        selectedTemplate.value = template;
                        gameName.value = template.name;
                    };

                    const createGame = async () => {
                        if (!selectedTemplate.value || isCreating.value) return;
                        isCreating.value = true;
                        createResult.value = '正在创建游戏...';

                        try {
                            const result = await Editor.Message.request(
                                'cocos-ai-assistant', 'create-game-from-template',
                                selectedTemplate.value.id,
                                gameName.value
                            );

                            if (result && result.success) {
                                createResult.value = `✅ ${result.message}`;
                            } else {
                                createResult.value = `❌ ${result?.error || '创建失败'}`;
                            }
                        } catch (error: any) {
                            createResult.value = `❌ 错误: ${error.message}`;
                        }

                        isCreating.value = false;
                    };

                    const closeDetail = () => {
                        selectedTemplate.value = null;
                        createResult.value = '';
                    };

                    onMounted(() => {
                        loadTemplates();
                    });

                    return {
                        templates, categories, selectedCategory,
                        filteredTemplates, selectedTemplate,
                        gameName, isCreating, createResult,
                        selectTemplate, createGame, closeDetail,
                    };
                },
                template: readFileSync(join(__dirname, '../../../static/template/vue/templates-app.html'), 'utf-8'),
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
