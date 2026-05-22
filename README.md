
# Green Whispers｜植物的低语

一个面向线下展览的交互式数字装置网页项目。通过浏览器全屏运行，向观众呈现五种植物（菟丝子 Dodder、捕蝇草 Flytrap、含羞草 Mimosa、月见草 Oenothera、向日葵 Sunflower）的拟人化生命片段，并支持鼠标 / 触摸交互来触发它们的"反应"。

## ✨ 项目简介

- **形式**：纯前端静态网页（HTML + CSS + JavaScript），无后端依赖。
- **运行方式**：用现代浏览器（Chrome / Edge 推荐）打开 `index.html` 即可。
- **场景**：通常以全屏方式部署在展览现场的大屏 / 投影上，闲置时播放 `movie.mp4` 作为吸引观众的待机视频，观众靠近 / 操作后进入互动场景。

## 📁 目录结构

```
exhibition/
├── index.html              # 主入口（包含主页与整体调度逻辑）
├── movie.mp4               # 待机吸引视频（大文件，已在 .gitignore 中忽略）
│
├── video-dodder/           # 菟丝子互动子模块
├── video-flytrap/          # 捕蝇草互动子模块
├── video-mimosa/           # 含羞草互动子模块
├── video-oenothera/        # 月见草互动子模块
├── sunflower-assets/       # 向日葵动画帧序列与音效
│
├── audio/sfx/              # 通用 UI 音效
├── images/                 # 界面背景、图案
│   ├── ui/
│   └── patterns/
├── svg/                    # 图标矢量素材（感官图标等）
│
├── package.json            # （可选）puppeteer 依赖，用于自动化测试 / 截图
└── .gitignore              # 已忽略 node_modules、大型媒体资源、系统垃圾文件
```

每个 `video-*/` 子模块都是独立可运行的小页面，结构一致：

```
video-xxx/
├── index.html              # 该植物的展示页
├── script.js               # 状态机 / 动画 / 交互逻辑
├── style.css               # 样式
├── xxx_base_s.mp3 等       # 该植物的音效
├── xxx_idle/  xxx_grow/ … # 帧序列文件夹（按状态划分）
└── icon_notification.mp3   # 通知音效
```

## 🚀 快速开始

由于浏览器对本地文件加载存在跨域限制（特别是音频与帧序列），**请用本地静态服务器启动**，而非直接双击打开。

任选一种：

```bash
# 方式一：Python 自带 http server
python3 -m http.server 8080

# 方式二：Node.js（需要先 npm i -g http-server）
http-server -p 8080
```

然后浏览器访问：

```
http://localhost:8080/
```

## 🎮 交互说明

- 闲置时播放 `movie.mp4`，吸引观众。
- 观众触发后进入主菜单，可选择五种植物之一。
- 每种植物根据自身设定，对鼠标 / 触摸 / 时间产生不同反应（如含羞草闭合、捕蝇草夹合、菟丝子蔓延等）。
- 各模块以帧序列 + 音效驱动，无需视频解码，可在低性能设备上稳定运行。

## 📦 资源说明

由于动画帧序列与音视频资源体积较大（`movie.mp4` 接近 1 GB，`sunflower_base_s.mp3` 18 MB 等），仓库中已通过 `.gitignore` 排除以下内容：

- `movie.mp4`
- `node_modules/`
- 大型 `*.mp4 / *.mov / *.psd` 等
- macOS 系统生成的 `.DS_Store`

如需获取完整素材，请向项目维护者索取，或将素材放回对应目录后再运行。

## 🛠 技术栈

- 原生 HTML / CSS / JavaScript（无打包工具，无框架）
- 帧序列驱动的逐帧动画
- HTMLAudioElement 实现的音效层
- （可选）puppeteer 用于本地预览 / 自动截图

## 📄 License

本项目为清华大学相关课程 / 展览作业用途，资源版权归原作者所有，未经允许请勿用于商业用途。
