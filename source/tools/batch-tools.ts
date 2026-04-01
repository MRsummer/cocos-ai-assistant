import { ToolDefinition, ToolResponse, ToolExecutor } from '../types';

/**
 * Batch execution tool - execute multiple operations in one call.
 * Inspired by Coplay's batch_execute which is 10-100x faster than individual calls.
 */
export class BatchTools implements ToolExecutor {
    private mcpServer: any = null;

    setMCPServer(server: any) {
        this.mcpServer = server;
    }

    getTools(): ToolDefinition[] {
        return [
            {
                name: 'batch_execute',
                description: '批量执行多个操作，一次调用完成多步工作（比逐个调用快 10-100 倍）。适合同时创建多个节点、添加多个组件、设置多个属性等场景。每个操作按顺序执行，如果某个操作失败会继续执行后续操作。',
                inputSchema: {
                    type: 'object',
                    properties: {
                        operations: {
                            type: 'array',
                            description: '操作列表，按顺序执行。每个操作包含 tool（工具名）和 args（参数）',
                            items: {
                                type: 'object',
                                properties: {
                                    tool: {
                                        type: 'string',
                                        description: '工具名称，如 node_create_node, component_add_component, project_save_asset 等'
                                    },
                                    args: {
                                        type: 'object',
                                        description: '工具参数'
                                    },
                                    label: {
                                        type: 'string',
                                        description: '操作描述（可选，用于结果报告）'
                                    }
                                },
                                required: ['tool', 'args']
                            }
                        },
                        stopOnError: {
                            type: 'boolean',
                            description: '遇到错误时是否停止执行后续操作（默认 false，继续执行）',
                            default: false
                        }
                    },
                    required: ['operations']
                }
            }
        ];
    }

    async execute(toolName: string, args: any): Promise<ToolResponse> {
        switch (toolName) {
            case 'batch_execute':
                return await this.batchExecute(args);
            default:
                throw new Error(`Unknown tool: ${toolName}`);
        }
    }

    private async batchExecute(args: any): Promise<ToolResponse> {
        const operations = args.operations || [];
        const stopOnError = args.stopOnError || false;

        if (operations.length === 0) {
            return { success: false, error: '操作列表为空' };
        }

        if (!this.mcpServer) {
            return { success: false, error: 'MCP Server not available for batch execution' };
        }

        const results: {
            index: number;
            tool: string;
            label?: string;
            success: boolean;
            result?: any;
            error?: string;
        }[] = [];

        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < operations.length; i++) {
            const op = operations[i];
            const tool = op.tool;
            const opArgs = op.args || {};
            const label = op.label || tool;

            try {
                const result = await this.mcpServer.executeToolCall(tool, opArgs);
                const isSuccess = result && (result.success !== false);
                
                results.push({
                    index: i,
                    tool,
                    label,
                    success: isSuccess,
                    result: isSuccess ? (result.data || result.message || 'OK') : undefined,
                    error: !isSuccess ? (result.error || 'Unknown error') : undefined,
                });

                if (isSuccess) {
                    successCount++;
                } else {
                    errorCount++;
                    if (stopOnError) break;
                }
            } catch (error: any) {
                errorCount++;
                results.push({
                    index: i,
                    tool,
                    label,
                    success: false,
                    error: error.message,
                });

                if (stopOnError) break;
            }
        }

        return {
            success: errorCount === 0,
            data: {
                total: operations.length,
                executed: results.length,
                successCount,
                errorCount,
                results,
            },
            message: `批量执行完成: ${successCount} 成功, ${errorCount} 失败 (共 ${operations.length} 个操作)`,
        };
    }
}
