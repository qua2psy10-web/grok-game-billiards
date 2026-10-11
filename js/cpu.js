/* CPUの狙い。候補を少しだけ実際に転がして、落ちる打ち方を選ぶ。 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./physics"));
  else root.BilliardsCpu = factory(root.Billiards);
})(typeof globalThis !== "undefined" ? globalThis : this, function (B) {
  "use strict";

  var WIN_AT = 8;

  function pocketsOf(table) {
    return [
      { id: "sw", x: 0, y: 0 },
      { id: "se", x: table.length, y: 0 },
      { id: "nw", x: 0, y: table.width },
      { id: "ne", x: table.length, y: table.width },
      { id: "s", x: table.length / 2, y: 0 },
      { id: "n", x: table.length / 2, y: table.width },
    ];
  }

  function objectBalls(world) {
    var list = [];
    for (var i = 0; i < world.balls.length; i++) {
      if (world.balls[i].id !== 0 && !world.balls[i].pocketed) list.push(world.balls[i]);
    }
    return list;
  }

  function cloneWorld(world) {
    return JSON.parse(JSON.stringify(world));
  }

  function angleDiff(a, b) {
    var d = Math.abs(a - b) % (Math.PI * 2);
    if (d > Math.PI) d = Math.PI * 2 - d;
    return d;
  }

  function onCloth(table, x, y) {
    var r = table.ballR;
    return x >= r && y >= r && x <= table.length - r && y <= table.width - r;
  }

  function blocked(world, x1, y1, x2, y2, ignore, clearance) {
    var dx = x2 - x1;
    var dy = y2 - y1;
    var len2 = dx * dx + dy * dy;
    if (len2 < 1e-8) return false;
    for (var i = 0; i < world.balls.length; i++) {
      var ball = world.balls[i];
      if (ball.pocketed || ignore[ball.id]) continue;
      var t = ((ball.x - x1) * dx + (ball.y - y1) * dy) / len2;
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
      var px = x1 + dx * t;
      var py = y1 + dy * t;
      if (Math.hypot(ball.x - px, ball.y - py) < ball.r + clearance) return true;
    }
    return false;
  }

  function candidates(world) {
    var cue = B.cueOnTable(world);
    var list = objectBalls(world);
    var found = [];
    if (!cue || !list.length) return found;
    var pockets = pocketsOf(world.table);
    var i;
    var j;
    for (i = 0; i < list.length; i++) {
      var ball = list[i];
      var seen = Math.hypot(ball.x - cue.x, ball.y - cue.y);
      found.push({
        angle: Math.atan2(ball.y - cue.y, ball.x - cue.x),
        speed: Math.max(1.8, Math.min(3.4, 1.3 + seen * 1.1)),
        cut: 1.2,
        kind: "hit",
        travel: seen,
      });
      for (j = 0; j < pockets.length; j++) {
        var pocket = pockets[j];
        var pdx = pocket.x - ball.x;
        var pdy = pocket.y - ball.y;
        var pdist = Math.hypot(pdx, pdy);
        if (pdist < 0.08) continue;
        var nx = pdx / pdist;
        var ny = pdy / pdist;
        var gx = ball.x - nx * ball.r * 2;
        var gy = ball.y - ny * ball.r * 2;
        if (!onCloth(world.table, gx, gy)) continue;
        var ignore = {};
        ignore[cue.id] = true;
        ignore[ball.id] = true;
        if (blocked(world, cue.x, cue.y, gx, gy, ignore, cue.r * 0.96)) continue;
        if (blocked(world, ball.x, ball.y, pocket.x, pocket.y, ignore, ball.r * 0.9)) continue;
        var aim = Math.atan2(gy - cue.y, gx - cue.x);
        var face = Math.atan2(pdy, pdx);
        var cut = angleDiff(aim, face);
        if (cut > 1.25) continue;
        var travel = Math.hypot(gx - cue.x, gy - cue.y) + pdist;
        found.push({
          angle: aim,
          speed: Math.max(1.7, Math.min(5.2, 1.35 + travel * 1.15 + cut * 0.4)),
          cut: cut,
          kind: "pocket",
          travel: travel,
        });
      }
    }
    found.sort(function (a, b) {
      if (a.kind !== b.kind) return a.kind === "pocket" ? -1 : 1;
      return a.cut + a.travel * 0.15 - (b.cut + b.travel * 0.15);
    });
    return found;
  }

  function pocketCount(world) {
    var n = 0;
    for (var i = 0; i < world.balls.length; i++) {
      if (world.balls[i].id !== 0 && world.balls[i].pocketed) n++;
    }
    return n;
  }

  function simulate(world, angle, speed) {
    var sim = cloneWorld(world);
    var cue = B.cueOnTable(sim);
    var before = pocketCount(sim);
    B.strike(cue, angle, speed);
    var steps = 0;
    while (!B.isSettled(sim) && steps < 720) {
      B.stepWorld(sim, 1 / 60);
      steps++;
    }
    return {
      potted: pocketCount(sim) - before,
      scratch: !B.cueOnTable(sim),
      settled: B.isSettled(sim),
    };
  }

  function scoreOf(result) {
    if (result.scratch && result.potted === 0) return -8;
    if (result.scratch) return result.potted * 2 - 6;
    if (result.potted > 0) return result.potted * 10 + (result.settled ? 1 : 0);
    return result.settled ? 0.15 : 0;
  }

  function chooseShot(world, rng) {
    var random = rng || Math.random;
    var cue = B.cueOnTable(world);
    if (!cue) return null;
    var options = candidates(world);
    if (!options.length) {
      return { angle: 0, speed: 2, cut: 0, kind: "hit" };
    }
    var best = null;
    var limit = Math.min(options.length, 6);
    var started = Date.now();
    for (var i = 0; i < limit; i++) {
      if (i > 0 && Date.now() - started > 90 && best) break;
      var option = options[i];
      var result = simulate(world, option.angle, option.speed);
      var score = scoreOf(result);
      if (!best || score > best.score) best = { score: score, shot: option, result: result };
    }
    var shot = best.shot;
    var miss = (0.01 + shot.cut * 0.025) * (random() - 0.5) * 2;
    var powerJitter = 0.9 + random() * 0.2;
    return {
      angle: shot.angle + miss,
      speed: Math.max(1.2, Math.min(5.4, shot.speed * powerJitter)),
      cut: shot.cut,
      kind: shot.kind,
    };
  }

  function placeForCpu(world) {
    var table = world.table;
    var best = null;
    var x;
    var y;
    for (x = table.ballR * 2.2; x <= table.length * 0.34; x += 0.055) {
      for (y = table.ballR * 2.4; y <= table.width - table.ballR * 2.4; y += 0.07) {
        if (!B.canPlaceCue(world, x, y)) continue;
        var trial = cloneWorld(world);
        B.placeCue(trial, x, y);
        var n = candidates(trial).filter(function (shot) { return shot.kind === "pocket"; }).length;
        var center = Math.abs(y - table.width / 2);
        if (!best || n > best.n || (n === best.n && center < best.center)) {
          best = { x: x, y: y, n: n, center: center };
        }
      }
    }
    if (!best) {
      for (x = table.ballR * 2; x <= table.length - table.ballR * 2; x += 0.08) {
        for (y = table.ballR * 2; y <= table.width - table.ballR * 2; y += 0.08) {
          if (B.canPlaceCue(world, x, y)) {
            best = { x: x, y: y, n: 0, center: 0 };
            break;
          }
        }
        if (best) break;
      }
    }
    if (!best) return false;
    return B.placeCue(world, best.x, best.y);
  }

  function resolveVisit(before, world) {
    var potted = 0;
    for (var i = 0; i < world.balls.length; i++) {
      var ball = world.balls[i];
      if (ball.id !== 0 && ball.pocketed && !before[ball.id]) potted++;
    }
    var scratch = !B.cueOnTable(world);
    return {
      potted: potted,
      scratch: scratch,
      scored: scratch ? 0 : potted,
      keepTurn: !scratch && potted > 0,
    };
  }

  function winnerOf(score, tableClear) {
    if (score.player >= WIN_AT) return "player";
    if (score.cpu >= WIN_AT) return "cpu";
    if (!tableClear) return null;
    if (score.player === score.cpu) return "draw";
    return score.player > score.cpu ? "player" : "cpu";
  }

  return {
    WIN_AT: WIN_AT,
    candidates: candidates,
    chooseShot: chooseShot,
    placeForCpu: placeForCpu,
    resolveVisit: resolveVisit,
    winnerOf: winnerOf,
    simulate: simulate,
  };
});
