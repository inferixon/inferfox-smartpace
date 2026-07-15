"use strict";

const assert = require("node:assert/strict");
const controller = require("../src/controller.js");

function test(name, run) {
  try {
    run();
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n${error.stack}\n`);
    process.exitCode = 1;
  }
}

test("accepts ordinary watch URLs and rejects Shorts and live pages", () => {
  assert.equal(controller.videoIdFromUrl("https://www.youtube.com/watch?v=abc123"), "abc123");
  assert.equal(controller.videoIdFromUrl("https://www.youtube.com/shorts/abc123"), "");
  assert.equal(controller.videoIdFromUrl("https://www.youtube.com/live/abc123"), "");
});

test("changes speed by bounded configurable steps", () => {
  assert.equal(controller.nextRateForWheel(2, -120), 2.1);
  assert.equal(controller.nextRateForWheel(2, 120), 1.9);
  assert.equal(controller.nextRateForWheel(2, -120, 0.25), 2.25);
  assert.equal(controller.nextRateForWheel(5, -120), 5);
  assert.equal(controller.nextRateForWheel(0.5, 120), 0.5);
});

test("normalizes the wheel step to a usable bounded increment", () => {
  assert.equal(controller.normalizeWheelStep(), 0.1);
  assert.equal(controller.normalizeWheelStep(0.33), 0.35);
  assert.equal(controller.normalizeWheelStep(0.01), 0.05);
  assert.equal(controller.normalizeWheelStep(4), 1);
});

test("prefers the current owner link over potentially stale page metadata", () => {
  assert.equal(
    controller.channelKeyFromSignals("/channel/UCcurrent12345", "UCstale1234567"),
    "channelId:UCcurrent12345"
  );
  assert.equal(controller.channelKeyFromSignals("/@Current.Handle", ""), "handle:@current.handle");
  assert.equal(controller.channelKeyFromSignals("", "UCmeta12345678"), "channelId:UCmeta12345678");
});
