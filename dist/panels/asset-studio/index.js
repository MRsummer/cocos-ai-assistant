"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs_extra_1 = require("fs-extra");
const path_1 = require("path");
const vue_1 = require("vue");
const panelDataMap = new WeakMap();
module.exports = Editor.Panel.define({
    listeners: {
        show() { console.log('[Asset Studio Panel] shown'); },
        hide() { console.log('[Asset Studio Panel] hidden'); },
    },
    template: (0, fs_extra_1.readFileSync)((0, path_1.join)(__dirname, '../../../static/template/asset-studio/index.html'), 'utf-8'),
    style: (0, fs_extra_1.readFileSync)((0, path_1.join)(__dirname, '../../../static/style/asset-studio/index.css'), 'utf-8'),
    $: { app: '#app' },
    ready() {
        if (this.$.app) {
            const app = (0, vue_1.createApp)({});
            app.config.compilerOptions.isCustomElement = (tag) => tag.startsWith('ui-');
            app.component('AssetStudioApp', (0, vue_1.defineComponent)({
                setup() {
                    // ─── Mode ─────────────────────────────────
                    const mode = (0, vue_1.ref)('ai-image');
                    // ─── AI Image State ───────────────────────
                    const presets = (0, vue_1.ref)([]);
                    const selectedPreset = (0, vue_1.ref)('character-sprite');
                    const promptText = (0, vue_1.ref)('');
                    const isGenerating = (0, vue_1.ref)(false);
                    const generatedAssets = (0, vue_1.ref)([]);
                    const previewImage = (0, vue_1.ref)('');
                    const importToProject = (0, vue_1.ref)(true);
                    const generateImage = async () => {
                        if (!promptText.value.trim() || isGenerating.value)
                            return;
                        isGenerating.value = true;
                        previewImage.value = '';
                        try {
                            const result = await Editor.Message.request('cocos-ai-assistant', 'ai-generate-image', {
                                prompt: promptText.value,
                                presetId: selectedPreset.value,
                                importToProject: importToProject.value,
                            });
                            if (result && result.success && result.imageData) {
                                const mimeType = result.mimeType || 'image/jpeg';
                                previewImage.value = `data:${mimeType};base64,${result.imageData}`;
                                generatedAssets.value.unshift({
                                    name: `asset_${Date.now()}.jpg`,
                                    preview: previewImage.value,
                                    prompt: promptText.value,
                                    preset: selectedPreset.value,
                                    createdAt: new Date().toISOString(),
                                });
                            }
                            else {
                                console.error('[AssetStudio] Generation failed:', result === null || result === void 0 ? void 0 : result.error);
                            }
                        }
                        catch (error) {
                            console.error('[AssetStudio] Error:', error);
                        }
                        isGenerating.value = false;
                    };
                    const loadPresets = async () => {
                        try {
                            const result = await Editor.Message.request('cocos-ai-assistant', 'aiGetImagePresets');
                            if (result && result.success) {
                                presets.value = result.presets;
                            }
                        }
                        catch (e) {
                            presets.value = [
                                { id: 'character-sprite', name: '角色精灵', icon: '🧑' },
                                { id: 'scene-background', name: '场景背景', icon: '🏞️' },
                                { id: 'ui-icon', name: 'UI 图标', icon: '🎯' },
                                { id: 'texture', name: '纹理贴图', icon: '🧱' },
                                { id: 'custom', name: '自定义', icon: '✨' },
                            ];
                        }
                    };
                    const deleteAsset = (index) => {
                        generatedAssets.value.splice(index, 1);
                    };
                    // ─── Canvas Sprite State ──────────────────
                    const spriteStyle = (0, vue_1.ref)('');
                    const spriteEntries = (0, vue_1.ref)([
                        { name: '', description: '', width: 64, height: 64, actions: '' },
                    ]);
                    const isSpriteGenerating = (0, vue_1.ref)(false);
                    const spriteStatusMsg = (0, vue_1.ref)('');
                    const spriteImportToProject = (0, vue_1.ref)(true);
                    const generatedSprites = (0, vue_1.ref)([]);
                    const addSpriteEntry = () => {
                        spriteEntries.value.push({ name: '', description: '', width: 64, height: 64, actions: '' });
                    };
                    const removeSpriteEntry = (index) => {
                        spriteEntries.value.splice(index, 1);
                    };
                    // Listen for sprite status broadcasts
                    const spriteStatusHandler = (_event, status) => {
                        if (status && status.message) {
                            spriteStatusMsg.value = status.message;
                        }
                    };
                    const generateCanvasSprites = async () => {
                        if (!spriteStyle.value.trim() || spriteEntries.value.length === 0 || isSpriteGenerating.value)
                            return;
                        isSpriteGenerating.value = true;
                        spriteStatusMsg.value = '准备中...';
                        try {
                            const sprites = spriteEntries.value
                                .filter(s => s.name.trim() && s.description.trim())
                                .map(s => ({
                                name: s.name.trim(),
                                description: s.description.trim(),
                                width: s.width || 64,
                                height: s.height || 64,
                                actions: s.actions ? s.actions.split(/[,，、\s]+/).filter((a) => a) : [],
                            }));
                            if (sprites.length === 0) {
                                spriteStatusMsg.value = '请填写至少一个精灵的名称和描述';
                                isSpriteGenerating.value = false;
                                return;
                            }
                            const result = await Editor.Message.request('cocos-ai-assistant', 'ai-generate-canvas-sprite', {
                                style: spriteStyle.value,
                                sprites,
                                importToProject: spriteImportToProject.value,
                            });
                            if (result && result.success && result.sprites) {
                                // Add to generated sprites list
                                for (const sprite of result.sprites) {
                                    generatedSprites.value.unshift(sprite);
                                }
                                spriteStatusMsg.value = `✅ 成功生成 ${result.sprites.length} 个精灵`;
                            }
                            else {
                                spriteStatusMsg.value = `❌ ${(result === null || result === void 0 ? void 0 : result.error) || '生成失败'}`;
                            }
                        }
                        catch (error) {
                            console.error('[AssetStudio] Canvas sprite error:', error);
                            spriteStatusMsg.value = `❌ ${error.message}`;
                        }
                        isSpriteGenerating.value = false;
                    };
                    (0, vue_1.onMounted)(() => {
                        loadPresets();
                        // Register broadcast listener for sprite status
                        Editor.Message.addBroadcastListener('cocos-ai-assistant:sprite-status', spriteStatusHandler);
                    });
                    (0, vue_1.onBeforeUnmount)(() => {
                        Editor.Message.removeBroadcastListener('cocos-ai-assistant:sprite-status', spriteStatusHandler);
                    });
                    return {
                        mode,
                        // AI Image
                        presets, selectedPreset, promptText,
                        isGenerating, generatedAssets, previewImage,
                        importToProject,
                        generateImage, deleteAsset,
                        // Canvas Sprite
                        spriteStyle, spriteEntries,
                        isSpriteGenerating, spriteStatusMsg, spriteImportToProject,
                        generatedSprites,
                        addSpriteEntry, removeSpriteEntry, generateCanvasSprites,
                    };
                },
                template: (0, fs_extra_1.readFileSync)((0, path_1.join)(__dirname, '../../../static/template/vue/asset-studio-app.html'), 'utf-8'),
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
