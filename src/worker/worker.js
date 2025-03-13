const { parentPort, workerData } = require("worker_threads");
const asyncHooks = require("async_hooks");
const fs = require("fs");
const babel = require("@babel/core");
const traverse = require("@babel/traverse").default;
const parser = require("@babel/parser");
const vm = require("node:vm");
const t = require("@babel/types");

const fetch = require("node-fetch");
const _ = require("lodash");

// Custom Babel Plugin
const { traceLoops } = require("./babelPlugin/loopTracer");
const { traceFunction } = require("./babelPlugin/functionTracer");
const { traceFuncCall } = require("./babelPlugin/functionCallTracer");

const { postEvent, Events, Tracer } = require("./events");

// Async Hook Function
const {
  init,
  before,
  after,
  destroy,
  promiseResolve,
} = require("./asyncHook.js");
const path = require("path");

asyncHooks
  .createHook({ init, before, after, destroy, promiseResolve })
  .enable();

// TODO: Maybe change this name to avoid conflicts?
const nextId = (() => {
  let id = 0;
  return () => id++;
})();

// E.g. call stack size exceeded errors...
process.on("uncaughtException", (err) => {
  postEvent(Events.UncaughtError(err));
  process.exit(1);
});

/*const vm = new VM({
  timeout: 6000,
  sandbox: {
    nextId,
    Tracer,
    fetch,
    _,
    lodash: _,
    setTimeout,
    setImmediate,
    process: {
      nextTick: process.nextTick,
    },
    queueMicrotask,
    console: {
      log: Tracer.log,
      warn: Tracer.warn,
      error: Tracer.error,
    },
  },
});*/

const context = {
  nextId,
  Tracer,
  console: {
    log: Tracer.log,
    warn: Tracer.warn,
    error: Tracer.error,
  },
  setTimeout,
  setImmediate,
  process: {
    nextTick: process.nextTick,
  },
};

const code = process.argv.slice(2)?.[0];
const jsSourceCode = JSON.parse(code);

const oriAST = parser.parse(jsSourceCode);
const listOfUserDefinedFunc = [];

// Get list of name of user defined function
traverse(oriAST, {
  FunctionDeclaration: function (path) {
    listOfUserDefinedFunc.push(path.node.id.name);
  },
  ArrowFunctionExpression: function (path) {
    let fnName;
    if (t.isIdentifier(path.container.id)) {
      fnName = path.container.id.name;
    } else {
      fnName = "anonymous";
    }
    listOfUserDefinedFunc.push(fnName);
  },
});

let modifiedSource = babel.transformSync(jsSourceCode.toString(), {
  plugins: [
    [traceFuncCall, { listOfUserDefinedFunc }],
    traceFunction,
    traceLoops,
  ],
}).code;

modifiedSource = `
Tracer.enterFunc(nextId(), "main", 0, 0);
${modifiedSource}
Tracer.exitFunc(nextId(), "main", 0, 0)
`;

const script = new vm.Script(modifiedSource);
vm.createContext(context);
script.runInContext(context);
// vm.run(modifiedSource);
