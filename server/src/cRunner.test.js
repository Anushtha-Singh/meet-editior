const http = require('http');
const app = require('./app');

const waitForServer = (server) =>
  new Promise((resolve) => server.listen(0, resolve));

const closeServer = (server) =>
  new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

const run = async () => {
  const server = http.createServer(app);
  await waitForServer(server);
  const { port } = server.address();

  const response = await fetch(`http://localhost:${port}/api/run-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      language: 'c',
      code: '#include <stdio.h>\nint main(){ printf("Hello from C\\n"); return 0; }',
    }),
  });

  const payload = await response.json();

  if (response.status !== 200) {
    throw new Error(`C runner failed: ${payload.error || 'unknown error'}`);
  }

  if (!payload.output.includes('Hello from C')) {
    throw new Error('C runner did not return expected output.');
  }

  await closeServer(server);
  console.log('C code runner test passed.');
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
