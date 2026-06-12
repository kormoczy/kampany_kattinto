const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const startMenu = document.getElementById('startMenu');

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    // Számolja újra a játékos pozícióját és méretét, hogy a padlókockákon maradjon
    updatePlayerAnchor();
}
window.addEventListener('resize', resizeCanvas);
// Mutatja a halványított háttérképet, amíg a karakterválasztó menü nyitva van
document.body.classList.add('menu-open');

// Képek betöltése a potyogó tárgyakhoz 
const imgGood = new Image();
imgGood.src = 'penz.png'; 
imgGood.onerror = () => { console.warn('imgGood failed to load: penz.png'); };

const imgBad = new Image();
imgBad.src = 'bomba.png'; 
imgBad.onerror = () => { console.warn('imgBad failed to load: bomba.png'); };

// háttérkép canvas-rajzoláshoz (cover-szerű viselkedés)
const bgImg = new Image();
bgImg.src = 'orszaggyules.png';

// háttér rajzolási metrikák (minden átméretezéskor számolva)
let bgDraw = { x: 0, y: 0, w: 0, h: 0 };

// Horgony a háttérKÉPEN belül (arányszámok a forrásképen)
const IMAGE_ANCHOR_RATIO = { x: 0.5, y: 0.78 };

// Játék változók
// A 'money' helyettesíti a korábbi 'score'-ot (most pénzt gyűjtünk)
let money = 0;
let items = [];
let gameInterval;
let isGameRunning = false;
let isPaused = false;
let isStarting = false; // megakadályozza a gyors ismételt indításokat
let loopRunning = false; // biztosítja, hogy csak egy RAF ciklus fusson
let lastSelectedName = null;
let lastImageFilename = null;

// A főszereplő objektuma
const player = {
    x: 0,
    y: 0,
    // tervezési alap sugár (a vászon méretéhez igazítva lesz)
    baseRadius: 80,
    radius: 80,
    pulse: 0,
    name: "",
    image: new Image() 
};
// Itt tároljuk a képarányhoz tartozó lábhorgony koordinátáit (pixelben), amit az updatePlayerAnchor állít be
player.anchorX = 0;
player.anchorY = 0;

// Horgony pont (a vászonnal relatív) ahol a kis padlók találhatók a háttérképen.
// Kissé lejjebb igazítva, hogy jobban illeszkedjen a képen lévő padlókhoz.
const PLAYER_ANCHOR = { xRatio: 0.5, yRatio: 0.78 };
const PLAYER_MIN_RADIUS = 40;
const PLAYER_MAX_RADIUS = 140;

// Játék indítása (ezt hívják meg a gombok)
function startGame(selectedName, imageFilename) {
    // Megakadályozza a gyors, többszörös indításokat
    if (isGameRunning || isStarting) return;
    isStarting = true;

    console.log("Gomb megnyomva! Indul a játék vele: " + selectedName);

    // Beállítjuk a játékost
    player.name = selectedName;
    player.image.onerror = () => { console.warn('player image failed to load:', imageFilename); };
    player.image.src = imageFilename;
    // A játékos pozicionálása a horgonyzott padlókra és a méret beállítása
    updatePlayerAnchor();

    // --- AZ ÚJ ANIMÁCIÓS INDÍTÁS ---
    // Ezzel szólunk a CSS-nek: eltávolítjuk a menü dim állapotát és teljes háttérre váltunk
    document.body.classList.remove('menu-open');
    document.body.classList.add('game-active');
    // ensure start menu no longer blocks input and overlay is hidden
    try { const startMenuEl = document.getElementById('startMenu'); if (startMenuEl) startMenuEl.style.pointerEvents = 'none'; } catch(e){}
    try { if (menuOverlay) menuOverlay.classList.add('hidden'); } catch(e){}
    isPaused = false;

    money = 0;
    items = [];
    // ensure we don't have duplicate spawn intervals
    try { if (gameInterval) clearInterval(gameInterval); } catch(e){}
    isGameRunning = true;
    // show pause button when a session is running
    if (pauseBtn) pauseBtn.style.display = 'block';

    // clear any previous intervals and start spawn loop after 1s
    try { if (gameInterval) clearInterval(gameInterval); } catch(e){}
    setTimeout(() => {
        gameInterval = setInterval(spawnItem, 1500);
        // allow subsequent starts after initial setup
        isStarting = false;
    }, 1000);

    // Játék motorjának indítása if not already running
    if (!loopRunning) requestAnimationFrame(gameLoop);

    // Start wheel countdown when a game session begins
    wheelEnabled = true;
    nextWheelRemaining = 2 * 60 * 1000; // start 2 minutes
    startWheelRaf();
}

