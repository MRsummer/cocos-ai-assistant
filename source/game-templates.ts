/**
 * Game Templates System
 * Provides built-in game templates for quick game creation
 */

export interface GameTemplate {
    id: string;
    name: string;
    nameEn: string;
    description: string;
    icon: string;
    category: string;
    tags: string[];
    sceneStructure: SceneNode[];
    scripts: ScriptTemplate[];
    requiredAssets: AssetRequirement[];
}

export interface SceneNode {
    name: string;
    type: '2DNode' | '3DNode' | 'Node';
    components?: ComponentTemplate[];
    children?: SceneNode[];
    position?: { x: number; y: number; z: number };
    scale?: { x: number; y: number; z: number };
}

export interface ComponentTemplate {
    type: string;
    properties?: Record<string, any>;
}

export interface ScriptTemplate {
    name: string;
    path: string;
    content: string;
    description: string;
}

export interface AssetRequirement {
    name: string;
    type: 'sprite' | 'spriteFrame' | 'audio' | 'prefab' | 'font';
    description: string;
    optional: boolean;
}

export interface CreateGameResult {
    success: boolean;
    message: string;
    createdFiles?: string[];
    error?: string;
}

/**
 * Built-in game templates
 */
export const GAME_TEMPLATES: GameTemplate[] = [
    {
        id: 'platformer-2d',
        name: '2D 横版跑酷',
        nameEn: '2D Platformer',
        description: '经典横版平台跳跃游戏，包含角色控制、平台生成、收集道具等基础功能',
        icon: '🏃',
        category: 'action',
        tags: ['2D', '横版', '跑酷', '平台跳跃'],
        sceneStructure: [
            {
                name: 'Canvas',
                type: '2DNode',
                components: [{ type: 'cc.Canvas' }, { type: 'cc.Widget' }],
                children: [
                    {
                        name: 'Background',
                        type: '2DNode',
                        components: [{ type: 'cc.Sprite' }],
                    },
                    {
                        name: 'GameLayer',
                        type: '2DNode',
                        children: [
                            {
                                name: 'Player',
                                type: '2DNode',
                                components: [
                                    { type: 'cc.Sprite' },
                                    { type: 'cc.RigidBody2D', properties: { type: 1 } },
                                    { type: 'cc.BoxCollider2D' },
                                ],
                                position: { x: -200, y: 0, z: 0 },
                            },
                            {
                                name: 'Ground',
                                type: '2DNode',
                                components: [
                                    { type: 'cc.Sprite' },
                                    { type: 'cc.RigidBody2D', properties: { type: 0 } },
                                    { type: 'cc.BoxCollider2D' },
                                ],
                                position: { x: 0, y: -300, z: 0 },
                                scale: { x: 10, y: 1, z: 1 },
                            },
                            {
                                name: 'Platforms',
                                type: 'Node',
                            },
                        ],
                    },
                    {
                        name: 'UILayer',
                        type: '2DNode',
                        components: [{ type: 'cc.Widget' }],
                        children: [
                            {
                                name: 'ScoreLabel',
                                type: '2DNode',
                                components: [
                                    { type: 'cc.Label', properties: { string: 'Score: 0', fontSize: 36 } },
                                ],
                                position: { x: -300, y: 300, z: 0 },
                            },
                        ],
                    },
                ],
            },
        ],
        scripts: [
            {
                name: 'PlayerController',
                path: 'db://assets/scripts/PlayerController.ts',
                description: '玩家角色控制脚本',
                content: `import { _decorator, Component, RigidBody2D, Vec2, input, Input, KeyCode } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('PlayerController')
export class PlayerController extends Component {
    @property({ type: Number })
    moveSpeed: number = 300;

    @property({ type: Number })
    jumpForce: number = 600;

    private rigidBody: RigidBody2D | null = null;
    private moveDir: number = 0;
    private canJump: boolean = true;

    start() {
        this.rigidBody = this.getComponent(RigidBody2D);
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        input.on(Input.EventType.KEY_UP, this.onKeyUp, this);
    }

    onKeyDown(event: any) {
        switch (event.keyCode) {
            case KeyCode.ARROW_LEFT:
            case KeyCode.KEY_A:
                this.moveDir = -1;
                break;
            case KeyCode.ARROW_RIGHT:
            case KeyCode.KEY_D:
                this.moveDir = 1;
                break;
            case KeyCode.SPACE:
            case KeyCode.ARROW_UP:
            case KeyCode.KEY_W:
                this.jump();
                break;
        }
    }

    onKeyUp(event: any) {
        switch (event.keyCode) {
            case KeyCode.ARROW_LEFT:
            case KeyCode.KEY_A:
                if (this.moveDir === -1) this.moveDir = 0;
                break;
            case KeyCode.ARROW_RIGHT:
            case KeyCode.KEY_D:
                if (this.moveDir === 1) this.moveDir = 0;
                break;
        }
    }

    jump() {
        if (this.canJump && this.rigidBody) {
            this.rigidBody.linearVelocity = new Vec2(this.rigidBody.linearVelocity.x, this.jumpForce / 60);
            this.canJump = false;
            this.scheduleOnce(() => { this.canJump = true; }, 0.5);
        }
    }

    update(dt: number) {
        if (this.rigidBody) {
            const vel = this.rigidBody.linearVelocity;
            this.rigidBody.linearVelocity = new Vec2(this.moveDir * this.moveSpeed / 60, vel.y);
        }
    }

    onDestroy() {
        input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        input.off(Input.EventType.KEY_UP, this.onKeyUp, this);
    }
}`,
            },
            {
                name: 'GameManager',
                path: 'db://assets/scripts/GameManager.ts',
                description: '游戏管理脚本（分数、状态等）',
                content: `import { _decorator, Component, Label, Node } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('GameManager')
export class GameManager extends Component {
    @property({ type: Label })
    scoreLabel: Label | null = null;

    private score: number = 0;

    start() {
        this.score = 0;
        this.updateScoreDisplay();
    }

    addScore(points: number) {
        this.score += points;
        this.updateScoreDisplay();
    }

    updateScoreDisplay() {
        if (this.scoreLabel) {
            this.scoreLabel.string = \`Score: \${this.score}\`;
        }
    }

    getScore(): number {
        return this.score;
    }
}`,
            },
        ],
        requiredAssets: [
            { name: 'player-sprite', type: 'spriteFrame', description: '玩家角色精灵图', optional: true },
            { name: 'ground-texture', type: 'spriteFrame', description: '地面纹理', optional: true },
            { name: 'background', type: 'spriteFrame', description: '场景背景图', optional: true },
            { name: 'jump-sound', type: 'audio', description: '跳跃音效', optional: true },
            { name: 'coin-sound', type: 'audio', description: '收集道具音效', optional: true },
        ],
    },
    {
        id: 'shooter-2d',
        name: '2D 射击游戏',
        nameEn: '2D Shooter',
        description: '俯视角射击游戏，包含玩家移动、射击、敌人生成和碰撞检测',
        icon: '🔫',
        category: 'action',
        tags: ['2D', '射击', '俯视角', 'STG'],
        sceneStructure: [
            {
                name: 'Canvas',
                type: '2DNode',
                components: [{ type: 'cc.Canvas' }, { type: 'cc.Widget' }],
                children: [
                    {
                        name: 'Background',
                        type: '2DNode',
                        components: [{ type: 'cc.Sprite' }],
                    },
                    {
                        name: 'GameLayer',
                        type: '2DNode',
                        children: [
                            {
                                name: 'Player',
                                type: '2DNode',
                                components: [{ type: 'cc.Sprite' }, { type: 'cc.BoxCollider2D' }],
                                position: { x: 0, y: -250, z: 0 },
                            },
                            { name: 'BulletPool', type: 'Node' },
                            { name: 'EnemyPool', type: 'Node' },
                        ],
                    },
                    {
                        name: 'UILayer',
                        type: '2DNode',
                        components: [{ type: 'cc.Widget' }],
                        children: [
                            {
                                name: 'ScoreLabel',
                                type: '2DNode',
                                components: [{ type: 'cc.Label', properties: { string: 'Score: 0', fontSize: 32 } }],
                                position: { x: -300, y: 400, z: 0 },
                            },
                            {
                                name: 'HPBar',
                                type: '2DNode',
                                components: [{ type: 'cc.ProgressBar' }],
                                position: { x: 0, y: 400, z: 0 },
                            },
                        ],
                    },
                ],
            },
        ],
        scripts: [
            {
                name: 'ShooterPlayer',
                path: 'db://assets/scripts/ShooterPlayer.ts',
                description: '射击游戏玩家控制',
                content: `import { _decorator, Component, Vec3, input, Input, KeyCode, Node, Prefab, instantiate } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('ShooterPlayer')
export class ShooterPlayer extends Component {
    @property({ type: Number })
    moveSpeed: number = 400;

    @property({ type: Number })
    fireRate: number = 0.2;

    @property({ type: Prefab })
    bulletPrefab: Prefab | null = null;

    @property({ type: Node })
    bulletPool: Node | null = null;

    private moveDir = new Vec3();
    private fireTimer: number = 0;
    private isFiring: boolean = false;

    start() {
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        input.on(Input.EventType.KEY_UP, this.onKeyUp, this);
    }

    onKeyDown(event: any) {
        switch (event.keyCode) {
            case KeyCode.ARROW_LEFT: case KeyCode.KEY_A: this.moveDir.x = -1; break;
            case KeyCode.ARROW_RIGHT: case KeyCode.KEY_D: this.moveDir.x = 1; break;
            case KeyCode.ARROW_UP: case KeyCode.KEY_W: this.moveDir.y = 1; break;
            case KeyCode.ARROW_DOWN: case KeyCode.KEY_S: this.moveDir.y = -1; break;
            case KeyCode.SPACE: this.isFiring = true; break;
        }
    }

    onKeyUp(event: any) {
        switch (event.keyCode) {
            case KeyCode.ARROW_LEFT: case KeyCode.KEY_A: if (this.moveDir.x < 0) this.moveDir.x = 0; break;
            case KeyCode.ARROW_RIGHT: case KeyCode.KEY_D: if (this.moveDir.x > 0) this.moveDir.x = 0; break;
            case KeyCode.ARROW_UP: case KeyCode.KEY_W: if (this.moveDir.y > 0) this.moveDir.y = 0; break;
            case KeyCode.ARROW_DOWN: case KeyCode.KEY_S: if (this.moveDir.y < 0) this.moveDir.y = 0; break;
            case KeyCode.SPACE: this.isFiring = false; break;
        }
    }

    update(dt: number) {
        const pos = this.node.position;
        const newX = pos.x + this.moveDir.x * this.moveSpeed * dt;
        const newY = pos.y + this.moveDir.y * this.moveSpeed * dt;
        this.node.setPosition(
            Math.max(-450, Math.min(450, newX)),
            Math.max(-450, Math.min(450, newY)),
            0
        );

        this.fireTimer += dt;
        if (this.isFiring && this.fireTimer >= this.fireRate) {
            this.fire();
            this.fireTimer = 0;
        }
    }

    fire() {
        if (!this.bulletPrefab || !this.bulletPool) return;
        const bullet = instantiate(this.bulletPrefab);
        bullet.setPosition(this.node.position.x, this.node.position.y + 30, 0);
        this.bulletPool.addChild(bullet);
    }

    onDestroy() {
        input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        input.off(Input.EventType.KEY_UP, this.onKeyUp, this);
    }
}`,
            },
        ],
        requiredAssets: [
            { name: 'player-ship', type: 'spriteFrame', description: '玩家飞机/角色精灵', optional: true },
            { name: 'bullet', type: 'spriteFrame', description: '子弹精灵', optional: true },
            { name: 'enemy', type: 'spriteFrame', description: '敌人精灵', optional: true },
            { name: 'shoot-sound', type: 'audio', description: '射击音效', optional: true },
        ],
    },
    {
        id: 'match3',
        name: '消除游戏',
        nameEn: 'Match-3 Puzzle',
        description: '经典三消游戏，包含棋盘生成、匹配检测、消除动画和连锁反应',
        icon: '💎',
        category: 'puzzle',
        tags: ['2D', '消除', '三消', '休闲'],
        sceneStructure: [
            {
                name: 'Canvas',
                type: '2DNode',
                components: [{ type: 'cc.Canvas' }, { type: 'cc.Widget' }],
                children: [
                    { name: 'Background', type: '2DNode', components: [{ type: 'cc.Sprite' }] },
                    {
                        name: 'Board',
                        type: '2DNode',
                        position: { x: 0, y: -50, z: 0 },
                    },
                    {
                        name: 'UILayer',
                        type: '2DNode',
                        children: [
                            {
                                name: 'ScoreLabel',
                                type: '2DNode',
                                components: [{ type: 'cc.Label', properties: { string: '0', fontSize: 48 } }],
                                position: { x: 0, y: 380, z: 0 },
                            },
                            {
                                name: 'MovesLabel',
                                type: '2DNode',
                                components: [{ type: 'cc.Label', properties: { string: 'Moves: 30', fontSize: 28 } }],
                                position: { x: -250, y: 380, z: 0 },
                            },
                        ],
                    },
                ],
            },
        ],
        scripts: [
            {
                name: 'BoardManager',
                path: 'db://assets/scripts/BoardManager.ts',
                description: '棋盘管理脚本',
                content: `import { _decorator, Component, Node, Prefab, instantiate, Vec3, tween, Color } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('BoardManager')
export class BoardManager extends Component {
    @property({ type: Number }) rows: number = 8;
    @property({ type: Number }) cols: number = 8;
    @property({ type: Number }) cellSize: number = 70;
    @property({ type: [Prefab] }) gemPrefabs: Prefab[] = [];

    private board: (Node | null)[][] = [];

    start() {
        this.initBoard();
    }

    initBoard() {
        const offsetX = -(this.cols - 1) * this.cellSize / 2;
        const offsetY = -(this.rows - 1) * this.cellSize / 2;

        this.board = [];
        for (let row = 0; row < this.rows; row++) {
            this.board[row] = [];
            for (let col = 0; col < this.cols; col++) {
                const gemIndex = Math.floor(Math.random() * this.gemPrefabs.length);
                if (this.gemPrefabs.length > 0) {
                    const gem = instantiate(this.gemPrefabs[gemIndex]);
                    gem.setPosition(offsetX + col * this.cellSize, offsetY + row * this.cellSize, 0);
                    this.node.addChild(gem);
                    this.board[row][col] = gem;
                } else {
                    this.board[row][col] = null;
                }
            }
        }
    }
}`,
            },
        ],
        requiredAssets: [
            { name: 'gem-red', type: 'spriteFrame', description: '红色宝石', optional: true },
            { name: 'gem-blue', type: 'spriteFrame', description: '蓝色宝石', optional: true },
            { name: 'gem-green', type: 'spriteFrame', description: '绿色宝石', optional: true },
            { name: 'gem-yellow', type: 'spriteFrame', description: '黄色宝石', optional: true },
            { name: 'gem-purple', type: 'spriteFrame', description: '紫色宝石', optional: true },
            { name: 'match-sound', type: 'audio', description: '消除音效', optional: true },
        ],
    },
    {
        id: 'runner',
        name: '无尽跑酷',
        nameEn: 'Endless Runner',
        description: '自动奔跑、左右移动躲避障碍物、收集金币的跑酷游戏',
        icon: '🏃‍♂️',
        category: 'action',
        tags: ['2D', '跑酷', '无尽', '休闲'],
        sceneStructure: [
            {
                name: 'Canvas',
                type: '2DNode',
                components: [{ type: 'cc.Canvas' }, { type: 'cc.Widget' }],
                children: [
                    { name: 'Background', type: '2DNode', components: [{ type: 'cc.Sprite' }] },
                    {
                        name: 'GameLayer',
                        type: '2DNode',
                        children: [
                            {
                                name: 'Player',
                                type: '2DNode',
                                components: [{ type: 'cc.Sprite' }, { type: 'cc.BoxCollider2D' }],
                                position: { x: -200, y: -100, z: 0 },
                            },
                            { name: 'ObstaclePool', type: 'Node' },
                            { name: 'CoinPool', type: 'Node' },
                        ],
                    },
                    {
                        name: 'UILayer',
                        type: '2DNode',
                        children: [
                            {
                                name: 'DistanceLabel',
                                type: '2DNode',
                                components: [{ type: 'cc.Label', properties: { string: '0 m', fontSize: 32 } }],
                                position: { x: 0, y: 400, z: 0 },
                            },
                            {
                                name: 'CoinLabel',
                                type: '2DNode',
                                components: [{ type: 'cc.Label', properties: { string: '🪙 0', fontSize: 28 } }],
                                position: { x: -300, y: 400, z: 0 },
                            },
                        ],
                    },
                ],
            },
        ],
        scripts: [],
        requiredAssets: [
            { name: 'runner-sprite', type: 'spriteFrame', description: '跑酷角色', optional: true },
            { name: 'obstacle', type: 'spriteFrame', description: '障碍物精灵', optional: true },
            { name: 'coin', type: 'spriteFrame', description: '金币精灵', optional: true },
        ],
    },
    {
        id: 'tower-defense',
        name: '塔防游戏',
        nameEn: 'Tower Defense',
        description: '放置防御塔抵御敌人进攻的策略游戏',
        icon: '🏰',
        category: 'strategy',
        tags: ['2D', '塔防', '策略', 'TD'],
        sceneStructure: [
            {
                name: 'Canvas',
                type: '2DNode',
                components: [{ type: 'cc.Canvas' }, { type: 'cc.Widget' }],
                children: [
                    { name: 'MapLayer', type: '2DNode' },
                    { name: 'TowerLayer', type: '2DNode' },
                    { name: 'EnemyLayer', type: '2DNode' },
                    { name: 'BulletLayer', type: '2DNode' },
                    {
                        name: 'UILayer',
                        type: '2DNode',
                        children: [
                            {
                                name: 'GoldLabel',
                                type: '2DNode',
                                components: [{ type: 'cc.Label', properties: { string: '💰 100', fontSize: 28 } }],
                                position: { x: -300, y: 400, z: 0 },
                            },
                            {
                                name: 'WaveLabel',
                                type: '2DNode',
                                components: [{ type: 'cc.Label', properties: { string: 'Wave 1', fontSize: 28 } }],
                                position: { x: 0, y: 400, z: 0 },
                            },
                            {
                                name: 'LivesLabel',
                                type: '2DNode',
                                components: [{ type: 'cc.Label', properties: { string: '❤️ 20', fontSize: 28 } }],
                                position: { x: 300, y: 400, z: 0 },
                            },
                            { name: 'TowerShop', type: '2DNode', position: { x: 0, y: -380, z: 0 } },
                        ],
                    },
                ],
            },
        ],
        scripts: [],
        requiredAssets: [
            { name: 'tower-basic', type: 'spriteFrame', description: '基础塔精灵', optional: true },
            { name: 'enemy-basic', type: 'spriteFrame', description: '基础敌人精灵', optional: true },
            { name: 'map-tile', type: 'spriteFrame', description: '地图瓦片', optional: true },
        ],
    },
];

/**
 * Game Template Service
 */
export class GameTemplateService {
    /**
     * Get all available templates
     */
    public getTemplates(): GameTemplate[] {
        return GAME_TEMPLATES;
    }

    /**
     * Get template by ID
     */
    public getTemplate(id: string): GameTemplate | null {
        return GAME_TEMPLATES.find(t => t.id === id) || null;
    }

    /**
     * Get templates by category
     */
    public getTemplatesByCategory(category: string): GameTemplate[] {
        return GAME_TEMPLATES.filter(t => t.category === category);
    }

    /**
     * Get available categories
     */
    public getCategories(): { id: string; name: string }[] {
        return [
            { id: 'action', name: '动作类' },
            { id: 'puzzle', name: '解谜类' },
            { id: 'strategy', name: '策略类' },
        ];
    }
}
