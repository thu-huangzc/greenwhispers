(() => {
const canvas = document.getElementById('bg-canvas');
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

function syncCursorHint(hintConfig) {
    const cursor = document.getElementById('custom-cursor');
    if (!cursor) return;

    const hintX = window.innerWidth * hintConfig.x;
    const hintY = window.innerHeight * hintConfig.y;
    const over = isPointerOverHint(hintX, hintY, interactionConfig.clickRadius);
    const nextMode = over ? 'CLICK' : 'TOUCH';
    if (nextMode !== cursorHintMode) {
        if (nextMode === 'CLICK') setCustomCursorText({ topCn: '', topEn: '', mainText: '点击', bottomText: 'click' });
        else setCustomCursorText({ topCn: '', topEn: '', mainText: '触尘', bottomText: 'touch' });
        cursorHintMode = nextMode;
    }
    cursor.classList.add('ready');
    // 进入热区反色，离开恢复
    cursor.classList.toggle('inverted', over);
}

// --- 状态机定义 ---
const STATES = {
    GROWING: 'GROWING',       // 播放生长动画 (开场)
    SWAYING: 'SWAYING',       // 正常随风摇摆（受鼠标控制）
    RETURNING: 'RETURNING',   // 点击后，无视鼠标，平滑回正到中间帧
    CLOSING: 'CLOSING',       // 播放闭合动画
    CLOSED: 'CLOSED',         // 保持闭合状态（可设置定时器自动展开，或等待再次点击）
    IDLE: 'IDLE',             // 播放待场动画（闭合后循环播放）
    OPENING: 'OPENING',       // 播放展开动画，结束后回到 SWAYING
    CLOSING_2: 'CLOSING_2',   // 播放第二个闭合动画 (点击指定区域触发)
    IDLE_2: 'IDLE_2',         // 播放第二个待场动画 (不循环)
    OPENING_2: 'OPENING_2'    // 播放第二个展开动画 (IDLE_2 播放完毕后自动触发)
};
let currentState = STATES.GROWING; // 初始状态设为 GROWING

let __idlePingLast = 0;
function __idlePing(ts) {
    if (!window.__iconTestRecordActivity) return;
    if (ts - __idlePingLast < 1000) return;
    __idlePingLast = ts;
    window.__iconTestRecordActivity();
}

// --- 摇摆序列帧配置 ---
const swayFramesCount = 241; 
const getSwayImagePath = (index) => {
    const paddedIndex = index.toString().padStart(5, '0');
    return `video-mimosa/mimosa_idle1/mimosa_idle1_${paddedIndex}.jpg`;
};

// --- 生长动画序列帧配置 ---
const growFramesCount = 301; // 实际的生长动画帧数
const getGrowImagePath = (index) => {
    // 假设命名为 mimosa_grow_00000.jpg 这种 5 位补齐的格式，按你的 [#####] 描述
    const paddedIndex = index.toString().padStart(5, '0');
    return `video-mimosa/mimosa_grow/mimosa_grow_${paddedIndex}.jpg`;
};

// --- 闭合与待场动画序列帧配置 ---
const closeFramesCount = 266; // 0-265 共266帧
const idleStartFrame = 160;   // 待场动画起始帧
const idleEndFrame = 265;     // 待场动画结束帧
const getCloseImagePath = (index) => {
    const paddedIndex = index.toString().padStart(5, '0');
    return `video-mimosa/mimosa_close1/mimosa_close1_${paddedIndex}.jpg`;
};

// --- 第二个闭合动画序列帧配置 ---
const close2FramesCount = 144; // 实际的第二个闭合动画帧数
const getClose2ImagePath = (index) => {
    // 假设命名为 mimosa_close2_00000.jpg
    const paddedIndex = index.toString().padStart(5, '0');
    return `video-mimosa/mimosa_close2/mimosa_close2_${paddedIndex}.jpg`;
};

// --- 第二个待场动画序列帧配置 ---
const idle2FramesCount = 302; // 实际的第二个待场动画帧数
const getIdle2ImagePath = (index) => {
    // 假设命名为 mimosa_idle2_00000.jpg
    const paddedIndex = index.toString().padStart(5, '0');
    return `video-mimosa/mimosa_idle2/mimosa_idle2_${paddedIndex}.jpg`;
};

// --- 第二个展开动画序列帧配置 ---
const open2FramesCount = 158; // 实际的展开动画帧数
const getOpen2ImagePath = (index) => {
    // 假设命名为 mimosa_open_00000.jpg
    const paddedIndex = index.toString().padStart(5, '0');
    return `video-mimosa/mimosa_open/mimosa_open_${paddedIndex}.jpg`;
};

// 交互与动画参数
const easeFactor = 0.08;
const returnEaseFactor = 0.05; // 回正时的平滑系数，可以稍微慢一点显得自然
const breathSpeed = 0.005;
const breathAmplitude = 0.01; 
const returnFrameIndex = 152; // 点击后回正的目标帧

// === 叠化过渡帧数配置区 ===
// 你可以在这里统一修改各个动画之间过渡时的“叠化(交叉淡入淡出)”帧数
// 数值越大，叠化时间越长，重影感越强；数值越小，切换越利落；设为 0 则直接硬切无叠化。
const crossfadeFrames = {
    growToSway: 2,       // 从生长(mimosa_grow)过渡到摇摆(frames)
    swayToClose1: 15,     // 从摇摆(frames)进入第一个闭合(close_frames)
    idle1ToClose2: 15,    // 从待场1(idle循环)进入第二个闭合(mimosa_close2)
    close2ToIdle2: 15,    // 从第二个闭合(mimosa_close2)进入待场2(mimosa_idle2)
    idle2ToOpen2: 15,     // 倒放时：从待场2(mimosa_idle2)回到第二个展开
    open1ToSway: 5,       // 从展开1(close_frames倒放)回到摇摆(frames)
    open2ToSway: 5        // 从展开2(mimosa_open)回到摇摆(frames)
};

// === 引导圆环位置与点击区域配置区 ===
// 修改这些数值来调整提示圈的位置和点击触发范围
// 坐标都是以“画面比例”为单位：0.0 代表最左/最上，1.0 代表最右/最下，0.5 代表正中心
const interactionConfig = {
    // 提示圈的基础半径，同时也是点击判定的有效半径（考虑到圆环有呼吸缩放，可以稍微给大一点容错率，比如40-50）
    clickRadius: 50, 
    
    // 第一个提示圈（在摇摆状态下出现，引导进入第一个闭合动画）
    hint1: {
        x: 0.78, // 画面宽度的比例
        y: 0.47  // 画面高度的比例
    },
    // 第二个提示圈（在第一个待场状态下出现，引导进入第二个闭合动画）
    hint2: {
        x: 0.3, // 画面宽度的比例
        y: 0.7  // 画面高度的比例
    }
};

// --- 音频元素 ---
const baseAudio = document.getElementById('baseAudio');
const growAudio = document.getElementById('growAudio');
const closeOpenAudio = document.getElementById('closeOpenAudio');
const idle2Audio = document.getElementById('idle2Audio');
const hintAudio = document.getElementById('hintAudio');

// 通用播放函数，防止被浏览器策略拦截报错，加入淡入效果
function playAudio(audioElement, fadeDuration = 500) {
    if (audioElement && audioElement.paused) {
        audioElement.volume = 0; // 起始音量为0
        audioElement.currentTime = 0;
        
        audioElement.play().then(() => {
            // 成功播放后执行淡入
            fadeAudio(audioElement, 'in', fadeDuration);
        }).catch(e => console.log("音频播放被拦截：", e));
    } else if (audioElement && !audioElement.paused) {
        // 如果正在播放，重置并重新淡入
        audioElement.currentTime = 0;
        fadeAudio(audioElement, 'in', fadeDuration);
    }
}

// 停止音频，加入淡出效果
function stopAudio(audioElement, fadeDuration = 500) {
    if (audioElement && !audioElement.paused) {
        fadeAudio(audioElement, 'out', fadeDuration, () => {
            audioElement.pause();
            audioElement.currentTime = 0;
        });
    }
}

// 音频淡入淡出核心函数（使用 rAF，避免 setInterval 在主线程的不稳定调度）
function fadeAudio(audioElement, direction, duration, callback, maxVolume = 1.0) {
    if (!audioElement) return;
    const targetVolume = direction === 'in' ? maxVolume : 0.0;
    const startVolume = audioElement.volume;
    
    // 取消之前的淡入淡出
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
            if (callback) callback();
        }
    };
    audioElement.__fadeRaf = requestAnimationFrame(step);
}