// Keep the player positioned on the artwork's little blocks and scale the radius
function updatePlayerAnchor() {
    // compute radius scaling based on canvas width (keeps proportions across sizes)
    const scale = canvas.width / 1366; // 1366 is a reasonable design baseline
    const newRadius = Math.round(player.baseRadius * scale);
    player.radius = Math.max(PLAYER_MIN_RADIUS, Math.min(PLAYER_MAX_RADIUS, newRadius));

    // Compute how we are drawing the background image with `cover` behavior onto the canvas
    // so we can map the anchor point inside the IMAGE to canvas pixels.
    if (bgImg.complete && bgImg.naturalWidth) {
        const imgW = bgImg.naturalWidth;
        const imgH = bgImg.naturalHeight;
        const canvasW = canvas.width;
        const canvasH = canvas.height;

        // scale the image to cover the canvas
        const scaleX = canvasW / imgW;
        const scaleY = canvasH / imgH;
        const scaleCover = Math.max(scaleX, scaleY);
        const drawW = Math.round(imgW * scaleCover);
        const drawH = Math.round(imgH * scaleCover);
        const drawX = Math.round((canvasW - drawW) / 2);
        const drawY = Math.round((canvasH - drawH) / 2);

        bgDraw.x = drawX; bgDraw.y = drawY; bgDraw.w = drawW; bgDraw.h = drawH;

        // compute anchor inside the image then map to canvas coordinates
        const imgAnchorX = Math.round(imgW * IMAGE_ANCHOR_RATIO.x);
        const imgAnchorY = Math.round(imgH * IMAGE_ANCHOR_RATIO.y);
        const ax = Math.round(drawX + imgAnchorX * scaleCover);
        const ay = Math.round(drawY + imgAnchorY * scaleCover);

        player.anchorX = ax;
        player.anchorY = ay;
        player.x = ax; player.y = ay;
    } else {
        // fallback to previous ratio mapping if background not loaded yet
        const ax = Math.round(canvas.width * PLAYER_ANCHOR.xRatio);
        const ay = Math.round(canvas.height * PLAYER_ANCHOR.yRatio);
        player.anchorX = ax; player.anchorY = ay; player.x = ax; player.y = ay;
    }
}
// Call resize once now that helpers and `player` are defined
resizeCanvas();

// Pause / Menu elements (initialized after DOM loaded)
const pauseBtn = document.getElementById('pauseBtn');
const menuOverlay = document.getElementById('menuOverlay');
const btnRestart = document.getElementById('btnRestart');
const btnSettings = document.getElementById('btnSettings');
const btnExit = document.getElementById('btnExit');
const btnContinue = document.getElementById('btnContinue');
const settingsPanel = document.getElementById('settingsPanel');
const mainMenuButtons = document.getElementById('mainMenuButtons');
const btnSettingsBack = document.getElementById('btnSettingsBack');
const volSlider = document.getElementById('volSlider');
const volLabel = document.getElementById('volLabel');

// initialize pause button
// hide pause button by default when page loads (main menu)
try { if (pauseBtn) pauseBtn.style.display = 'none'; } catch(e){}
pauseBtn?.addEventListener('click', () => { togglePause(); });

