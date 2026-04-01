import { ToolDefinition, ToolResponse, ToolExecutor } from '../types';

/**
 * Canvas Sprite Generation Tools
 * Provides a tool for the AI chat agent to generate game sprites
 * using Canvas 2D draw functions rendered via Electron.
 */
export class CanvasSpriteTools implements ToolExecutor {
    getTools(): ToolDefinition[] {
        return [
            {
                name: 'generate_sprite_canvas',
                description: '批量生成游戏精灵图。使用 Canvas 2D 渲染，一次调用生成所有需要的精灵。⚠️ 必须把所有精灵放在一次调用中（sprites 数组），严禁多次调用此工具逐个生成。支持角色、敌人、道具、UI元素、背景等各类精灵。',
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

    async execute(toolName: string, args: any): Promise<ToolResponse> {
        switch (toolName) {
            case 'generate_sprite_canvas':
                return await this.generateSpriteCanvas(args);
            default:
                throw new Error(`Unknown tool: ${toolName}`);
        }
    }

    private async generateSpriteCanvas(args: any): Promise<ToolResponse> {
        try {
            // Call the main process to do the generation
            const result = await Editor.Message.request(
                'cocos-ai-assistant',
                'ai-generate-canvas-sprite',
                {
                    style: args.style,
                    sprites: args.sprites || [],
                    importToProject: args.importToProject !== false,
                    importPath: args.importPath || 'db://assets/ai-sprites',
                }
            );

            if (result && result.success) {
                // Build summary for AI
                const summary = (result.sprites || []).map((s: any) => {
                    const importedPaths = s.images
                        .filter((img: any) => img.importedPath)
                        .map((img: any) => img.importedPath);
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
                        totalSprites: result.sprites?.length || 0,
                        totalImages: result.totalImages || 0,
                        sprites: summary,
                    },
                    message: `成功生成 ${result.sprites?.length || 0} 个精灵，共 ${result.totalImages || 0} 张图片`,
                };
            } else {
                return {
                    success: false,
                    error: result?.error || '精灵生成失败',
                };
            }
        } catch (error: any) {
            return {
                success: false,
                error: `Canvas 精灵生成失败: ${error.message}`,
            };
        }
    }
}
