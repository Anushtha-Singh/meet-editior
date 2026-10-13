import { useEffect, useRef, useState } from "react";
import CodeEditor from "../components/CodeEditor";
import OutputPanel from "../components/OutputPanel";
import PresentationViewer from "../components/PresentationViewer";
import useCodeSync from "../hooks/useCodeSync";
import useSharedClassroom from "../hooks/useSharedClassroom";
import useSocketStatus from "../hooks/useSocketStatus";
import { runC } from "../services/cRunner";
import { runJava } from "../services/javaRunner";
import { preparePython, runPython } from "../services/pythonRunner";
import socket from "../services/socket";

const STARTER_CODE = {
  python: 'print("Hello, Student!")',
  c: '#include <stdio.h>\n\nint main() {\n  printf("Hello, Student!\\n");\n  return 0;\n}',
  java: 'public class Main {\n  public static void main(String[] args) {\n    System.out.println("Hello, Student!");\n  }\n}',
};

const DEFAULT_PROJECT_FILES = {
  "data.txt": "Alice\nBob\nCharlie\n",
  "notes.txt": "Hello Python!\nThis is a new line.\n",
  "story.txt": "Once upon a time there was a programmer who loved Python.\n",
  "diary.txt": "12 May 2025:\nLearned file handling.\n",
  "poem.txt": "Twinkle, twinkle,\nlittle star,\nHow I wonder what you are!\n",
  "marks.txt": "Anu, 95\nRavi, 88\n",
  "info.txt": "Name: Anu\nAge: 18\nCity: Delhi\n",
  "main.py": 'print("Hello, Student!")',
};