function togglePause(forceState) {
    const next = typeof forceState === 'boolean' ? forceState : !isPaused;
    isPaused = next;
    if (isPaused) {
        pauseBtn.classList.add('continue');
        pauseBtn.textContent = 'Folytasd';
        if (menuOverlay) menuOverlay.classList.remove('hidden');
        // stop all currently playing sounds
        pauseAllSounds();
    } else {
        pauseBtn.classList.remove('continue');
        pauseBtn.textContent = 'Szünet';
        if (menuOverlay) menuOverlay.classList.add('hidden');
    }
}

function pauseAllSounds() {
    const audios = [spinSound, tickSound, winSound, loseSound, btnPressSound, btnHoverSound];
    for (const a of audios) {
        try { if (a && !a.paused) { a.pause(); a.currentTime = 0; } } catch(e){}
    }
}

// Menu buttons
btnRestart?.addEventListener('click', () => {
    // full restart: reset state and start spawning immediately
    money = 0;
    items = [];
    updatePlayerAnchor();
    // ensure game running
    if (!isGameRunning) isGameRunning = true;
    try { clearInterval(gameInterval); } catch(e){}
    // start spawn loop after brief delay similar to startGame
    setTimeout(() => { gameInterval = setInterval(spawnItem, 1500); }, 1000);
    // close menu and unpause
    // ensure menu is closed and game visuals are active
    try { document.body.classList.remove('menu-open'); } catch(e){}
    try { document.body.classList.add('game-active'); } catch(e){}
    // hide the overlay menu and mark unpaused
    try { if (menuOverlay) menuOverlay.classList.add('hidden'); } catch(e){}
    isPaused = false;
    togglePause(false);
    // ensure pause button visible
    if (pauseBtn) pauseBtn.style.display = 'block';
    // ensure single gameLoop is running
    try { if (!loopRunning) requestAnimationFrame(gameLoop); } catch(e){}

    // ensure start menu no longer blocks input
    try { const startMenuEl = document.getElementById('startMenu'); if (startMenuEl) startMenuEl.style.pointerEvents = 'none'; } catch(e){}
});
btnSettings?.addEventListener('click', () => {
    if (settingsPanel && mainMenuButtons) { mainMenuButtons.classList.add('hidden'); settingsPanel.classList.remove('hidden'); }
});
btnSettingsBack?.addEventListener('click', () => {
    if (settingsPanel && mainMenuButtons) { settingsPanel.classList.add('hidden'); mainMenuButtons.classList.remove('hidden'); }
});
btnExit?.addEventListener('click', () => {
    // exit to start menu
    isGameRunning = false;
    try { clearInterval(gameInterval); } catch(e){}
    document.body.classList.remove('game-active');
    document.body.classList.add('menu-open');
    const startMenuEl = document.getElementById('startMenu');
    if (startMenuEl) startMenuEl.style.pointerEvents = 'auto';
    togglePause(false);
    // hide pause button when not in a session
    if (pauseBtn) pauseBtn.style.display = 'none';
    // stop wheel countdown until a new game starts
    stopWheelRaf();
});

// Continue (resume) button inside the pause menu
btnContinue?.addEventListener('click', () => {
    togglePause(false);
    if (pauseBtn) pauseBtn.style.display = 'block';
});

if (volSlider) {
    volSlider.addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        volLabel.textContent = `${Math.round(v*100)}%`;
        applyVolume(v);
    });
}

// Load the Jersey15 font for canvas text and force a re-layout/draw once available
if (document.fonts && document.fonts.load) {
    document.fonts.load('16px "Jersey15"').then(() => {
        // fonts loaded: re-run resize to recompute anchors and ensure canvas text uses it
        resizeCanvas();
        // if the game is running, draw one frame to pick up the font
        if (isGameRunning) requestAnimationFrame(gameLoop);
    }).catch(() => {
        // ignore font load errors — fallback fonts will be used
    });
}

