import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

/**
 * PPIO Seedream API configuration
 */
const PPIO_CONFIG = {
    baseUrl: 'https://api.ppio.com',
    apiKey: 'sk_SZev_z6Vutp2Olck4opcj4JK-_-ARwp4KO4IGdsT8dM',
    model: 'seedream-4.5',
};

/**
 * Image generation category presets
 */
export interface ImagePreset {
    id: string;
    name: string;
    nameEn: string;
    description: string;
    promptTemplate: string;
    negativePrompt: string;
    defaultWidth: number;
    defaultHeight: number;
}

export const IMAGE_PRESETS: ImagePreset[] = [
    {
        id: 'character-sprite',
        name: '角色精灵',
        nameEn: 'Character Sprite',
        description: '生成 2D 游戏角色精灵图',
        promptTemplate: '2D game character sprite, cartoon style, {description}, clean edges, white pure background, the character should NOT use pure white color',
        negativePrompt: 'blurry, low quality, text, watermark, realistic photo',
        defaultWidth: 2048,
        defaultHeight: 2048,
    },
    {
        id: 'scene-background',
        name: '场景背景',
        nameEn: 'Scene Background',
        description: '生成游戏场景背景图',
        promptTemplate: '2D game scene background, {description}, vibrant colors, detailed environment, suitable for side-scrolling game, high quality illustration',
        negativePrompt: 'blurry, low quality, text, watermark, character, UI elements',
        defaultWidth: 2048,
        defaultHeight: 2048,
    },
    {
        id: 'ui-icon',
        name: 'UI 图标',
        nameEn: 'UI Icon',
        description: '生成游戏 UI 图标',
        promptTemplate: 'Game UI icon, {description}, flat design, clean edges, white pure background, the icon should NOT use pure white color, suitable for mobile game',
        negativePrompt: 'blurry, low quality, text, watermark, realistic photo, complex background',
        defaultWidth: 2048,
        defaultHeight: 2048,
    },
    {
        id: 'texture',
        name: '纹理贴图',
        nameEn: 'Texture',
        description: '生成可平铺的纹理贴图',
        promptTemplate: 'Seamless tileable texture, {description}, suitable for 2D game, repeating pattern, high quality',
        negativePrompt: 'blurry, low quality, text, watermark, objects, characters',
        defaultWidth: 2048,
        defaultHeight: 2048,
    },
    {
        id: 'custom',
        name: '自定义',
        nameEn: 'Custom',
        description: '自定义生成任意游戏素材',
        promptTemplate: '{description}',
        negativePrompt: 'blurry, low quality, text, watermark',
        defaultWidth: 2048,
        defaultHeight: 2048,
    },
];

/**
 * Image generation request
 */
export interface ImageGenRequest {
    prompt: string;
    presetId?: string;
    width?: number;
    height?: number;
    fileName?: string;
    importToProject?: boolean;
    importPath?: string;
    referenceImage?: string; // base64 data URL for style reference
}

/**
 * Image generation result
 */
export interface ImageGenResult {
    success: boolean;
    imageData?: string; // base64 PNG data
    mimeType?: string;
    filePath?: string;
    importedPath?: string;
    error?: string;
    prompt?: string;
}

/**
 * AI Image Generation Service
 * Uses PPIO Seedream 4.5 to generate real game assets
 */
export class AIImageService {
    /**
     * Get all available presets
     */
    public getPresets(): ImagePreset[] {
        return IMAGE_PRESETS;
    }