function StudentPage() {
  const [nameInput, setNameInput] = useState("");
  const [studentName, setStudentName] = useState("");
  const [language, setLanguage] = useState("python");
  const [projectFiles, setProjectFiles] = useState(DEFAULT_PROJECT_FILES);
  const [activeFileName, setActiveFileName] = useState("main.py");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const code = projectFiles[activeFileName] ?? "";
  const editorLanguage =
    activeFileName.endsWith(".c")
      ? "c"
      : activeFileName.endsWith(".java")
        ? "java"
        : activeFileName.endsWith(".py")
          ? "python"
          : "plaintext";
  const [output, setOutput] = useState("");
  const [runError, setRunError] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [pythonStatus, setPythonStatus] = useState("loading");
  const [cStatus] = useState("ready");
  const [javaStatus] = useState("ready");
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
    setProjectFiles((current) => ({
      ...current,
      [activeFileName]: nextCode,
    }));
    emitCodeChange(nextCode);
  };

  const handleLanguageChange = (nextLanguage) => {
    setLanguage(nextLanguage);
    setOutput("");
    setRunError("");

    if (nextLanguage === "c") {
      const cStarter =
        projectFiles["main.c"] ??
        '#include <stdio.h>\n\nint main() {\n  printf("Hello from C!\\n");\n  return 0;\n}';

      setProjectFiles((current) => ({
        ...current,
        "main.c": cStarter,
      }));
      setActiveFileName("main.c");
      codeRef.current = cStarter;
      return;
    }

    if (nextLanguage === "java") {
      const javaStarter =
        projectFiles["Main.java"] ?? STARTER_CODE.java;

      setProjectFiles((current) => ({
        ...current,
        "Main.java": javaStarter,
      }));
      setActiveFileName("Main.java");
      codeRef.current = javaStarter;
      return;
    }

    const pythonStarter =
      projectFiles["main.py"] ??
      'print("Hello, Student!")';

    setProjectFiles((current) => ({
      ...current,
      "main.py": pythonStarter,
    }));
    setActiveFileName("main.py");
    codeRef.current = pythonStarter;
  };

  const handleRun = async () => {
    setIsRunning(true);
    socket.emit("execution-change", {
      status: "running",
      output,
      error: runError,
    });

    try {
      const syncedProjectFiles = {
        ...projectFiles,
        [activeFileName]: codeRef.current,
      };
      const pythonEntryFile =
        language === "python" && !activeFileName.endsWith(".py")
          ? "main.py"
          : activeFileName;
      const pythonCode = syncedProjectFiles[pythonEntryFile] ?? codeRef.current;

      const javaEntryFile =
        language === "java" && !activeFileName.endsWith(".java")
          ? (syncedProjectFiles["Main.java"] ? "Main.java" : activeFileName)
          : activeFileName;
      const javaCode = syncedProjectFiles[javaEntryFile] ?? codeRef.current;

      const cEntryFile =
        language === "c" && !activeFileName.endsWith(".c")
          ? (syncedProjectFiles["main.c"] ? "main.c" : activeFileName)
          : activeFileName;
      const cCode = syncedProjectFiles[cEntryFile] ?? codeRef.current;

      const result =
        language === "c"
          ? await runC(cCode)
          : language === "java"
            ? await runJava(javaCode)
            : await runPython(pythonCode, syncedProjectFiles);
      const nextOutput =
        typeof result.output === "string"
          ? result.output || "Program finished with no output."
          : String(result.output ?? "Program finished with no output.");
      const nextError =
        typeof result.error === "string"
          ? result.error
          : result.error && typeof result.error.message === "string"
            ? result.error.message
            : String(result.error ?? "");

      if (result && result.files && typeof result.files === "object") {
        setProjectFiles((current) => ({
          ...current,
          ...result.files,
        }));
      }

      setOutput(nextOutput);
      setRunError(nextError);
      socket.emit("execution-change", {
        status: "completed",
        output: nextOutput,
        error: nextError,
      });
    } catch (error) {
      const languageLabel =
        language === "c" ? "C" : language === "java" ? "Java" : "Python";
      const message =
        error && typeof error.message === "string"
          ? error.message
          : String(error ?? `Unable to execute ${languageLabel}.`);

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

  const handleCreateFile = () => {
    const ext = language === "java" ? "java" : language === "c" ? "c" : "py";
    const existingFiles = Object.keys(projectFiles);
    const fileCount = existingFiles.filter((name) =>
      name.endsWith(`.${ext}`),
    ).length;

    let fileName;
    let starterContent = "";

    if (language === "java") {
      const className = `Class${fileCount + 1}`;
      fileName = `${className}.java`;
      starterContent = `public class ${className} {\n  public static void main(String[] args) {\n    System.out.println("Hello from ${className}!");\n  }\n}\n`;
    } else if (language === "c") {
      fileName = `file${fileCount + 1}.c`;
      starterContent = `#include <stdio.h>\n\nint main() {\n  printf("Hello from ${fileName}!\\n");\n  return 0;\n}\n`;
    } else {
      fileName = `file${fileCount + 1}.py`;
      starterContent = `print("Hello from ${fileName}!")\n`;
    }

    setProjectFiles((current) => ({
      ...current,
      [fileName]: starterContent,
    }));
    setActiveFileName(fileName);
    codeRef.current = starterContent;
  };

  const handleRenameFile = () => {
    const nextName = window.prompt("Rename file", activeFileName);

    if (!nextName) {
      return;
    }

    const cleanName = nextName.trim();

    if (!cleanName || cleanName === activeFileName) {
      return;
    }

    if (projectFiles[cleanName]) {
      setRunError("A file with that name already exists.");
      return;
    }

    setProjectFiles((current) => {
      const nextFiles = { ...current };
      nextFiles[cleanName] = nextFiles[activeFileName];
      delete nextFiles[activeFileName];
      return nextFiles;
    });
    setActiveFileName(cleanName);
  };

  const handleDeleteFile = () => {
    if (Object.keys(projectFiles).length <= 1) {
      setRunError("Keep at least one file in the project.");
      return;
    }

    const nextFiles = { ...projectFiles };
    delete nextFiles[activeFileName];
    const remaining = Object.keys(nextFiles);

    setProjectFiles(nextFiles);
    setActiveFileName(remaining[0]);
  };

  if (!studentName) {
    return (
      <main className="join-page">
        <form className="join-card" onSubmit={handleJoin}>
          <p className="eyebrow">Code Classroom</p>
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
          <p className="eyebrow">Code Classroom</p>
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
            <div className={`student-file-panel ${isSidebarOpen ? "" : "sidebar-collapsed"}`}>
              {isSidebarOpen && (
                <div className="file-sidebar">
                  <div className="file-sidebar-header">
                    <strong>Files</strong>
                    <div className="file-sidebar-actions">
                      <button type="button" onClick={handleCreateFile}>
                        + New
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label="Hide files panel"
                        onClick={() => setIsSidebarOpen(false)}
                      >
                        ‹
                      </button>
                    </div>
                  </div>
                  <div className="file-list">
                    {Object.keys(projectFiles).map((fileName) => (
                      <button
                        key={fileName}
                        type="button"
                        className={
                          activeFileName === fileName ? "file-item active" : "file-item"
                        }
                        onClick={() => setActiveFileName(fileName)}
                      >
                        {fileName}
                      </button>
                    ))}
                  </div>
                  <div className="file-toolbar">
                    <button type="button" onClick={handleRenameFile}>
                      Rename
                    </button>
                    <button type="button" onClick={handleDeleteFile}>
                      Delete
                    </button>
                  </div>
                </div>
              )}

              {!isSidebarOpen && (
                <button
                  type="button"
                  className="sidebar-toggle-button"
                  aria-label="Show files panel"
                  onClick={() => setIsSidebarOpen(true)}
                >
                  Files
                </button>
              )}

              <div className="file-editor-layout">
                <div className="editor-language-picker editor-language-picker-inline">
                  <label htmlFor="student-language">Language</label>
                  <select
                    id="student-language"
                    className="language-select"
                    value={language}
                    onChange={(event) => handleLanguageChange(event.target.value)}
                  >
                    <option value="python">Python</option>
                    <option value="c">C</option>
                    <option value="java">Java</option>
                  </select>
                </div>
                <CodeEditor
                  code={code}
                  language={editorLanguage}
                  onChange={handleCodeChange}
                  highlightedLine={teacherFeedback?.line}
                  mobileToolbar
                />
              </div>
            </div>
          </section>

          <OutputPanel
            output={output}
            error={runError}
            status={
              isRunning ? "running" : output || runError ? "completed" : "idle"
            }
            runtimeStatus={
              language === "c"
                ? cStatus
                : language === "java"
                  ? javaStatus
                  : pythonStatus
            }
            language={
              language === "c" ? "C" : language === "java" ? "Java" : "Python"
            }
            resizable
          />

          <footer className="app-footer">
            <button
              type="button"
              onClick={handleRun}
              disabled={
                isRunning ||
                (language === "python" && pythonStatus === "loading")
              }
            >
              {isRunning
                ? "Running..."
                : language === "python" && pythonStatus === "loading"
                  ? "Preparing Python..."
                  : "▶ Run Code"}
            </button>
            <span>
              {language === "c"
                ? "C · GCC runtime"
                : language === "java"
                  ? "Java · JDK runtime"
                  : "Python 3 · Browser runtime"}
            </span>
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
              language={
                teacherCode?.includes("#include")
                  ? "c"
                  : teacherCode?.includes("class ") ||
                      teacherCode?.includes("System.out")
                    ? "java"
                    : "python"
              }
              readOnly
              remoteUpdates
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
