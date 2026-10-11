/* 翠卓の物理。単位はメートル・秒。テーブルの +x は右、+y は画面下。 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Billiards = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var STOP_SPEED = 0.02;

  function createTable() {
    return {
      length: 2.24,
      width: 1.12,
      ballR: 0.028575,
      cornerInset: 0.08,
      sideInset: 0.06,
      friction: 0.85,
      railRestitution: 0.75,
      ballRestitution: 0.96,
    };
  }

  function makeBall(id, x, y, table) {
    return {
      id: id,
      x: x,
      y: y,
      vx: 0,
      vy: 0,
      r: table.ballR,
      pocketed: false,
      pocketId: null,
      pocketSeq: 0,
    };
  }

  function createPracticeRack() {
    var table = createTable();
    var gap = table.ballR * 2 + 0.0008;
    var apexX = table.length * 0.7;
    var cy = table.width / 2;
    var rowGap = gap * Math.cos(Math.PI / 6);
    var rows = [
      [1],
      [9, 2],
      [3, 8, 10],
      [11, 4, 5, 12],
      [6, 13, 14, 7, 15],
    ];
    var balls = [makeBall(0, table.length * 0.25, cy, table)];
    rows.forEach(function (row, i) {
      row.forEach(function (id, j) {
        var x = apexX + i * rowGap;
        var y = cy + (j - (row.length - 1) / 2) * gap;
        balls.push(makeBall(id, x, y, table));
      });
    });
    return { table: table, balls: balls, time: 0, pocketSeq: 0 };
  }

  function speedOf(ball) {
    return Math.hypot(ball.vx, ball.vy);
  }

  function isSettled(world) {
    for (var i = 0; i < world.balls.length; i++) {
      var ball = world.balls[i];
      if (!ball.pocketed && speedOf(ball) >= STOP_SPEED) return false;
    }
    return true;
  }

  function horizontalMouth(table, x) {
    return x < table.cornerInset || x > table.length - table.cornerInset || Math.abs(x - table.length / 2) < table.sideInset;
  }

  function verticalMouth(table, y) {
    return y < table.cornerInset || y > table.width - table.cornerInset;
  }

  function nearestPocket(table, x, y) {
    var pockets = [
      ["sw", 0, 0],
      ["se", table.length, 0],
      ["nw", 0, table.width],
      ["ne", table.length, table.width],
      ["s", table.length / 2, 0],
      ["n", table.length / 2, table.width],
    ];
    var bestId = pockets[0][0];
    var bestD = Infinity;
    for (var i = 0; i < pockets.length; i++) {
      var d = Math.hypot(x - pockets[i][1], y - pockets[i][2]);
      if (d < bestD) {
        bestD = d;
        bestId = pockets[i][0];
      }
    }
    return bestId;
  }

  function pocketBall(world, ball, pocketId, events) {
    if (ball.pocketed) return;
    var impact = speedOf(ball);
    ball.pocketed = true;
    ball.pocketId = pocketId;
    ball.vx = 0;
    ball.vy = 0;
    world.pocketSeq += 1;
    ball.pocketSeq = world.pocketSeq;
    events.push({ type: "pocket", id: ball.id, speed: impact });
  }

  function applyFriction(ball, dt, friction) {
    var s = speedOf(ball);
    if (s < STOP_SPEED) {
      ball.vx = 0;
      ball.vy = 0;
      return;
    }
    var next = s - friction * dt;
    if (next <= STOP_SPEED) {
      ball.vx = 0;
      ball.vy = 0;
      return;
    }
    var scale = next / s;
    ball.vx *= scale;
    ball.vy *= scale;
  }

  function collidePair(a, b, restitution, events) {
    if (a.pocketed || b.pocketed) return false;
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var dist = Math.hypot(dx, dy);
    var min = a.r + b.r;
    if (dist > min) return false;
    var nx = 1;
    var ny = 0;
    if (dist > 1e-8) {
      nx = dx / dist;
      ny = dy / dist;
    }
    var rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (dist < min) {
      var overlap = min - dist;
      a.x -= nx * overlap * 0.5;
      a.y -= ny * overlap * 0.5;
      b.x += nx * overlap * 0.5;
      b.y += ny * overlap * 0.5;
    }
    if (rv >= 0) return dist < min;
    var j = (-(1 + restitution) * rv) / 2;
    a.vx -= j * nx;
    a.vy -= j * ny;
    b.vx += j * nx;
    b.vy += j * ny;
    if (events && j > 0.01) events.push({ type: "ball", speed: j, a: a.id, b: b.id });
    return true;
  }

  function resolveRails(world, ball, events) {
    if (ball.pocketed) return;
    var table = world.table;
    var r = ball.r;
    var hitX = ball.x < r || ball.x > table.length - r;
    var hitY = ball.y < r || ball.y > table.width - r;
    if (!hitX && !hitY) return;
    var mouthX = hitX && verticalMouth(table, ball.y);
    var mouthY = hitY && horizontalMouth(table, ball.x);
    if ((hitX && mouthX) || (hitY && mouthY)) {
      pocketBall(world, ball, nearestPocket(table, ball.x, ball.y), events);
      return;
    }
    var rest = table.railRestitution;
    if (hitX) {
      var impactX = Math.abs(ball.vx);
      if (ball.x < r) {
        ball.x = r;
        if (ball.vx < 0) ball.vx = -ball.vx * rest;
      } else {
        ball.x = table.length - r;
        if (ball.vx > 0) ball.vx = -ball.vx * rest;
      }
      if (impactX > 0.05) events.push({ type: "rail", speed: impactX });
    }
    if (hitY) {
      var impactY = Math.abs(ball.vy);
      if (ball.y < r) {
        ball.y = r;
        if (ball.vy < 0) ball.vy = -ball.vy * rest;
      } else {
        ball.y = table.width - r;
        if (ball.vy > 0) ball.vy = -ball.vy * rest;
      }
      if (impactY > 0.05) events.push({ type: "rail", speed: impactY });
    }
  }

  function substep(world, dt, events) {
    var i;
    var j;
    var balls = world.balls;
    for (i = 0; i < balls.length; i++) {
      if (balls[i].pocketed) continue;
      applyFriction(balls[i], dt, world.table.friction);
      balls[i].x += balls[i].vx * dt;
      balls[i].y += balls[i].vy * dt;
    }
    for (i = 0; i < balls.length; i++) resolveRails(world, balls[i], events);
    var live = [];
    for (i = 0; i < balls.length; i++) if (!balls[i].pocketed) live.push(balls[i]);
    for (var pass = 0; pass < 4; pass++) {
      for (i = 0; i < live.length; i++) {
        if (live[i].pocketed) continue;
        for (j = i + 1; j < live.length; j++) {
          if (live[j].pocketed) continue;
          collidePair(live[i], live[j], world.table.ballRestitution, events);
        }
      }
    }
  }

  function stepWorld(world, dt) {
    var events = [];
    var remaining = Math.min(Math.max(dt, 0), 0.5);
    var guard = 0;
    while (remaining > 1e-6 && guard < 400) {
      var maxSpeed = 0.05;
      for (var i = 0; i < world.balls.length; i++) {
        if (!world.balls[i].pocketed) maxSpeed = Math.max(maxSpeed, speedOf(world.balls[i]));
      }
      var hMax = (world.table.ballR * 0.35) / maxSpeed;
      var h = Math.min(remaining, hMax, 1 / 60);
      substep(world, h, events);
      remaining -= h;
      guard += 1;
    }
    world.time += Math.min(Math.max(dt, 0), 0.5) - remaining;
    return events;
  }

  function overlapsAny(world, x, y, ignoreId) {
    for (var i = 0; i < world.balls.length; i++) {
      var ball = world.balls[i];
      if (ball.pocketed || ball.id === ignoreId) continue;
      if (Math.hypot(ball.x - x, ball.y - y) < ball.r + world.table.ballR - 1e-6) return true;
    }
    return false;
  }

  function canPlaceCue(world, x, y) {
    var table = world.table;
    var r = table.ballR;
    if (x < r || y < r || x > table.length - r || y > table.width - r) return false;
    if (horizontalMouth(table, x) && (y < table.cornerInset || y > table.width - table.cornerInset)) return false;
    if (verticalMouth(table, y) && (x < table.cornerInset || x > table.length - table.cornerInset)) return false;
    if (Math.abs(x - table.length / 2) < table.sideInset && (y < r * 2.2 || y > table.width - r * 2.2)) return false;
    return !overlapsAny(world, x, y, 0);
  }

  function placeCue(world, x, y) {
    if (!canPlaceCue(world, x, y)) return false;
    var cue = null;
    for (var i = 0; i < world.balls.length; i++) {
      if (world.balls[i].id === 0) cue = world.balls[i];
    }
    if (!cue) {
      cue = makeBall(0, x, y, world.table);
      world.balls.unshift(cue);
    }
    cue.pocketed = false;
    cue.pocketId = null;
    cue.pocketSeq = 0;
    cue.x = x;
    cue.y = y;
    cue.vx = 0;
    cue.vy = 0;
    return true;
  }

  function strike(ball, angle, speed) {
    ball.vx = Math.cos(angle) * speed;
    ball.vy = Math.sin(angle) * speed;
  }

  function cueOnTable(world) {
    for (var i = 0; i < world.balls.length; i++) {
      if (world.balls[i].id === 0 && !world.balls[i].pocketed) return world.balls[i];
    }
    return null;
  }

  return {
    STOP_SPEED: STOP_SPEED,
    createTable: createTable,
    createPracticeRack: createPracticeRack,
    stepWorld: stepWorld,
    isSettled: isSettled,
    collidePair: collidePair,
    canPlaceCue: canPlaceCue,
    placeCue: placeCue,
    strike: strike,
    cueOnTable: cueOnTable,
    horizontalMouth: horizontalMouth,
    verticalMouth: verticalMouth,
    speedOf: speedOf,
  };
});
