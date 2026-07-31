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

export const runPython = async (code) => {
  await preparePython();
  return sendRequest({ type: "run", code }, EXECUTION_TIMEOUT_MS);
};
