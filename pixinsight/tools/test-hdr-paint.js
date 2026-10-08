"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "..", "CCDASTROWorkflowManager.js"), "utf8");
const start = source.indexOf("this.preview.onPaint = function()");
const end = source.indexOf("this.updateButton =", start);
const paint = source.slice(start, end);
class Brush { constructor(color) { this.color = color; } }
const preview = { width: 640, height: 320, boundsRect: {} };
let fills = 0, draws = 0, ended = 0;
const self = { beforeBitmap: { width: 100, height: 80 }, displayMode: { currentItem: 0 }, zoomMode: { currentItem: 0 }, afterBitmap: null };
const context = vm.createContext({
  self, preview, Brush, Math,
  Rect: function (...args) { this.coordinates = args; },
  Graphics: function () {
    this.fillRect = (rect, brush) => { assert.ok(brush instanceof Brush); assert.equal(brush.color, 0xff202020); ++fills; };
    this.drawScaledBitmap = () => { ++draws; };
    this.end = () => { ++ended; };
  }
});
vm.runInContext("(function(){" + paint + "}).call({preview});", context);
preview.onPaint();
assert.equal(draws, 1);
self.afterBitmap = { width: 100, height: 80 };
self.displayMode.currentItem = 1;
preview.onPaint();
assert.equal(draws, 2);
assert.equal(fills, 2);
assert.equal(ended, 2);
self.haloMaskBitmap={width:100,height:80};self.displayMode.currentItem=3;preview.onPaint();assert.equal(draws,3);

console.log("HDR preview painting regression passed: Brush argument and same-position Before/After rendering.");
