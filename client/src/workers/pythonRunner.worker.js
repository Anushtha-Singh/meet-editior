const PYODIDE_URL =
  "https://cdn.jsdelivr.net/pyodide/v314.0.3/full/pyodide.mjs";

let pyodidePromise;

const getPyodide = async () => {
  if (!pyodidePromise) {
    pyodidePromise = import(/* @vite-ignore */ PYODIDE_URL).then(
      ({ loadPyodide }) => loadPyodide(),
    );
  }

  return pyodidePromise;
};

self.onmessage = async ({ data: { id, type, code } }) => {
  const stdout = [];
  const stderr = [];

  try {
    const pyodide = await getPyodide();

    if (type === "prepare") {
      self.postMessage({ id, ready: true });
      return;
    }

    pyodide.setStdout({
      batched: (message) => stdout.push(message),
    });
    pyodide.setStderr({
      batched: (message) => stderr.push(message),
    });

    await pyodide.loadPackagesFromImports(code);
    await pyodide.runPythonAsync(code);

    self.postMessage({
      id,
      output: [...stdout, ...stderr].join("\n"),
    });
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : String(error),
      output: [...stdout, ...stderr].join("\n"),
    });
  }
};