// ----------------------
// Szerencsekerék logika
// ----------------------
const wheelModal = createSafeElement('#wheelModal');
const wheelImage = createSafeElement('#wheelImage');
const wheelPointer = createSafeElement('#wheelPointer');
const spinBtn = createSafeElement('#spinBtn');
const wheelResult = createSafeElement('#wheelResult');
const closeWheel = createSafeElement('#closeWheel');

// --- Sounds ---
const spinSound = document.getElementById('spinSound');
const tickSound = document.getElementById('tickSound');
const winSound = document.getElementById('winSound');
const loseSound = document.getElementById('loseSound');
const btnPressSound = document.getElementById('btnPressSound');
const btnHoverSound = document.getElementById('btnHoverSound');
const gameOverSound = document.getElementById('gameOverSound');

function applyVolume(v) {
    try { if (spinSound) spinSound.volume = v; } catch(e){}
    try { if (tickSound) tickSound.volume = v; } catch(e){}
    try { if (winSound) winSound.volume = v; } catch(e){}
    try { if (loseSound) loseSound.volume = v; } catch(e){}
    try { if (btnPressSound) btnPressSound.volume = v; } catch(e){}
    try { if (btnHoverSound) btnHoverSound.volume = v; } catch(e){}
}

// --- Confetti ---
const confettiCanvas = document.getElementById('confettiCanvas');
const confettiCtx = confettiCanvas ? confettiCanvas.getContext('2d') : null;
let confettiParticles = [];
let confettiRunning = false;

function resizeConfetti() {
    if (!confettiCanvas) return;
    confettiCanvas.width = window.innerWidth;
    confettiCanvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeConfetti);
resizeConfetti();

function spawnConfetti(amount = 60) {
    if (!confettiCtx) return;
    const w = confettiCanvas.width;
    const h = confettiCanvas.height;
    for (let i=0;i<amount;i++) {
        confettiParticles.push({
            x: w/2 + (Math.random()-0.5)*200,
            y: h/2 + (Math.random()-0.5)*100,
            vx: (Math.random()-0.5)*6,
            vy: - (Math.random()*7 + 2),
            rot: Math.random()*360,
            speed: Math.random()*4+2,
            size: Math.random()*8+6,
            color: `hsl(${Math.floor(Math.random()*360)},80%,60%)`,
            life: 0
        });
    }
    if (!confettiRunning) runConfetti();
}

function runConfetti(){
    confettiRunning = true;
    const loop = () => {
        confettiCtx.clearRect(0,0,confettiCanvas.width, confettiCanvas.height);
        for (let i=confettiParticles.length-1;i>=0;i--) {
            const p = confettiParticles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.2; // gravity
            p.rot += p.vx;
            p.life += 1;
            confettiCtx.save();
            confettiCtx.translate(p.x, p.y);
            confettiCtx.rotate(p.rot * Math.PI/180);
            confettiCtx.fillStyle = p.color;
            confettiCtx.fillRect(-p.size/2, -p.size/2, p.size, p.size*0.6);
            confettiCtx.restore();
            if (p.y > confettiCanvas.height + 50 || p.life > 200) confettiParticles.splice(i,1);
        }
        if (confettiParticles.length > 0) requestAnimationFrame(loop); else confettiRunning = false;
    };
    requestAnimationFrame(loop);
}

// If DOM helper couldn't find element (older browsers), fallback to getElementById
function createSafeElement(selector) {
    try { return document.querySelector(selector); } catch (e) { return null; }
}

// Play button sounds for UI interactions
document.addEventListener('click', (e) => {
    const t = e.target;
    if (t && (t.tagName === 'BUTTON' || t.classList && t.classList.contains('menu-action') || t.id === 'spinBtn' )) {
        try { if (btnPressSound) { btnPressSound.currentTime = 0; btnPressSound.play(); } } catch(e){}
    }
});

