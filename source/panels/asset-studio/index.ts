import { readFileSync } from 'fs-extra';
import { join } from 'path';
import { createApp, App, defineComponent, ref, onMounted } from 'vue';

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
                            // Use default presets
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

                    onMounted(() => {
                        loadPresets();
                    });

                    return {
                        presets, selectedPreset, promptText,
                        isGenerating, generatedAssets, previewImage,
                        importToProject,
                        generateImage, deleteAsset,
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
