import { ToolDefinition, ToolResponse, ToolExecutor } from '../types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

function getSafeTempDir(): string {
    try {
        const tmp = os.tmpdir();
        if (tmp) return path.join(tmp, 'cocos-ai-assistant');
    } catch {}
    try {
        if (Editor && Editor.Project && Editor.Project.path) {
            return path.join(Editor.Project.path, 'temp', 'cocos-ai-assistant');
        }
    } catch {}
    return path.join(process.env.TMPDIR || process.env.TMP || process.env.TEMP || '/tmp', 'cocos-ai-assistant');
}

/**
 * Scene/Game view capture tools.
 * Allows AI to take screenshots of the current scene for visual self-checking.
 */
export class CaptureTools implements ToolExecutor {
    getTools(): ToolDefinition[] {
        return [
            {
                name: 'capture_scene_view',
                description: '截取当前场景编辑器视图的截图。用于：1) 完成游戏搭建后自检场景效果；2) 检查节点布局是否正确；3) 验证精灵图是否正确显示。返回截图的 base64 数据和本地文件路径。',
                inputSchema: {
                    type: 'object',
                    properties: {
                        width: {
                            type: 'number',
                            description: '截图宽度（默认 800）',
                            default: 800
                        },
                        height: {
                            type: 'number',
                            description: '截图高度（默认 600）',
                            default: 600
                        },
                        saveToProject: {
                            type: 'boolean',
                            description: '是否保存到项目 temp 目录（默认 true）',
                            default: true
                        }
                    }
                }
            }
        ];
    }

    async execute(toolName: string, args: any): Promise<ToolResponse> {
        switch (toolName) {
            case 'capture_scene_view':
                return await this.captureSceneView(args);
            default:
                throw new Error(`Unknown tool: ${toolName}`);
        }
    }

    private async captureSceneView(args: any): Promise<ToolResponse> {
        const width = args.width || 800;
        const height = args.height || 600;
        const saveToProject = args.saveToProject !== false;

        try {
            // Use Electron's BrowserWindow/webContents to capture the scene panel
            const { BrowserWindow } = require('electron');
            const windows = BrowserWindow.getAllWindows();

            if (!windows || windows.length === 0) {
                return { success: false, error: '没有找到编辑器窗口' };
            }

            // Capture the main editor window
            const mainWindow = windows[0];
            const image = await mainWindow.webContents.capturePage();

            if (!image || image.isEmpty()) {
                return { success: false, error: '截图为空，可能场景未加载' };
            }

            // Resize if needed
            let finalImage = image;
            const imageSize = image.getSize();
            if (imageSize.width > width || imageSize.height > height) {
                finalImage = image.resize({ width, height, quality: 'good' });
            }

            const pngBuffer = finalImage.toPNG();
            const base64 = pngBuffer.toString('base64');

            let filePath = '';
            if (saveToProject) {
                const captureDir = path.join(getSafeTempDir(), 'captures');
                if (!fs.existsSync(captureDir)) {
                    fs.mkdirSync(captureDir, { recursive: true });
                }
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                filePath = path.join(captureDir, `scene-${timestamp}.png`);
                fs.writeFileSync(filePath, pngBuffer);
            }

            return {
                success: true,
                data: {
                    width: finalImage.getSize().width,
                    height: finalImage.getSize().height,
                    base64DataUrl: `data:image/png;base64,${base64}`,
                    filePath: filePath || undefined,
                    message: `场景截图完成 (${finalImage.getSize().width}x${finalImage.getSize().height})`,
                },
                message: `✅ 场景截图已捕获 (${finalImage.getSize().width}x${finalImage.getSize().height})`,
            };
        } catch (error: any) {
            return {
                success: false,
                error: `截图失败: ${error.message}`,
            };
        }
    }
}