document.addEventListener('mouseover', (e) => {
    const t = e.target;
    if (t && (t.tagName === 'BUTTON' || t.classList && t.classList.contains('menu-action') || t.id === 'spinBtn' )) {
        try { if (btnHoverSound) { btnHoverSound.currentTime = 0; btnHoverSound.play(); } } catch(e){}
    }
});

// wheel segments definition (clockwise from top in the artwork). Adjust to match your wheel art.
// Each entry is either a number (Ft) or the special string 'LENULLAZ' to reset money.
const WHEEL_SEGMENTS = [500, -200, 200, 100, -100, 50, 'LENULLAZ', -50, 300, 150, 50, 200];
const WHEEL_COUNT = WHEEL_SEGMENTS.length;

// If the pointer graphic isn't perfectly aligned with the top of the wheel
// you can tweak this offset (degrees). Positive = rotate pointer clockwise.
const POINTER_OFFSET_DEG = 0; // adjust if needed
const POINTER_ANGLE_OFFSET = (POINTER_OFFSET_DEG * Math.PI) / 180;

// Wheel timer state (pause/resume aware)
let wheelEnabled = false; // true when a game session started and timer should run
let nextWheelRemaining = 0; // milliseconds until next wheel
let wheelRafId = null;
let lastWheelTickTime = 0;

let wheelAngle = 0; // current rotation in radians
let spinning = false;
let lastTickSegment = null;

// show next-wheel timer badge
// initial schedule: every 2 minutes, but hide the badge until the FIRST wheel has appeared
let nextWheelAt = Date.now() + 2 * 60 * 1000; // legacy fallback (unused when wheelEnabled active)
let firstWheelShown = false;
const nextWheelBadge = document.createElement('div');
nextWheelBadge.id = 'nextWheelBadge';
document.body.appendChild(nextWheelBadge);
nextWheelBadge.style.display = 'none';

