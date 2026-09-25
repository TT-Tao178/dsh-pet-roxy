# dsh-pet-roxy 🐰

DSH（DeepSeek Harness）Web 界面里的桌面宠物挂件。角色是《无职转生》里的洛琪希（Roxy）——一只蓝发蓝眼、认真又有点傲娇的精灵魔导师，现在住进了你的 DSH 右下角。

装上之后，每次打开 DSH Web 她都会自动出现，帮你盯着余额、记任务、算消耗。

## 她都能干什么

**日常陪着你**

- 会呼吸，待机久了会打瞌睡，偶尔自己换个表情
- 单击她：弹出气泡，显示余额和今日已用；再点一下，切换随机台词
- 快速连点两次：她会犯困
- 可以随便拖，松手自动吸附到屏幕四边或四角

**和你的 DeepSeek 账户挂钩**

- 显示余额，60 秒自动刷新，余额变化有气泡提示
- 每轮对话结束，弹出这一轮的真实消耗金额；花得多她会震惊
- 「今日已用」两种模式：默认记账模式（余额差值自己算，免令牌），或令牌模式（更精确的实时换算）

**任务小管家**

- 右键她 →「添加任务」，会弹出一张黄色便签，写下任务回车就贴上
- 右键 →「数据统计」：今日任务 / 已完成 / 进行中 / 失败四张卡，配环形图和最近 7 天趋势，还能直接在面板里改任务状态

**可以按你的喜好配置**（右键 → 设置）

- 「说的话」：自定义台词（每行一条），开关随机台词 / 消耗提醒 / 余额低提醒
- 「图片」：上传自己的表情图，替换默认 / 行为一 / 行为二 / 行为三 / 行为四五个槽位
- 「行为」：大小（百分比显示，拖动即生效）、位置、动画开关（即时生效）、左吸附镜像（即时生效）、消耗表情反应、犯困频率

没有音频、没有遥测、没有构建步骤，运行零依赖。她只会在你的本机读写几个小配置文件。

## 行为与图片对应

| 行为 | 图片 | 什么时候出现 |
|---|---|---|
| 默认 | `assets/roxy0.png` | 开机 / 待机 |
| 行为一 | `assets/roxy1.png` | 单击她（与行为二随机二选一）；任务完成；每轮消耗 < 5 元 |
| 行为二 | `assets/roxy2.png` | 单击她（与行为一随机二选一）；任务失败；每轮消耗 ≥ 5 元 |
| 行为三 | `assets/roxy3.png` | 任务进行中 80% 概率出现，平时 20% 概率出现（工作态） |
| 行为四 | `assets/roxy4.png` | 双击她；随机犯困（25~35 秒、30% 概率，任务进行中不犯困） |

> 图片可以在「设置 → 图片」里上传替换；「预览」按钮可以随时查看每个行为对应的图。

## 安装

