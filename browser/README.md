# 真实浏览器版

用你本机的 Chrome 打开长江雨课堂「学习空间」，像人一样点开视频、放完、换下一个。观看记录由平台自己的播放器上报，这里不调用任何接口。

和上一级目录的 `main.py` 是两条完全不同的路：`main.py` 不播放视频，直接往 `/video-log/heartbeat/` 发自己拼出来的心跳。这个版本什么都不拼，所以不存在“请求长得像不像”的问题。

## 为什么不在 main.py 上改

在真实页面上观察播放器自己发出的请求（只读监听，不拦不改），能看到 `main.py` 改请求头、改节奏都补不上的差别：

- 播放器每 30 秒发一次 `/video-log/heartbeat/`，一次装 6 条 `et: "heartbeat"`，每条间隔 5 秒；`main.py` 每 5 秒单发一条，事件类型在 `playing` / `waiting` 里随机挑，从不出现 `heartbeat`
- 心跳里的页面标识 `pg` 每次加载页面都是随机的（实测 `48994152_166bb`），`main.py` 写死成 `{视频ID}_q8mn`
- 页面同时还在发 `/video-log/log/track/` 的 `ai_agent_hb` 事件（数字人 / AI 面板的心跳），`main.py` 完全没有
- 真实播放会持续从 CDN 拉视频分片；`main.py` 只读视频开头几 KB 拿时长
- 图文：真实页面一打开就自己调用 `user_article_finish`，同时还有二十来个别的请求（`leaf_info`、`add_study_node_and_leaf_h5`、AI 学伴的一串）；`main.py` 等 3 秒后单独调这一个接口
- `main.py` 默认 3 个视频并发、1.5 倍速；同一个账号同时在“看”三个视频，这一条本身就说明问题

另外，现在课程用的是新版「学习空间」（`/ai-workspace/lms-graph/...`），`main.py` 针对的是旧版的 `/v2/web/xcloud/video-student/...` 页面。

## 用法

```bash
cd browser
npm install          # 只装 playwright-core，不下载浏览器
```

第一步，启动一个可被接管的 Chrome（独立 profile，第一次需要在里面登录一次雨课堂）：

```bash
# Linux
google-chrome --remote-debugging-port=9222 --user-data-dir="$HOME/yuketang-chrome" --mute-audio &

# macOS
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 --user-data-dir="$HOME/yuketang-chrome" --mute-audio &

# Windows
"%ProgramFiles%\Google\Chrome\Application\chrome.exe" ^
  --remote-debugging-port=9222 --user-data-dir="%USERPROFILE%\yuketang-chrome" --mute-audio
```

`--mute-audio` 让这个专用实例整个不出声，页面读不到它。脚本默认也会在起播前把播放器静音，这一项是兜底。

第二步，在那个窗口里登录，打开课程，点进任意一个视频（地址里带 `/ai-workspace/lms-graph/`）。从哪一项开始，就从哪一项往后学；后面学完了会回到前面还没完成的。

第三步：

```bash
node run.mjs              # 开始
node run.mjs --inspect    # 只读看目录和当前项，不点不播
node run.mjs --check      # 特征自检
node run.mjs --help       # 全部参数
```

常用参数：`--max-items <n>` 学几项就停，`--no-articles` 只看视频，`--no-mute` 不静音，`--log-level verbose` 看全部细节。

## 它做什么

- 读左侧「知识点」目录，从当前项往后找第一个没完成（没有圆圈勾）的视频或图文。课堂（直播回放）不碰。
- 有学习项的知识点如果是折叠的，里面的学习项根本不渲染（实测一门课 111 项里有 24 个视频藏在折叠节点下），所以走到它时先点展开图标，再接着往下找。不会一上来把所有节点都展开。
- 视频：起播前静音，真实点击课件中间的大播放按钮；暂停了就恢复，被弹窗打断就停下交给你；放完之后看目录上有没有打勾。已经放完的不重放。
- 图文：实测页面一打开就记为已读（内容是 Office Online 嵌入的课件）。脚本仍然停留一段时间（默认 25–70 秒），期间用真实滚轮往下翻，不会点开就走。
- 所有点击、滚轮都是浏览器自己构造的可信事件（CDP 输入），带贝塞尔轨迹和人手量级的按键间隔；等待时长全部抖动；播放期间偶尔动一下指针。
- 焦点模拟：窗口放到后面不会触发 blur。别把学习页切成同一窗口里的后台标签，`visibilityState` 没法模拟。

## 在真实页面上确认过的

- 放完一个 15 分钟的视频，目录上打勾、标题栏变成「已完成」；中途没有暂停、没有弹题。
- 视频完成后平台刷新进度会重新渲染目录，有一小段时间读不到，脚本会等它渲染完。
- 切到一个 31 分钟的视频时，CDN 约 50 秒才给数据（播放状态、`readyState` 1、`seeking`）。这时脚本只等着，不去点那个播放/暂停二合一的按钮；缓冲超过 2 分钟才停下。
- 点展开图标会展开知识点，不会切走当前项。

## 还没确认的

- 视频播放中会不会弹题。脚本遇到弹窗会停下，不替你点。
- 静音是直接设 `video.muted`，播放器自己的音量界面仍显示 100%（它只跟踪 `volume`）。心跳里不带音量字段。

## 测试

```bash
npm run test:unit   # 不需要浏览器
npm test            # 单元 + 端到端（需要本机 Chrome）
```

端到端测试的桩页面照真实页面的结构搭，只接受 `isTrusted` 的事件，合成事件一律记进 `rejected` 且不产生效果。
