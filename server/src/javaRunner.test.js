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

  // Test 1: Successful Java run
  const response = await fetch(`http://localhost:${port}/api/run-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      language: 'java',
      code: 'public class Main {\n  public static void main(String[] args) {\n    System.out.println("Hello from Java");\n  }\n}',
    }),
  });

  const payload = await response.json();

  if (response.status !== 200) {
    throw new Error(`Java runner failed: ${payload.error || 'unknown error'}`);
  }

  if (!payload.output.includes('Hello from Java')) {
    throw new Error(`Java runner did not return expected output. Got: ${JSON.stringify(payload)}`);
  }

  // Test 2: Custom class name
  const customClassResponse = await fetch(`http://localhost:${port}/api/run-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      language: 'java',
      code: 'public class CustomRunner {\n  public static void main(String[] args) {\n    System.out.println("Custom Class Output");\n  }\n}',
    }),
  });

  const customPayload = await customClassResponse.json();
  if (!customPayload.output.includes('Custom Class Output')) {
    throw new Error(`Java custom class failed: ${JSON.stringify(customPayload)}`);
  }

  // Test 3: Compilation error handling
  const errResponse = await fetch(`http://localhost:${port}/api/run-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      language: 'java',
      code: 'public class Broken { public static void main(String[] args) { System.out.println("Missing semi") } }',
    }),
  });

  const errPayload = await errResponse.json();
  if (!errPayload.error || !errPayload.error.includes(';')) {
    throw new Error(`Expected syntax error, got: ${JSON.stringify(errPayload)}`);
  }

  await closeServer(server);
  console.log('All Java code runner tests passed.');
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
