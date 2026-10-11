"use strict";

const assert = require("node:assert/strict");
const B = require("../js/physics.js");

function simulate(world, seconds) {
  const steps = Math.round(seconds / (1 / 120));
  for (let i = 0; i < steps; i++) B.stepWorld(world, 1 / 120);
}

function testHeadOnExchange() {
  const a = { id: 1, x: 0, y: 0, vx: 1, vy: 0, r: 1, pocketed: false };
  const b = { id: 2, x: 2, y: 0, vx: 0, vy: 0, r: 1, pocketed: false };
  B.collidePair(a, b, 1, []);
  assert.ok(Math.abs(a.vx) < 1e-9, "striker stops");
  assert.ok(Math.abs(b.vx - 1) < 1e-9, "target takes the speed");
}

function testGlancingMomentumAndEnergy() {
  const a = { id: 1, x: 0, y: 0, vx: 1, vy: 0, r: 1, pocketed: false };
  const b = { id: 2, x: 1.6, y: 1.2, vx: 0, vy: 0, r: 1, pocketed: false };
  B.collidePair(a, b, 1, []);
  const px = a.vx + b.vx;
  const py = a.vy + b.vy;
  const energy = a.vx ** 2 + a.vy ** 2 + b.vx ** 2 + b.vy ** 2;
  assert.ok(Math.abs(px - 1) < 1e-9, "momentum x");
  assert.ok(Math.abs(py) < 1e-9, "momentum y");
  assert.ok(Math.abs(energy - 1) < 1e-9, "energy");
}

function testRackIsQuiet() {
  const world = B.createPracticeRack();
  assert.equal(world.balls.length, 16);
  const ids = world.balls.map((ball) => ball.id).sort((a, b) => a - b);
  assert.deepEqual(ids, [...Array(16).keys()]);
  for (let i = 0; i < world.balls.length; i++) {
    for (let j = i + 1; j < world.balls.length; j++) {
      const a = world.balls[i];
      const b = world.balls[j];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      assert.ok(dist >= a.r + b.r - 1e-6, `overlap ${a.id} ${b.id}`);
    }
    const ball = world.balls[i];
    assert.ok(ball.x > ball.r && ball.x < world.table.length - ball.r);
    assert.ok(ball.y > ball.r && ball.y < world.table.width - ball.r);
  }
  const before = world.balls.map((ball) => [ball.x, ball.y]);
  simulate(world, 1);
  world.balls.forEach((ball, index) => {
    assert.equal(ball.pocketed, false);
    assert.ok(Math.abs(ball.x - before[index][0]) < 1e-9);
    assert.ok(Math.abs(ball.y - before[index][1]) < 1e-9);
  });
}

function testRailBounce() {
  const world = B.createPracticeRack();
  world.balls = [
    {
      id: 0,
      x: world.table.length / 2 + 0.25,
      y: 0.2,
      vx: 0,
      vy: -2,
      r: world.table.ballR,
      pocketed: false,
      pocketId: null,
      pocketSeq: 0,
    },
  ];
  let bounced = false;
  for (let i = 0; i < 180; i++) {
    B.stepWorld(world, 1 / 120);
    if (world.balls[0].vy > 0.4) bounced = true;
  }
  assert.equal(world.balls[0].pocketed, false);
  assert.ok(bounced, "ball returns from the cushion");
  assert.ok(world.balls[0].y >= world.table.ballR - 1e-4);
}

function testSidePocket() {
  const world = B.createPracticeRack();
  const table = world.table;
  world.balls = [
    {
      id: 1,
      x: table.length / 2,
      y: 0.35,
      vx: 0,
      vy: -3,
      r: table.ballR,
      pocketed: false,
      pocketId: null,
      pocketSeq: 0,
    },
  ];
  simulate(world, 2);
  assert.equal(world.balls[0].pocketed, true);
  assert.equal(world.balls[0].pocketId, "s");
}

function testCornerPocketAlongCushion() {
  const world = B.createPracticeRack();
  const table = world.table;
  world.balls = [
    {
      id: 1,
      x: 0.35,
      y: table.ballR + 0.001,
      vx: -1.2,
      vy: 0,
      r: table.ballR,
      pocketed: false,
      pocketId: null,
      pocketSeq: 0,
    },
  ];
  simulate(world, 2);
  assert.equal(world.balls[0].pocketed, true);
  assert.equal(world.balls[0].pocketId, "sw");
}

function testOpenRailDoesNotPocket() {
  const world = B.createPracticeRack();
  const table = world.table;
  world.balls = [
    {
      id: 1,
      x: table.length / 2 + 0.22,
      y: 0.25,
      vx: 0,
      vy: -2.4,
      r: table.ballR,
      pocketed: false,
      pocketId: null,
      pocketSeq: 0,
    },
  ];
  simulate(world, 2);
  assert.equal(world.balls[0].pocketed, false);
  assert.ok(B.isSettled(world));
}

function testFrictionStops() {
  const world = B.createPracticeRack();
  world.balls = [
    {
      id: 0,
      x: 0.4,
      y: 0.56,
      vx: 1.2,
      vy: 0.2,
      r: world.table.ballR,
      pocketed: false,
      pocketId: null,
      pocketSeq: 0,
    },
  ];
  simulate(world, 8);
  assert.ok(B.isSettled(world));
  assert.equal(world.balls[0].vx, 0);
  assert.equal(world.balls[0].vy, 0);
}

function testBreakStaysFinite() {
  const world = B.createPracticeRack();
  const start = new Map(world.balls.map((ball) => [ball.id, { x: ball.x, y: ball.y }]));
  const cue = B.cueOnTable(world);
  B.strike(cue, 0, 4.6);
  simulate(world, 12);
  let moved = 0;
  for (const ball of world.balls) {
    assert.ok(Number.isFinite(ball.x) && Number.isFinite(ball.y));
    assert.ok(Number.isFinite(ball.vx) && Number.isFinite(ball.vy));
    if (!ball.pocketed) {
      assert.ok(ball.x >= -0.001 && ball.x <= world.table.length + 0.001);
      assert.ok(ball.y >= -0.001 && ball.y <= world.table.width + 0.001);
    }
    const from = start.get(ball.id);
    if (ball.id !== 0 && (ball.pocketed || Math.hypot(ball.x - from.x, ball.y - from.y) > 0.05)) moved += 1;
  }
  assert.ok(moved >= 1, "the rack is struck");
  assert.ok(B.isSettled(world));
}

function testPlaceCueRejectsOverlapAndAcceptsOpenCloth() {
  const world = B.createPracticeRack();
  const cue = B.cueOnTable(world);
  assert.equal(B.placeCue(world, cue.x + 0.01, cue.y), true);
  const eight = world.balls.find((ball) => ball.id === 8);
  assert.equal(B.canPlaceCue(world, eight.x, eight.y), false);
  assert.equal(B.canPlaceCue(world, 0.01, 0.01), false);
  assert.equal(B.placeCue(world, world.table.length * 0.5, world.table.width * 0.72), true);
  assert.equal(B.cueOnTable(world).pocketed, false);
}

testHeadOnExchange();
testGlancingMomentumAndEnergy();
testRackIsQuiet();
testRailBounce();
testSidePocket();
testCornerPocketAlongCushion();
testOpenRailDoesNotPocket();
testFrictionStops();
testBreakStaysFinite();
testPlaceCueRejectsOverlapAndAcceptsOpenCloth();
console.log("physics tests ok");