// 尝试播放背景音乐（需要在第一次交互后，或者某些浏览器允许自动播放）
function ensureBaseAudioPlaying() {
    if (baseAudio && baseAudio.paused) {
        baseAudio.volume = 0;
        baseAudio.play().then(() => {
            fadeAudio(baseAudio, 'in', 1000); // 背景音淡入可以稍微长一点，比如1秒
        }).catch(e => console.log("背景音播放等待用户交互：", e));
    }
}

// 在点击事件里触发一次背景音播放（解决自动播放限制）
window.addEventListener('click', ensureBaseAudioPlaying, { once: true });

// 配置提示圈音频循环
let isHintAudioPlaying = false;
let hintAudioPlaybackRate = 1.0;

// 当提示音加载到元数据时，计算它的时长并调整播放速度以匹配视觉的呼吸周期
if (hintAudio) {
    hintAudio.addEventListener('loadedmetadata', () => {
        // 计算视觉上一个完整周期的时长（秒）
        // 周期 = 2 * PI / pulseSpeed（毫秒），再除以1000转成秒
        const visualCycleDuration = (2 * Math.PI / hintCircleConfig.pulseSpeed) / 1000;
        const audioDuration = hintAudio.duration;
        
        if (audioDuration > 0) {
            // 通过调整 playbackRate（播放速度），让音频时长正好等于视觉周期
            hintAudioPlaybackRate = audioDuration / visualCycleDuration;
            hintAudio.playbackRate = hintAudioPlaybackRate;
        }
        
        // 设置音频循环播放
        hintAudio.loop = true;
    });
}

