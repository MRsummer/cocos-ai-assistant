"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CanvasSpriteTools = void 0;
/**
 * Canvas Sprite Generation Tools
 * Provides a tool for the AI chat agent to generate game sprites
 * using Canvas 2D draw functions rendered via Electron.
 */
class CanvasSpriteTools {
    getTools() {
        return [
            {
                name: 'generate_sprite_canvas',
                description: 'Generate game sprite images using Canvas 2D rendering. An internal AI agent generates Canvas draw functions, then renders them to PNG. Use this when the user needs game sprites (characters, items, enemies, UI elements, etc). Supports multiple sprites with animation frames.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        style: {
                            type: 'string',
                            description: 'Game art style description, e.g. "像素风RPG, 16色调色板, 复古风格" or "Q版卡通, 明亮色彩, 圆润造型"'
                        },
                        sprites: {
                            type: 'array',
                            description: 'Array of sprites to generate',
                            items: {
                                type: 'object',
                                properties: {
                                    name: {
                                        type: 'string',
                                        description: 'Sprite name in English lowercase with hyphens, e.g. "player", "enemy-goblin"'
                                    },
                                    description: {
                                        type: 'string',
                                        description: 'Visual description of the sprite'
                                    },
                                    width: {
                                        type: 'number',
                                        description: 'Sprite width in pixels (default: 64)',
                                        default: 64
                                    },
                                    height: {
                                        type: 'number',
                                        description: 'Sprite height in pixels (default: 64)',
                                        default: 64
                                    },
                                    actions: {
                                        type: 'array',
                                        items: { type: 'string' },
                                        description: 'Animation actions, e.g. ["idle", "walk", "attack"]'
                                    }
                                },
                                required: ['name', 'description']
                            }
                        },
                        importToProject: {
                            type: 'boolean',
                            description: 'Whether to auto-import generated PNGs to the Cocos project (default: true)',
                            default: true
                        },
                        importPath: {
                            type: 'string',
                            description: 'Custom import path prefix (default: db://assets/ai-sprites)',
                            default: 'db://assets/ai-sprites'
                        }
                    },
                    required: ['style', 'sprites']
                }
            }
        ];
    }
    async execute(toolName, args) {
        switch (toolName) {
            case 'generate_sprite_canvas':
                return await this.generateSpriteCanvas(args);
            default:
                throw new Error(`Unknown tool: ${toolName}`);
        }
    }
    async generateSpriteCanvas(args) {
        var _a, _b;
        try {
            // Call the main process to do the generation
            const result = await Editor.Message.request('cocos-ai-assistant', 'ai-generate-canvas-sprite', {
                style: args.style,
                sprites: args.sprites || [],
                importToProject: args.importToProject !== false,
                importPath: args.importPath || 'db://assets/ai-sprites',
            });
            if (result && result.success) {
                // Build summary for AI
                const summary = (result.sprites || []).map((s) => {
                    const importedPaths = s.images
                        .filter((img) => img.importedPath)
                        .map((img) => img.importedPath);
                    return {
                        name: s.name,
                        description: s.description,
                        size: `${s.width}x${s.height}`,
                        frames: s.frames,
                        importedPaths,
                    };
                });
                return {
                    success: true,
                    data: {
                        totalSprites: ((_a = result.sprites) === null || _a === void 0 ? void 0 : _a.length) || 0,
                        totalImages: result.totalImages || 0,
                        sprites: summary,
                    },
                    message: `成功生成 ${((_b = result.sprites) === null || _b === void 0 ? void 0 : _b.length) || 0} 个精灵，共 ${result.totalImages || 0} 张图片`,
                };
            }
            else {
                return {
                    success: false,
                    error: (result === null || result === void 0 ? void 0 : result.error) || '精灵生成失败',
                };
            }
        }
        catch (error) {
            return {
                success: false,
                error: `Canvas 精灵生成失败: ${error.message}`,
            };
        }
    }
}
exports.CanvasSpriteTools = CanvasSpriteTools;
