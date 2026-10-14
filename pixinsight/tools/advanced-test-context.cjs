"use strict";
// Existing manager tests evaluate selected functions without PJSR #include.
// Load the actual included engine into those VM contexts, with disabled defaults.
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const include = fs.readFileSync(path.join(__dirname, "..", "CCDASTROAdvancedWorkflow.jsh"), "utf8");
const originalCreateContext = vm.createContext;
vm.createContext = function(...args) {
  const context = originalCreateContext.apply(vm, args);
  vm.runInContext(include, context, {filename: "CCDASTROAdvancedWorkflow.jsh"});
  return context;
};