function updateNextWheelBadge() {
    // Only show badge after the first wheel has been shown
    if (!firstWheelShown || !wheelEnabled) {
        nextWheelBadge.style.display = 'none';
        return;
    }
    nextWheelBadge.style.display = 'block';
    // Use remaining ms if available
    const ms = Math.max(0, Math.round(nextWheelRemaining));
    const sec = Math.ceil(ms / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    nextWheelBadge.textContent = `Következő kerék: ${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
setInterval(updateNextWheelBadge, 1000);
updateNextWheelBadge();

// Also show first wheel if you want immediately for testing (comment out in production)
// showWheel();

// Show the wheel modal
function showWheel() {
    const modal = document.getElementById('wheelModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    wheelResult.textContent = '';
    spinBtn.disabled = false;
    // mark first shown and reveal next-wheel badge from now on
    if (!firstWheelShown) {
        firstWheelShown = true;
        // schedule next wheel only if wheel timer is enabled
        if (wheelEnabled) nextWheelRemaining = 2 * 60 * 1000;
    }
    // ensure pause button visibility when wheel shows during a running session
    if (pauseBtn) pauseBtn.style.display = isGameRunning ? 'block' : 'none';
}

function hideWheel() {
    const modal = document.getElementById('wheelModal');
    if (!modal) return;
    modal.classList.add('hidden');
}

// --- Game over handling ---
function checkGameOver() {
    if (money < 0 && isGameRunning) {
        showGameOver();
    }
}

function showGameOver() {
    // stop gameplay
    isGameRunning = false;
    try { if (gameInterval) clearInterval(gameInterval); } catch(e){}
    // pause other sounds and play game over
    pauseAllSounds();
    try { if (gameOverSound) { gameOverSound.currentTime = 0; gameOverSound.play(); } } catch(e){}

    // show overlay
    const ov = document.getElementById('gameOverOverlay');
    if (ov) ov.classList.remove('hidden');
    // hide pause button
    try { if (pauseBtn) pauseBtn.style.display = 'none'; } catch(e){}
    // ensure start menu not blocking
    try { const startMenuEl = document.getElementById('startMenu'); if (startMenuEl) startMenuEl.style.pointerEvents = 'none'; } catch(e){}
}

// Wheel RAF loop: decrease nextWheelRemaining while game is running and not paused
function startWheelRaf() {
    if (wheelRafId) return; // already running
    lastWheelTickTime = performance.now();
    function loop(now) {
        if (!wheelEnabled) { wheelRafId = null; return; }
        if (isGameRunning && !isPaused) {
            const dt = now - lastWheelTickTime;
            nextWheelRemaining = Math.max(0, nextWheelRemaining - dt);
            if (nextWheelRemaining <= 0) {
                // trigger wheel and reset timer
                showWheel();
                firstWheelShown = true;
                nextWheelRemaining = 2 * 60 * 1000;
            }
        }
        lastWheelTickTime = now;
        wheelRafId = requestAnimationFrame(loop);
    }
    wheelRafId = requestAnimationFrame(loop);
}

function stopWheelRaf() {
    wheelEnabled = false;
    if (wheelRafId) { try { cancelAnimationFrame(wheelRafId); } catch(e){} wheelRafId = null; }
}

// Game over buttons
const gameOverRestart = document.getElementById('gameOverRestart');
const gameOverExit = document.getElementById('gameOverExit');

gameOverRestart?.addEventListener('click', () => {
    // hide overlay and restart with last selected if available
    const ov = document.getElementById('gameOverOverlay'); if (ov) ov.classList.add('hidden');
    if (lastSelectedName && lastImageFilename) {
        startGame(lastSelectedName, lastImageFilename);
    } else {
        // fallback: just reset state
        money = 0; items = [];
        isGameRunning = true;
        try { if (!loopRunning) requestAnimationFrame(gameLoop); } catch(e){}
        try { gameInterval = setInterval(spawnItem, 1500); } catch(e){}
    }
});

gameOverExit?.addEventListener('click', () => {
    // hide overlay and go to main menu
    const ov = document.getElementById('gameOverOverlay'); if (ov) ov.classList.add('hidden');
    isGameRunning = false; try { if (gameInterval) clearInterval(gameInterval); } catch(e){}
    pauseAllSounds();
    document.body.classList.remove('game-active');
    document.body.classList.add('menu-open');
    const startMenuEl = document.getElementById('startMenu'); if (startMenuEl) startMenuEl.style.pointerEvents = 'auto';
    // show pause button hidden
    try { if (pauseBtn) pauseBtn.style.display = 'none'; } catch(e){}
    // stop wheel countdown until a new game starts
    stopWheelRaf();
});

closeWheel?.addEventListener('click', hideWheel);

// spin animation
spinBtn?.addEventListener('click', () => {
    if (spinning) return;
    spinBtn.disabled = true;
    spinning = true;
    lastTickSegment = null;
    // play continuous spin loop if available
    try { if (spinSound) { spinSound.loop = true; spinSound.currentTime = 0; spinSound.play(); } } catch(e){}
    // pick segment index randomly weighted equally
    const targetIndex = Math.floor(Math.random() * WHEEL_COUNT);

    // compute target angle so pointer at top selects that segment
    // wheel image is assumed to have segment 0 at top (adjust if different)
    const segmentAngle = (2 * Math.PI) / WHEEL_COUNT;
    // angle to center of target segment
    const targetCenterAngle = targetIndex * segmentAngle + segmentAngle / 2;

    // current wheelAngle is in radians; we want to rotate so that the targetCenterAngle
    // ends up at the top (i.e.  -Math.PI/2), so wheel rotation = desired - current offset
    const topAngle = -Math.PI / 2 + POINTER_ANGLE_OFFSET;
    // compute minimal rotation to reach that, then add extra turns for animation
    const normalizedCurrent = (wheelAngle % (2*Math.PI) + 2*Math.PI) % (2*Math.PI);
    let needed = topAngle - (targetCenterAngle + normalizedCurrent);
    // normalize to [-PI, PI]
    while (needed < -Math.PI) needed += 2*Math.PI;
    while (needed > Math.PI) needed -= 2*Math.PI;

    const extraSpins = 6; // number of full rotations for fun
    const finalRotation = needed + extraSpins * 2 * Math.PI;

    const duration = 4000 + Math.random()*1500; // ms
    const start = performance.now();
    const startAngle = wheelAngle;

    function easeOutCubic(t){ return 1 - Math.pow(1 - t, 3); }

    function frame(now) {
        const t = Math.min(1, (now - start) / duration);
        const eased = easeOutCubic(t);
        wheelAngle = startAngle + finalRotation * eased;
        // apply transform
        const img = document.getElementById('wheelImage');
        if (img) img.style.transform = `rotate(${wheelAngle}rad)`;

        // play tick when crossing segment boundaries
        if (tickSound) {
            const segmentAngle = (2 * Math.PI) / WHEEL_COUNT;
            const landedAngleNow = (-wheelAngle + Math.PI/2 - POINTER_ANGLE_OFFSET) % (2*Math.PI);
            const normNow = (landedAngleNow + 2*Math.PI) % (2*Math.PI);
            const curSeg = Math.floor(normNow / segmentAngle) % WHEEL_COUNT;
            if (lastTickSegment === null) lastTickSegment = curSeg;
            if (curSeg !== lastTickSegment) {
                // play small tick
                try { tickSound.currentTime = 0; tickSound.play(); } catch(e){}
                lastTickSegment = curSeg;
            }
        }

        if (t < 1) {
            requestAnimationFrame(frame);
        } else {
            spinning = false;
            // determine landed segment
            const landedAngle = (-wheelAngle + Math.PI/2 - POINTER_ANGLE_OFFSET) % (2*Math.PI);
            const norm = (landedAngle + 2*Math.PI) % (2*Math.PI);
            const idx = Math.floor(norm / segmentAngle) % WHEEL_COUNT;
            applyWheelOutcome(idx);
            spinBtn.disabled = false;
            // stop spin loop sound
            try { if (spinSound) { spinSound.pause(); spinSound.currentTime = 0; } } catch(e){}
            // if paused state was requested meanwhile, ensure all sounds paused
            if (isPaused) pauseAllSounds();
            // play a final tick for the landed segment
            try { if (tickSound) { tickSound.currentTime = 0; tickSound.play(); } } catch(e){}
            // hide after a short delay
            setTimeout(hideWheel, 3000);
        }
    }
    requestAnimationFrame(frame);
});

function applyWheelOutcome(idx) {
    const out = WHEEL_SEGMENTS[idx];
    if (out === 'LENULLAZ') {
        money = 0;
        wheelResult.textContent = 'LENULLÁZVA! Pénzed: 0 Ft';
        try { if (loseSound) loseSound.play(); } catch(e){}
    } else {
        money += out;
        wheelResult.textContent = `${out > 0 ? '+'+out : out} Ft — Összesen: ${money} Ft`;
        if (out > 0) {
            try { if (winSound) winSound.play(); } catch(e){}
            if (out >= 200) spawnConfetti(100);
            else if (out > 0) spawnConfetti(40);
        } else {
            try { if (loseSound) loseSound.play(); } catch(e){}
        }
    }
    // update canvas scoreboard immediately
    // a frame will update during gameLoop; force a draw if not running
    if (!isGameRunning) {
        // draw one frame visually
        requestAnimationFrame(() => {});
    }
    // check for game over (negative money)
    checkGameOver();
}

// open wheel when user clicks the badge (optional)
nextWheelBadge.addEventListener('click', showWheel);


// Tárgyak generálása
function spawnItem() {
    if (!isGameRunning || isPaused) return;
    const isGood = Math.random() > 0.4; 
    items.push({
        x: Math.random() * (canvas.width - 60) + 30,
        y: -50,
        radius: 30, 
        speed: Math.random() * 3 + 2,
        type: isGood ? 'good' : 'bad'
    });
}

// Kattintás érzékelése
canvas.addEventListener('pointerdown', (e) => {
    if (!isGameRunning || isPaused) return;

    // map pointer coords to canvas coordinate space (handles CSS scaling/offset)
    const rect = canvas.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const clickY = (e.clientY - rect.top) * (canvas.height / rect.height);

    // Főszereplő kattintás (use anchored center and account for pulse so feet stay anchored)
    const currentRadius = player.radius + player.pulse;
    const centerX = player.anchorX;
    const centerY = player.anchorY - currentRadius; // center moves up when pulsing
    const distToPlayer = Math.hypot(clickX - centerX, clickY - centerY);
    if (distToPlayer < currentRadius) {
        money += 1;
        player.pulse = 15; 
    }

    // Tárgyakra kattintás
    for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];
        const distToItem = Math.hypot(clickX - item.x, clickY - item.y);
        
        if (distToItem < item.radius) {
            if (item.type === 'good') {
                money += 5;
            } else {
                money -= 10;
            }
            items.splice(i, 1);
        }
    }
    // check for game over after any money change
    checkGameOver();
});

// A játék fő ciklusa
function gameLoop() {
    if (!isGameRunning) { loopRunning = false; return; }
    loopRunning = true;

    // Csak a canvas területét töröljük (hogy a CSS háttérkép látszódjon alatta)
    // Clear and draw the background image using our computed bgDraw (cover)
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (bgImg.complete && bgImg.naturalWidth) {
        ctx.drawImage(bgImg, bgDraw.x, bgDraw.y, bgDraw.w, bgDraw.h);
    }

    const currentRadius = player.radius + player.pulse;
    const size = currentRadius * 2;
    const centerX = player.anchorX;
    const centerY = player.anchorY - currentRadius; // keep feet anchored when radius changes

    // Főszereplő rajzolása
    if (player.image.complete && player.image.naturalWidth !== 0) {
        ctx.drawImage(player.image, centerX - currentRadius, centerY - currentRadius, size, size);
    } else {
        // Ha hiányzik a PNG fájl, egy szürke kört rajzol helyette
        ctx.beginPath();
        ctx.arc(player.x, player.y, currentRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#95a5a6';
        ctx.fill();
        ctx.closePath();
        
        ctx.fillStyle = '#fff';
        ctx.font = '16px Jersey15, Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Kép hiányzik', centerX, centerY);
    }
    
    // Pulzálás csökkentése (ne mozduljon ha szünet)
    if (!isPaused) {
        if (player.pulse > 0) player.pulse -= 1;
    }

    // Tárgyak rajzolása
    for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];

        // only update physics when not paused
        if (!isPaused) item.y += item.speed;

        const itemSize = item.radius * 2;
        const imgToDraw = item.type === 'good' ? imgGood : imgBad;

        if (imgToDraw.complete && imgToDraw.naturalWidth !== 0) {
            ctx.drawImage(imgToDraw, item.x - item.radius, item.y - item.radius, itemSize, itemSize);
        } else {
            // Ha hiányoznak a tárgyak képei, színes köröket rajzol
            ctx.beginPath();
            ctx.arc(item.x, item.y, item.radius, 0, Math.PI * 2);
            ctx.fillStyle = item.type === 'good' ? '#2ecc71' : '#e74c3c';
            ctx.fill();
            ctx.closePath();
        }

        if (!isPaused && item.y > canvas.height + 50) {
            items.splice(i, 1);
        }
    }

    // Pontszám kiírása (Kapott egy kis árnyékot, hogy olvasható maradjon a Parlament előtt is)
    ctx.fillStyle = '#000';
    ctx.font = 'bold 30px Jersey15, Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`Pénz: ${money}`, 22, 52); 
    ctx.fillStyle = '#fff';
    ctx.fillText(`Pénz: ${money}`, 20, 50); 

    requestAnimationFrame(gameLoop);
}