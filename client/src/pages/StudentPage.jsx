import { useEffect, useRef, useState } from "react";
import CodeEditor from "../components/CodeEditor";
import OutputPanel from "../components/OutputPanel";
import useCodeSync from "../hooks/useCodeSync";
import useSocketStatus from "../hooks/useSocketStatus";
import { preparePython, runPython } from "../services/pythonRunner";
import socket from "../services/socket";

const STARTER_CODE = 'print("Hello, Student!")';

function StudentPage() {
  const [nameInput, setNameInput] = useState("");
  const [studentName, setStudentName] = useState("");
  const [code, setCode] = useState(STARTER_CODE);
  const [output, setOutput] = useState("");
  const [runError, setRunError] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [pythonStatus, setPythonStatus] = useState("loading");
  const codeRef = useRef(code);
  const isConnected = useSocketStatus();
  const emitCodeChange = useCodeSync();

  useEffect(() => {
    if (!studentName) {
      return undefined;
    }

    const joinClass = () => {
      socket.emit("join-class", studentName);
      socket.emit("code-change", codeRef.current);
    };

    if (socket.connected) {
      joinClass();
    }

    socket.on("connect", joinClass);

    return () => {
      socket.off("connect", joinClass);
    };
  }, [studentName]);

  useEffect(() => {
    if (!studentName) {
      return;
    }

    let isActive = true;

    preparePython()
      .then(() => {
        if (isActive) {
          setPythonStatus("ready");
        }
      })
      .catch(() => {
        if (isActive) {
          setPythonStatus("error");
        }
      });

    return () => {
      isActive = false;
    };
  }, [studentName]);

  const handleJoin = (event) => {
    event.preventDefault();
    const cleanName = nameInput.trim();

    if (cleanName) {
      setStudentName(cleanName);
    }
  };

  const handleCodeChange = (nextCode) => {
    codeRef.current = nextCode;
    setCode(nextCode);
    emitCodeChange(nextCode);
  };

  const handleRun = async () => {
    setIsRunning(true);
    setOutput("");
    setRunError("");
    socket.emit("execution-change", {
      status: "running",
      output: "",
      error: "",
    });

    try {
      const result = await runPython(code);
      const nextOutput = result.output || "Program finished with no output.";
      const nextError = result.error || "";

      setOutput(nextOutput);
      setRunError(nextError);
      socket.emit("execution-change", {
        status: "completed",
        output: nextOutput,
        error: nextError,
      });
    } catch (error) {
      const message = error.message || "Unable to execute Python.";

      setRunError(message);
      socket.emit("execution-change", {
        status: "completed",
        output: "",
        error: message,
      });
    } finally {
      setIsRunning(false);
    }
  };

  if (!studentName) {
    return (
      <main className="join-page">
        <form className="join-card" onSubmit={handleJoin}>
          <p className="eyebrow">Python Classroom</p>
          <h1>Join your class</h1>
          <label htmlFor="student-name">Your name</label>
          <input
            id="student-name"
            maxLength={40}
            onChange={(event) => setNameInput(event.target.value)}
            placeholder="e.g. Anush"
            value={nameInput}
            autoFocus
          />
          <button type="submit" disabled={!nameInput.trim()}>
            Open editor
          </button>
          <span className={`connection ${isConnected ? "online" : ""}`}>
            {isConnected ? "Connected" : "Connecting..."}
          </span>
        </form>
      </main>
    );
  }

  return (
    <main className="student-page">
      <header className="app-header">
        <div>
          <p className="eyebrow">Python Classroom</p>
          <h1>Student Editor</h1>
        </div>
        <span className={`connection ${isConnected ? "online" : ""}`}>
          {isConnected ? `Online as ${studentName}` : "Reconnecting..."}
        </span>
      </header>

      <section className="student-editor">
        <CodeEditor code={code} onChange={handleCodeChange} />
      </section>

      <OutputPanel
        output={output}
        error={runError}
        status={isRunning ? "running" : output || runError ? "completed" : "idle"}
        runtimeStatus={pythonStatus}
      />

      <footer className="app-footer">
        <button
          type="button"
          onClick={handleRun}
          disabled={isRunning || pythonStatus === "loading"}
        >
          {isRunning
            ? "Running..."
            : pythonStatus === "loading"
              ? "Preparing Python..."
              : "▶ Run Code"}
        </button>
        <span>Python 3 · Browser runtime</span>
      </footer>
    </main>
  );
}

export default StudentPage;
