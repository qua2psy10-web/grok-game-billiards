/* CPUの狙い。候補を少しだけ実際に転がして、落ちる打ち方を選ぶ。 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./physics"));
  else root.BilliardsCpu = factory(root.Billiards);
})(typeof globalThis !== "undefined" ? globalThis : this, function (B) {
  "use strict";

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

  function groupOf(id) {
    if (id >= 1 && id <= 7) return "solids";
    if (id >= 9 && id <= 15) return "stripes";
    return null;
  }

  function objectBalls(world) {
    var list = [];
    for (var i = 0; i < world.balls.length; i++) {
      if (world.balls[i].id !== 0 && !world.balls[i].pocketed) list.push(world.balls[i]);
    }
    return list;
  }

  function targetBalls(world, group) {
    var list = objectBalls(world);
    if (!group) return list.filter(function (ball) { return ball.id !== 8; });
    var own = list.filter(function (ball) { return groupOf(ball.id) === group; });
    if (own.length) return own;
    return list.filter(function (ball) { return ball.id === 8; });
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

  function candidates(world, group) {
    var cue = B.cueOnTable(world);
    var list = targetBalls(world, group || null);
    var found = [];
    if (!cue || !list.length) return found;
    var pockets = pocketsOf(world.table);
    var i;
    var j;
    for (i = 0; i < list.length; i++) {
      var ball = list[i];
      var seen = Math.hypot(ball.x - cue.x, ball.y - cue.y);
      found.push({
        ballId: ball.id,
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
          ballId: ball.id,
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

  function pocketedMap(world) {
    var before = {};
    for (var i = 0; i < world.balls.length; i++) {
      if (world.balls[i].id !== 0 && world.balls[i].pocketed) before[world.balls[i].id] = true;
    }
    return before;
  }

  function remainingAtStart(before, group) {
    if (!group) return 7;
    var start = group === "solids" ? 1 : 9;
    var n = 0;
    for (var id = start; id < start + 7; id++) if (!before[id]) n++;
    return n;
  }

  function judgeVisit(info) {
    var before = info.before || {};
    var potted = [];
    var i;
    for (i = 0; i < info.world.balls.length; i++) {
      var ball = info.world.balls[i];
      if (ball.id !== 0 && ball.pocketed && !before[ball.id]) potted.push(ball.id);
    }
    var scratch = !B.cueOnTable(info.world);
    var eight = potted.indexOf(8) !== -1;
    var solids = 0;
    var stripes = 0;
    for (i = 0; i < potted.length; i++) {
      if (groupOf(potted[i]) === "solids") solids++;
      if (groupOf(potted[i]) === "stripes") stripes++;
    }
    var group = info.group || null;
    var shootingEight = !!group && remainingAtStart(before, group) === 0;
    var firstOk = false;
    if (info.firstHit) {
      if (shootingEight) firstOk = info.firstHit === 8;
      else if (group) firstOk = groupOf(info.firstHit) === group;
      else firstOk = info.firstHit >= 1 && info.firstHit <= 15;
    }
    var foul = scratch || !firstOk;
    if (eight && shootingEight && !scratch && firstOk) {
      return { result: "win", foul: false, scratch: scratch, keepTurn: false, assign: null, ownPotted: 0, potted: potted };
    }
    if (eight) {
      return { result: "loss", foul: foul, scratch: scratch, keepTurn: false, assign: null, ownPotted: 0, potted: potted };
    }
    var assign = null;
    if (!group && !foul) {
      if (solids > 0 && stripes === 0) assign = "solids";
      else if (stripes > 0 && solids === 0) assign = "stripes";
    }
    var ownPotted = !group ? solids + stripes : group === "solids" ? solids : stripes;
    return {
      result: "play",
      foul: foul,
      scratch: scratch,
      keepTurn: !foul && ownPotted > 0,
      assign: assign,
      ownPotted: ownPotted,
      potted: potted,
    };
  }

  function rankVisit(result) {
    if (result.result === "win") return 100;
    if (result.result === "loss") return -80;
    if (result.foul) return -6;
    if (result.keepTurn) return 12 + result.ownPotted;
    return 0.2;
  }

  function simulate(world, angle, speed) {
    var sim = cloneWorld(world);
    var before = pocketedMap(sim);
    var cue = B.cueOnTable(sim);
    var firstHit = null;
    B.strike(cue, angle, speed);
    var steps = 0;
    while (!B.isSettled(sim) && steps < 720) {
      var events = B.stepWorld(sim, 1 / 60);
      if (firstHit == null) {
        for (var i = 0; i < events.length; i++) {
          if (events[i].type !== "ball") continue;
          if (events[i].a === 0) firstHit = events[i].b;
          else if (events[i].b === 0) firstHit = events[i].a;
          if (firstHit != null) break;
        }
      }
      steps++;
    }
    var after = 0;
    for (var id in pocketedMap(sim)) if (!before[id]) after++;
    return {
      potted: after,
      scratch: !B.cueOnTable(sim),
      settled: B.isSettled(sim),
      firstHit: firstHit,
      world: sim,
      before: before,
    };
  }

  function chooseShot(world, rng, group) {
    var random = rng || Math.random;
    var cue = B.cueOnTable(world);
    if (!cue) return null;
    var options = candidates(world, group || null);
    if (!options.length) {
      return { angle: 0, speed: 2, cut: 0, kind: "hit" };
    }
    var best = null;
    var limit = Math.min(options.length, 6);
    var started = Date.now();
    for (var i = 0; i < limit; i++) {
      if (i > 0 && Date.now() - started > 90 && best) break;
      var option = options[i];
      var played = simulate(world, option.angle, option.speed);
      var judged = judgeVisit({
        before: played.before,
        world: played.world,
        firstHit: played.firstHit,
        group: group || null,
      });
      var score = rankVisit(judged);
      if (!best || score > best.score) best = { score: score, shot: option };
    }
    var shot = best.shot;
    var miss = (0.01 + shot.cut * 0.025) * (random() - 0.5) * 2;
    var powerJitter = 0.9 + random() * 0.2;
    return {
      angle: shot.angle + miss,
      speed: Math.max(1.2, Math.min(5.4, shot.speed * powerJitter)),
      cut: shot.cut,
      kind: shot.kind,
      ballId: shot.ballId,
    };
  }

  function placeForCpu(world, group) {
    var table = world.table;
    var best = null;
    var x;
    var y;
    for (x = table.ballR * 2.2; x <= table.length * 0.34; x += 0.055) {
      for (y = table.ballR * 2.4; y <= table.width - table.ballR * 2.4; y += 0.07) {
        if (!B.canPlaceCue(world, x, y)) continue;
        var trial = cloneWorld(world);
        B.placeCue(trial, x, y);
        var n = candidates(trial, group).filter(function (shot) { return shot.kind === "pocket"; }).length;
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

  return {
    groupOf: groupOf,
    candidates: candidates,
    chooseShot: chooseShot,
    placeForCpu: placeForCpu,
    judgeVisit: judgeVisit,
    simulate: simulate,
  };
});
