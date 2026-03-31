import { readFileSync } from 'fs-extra';
import { join } from 'path';
import { createApp, App, defineComponent, ref, reactive, onMounted, onBeforeUnmount } from 'vue';

const panelDataMap = new WeakMap<any, App>();

module.exports = Editor.Panel.define({
    listeners: {
        show() { console.log('[Asset Studio Panel] shown'); },
        hide() { console.log('[Asset Studio Panel] hidden'); },
    },
    template: readFileSync(join(__dirname, '../../../static/template/asset-studio/index.html'), 'utf-8'),
    style: readFileSync(join(__dirname, '../../../static/style/asset-studio/index.css'), 'utf-8'),
    $: { app: '#app' },
    ready() {
        if (this.$.app) {
            const app = createApp({});
            app.config.compilerOptions.isCustomElement = (tag) => tag.startsWith('ui-');

            app.component('AssetStudioApp', defineComponent({
                setup() {
                    // ─── Mode ─────────────────────────────────
                    const mode = ref('ai-image');

                    // ─── AI Image State ───────────────────────
                    const presets = ref<any[]>([]);
                    const selectedPreset = ref('character-sprite');
                    const promptText = ref('');
                    const isGenerating = ref(false);
                    const generatedAssets = ref<any[]>([]);
                    const previewImage = ref('');
                    const importToProject = ref(true);

                    const generateImage = async () => {
                        if (!promptText.value.trim() || isGenerating.value) return;
                        isGenerating.value = true;
                        previewImage.value = '';

                        try {
                            const result = await Editor.Message.request(
                                'cocos-ai-assistant', 'ai-generate-image',
                                {
                                    prompt: promptText.value,
                                    presetId: selectedPreset.value,
                                    importToProject: importToProject.value,
                                }
                            );

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
                            } else {
                                console.error('[AssetStudio] Generation failed:', result?.error);
                            }
                        } catch (error: any) {
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
                        } catch (e) {
                            presets.value = [
                                { id: 'character-sprite', name: '角色精灵', icon: '🧑' },
                                { id: 'scene-background', name: '场景背景', icon: '🏞️' },
                                { id: 'ui-icon', name: 'UI 图标', icon: '🎯' },
                                { id: 'texture', name: '纹理贴图', icon: '🧱' },
                                { id: 'custom', name: '自定义', icon: '✨' },
                            ];
                        }
                    };

                    const deleteAsset = (index: number) => {
                        generatedAssets.value.splice(index, 1);
                    };

                    // ─── Canvas Sprite State ──────────────────
                    const spriteStyle = ref('');
                    const spriteEntries = ref<any[]>([
                        { name: '', description: '', width: 64, height: 64, actions: '' },
                    ]);
                    const isSpriteGenerating = ref(false);
                    const spriteStatusMsg = ref('');
                    const spriteImportToProject = ref(true);
                    const generatedSprites = ref<any[]>([]);

                    const addSpriteEntry = () => {
                        spriteEntries.value.push({ name: '', description: '', width: 64, height: 64, actions: '' });
                    };

                    const removeSpriteEntry = (index: number) => {
                        spriteEntries.value.splice(index, 1);
                    };

                    // Listen for sprite status broadcasts
                    const spriteStatusHandler = (_event: any, status: any) => {
                        if (status && status.message) {
                            spriteStatusMsg.value = status.message;
                        }
                    };

                    const generateCanvasSprites = async () => {
                        if (!spriteStyle.value.trim() || spriteEntries.value.length === 0 || isSpriteGenerating.value) return;
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
                                    actions: s.actions ? s.actions.split(/[,，、\s]+/).filter((a: string) => a) : [],
                                }));

                            if (sprites.length === 0) {
                                spriteStatusMsg.value = '请填写至少一个精灵的名称和描述';
                                isSpriteGenerating.value = false;
                                return;
                            }

                            const result = await Editor.Message.request(
                                'cocos-ai-assistant', 'ai-generate-canvas-sprite',
                                {
                                    style: spriteStyle.value,
                                    sprites,
                                    importToProject: spriteImportToProject.value,
                                }
                            );

                            if (result && result.success && result.sprites) {
                                // Add to generated sprites list
                                for (const sprite of result.sprites) {
                                    generatedSprites.value.unshift(sprite);
                                }
                                spriteStatusMsg.value = `✅ 成功生成 ${result.sprites.length} 个精灵`;
                            } else {
                                spriteStatusMsg.value = `❌ ${result?.error || '生成失败'}`;
                            }
                        } catch (error: any) {
                            console.error('[AssetStudio] Canvas sprite error:', error);
                            spriteStatusMsg.value = `❌ ${error.message}`;
                        }

                        isSpriteGenerating.value = false;
                    };

                    onMounted(() => {
                        loadPresets();
                        // Register broadcast listener for sprite status
                        (Editor.Message as any).addBroadcastListener('cocos-ai-assistant:sprite-status', spriteStatusHandler);
                    });

                    onBeforeUnmount(() => {
                        (Editor.Message as any).removeBroadcastListener('cocos-ai-assistant:sprite-status', spriteStatusHandler);
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
                template: readFileSync(join(__dirname, '../../../static/template/vue/asset-studio-app.html'), 'utf-8'),
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
