const EXECUTION_TIMEOUT_MS = 10_000;
const PREPARATION_TIMEOUT_MS = 60_000;

let worker;
let nextRequestId = 0;
const pendingRequests = new Map();

const createWorker = () => {
  const nextWorker = new Worker(
    new URL("../workers/pythonRunner.worker.js", import.meta.url),
    { type: "module" },
  );

  nextWorker.onmessage = ({ data }) => {
    const request = pendingRequests.get(data.id);

    if (!request) {
      return;
    }

    clearTimeout(request.timeoutId);
    pendingRequests.delete(data.id);
    request.resolve(data);
  };

  nextWorker.onerror = (event) => {
    const message = event.message || "Python runtime failed to load.";

    for (const request of pendingRequests.values()) {
      clearTimeout(request.timeoutId);
      request.reject(new Error(message));
    }

    pendingRequests.clear();
    nextWorker.terminate();

    if (worker === nextWorker) {
      worker = undefined;
    }
  };

  return nextWorker;
};

const getWorker = () => {
  if (!worker) {
    worker = createWorker();
  }

  return worker;
};

const sendRequest = (message, timeoutMs) =>
  new Promise((resolve, reject) => {
    const activeWorker = getWorker();
    const id = ++nextRequestId;
    const timeoutId = setTimeout(() => {
      activeWorker.terminate();

      if (worker === activeWorker) {
        worker = undefined;
      }

      const timeoutMessage =
        timeoutMs === PREPARATION_TIMEOUT_MS
          ? "Python runtime took too long to load."
          : "Execution stopped after 10 seconds.";

      for (const request of pendingRequests.values()) {
        clearTimeout(request.timeoutId);
        request.reject(new Error(timeoutMessage));
      }

      pendingRequests.clear();
    }, timeoutMs);

    pendingRequests.set(id, { resolve, reject, timeoutId });
    activeWorker.postMessage({ id, ...message });
  });

const getPromptInputValues = (code) => {
  const inputCalls = code.match(/\binput\s*\(/g) || [];

  if (inputCalls.length === 0) {
    return [];
  }

  const values = [];

  for (let index = 0; index < inputCalls.length; index += 1) {
    const value = window.prompt(`Python input ${index + 1}`, "");

    if (value === null) {
      throw new Error("Execution cancelled before all inputs were provided.");
    }

    values.push(value);
  }

  return values;
};

let preparationPromise;

export const preparePython = () => {
  if (!preparationPromise) {
    preparationPromise = sendRequest(
      { type: "prepare" },
      PREPARATION_TIMEOUT_MS,
    ).catch((error) => {
      preparationPromise = undefined;
      throw error;
    });
  }

  return preparationPromise;
};

export const runPython = async (code, projectFiles = {}) => {
  await preparePython();
  const inputValues = getPromptInputValues(code);
  return sendRequest(
    { type: "run", code, input: inputValues, files: projectFiles },
    EXECUTION_TIMEOUT_MS,
  );
};