function updateHintAudioState(shouldPlay) {
    if (!hintAudio) return;
    
    if (shouldPlay && !isHintAudioPlaying) {
        hintAudio.currentTime = 0;
        // 每次播放前确保速度是同步好的
        hintAudio.playbackRate = hintAudioPlaybackRate;
        hintAudio.volume = 0;
        hintAudio.play().then(() => {
            fadeAudio(hintAudio, 'in', 300, undefined, 0.3); // 提示音快速淡入，降低音量
        }).catch(e => console.log("提示音播放被拦截：", e));
        isHintAudioPlaying = true;
    } else if (!shouldPlay && isHintAudioPlaying) {
        fadeAudio(hintAudio, 'out', 300, () => {
            hintAudio.pause();
            hintAudio.currentTime = 0;
        });
        isHintAudioPlaying = false;
    }
}

// 内部变量
let targetFrameIndex = returnFrameIndex; // 默认目标
let lerpedFrameIndex = returnFrameIndex; // 当前平滑到的帧
let currentCloseFrame = 0; // 闭合动画的当前帧进度
let currentGrowFrame = 0; // 生长动画的当前帧进度
let currentClose2Frame = 0; // 第二个闭合动画的当前帧进度
let currentIdle2Frame = 0; // 第二个待场动画的当前帧进度
let currentOpen2Frame = 0; // 第二个展开动画的当前帧进度
let idleDirection = -1; // 待场动画播放方向：-1 表示从 265 往 160，1 表示从 160 往 265

const swayImages = [];
const closeImages = []; // 存放闭合/待场动画图片
const growImages = []; // 存放生长动画图片
const close2Images = []; // 存放第二个闭合动画图片
const idle2Images = []; // 存放第二个待场动画图片
const open2Images = []; // 存放第二个展开动画图片
let imagesLoaded = 0;
let animationStarted = false;

// --- 初始化与预加载 ---
// 缓存绘图坐标，仅在 canvas resize 或图片尺寸变化时重新计算（必须在 resizeCanvas 之前声明，避免 TDZ）
let __drawCoordsCache = null;
let __drawCoordsCanvasW = 0, __drawCoordsCanvasH = 0, __drawCoordsImgRatio = 0;

// 性能：限制 devicePixelRatio，避免 retina 屏上 canvas 像素总量翻 4 倍导致填充率暴涨、GPU/CPU 持续高负载发热。
// 展示机（1080p 60fps）DPR=1，开发机 Retina 上钳到 1 后视觉差异极小，但 drawImage 成本下降到原来的 1/4。
const __renderDpr = Math.min(window.devicePixelRatio || 1, 1);

// === 提示圆环 overlay canvas（性能优化：圆环呼吸动画独立绘制，不再每帧重绘整个底图）===
// 创建一个透明的 overlay canvas 叠加在主 canvas 上方，圆环只画在它上面。
// 这样底层主 canvas 仅在视频帧索引变化时重绘，drawImage 调用次数从每秒 60 次降到与视频帧率一致。
const __hintCanvas = document.createElement('canvas');
__hintCanvas.id = 'mimosa-hint-canvas';
const __mimosaParent = canvas.parentNode || document.body;
__hintCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
__mimosaParent.appendChild(__hintCanvas);
const __hintCtx = __hintCanvas.getContext('2d');

function __syncHintCanvasSize() {
    __hintCanvas.width = canvas.width;
    __hintCanvas.height = canvas.height;
}

function resizeCanvas() {
    canvas.width = window.innerWidth * __renderDpr;
    canvas.height = window.innerHeight * __renderDpr;
    // 关闭图像平滑（序列帧本身尺寸接近输出尺寸，关闭后 drawImage 更快且视觉差异可忽略）
    if (ctx) {
        ctx.imageSmoothingEnabled = false;
    }
    __syncHintCanvasSize();
    
    // 失效绘图坐标缓存
    __drawCoordsCache = null;
    
    // 这里在 resize 的时候 timestamp 可以传入 0 或者当前时间
    const currentTimestamp = performance.now();
    
    // 渲染当前对应的画面
    if (currentState === STATES.GROWING) {
        if (growImages[Math.floor(currentGrowFrame)]) {
            renderImage(growImages[Math.floor(currentGrowFrame)], currentTimestamp);
        }
    } else if (currentState === STATES.CLOSING || currentState === STATES.CLOSED || currentState === STATES.OPENING || currentState === STATES.IDLE) {
        renderImage(closeImages[Math.floor(currentCloseFrame)], currentTimestamp);
    } else if (currentState === STATES.CLOSING_2) {
        if (close2Images[Math.floor(currentClose2Frame)]) {
            renderImage(close2Images[Math.floor(currentClose2Frame)], currentTimestamp);
        }
    } else if (currentState === STATES.IDLE_2) {
        if (idle2Images[Math.floor(currentIdle2Frame)]) {
            renderImage(idle2Images[Math.floor(currentIdle2Frame)], currentTimestamp);
        }
    } else if (currentState === STATES.OPENING_2) {
        if (open2Images[Math.floor(currentOpen2Frame)]) {
            renderImage(open2Images[Math.floor(currentOpen2Frame)], currentTimestamp);
        }
    } else {
        renderImage(swayImages[Math.round(lerpedFrameIndex)], currentTimestamp); 
    }
}
// resize 加 debounce，避免拖动窗口时连续触发重渲染
let __resizeRaf = 0;
window.addEventListener('resize', () => {
    if (__resizeRaf) cancelAnimationFrame(__resizeRaf);
    __resizeRaf = requestAnimationFrame(() => {
        __resizeRaf = 0;
        resizeCanvas();
    });
});
resizeCanvas();

