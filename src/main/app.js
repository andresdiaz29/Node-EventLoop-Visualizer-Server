const WebSocket = require('ws');
const { launchWorker } = require('./launchWorker');
const { reduceEvents } = require('./eventsReducer');
const path = require('node:path');
const { processCode } = require('../worker/processCode');
const { spawn } = require('node:child_process');

// Heroku provides a PORT env var that we have to use
const port = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port });
console.log('Running server on port:', port);

const Messages = {
  RunCode: 'RunCode',
};

wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    const { type, payload } = JSON.parse(message);

    if (type === Messages.RunCode) {
      let events = [];
      let isFinished = false;

      const activeChildProcess = spawn(
        "C:\\Users\\andreseduardo.diaz\\Documents\\Andres\\NodeJs\\node\\out\\Release\\node.exe",
        [
          path.join(__dirname, '../worker', 'worker.js'),
          JSON.stringify(payload)
        ]
      );

      activeChildProcess.on("error", (error) => {
        console.log(`error: ${error}`);
      });

      activeChildProcess.stdout.on("data", (data) => {
        console.log(data.toString());
      });

      activeChildProcess.stderr.on("data", (data) => {
        console.log('STDERR: ', data.toString());
      });

      activeChildProcess.on("close", () => {
        console.log('close');
        const reducedEvents = reduceEvents(events);
        // ws.send("complete");
      })

      /*const worker = launchWorker(payload, (evtString) => {
        if (!isFinished) {
          const evt = JSON.parse(evtString);
          events.push(evt);

          if (evt.type === 'Done') {
            const reducedEvents = reduceEvents(events);
            // console.log(reducedEvents.map(JSON.stringify));
            ws.send(JSON.stringify(reducedEvents));
          }
        }
      });*/
    } else {
      console.error('Unknown message type:', type);
    }
  });
});
