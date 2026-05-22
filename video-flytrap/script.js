(() => {
const canvas = document.getElementById('flytrap-canvas');
const ctx = canvas.getContext('2d');

let pointerX = null;
let pointerY = null;
let cursorHintMode = null;

window.addEventListener('pointermove', (e) => {
    pointerX = e.clientX;
    pointerY = e.clientY;
}, { passive: true });

function isPointerOverHint(hintX, hintY, radius) {
    if (pointerX === null || pointerY === null) return false;
    const dx = pointerX - hintX;
    const dy = pointerY - hintY;
    return (dx * dx + dy * dy) <= (radius * radius);
}

function setCustomCursorText({ topCn, topEn, mainText, bottomText }) {
    const cursor = document.getElementById('custom-cursor');
    if (!cursor) return;

    const cnTop = cursor.querySelector('#cursor-text-top-cn');
    const enTop = cursor.querySelector('#cursor-text-top-en');
    const main = cursor.querySelector('#cursor-text-main');
    const bottom = cursor.querySelector('#cursor-text-bottom');
    const topRow = cursor.querySelector('.text-row-top');

    if (cnTop) cnTop.innerText = topCn;
    if (enTop) enTop.innerText = topEn;
    if (main) main.innerText = mainText;
    if (bottom) bottom.innerText = bottomText;

    if (topRow) {
        topRow.style.display = (topCn || topEn) ? 'flex' : 'none';
    }
}

function syncCursorHint() {
    const cursor = document.getElementById('custom-cursor');
    if (!cursor) return;

    const hintX = window.innerWidth * interactionConfig.hint.x;
    const hintY = window.innerHeight * interactionConfig.hint.y;
    const over = isPointerOverHint(hintX, hintY, interactionConfig.clickRadius);
    const nextMode = over ? 'CLICK' : 'TASTE';
    if (nextMode !== cursorHintMode) {
        if (nextMode === 'CLICK') setCustomCursorText({ topCn: '', topEn: '', mainText: '点击', bottomText: 'click' });
        else setCustomCursorText({ topCn: '', topEn: '', mainText: '尝味', bottomText: 'taste' });
        cursorHintMode = nextMode;
    }
    cursor.classList.add('ready');
    // 进入热区反色，离开恢复
    cursor.classList.toggle('inverted', over);
}

// --- 状态机定义 ---
const STATES = {
    GROWING: 'GROWING',       // 初始生长动画
    SWAYING: 'SWAYING',       // 正常随风摇摆（受鼠标控制）
    RETURNING: 'RETURNING',   // 点击后，无视鼠标，平滑回正到中间帧
    WAITING_FOR_PRELOAD: 'WAITING_FOR_PRELOAD', // 等待飞入动画预加载完毕
    CLOSING: 'CLOSING',       // 播放闭合动画 (虫子飞入)
    CLOSED: 'CLOSED',         // 保持完全闭合状态（可设置定时器自动展开，或等待再次点击）
    OPENING: 'OPENING',       // 播放展开动画，结束后回到 SWAYING
    IDLE2: 'IDLE2',           // 虫子飞入后循环播放的状态
    FINAL_CLOSING: 'FINAL_CLOSING' // 点击提示后播放最终闭合动画
};
// 初始状态改为 GROWING
let currentState = STATES.GROWING;

let __idlePingLast = 0;
function __idlePing(ts) {
    if (!window.__iconTestRecordActivity) return;
    if (ts - __idlePingLast < 1000) return;
    __idlePingLast = ts;
    window.__iconTestRecordActivity();
}

// --- 初始生长动画序列帧配置 ---
// 提示：等你上传 flytrap_grow 序列帧后，请修改这里的 growFramesCount
const growFramesCount = 301; // 假设默认60帧，请根据实际情况修改
const getGrowImagePath = (index) => {
    const paddedIndex = index.toString().padStart(5, '0');
    return `video-flytrap/flytrap_grow/flytrap_grow_${paddedIndex}.jpg`;
};

// --- 摇摆序列帧配置 ---
const swayFramesCount = 361; 
const getSwayImagePath = (index) => {
    const paddedIndex = index.toString().padStart(5, '0');
    return `video-flytrap/flytrap_idle1/flytrap_idle1_${paddedIndex}.jpg`;
};

// --- 闭合动画序列帧配置（预留） ---
// 提示：等你上传新的虫子飞入序列帧后，请根据实际帧数修改这里的 bugFlyinFramesCount
const bugFlyinFramesCount = 243; 
const getBugFlyinImagePath = (index) => {
    const paddedIndex = index.toString().padStart(5, '0');
    return `video-flytrap/flytrap_bugflyin/flytrap_bugflyin_${paddedIndex}.jpg`; 
};

// --- idle2 动画序列帧配置（预留） ---
// 提示：等你上传新的 idle2 序列帧后，请根据实际帧数修改这里的 idle2FramesCount
const idle2FramesCount = 301; // 假设默认60帧，请根据实际情况修改
const getIdle2ImagePath = (index) => {
    const paddedIndex = index.toString().padStart(5, '0');
    return `video-flytrap/flytrap_idle2/flytrap_idle2_${paddedIndex}.jpg`; 
};

// --- 最终闭合动画序列帧配置（预留） ---
// 提示：等你上传 flytrap_close 序列帧后，请修改这里的 closeFramesCount
const closeFramesCount = 644; // 假设默认60帧，请根据实际情况修改
const getCloseImagePath = (index) => {
    const paddedIndex = index.toString().padStart(5, '0');
    return `video-flytrap/flytrap_close/flytrap_close_${paddedIndex}.jpg`; 
};

// 交互与动画参数
const easeFactor = 0.08;
const returnEaseFactor = 0.02; // 降低回正系数，让回正过程更慢、更平滑
const breathSpeed = 0.005;
const breathAmplitude = 0.01; 

// 内部变量
let targetFrameIndex = swayFramesCount / 2; // 默认目标在中间
let lerpedFrameIndex = swayFramesCount / 2; // 当前平滑到的帧，也从中间开始
let currentGrowFrame = 0;     // 生长动画的当前帧进度
let currentBugFlyinFrame = 0; // 闭合动画的当前帧进度
let currentIdle2Frame = 0;    // idle2 动画的当前帧进度
let currentCloseFrame = 0;    // 最终闭合动画的当前帧进度

const growImages = [];     // 预留存放生长动画图片
const swayImages = [];
const bugFlyinImages = []; // 预留存放闭合动画图片
const idle2Images = [];    // 预留存放 idle2 动画图片
const closeImages = [];    // 预留存放最终闭合动画图片
let imagesLoaded = 0;
let bugFlyinImagesLoaded = 0; // 记录飞入动画预加载完成的数量
let animationStarted = false;

// === 引导圆环位置与点击区域配置区 ===
const interactionConfig = {
    clickRadius: 50, 
    // 这里预设一个中心偏上的位置作为提示圈的位置，你可以根据画面实际调整
    hint: {
        x: 0.45, 
        y: 0.5  
    }
};

// --- 音频元素 ---
const flytrapBaseAudio = document.getElementById('flytrapBaseAudio');
const flytrapGrowAudio = document.getElementById('flytrapGrowAudio');
const flytrapCloseOpenAudio = document.getElementById('flytrapCloseOpenAudio');
const flytrapHintAudio = document.getElementById('flytrapHintAudio');

// 通用播放函数，防止被浏览器策略拦截报错，加入淡入效果
function playAudio(audioElement, fadeDuration = 500, maxVolume = 1.0) {
    if (audioElement) {
        // 每次触发都强制从头开始播放（确保只播放一次且不循环）
        audioElement.currentTime = 0;
        audioElement.volume = 0; 
        
        audioElement.play().then(() => {
            fadeAudio(audioElement, 'in', fadeDuration, maxVolume);
        }).catch(e => console.log("音频播放被拦截：", e));
    }
}

// 停止音频，加入淡出效果
function stopAudio(audioElement, fadeDuration = 500) {
    if (audioElement && !audioElement.paused) {
        fadeAudio(audioElement, 'out', fadeDuration, 0.0, () => {
            audioElement.pause();
            audioElement.currentTime = 0;
        });
    }
}

// 音频淡入淡出核心函数（使用 rAF，避免 setInterval 在主线程的不稳定调度）
function fadeAudio(audioElement, direction, duration, targetMaxVol = 1.0, callback = null) {
    if (!audioElement) return;
    const targetVolume = direction === 'in' ? targetMaxVol : 0.0;
    const startVolume = audioElement.volume;
    
    if (audioElement.__fadeRaf) {
        cancelAnimationFrame(audioElement.__fadeRaf);
        audioElement.__fadeRaf = null;
    }
    if (audioElement.fadeInterval) {
        clearInterval(audioElement.fadeInterval);
        audioElement.fadeInterval = null;
    }
    const startTs = performance.now();
    const step = (now) => {
        const t = duration > 0 ? Math.min(1, (now - startTs) / duration) : 1;
        let v = startVolume + (targetVolume - startVolume) * t;
        if (v < 0) v = 0;
        if (v > targetMaxVol) v = targetMaxVol;
        audioElement.volume = v;
        if (t < 1) {
            audioElement.__fadeRaf = requestAnimationFrame(step);
        } else {
            audioElement.volume = targetVolume;
            audioElement.__fadeRaf = null;
            if (typeof callback === 'function') callback();
        }
    };
    audioElement.__fadeRaf = requestAnimationFrame(step);
}

// 尝试播放背景音乐
function ensureBaseAudioPlaying() {
    if (flytrapBaseAudio && flytrapBaseAudio.paused) {
        // 背景音量可以稍微调低一点，避免盖过其他音效
        flytrapBaseAudio.volume = 0;
        flytrapBaseAudio.play().then(() => {
            // 背景音淡入到 0.6 左右
            fadeAudio(flytrapBaseAudio, 'in', 1000, 0.6); 
        }).catch(e => console.log("背景音播放等待用户交互：", e));
    }
}
window.addEventListener('click', ensureBaseAudioPlaying, { once: true });

// 配置提示圈音频循环
let isHintAudioPlaying = false;
let hintAudioPlaybackRate = 1.0;

// === 引导圆环样式配置区 ===
const hintCircleConfig = {
    baseRadius: 30,       // 基础半径
    pulseSpeed: 0.003,    // 呼吸速度
    whiteLineWidth: 6,    // 白色圆环的粗细
    blackStrokeWidth: 0.75   // 黑色描边的粗细
};

if (flytrapHintAudio) {
    flytrapHintAudio.addEventListener('loadedmetadata', () => {
        const visualCycleDuration = (2 * Math.PI / hintCircleConfig.pulseSpeed) / 1000;
        const audioDuration = flytrapHintAudio.duration;
        
        if (audioDuration > 0) {
            hintAudioPlaybackRate = audioDuration / visualCycleDuration;
            flytrapHintAudio.playbackRate = hintAudioPlaybackRate;
        }
        flytrapHintAudio.loop = true;
    });
}

function updateHintAudioState(shouldPlay) {
    if (!flytrapHintAudio) return;
    
    if (shouldPlay && !isHintAudioPlaying) {
        flytrapHintAudio.currentTime = 0;
        flytrapHintAudio.playbackRate = hintAudioPlaybackRate;
        flytrapHintAudio.volume = 0;
        flytrapHintAudio.play().then(() => {
            fadeAudio(flytrapHintAudio, 'in', 300, 1.0); 
        }).catch(e => console.log("提示音播放被拦截：", e));
        isHintAudioPlaying = true;
    } else if (!shouldPlay && isHintAudioPlaying) {
        fadeAudio(flytrapHintAudio, 'out', 300, 0.0, () => {
            flytrapHintAudio.pause();
            flytrapHintAudio.currentTime = 0;
        });
        isHintAudioPlaying = false;
    }
}

// --- 初始化与预加载 ---
// 缓存绘图坐标（必须在 resizeCanvas 之前声明，避免 TDZ）
let __drawCoordsCache = null;
let __drawCoordsCanvasW = 0, __drawCoordsCanvasH = 0, __drawCoordsImgRatio = 0;

// 性能：限制 devicePixelRatio，避免 retina 屏上 canvas 像素翻 4 倍。
const __renderDpr = Math.min(window.devicePixelRatio || 1, 1);

// === 提示圆环 overlay canvas（性能优化：圆环呼吸动画独立绘制）===
const __hintCanvas = document.createElement('canvas');
__hintCanvas.id = 'flytrap-hint-canvas';
const __flytrapParent = canvas.parentNode || document.body;
__hintCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
__flytrapParent.appendChild(__hintCanvas);
const __hintCtx = __hintCanvas.getContext('2d');

function __syncHintCanvasSize() {
    __hintCanvas.width = canvas.width;
    __hintCanvas.height = canvas.height;
}

function resizeCanvas() {
    canvas.width = window.innerWidth * __renderDpr;
    canvas.height = window.innerHeight * __renderDpr;
    if (ctx) ctx.imageSmoothingEnabled = false;
    __syncHintCanvasSize();
    __drawCoordsCache = null;
    // 渲染当前对应的画面
    if (currentState === STATES.GROWING) {
        renderImage(growImages[Math.floor(currentGrowFrame)]);
    } else if (currentState === STATES.CLOSING || currentState === STATES.OPENING) {
        renderImage(bugFlyinImages[Math.floor(currentBugFlyinFrame)]);
    } else if (currentState === STATES.IDLE2) {
        renderImage(idle2Images[Math.floor(currentIdle2Frame)]);
    } else if (currentState === STATES.FINAL_CLOSING || currentState === STATES.CLOSED) {
        renderImage(closeImages[Math.floor(currentCloseFrame)]);
    } else {
        renderImage(swayImages[Math.round(lerpedFrameIndex)]); 
    }
}
// resize 加 debounce
let __resizeRaf = 0;
window.addEventListener('resize', () => {
    if (__resizeRaf) cancelAnimationFrame(__resizeRaf);
    __resizeRaf = requestAnimationFrame(() => {
        __resizeRaf = 0;
        resizeCanvas();
    });
});
resizeCanvas();

// 预加载生长动画图片
for (let i = 0; i < growFramesCount; i++) {
    const img = new Image();
    img.decoding = 'async';
    img.src = getGrowImagePath(i);
    // 当第一张生长图加载完毕，尝试启动动画循环，如果需要更严谨可以等大部分加载完
    img.onload = () => {
        if (i === 0 && !animationStarted) {
            renderImage(growImages[0]);
            animationStarted = true;
            
            // 启动时播放生长动画音效
            if (currentState === STATES.GROWING) {
                playAudio(flytrapGrowAudio);
                ensureBaseAudioPlaying(); // 尝试播放背景音
            }
            
            // 改为分批预加载，避免一次性 new Image 1000+ 阻塞主线程导致丢帧/音效卡顿
            __scheduleFlytrapDeferredPreload();
            
            requestAnimationFrame(renderLoop);
        }
    };
    growImages[i] = img;
}

// flytrap_grow 音效首次启动若被浏览器自动播放策略拦截，则在用户首次交互后补播一次
window.addEventListener('pointerdown', function __flytrapGrowAudioRetry() {
    if (flytrapGrowAudio && flytrapGrowAudio.paused && flytrapGrowAudio.currentTime === 0 && currentState === STATES.GROWING) {
        playAudio(flytrapGrowAudio);
    }
}, { once: true });

// 预加载摇摆图片
for (let i = 0; i < swayFramesCount; i++) {
    const img = new Image();
    img.decoding = 'async';
    img.src = getSwayImagePath(i);
    img.onload = () => {
        imagesLoaded++;
        if (imagesLoaded === 1 && currentState === STATES.SWAYING) renderImage(swayImages[0]);
    };
    swayImages[i] = img;
}

// 后面阶段的帧统一延后加载，避免争抢首屏带宽。
// 关键修复：之前是同步 for 循环一次性创建 1000+ 个 Image 对象并发起请求，
// 在低端机上会一次性阻塞主线程几十~几百毫秒，造成 grow 阶段"短暂遮罩感"和音效卡顿。
// 改为按 RAF 节奏分批喂入，每批 BATCH_SIZE 张，分散到多个 tick。
function __scheduleFlytrapDeferredPreload() {
    if (window.__flytrapDeferredScheduled) return;
    window.__flytrapDeferredScheduled = true;

    const BATCH_SIZE = 24; // 每个 RAF tick 创建多少个 Image
    const queue = [
        { count: bugFlyinFramesCount, getPath: getBugFlyinImagePath, target: bugFlyinImages, onload: () => { bugFlyinImagesLoaded++; } },
        { count: idle2FramesCount,    getPath: getIdle2ImagePath,    target: idle2Images,    onload: null },
        { count: closeFramesCount,    getPath: getCloseImagePath,    target: closeImages,    onload: null }
    ];
    let segIdx = 0;
    let i = 0;
    function pumpBatch() {
        if (segIdx >= queue.length) {
            window.__flytrapDeferredLoaded = true;
            return;
        }
        const seg = queue[segIdx];
        const end = Math.min(i + BATCH_SIZE, seg.count);
        for (; i < end; i++) {
            const img = new Image();
            img.decoding = 'async';
            img.src = seg.getPath(i);
            if (seg.onload) img.onload = seg.onload;
            seg.target[i] = img;
        }
        if (i >= seg.count) {
            segIdx++;
            i = 0;
        }
        requestAnimationFrame(pumpBatch);
    }
    // 等下一个 RAF 再开始，避免与 grow 启动同 tick 抢时间
    requestAnimationFrame(pumpBatch);
}

// 兼容保留：以前直接调用 __preloadDeferredFlytrapFrames 的位置仍能工作
function __preloadDeferredFlytrapFrames() {
    __scheduleFlytrapDeferredPreload();
}

// --- 交互元素 ---
// 我们现在用 canvas 的点击事件和 render 函数画圆环，不需要 HTML 里的 div 了
// const clickHintBtn = document.getElementById('click-hint');

// --- 鼠标交互（passive） ---
window.addEventListener('mousemove', (e) => {
    // 只有在摇摆状态下，鼠标才起作用
    if (currentState === STATES.SWAYING) {
        const percentage = e.clientX / window.innerWidth;
        targetFrameIndex = percentage * (swayFramesCount - 1);
    }
}, { passive: true });

// --- 点击交互（触发闭合） ---
canvas.addEventListener('click', (e) => {
    // 生长动画期间不响应点击
    if (currentState === STATES.GROWING) return;
    
    // 获取实际点击位置
    const clickX = e.clientX;
    const clickY = e.clientY;
    
    // 检查是否点击在目标圆内
    function isClickInsideHint(hintConfig) {
        const targetX = window.innerWidth * hintConfig.x;
        const targetY = window.innerHeight * hintConfig.y;
        const distance = Math.sqrt(Math.pow(clickX - targetX, 2) + Math.pow(clickY - targetY, 2));
        return distance <= interactionConfig.clickRadius;
    }

    if (currentState === STATES.IDLE2) {
        if (isClickInsideHint(interactionConfig.hint)) {
            console.log("点击了提示区域，开始播放最终闭合动画...");
            currentState = STATES.FINAL_CLOSING;
            currentCloseFrame = 0; // 重置进度
            playAudio(flytrapCloseOpenAudio); // 播放闭合音效
        }
    }
});

// --- 核心渲染逻辑 ---
// 通用绘制函数
function __computeDrawCoords(img) {
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const imgRatio = img.width / img.height;
    if (__drawCoordsCache && __drawCoordsCanvasW === canvasWidth && __drawCoordsCanvasH === canvasHeight && __drawCoordsImgRatio === imgRatio) {
        return __drawCoordsCache;
    }
    const canvasRatio = canvasWidth / canvasHeight;
    let drawWidth, drawHeight, offsetX, offsetY;
    if (canvasRatio > imgRatio) {
        drawWidth = canvasWidth;
        drawHeight = canvasWidth / imgRatio;
        offsetX = 0;
        offsetY = (canvasHeight - drawHeight) / 2;
    } else {
        drawWidth = canvasHeight * imgRatio;
        drawHeight = canvasHeight;
        offsetX = (canvasWidth - drawWidth) / 2;
        offsetY = 0;
    }
    __drawCoordsCanvasW = canvasWidth;
    __drawCoordsCanvasH = canvasHeight;
    __drawCoordsImgRatio = imgRatio;
    __drawCoordsCache = { offsetX, offsetY, drawWidth, drawHeight };
    return __drawCoordsCache;
}

function drawImageToCtx(img, alpha = 1.0) {
    if (!img || !img.complete) return;
    const c = __computeDrawCoords(img);
    if (alpha !== 1.0) ctx.globalAlpha = alpha;
    ctx.drawImage(img, c.offsetX, c.offsetY, c.drawWidth, c.drawHeight);
    if (alpha !== 1.0) ctx.globalAlpha = 1.0;
}

// === 渲染聚光灯（周围压暗，中心镂空）===
// fadeAlpha: 0~1，用于状态切换时整体淡入淡出
function drawHintSpotlight(ctx, timestamp, x, y, fadeAlpha = 1) {
    const { baseRadius, pulseSpeed } = hintCircleConfig;
    // 中心透明圈：略大于呼吸圆环最大状态（baseRadius * 1.3），完全不遮挡圆环
    const innerRadius = baseRadius * 1.6;
    // 暗化羽化到画布最远角的距离，让暗化覆盖整个画布且边缘自然过渡
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const outerRadius = Math.hypot(Math.max(x, w - x), Math.max(y, h - y));
    // 暗化强度跟随同一呼吸节奏，柔和起伏
    const breath = 0.85 + Math.sin(timestamp * pulseSpeed) * 0.15; // 0.7 ~ 1.0
    const darkAlpha = 0.55 * breath * fadeAlpha; // 最暗处的透明度

    ctx.save();
    const grad = ctx.createRadialGradient(x, y, innerRadius, x, y, outerRadius);
    grad.addColorStop(0,    'rgba(0, 0, 0, 0)');
    grad.addColorStop(0.25, `rgba(0, 0, 0, ${darkAlpha * 0.35})`);
    grad.addColorStop(0.6,  `rgba(0, 0, 0, ${darkAlpha * 0.75})`);
    grad.addColorStop(1,    `rgba(0, 0, 0, ${darkAlpha})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
}

// === 渲染提示圆环的函数 ===
function drawHintCircle(ctx, timestamp, x, y, fadeAlpha = 1) {
    const { baseRadius, pulseSpeed, whiteLineWidth, blackStrokeWidth } = hintCircleConfig;
    
    // 利用 sin 函数生成一个有回弹呼吸感的缩放比例
    const scale = 1 + Math.sin(timestamp * pulseSpeed) * 0.3; 
    const currentRadius = baseRadius * scale;
    const alpha = (0.5 + Math.sin(timestamp * pulseSpeed) * 0.3) * fadeAlpha; 

    ctx.save();
    
    ctx.beginPath();
    ctx.arc(x, y, currentRadius, 0, Math.PI * 2);
    ctx.lineWidth = whiteLineWidth;
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.stroke();
    
    ctx.beginPath();
    ctx.arc(x, y, currentRadius + (whiteLineWidth / 2), 0, Math.PI * 2);
    ctx.lineWidth = blackStrokeWidth;
    ctx.strokeStyle = `rgba(0, 0, 0, ${alpha})`;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x, y, currentRadius - (whiteLineWidth / 2), 0, Math.PI * 2);
    ctx.lineWidth = blackStrokeWidth;
    ctx.strokeStyle = `rgba(0, 0, 0, ${alpha})`;
    ctx.stroke();
    
    ctx.restore();
}

// 提示整体淡入淡出（聚光灯 + 圆环）状态
let __hintFadeAlpha = 0;
let __hintLastTs = 0;
const __HINT_FADE_DURATION = 420; // ms，整体淡入淡出时长

// 每个 rAF tick 调用：在 overlay canvas 上绘制 / 清除提示圆环。
function __updateHintOverlay(timestamp) {
    const ts = timestamp || performance.now();
    const dt = __hintLastTs ? Math.min(ts - __hintLastTs, 100) : 16;
    __hintLastTs = ts;

    const wantShow = (currentState === STATES.IDLE2);
    const target = wantShow ? 1 : 0;
    if (__hintFadeAlpha !== target) {
        const step = dt / __HINT_FADE_DURATION;
        if (target > __hintFadeAlpha) {
            __hintFadeAlpha = Math.min(1, __hintFadeAlpha + step);
        } else {
            __hintFadeAlpha = Math.max(0, __hintFadeAlpha - step);
        }
    }

    __hintCtx.clearRect(0, 0, __hintCanvas.width, __hintCanvas.height);
    if (__hintFadeAlpha > 0.001) {
        const hintX = __hintCanvas.width * interactionConfig.hint.x;
        const hintY = __hintCanvas.height * interactionConfig.hint.y;
        drawHintSpotlight(__hintCtx, ts, hintX, hintY, __hintFadeAlpha);
        drawHintCircle(__hintCtx, ts, hintX, hintY, __hintFadeAlpha);
    }
}

function renderImage(img, timestamp) {
    // 性能优化：仅在视频帧索引变化时重绘底图（drawImage 是最贵的操作）
    if (img && img.src !== lastRenderedImageSrc) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawImageToCtx(img, 1.0);
        lastRenderedImageSrc = img.src;
    }
    
    // 副作用：根据状态切换提示音、光标。圆环已搬到 overlay canvas，不在这里画。
    if (currentState === STATES.IDLE2) {
        updateHintAudioState(true); // 播放提示音
        syncCursorHint();
    } else {
        updateHintAudioState(false);
        const cursor = document.getElementById('custom-cursor');
        if (cursor) {
            cursor.classList.remove('ready');
            cursor.classList.remove('inverted');
        }
        cursorHintMode = null;
    }
}

// 渲染循环
let lastRenderedImageSrc = "";
let __flytrapLastTs = 0;
// 序列帧推进速率（1.0 = 每个 60fps tick 推进 1 帧，即 1/60s 一帧）
// 当前为 60fps 播放（每 1/60s 一帧）。
const FRAME_ADVANCE_RATE = 1.0;

function renderLoop(timestamp) {
    let __dt = __flytrapLastTs ? (timestamp - __flytrapLastTs) : (1000 / 60);
    if (__dt > 100) __dt = 100;
    __flytrapLastTs = timestamp;
    const frameDelta = __dt / (1000 / 60);
    const frameStep = FRAME_ADVANCE_RATE * frameDelta;

    // 每个 rAF tick 更新 hint overlay（与底图解耦）
    __updateHintOverlay(timestamp);

    if (currentState !== STATES.SWAYING &&
        currentState !== STATES.CLOSED &&
        currentState !== STATES.IDLE2) {
        __idlePing(timestamp);
    }
    
    if (currentState === STATES.GROWING) {
        // 播放生长动画
        currentGrowFrame += frameStep; // 控制播放速度（frameDelta 化，60Hz 下以 1/60s 为间隔推进）
        
        if (currentGrowFrame >= growFramesCount - 1) {
            currentGrowFrame = growFramesCount - 1;
            console.log("生长动画播放完毕，进入 SWAYING 状态。");
            currentState = STATES.SWAYING;
            
            // 停留 5 秒后自动触发回正并播放虫子飞入动画
            setTimeout(() => {
                if (currentState === STATES.SWAYING) {
                    console.log("5秒时间到！开始自动回正并切换到虫子飞入动画...");
                    currentState = STATES.RETURNING;
                    // 将目标帧强制设为正中间的那一帧，回正完成后会自动进入 CLOSING 状态
                    targetFrameIndex = swayFramesCount / 2; 
                }
            }, 5000);
        }
        
        const imgToDraw = growImages[Math.floor(currentGrowFrame)];
        if (imgToDraw && imgToDraw.src !== lastRenderedImageSrc) {
            renderImage(imgToDraw);
            lastRenderedImageSrc = imgToDraw.src;
        }

    } else if (currentState === STATES.SWAYING || currentState === STATES.RETURNING) {
        // 1. 平滑插值 (如果正在 RETURNING，用 returnEaseFactor 让它回正得更自然)
        const currentEase = (currentState === STATES.RETURNING) ? returnEaseFactor : easeFactor;
        lerpedFrameIndex += (targetFrameIndex - lerpedFrameIndex) * currentEase;
        
        let finalFrame = lerpedFrameIndex;

        // 如果是 SWAYING 状态，加上风吹的扰动
        if (currentState === STATES.SWAYING) {
            const t = timestamp * breathSpeed;
            const wave1 = Math.sin(t * 0.8); 
            const wave2 = Math.sin(t * 1.37) * 0.35;
            const wave3 = Math.sin(t * 0.31) * 0.25;
            const naturalWindWave = (wave1 + wave2 + wave3) / 1.6;
            const breathOffset = naturalWindWave * ((swayFramesCount - 1) * breathAmplitude);
            finalFrame += breathOffset;
        }

        // 边界限制
        finalFrame = Math.max(0, Math.min(finalFrame, swayFramesCount - 1));
        
        // 检查是否已经“回正”完毕
        if (currentState === STATES.RETURNING) {
            // 放宽阈值，且使用 Math.round() 的结果来判断，确保真正到达中间帧附近再切换
            // 这样能避免过早跳跃导致的生硬感
            if (Math.abs(lerpedFrameIndex - (swayFramesCount / 2)) < 1.0) {
                console.log("回正完毕，检查飞入动画是否加载完毕...");
                currentState = STATES.WAITING_FOR_PRELOAD;
            }
        }

        // 绘制摇摆帧
        const indexToDraw = Math.round(finalFrame);
        const imgToDraw = swayImages[indexToDraw];
        if (imgToDraw && imgToDraw.src !== lastRenderedImageSrc) {
            renderImage(imgToDraw);
            lastRenderedImageSrc = imgToDraw.src;
        }

    } else if (currentState === STATES.WAITING_FOR_PRELOAD) {
        // 如果在等待预加载，继续绘制最后那一帧（回正后的帧），避免黑屏
        const indexToDraw = Math.round(swayFramesCount / 2);
        const imgToDraw = swayImages[indexToDraw];
        if (imgToDraw && imgToDraw.src !== lastRenderedImageSrc) {
            renderImage(imgToDraw, timestamp);
            lastRenderedImageSrc = imgToDraw.src;
        } else if (imgToDraw) {
            renderImage(imgToDraw, timestamp);
        }
        
        // 检查是否预加载了足够多（比如至少前30帧，或者全部）的飞入动画帧
        // 为了绝对平滑，我们要求预加载全部（或者绝大部分）再开始
        if (bugFlyinImagesLoaded >= bugFlyinFramesCount * 0.8) {
            console.log("飞入动画预加载完毕，开始播放！");
            currentState = STATES.CLOSING;
            currentBugFlyinFrame = 0; // 重置闭合动画进度
            // 移除这里的 playAudio(flytrapCloseOpenAudio); 确保在 bugflyin 时不播放最终闭合音效
        }

    } else if (currentState === STATES.CLOSING) {
        // 播放闭合动画：每帧进度增加（可以控制播放速度）
        currentBugFlyinFrame += frameStep; // 0.5代表半速播放，1代表全速，视你的动画帧率而定
        
        if (currentBugFlyinFrame >= bugFlyinFramesCount - 1) {
            currentBugFlyinFrame = bugFlyinFramesCount - 1;
            console.log("闭合动画播放完毕，进入 IDLE2 状态。");
            currentState = STATES.IDLE2;
            currentIdle2Frame = 0; // 重置 idle2 动画进度
            
            // 触发事件通知 index.html，虫子飞入动画第一次播放完成
            if (!window.hasFlytrapBugFlyinFinished) {
                window.hasFlytrapBugFlyinFinished = true;
                window.dispatchEvent(new Event('flytrapBugFlyinFinished'));
            }
        }
        
        const imgToDraw = bugFlyinImages[Math.floor(currentBugFlyinFrame)];
        if (imgToDraw && imgToDraw.src !== lastRenderedImageSrc) {
            renderImage(imgToDraw, timestamp);
            lastRenderedImageSrc = imgToDraw.src;
        } else if (imgToDraw) {
            renderImage(imgToDraw, timestamp);
        }

    } else if (currentState === STATES.IDLE2) {
        // 循环播放 idle2 动画
        currentIdle2Frame += frameStep; // 控制 idle2 播放速度
        
        // 循环逻辑：播放到最后一帧时回到第一帧
        if (currentIdle2Frame >= idle2FramesCount) {
            currentIdle2Frame = 0;
        }
        
        const imgToDraw = idle2Images[Math.floor(currentIdle2Frame)];
        if (imgToDraw && imgToDraw.src !== lastRenderedImageSrc) {
            renderImage(imgToDraw, timestamp);
            lastRenderedImageSrc = imgToDraw.src;
        } else if (imgToDraw) {
            renderImage(imgToDraw, timestamp);
        }

    } else if (currentState === STATES.FINAL_CLOSING) {
        // 播放最终闭合动画
        currentCloseFrame += frameStep;
        
        if (currentCloseFrame >= closeFramesCount - 1) {
            currentCloseFrame = closeFramesCount - 1;
            console.log("最终闭合动画播放完毕。触发转场...");
            
            // 触发事件通知 index.html，最终闭合动画播放完成
            if (!window.hasFlytrapCloseFinished) {
                window.hasFlytrapCloseFinished = true;
                window.dispatchEvent(new Event('flytrapCloseFinished'));
            }
            
            // 保持在 CLOSED 状态，等待转场覆盖
            currentState = STATES.CLOSED;
        }
        
        const imgToDraw = closeImages[Math.floor(currentCloseFrame)];
        if (imgToDraw && imgToDraw.src !== lastRenderedImageSrc) {
            renderImage(imgToDraw, timestamp);
            lastRenderedImageSrc = imgToDraw.src;
        } else if (imgToDraw) {
            renderImage(imgToDraw, timestamp);
        }

    } else if (currentState === STATES.OPENING) {
        // 播放展开动画（倒放闭合序列帧）
        currentBugFlyinFrame -= frameStep;
        
        if (currentBugFlyinFrame <= 0) {
            currentBugFlyinFrame = 0;
            console.log("展开完毕，恢复摇摆状态。");
            currentState = STATES.SWAYING;
            // 把目标帧重置为当前鼠标位置，防止突然跳跃
            // (如果不重置，它会立刻弹向鼠标当前所在位置)
        }
        
        const imgToDraw = bugFlyinImages[Math.floor(currentBugFlyinFrame)];
        if (imgToDraw && imgToDraw.src !== lastRenderedImageSrc) {
            renderImage(imgToDraw, timestamp);
            lastRenderedImageSrc = imgToDraw.src;
        } else if (imgToDraw) {
            renderImage(imgToDraw, timestamp);
        }
    }

    requestAnimationFrame(renderLoop);
}

})();