// 预加载生长图片
for (let i = 0; i < growFramesCount; i++) {
    const img = new Image();
    img.decoding = 'async';
    img.src = getGrowImagePath(i);
    // 这里我们将生长动画的加载作为主循环的启动条件之一，或者等全部加载完
    img.onload = () => {
        imagesLoaded++;
        if (imagesLoaded === 1) renderImage(growImages[0]);
        checkStartAnimation();
    };
    growImages[i] = img;
}

// 预加载摇摆图片
for (let i = 0; i < swayFramesCount; i++) {
    const img = new Image();
    img.decoding = 'async';
    img.src = getSwayImagePath(i);
    img.onload = () => {
        imagesLoaded++;
        checkStartAnimation();
    };
    swayImages[i] = img;
}

// 优化：把后续不会立即用到的帧延后加载，避免和 grow/sway 的并发请求争抢带宽
// 等用户进入摇摆状态（grow 完成）后再开始这些预加载
function __preloadDeferredFrames() {
    if (window.__mimosaDeferredLoaded) return;
    window.__mimosaDeferredLoaded = true;
    for (let i = 0; i < close2FramesCount; i++) {
        const img = new Image();
        img.decoding = 'async';
        img.src = getClose2ImagePath(i);
        close2Images[i] = img;
    }
    for (let i = 0; i < idle2FramesCount; i++) {
        const img = new Image();
        img.decoding = 'async';
        img.src = getIdle2ImagePath(i);
        idle2Images[i] = img;
    }
    for (let i = 0; i < open2FramesCount; i++) {
        const img = new Image();
        img.decoding = 'async';
        img.src = getOpen2ImagePath(i);
        open2Images[i] = img;
    }
}

// 当大部分摇摆图加载完毕，启动动画循环
function checkStartAnimation() {
    const totalToLoad = growFramesCount + swayFramesCount;
    if (imagesLoaded > totalToLoad * 0.5 && !animationStarted) {
        animationStarted = true;
        
        // 启动时播放生长动画音效
        if (currentState === STATES.GROWING) {
            playAudio(growAudio);
            ensureBaseAudioPlaying(); // 尝试播放背景音
        }
        
        // 主循环启动后稍微延后再加载后续阶段的帧，避免争抢带宽
        setTimeout(__preloadCloseFrames, 800);
        setTimeout(__preloadDeferredFrames, 1600);
        
        requestAnimationFrame(renderLoop);
    }
}

// 预加载闭合图片（在主流程开始后，等首屏 grow/sway 加载得差不多再启动，避免抢占带宽）
function __preloadCloseFrames() {
    if (window.__mimosaCloseLoaded) return;
    window.__mimosaCloseLoaded = true;
    for (let i = 0; i < closeFramesCount; i++) {
        const img = new Image();
        img.decoding = 'async';
        img.src = getCloseImagePath(i);
        closeImages[i] = img;
    }
}

// --- 鼠标交互（passive） ---
window.addEventListener('mousemove', (e) => {
    // 只有在摇摆状态下，鼠标才起作用
    if (currentState === STATES.SWAYING) {
        const percentage = e.clientX / window.innerWidth;
        targetFrameIndex = percentage * (swayFramesCount - 1);
    }
}, { passive: true });

// --- 点击交互 ---
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
        // 计算点击位置和圆心的距离
        const distance = Math.sqrt(Math.pow(clickX - targetX, 2) + Math.pow(clickY - targetY, 2));
        return distance <= interactionConfig.clickRadius;
    }
    
    // 1. 如果在待场状态 (IDLE) 或 闭合状态 (CLOSED) 点击了第二个圆环区域
    if (currentState === STATES.IDLE || currentState === STATES.CLOSED) {
        if (isClickInsideHint(interactionConfig.hint2)) {
            console.log("点击了第二个指定区域！开始播放第二个闭合动画...");
            currentState = STATES.CLOSING_2;
            currentClose2Frame = 0;
            playAudio(closeOpenAudio); // 播放闭合音效
        }
        return; // 在这两种状态下，无论点没点中圈，都拦截后续逻辑（点其他地方无反应）
    }
    
    // 2. 如果在摇摆状态 (SWAYING) 点击了第一个圆环区域
    if (currentState === STATES.SWAYING && isClickInsideHint(interactionConfig.hint1)) {
        console.log("点击触发！开始回正...");
        currentState = STATES.RETURNING;
        // 将目标帧强制设为指定的回归帧
        targetFrameIndex = returnFrameIndex; 
        // （这里的回正是为了进入 CLOSING，我们把音效放在进入 CLOSING 的那一刻播放，或者在这里播放也可以。这里选择放进去的时候播）
        return;
    }
    
    // 3. 如果在其他可展开状态（不强制要求点在圈内，点任意地方展开，或者你也可以加上判断限制）
    // 注意：上面的 IDLE 和 CLOSED 状态已经被拦截返回了，所以不会执行到这里。
    // 如果后续你增加了其他的待场状态需要点击展开，可以在这里加。
    /* 
    if (currentState === STATES.CLOSED || currentState === STATES.IDLE) {
        // 如果点在了其他地方，触发展开
        console.log("点击触发！开始展开...");
        currentState = STATES.OPENING;
        playAudio(closeOpenAudio); // 播放展开音效
    }
    */
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
    if (alpha !== 1.0) ctx.globalAlpha = 1.0; // 恢复透明度
}