    /**
     * Generate an image using PPIO Seedream 4.5
     */
    public async generateImage(request: ImageGenRequest): Promise<ImageGenResult> {
        try {
            const preset = request.presetId
                ? IMAGE_PRESETS.find(p => p.id === request.presetId)
                : IMAGE_PRESETS.find(p => p.id === 'custom');

            // Build the full prompt
            let fullPrompt = request.prompt;
            if (preset && preset.id !== 'custom') {
                fullPrompt = preset.promptTemplate.replace('{description}', request.prompt);
            }

            const negativePrompt = preset?.negativePrompt || 'blurry, low quality, text, watermark';

            console.log(`[AIImage] Generating with Seedream 4.5: "${fullPrompt.substring(0, 80)}..."`);

            // Call PPIO Seedream 4.5 API (synchronous)
            const imageResult = await this.callSeedreamAPI(fullPrompt, negativePrompt, request.referenceImage);

            if (!imageResult) {
                return { success: false, error: '图片生成失败，请重试' };
            }

            const result: ImageGenResult = {
                success: true,
                imageData: imageResult.base64,
                mimeType: 'image/jpeg',
                prompt: fullPrompt,
            };

            // Save to temp file
            const fileName = request.fileName || `asset_${Date.now()}.jpg`;
            const tempDir = path.join(require('os').tmpdir(), 'cocos-ai-assistant');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            const filePath = path.join(tempDir, fileName);
            fs.writeFileSync(filePath, Buffer.from(imageResult.base64, 'base64'));
            result.filePath = filePath;

            console.log(`[AIImage] Image saved to ${filePath} (${(imageResult.base64.length * 0.75 / 1024).toFixed(0)}KB)`);

            // Import to Cocos project if requested
            if (request.importToProject) {
                const importPath = request.importPath || `db://assets/ai-generated/${fileName}`;
                try {
                    await this.importToProject(filePath, importPath);
                    result.importedPath = importPath;
                    console.log(`[AIImage] Imported to project: ${importPath}`);
                } catch (importError: any) {
                    console.warn(`[AIImage] Failed to import to project: ${importError.message}`);
                }
            }

            return result;
        } catch (error: any) {
            console.error(`[AIImage] Generation error: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Call PPIO Seedream 4.5 synchronous API
     */
    private callSeedreamAPI(
        prompt: string,
        negativePrompt: string,
        referenceImage?: string
    ): Promise<{ base64: string } | null> {
        return new Promise((resolve, reject) => {
            const requestBody: any = {
                model: PPIO_CONFIG.model,
                prompt: prompt,
                negative_prompt: negativePrompt,
                width: 2048,
                height: 2048,
                num_inference_steps: 25,
                guidance_scale: 4.5,
                seed: -1,
            };

            // Add reference image for style-guided generation
            if (referenceImage) {
                requestBody.image = [referenceImage];
                requestBody.image_strength = 0.6;
            }

            const body = JSON.stringify(requestBody);
            const urlObj = new URL(PPIO_CONFIG.baseUrl + '/v3/seedream-4.5');

            const options: https.RequestOptions = {
                hostname: urlObj.hostname,
                port: 443,
                path: urlObj.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${PPIO_CONFIG.apiKey}`,
                    'Content-Length': Buffer.byteLength(body),
                },
            };

            console.log(`[AIImage] Calling Seedream API...`);

            const req = https.request(options, (res) => {
                const chunks: Buffer[] = [];
                res.on('data', (chunk: Buffer) => {
                    chunks.push(chunk);
                });
                res.on('end', () => {
                    try {
                        const data = Buffer.concat(chunks).toString('utf-8');

                        if (res.statusCode && res.statusCode >= 400) {
                            console.error(`[AIImage] API Error ${res.statusCode}: ${data.substring(0, 200)}`);
                            reject(new Error(`API Error ${res.statusCode}`));
                            return;
                        }

                        const parsed = JSON.parse(data);

                        // Seedream API returns: { data: [{ b64_image: "..." }] }
                        if (parsed.data && parsed.data.length > 0 && parsed.data[0].b64_image) {
                            resolve({ base64: parsed.data[0].b64_image });
                        } else if (parsed.data && parsed.data.length > 0 && parsed.data[0].url) {
                            // Some APIs return URL instead of base64, download it
                            this.downloadImageAsBase64(parsed.data[0].url).then(b64 => {
                                resolve({ base64: b64 });
                            }).catch(reject);
                        } else {
                            console.error(`[AIImage] Unexpected response format:`, JSON.stringify(parsed).substring(0, 200));
                            reject(new Error('Unexpected API response format'));
                        }
                    } catch (e: any) {
                        reject(new Error(`Failed to parse response: ${e.message}`));
                    }
                });
            });

            req.on('error', (err: Error) => {
                reject(new Error(`Request failed: ${err.message}`));
            });

            // Seedream can take ~30-60s for generation
            req.setTimeout(120000, () => {
                req.destroy();
                reject(new Error('Request timeout (120s)'));
            });

            req.write(body);
            req.end();
        });
    }

    /**
     * Download an image URL and return base64
     */
    private downloadImageAsBase64(url: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const transport = url.startsWith('https') ? https : http;
            transport.get(url, (res) => {
                const chunks: Buffer[] = [];
                res.on('data', (chunk: Buffer) => chunks.push(chunk));
                res.on('end', () => {
                    resolve(Buffer.concat(chunks).toString('base64'));
                });
                res.on('error', reject);
            }).on('error', reject);
        });
    }

    /**
     * Import a file to the Cocos project
     */
    private async importToProject(filePath: string, importPath: string): Promise<void> {
        const content = fs.readFileSync(filePath);
        await Editor.Message.request('asset-db', 'create-asset', importPath, content);
        console.log(`[AIImage] Asset imported to ${importPath}`);
    }

    /**
     * List all generated assets in the temp directory
     */
    public listGeneratedAssets(): { name: string; path: string; size: number; createdAt: string }[] {
        const tempDir = path.join(require('os').tmpdir(), 'cocos-ai-assistant');
        if (!fs.existsSync(tempDir)) return [];

        const files = fs.readdirSync(tempDir);
        return files
            .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f))
            .map(file => {
                const filePath = path.join(tempDir, file);
                const stats = fs.statSync(filePath);
                return {
                    name: file,
                    path: filePath,
                    size: stats.size,
                    createdAt: stats.birthtime.toISOString(),
                };
            });
    }

    /**
     * Delete a generated asset
     */
    public deleteGeneratedAsset(fileName: string): boolean {
        const tempDir = path.join(require('os').tmpdir(), 'cocos-ai-assistant');
        const filePath = path.join(tempDir, fileName);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            return true;
        }
        return false;
    }
}
