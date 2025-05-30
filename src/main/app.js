const WebSocket = require("ws");
const { launchWorker } = require("./launchWorker");
const { reduceEvents } = require("./eventsReducer");
const path = require("node:path");
const { processCode } = require("../worker/processCode");
const { spawn } = require("node:child_process");
const { Transform } = require("node:stream");

// Heroku provides a PORT env var that we have to use
const port = process.env.PORT || 8090;
const wss = new WebSocket.Server({ port });
const nodePath = process.env.NODE_PATH || `${path.join(__dirname, "../../node")}/node.exe`;
// console.log("Running server on port:", port);

const Messages = {
  RunCode: "RunCode",
};

wss.on("connection", (ws) => {
  ws.on("message", (message) => {
    const { type, payload } = JSON.parse(message);

    if (type === Messages.RunCode) {
      let events = [];
      let stdOutput = [];
      let isFinished = false;

      const activeChildProcess = spawn(
        nodePath,
        [
          path.join(__dirname, "../worker", "worker.js"),
          JSON.stringify(payload),
        ]
      );

      activeChildProcess.on("error", (error) => {
        console.log(`error: ${error}`);
      });

      const lineStream = new Transform({
        transform(chunk, encoding, callback) {
          // Convertir el chunk a una cadena
          const lines = chunk.toString().split("\n");

          lines?.filter((line) => !!line).forEach((line) => {
            console.log(line);
            const regexType =
              /^\[(event|ticksAndRejections|event_loop)\]\s*((?:\w+\s*:\s*(?:"[^"]*"|'[^']*'|\d+)(?:,\s*)?)+)/;
            const typeMatch = line.match(regexType);

            if (typeMatch) {
              let message,
                type,
                name,
                funcId,
                start,
                end;

              let source = typeMatch[1];
              const match = typeMatch[2]?.trim()?.split(",");

              if (source === "event") {
                type = getTransformedMessageLine(match[0]);
                if (type === "ConsoleLog" || type === "ConsoleWarn" || type === "ConsoleError") {
                  message = getTransformedMessageLine(match[1]);
                } else {
                  funcId = getTransformedMessageLine(match[1]);
                }
                name = getTransformedMessageLine(match[2]);
                start = getTransformedMessageLine(match[3]);
                end = getTransformedMessageLine(match[4]);
              } else if (source === "ticksAndRejections") {
                type = getTransformedMessageLine(match[0]);
              } else if (source === "event_loop") {
                const run = getTransformedMessageLine(match[1]);
                if (run == 2) {
                  type = getTransformedMessageLine(match[2]);
                }
              } 

              const transformedLine = {
                payload: {
                  message: message,
                  source: source,
                  name: name,
                  funcId: funcId,
                  start: start,
                  end: end,
                },
                type: type,
              };

              stdOutput.push(transformedLine);
            }
          });

          callback();
        },
      });
      activeChildProcess.stdout.pipe(lineStream);

      activeChildProcess.stderr.on("data", (data) => {
        // console.log("STDERR: ", data.toString());
      });

      activeChildProcess.on("close", () => {
        const reducedEvents = reduceEvents(stdOutput);

        reducedEvents.unshift({
          payload: {
            message: undefined,
            source: 'event',
            name: 'main',
            funcId: '0',
            start: '0',
            end: '0'
          },
          type: 'EnterFunction'
        });
        reducedEvents.push({
          payload: {
            message: undefined,
            source: 'event',
            name: 'main',
            funcId: '0',
            start: '0',
            end: '0'
          },
          type: 'ExitFunction'
        });

        // console.log(reducedEvents.map(JSON.stringify));
        ws.send(JSON.stringify(reducedEvents));
      });

    } else {
      console.error("Unknown message type:", type);
    }
  });
});

const getTransformedMessageLine = (text) => {
  return text?.split(":")?.[1]?.trim()?.replaceAll("'", "");
};
