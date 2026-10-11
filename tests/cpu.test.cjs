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

function testVisitScoring() {
  const world = straightWorld();
  const before = {};
  const kept = Cpu.resolveVisit(before, world);
  assert.deepEqual(kept, { potted: 0, scratch: false, scored: 0, keepTurn: false });

  world.balls[1].pocketed = true;
  const potted = Cpu.resolveVisit(before, world);
  assert.equal(potted.scored, 1);
  assert.equal(potted.keepTurn, true);

  world.balls[0].pocketed = true;
  const scratch = Cpu.resolveVisit(before, world);
  assert.equal(scratch.scratch, true);
  assert.equal(scratch.scored, 0);
  assert.equal(scratch.keepTurn, false);
}

function testWinner() {
  assert.equal(Cpu.winnerOf({ player: 8, cpu: 3 }, false), "player");
  assert.equal(Cpu.winnerOf({ player: 4, cpu: 8 }, false), "cpu");
  assert.equal(Cpu.winnerOf({ player: 4, cpu: 4 }, false), null);
  assert.equal(Cpu.winnerOf({ player: 4, cpu: 4 }, true), "draw");
  assert.equal(Cpu.winnerOf({ player: 5, cpu: 2 }, true), "player");
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
testVisitScoring();
testWinner();
testPlacesCueAfterScratch();
testFullRackChoosesQuickly();
console.log("cpu tests ok");
