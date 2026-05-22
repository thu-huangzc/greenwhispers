(() => {
const canvas = document.getElementById('oenothera-bg-canvas');
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
    const nextMode = over ? 'HOLD' : 'HEAR';
    if (nextMode !== cursorHintMode) {
        if (nextMode === 'HOLD') setCustomCursorText({ topCn: '', topEn: '', mainText: '长按', bottomText: 'hold' });
        else setCustomCursorText({ topCn: '', topEn: '', mainText: '闻声', bottomText: 'hear' });
        cursorHintMode = nextMode;
    }
    cursor.classList.add('ready');
    // 进入热区反色，离开恢复
    cursor.classList.toggle('inverted', over);
}

// --- 状态机定义 ---
const STATES = {
    GROWING: 'GROWING',       // 初始生长动画
    IDLE: 'IDLE',             // 生长动画播放完毕后循环播放的空闲状态
    IDLE_RETURNING: 'IDLE_RETURNING', // 长按后，先让 idle 动画回退到第一帧或前进到最后一帧
    HOLDING: 'HOLDING',       // 长按播放状态
    HOLD_AUTO_PLAY: 'HOLD_AUTO_PLAY', // 长按过半后自动播放状态
    REWINDING: 'REWINDING',   // 松手倒放状态
    BUGFLYIN: 'BUGFLYIN',     // 飞入动画
    FINISHED: 'FINISHED'      // 交互完全结束，停留在最后一帧
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
const growFramesStart = 131;
const growFramesCount = 630; // 从 131 到 760，共 630 帧
const getGrowImagePath = (index) => {
    // 实际文件名是从 131 开始的
    const actualIndex = growFramesStart + Math.floor(index);
    const paddedIndex = actualIndex.toString().padStart(5, '0');
    return `video-oenothera/oenothera_grow/oenothera_grow_${paddedIndex}.jpg`;
};

// --- 空闲动画序列帧配置 ---
const idleFramesCount = 602; 
const getIdleImagePath = (index) => {
    const paddedIndex = index.toString().padStart(5, '0');
    return `video-oenothera/oenothera_idle/oenothera_idle_${paddedIndex}.jpg`;
};

// --- 长按动画序列帧配置 ---
const holdFramesCount = 602; 
const getHoldImagePath = (index) => {
    const paddedIndex = index.toString().padStart(5, '0');
    return `video-oenothera/oenothera_hold/oenothera_hold_${paddedIndex}.jpg`;
};

// --- 飞入动画序列帧配置 ---
const bugFlyinFramesCount = 568; 
const getBugFlyinImagePath = (index) => {
    const paddedIndex = index.toString().padStart(5, '0');
    return `video-oenothera/oenothera_bugflyin/oenothera_bugflyin_${paddedIndex}.jpg`;
};

// 内部变量
let currentGrowFrame = 0;     // 生长动画的当前帧进度
let currentIdleFrame = 0;     // idle 动画的当前帧进度
let currentHoldFrame = 0;     // hold 动画的当前帧进度
let currentBugFlyinFrame = 0; // bugflyin 动画的当前帧进度

const growImages = [];     // 预留存放生长动画图片
const idleImages = [];     // 存放 idle 动画图片
const holdImages = [];     // 存放 hold 动画图片
const bugFlyinImages = []; // 存放 bugflyin 动画图片
let animationStarted = false;

// 长按进度条相关
let lastMouseX = window.innerWidth / 2;
let lastMouseY = window.innerHeight / 2;
let progressSvg = null;
let outerBlackCircle = null;
let progressCircle = null;
const progressRadius = 25;
const progressCircumference = 2 * Math.PI * progressRadius;

// === 引导圆环位置与点击区域配置区 ===
const interactionConfig = {
    // 这里预设一个中心偏上的位置作为提示圈的位置，你可以根据画面实际调整
    hint: {
        x: 0.45, 
        y: 0.5  
    },
    clickRadius: 50 // 交互区域半径
};

// === 引导圆环样式配置区 ===
const hintCircleConfig = {
    baseRadius: 30,       // 基础半径
    pulseSpeed: 0.003,    // 呼吸速度
    whiteLineWidth: 6,    // 白色圆环的粗细
    blackStrokeWidth: 0.75   // 黑色描边的粗细
};

// --- 音频管理 ---
const audioConfig = {
    base: document.getElementById('oenothera-audio-base'),
    grow: document.getElementById('oenothera-audio-grow'),
    bees: document.getElementById('oenothera-audio-bees'),
    idle: document.getElementById('oenothera-audio-idle'),
    hold: document.getElementById('oenothera-audio-hold'),
    bugflyin: document.getElementById('oenothera-audio-bugflyin'),
    hint: document.getElementById('oenothera-audio-hint')
};

// 记录哪些音频已经播放过，防止重复触发
const audioPlayed = {
    grow: false,
    bees: false,
    bugflyin: false
};

// 提示音状态守护标志，避免每个 RAF tick 都触发 play/stop 导致 hint 音效断续
let isHintAudioPlaying = false;

// 淡入淡出通用函数（rAF）
function fadeAudio(audioElement, targetVolume, duration) {
    if (!audioElement) return;
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
        if (v > 1) v = 1;
        audioElement.volume = v;
        if (t < 1) {
            audioElement.__fadeRaf = requestAnimationFrame(step);
        } else {
            audioElement.volume = targetVolume;
            audioElement.__fadeRaf = null;
            if (targetVolume === 0) audioElement.pause();
        }
    };
    audioElement.__fadeRaf = requestAnimationFrame(step);
}

// 内部工具：取消任何正在进行的 fade RAF，防止旧 fade 把新播放的 volume 拉回 0/暂停
function __cancelFade(audio) {
    if (!audio) return;
    if (audio.__fadeRaf) {
        cancelAnimationFrame(audio.__fadeRaf);
        audio.__fadeRaf = null;
    }
    if (audio.fadeInterval) {
        clearInterval(audio.fadeInterval);
        audio.fadeInterval = null;
    }
}

// 播放单次音频
function playAudioOnce(key) {
    const audio = audioConfig[key];
    if (audio && !audioPlayed[key]) {
        // 关键修复：先取消可能残留的旧 fade（旧的 fadeOut RAF 会把 volume 重新拉回 0 并 pause，导致音效"不出现"）
        __cancelFade(audio);
        audio.currentTime = 0;
        audio.volume = 1;
        audio.play().catch(e => console.log(`音频 ${key} 播放拦截:`, e));
        audioPlayed[key] = true;
    }
}

// 播放循环音频（可淡入）
function playLoopAudio(key, fadeDuration = 500) {
    const audio = audioConfig[key];
    if (!audio) return;
    // 关键修复：取消旧的 fade，避免新淡入和旧淡出竞态
    __cancelFade(audio);
    if (audio.paused) {
        audio.volume = 0;
        audio.play().then(() => {
            fadeAudio(audio, 1, fadeDuration);
        }).catch(e => console.log(`音频 ${key} 播放拦截:`, e));
    } else {
        // 已经在播但音量被旧 fadeOut 拉低时，恢复到 1
        fadeAudio(audio, 1, fadeDuration);
    }
}

// 停止音频（可淡出）
function stopAudio(key, fadeDuration = 500) {
    const audio = audioConfig[key];
    if (audio && !audio.paused) {
        fadeAudio(audio, 0, fadeDuration);
    }
}

// --- 初始化与预加载 ---
// 缓存绘图坐标（必须在 resizeCanvas 之前声明，避免 TDZ）
let __drawCoordsCache = null;
let __drawCoordsCanvasW = 0, __drawCoordsCanvasH = 0, __drawCoordsImgRatio = 0;

// 性能：限制 devicePixelRatio，避免 retina 屏上 canvas 像素翻 4 倍。
const __renderDpr = Math.min(window.devicePixelRatio || 1, 1);

// === 提示圆环 overlay canvas（性能优化）===
const __hintCanvas = document.createElement('canvas');
__hintCanvas.id = 'oenothera-hint-canvas';
const __oenotheraParent = canvas.parentNode || document.body;
__hintCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
__oenotheraParent.appendChild(__hintCanvas);
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
    } else if (currentState === STATES.IDLE || currentState === STATES.IDLE_RETURNING) {
        renderImage(idleImages[Math.floor(currentIdleFrame)]);
    } else if (currentState === STATES.HOLDING || currentState === STATES.HOLD_AUTO_PLAY || currentState === STATES.REWINDING) {
        renderImage(holdImages[Math.floor(currentHoldFrame)]);
    } else if (currentState === STATES.BUGFLYIN) {
        renderImage(bugFlyinImages[Math.floor(currentBugFlyinFrame)]);
    } else if (currentState === STATES.FINISHED) {
        renderImage(bugFlyinImages[bugFlyinFramesCount - 1]);
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

// 初始化进度条
function initProgressCircle() {
    progressSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    progressSvg.style.position = 'fixed';
    progressSvg.style.pointerEvents = 'none';
    // 设置高 z-index，因为我们是在 oenothera 容器里显示，而 oenothera 容器本身 z-index 已经达到 3000000
    progressSvg.style.zIndex = '3000002'; // Updated
    progressSvg.style.width = '70px';
    progressSvg.style.height = '70px';
    progressSvg.style.transform = 'translate(-50%, -50%) rotate(-90deg)'; 
    progressSvg.style.opacity = '0';
    progressSvg.style.transition = 'opacity 0.2s';
    
    outerBlackCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    outerBlackCircle.setAttribute('cx', '35');
    outerBlackCircle.setAttribute('cy', '35');
    outerBlackCircle.setAttribute('r', progressRadius.toString());
    outerBlackCircle.setAttribute('fill', 'none');
    outerBlackCircle.setAttribute('stroke', 'black');
    outerBlackCircle.setAttribute('stroke-width', '4');
    outerBlackCircle.setAttribute('stroke-linecap', 'round');
    
    progressCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    progressCircle.setAttribute('cx', '35');
    progressCircle.setAttribute('cy', '35');
    progressCircle.setAttribute('r', progressRadius.toString());
    progressCircle.setAttribute('fill', 'none');
    progressCircle.setAttribute('stroke', 'white');
    progressCircle.setAttribute('stroke-width', '3.5');
    progressCircle.setAttribute('stroke-linecap', 'round');
    
    [outerBlackCircle, progressCircle].forEach(circle => {
        circle.setAttribute('stroke-dasharray', progressCircumference.toString());
        circle.setAttribute('stroke-dashoffset', progressCircumference.toString());
    });

    progressSvg.appendChild(outerBlackCircle);
    progressSvg.appendChild(progressCircle);
    
    // 把进度条直接加到 oenothera 容器中，这样它不仅随容器显示/隐藏，而且 z-index 判定更合理
    const oContainer = document.getElementById('oenothera-container');
    if (oContainer) {
        oContainer.appendChild(progressSvg);
    } else {
        document.body.appendChild(progressSvg);
    }
}
initProgressCircle();

// 更新进度条
function updateProgress(ratio) {
    if (!outerBlackCircle || !progressCircle) return;
    const offset = progressCircumference - (ratio * progressCircumference);
    outerBlackCircle.setAttribute('stroke-dashoffset', offset.toString());
    progressCircle.setAttribute('stroke-dashoffset', offset.toString());
}

// 记录鼠标位置（passive）
window.addEventListener('mousemove', (e) => {
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    if (currentState === STATES.HOLDING || currentState === STATES.REWINDING) {
        if (progressSvg) {
            progressSvg.style.left = lastMouseX + 'px';
            progressSvg.style.top = lastMouseY + 'px';
        }
    }
}, { passive: true });

// 长按交互逻辑
function checkInHintArea(x, y) {
    // 注意：canvas.width 现在以 __renderDpr 为缩放系数（不再是 window.devicePixelRatio），
    // 必须用 __renderDpr 还原回 CSS 像素，否则点击位置与提示圈位置错位（在 Retina 上会差 2 倍）。
    const hintX = canvas.width * interactionConfig.hint.x / __renderDpr;
    const hintY = canvas.height * interactionConfig.hint.y / __renderDpr;
    const dist = Math.hypot(x - hintX, y - hintY);
    return dist <= interactionConfig.clickRadius;
}

function startHold(e) {
    if (e.type === 'mousedown' && e.button !== 0) return; // 仅响应左键
    if (currentState !== STATES.IDLE && currentState !== STATES.REWINDING) return;

    let clientX = e.clientX;
    let clientY = e.clientY;
    if (e.type === 'touchstart') {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    }

    if (checkInHintArea(clientX, clientY)) {
        // 不直接进入 HOLDING，而是先进入 IDLE_RETURNING 让其回到首/尾帧
        currentState = STATES.IDLE_RETURNING;
        // 重置淡入淡出参数，为了后续可能用到
        transitionAlpha = 0;
        
        if (progressSvg) {
            progressSvg.style.left = `${clientX}px`;
            progressSvg.style.top = `${clientY}px`;
            // 先不显示进度条，等正式开始 HOLDING 再显示
        }
        
        const cursor = document.getElementById('custom-cursor');
        if (cursor) {
            cursor.classList.remove('ready');
            cursor.classList.remove('inverted');
        }
        cursorHintMode = null;
    }
}

function stopHold() {
    if (currentState === STATES.HOLDING) {
        currentState = STATES.REWINDING;
        if (progressSvg) {
            progressSvg.style.opacity = '0';
        }
    } else if (currentState === STATES.IDLE_RETURNING) {
        // 如果在寻找头尾帧的过程中就松手了，直接回到 IDLE
        currentState = STATES.IDLE;
    }
    // 如果是 HOLD_AUTO_PLAY，松手不影响，继续自动播放
}

// 绑定事件
window.addEventListener('mousedown', startHold);
window.addEventListener('mouseup', stopHold);
window.addEventListener('mouseleave', stopHold);
window.addEventListener('touchstart', (e) => {
    startHold(e);
}, { passive: false });
window.addEventListener('touchend', stopHold);
window.addEventListener('touchcancel', stopHold);

let imagesLoadedCount = 0;
// 预加载生长动画图片
for (let i = 0; i < growFramesCount; i++) {
    const img = new Image();
    img.decoding = 'async';
    img.src = getGrowImagePath(i);
    img.onload = () => {
        imagesLoadedCount++;
        // 修改为：当加载了足够多（比如 50 帧或者整个动画的一半）再开始播放，防止卡顿和跳帧
        if (imagesLoadedCount >= 50 && !animationStarted) {
            renderImage(growImages[0]);
            animationStarted = true;
            
            // 尝试播放背景音和生长的声音（由于浏览器策略，可能需要用户先点击屏幕）
            playLoopAudio('base');
            playAudioOnce('grow');
            
            // 改为分批预加载，避免一次性创建 1700+ 个 Image 对象阻塞主线程导致 grow 阶段帧率下降和音效卡顿
            __scheduleOenotheraDeferredPreload();
            
            lastTime = performance.now();
            requestAnimationFrame(renderLoop);
        }
    };
    growImages[i] = img;
}

// 后面阶段的帧延后加载（按 RAF 分批，避免一次性创建大量 Image 阻塞主线程）
function __scheduleOenotheraDeferredPreload() {
    if (window.__oenotheraDeferredScheduled) return;
    window.__oenotheraDeferredScheduled = true;

    const BATCH_SIZE = 24;
    const queue = [
        { count: idleFramesCount,     getPath: getIdleImagePath,     target: idleImages },
        { count: holdFramesCount,     getPath: getHoldImagePath,     target: holdImages },
        { count: bugFlyinFramesCount, getPath: getBugFlyinImagePath, target: bugFlyinImages }
    ];
    let segIdx = 0;
    let i = 0;
    function pumpBatch() {
        if (segIdx >= queue.length) {
            window.__oenotheraDeferredLoaded = true;
            return;
        }
        const seg = queue[segIdx];
        const end = Math.min(i + BATCH_SIZE, seg.count);
        for (; i < end; i++) {
            const img = new Image();
            img.decoding = 'async';
            img.src = seg.getPath(i);
            seg.target[i] = img;
        }
        if (i >= seg.count) {
            segIdx++;
            i = 0;
        }
        requestAnimationFrame(pumpBatch);
    }
    requestAnimationFrame(pumpBatch);
}

// 兼容保留
function __preloadDeferredOenotheraFrames() {
    __scheduleOenotheraDeferredPreload();
}

// 解决浏览器自动播放限制的兜底方案
window.addEventListener('click', () => {
    if (audioConfig.base && audioConfig.base.paused) {
        playLoopAudio('base');
    }
}, { once: true });

// idle/hold/bugflyin 图片在 grow 启动后延后加载（见 __preloadDeferredOenotheraFrames）

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
function drawHintSpotlight(ctx, timestamp, x, y, fadeAlpha = 1) {
    const { baseRadius, pulseSpeed } = hintCircleConfig;
    const innerRadius = baseRadius * 1.6;
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const outerRadius = Math.hypot(Math.max(x, w - x), Math.max(y, h - y));
    const breath = 0.85 + Math.sin(timestamp * pulseSpeed) * 0.15;
    const darkAlpha = 0.55 * breath * fadeAlpha;

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

// 提示整体淡入淡出状态
let __hintFadeAlpha = 0;
let __hintLastTs = 0;
const __HINT_FADE_DURATION = 420;

// 每个 rAF tick 调用：在 overlay canvas 上绘制 / 清除提示圆环。
function __updateHintOverlay(timestamp) {
    const ts = timestamp || performance.now();
    const dt = __hintLastTs ? Math.min(ts - __hintLastTs, 100) : 16;
    __hintLastTs = ts;

    const wantShow = (currentState === STATES.IDLE);
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
    // 性能优化：仅在视频帧索引变化时重绘底图
    if (img && img.src !== lastRenderedImageSrc) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawImageToCtx(img, 1.0);
        lastRenderedImageSrc = img.src;
    }
    
    // 副作用：提示音状态切换。圆环已搬到 overlay canvas。
    // 关键修复：用标志位守护，避免每个 RAF tick 都触发 play/stop 造成 hint 音效断续
    const wantHint = (currentState === STATES.IDLE);
    if (wantHint && !isHintAudioPlaying) {
        playLoopAudio('hint', 200);
        isHintAudioPlaying = true;
    } else if (!wantHint && isHintAudioPlaying) {
        stopAudio('hint', 200);
        isHintAudioPlaying = false;
    }
}

// 渲染循环
let lastRenderedImageSrc = "";
let lastTime = null;

let transitionAlpha = 0; // 0 表示完全是原状态，1 表示完全是新状态
const transitionSpeed = 0.05; // 渐变速度

function renderLoop(timestamp) {
    if (currentState !== STATES.IDLE && currentState !== STATES.FINISHED) {
        __idlePing(timestamp);
    }
    if (!lastTime) lastTime = timestamp;
    let dt = timestamp - lastTime;
    if (dt > 100) dt = 100;
    lastTime = timestamp;
    
    // 假设视频是 60fps (1000/60 ms 一帧)
    const frameDelta = dt / (1000 / 60);
    
    // 每个 rAF tick 更新 hint overlay（与底图解耦）
    __updateHintOverlay(timestamp);
    
    if (currentState === STATES.GROWING) {
        // 播放生长动画
        currentGrowFrame += frameDelta * 1.0; // 加快播放速度，确保不会因为太慢或丢帧导致播放不全
        
        // 当播到 300 帧时播放 bees 音效
        if (currentGrowFrame >= 300 && !audioPlayed.bees) {
            playAudioOnce('bees');
        }
        
        if (currentGrowFrame >= growFramesCount - 1) {
            currentGrowFrame = growFramesCount - 1;
            console.log("生长动画播放完毕，进入 IDLE 状态。");
            currentState = STATES.IDLE;
            playLoopAudio('idle'); // 开始循环播放 idle 音效
        }
        
        const imgToDraw = growImages[Math.floor(currentGrowFrame)];
        if (imgToDraw && imgToDraw.complete && imgToDraw.src !== lastRenderedImageSrc) {
            renderImage(imgToDraw, timestamp);
            lastRenderedImageSrc = imgToDraw.src;
        } else if (imgToDraw && imgToDraw.complete) {
            renderImage(imgToDraw, timestamp);
        }

    } else if (currentState === STATES.IDLE) {
        // 循环播放 idle 动画
        currentIdleFrame += frameDelta * 1.0; // 60fps 播放（每 1/60s 一帧）
        
        if (currentIdleFrame >= idleFramesCount) {
            currentIdleFrame = 0;
        }
        
        // 从 REWINDING 回到 IDLE 时的平滑过渡
        if (transitionAlpha > 0) {
            transitionAlpha -= transitionSpeed;
            if (transitionAlpha < 0) transitionAlpha = 0;
            
            // 绘制底层的 HOLD 图像 (最后一帧)
            const holdImg = holdImages[Math.floor(currentHoldFrame)];
            if (holdImg) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                drawImageToCtx(holdImg, 1.0);
            }
            
            // 叠加绘制顶层的 IDLE 图像
            const idleImg = idleImages[Math.floor(currentIdleFrame)];
            if (idleImg) {
                drawImageToCtx(idleImg, 1.0 - transitionAlpha);
                // 绘制提示聚光灯 + 圆环
                const hintX = canvas.width * interactionConfig.hint.x;
                const hintY = canvas.height * interactionConfig.hint.y;
                drawHintSpotlight(ctx, timestamp, hintX, hintY, 1);
                drawHintCircle(ctx, timestamp, hintX, hintY, 1);
            }
        } else {
            const imgToDraw = idleImages[Math.floor(currentIdleFrame)];
            if (imgToDraw && imgToDraw.src !== lastRenderedImageSrc) {
                renderImage(imgToDraw, timestamp);
                lastRenderedImageSrc = imgToDraw.src;
            } else if (imgToDraw) {
                renderImage(imgToDraw, timestamp);
            }
        }
        
        syncCursorHint();
        
    } else if (currentState === STATES.IDLE_RETURNING) {
        // 判断当前帧离第一帧（0）近还是最后一帧（idleFramesCount - 1）近
        const midPoint = idleFramesCount / 2;
        const targetFrame = currentIdleFrame < midPoint ? 0 : idleFramesCount - 1;
        
        // 快速回退/前进到目标帧
        const returnSpeed = frameDelta * 2.0; // 回正速度
        
        if (targetFrame === 0) {
            currentIdleFrame -= returnSpeed;
            if (currentIdleFrame <= 0) {
                currentIdleFrame = 0;
                // 到达第一帧，正式进入 HOLDING
                currentState = STATES.HOLDING;
                currentHoldFrame = 0; // 从头开始播
                if (progressSvg) progressSvg.style.opacity = '1';
                
                // 停止 idle 音效，播放 hold 音效
                stopAudio('idle', 300);
                // 重置 hold 音效状态以允许重新播放
                audioPlayed.hold = false; 
                playAudioOnce('hold');
            }
        } else {
            currentIdleFrame += returnSpeed;
            if (currentIdleFrame >= idleFramesCount - 1) {
                currentIdleFrame = idleFramesCount - 1;
                // 到达最后一帧，正式进入 HOLDING
                currentState = STATES.HOLDING;
                currentHoldFrame = 0; // 同样从头开始播 hold
                if (progressSvg) progressSvg.style.opacity = '1';
                
                // 停止 idle 音效，播放 hold 音效
                stopAudio('idle', 300);
                audioPlayed.hold = false;
                playAudioOnce('hold');
            }
        }
        
        // 绘制寻找头尾帧的过程
        const imgToDraw = idleImages[Math.floor(currentIdleFrame)];
        if (imgToDraw && imgToDraw.src !== lastRenderedImageSrc) {
            renderImage(imgToDraw, timestamp);
            lastRenderedImageSrc = imgToDraw.src;
        } else if (imgToDraw) {
            renderImage(imgToDraw, timestamp);
        }

    } else if (currentState === STATES.HOLDING) {
        // 从 IDLE 到 HOLDING 的平滑过渡
        if (transitionAlpha < 1) {
            transitionAlpha += transitionSpeed;
            if (transitionAlpha > 1) transitionAlpha = 1;
        }

        // 播放长按动画
        currentHoldFrame += frameDelta * 1.0; 
        
        // 核心改动：如果播放到了一半（大约301帧），进入自动播放状态
        const halfHoldFrames = holdFramesCount / 2;
        if (currentHoldFrame >= halfHoldFrames) {
            console.log("长按超过一半，进入自动播放状态...");
            currentState = STATES.HOLD_AUTO_PLAY;
            if (progressSvg) progressSvg.style.opacity = '0';
        }
        
        // 进度条在前半段画满 (0 到 1)
        const progressRatio = currentHoldFrame / halfHoldFrames;
        updateProgress(progressRatio);
        
        if (transitionAlpha < 1) {
            // 绘制底层的 IDLE 图像
            const idleImg = idleImages[Math.floor(currentIdleFrame)];
            if (idleImg) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                drawImageToCtx(idleImg, 1.0);
            }
            
            // 叠加绘制顶层的 HOLD 图像
            const holdImg = holdImages[Math.floor(currentHoldFrame)];
            if (holdImg) {
                drawImageToCtx(holdImg, transitionAlpha);
            }
        } else {
            const imgToDraw = holdImages[Math.floor(currentHoldFrame)];
            if (imgToDraw && imgToDraw.src !== lastRenderedImageSrc) {
                renderImage(imgToDraw, timestamp);
                lastRenderedImageSrc = imgToDraw.src;
            } else if (imgToDraw) {
                renderImage(imgToDraw, timestamp);
            }
        }
        
    } else if (currentState === STATES.HOLD_AUTO_PLAY) {
        // 后半段自动播放
        currentHoldFrame += frameDelta * 1.0; 
        
        if (currentHoldFrame >= holdFramesCount - 1) {
            currentHoldFrame = holdFramesCount - 1;
            console.log("hold 自动播放完毕，切换到 bugflyin 动画...");
            currentState = STATES.BUGFLYIN;
            currentBugFlyinFrame = 0;
            
            // 播放 bugflyin 音效
            playAudioOnce('bugflyin');
        }
        
        const imgToDraw = holdImages[Math.floor(currentHoldFrame)];
        if (imgToDraw && imgToDraw.src !== lastRenderedImageSrc) {
            renderImage(imgToDraw, timestamp);
            lastRenderedImageSrc = imgToDraw.src;
        } else if (imgToDraw) {
            renderImage(imgToDraw, timestamp);
        }
        
    } else if (currentState === STATES.REWINDING) {
        // 松手倒放动画
        currentHoldFrame -= frameDelta * 3.0; // 倒放速度设为正放的 3 倍，加快回弹
        
        if (currentHoldFrame <= 0) {
            currentHoldFrame = 0;
            currentState = STATES.IDLE;
            console.log("倒放完毕，恢复 IDLE 状态。");
            
            // 恢复播放 idle 音效，停止 hold 音效
            stopAudio('hold', 300);
            playLoopAudio('idle');
        }
        
        // 更新进度条回退 (按照前半段的比例回退)
        const halfHoldFrames = holdFramesCount / 2;
        const progressRatio = currentHoldFrame / halfHoldFrames;
        updateProgress(progressRatio);
        
        const imgToDraw = holdImages[Math.floor(currentHoldFrame)];
        if (imgToDraw && imgToDraw.src !== lastRenderedImageSrc) {
            renderImage(imgToDraw, timestamp);
            lastRenderedImageSrc = imgToDraw.src;
        } else if (imgToDraw) {
            renderImage(imgToDraw, timestamp);
        }
        
    } else if (currentState === STATES.BUGFLYIN) {
        // 播放飞入动画
        currentBugFlyinFrame += frameDelta * 1.0; 
        
        if (currentBugFlyinFrame >= bugFlyinFramesCount - 1) {
            currentBugFlyinFrame = bugFlyinFramesCount - 1;
            console.log("bugflyin 播放完毕，交互结束。");
            currentState = STATES.FINISHED;

            // 本章节序列帧播放结束：淡出蜜蜂音效
            if (!window.__oenotheraBeesFadedOut) {
                window.__oenotheraBeesFadedOut = true;
                const beesAudio = audioConfig.bees;
                if (beesAudio && !beesAudio.paused) {
                    fadeAudio(beesAudio, 0, 1200);
                }
            }
        }
        
        const imgToDraw = bugFlyinImages[Math.floor(currentBugFlyinFrame)];
        if (imgToDraw && imgToDraw.src !== lastRenderedImageSrc) {
            renderImage(imgToDraw, timestamp);
            lastRenderedImageSrc = imgToDraw.src;
        } else if (imgToDraw) {
            renderImage(imgToDraw, timestamp);
        }
        
    } else if (currentState === STATES.FINISHED) {
        // 交互结束，停留在最后一帧
        const imgToDraw = bugFlyinImages[bugFlyinFramesCount - 1];
        if (imgToDraw && imgToDraw.src !== lastRenderedImageSrc) {
            renderImage(imgToDraw, timestamp);
            lastRenderedImageSrc = imgToDraw.src;
        }
        
        // 发送结束事件供主流程接管
        if (!window.oenotheraFinishedDispatched) {
            window.oenotheraFinishedDispatched = true;
            window.dispatchEvent(new Event('oenotheraFinished'));
        }
    }

    requestAnimationFrame(renderLoop);
}
})();