// === 引导圆环样式配置区 ===
const hintCircleConfig = {
    baseRadius: 30,       // 基础半径
    // pulseSpeed 的计算公式：Math.PI * 2 / 周期毫秒数。比如想要 2 秒(2000ms)一个周期，就是 Math.PI * 2 / 2000 ≈ 0.00314
    pulseSpeed: 0.003,    // 呼吸速度（当前约 2.09 秒一个完整的缩放周期）
    whiteLineWidth: 6,    // 白色圆环的粗细（像素）
    blackStrokeWidth: 0.75   // 黑色描边的粗细（像素，1px 约等于 0.75pt）
};

// === 渲染提示圆环（画到 overlay 上）===
function drawHintCircle(ctxLocal, timestamp, x, y) {
    const { baseRadius, pulseSpeed, whiteLineWidth, blackStrokeWidth } = hintCircleConfig;
    
    // 利用 sin 函数生成一个有回弹呼吸感的缩放比例
    const scale = 1 + Math.sin(timestamp * pulseSpeed) * 0.3; 
    const currentRadius = baseRadius * scale;
    const alpha = 0.5 + Math.sin(timestamp * pulseSpeed) * 0.3; // 透明度也跟着呼吸

    ctxLocal.save();
    
    // 1. 画主体的白色圆环
    ctxLocal.beginPath();
    ctxLocal.arc(x, y, currentRadius, 0, Math.PI * 2);
    ctxLocal.lineWidth = whiteLineWidth;
    ctxLocal.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
    ctxLocal.stroke();
    
    // 2. 画外圈黑边
    ctxLocal.beginPath();
    ctxLocal.arc(x, y, currentRadius + (whiteLineWidth / 2), 0, Math.PI * 2);
    ctxLocal.lineWidth = blackStrokeWidth;
    ctxLocal.strokeStyle = `rgba(0, 0, 0, ${alpha})`;
    ctxLocal.stroke();

    // 3. 画内圈黑边
    ctxLocal.beginPath();
    ctxLocal.arc(x, y, currentRadius - (whiteLineWidth / 2), 0, Math.PI * 2);
    ctxLocal.lineWidth = blackStrokeWidth;
    ctxLocal.strokeStyle = `rgba(0, 0, 0, ${alpha})`;
    ctxLocal.stroke();
    
    ctxLocal.restore();
}

// 每个 rAF tick 调用一次：根据 currentState 在 overlay canvas 上绘制 / 清除圆环。
// 此函数只清/画一个小圆环区域，开销极小。
function __updateHintOverlay(timestamp) {
    // 清空 overlay
    __hintCtx.clearRect(0, 0, __hintCanvas.width, __hintCanvas.height);
    
    if ((currentState === STATES.SWAYING || currentState === STATES.RETURNING) && !hasFirstOpenFinished) {
        const hintX = __hintCanvas.width * interactionConfig.hint1.x;
        const hintY = __hintCanvas.height * interactionConfig.hint1.y;
        drawHintCircle(__hintCtx, timestamp, hintX, hintY);
    } else if (currentState === STATES.IDLE) {
        const hintX = __hintCanvas.width * interactionConfig.hint2.x;
        const hintY = __hintCanvas.height * interactionConfig.hint2.y;
        drawHintCircle(__hintCtx, timestamp, hintX, hintY);
    }
    // 其他状态：overlay 保持已清空（已经 clearRect）
}

