(function () {
  "use strict";

  var COLORS = {
    1: "#f0c93a",
    2: "#2c5fd6",
    3: "#d83b32",
    4: "#6a3d96",
    5: "#e67a22",
    6: "#2e8b4f",
    7: "#7c2f2a",
    8: "#161616",
  };

  var canvas = document.getElementById("table");
  var ctx = canvas.getContext("2d");
  var statusEl = document.getElementById("status");
  var pocketedEl = document.getElementById("pocketed");
  var placeBtn = document.getElementById("placeBtn");
  var practiceBtn = document.getElementById("practiceBtn");
  var matchBtn = document.getElementById("matchBtn");
  var resetBtn = document.getElementById("resetBtn");
  var scoreEl = document.getElementById("score");
  var scoreYou = document.getElementById("scoreYou");
  var scoreCpu = document.getElementById("scoreCpu");
  var eyebrowEl = document.getElementById("eyebrow");
  var hintEl = document.getElementById("hint");
  var muteBtn = document.getElementById("muteBtn");
  var aimLeft = document.getElementById("aimLeft");
  var aimRight = document.getElementById("aimRight");
  var shootBtn = document.getElementById("shootBtn");
  var powerInput = document.getElementById("power");

  var world = Billiards.createPracticeRack();
  var view = null;
  var aim = 0;
  var power = 0.42;
  var placeMode = false;
  var hand = false;
  var mode = "practice";
  var turn = "player";
  var score = { player: 0, cpu: 0 };
  var winner = null;
  var liveShot = null;
  var cpuThink = null;
  var wasMoving = false;
  var drag = null;
  var pointer = null;
  var muted = false;
  var audioCtx = null;
  var noise = makeNoise();
  var trayKey = "";
  var note = "";
  var noteUntil = 0;
  var last = 0;

  try {
    muted = localStorage.getItem("midori-muted") === "1";
  } catch (err) {
    muted = false;
  }

  function ballColor(id) {
    return COLORS[((id - 1) % 8) + 1];
  }

  function makeNoise() {
    var c = document.createElement("canvas");
    c.width = 160;
    c.height = 160;
    var g = c.getContext("2d");
    var img = g.createImageData(160, 160);
    for (var i = 0; i < img.data.length; i += 4) {
      var n = 90 + Math.random() * 70;
      img.data[i] = n * 0.45;
      img.data[i + 1] = n;
      img.data[i + 2] = n * 0.55;
      img.data[i + 3] = 50;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  function setPower(value) {
    power = Math.max(0.01, Math.min(1, value));
    var shown = String(Math.round(power * 100));
    if (powerInput.value !== shown) powerInput.value = shown;
  }

  function flash(text) {
    note = text;
    noteUntil = performance.now() + 1400;
  }

  function cue() {
    return Billiards.cueOnTable(world);
  }

  function playerTurn() {
    return mode === "practice" || (turn === "player" && !winner);
  }

  function canShoot() {
    return playerTurn() && !placeMode && !hand && !!cue() && Billiards.isSettled(world);
  }

  function snapshotPocketed() {
    var before = {};
    for (var i = 0; i < world.balls.length; i++) {
      if (world.balls[i].pocketed && world.balls[i].id !== 0) before[world.balls[i].id] = true;
    }
    return before;
  }

  function takeShot() {
    var ball = cue();
    if (!ball || !canShoot()) return;
    noteUntil = 0;
    if (mode === "match") liveShot = { by: "player", before: snapshotPocketed() };
    Billiards.strike(ball, aim, (0.12 + power * 0.88) * 5.5);
  }

  function freshTable(message) {
    world = Billiards.createPracticeRack();
    aim = 0;
    placeMode = false;
    hand = false;
    drag = null;
    liveShot = null;
    cpuThink = null;
    wasMoving = false;
    trayKey = "reset";
    setPower(0.42);
    flash(message);
    renderTray();
  }

  function resetRack() {
    if (mode === "match") startMatch();
    else freshTable("球を並べ直しました");
  }

  function startPractice() {
    mode = "practice";
    turn = "player";
    winner = null;
    score = { player: 0, cpu: 0 };
    freshTable("練習台です。自由に打てます");
  }

  function startMatch() {
    mode = "match";
    turn = "player";
    winner = null;
    score = { player: 0, cpu: 0 };
    freshTable("あなたのブレイクです。先に8個で勝ちです");
  }

  function tableClear() {
    for (var i = 0; i < world.balls.length; i++) {
      if (world.balls[i].id !== 0 && !world.balls[i].pocketed) return false;
    }
    return true;
  }

  function finishVisit() {
    if (mode !== "match" || !liveShot || winner) return;
    var result = BilliardsCpu.resolveVisit(liveShot.before, world);
    var shooter = liveShot.by;
    liveShot = null;
    cpuThink = null;
    if (!result.scratch) score[shooter] += result.scored;
    var decided = BilliardsCpu.winnerOf(score, tableClear());
    if (decided) {
      winner = decided;
      hand = false;
      placeMode = false;
      flash(decided === "player" ? "あなたの勝ちです" : decided === "cpu" ? "CPUの勝ちです" : "引き分けです");
      return;
    }
    if (result.keepTurn) {
      turn = shooter;
      hand = false;
      placeMode = false;
      flash(shooter === "player" ? "落としました。続けて打てます" : "CPUが続けます");
      return;
    }
    turn = shooter === "player" ? "cpu" : "player";
    if (result.scratch || !cue()) {
      if (turn === "player") {
        hand = true;
        placeMode = true;
        flash("手球は点になりません。置く場所をタップしてください");
      } else {
        hand = false;
        placeMode = false;
        flash("手球は点になりません。CPUが置き直します");
      }
      return;
    }
    hand = false;
    placeMode = false;
    flash(turn === "player" ? "あなたの番です" : "CPUの番です");
  }

  function showSpeed(speed) {
    setPower((speed / 5.5 - 0.12) / 0.88);
  }

  function maybeRunCpu(now) {
    if (mode !== "match" || turn !== "cpu" || winner) return;
    if (!Billiards.isSettled(world) || liveShot) return;
    if (!cue()) {
      if (!cpuThink) {
        if (!BilliardsCpu.placeForCpu(world)) {
          turn = "player";
          hand = true;
          placeMode = true;
          flash("置く場所をタップしてから打ってください");
          return;
        }
        cpuThink = { at: now + 550, shot: null };
      }
      return;
    }
    if (!cpuThink || !cpuThink.shot) {
      if (cpuThink && now < cpuThink.at) return;
      var shot = BilliardsCpu.chooseShot(world, Math.random);
      aim = shot.angle;
      showSpeed(shot.speed);
      cpuThink = { at: now + 700, shot: shot };
      return;
    }
    if (now < cpuThink.at) return;
    var chosen = cpuThink.shot;
    cpuThink = null;
    noteUntil = 0;
    liveShot = { by: "cpu", before: snapshotPocketed() };
    Billiards.strike(cue(), chosen.angle, chosen.speed);
  }

  function togglePlace() {
    if (mode === "match" || hand || !Billiards.isSettled(world) || !cue()) return;
    placeMode = !placeMode;
    drag = null;
  }

  function toggleMute() {
    muted = !muted;
    try {
      localStorage.setItem("midori-muted", muted ? "1" : "0");
    } catch (err) {
      /* 保存できなくても音の切り替え自体は行う */
    }
  }

  function playEvents(events) {
    if (muted || !events.length) return;
    var ball = 0;
    var rail = 0;
    var pocket = false;
    for (var i = 0; i < events.length; i++) {
      if (events[i].type === "ball") ball = Math.max(ball, events[i].speed);
      else if (events[i].type === "rail") rail = Math.max(rail, events[i].speed);
      else if (events[i].type === "pocket") pocket = true;
    }
    if (ball > 0.08) tone(150 + Math.min(ball, 4) * 18, 0.05, Math.min(0.08, ball * 0.015));
    else if (rail > 0.15) tone(90 + Math.min(rail, 3) * 20, 0.04, Math.min(0.05, rail * 0.012));
    if (pocket) tone(70, 0.12, 0.06);
  }

  function tone(freq, dur, gain) {
    var AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === "suspended") audioCtx.resume();
    var t = audioCtx.currentTime;
    var osc = audioCtx.createOscillator();
    var amp = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.55), t + dur);
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(amp);
    amp.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function renderTray() {
    var fallen = world.balls.filter(function (ball) {
      return ball.pocketed && ball.id !== 0;
    });
    fallen.sort(function (a, b) { return a.pocketSeq - b.pocketSeq; });
    var key = fallen.map(function (ball) { return ball.id; }).join(",");
    if (key === trayKey) return;
    trayKey = key;
    pocketedEl.replaceChildren();
    if (!fallen.length) {
      pocketedEl.hidden = true;
      return;
    }
    pocketedEl.hidden = false;
    fallen.forEach(function (ball) {
      var chip = document.createElement("span");
      chip.className = "chip" + (ball.id >= 9 ? " stripe" : "");
      chip.style.setProperty("--ball", ballColor(ball.id));
      chip.textContent = String(ball.id);
      chip.title = ball.id + "番";
      pocketedEl.appendChild(chip);
    });
  }

  function syncControls() {
    var rolling = !Billiards.isSettled(world);
    var shooting = canShoot();
    var cpuPlaying = mode === "match" && turn === "cpu";
    placeBtn.disabled = rolling || hand || mode === "match" || !!winner;
    placeBtn.setAttribute("aria-pressed", placeMode || hand ? "true" : "false");
    placeBtn.textContent = placeMode && !hand ? "打ち方に戻る" : "手球を置く";
    aimLeft.disabled = !shooting;
    aimRight.disabled = !shooting;
    shootBtn.disabled = !shooting;
    powerInput.disabled = rolling || cpuPlaying || !!winner;
    resetBtn.textContent = mode === "match" ? "もう一局" : "並べ直す";
    practiceBtn.setAttribute("aria-pressed", mode === "practice" ? "true" : "false");
    matchBtn.setAttribute("aria-pressed", mode === "match" ? "true" : "false");
    muteBtn.setAttribute("aria-pressed", muted ? "true" : "false");
    muteBtn.textContent = muted ? "音を出す" : "音を消す";
    scoreEl.hidden = mode !== "match";
    var youLabel = "あなた " + score.player;
    var cpuLabel = "CPU " + score.cpu;
    if (scoreYou.textContent !== youLabel) scoreYou.textContent = youLabel;
    if (scoreCpu.textContent !== cpuLabel) scoreCpu.textContent = cpuLabel;
    var eyebrow = mode === "match" ? "VERSUS · FIRST TO 8" : "PRACTICE TABLE";
    if (eyebrowEl.textContent !== eyebrow) eyebrowEl.textContent = eyebrow;
    var hint = mode === "match"
      ? "的球を落とすと続投。手球を落とすと点にならず、相手が手球を置きます。"
      : "手球の後ろを引いて離すと打てます。左右キーで微調整、スペースでも打てます。";
    if (hintEl.textContent !== hint) hintEl.textContent = hint;
  }

  function statusText() {
    if (performance.now() < noteUntil) return note;
    if (winner === "player") return "あなたの勝ちです";
    if (winner === "cpu") return "CPUの勝ちです";
    if (winner === "draw") return "引き分けです";
    if (mode === "match" && turn === "cpu") {
      if (!cue()) return "CPUが手球を置いています";
      return cpuThink && cpuThink.shot ? "CPUが狙っています" : "CPUの番です";
    }
    if (hand) {
      return mode === "match"
        ? "置く場所をタップしてから打ってください"
        : "手球が落ちました。置く場所をタップしてください";
    }
    if (placeMode) return "ラシャをタップして手球を置きます";
    if (!Billiards.isSettled(world)) return "ボールが転がっています";
    if (mode === "match") return "あなたの番です。的球を落とすと続投です";
    return "手球から引いて、離すと打てます";
  }

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = canvas.clientWidth;
    var h = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    computeView();
  }

  function computeView() {
    var cssW = canvas.clientWidth;
    var cssH = canvas.clientHeight;
    var rail = Math.max(16, Math.min(36, Math.min(cssW, cssH) * 0.04));
    var pad = rail + 10;
    var scale = Math.min(
      (cssW - pad * 2) / world.table.length,
      (cssH - pad * 2) / world.table.width
    );
    if (!isFinite(scale) || scale <= 0) scale = 1;
    var tw = world.table.length * scale;
    var th = world.table.width * scale;
    view = {
      scale: scale,
      rail: rail,
      ox: (cssW - tw) / 2,
      oy: (cssH - th) / 2,
      tw: tw,
      th: th,
    };
  }

  function worldFromEvent(event) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left - view.ox) / view.scale,
      y: (event.clientY - rect.top - view.oy) / view.scale,
    };
  }

  function updateAim(point) {
    var ball = cue();
    if (!ball) return;
    var dx = ball.x - point.x;
    var dy = ball.y - point.y;
    var dist = Math.hypot(dx, dy);
    if (dist < 0.008) return;
    aim = Math.atan2(dy, dx);
    setPower((dist - ball.r * 2) / 0.45);
  }

  function aimEnd(ball) {
    var dx = Math.cos(aim);
    var dy = Math.sin(aim);
    var bestT = Infinity;
    var hit = null;
    for (var i = 0; i < world.balls.length; i++) {
      var other = world.balls[i];
      if (other.pocketed || other.id === 0) continue;
      var ox = ball.x - other.x;
      var oy = ball.y - other.y;
      var bq = 2 * (ox * dx + oy * dy);
      var reach = ball.r + other.r;
      var cq = ox * ox + oy * oy - reach * reach;
      var disc = bq * bq - 4 * cq;
      if (disc < 0) continue;
      var t = (-bq - Math.sqrt(disc)) / 2;
      if (t > 0.001 && t < bestT) {
        bestT = t;
        hit = { x: ball.x + dx * t, y: ball.y + dy * t, ball: other };
      }
    }
    var table = world.table;
    var railT = Infinity;
    if (dx > 1e-6) railT = Math.min(railT, (table.length - ball.r - ball.x) / dx);
    if (dx < -1e-6) railT = Math.min(railT, (ball.r - ball.x) / dx);
    if (dy > 1e-6) railT = Math.min(railT, (table.width - ball.r - ball.y) / dy);
    if (dy < -1e-6) railT = Math.min(railT, (ball.r - ball.y) / dy);
    if (!(railT < bestT)) return hit;
    return { x: ball.x + dx * railT, y: ball.y + dy * railT, ball: null };
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawDiamond(x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.lineTo(x + s * 0.72, y);
    ctx.lineTo(x, y + s);
    ctx.lineTo(x - s * 0.72, y);
    ctx.closePath();
    ctx.fill();
  }

  function drawTable() {
    var rail = view.rail;
    var x = view.ox - rail;
    var y = view.oy - rail;
    var w = view.tw + rail * 2;
    var h = view.th + rail * 2;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 16;
    roundRect(x, y, w, h, rail * 0.7);
    var wood = ctx.createLinearGradient(x, y, x + w, y + h);
    wood.addColorStop(0, "#8d5130");
    wood.addColorStop(0.45, "#5a3018");
    wood.addColorStop(1, "#3a1c0e");
    ctx.fillStyle = wood;
    ctx.fill();
    ctx.restore();

    roundRect(x + 5, y + 5, w - 10, h - 10, rail * 0.55);
    ctx.strokeStyle = "rgba(243, 214, 166, 0.35)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.rect(view.ox, view.oy, view.tw, view.th);
    ctx.clip();
    var felt = ctx.createRadialGradient(
      view.ox + view.tw * 0.5,
      view.oy + view.th * 0.32,
      view.th * 0.1,
      view.ox + view.tw * 0.5,
      view.oy + view.th * 0.55,
      view.tw * 0.72
    );
    felt.addColorStop(0, "#239457");
    felt.addColorStop(0.55, "#146b3c");
    felt.addColorStop(1, "#0b4126");
    ctx.fillStyle = felt;
    ctx.fillRect(view.ox, view.oy, view.tw, view.th);
    ctx.globalAlpha = 0.28;
    ctx.drawImage(noise, view.ox, view.oy, view.tw, view.th);
    ctx.globalAlpha = 1;
    var shade = ctx.createRadialGradient(
      view.ox + view.tw * 0.5,
      view.oy + view.th * 0.45,
      view.th * 0.2,
      view.ox + view.tw * 0.5,
      view.oy + view.th * 0.5,
      view.tw * 0.68
    );
    shade.addColorStop(0, "rgba(0,0,0,0)");
    shade.addColorStop(1, "rgba(0,0,0,0.32)");
    ctx.fillStyle = shade;
    ctx.fillRect(view.ox, view.oy, view.tw, view.th);
    ctx.restore();

    drawPockets();
    drawMarks();
  }

  function drawPockets() {
    var spots = [
      [view.ox, view.oy, 1],
      [view.ox + view.tw, view.oy, 1],
      [view.ox, view.oy + view.th, 1],
      [view.ox + view.tw, view.oy + view.th, 1],
      [view.ox + view.tw / 2, view.oy, 0.86],
      [view.ox + view.tw / 2, view.oy + view.th, 0.86],
    ];
    for (var i = 0; i < spots.length; i++) {
      var px = spots[i][0];
      var py = spots[i][1];
      var pr = view.rail * 0.78 * spots[i][2];
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fillStyle = "#e0c48a";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(px, py, pr * 0.74, 0, Math.PI * 2);
      var hole = ctx.createRadialGradient(px - pr * 0.2, py - pr * 0.2, pr * 0.1, px, py, pr * 0.74);
      hole.addColorStop(0, "#2a241f");
      hole.addColorStop(1, "#050403");
      ctx.fillStyle = hole;
      ctx.fill();
    }
  }

  function drawMarks() {
    ctx.strokeStyle = "rgba(243, 230, 207, 0.2)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    var head = view.ox + world.table.length * 0.25 * view.scale;
    ctx.moveTo(head, view.oy);
    ctx.lineTo(head, view.oy + view.th);
    ctx.stroke();
    ctx.fillStyle = "rgba(243, 230, 207, 0.4)";
    [0.25, 0.7].forEach(function (mark) {
      ctx.beginPath();
      ctx.arc(
        view.ox + world.table.length * mark * view.scale,
        view.oy + view.th / 2,
        2.5,
        0,
        Math.PI * 2
      );
      ctx.fill();
    });
    ctx.fillStyle = "rgba(243, 214, 166, 0.7)";
    var s = Math.max(3, view.rail * 0.16);
    [0.25, 0.5, 0.75].forEach(function (mark) {
      drawDiamond(view.ox + view.tw * mark, view.oy - view.rail * 0.48, s);
      drawDiamond(view.ox + view.tw * mark, view.oy + view.th + view.rail * 0.48, s);
    });
    drawDiamond(view.ox - view.rail * 0.48, view.oy + view.th / 2, s);
    drawDiamond(view.ox + view.tw + view.rail * 0.48, view.oy + view.th / 2, s);
  }

  function drawBall(ball) {
    var x = view.ox + ball.x * view.scale;
    var y = view.oy + ball.y * view.scale;
    var r = ball.r * view.scale;
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.ellipse(r * 0.12, r * 0.42, r * 0.82, r * 0.38, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    if (ball.id === 0) {
      var ivory = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
      ivory.addColorStop(0, "#fffaf1");
      ivory.addColorStop(1, "#e6d3ad");
      ctx.fillStyle = ivory;
      ctx.fill();
    } else {
      var color = ballColor(ball.id);
      ctx.fillStyle = ball.id >= 9 ? "#f7f2e8" : color;
      ctx.fill();
      if (ball.id >= 9) {
        ctx.save();
        ctx.clip();
        ctx.fillStyle = color;
        ctx.fillRect(-r, -r, r * 2, r * 0.58);
        ctx.fillRect(-r, r * 0.42, r * 2, r * 0.58);
        ctx.restore();
      }
      ctx.beginPath();
      ctx.fillStyle = "#f7f3ea";
      ctx.arc(0, 0, r * 0.46, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1c140f";
      ctx.font = "700 " + Math.max(8, r * 0.7) + "px \"Zen Kaku Gothic New\", \"Hiragino Sans\", sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(ball.id), 0, r * 0.02);
    }
    ctx.beginPath();
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.arc(-r * 0.32, -r * 0.36, r * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawCue(ball) {
    var back = aim + Math.PI;
    var gap = ball.r + 0.02 + power * 0.24;
    var len = 1.05;
    var x1 = view.ox + (ball.x + Math.cos(back) * gap) * view.scale;
    var y1 = view.oy + (ball.y + Math.sin(back) * gap) * view.scale;
    var x2 = view.ox + (ball.x + Math.cos(back) * (gap + len)) * view.scale;
    var y2 = view.oy + (ball.y + Math.sin(back) * (gap + len)) * view.scale;
    var stick = ctx.createLinearGradient(x1, y1, x2, y2);
    stick.addColorStop(0, "#f2d7a4");
    stick.addColorStop(0.08, "#f7f1e4");
    stick.addColorStop(0.14, "#1d1a17");
    stick.addColorStop(0.2, "#d7a15a");
    stick.addColorStop(1, "#6a3b22");
    ctx.strokeStyle = stick;
    ctx.lineWidth = Math.max(4, ball.r * view.scale * 0.42);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    var end = aimEnd(ball);
    if (!end) return;
    var sx = view.ox + (ball.x + Math.cos(aim) * ball.r) * view.scale;
    var sy = view.oy + (ball.y + Math.sin(aim) * ball.r) * view.scale;
    ctx.setLineDash([4, 7]);
    ctx.strokeStyle = "rgba(243, 230, 207, 0.8)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(view.ox + end.x * view.scale, view.oy + end.y * view.scale);
    ctx.stroke();
    ctx.setLineDash([]);
    if (end.ball) {
      ctx.beginPath();
      ctx.arc(view.ox + end.x * view.scale, view.oy + end.y * view.scale, ball.r * view.scale, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(243, 230, 207, 0.85)";
      ctx.stroke();
    }
  }

  function drawGhost() {
    if (!pointer || (!placeMode && !hand)) return;
    var ok = Billiards.canPlaceCue(world, pointer.x, pointer.y);
    var x = view.ox + pointer.x * view.scale;
    var y = view.oy + pointer.y * view.scale;
    var r = world.table.ballR * view.scale;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = ok ? "rgba(247, 241, 228, 0.45)" : "rgba(196, 64, 48, 0.35)";
    ctx.fill();
    ctx.strokeStyle = ok ? "rgba(247, 241, 228, 0.9)" : "rgba(232, 140, 120, 0.9)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function draw() {
    if (!view) return;
    var dpr = canvas.width / Math.max(1, canvas.clientWidth);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    drawTable();
    for (var i = 0; i < world.balls.length; i++) {
      if (!world.balls[i].pocketed) drawBall(world.balls[i]);
    }
    var ball = cue();
    var preview = mode === "match" && cpuThink && cpuThink.shot;
    if (ball && Billiards.isSettled(world) && !placeMode && !hand && (playerTurn() || preview)) drawCue(ball);
    drawGhost();
  }

  function frame(now) {
    if (!last) last = now;
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!Billiards.isSettled(world)) {
      playEvents(Billiards.stepWorld(world, dt));
      wasMoving = true;
    } else {
      if (wasMoving) {
        wasMoving = false;
        finishVisit();
      }
      if (mode === "practice" && !cue() && !hand) {
        hand = true;
        placeMode = true;
        flash("手球が落ちました。置く場所をタップしてください");
      }
      maybeRunCpu(now);
    }
    var text = statusText();
    if (statusEl.textContent !== text) statusEl.textContent = text;
    syncControls();
    renderTray();
    draw();
    requestAnimationFrame(frame);
  }

  canvas.addEventListener("pointerdown", function (event) {
    if (event.button != null && event.button !== 0) return;
    event.preventDefault();
    pointer = worldFromEvent(event);
    try { canvas.setPointerCapture(event.pointerId); } catch (err) { /* すでに離れている */ }
    if (!playerTurn()) return;
    if (placeMode || hand || !cue()) return;
    if (!Billiards.isSettled(world)) return;
    drag = { id: event.pointerId, sx: event.clientX, sy: event.clientY, moved: false };
  });

  canvas.addEventListener("pointermove", function (event) {
    pointer = worldFromEvent(event);
    if (!drag || drag.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - drag.sx, event.clientY - drag.sy) > 8) drag.moved = true;
    if (drag.moved) updateAim(pointer);
  });

  function release(event) {
    pointer = worldFromEvent(event);
    if (!playerTurn()) {
      drag = null;
      return;
    }
    if (placeMode || hand || !cue()) {
      if (Billiards.placeCue(world, pointer.x, pointer.y)) {
        if (hand) {
          hand = false;
          placeMode = false;
          flash("手球を置きました");
        }
      } else if (placeMode || hand) {
        flash("そこには置けません");
      }
      drag = null;
      return;
    }
    if (drag && drag.id === event.pointerId && drag.moved && power >= 0.04) takeShot();
    drag = null;
  }

  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", function () { drag = null; });
  canvas.addEventListener("contextmenu", function (event) { event.preventDefault(); });

  function bindNudge(button, delta) {
    var timer = 0;
    var delay = 0;
    function stop() {
      clearTimeout(delay);
      clearInterval(timer);
    }
    button.addEventListener("pointerdown", function (event) {
      if (button.disabled) return;
      event.preventDefault();
      aim += delta;
      delay = setTimeout(function () {
        timer = setInterval(function () { aim += delta; }, 40);
      }, 260);
    });
    button.addEventListener("pointerup", stop);
    button.addEventListener("pointerleave", stop);
    button.addEventListener("pointercancel", stop);
  }

  bindNudge(aimLeft, -0.01);
  bindNudge(aimRight, 0.01);
  placeBtn.addEventListener("click", togglePlace);
  practiceBtn.addEventListener("click", function () {
    if (mode !== "practice") startPractice();
  });
  matchBtn.addEventListener("click", function () {
    if (mode !== "match" || winner) startMatch();
  });
  resetBtn.addEventListener("click", resetRack);
  muteBtn.addEventListener("click", toggleMute);
  shootBtn.addEventListener("click", takeShot);
  powerInput.addEventListener("input", function () {
    setPower(Number(powerInput.value) / 100);
  });

  window.addEventListener("keydown", function (event) {
    if (event.target.closest("button, input")) return;
    if (event.code === "ArrowLeft") {
      if (canShoot()) aim -= 0.012;
      event.preventDefault();
    } else if (event.code === "ArrowRight") {
      if (canShoot()) aim += 0.012;
      event.preventDefault();
    } else if (event.code === "ArrowUp") {
      setPower(power + 0.04);
      event.preventDefault();
    } else if (event.code === "ArrowDown") {
      setPower(power - 0.04);
      event.preventDefault();
    } else if (event.code === "Space") {
      takeShot();
      event.preventDefault();
    } else if (event.code === "KeyR") {
      resetRack();
    } else if (event.key === "p" || event.key === "P") {
      togglePlace();
    }
  });

  window.addEventListener("resize", resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas.parentElement);
  resize();
  renderTray();
  syncControls();
  requestAnimationFrame(frame);

  window.Midori = {
    getWorld: function () { return world; },
    getView: function () { return view; },
    getAim: function () { return aim; },
    setAim: function (value) { aim = value; },
    shoot: takeShot,
    reset: resetRack,
    startMatch: startMatch,
    getMatch: function () {
      return { mode: mode, turn: turn, score: { player: score.player, cpu: score.cpu }, winner: winner };
    },
  };
})();
