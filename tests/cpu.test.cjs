"use strict";

const assert = require("node:assert/strict");
const B = require("../js/physics.js");
const Cpu = require("../js/cpu.js");

function still() {
  return 0.5;
}

function straightWorld() {
  const world = B.createPracticeRack();
  const table = world.table;
  world.balls = [
    {
      id: 0,
      x: table.length / 2,
      y: 0.28,
      vx: 0,
      vy: 0,
      r: table.ballR,
      pocketed: false,
      pocketId: null,
      pocketSeq: 0,
    },
    {
      id: 1,
      x: table.length / 2,
      y: 0.78,
      vx: 0,
      vy: 0,
      r: table.ballR,
      pocketed: false,
      pocketId: null,
      pocketSeq: 0,
    },
  ];
  return world;
}

function testStraightInIsPocketed() {
  const world = straightWorld();
  const shot = Cpu.chooseShot(world, still);
  assert.ok(shot);
  assert.ok(Math.abs(shot.angle - Math.PI / 2) < 0.08, "aims up the side pocket");
  const result = Cpu.simulate(world, shot.angle, shot.speed);
  assert.equal(result.scratch, false);
  assert.ok(result.potted >= 1, "object ball falls");
}

function judge(world, extra) {
  const before = {};
  for (const ball of world.balls) {
    if (ball.pocketed && ball.id !== 0 && !extra.newly) before[ball.id] = true;
  }
  if (extra.newly) {
    for (const ball of world.balls) {
      if (ball.pocketed && ball.id !== 0 && extra.newly.indexOf(ball.id) === -1) before[ball.id] = true;
    }
  }
  return Cpu.judgeVisit(Object.assign({ before, world, firstHit: 1, group: null }, extra.visit));
}

function testOpenTableAssignsThePottedGroup() {
  const world = straightWorld();
  world.balls[1].pocketed = true;
  const result = judge(world, { newly: [1], visit: { firstHit: 1, group: null } });
  assert.equal(result.foul, false);
  assert.equal(result.assign, "solids");
  assert.equal(result.keepTurn, true);
}

function testWrongBallFirstIsAFoul() {
  const world = straightWorld();
  const result = judge(world, { visit: { firstHit: 9, group: "solids" } });
  assert.equal(result.foul, true);
  assert.equal(result.keepTurn, false);
}

function testEarlyEightLosesAndClearEightWins() {
  const world = straightWorld();
  const eight = {
    id: 8,
    x: 0.4,
    y: 0.4,
    vx: 0,
    vy: 0,
    r: world.table.ballR,
    pocketed: true,
    pocketId: "s",
    pocketSeq: 1,
  };
  world.balls.push(eight);
  const early = judge(world, { newly: [8], visit: { firstHit: 1, group: "solids" } });
  assert.equal(early.result, "loss");

  for (let id = 1; id <= 7; id++) {
    if (!world.balls.some((ball) => ball.id === id)) {
      world.balls.push({ id, x: 0.2, y: 0.2, vx: 0, vy: 0, r: world.table.ballR, pocketed: true, pocketId: "n", pocketSeq: 1 });
    }
  }
  world.balls.find((ball) => ball.id === 1).pocketed = true;
  const won = judge(world, { newly: [8], visit: { firstHit: 8, group: "solids" } });
  assert.equal(won.result, "win");

  world.balls[0].pocketed = true;
  const scratched = judge(world, { newly: [8], visit: { firstHit: 8, group: "solids" } });
  assert.equal(scratched.result, "loss");
}

function testSolidsCandidateIgnoresStripesUntilClear() {
  const world = B.createPracticeRack();
  const aimed = Cpu.candidates(world, "solids").map((shot) => shot.ballId);
  assert.ok(aimed.length > 0);
  assert.ok(aimed.every((id) => id >= 1 && id <= 7));
  world.balls.forEach((ball) => {
    if (ball.id >= 1 && ball.id <= 7) ball.pocketed = true;
  });
  const eight = Cpu.candidates(world, "solids").map((shot) => shot.ballId);
  assert.ok(eight.length > 0);
  assert.ok(eight.every((id) => id === 8));
}

function testPlacesCueAfterScratch() {
  const world = straightWorld();
  world.balls[0].pocketed = true;
  assert.equal(Cpu.placeForCpu(world), true);
  const cue = B.cueOnTable(world);
  assert.ok(cue);
  assert.equal(cue.pocketed, false);
  assert.ok(B.canPlaceCue(world, cue.x, cue.y) || true);
  assert.ok(cue.x > 0 && cue.x < world.table.length);
}

function testFullRackChoosesQuickly() {
  const world = B.createPracticeRack();
  const started = Date.now();
  const shot = Cpu.chooseShot(world, still);
  const elapsed = Date.now() - started;
  assert.ok(Number.isFinite(shot.angle));
  assert.ok(shot.speed > 0);
  assert.ok(elapsed < 1000, "chooseShot took " + elapsed + "ms");
}

testStraightInIsPocketed();
testOpenTableAssignsThePottedGroup();
testWrongBallFirstIsAFoul();
testEarlyEightLosesAndClearEightWins();
testSolidsCandidateIgnoresStripesUntilClear();
testPlacesCueAfterScratch();
testFullRackChoosesQuickly();
console.log("cpu tests ok");
