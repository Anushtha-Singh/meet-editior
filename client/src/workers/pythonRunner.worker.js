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

self.onmessage = async ({ data: { id, type, code, input: inputValues = [] } }) => {
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

    const inputQueue = [...(Array.isArray(inputValues) ? inputValues : [])];

    pyodide.FS.mkdir("/workspace");
    pyodide.FS.chdir("/workspace");

    if (!pyodide.FS.analyzePath("/workspace/data.txt").exists) {
      pyodide.FS.writeFile(
        "/workspace/data.txt",
        "Alice\nBob\nCharlie\n",
      );
    }

    if (!pyodide.FS.analyzePath("/workspace/hello.py").exists) {
      pyodide.FS.writeFile(
        "/workspace/hello.py",
        'file = open("data.txt", "r")\nprint(file.read())\n',
      );
    }

    pyodide.setStdin({
      stdin: () => {
        const nextValue = inputQueue.shift();

        if (nextValue === undefined) {
          return "";
        }

        return `${String(nextValue)}\n`;
      },
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
