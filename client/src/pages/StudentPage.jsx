import { useEffect, useRef, useState } from "react";
import CodeEditor from "../components/CodeEditor";
import OutputPanel from "../components/OutputPanel";
import PresentationViewer from "../components/PresentationViewer";
import useCodeSync from "../hooks/useCodeSync";
import useSharedClassroom from "../hooks/useSharedClassroom";
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
  const [activeTab, setActiveTab] = useState("code");
  const [teacherFeedback, setTeacherFeedback] = useState(null);
  const [studentPdfPage, setStudentPdfPage] = useState(null);
  const codeRef = useRef(code);
  const isConnected = useSocketStatus();
  const emitCodeChange = useCodeSync();
  const { teacherCode, teacherExecution, presentation } = useSharedClassroom();
  const displayedPdfPage = presentation.pageCount
    ? Math.min(studentPdfPage ?? presentation.page, presentation.pageCount)
    : 1;
  const isFollowingTeacher = studentPdfPage === null;

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
    socket.on("student-feedback", setTeacherFeedback);

    return () => {
      socket.off("student-feedback", setTeacherFeedback);
    };
  }, []);

  useEffect(() => {
    if (!studentName) {
      return undefined;
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

      <nav className="workspace-tabs" aria-label="Student workspace">
        <button
          className={activeTab === "code" ? "active" : ""}
          type="button"
          onClick={() => setActiveTab("code")}
        >
          My Code
        </button>
        <button
          className={activeTab === "teacher" ? "active" : ""}
          type="button"
          onClick={() => setActiveTab("teacher")}
        >
          Teacher Code
        </button>
        <button
          className={activeTab === "slides" ? "active" : ""}
          type="button"
          onClick={() => setActiveTab("slides")}
        >
          Presentation
        </button>
      </nav>

      {activeTab === "code" && (
        <div className="student-workspace">
          {teacherFeedback && (
            <div className="teacher-feedback-banner">
              <div>
                <strong>
                  Teacher note on line {teacherFeedback.line}: {" "}
                  {teacherFeedback.message}
                </strong>
              </div>
              <button
                type="button"
                onClick={() => {
                  setTeacherFeedback(null);
                }}
              >
                Dismiss
              </button>
            </div>
          )}
          <section className="student-editor">
            <CodeEditor
              code={code}
              onChange={handleCodeChange}
              highlightedLine={teacherFeedback?.line}
              mobileToolbar
            />
          </section>

          <OutputPanel
            output={output}
            error={runError}
            status={
              isRunning ? "running" : output || runError ? "completed" : "idle"
            }
            runtimeStatus={pythonStatus}
            resizable
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
        </div>
      )}

      {activeTab === "teacher" && (
        <section className="shared-workspace">
          <div className="shared-workspace-title">
            <strong>Teacher’s live editor</strong>
            <span>Read only</span>
          </div>
          <div className="shared-editor">
            <CodeEditor
              code={teacherCode || "# Waiting for the teacher to type..."}
              readOnly
            />
          </div>
          <OutputPanel
            output={teacherExecution.output}
            error={teacherExecution.error}
            status={teacherExecution.status}
            resizable
          />
        </section>
      )}

      {activeTab === "slides" && (
        <section className="shared-workspace">
          <div className="shared-workspace-title">
            <strong>{presentation.name || "Class presentation"}</strong>
            <div className="presentation-student-controls">
              <span>
                {presentation.pageCount
                  ? `Page ${displayedPdfPage} of ${presentation.pageCount}`
                  : "Waiting for PDF"}
              </span>
              <button
                type="button"
                aria-label="Previous PDF page"
                disabled={!presentation.pageCount || displayedPdfPage <= 1}
                onClick={() =>
                  setStudentPdfPage(Math.max(displayedPdfPage - 1, 1))
                }
              >
                ‹
              </button>
              <button
                type="button"
                aria-label="Next PDF page"
                disabled={
                  !presentation.pageCount ||
                  displayedPdfPage >= presentation.pageCount
                }
                onClick={() =>
                  setStudentPdfPage(
                    Math.min(displayedPdfPage + 1, presentation.pageCount),
                  )
                }
              >
                ›
              </button>
              <button
                className="follow-teacher-button"
                type="button"
                disabled={isFollowingTeacher}
                onClick={() => setStudentPdfPage(null)}
              >
                {isFollowingTeacher ? "Following" : "Follow teacher"}
              </button>
              <small>Pinch to zoom</small>
            </div>
          </div>
          <PresentationViewer
            presentation={{ ...presentation, page: displayedPdfPage }}
          />
        </section>
      )}
    </main>
  );
}

export default StudentPage;
