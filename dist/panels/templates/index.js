"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs_extra_1 = require("fs-extra");
const path_1 = require("path");
const vue_1 = require("vue");
const panelDataMap = new WeakMap();
module.exports = Editor.Panel.define({
    listeners: {
        show() { console.log('[Templates Panel] shown'); },
        hide() { console.log('[Templates Panel] hidden'); },
    },
    template: (0, fs_extra_1.readFileSync)((0, path_1.join)(__dirname, '../../../static/template/templates/index.html'), 'utf-8'),
    style: (0, fs_extra_1.readFileSync)((0, path_1.join)(__dirname, '../../../static/style/templates/index.css'), 'utf-8'),
    $: { app: '#app' },
    ready() {
        if (this.$.app) {
            const app = (0, vue_1.createApp)({});
            app.config.compilerOptions.isCustomElement = (tag) => tag.startsWith('ui-');
            app.component('TemplatesApp', (0, vue_1.defineComponent)({
                setup() {
                    const templates = (0, vue_1.ref)([]);
                    const categories = (0, vue_1.ref)([]);
                    const selectedCategory = (0, vue_1.ref)('all');
                    const selectedTemplate = (0, vue_1.ref)(null);
                    const gameName = (0, vue_1.ref)('');
                    const isCreating = (0, vue_1.ref)(false);
                    const createResult = (0, vue_1.ref)('');
                    const filteredTemplates = (0, vue_1.computed)(() => {
                        if (selectedCategory.value === 'all')
                            return templates.value;
                        return templates.value.filter((t) => t.category === selectedCategory.value);
                    });
                    const loadTemplates = async () => {
                        try {
                            const result = await Editor.Message.request('cocos-ai-assistant', 'get-game-templates');
                            if (result && result.success) {
                                templates.value = result.templates;
                                categories.value = [{ id: 'all', name: '全部' }, ...result.categories];
                            }
                        }
                        catch (e) {
                            console.error('[Templates] Failed to load:', e);
                        }
                    };
                    const selectTemplate = (template) => {
                        selectedTemplate.value = template;
                        gameName.value = template.name;
                    };
                    const createGame = async () => {
                        if (!selectedTemplate.value || isCreating.value)
                            return;
                        isCreating.value = true;
                        createResult.value = '正在创建游戏...';
                        try {
                            const result = await Editor.Message.request('cocos-ai-assistant', 'create-game-from-template', selectedTemplate.value.id, gameName.value);
                            if (result && result.success) {
                                createResult.value = `✅ ${result.message}`;
                            }
                            else {
                                createResult.value = `❌ ${(result === null || result === void 0 ? void 0 : result.error) || '创建失败'}`;
                            }
                        }
                        catch (error) {
                            createResult.value = `❌ 错误: ${error.message}`;
                        }
                        isCreating.value = false;
                    };
                    const closeDetail = () => {
                        selectedTemplate.value = null;
                        createResult.value = '';
                    };
                    (0, vue_1.onMounted)(() => {
                        loadTemplates();
                    });
                    return {
                        templates, categories, selectedCategory,
                        filteredTemplates, selectedTemplate,
                        gameName, isCreating, createResult,
                        selectTemplate, createGame, closeDetail,
                    };
                },
                template: (0, fs_extra_1.readFileSync)((0, path_1.join)(__dirname, '../../../static/template/vue/templates-app.html'), 'utf-8'),
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
