"use strict";
/**
 * Cocos Creator 3.8 reference documentation for AI context injection.
 *
 * This is injected into the system prompt to help the AI write correct
 * Cocos Creator code. Only includes the most practical, commonly-needed
 * patterns — not the full docs.
 *
 * Strategy: structured as code examples the AI can directly copy/adapt,
 * organized by common game development tasks.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.COCOS_REFERENCE = void 0;
exports.COCOS_REFERENCE = `
## Cocos Creator 3.8 开发参考

### 1. 脚本基础结构

\`\`\`typescript
import { _decorator, Component, Node, Vec3 } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('MyComponent')
export class MyComponent extends Component {
    // 属性会显示在编辑器 Inspector 面板
    @property
    speed: number = 100;

    @property(Node)
    targetNode: Node | null = null;

    // 私有变量不显示在编辑器
    private _timer: number = 0;

    // 生命周期（按调用顺序）：
    // onLoad → onEnable → start → update → lateUpdate → onDisable → onDestroy

    onLoad() {
        // 节点首次激活时，最早的初始化（获取引用、注册事件）
    }

    start() {
        // 第一次 update 前调用（初始化依赖其他组件的数据）
    }

    update(deltaTime: number) {
        // 每帧调用，deltaTime 是上一帧到这一帧的秒数
    }

    onDestroy() {
        // 销毁时清理（取消事件监听等）
    }
}
\`\`\`

### 2. 节点操作

\`\`\`typescript
// 获取/设置位置（注意：即使是2D游戏，也用 Vec3）
this.node.getPosition(); // 返回 Vec3
this.node.setPosition(100, 200, 0);
this.node.setPosition(new Vec3(100, 200, 0));

// 移动节点（每帧位移）
const pos = this.node.position;
this.node.setPosition(pos.x + speed * deltaTime, pos.y, pos.z);

// 旋转
this.node.setRotationFromEuler(0, 0, 45); // 2D 只用 Z 轴

// 缩放
this.node.setScale(2, 2, 1);

// 查找子节点
const child = this.node.getChildByName('ChildName');
const allChildren = this.node.children; // Node[]

// 查找场景中任意节点
import { find } from 'cc';
const node = find('Canvas/Player'); // 按路径查找

// 创建新节点
const newNode = new Node('NewName');
newNode.parent = this.node; // 设置父节点

// 销毁节点
this.node.destroy();
// 或销毁指定节点
someNode.destroy();
\`\`\`

### 3. 组件操作

\`\`\`typescript
// 获取同节点上的组件
const sprite = this.getComponent(Sprite);
const label = this.node.getComponent(Label);

// 获取子节点组件
const childSprite = this.node.getChildByName('Body')?.getComponent(Sprite);

// 添加组件
const rb = this.node.addComponent(RigidBody2D);

// 获取所有同类型组件
const allSprites = this.getComponentsInChildren(Sprite);
\`\`\`

### 4. 输入事件

\`\`\`typescript
import { _decorator, Component, input, Input, EventTouch, EventKeyboard, KeyCode, EventMouse } from 'cc';

@ccclass('InputExample')
export class InputExample extends Component {
    onLoad() {
        // 触摸事件
        input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);

        // 键盘事件
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        input.on(Input.EventType.KEY_UP, this.onKeyUp, this);

        // 鼠标事件
        input.on(Input.EventType.MOUSE_UP, this.onMouseUp, this);
    }

    onDestroy() {
        // 必须取消监听！
        input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        input.off(Input.EventType.KEY_UP, this.onKeyUp, this);
        input.off(Input.EventType.MOUSE_UP, this.onMouseUp, this);
    }

    onTouchStart(event: EventTouch) {
        const location = event.getUILocation(); // UI 坐标
        console.log('Touch at:', location.x, location.y);
    }

    onTouchMove(event: EventTouch) {
        const delta = event.getUIDelta(); // 移动量
    }

    onTouchEnd(event: EventTouch) {}

    onKeyDown(event: EventKeyboard) {
        switch (event.keyCode) {
            case KeyCode.KEY_A:
            case KeyCode.ARROW_LEFT:
                // 左移
                break;
            case KeyCode.KEY_D:
            case KeyCode.ARROW_RIGHT:
                // 右移
                break;
            case KeyCode.SPACE:
                // 跳跃
                break;
        }
    }

    onKeyUp(event: EventKeyboard) {}

    onMouseUp(event: EventMouse) {
        if (event.getButton() === 0) { /* 左键 */ }
        if (event.getButton() === 2) { /* 右键 */ }
    }
}
\`\`\`

### 5. 2D 碰撞检测

\`\`\`typescript
import { _decorator, Component, Collider2D, Contact2DType, IPhysics2DContact, RigidBody2D, PhysicsSystem2D, ERigidBody2DType } from 'cc';

// 重要：使用 Box2D 物理需要在项目设置中开启 2D 物理
// 且 RigidBody2D 必须勾选 EnabledContactListener

@ccclass('CollisionExample')
export class CollisionExample extends Component {
    start() {
        const collider = this.getComponent(Collider2D);
        if (collider) {
            collider.on(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this);
            collider.on(Contact2DType.END_CONTACT, this.onEndContact, this);
        }
    }

    onBeginContact(selfCollider: Collider2D, otherCollider: Collider2D, contact: IPhysics2DContact | null) {
        // 碰撞开始
        const otherName = otherCollider.node.name;
        if (otherName === 'Enemy') {
            // 碰到敌人
        }
    }

    onEndContact(selfCollider: Collider2D, otherCollider: Collider2D, contact: IPhysics2DContact | null) {
        // 碰撞结束
    }
}

// Builtin 物理模块（无需 RigidBody）只支持 BEGIN_CONTACT 和 END_CONTACT
\`\`\`

### 6. 计时器

\`\`\`typescript
// 每隔 interval 秒执行一次
this.schedule(() => {
    this.spawnEnemy();
}, 2.0); // 每2秒

// 带重复次数和延迟
this.schedule(callback, interval, repeat, delay);
// 例：延迟1秒后开始，每0.5秒执行，重复10次
this.schedule(this.doSomething, 0.5, 10, 1.0);

// 只执行一次（延迟执行）
this.scheduleOnce(() => {
    this.gameOver();
}, 3.0); // 3秒后

// 取消计时器
this.unschedule(this.doSomething);
this.unscheduleAllCallbacks();
\`\`\`

### 7. UI 操作

\`\`\`typescript
import { _decorator, Component, Label, Sprite, SpriteFrame, Color, UITransform, Button } from 'cc';

// 修改文字
const label = this.node.getComponent(Label)!;
label.string = 'Score: 100';
label.fontSize = 24;
label.color = new Color(255, 0, 0, 255); // RGBA

// 修改精灵颜色
const sprite = this.node.getComponent(Sprite)!;
sprite.color = new Color(0, 255, 0, 255);

// UITransform（2D 节点的尺寸）
const transform = this.node.getComponent(UITransform)!;
transform.setContentSize(200, 100);
const size = transform.contentSize; // { width, height }

// 按钮事件
const button = this.node.getComponent(Button)!;
this.node.on('click', () => {
    console.log('Button clicked');
}, this);
\`\`\`

### 8. 资源加载

\`\`\`typescript
import { _decorator, Component, resources, SpriteFrame, Sprite, Prefab, instantiate } from 'cc';

// 动态加载资源（资源必须放在 resources 目录下）
resources.load('textures/hero/spriteFrame', SpriteFrame, (err, spriteFrame) => {
    if (!err) {
        this.getComponent(Sprite)!.spriteFrame = spriteFrame;
    }
});

// 加载预制体并实例化
resources.load('prefabs/Enemy', Prefab, (err, prefab) => {
    if (!err) {
        const enemy = instantiate(prefab);
        enemy.parent = this.node;
        enemy.setPosition(100, 0, 0);
    }
});
\`\`\`

### 9. 场景管理

\`\`\`typescript
import { director } from 'cc';

// 切换场景
director.loadScene('GameScene');

// 带回调
director.loadScene('GameScene', () => {
    console.log('Scene loaded');
});
\`\`\`

### 10. 缓动系统

\`\`\`typescript
import { tween, Vec3 } from 'cc';

// 移动动画
tween(this.node)
    .to(1, { position: new Vec3(200, 0, 0) }) // 1秒内移动到目标位置
    .start();

// 连续动画
tween(this.node)
    .to(0.5, { scale: new Vec3(1.2, 1.2, 1) })
    .to(0.5, { scale: new Vec3(1, 1, 1) })
    .start();

// 循环动画
tween(this.node)
    .by(1, { position: new Vec3(0, 50, 0) })
    .by(1, { position: new Vec3(0, -50, 0) })
    .union()
    .repeatForever()
    .start();

// 带回调
tween(this.node)
    .to(1, { position: new Vec3(0, 100, 0) })
    .call(() => { console.log('Animation done'); })
    .start();
\`\`\`

### 11. 完整的 2D 角色控制器示例

\`\`\`typescript
import { _decorator, Component, Vec3, input, Input, EventKeyboard, KeyCode } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('PlayerController')
export class PlayerController extends Component {
    @property
    moveSpeed: number = 200;
    
    @property
    jumpForce: number = 300;

    private _velocity: Vec3 = new Vec3();
    private _isGrounded: boolean = true;

    onLoad() {
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        input.on(Input.EventType.KEY_UP, this.onKeyUp, this);
    }

    onDestroy() {
        input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        input.off(Input.EventType.KEY_UP, this.onKeyUp, this);
    }

    onKeyDown(event: EventKeyboard) {
        switch (event.keyCode) {
            case KeyCode.ARROW_LEFT:
            case KeyCode.KEY_A:
                this._velocity.x = -this.moveSpeed;
                break;
            case KeyCode.ARROW_RIGHT:
            case KeyCode.KEY_D:
                this._velocity.x = this.moveSpeed;
                break;
            case KeyCode.SPACE:
                if (this._isGrounded) {
                    this._velocity.y = this.jumpForce;
                    this._isGrounded = false;
                }
                break;
        }
    }

    onKeyUp(event: EventKeyboard) {
        switch (event.keyCode) {
            case KeyCode.ARROW_LEFT:
            case KeyCode.KEY_A:
                if (this._velocity.x < 0) this._velocity.x = 0;
                break;
            case KeyCode.ARROW_RIGHT:
            case KeyCode.KEY_D:
                if (this._velocity.x > 0) this._velocity.x = 0;
                break;
        }
    }

    update(deltaTime: number) {
        const pos = this.node.position;
        this.node.setPosition(
            pos.x + this._velocity.x * deltaTime,
            pos.y + this._velocity.y * deltaTime,
            pos.z
        );

        // 简单重力
        if (!this._isGrounded) {
            this._velocity.y -= 800 * deltaTime; // 重力加速度
            if (this.node.position.y <= 0) {
                this.node.setPosition(this.node.position.x, 0, 0);
                this._velocity.y = 0;
                this._isGrounded = true;
            }
        }
    }
}
\`\`\`

### 12. 常见错误和注意事项

- **import 路径**：所有引擎类都从 'cc' 导入，不要写 'cocos' 或 'Cocos'
- **@ccclass 名必须唯一**：不同脚本不能用相同的 ccclass 名
- **Vec3 不可变**：\`this.node.position\` 返回的是只读引用，要修改必须用 \`setPosition()\`
- **onDestroy 取消监听**：在 onLoad/start 中注册的 input.on 必须在 onDestroy 中 input.off
- **2D 节点层级**：2D/UI 节点必须在 Canvas 下才能显示
- **物理系统**：使用碰撞检测前，确保项目设置中启用了 2D 物理引擎
- **@property 类型**：引用类型（Node, Sprite 等）必须声明类型，否则编辑器无法识别
- **deltaTime**：update 参数是秒为单位，不是毫秒
`;