function renderImage(img, timestamp) {
    // 性能优化：仅在视频帧索引变化时重绘底图（drawImage 是最贵的操作）
    // 副作用（提示音、光标）每次都执行以保证状态实时同步。
    if (img && img.src !== lastRenderedImageSrc) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawImageToCtx(img, 1.0);
        lastRenderedImageSrc = img.src;
    }
    
    // 仅做副作用：根据状态切换提示音、光标、隐藏鼠标等。
    // 圆环本身已经不在这里绘制了（搬到 __updateHintOverlay）。
    if (currentState === STATES.SWAYING || currentState === STATES.RETURNING) {
        if (!hasFirstOpenFinished) {
            updateHintAudioState(true);
            syncCursorHint(interactionConfig.hint1);
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
    else if (currentState === STATES.IDLE) {
        updateHintAudioState(true);
        syncCursorHint(interactionConfig.hint2);
    } 
    else {
        updateHintAudioState(false);
        const cursor = document.getElementById('custom-cursor');
        if (cursor) {
            cursor.classList.remove('ready');
            cursor.classList.remove('inverted');
        }
        cursorHintMode = null;
    }
}

// 全局变量追踪状态
let hasFirstOpenFinished = false; // 追踪第一次展开是否完成

// 渲染循环
let lastRenderedImageSrc = "";
let __mimosaLastTs = 0;
// 序列帧推进速率（单位：视频帧/显示帧）。1.0 = 每个显示器刷新（60Hz 即 1/60s）推进 1 个视频帧。
// 当前为 60fps 播放（每 1/60s 一帧）。
const FRAME_ADVANCE_RATE = 1.0;

function renderLoop(timestamp) {
    // 计算 frameDelta：以 60Hz 为基准，frameDelta=1 表示当前 tick 跨过一个 60fps 帧。
    // 这样无论显示器刷新率/掉帧情况如何，序列帧推进速度都恒定。
    let __dt = __mimosaLastTs ? (timestamp - __mimosaLastTs) : (1000 / 60);
    if (__dt > 100) __dt = 100; // 防止切换标签页等场景下出现巨大跳跃
    __mimosaLastTs = timestamp;
    const frameDelta = __dt / (1000 / 60);
    const frameStep = FRAME_ADVANCE_RATE * frameDelta;

    // 每个 rAF tick 更新 hint overlay（与底图解耦，圆环呼吸不再触发底图重绘）
    __updateHintOverlay(timestamp);

    if (currentState === STATES.GROWING ||
        currentState === STATES.RETURNING ||
        currentState === STATES.CLOSING ||
        currentState === STATES.OPENING ||
        currentState === STATES.CLOSING_2 ||
        currentState === STATES.IDLE_2 ||
        currentState === STATES.OPENING_2) {
        __idlePing(timestamp);
    }
    
    if (currentState === STATES.GROWING) {
        // 播放生长动画
        currentGrowFrame += frameStep; // 控制生长动画播放速度（随 frameDelta 走，保证 60Hz 下以 1/60s 为间隔推进）
        
        if (currentGrowFrame >= growFramesCount - 1) {
            currentGrowFrame = growFramesCount - 1;
            console.log("生长动画播放完毕，进入摇摆状态。");
            currentState = STATES.SWAYING;
            // 确保进入摇摆状态时，目标帧在中间位置（或你想要的起始位置）
            targetFrameIndex = returnFrameIndex; // 回到152帧作为摇摆起点更合适
            lerpedFrameIndex = returnFrameIndex;
        }
        
        const imgToDraw = growImages[Math.floor(currentGrowFrame)];
        
        // 可以在生长的最后阶段做一个更平滑的淡入淡出过渡到摇摆动画
        const fadeFrames = crossfadeFrames.growToSway;
        if (fadeFrames > 0 && currentGrowFrame > growFramesCount - fadeFrames) {
            const alpha = (currentGrowFrame - (growFramesCount - fadeFrames)) / fadeFrames;
            // 采用背景是摇摆帧，前景是生长帧淡出的方式，可能过渡更自然
            const bgImg = swayImages[returnFrameIndex];
            const fgImg = growImages[Math.floor(currentGrowFrame)];
            
            if (bgImg && fgImg && bgImg.complete && fgImg.complete) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                drawImageToCtx(bgImg, 1.0); // 垫底摇摆帧
                drawImageToCtx(fgImg, 1.0 - alpha); // 生长帧渐渐消失
                
                // 确保在最后也能画出提示圆环（因为这个时候相当于即将进入摇摆状态）
                const hintX = canvas.width / 2;
                const hintY = canvas.height / 2;
                drawHintCircle(ctx, timestamp, hintX, hintY);
                
                lastRenderedImageSrc = "crossfade_grow_" + currentGrowFrame;
            }
        } else {
            if (imgToDraw && imgToDraw.complete && imgToDraw.src !== lastRenderedImageSrc) {
                renderImage(imgToDraw, timestamp);
                lastRenderedImageSrc = imgToDraw.src;
            }
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
            // 当当前帧非常接近回归帧时（差值小于0.5），认为回正完毕，切换到闭合动画状态
            if (Math.abs(lerpedFrameIndex - returnFrameIndex) < 0.5) {
                console.log("回正完毕，开始播放闭合动画...");
                currentState = STATES.CLOSING;
                currentCloseFrame = 0; // 重置闭合动画进度
                playAudio(closeOpenAudio); // 播放闭合音效
            }
        }

        // 绘制摇摆帧
        const indexToDraw = Math.round(finalFrame);
        const imgToDraw = swayImages[indexToDraw];
        if (imgToDraw && imgToDraw.src !== lastRenderedImageSrc) {
            renderImage(imgToDraw, timestamp);
            lastRenderedImageSrc = imgToDraw.src;
        } else if (imgToDraw) {
            // 即使图片没变，也要一直调用 renderImage 来更新圆环动画
            renderImage(imgToDraw, timestamp);
        }

    } else if (currentState === STATES.CLOSING) {
        // 播放闭合动画：每帧进度增加
        currentCloseFrame += frameStep;
        
        // 当闭合动画播放到待场结束帧时，直接进入待场循环状态
        if (currentCloseFrame >= idleEndFrame) {
            currentCloseFrame = idleEndFrame;
            console.log("闭合动画到达待场边界，进入待场循环。");
            currentState = STATES.IDLE;
            idleDirection = -1; // 刚进入待场时，先从 265 往 160 播（倒放）
        }
        
        const imgToDraw = closeImages[Math.floor(currentCloseFrame)];
        
        // 前面几帧进行平滑淡入，减少突变感
        const fadeFrames = crossfadeFrames.swayToClose1;
        if (fadeFrames > 0 && currentCloseFrame < fadeFrames) {
            const alpha = currentCloseFrame / fadeFrames;
            const bgImg = swayImages[returnFrameIndex];
            
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            drawImageToCtx(bgImg, 1.0);
            drawImageToCtx(imgToDraw, alpha);
            lastRenderedImageSrc = "crossfade_close_" + currentCloseFrame;
        } else {
            if (imgToDraw && imgToDraw.src !== lastRenderedImageSrc) {
                renderImage(imgToDraw, timestamp);
                lastRenderedImageSrc = imgToDraw.src;
            } else if (imgToDraw) {
                renderImage(imgToDraw, timestamp);
            }
        }

    } else if (currentState === STATES.IDLE) {
        // 在 close_frames 的 160 到 265 之间往复循环播放，加入首尾的缓冲平滑
        // 计算当前帧距离端点（160或265）的距离，如果靠近端点，减慢播放速度，形成"呼吸感"的缓动
        let distanceToEdge = Math.min(Math.abs(currentCloseFrame - idleStartFrame), Math.abs(currentCloseFrame - idleEndFrame));
        // 当距离端点小于 20 帧时，开始减速。最低速度为原来的 0.25 倍。
        let speedMultiplier = 1.0;
        if (distanceToEdge < 20) {
            speedMultiplier = 0.25 + (distanceToEdge / 20) * 0.75;
        }
        
        currentCloseFrame += (frameStep * speedMultiplier) * idleDirection;
        
        // 如果到了 160，掉头往 265 播
        if (currentCloseFrame <= idleStartFrame) {
            currentCloseFrame = idleStartFrame;
            idleDirection = 1;
        } 
        // 如果到了 265，掉头往 160 播
        else if (currentCloseFrame >= idleEndFrame) {
            currentCloseFrame = idleEndFrame;
            idleDirection = -1;
        }
        
        const imgToDraw = closeImages[Math.floor(currentCloseFrame)];
        if (imgToDraw && imgToDraw.src !== lastRenderedImageSrc) {
            renderImage(imgToDraw, timestamp);
            lastRenderedImageSrc = imgToDraw.src;
        } else if (imgToDraw) {
            renderImage(imgToDraw, timestamp);
        }

    } else if (currentState === STATES.CLOSING_2) {
        // 播放第二个闭合动画
        currentClose2Frame += frameStep; // 控制播放速度
        
        if (currentClose2Frame >= close2FramesCount - 1) {
            currentClose2Frame = close2FramesCount - 1;
            console.log("第二个闭合动画播放完毕，进入第二个待场循环。");
            // 切换到第二个待场循环状态
            if (idle2Images.length > 0 && idle2Images[0].complete) {
                currentState = STATES.IDLE_2;
                currentIdle2Frame = 0;
                
                // --- 播放音频 ---
                playAudio(idle2Audio);
            }
        }
        
        const imgToDraw = close2Images[Math.floor(currentClose2Frame)];
        
        // 刚切过来时的前面几帧做一个淡入过渡（从原待场循环当前帧淡入）
        const inFadeFrames = crossfadeFrames.idle1ToClose2;
        const outFadeFrames = crossfadeFrames.close2ToIdle2;
        
        if (inFadeFrames > 0 && currentClose2Frame < inFadeFrames && closeImages[Math.floor(currentCloseFrame)]) {
            const alpha = currentClose2Frame / inFadeFrames;
            const bgImg = closeImages[Math.floor(currentCloseFrame)];
            
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            drawImageToCtx(bgImg, 1.0);
            drawImageToCtx(imgToDraw, alpha);
            lastRenderedImageSrc = "crossfade_close2_" + currentClose2Frame;
        } 
        // 在 CLOSING_2 的最后几帧淡入 IDLE_2 的第 0 帧
        else if (outFadeFrames > 0 && currentClose2Frame > close2FramesCount - outFadeFrames && idle2Images.length > 0 && idle2Images[0].complete) {
            const alpha = (close2FramesCount - currentClose2Frame) / outFadeFrames; // alpha从1降到0
            const idle2Img = idle2Images[0];
            
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            drawImageToCtx(idle2Img, 1.0);       // IDLE_2 底图
            drawImageToCtx(imgToDraw, alpha);   // CLOSING_2 淡出
            lastRenderedImageSrc = "crossfade_close2_to_idle2_" + currentClose2Frame;
        } else {
            if (imgToDraw && imgToDraw.complete && imgToDraw.src !== lastRenderedImageSrc) {
                renderImage(imgToDraw, timestamp);
                lastRenderedImageSrc = imgToDraw.src;
            } else if (imgToDraw) {
                renderImage(imgToDraw, timestamp);
            }
        }

    } else if (currentState === STATES.IDLE_2) {
        // 播放第二个待场动画（不循环，播完进入展开）
        currentIdle2Frame += frameStep; 
        
        if (currentIdle2Frame >= idle2FramesCount - 1) {
            currentIdle2Frame = idle2FramesCount - 1;
            console.log("第二个待场动画播放完毕，进入第二个展开动画。");
            currentState = STATES.OPENING_2;
            currentOpen2Frame = 0;
            
            // --- 播放展开音效 ---
            playAudio(closeOpenAudio);
            
            // --- 停止音频（如果需要） ---
            // 如果你希望在进入 OPENING_2 的时候停止音频播放，可以解除这里的注释
            // stopAudio(idle2Audio);
        }
        
        const imgToDraw = idle2Images[Math.floor(currentIdle2Frame)];
        if (imgToDraw && imgToDraw.complete && imgToDraw.src !== lastRenderedImageSrc) {
            renderImage(imgToDraw, timestamp);
            lastRenderedImageSrc = imgToDraw.src;
        } else if (imgToDraw) {
            renderImage(imgToDraw, timestamp);
        }

    } else if (currentState === STATES.OPENING_2) {
        // 播放第二个展开动画
        currentOpen2Frame += frameStep;
        
        // 如果是在这期间触发了中断，停止音频
        stopAudio(idle2Audio);
        
        if (currentOpen2Frame >= open2FramesCount - 1) {
            currentOpen2Frame = open2FramesCount - 1;
            console.log("第二个展开动画播放完毕，回到摇摆状态。");
            currentState = STATES.SWAYING;
            // 确保进入摇摆状态时，目标帧在指定的回正帧
            targetFrameIndex = returnFrameIndex;
            lerpedFrameIndex = returnFrameIndex;
            
            if (!hasFirstOpenFinished) {
                hasFirstOpenFinished = true;
                window.dispatchEvent(new Event('mimosaFirstOpenFinished'));
            }
        }
        
        const imgToDraw = open2Images[Math.floor(currentOpen2Frame)];
        
        // 最后几帧做一个快速淡入淡出过渡到摇摆动画，减少叠化感
        const fadeFrames = crossfadeFrames.open2ToSway;
        if (fadeFrames > 0 && currentOpen2Frame > open2FramesCount - fadeFrames) {
            const alpha = (currentOpen2Frame - (open2FramesCount - fadeFrames)) / fadeFrames;
            const bgImg = swayImages[returnFrameIndex];
            const fgImg = open2Images[Math.floor(currentOpen2Frame)];
            
            if (bgImg && fgImg && bgImg.complete && fgImg.complete) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                drawImageToCtx(bgImg, 1.0); // 垫底摇摆帧
                drawImageToCtx(fgImg, 1.0 - alpha); // 展开帧快速消失
                lastRenderedImageSrc = "crossfade_open2_to_sway_" + currentOpen2Frame;
            }
        } else {
            if (imgToDraw && imgToDraw.complete && imgToDraw.src !== lastRenderedImageSrc) {
                renderImage(imgToDraw, timestamp);
                lastRenderedImageSrc = imgToDraw.src;
            } else if (imgToDraw) {
                renderImage(imgToDraw, timestamp);
            }
        }

    } else if (currentState === STATES.OPENING) {
        // 播放展开动画
        // 如果刚开始倒放，播放展开音效
        if (currentCloseFrame === idleEndFrame || currentCloseFrame === idleStartFrame || currentCloseFrame === closeFramesCount - 1) {
            playAudio(closeOpenAudio);
        }
        
        // 播放展开动画（倒放第一个闭合序列帧）
        currentCloseFrame -= frameStep; 
        
        // 如果是在这期间触发了中断，停止音频
        stopAudio(idle2Audio);
        
        if (currentCloseFrame <= 0) {
            currentCloseFrame = 0;
            console.log("展开完毕，恢复摇摆状态。");
            currentState = STATES.SWAYING;
            // 把目标帧重置为回正帧，防止突然跳跃
            targetFrameIndex = returnFrameIndex;
            lerpedFrameIndex = returnFrameIndex;
        }
        
        const imgToDraw = closeImages[Math.floor(currentCloseFrame)];
        
        // 我们现在的待场没有独立的 idleImages 数组，它是复用 closeImages 的。
        // 所以我们不需要用 idleImages 来淡入淡出，直接放 closeImages 即可。
        // 展开动画最后几帧进行淡出，平滑回到摇摆状态
        const fadeFrames = crossfadeFrames.open1ToSway;
        if (fadeFrames > 0 && currentCloseFrame < fadeFrames && currentCloseFrame >= 0) {
            const alpha = currentCloseFrame / fadeFrames;
            const bgImg = swayImages[returnFrameIndex];
            
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            drawImageToCtx(bgImg, 1.0); // 垫底摇摆帧
            drawImageToCtx(imgToDraw, alpha); // 闭合倒放的最后几帧快速淡出
            
            // 确保在最后也能画出提示圆环
            const hintX = canvas.width / 2;
            const hintY = canvas.height / 2;
            drawHintCircle(ctx, timestamp, hintX, hintY);
            
            lastRenderedImageSrc = "crossfade_open_" + currentCloseFrame;
        } else if (currentCloseFrame >= fadeFrames) {
            if (imgToDraw && imgToDraw.src !== lastRenderedImageSrc) {
                renderImage(imgToDraw, timestamp);
                lastRenderedImageSrc = imgToDraw.src;
            } else if (imgToDraw) {
                renderImage(imgToDraw, timestamp);
            }
        }
    }

    requestAnimationFrame(renderLoop);
}

})();
