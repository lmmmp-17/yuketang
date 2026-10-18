# 长江雨课堂刷课工具

自动学习长江雨课堂课程里的视频和图文。fork 自 [Gary-666/yuketang](https://github.com/Gary-666/yuketang)，这个分支加了一个 **Playwright 版**：用你自己的 Chrome 打开课程，真实点击播放，观看记录由平台自己的播放器上报。

两个版本：

| | Playwright 版（推荐） | 请求版（上游原来的） |
| --- | --- | --- |
| 在哪 | [`playwright/`](playwright/) | [`legacy/`](legacy/) |
| 怎么完成学习 | 真的打开页面、播放视频 | 不播放，直接往接口发拼出来的心跳 |
| 支持的页面 | 新版「学习空间」（`/ai-workspace/lms-graph/`） | 旧版视频页 |
| 需要装什么 | Node.js + 一个 npm 包 + Chrome | Python + 几个包，要手动抄 Cookie |

请求版发出的请求和真实播放器的对不上（心跳格式、节奏、页面标识都不一样，还默认三个视频同时"看"），详见 [`playwright/README.md`](playwright/README.md#为什么不在-mainpy-上改)。

---

## 快速开始（Playwright 版）

### 1. 准备（只做一次）

- **Google Chrome**：用你电脑上装的那个。
- **Node.js 20 或更新**：
  - Windows：没装也没关系，第一次运行 `start.cmd` 时会问你要不要用 winget 自动装。
  - macOS：`brew install node`；Linux：用系统的包管理器装 `nodejs`。也可以到 [nodejs.org](https://nodejs.org/) 下载 LTS 版。
- **下载这个仓库**：在 GitHub 页面点 **Code → Download ZIP** 解压；或者 `git clone https://github.com/lmmmp-17/yuketang.git`。

### 2. 运行

| 系统 | 怎么启动 |
| --- | --- |
| Windows | 双击仓库里的 **`start.cmd`** |
| Linux / macOS | 在仓库目录下执行 **`./start.sh`** |

接下来：

1. 第一次运行会自动安装依赖（只装一个约 5MB 的 npm 包，不下载浏览器），之后就不再装了。
2. 脚本会自动打开一个**专用的 Chrome**：单独的用户目录，和你平时用的 Chrome 分开，全程静音。
3. 在这个 Chrome 里**登录长江雨课堂**（登录时的验证码自己完成）。只有第一次需要登录，以后会记住。
4. 进入要学的课程，**点开任意一个视频**，进到「学习空间」页面（地址里带 `/ai-workspace/lms-graph/`）。脚本看到这个页面就会自动开始。

从哪一项开始，脚本就从哪一项往后学；后面都学完了，会回到前面补还没完成的。要停的时候按 `Ctrl+C`，或者直接关掉命令行窗口；浏览器不会被关掉。

脚本会做这些事：

- 读左侧「知识点」目录，找下一个**没打勾**的视频或图文。课堂（直播回放）不碰。折叠着的知识点，走到它时先展开，因为里面的视频不展开就不显示。
- **视频**：先静音，再真实点击播放；暂停了会恢复，缓冲时就等着；放完停几秒再换下一项，偶尔会停得久一点。已经看完的不重放。
- **图文**：停留 25–70 秒，期间用滚轮往下翻。
- 播放中**弹出任何窗口**（提示、题目）都会停下来等你处理，不替你点。

### 3. 想改行为时加参数

参数加在启动命令后面，比如 `./start.sh --max-items 1`。Windows 上要加参数的话，在命令行里进入仓库目录执行 `.\start.cmd --max-items 1`（前面的 `.\` 不能省，某些环境下 cmd 不会在当前目录找可执行文件）。

| 参数 | 作用 |
| --- | --- |
| `--max-items <n>` | 学完 n 项就停（第一次可以用 `--max-items 1` 试试） |
| `--no-articles` | 只看视频，跳过图文 |
| `--no-mute` | 不静音 |
| `--log-level verbose` | 显示全部细节，排查问题时用 |
| `--inspect` | 只读查看目录和当前项，不点击、不播放 |
| `--check` | 特征自检，不动学习进度 |
| `--setup` | 重新安装依赖 |
| `--help` | 列出全部参数 |

### 运行期间注意

- 浏览器窗口可以放到别的窗口**后面**，或者挪到另一个桌面，不影响播放。但**不要最小化**，也不要在同一个窗口里切到别的标签页，否则页面会变成后台状态。
- 脚本运行时，别在那个 Chrome 窗口里动鼠标。想用电脑就把它放到后面。
- 学完把这个专用 Chrome 关掉。它开着调试端口，开着的时候本机的任何程序都能控制它。

### 遇到问题

| 现象 | 处理 |
| --- | --- |
| 双击 `start.cmd` 后 Windows 提示"已保护你的电脑" | 点"更多信息"→"仍要运行"。从网上下载的 ZIP 解压出来的脚本可能会这样 |
| `没找到 Node.js` | 按提示装 Node.js 20 或更新，装完重新运行 |
| `依赖安装失败` | 检查网络后重新运行。国内网络慢的话，先执行 `npm config set registry https://registry.npmmirror.com` |
| `没找到本机的 Google Chrome` | 装好 Chrome；装在别的位置的话，加 `--chrome-path <chrome 的完整路径>` |
| `Chrome 启动了，但调试端口一直没打开` | 这个专用 Chrome 之前被你手动打开过（没带调试端口）。关掉所有 Chrome 窗口再运行 |
| `播放被弹窗打断：…已停下` | 看一眼浏览器，把弹窗处理掉，再重新运行 |
| `视频缓冲了 N 秒还没动` | 网络或视频源有问题，刷新页面后重新运行 |
| `点了「…」但页面没有切过去` | 平台可能弹了提示框，看一眼浏览器，处理掉再重新运行 |
| 页面改版、脚本找不到东西 | 先跑 `--inspect` 看真实结构，再带着输出提 issue |

### 进阶：自己启动 Chrome

不想让脚本代劳的话，也可以自己用调试端口启动 Chrome，脚本连得上就不会再启动一个。命令和脚本用的是同一组参数：

```bash
# Linux
google-chrome --remote-debugging-port=9222 --user-data-dir="$HOME/yuketang-chrome" --mute-audio &

# macOS
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 --user-data-dir="$HOME/yuketang-chrome" --mute-audio &
```

```bat
:: Windows（cmd）
"%ProgramFiles%\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%USERPROFILE%\yuketang-chrome" --mute-audio
```

- `--user-data-dir` 一定要是单独的目录。和平时用的 Chrome 共用的话，如果平时的 Chrome 已经开着，这条命令只会在原来的窗口里多开一个标签，**调试端口不会打开**。
- 加 `--no-auto-launch` 可以让脚本连不上时只报错，不自己启动。

更多技术细节（在真实页面上观察到了什么、还有哪些没确认、测试怎么跑）见 [`playwright/README.md`](playwright/README.md)。

---

## 目录结构

```
yuketang/
├── README.md               ← 你正在看的：快速开始 + 总览
├── start.cmd               入口（Windows）：双击运行
├── start.sh                入口（Linux / macOS）：./start.sh
├── playwright/             Playwright 版（推荐）
│   ├── README.md           技术说明：真实页面上的观察、和请求版的差别、测试
│   ├── run.mjs             start 脚本最终调用的就是它，也可以直接 node run.mjs
│   ├── package.json
│   ├── src/
│   │   ├── learning.mjs    学习流程：读目录、选下一项、展开知识点、播放视频、阅读图文
│   │   ├── browser.mjs     连接 Chrome；连不上时启动专用 Chrome；等你打开学习空间页面
│   │   ├── setup.mjs       第一次运行时自动安装依赖
│   │   ├── pointer.mjs     真实指针：贝塞尔轨迹、点击、滚轮
│   │   ├── environment.mjs 焦点与生命周期模拟（窗口放后台不触发 blur）
│   │   ├── selectors.mjs   页面选择器，平台改版时只改这里
│   │   ├── config.mjs      默认配置与命令行参数
│   │   ├── inspect.mjs     --inspect 只读检查
│   │   ├── diagnose.mjs    --check 特征自检
│   │   ├── human.mjs       随机化（等待时长、落点）
│   │   ├── platform.mjs    三平台差异（Chrome 路径、profile 目录）
│   │   └── logger.mjs
│   └── tests/              单元测试 + 用真实 Chrome 跑的端到端测试
└── legacy/                 上游原来的请求版（main.py），说明见 legacy/README.md
```

## 测试

```bash
cd playwright
npm run test:unit       # 不需要浏览器
npm test                # 单元 + 端到端（需要本机装了 Chrome）
```

## 免责声明

本项目仅供学习和研究使用，请遵守学校与平台的相关规定。
