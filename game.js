(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const startScreen = document.getElementById('startScreen');
  const endScreen = document.getElementById('endScreen');
  const startBtn = document.getElementById('startBtn');
  const restartBtn = document.getElementById('restartBtn');
  const finalScore = document.getElementById('finalScore');

  const W = canvas.width;
  const H = canvas.height;
  const DURATION = 20;

  const img = {
    bun: loadImage('assets/kifli.png'),
    bunCatch: loadImage('assets/kifli_catch.png'),
    sausage: loadImage('assets/virsli.png'),
    pattern: loadImage('assets/regnum_pattern.png')
  };

  const BUN_FRAME = { x: 4, y: 47, w: 792, h: 1964 };
  const BUN_CATCH_FRAME = BUN_FRAME;

  let state = 'start';
  let last = 0;
  let elapsed = 0;
  let spawnTimer = 0;
  let score = 0;
  let combo = 0;
  let dragging = false;
  let pointerOffsetX = 0;
  let targetX = W / 2;
  let leftDown = false;
  let rightDown = false;
  let catchFlash = 0;
  let comboHud = createComboHud();

  const player = {
    x: W / 2,
    w: 96,
    speed: 640,
    dragFollow: 15
  };

  let sausages = [];
  let effects = [];

  function loadImage(src) {
    const image = new Image();
    image.src = src;
    return image;
  }

  function createComboHud() {
    return {
      visible: false,
      value: 0,
      pop: 0,
      popMax: 0.24,
      shake: 0,
      breakPieces: []
    };
  }

  function resetGame() {
    elapsed = 0;
    spawnTimer = 0.12;
    score = 0;
    combo = 0;
    sausages = [];
    effects = [];
    catchFlash = 0;
    comboHud = createComboHud();
    player.x = W / 2;
    targetX = player.x;
    dragging = false;
    state = 'playing';
    last = performance.now();
  }

  function startGame() {
    startScreen.classList.add('hidden');
    endScreen.classList.add('hidden');
    resetGame();
  }

  function endGame() {
    state = 'end';
    finalScore.textContent = String(score);
    fitFinalScore();
    endScreen.classList.remove('hidden');
  }

  function fitFinalScore() {
    const len = String(score).length;
    finalScore.style.fontSize = len >= 4 ? '82px' : len === 3 ? '112px' : '122px';
  }

  function imageAspect(image, fallback) {
    return image.naturalWidth && image.naturalHeight ? image.naturalWidth / image.naturalHeight : fallback;
  }

  function getPlayerMetrics() {
    const drawW = 146;
    const drawH = drawW * (BUN_FRAME.h / BUN_FRAME.w);
    const topY = H - 205;
    return { drawW, drawH, topY, bottomY: topY + drawH };
  }

  function spawnSausage() {
    const t = elapsed / DURATION;
    const h = 160 + Math.random() * 36;
    const w = h * imageAspect(img.sausage, 0.195);
    const laneW = W - 150;
    const startX = 75 + Math.random() * laneW;

    sausages.push({
      x: startX,
      baseX: startX,
      y: -140,
      w,
      h,
      vy: 208 + t * 540 + Math.random() * 165,
      rot: (Math.random() - 0.5) * 0.3,
      spin: (Math.random() - 0.5) * 0.55,
      driftAmp: Math.random() < 0.62 ? 10 + Math.random() * 46 : 0,
      driftSpeed: 2.4 + Math.random() * 3.8,
      phase: Math.random() * Math.PI * 2,
      born: elapsed
    });
  }

  function rectsOverlap(a, b) {
    return Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;
  }

  function multiplier() {
    return Math.min(5, 1 + Math.floor(combo / 6));
  }

  function catchPoints(dxAbs) {
    if (dxAbs <= 18) return { base: 3, label: 'PERFECT' };
    if (dxAbs <= 42) return { base: 2, label: 'GOOD' };
    return { base: 1, label: 'OK' };
  }

  function createCatchText(x, y, text, gained, big = false) {
    effects.push({ type: 'catch', x, y, life: 0.55, max: 0.55, text, points: `+${gained}`, big });
  }

  function showComboHud(value) {
    comboHud.visible = true;
    comboHud.value = value;
    comboHud.pop = comboHud.popMax;
    comboHud.shake = value >= 10 ? 0.18 : 0;
  }

  function breakComboHud() {
    if (!comboHud.visible || comboHud.value <= 0) return;
    const x = W / 2;
    const y = 39;
    const valueText = `${comboHud.value}X`;
    comboHud.breakPieces.push(
      { text: 'COMBO', x: x - 34, y, vx: -115, vy: 20, rot: -0.08, spin: -2.8, life: 0.56, max: 0.56, size: 19, color: '#fff4d8' },
      { text: valueText, x: x + 42, y, vx: 125, vy: 14, rot: 0.08, spin: 3.2, life: 0.56, max: 0.56, size: 31, color: '#f6a723' },
      { text: '✦', x: x + 4, y: y + 1, vx: 0, vy: 45, rot: 0, spin: 5.8, life: 0.42, max: 0.42, size: 18, color: '#f6a723' }
    );
    comboHud.visible = false;
    comboHud.value = 0;
    comboHud.pop = 0;
    comboHud.shake = 0;
  }

  function updateComboHud(dt) {
    comboHud.pop = Math.max(0, comboHud.pop - dt);
    comboHud.shake = Math.max(0, comboHud.shake - dt);

    for (let i = comboHud.breakPieces.length - 1; i >= 0; i--) {
      const piece = comboHud.breakPieces[i];
      piece.life -= dt;
      piece.vy += 980 * dt;
      piece.x += piece.vx * dt;
      piece.y += piece.vy * dt;
      piece.rot += piece.spin * dt;
      if (piece.life <= 0) comboHud.breakPieces.splice(i, 1);
    }
  }

  function update(dt) {
    if (state !== 'playing') return;
    elapsed += dt;
    catchFlash = Math.max(0, catchFlash - dt);
    const remaining = Math.max(0, DURATION - elapsed);
    const metrics = getPlayerMetrics();

    const keyboardDir = (rightDown ? 1 : 0) - (leftDown ? 1 : 0);
    if (keyboardDir !== 0 && !dragging) targetX += keyboardDir * player.speed * dt;
    targetX = clamp(targetX, player.w / 2, W - player.w / 2);

    if (dragging) {
      const follow = 1 - Math.exp(-player.dragFollow * dt);
      player.x += (targetX - player.x) * follow;
    } else {
      player.x = targetX;
    }
    player.x = clamp(player.x, player.w / 2, W - player.w / 2);

    spawnTimer -= dt;
    const t = elapsed / DURATION;
    const interval = Math.max(0.11, 0.61 - t * 0.43);
    if (spawnTimer <= 0) {
      spawnSausage();
      spawnTimer = interval * (0.8 + Math.random() * 0.35);
    }

    const catchBox = { x: player.x, y: metrics.topY + 88, w: player.w * 0.82, h: 52 };

    for (let i = sausages.length - 1; i >= 0; i--) {
      const s = sausages[i];
      s.y += s.vy * dt;
      if (s.driftAmp) s.x = s.baseX + Math.sin((elapsed - s.born) * s.driftSpeed + s.phase) * s.driftAmp;
      s.x = clamp(s.x, s.w / 2 + 10, W - s.w / 2 - 10);
      s.rot += s.spin * dt;

      const sausageBox = { x: s.x, y: s.y, w: s.w * 1.12, h: s.h * 0.86 };
      if (rectsOverlap(catchBox, sausageBox)) {
        const dx = Math.abs(s.x - player.x);
        const result = catchPoints(dx);
        combo += 1;
        showComboHud(combo);
        const mult = multiplier();
        const gained = result.base * mult;
        score += gained;
        catchFlash = 0.16;
        createCatchText(player.x, metrics.topY + 66, `${result.label} ${gained > result.base ? 'x' + mult : ''}`.trim(), gained, result.base === 3);
        sausages.splice(i, 1);
      } else if (s.y - s.h / 2 > H + 50) {
        sausages.splice(i, 1);
        if (combo > 0) breakComboHud();
        combo = 0;
      }
    }

    for (let i = effects.length - 1; i >= 0; i--) {
      effects[i].life -= dt;
      if (effects[i].life <= 0) effects.splice(i, 1);
    }
    updateComboHud(dt);

    if (remaining <= 0) endGame();
  }

  function draw() {
    drawBackground();
    drawSausages();
    drawPlayer();
    drawEffects();
    drawHud();
    requestAnimationFrame(loop);
  }

  function drawBackground() {
    ctx.fillStyle = '#1d1d1b';
    ctx.fillRect(0, 0, W, H);
    if (img.pattern.complete) {
      ctx.save();
      ctx.globalAlpha = 0.65;
      const scale = Math.max(W / img.pattern.naturalWidth, H / img.pattern.naturalHeight);
      const pw = img.pattern.naturalWidth * scale;
      const ph = img.pattern.naturalHeight * scale;
      ctx.drawImage(img.pattern, (W - pw) / 2, (H - ph) / 2, pw, ph);
      ctx.restore();
    }
    ctx.save();
    ctx.globalAlpha = 0.94;
    ctx.fillStyle = '#1d1d1b';
    ctx.fillRect(0, H - 28, W, 28);
    ctx.fillStyle = '#f6a723';
    ctx.fillRect(0, H - 32, W, 4);
    ctx.restore();
  }

  function drawPlayer() {
    const metrics = getPlayerMetrics();
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(player.x, H - 10, player.w * 0.46, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    const activeImage = catchFlash > 0 ? img.bunCatch : img.bun;
    const activeFrame = catchFlash > 0 ? BUN_CATCH_FRAME : BUN_FRAME;
    if (activeImage.complete) {
      ctx.drawImage(
        activeImage,
        activeFrame.x, activeFrame.y, activeFrame.w, activeFrame.h,
        player.x - metrics.drawW / 2, metrics.topY, metrics.drawW, metrics.drawH
      );
    } else {
      ctx.fillStyle = '#d79d45';
      roundRect(player.x - metrics.drawW / 2, metrics.topY, metrics.drawW, metrics.drawH, 36, true);
    }
    ctx.restore();
  }

  function drawSausages() {
    for (const s of sausages) {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rot);
      if (img.sausage.complete) {
        ctx.drawImage(img.sausage, -s.w / 2, -s.h / 2, s.w, s.h);
      } else {
        ctx.fillStyle = '#b85b24';
        roundRect(-s.w / 2, -s.h / 2, s.w, s.h, s.w / 2, true);
      }
      ctx.restore();
    }
  }

  function drawEffects() {
    for (const fx of effects) {
      const p = 1 - fx.life / fx.max;
      ctx.save();
      ctx.globalAlpha = Math.max(0, fx.life / fx.max);
      ctx.translate(fx.x, fx.y - p * 20);
      ctx.textAlign = 'center';
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#1d1d1b';
      ctx.fillStyle = '#fff4d8';
      ctx.font = fx.big ? '1000 27px system-ui, sans-serif' : '900 23px system-ui, sans-serif';
      ctx.strokeText(fx.text, 0, -12);
      ctx.fillText(fx.text, 0, -12);
      ctx.fillStyle = '#f6a723';
      ctx.font = '1000 26px system-ui, sans-serif';
      ctx.strokeText(fx.points, 0, 18);
      ctx.fillText(fx.points, 0, 18);
      ctx.restore();
    }
  }

  function drawHud() {
    const remaining = Math.max(0, Math.ceil(DURATION - elapsed));

    ctx.save();
    ctx.lineWidth = 2;
    ctx.textAlign = 'center';

    ctx.fillStyle = 'rgba(29, 29, 27, .86)';
    ctx.strokeStyle = 'rgba(246,167,35,.62)';

    roundRect(16, 14, 104, 46, 15, true, true);
    ctx.fillStyle = '#f6a723';
    ctx.font = '900 14px system-ui, sans-serif';
    ctx.fillText('IDŐ', 68, 31);
    ctx.font = '1000 24px system-ui, sans-serif';
    ctx.fillText(`${remaining}s`, 68, 52);

    ctx.fillStyle = 'rgba(29, 29, 27, .86)';
    ctx.strokeStyle = 'rgba(246,167,35,.62)';
    roundRect(W - 152, 14, 136, 54, 15, true, true);
    ctx.fillStyle = '#fff4d8';
    ctx.font = '850 14px system-ui, sans-serif';
    ctx.fillText('PONTSZÁM', W - 84, 31);
    ctx.fillStyle = '#f6a723';
    ctx.font = '1000 28px system-ui, sans-serif';
    ctx.fillText(String(score), W - 84, 57);

    drawComboHud();
    ctx.restore();
  }

  function drawComboHud() {
    const x = W / 2;
    const y = 14;

    if (comboHud.visible && comboHud.value > 0) {
      const popP = comboHud.popMax ? comboHud.pop / comboHud.popMax : 0;
      const popScale = 1 + 0.2 * easeOutBack(popP);
      const comboVisual = Math.min(comboHud.value, 15);
      const shakePower = comboVisual >= 10 ? Math.min(9, (comboVisual - 9) * 0.55) : 0;
      const shakeX = shakePower ? Math.sin(elapsed * 68) * shakePower + Math.sin(elapsed * 113 + 1.2) * shakePower * 0.35 : 0;
      const shakeY = shakePower ? Math.cos(elapsed * 76 + 0.4) * shakePower * 0.35 : 0;
      const pulse = comboVisual >= 10 ? 1 + Math.sin(elapsed * 18) * Math.min(0.045, comboVisual * 0.0025) : 1;

      ctx.save();
      ctx.fillStyle = 'rgba(29, 29, 27, .86)';
      ctx.strokeStyle = 'rgba(246,167,35,.62)';
      ctx.lineWidth = 2;
      roundRect(x - 102, y, 204, 54, 15, true, true);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff4d8';
      ctx.font = '900 15px system-ui, sans-serif';
      ctx.fillText('COMBO', x - 28, y + 32);

      ctx.translate(x + 48 + shakeX, y + 35 + shakeY);
      ctx.scale(popScale * pulse, popScale * pulse);
      ctx.fillStyle = '#f6a723';
      ctx.strokeStyle = '#1d1d1b';
      ctx.lineWidth = 5;
      ctx.font = '1000 31px system-ui, sans-serif';
      ctx.strokeText(`${comboHud.value}X`, 0, 0);
      ctx.fillText(`${comboHud.value}X`, 0, 0);
      ctx.restore();
    }

    for (const piece of comboHud.breakPieces) {
      const alpha = Math.max(0, piece.life / piece.max);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(piece.x, piece.y);
      ctx.rotate(piece.rot);
      ctx.textAlign = 'center';
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#1d1d1b';
      ctx.fillStyle = piece.color;
      ctx.font = `1000 ${piece.size}px system-ui, sans-serif`;
      ctx.strokeText(piece.text, 0, 0);
      ctx.fillText(piece.text, 0, 0);
      ctx.restore();
    }
  }

  function easeOutBack(t) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  function roundRect(x, y, w, h, r, fill, stroke = false) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000 || 0);
    last = now;
    update(dt);
    draw();
  }

  function pointerPos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
  }

  function isOnBun(pos) {
    const metrics = getPlayerMetrics();
    return pos.x >= player.x - metrics.drawW / 2 && pos.x <= player.x + metrics.drawW / 2 &&
           pos.y >= metrics.topY && pos.y <= H;
  }

  canvas.addEventListener('pointerdown', e => {
    if (state !== 'playing') return;
    const pos = pointerPos(e);
    if (isOnBun(pos)) {
      dragging = true;
      pointerOffsetX = pos.x - player.x;
      targetX = player.x;
      canvas.setPointerCapture(e.pointerId);
    }
  });

  canvas.addEventListener('pointermove', e => {
    if (!dragging || state !== 'playing') return;
    const pos = pointerPos(e);
    targetX = clamp(pos.x - pointerOffsetX, player.w / 2, W - player.w / 2);
  });

  canvas.addEventListener('pointerup', e => {
    dragging = false;
    targetX = player.x;
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
  });
  canvas.addEventListener('pointercancel', () => { dragging = false; targetX = player.x; });

  window.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') leftDown = true;
    if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') rightDown = true;
  });
  window.addEventListener('keyup', e => {
    if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') leftDown = false;
    if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') rightDown = false;
  });

  startBtn.addEventListener('click', startGame);
  restartBtn.addEventListener('click', startGame);

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  last = performance.now();
  requestAnimationFrame(loop);
})();
