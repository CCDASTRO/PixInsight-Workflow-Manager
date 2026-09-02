#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");

const workflowPath = process.argv[2] ||
  path.join(__dirname, "..", "workflows", "color-master-v1.1.0.json");
const workflow = JSON.parse(fs.readFileSync(workflowPath, "utf8"));
const errors = [];

function requireValue(condition, message) {
  if (!condition) errors.push(message);
}

requireValue(workflow.schemaVersion === 3, "schemaVersion must be 3");
requireValue(workflow.input && workflow.input.stage === "linear-integrated",
  "input.stage must be linear-integrated");
requireValue(workflow.input && workflow.input.colorModel === "integrated-color-master",
  "input.colorModel must be integrated-color-master");
requireValue(Array.isArray(workflow.profiles) && workflow.profiles.length > 0,
  "profiles must be a non-empty array");
requireValue(Array.isArray(workflow.steps) && workflow.steps.length > 0,
  "steps must be a non-empty array");

const byId = new Map();
const orders = new Set();
for (const step of workflow.steps || []) {
  requireValue(typeof step.id === "string" && step.id.length > 0,
    "every step requires an id");
  requireValue(!byId.has(step.id), `duplicate step id: ${step.id}`);
  requireValue(Number.isInteger(step.order) && step.order > 0,
    `${step.id}: order must be a positive integer`);
  requireValue(!orders.has(step.order), `${step.id}: duplicate order ${step.order}`);
  requireValue(Array.isArray(step.adapters) && step.adapters.length > 0,
    `${step.id}: adapters must not be empty`);
  const adapterIds = (step.adapters || []).map(adapter => adapter.id);
  requireValue(adapterIds.includes(step.selectedAdapter),
    `${step.id}: selectedAdapter must occur in adapters`);
  for (const adapter of step.adapters || []) {
    requireValue(["process", "processIcon", "internal"].includes(adapter.kind),
      `${step.id}/${adapter.id}: invalid adapter kind`);
    if (adapter.kind === "process")
      requireValue(typeof adapter.processClass === "string" && adapter.processClass.length > 0,
        `${step.id}/${adapter.id}: process adapters require processClass`);
    if (adapter.kind === "processIcon")
      requireValue(typeof adapter.iconId === "string" && adapter.iconId.length > 0,
        `${step.id}/${adapter.id}: processIcon adapters require iconId`);
  }
  byId.set(step.id, step);
  orders.add(step.order);
}

const profileIds = new Set();
for (const profile of workflow.profiles || []) {
  requireValue(typeof profile.id === "string" && profile.id.length > 0,
    "every profile requires an id");
  requireValue(!profileIds.has(profile.id), `duplicate profile id: ${profile.id}`);
  requireValue(Array.isArray(profile.visibleSteps), `${profile.id}: visibleSteps must be an array`);
  for (const stepId of profile.visibleSteps || [])
    requireValue(byId.has(stepId), `${profile.id}: unknown visible step ${stepId}`);
  profileIds.add(profile.id);
}
requireValue(profileIds.has(workflow.defaultProfile),
  "defaultProfile must identify a declared profile");

const requiredOrder = ["gradient", "plateSolve", "colorCalibration"];
const gradient = byId.get("gradient");
if (gradient && gradient.adapters.some(adapter => adapter.id === "mgc")) {
  const config = gradient.parameters && gradient.parameters.mgc;
  requireValue(!!config, "MGC requires its composite configuration");
  if (config) {
    requireValue(JSON.stringify(config.sequence) === JSON.stringify(["plateSolveIfNeeded", "spfc", "mgc"]),
      "MGC must run plate solving before SPFC before MGC");
    requireValue(config.spfcIconId === "CCDASTRO_SPFC" && config.mgcIconId === "CCDASTRO_MGC",
      "MGC icon names must match the executable adapter");
    requireValue(config.skipSeparatePlateSolveStep === true && config.onFailure === "stop",
      "MGC must skip the redundant solve and stop on failure");
  }
}
for (let i = 0; i < requiredOrder.length; ++i) {
  requireValue(byId.has(requiredOrder[i]), `missing required workflow step: ${requiredOrder[i]}`);
  if (i > 0 && byId.has(requiredOrder[i - 1]) && byId.has(requiredOrder[i]))
    requireValue(byId.get(requiredOrder[i - 1]).order < byId.get(requiredOrder[i]).order,
      `${requiredOrder[i - 1]} must precede ${requiredOrder[i]}`);
}

for (const step of workflow.steps || []) {
  for (const successor of step.mustPrecede || []) {
    requireValue(byId.has(successor), `${step.id}: unknown mustPrecede step ${successor}`);
    if (byId.has(successor))
      requireValue(step.order < byId.get(successor).order,
        `${step.id} must precede ${successor}`);
  }
  for (const predecessor of step.mustFollow || []) {
    requireValue(byId.has(predecessor), `${step.id}: unknown mustFollow step ${predecessor}`);
    if (byId.has(predecessor))
      requireValue(step.order > byId.get(predecessor).order,
        `${step.id} must follow ${predecessor}`);
  }
}

if (errors.length) {
  console.error(errors.map(error => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log(`Workflow valid: ${workflow.name} (${workflow.steps.length} steps)`);