需要先装好 [pnpm](https://pnpm.io/zh/installation)（`npm install -g pnpm`）。

### 方式一：从 GitHub 直接装

```powershell
dsh plugin --profile web add github:TT-Tao178/dsh-pet-roxy
```

装完重启 `dsh web`，浏览器刷新即可。

### 方式二：本地安装

```powershell
git clone https://github.com/TT-Tao178/dsh-pet-roxy.git
cd dsh-pet-roxy
dsh plugin --profile web add link:.
```

> 注意：`link:.` 指仓库根目录本身（插件包就在这里），**不要**写成 `link:.\dsh-pet-roxy` 这种带子目录的形式——那会被 pnpm 当成普通依赖装进去，重启后挂件不出现。

### 卸载

```powershell
dsh plugin --profile web remove dsh-pet-roxy
```

### 装在 DSH 桌面版（Electron，desktop profile）

`dsh plugin --profile web add` 只会装到 **web** profile。Electron 桌面版启动的是 **desktop**
profile，两个 profile 有各自独立的依赖和配置树——所以在桌面版里刷新页面，永远看不到她。

桌面版用仓库自带的脚本挂载：

````powershell
# 先预览要改什么（不改任何文件）
powershell -ExecutionPolicy Bypass -File scripts\install-desktop-profile.ps1 -WhatIf

# 正式写入（自动备份目标文件）
powershell -ExecutionPolicy Bypass -File scripts\install-desktop-profile.ps1

# 卸载，恢复到写入前
powershell -ExecutionPolicy Bypass -File scripts\install-desktop-profile.ps1 -Uninstall
````

脚本默认走 **Package 模式**，做两件事：

1. 在 `<DSH_HOME>\profiles\desktop\node_modules\` 下建一个**目录联接（junction）**指向本仓库；
2. 往 `<DSH_HOME>\profiles\desktop\cordis.patch.yml` 追加一条包名条目。

```yaml
- insert:
    - id: pet-roxy
      name: 'dsh-pet-roxy'
```

**为什么必须是包名而不是 `file://` URL**：harness 靠 loader 条目的 name 反推包名
（`exactPackageSpecifier()`），再读那个包的 `package.json` 去找 `dsh.client` 声明。
`file://` 这种带 scheme 的说明符会让它返回 `undefined`——于是 `dsh.client` 永远扫不到，
React 客户端半侧也就永远不会加载。**Package 模式是客户端半侧能工作的前提。**

整个过程**不跑 pnpm**：建 junction 是纯文件系统操作，不触发依赖解析，所以
`profiles\node_modules` 里可能存在的 hoisted 旧版 `@deepseek-ai/*` 不会被拉进本 profile
的解析路径（也就不会顶掉 harness 内置的版本）。

实在想退回零 `node_modules` 的旧方式，用 `-Mode File`——但那样只剩
`webserver/index-inject` 注入式，客户端半侧不加载。

两种模式都会保留注入式作为**显示兜底**：即使客户端半侧加载失败，宠物依然会出现。

装完**必须完全退出并重启 DSH**（Electron 桌面版刷新页面无效）。

```powershell
# 验证一：端口换成你自己的 DSH 地址，应返回 200
curl http://127.0.0.1:19387/dsh-pet-roxy/widget.js

# 验证二：在窗口里按 Ctrl+Shift+I，Console 里应返回 true（表示 React 客户端半侧也加载了）
window.__dshPetRoxyClient
```

> 已经用 `link:` 装进 web profile 的可以两套并存，互不影响。想同时改多个 profile 时，
> 脚本支持 `-Profile <名字>`。

### 装好后还需要配一个密钥

- **`DEEPSEEK_API_KEY`**（必需）：拉余额用的，在 DSH 的凭据设置里配置。
- **`DEEPSEEK_PLATFORM_TOKEN`**（可选）：想要「实时·令牌」用量模式才需要；不配也能用，默认走记账模式。

## 验证装好没有

```powershell
dsh --profile web --dump-config | Select-String pet-roxy
```

或者：

```powershell
curl http://127.0.0.1:3080/dsh-pet-roxy/widget.js
```

返回 200、浏览器右下角出现 Roxy，就成了。

## 数据都存在哪

她只在本机读写 4 个地方（都在 `$DSH_HOME` 下，`$DSH_HOME` 默认是 `~/.dsh`）：

| 文件 | 存什么 |
|---|---|
| `.dshp-roxy-config.json` | 你的配置（大小、台词、表情覆盖） |
| `.dshp-roxy-usage.json` | 记账账本（余额差值，跨天归档 30 天） |
| `.dshp-roxy-tasks.json` | 任务清单 |
| `dsh-pet-roxy-uploads/` | 你上传的表情图 |

这些都放在本机，插件升级不会丢。

## 架构

插件是**双半侧**的，一行挂载声明同时起两边：

| 半侧 | 入口 | 职责 |
|---|---|---|
| 宿主（Node） | `lib/index.js` | 余额拉取与记账、每轮消耗结算、任务 CRUD、表情图与配置下发，全部走 `/dsh-pet-roxy/*` 同源路由 |
| 客户端（浏览器） | `src/client/*` → 构建产出 `lib/client.js` | 宠物本体、气泡台词、右键菜单、设置面板、数据统计 |

客户端半侧走 DSH 官方的 client 插件契约：`package.json` 里声明 `dsh.client.platform = "web"`，
并把 `exports["./client"]` 指向构建产物。DSH 启动时扫描已加载包里的该声明，把它作为
`<script>` 行注入页面，产物执行时用 `window.__ModuleLoader__.load({ id, factory })` 注册自己。

> 因此**宿主侧必须用包名挂载**（`name: 'dsh-pet-roxy'`），不能用 `file://` URL：声明扫描靠
> `exactPackageSpecifier()` 从 loader 条目反推包名，带 scheme 的说明符会被它判成 undefined，
> 于是 `dsh.client` 永远扫不到，React 半侧也就永远不会加载。

老式的 `webserver/index-inject` 注入（`client/roxy-widget.js`）仍然保留并随包发布，作为
「客户端半侧加载不出来时宠物也得在」的兜底；React 半侧一旦真正挂到 DOM 上，会立刻把它收走，
所以页面上任何时候都只有一只洛琪希。

## 开发

改客户端半侧需要构建；宿主半侧是手写 ESM，不需要。

````powershell
npm install        # 只为构建：esbuild + react（运行时不依赖任何第三方包）
npm run build      # 产出 lib/client.js
npm test           # 冒烟测试（mock ctx，不连真实 DSH）
````

- 改 `src/client/*` → `npm run build` → **刷新页面**即可生效（产物由宿主路由在运行时下发）
- 改 `lib/index.js`（宿主侧）→ 必须**重启 DSH**
- `lib/client.js` 是构建产物且随仓库提交，clone 下来即可直接用，不必先装依赖

想排查产物是否合规，用 `node scripts/build-client.mjs --no-minify` 打出可读版本 ——
脚本会自检 `load(id)` 已注册、且 `factory` 返回的导出含 `inject` 与 `apply`。

## 常见问题

**装完没出现？** 先看 `dsh --profile web --dump-config` 里有没有 `dsh-pet-roxy`；有的话重启 `dsh web` 再刷新浏览器。没有的话，多半是 `link:` 写成了带子目录的形式，卸载重装一次。

**余额显示"未配置 DEEPSEEK_API_KEY"？** 去 DSH 的凭据里加。

**上传的图没生效？** 图片要 ≤2MB，格式 PNG/JPG/WebP，透明背景效果最好。

**改了代码不生效？** 宿主侧（`lib/index.js`）必须重启 DSH；客户端半侧改完要先 `npm run build`，然后刷新页面（F5）即可。

**右键宠物没反应，只有拖拽和点击能用？** 说明 React 客户端半侧没加载，页面退回了只带宠物本体的注入式兜底。在 Console 里查 `window.__dshPetRoxyReact` —— 不是 `true` 就依次检查 `package.json` 里的 `dsh.client`、`exports["./client"]`，以及宿主是不是用**包名**挂载的。

**余额显示一串「余额接口返回异常」？** 早期版本对 `/user/balance` 的响应结构判断有误（要求了一个实际并不存在的 `code` 字段），导致余额永远拉不到；已在 0.3.0 修正，升级后重启 DSH 即可。

## 鸣谢

- 架构思路参考 [DeepSeek-Balance-Whale-Widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget)（MIT）——余额拉取、记账模式、每轮对话消耗这套 DSH 宿主侧方案直接继承了它的成熟设计，感谢作者踩过的坑。
- 桌面宠物的玩法参考了 [dsh-pet](https://github.com/PC2005-cloud/dsh-pet)（呼吸、犯困、点击反应这些互动的思路）。
- 角色素材是 AI 生成的洛琪希同人图，仅供个人学习使用，请勿商用。

## 许可证

- 代码：MIT
- 素材（`assets/` 下的图片）：仅限个人使用，禁止商用
