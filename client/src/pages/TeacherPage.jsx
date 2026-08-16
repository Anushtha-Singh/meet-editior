import { useCallback, useEffect, useState } from "react";
import CodeEditor from "../components/CodeEditor";
import OutputPanel from "../components/OutputPanel";
import PresentationViewer from "../components/PresentationViewer";
import StudentMonitorCard from "../components/StudentMonitorCard";
import useSharedClassroom from "../hooks/useSharedClassroom";
import useSocketStatus from "../hooks/useSocketStatus";
import { runC } from "../services/cRunner";
import { preparePython, runPython } from "../services/pythonRunner";
import socket from "../services/socket";

const MAX_PDF_SIZE = 8 * 1024 * 1024;
const DEFAULT_TEACHER_CODE = {
  python: 'print("Follow along!")',
  c: '#include <stdio.h>\n\nint main() {\n  printf("Follow along!\\n");\n  return 0;\n}',
};

function TeacherPage() {
  const [students, setStudents] = useState([]);
  const [activeTab, setActiveTab] = useState("students");
  const [annotationTool, setAnnotationTool] = useState("pen");
  const [annotationColor, setAnnotationColor] = useState("#ef4444");
  const [uploadError, setUploadError] = useState("");
  const [isTeacherRunning, setIsTeacherRunning] = useState(false);
  const [localTeacherExecution, setLocalTeacherExecution] = useState(null);
  const [pythonStatus, setPythonStatus] = useState("loading");
  const [cStatus, setCStatus] = useState("ready");
  const [language, setLanguage] = useState("python");
  const isConnected = useSocketStatus();
  const { teacherCode, setTeacherCode, teacherExecution, presentation } =
    useSharedClassroom();

  useEffect(() => {
    const joinAsTeacher = () => socket.emit("teacher-join");
    const handleStudentsUpdate = (nextStudents) => {
      setStudents(Array.isArray(nextStudents) ? nextStudents : []);
    };
    const handleCodeUpdate = ({ socketId, code } = {}) => {
      setStudents((currentStudents) =>
        currentStudents.map((student) =>
          student.socketId === socketId ? { ...student, code } : student,
        ),
      );
    };
    const handleExecutionUpdate = ({ socketId, execution } = {}) => {
      setStudents((currentStudents) =>
        currentStudents.map((student) =>
          student.socketId === socketId ? { ...student, execution } : student,
        ),
      );
    };
    const handleFeedbackUpdate = ({ socketId, feedback } = {}) => {
      setStudents((currentStudents) =>
        currentStudents.map((student) =>
          student.socketId === socketId ? { ...student, feedback } : student,
        ),
      );
    };

    if (socket.connected) {
      joinAsTeacher();
    }

    socket.on("connect", joinAsTeacher);
    socket.on("code-update", handleCodeUpdate);
    socket.on("execution-update", handleExecutionUpdate);
    socket.on("student-feedback-update", handleFeedbackUpdate);
    socket.on("students-update", handleStudentsUpdate);

    return () => {
      socket.off("connect", joinAsTeacher);
      socket.off("code-update", handleCodeUpdate);
      socket.off("execution-update", handleExecutionUpdate);
      socket.off("student-feedback-update", handleFeedbackUpdate);
      socket.off("students-update", handleStudentsUpdate);
    };
  }, []);

  useEffect(() => {
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
  }, []);

  const handleTeacherCodeChange = (code) => {
    setTeacherCode(code);
    socket.emit("teacher-code-change", code);
  };

  const handleLanguageChange = (nextLanguage) => {
    const defaultCode = DEFAULT_TEACHER_CODE[nextLanguage] ?? DEFAULT_TEACHER_CODE.python;
    const isDefaultCode =
      teacherCode.trim() === "" ||
      teacherCode === DEFAULT_TEACHER_CODE.python ||
      teacherCode === DEFAULT_TEACHER_CODE.c;

    setLanguage(nextLanguage);
    setTeacherCode((currentCode) => {
      const safeCurrent = currentCode ?? "";
      if (safeCurrent.trim() && !isDefaultCode) {
        return safeCurrent;
      }
      return defaultCode;
    });
    socket.emit("teacher-code-change", isDefaultCode ? defaultCode : teacherCode);

    if (nextLanguage === "c") {
      setCStatus("ready");
    }
  };

  const handleTeacherRun = async () => {
    setIsTeacherRunning(true);
    const previousExecution = localTeacherExecution ?? {
      status: "idle",
      output: "",
      error: "",
    };

    setLocalTeacherExecution({
      ...previousExecution,
      status: "running",
    });
    socket.emit("teacher-execution-change", {
      status: "running",
      output: previousExecution.output,
      error: previousExecution.error,
    });

    try {
      const result =
        language === "c"
          ? await runC(teacherCode)
          : await runPython(teacherCode);
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

      setLocalTeacherExecution({
        status: "completed",
        output: nextOutput,
        error: nextError,
      });
      socket.emit("teacher-execution-change", {
        status: "completed",
        output: nextOutput,
        error: nextError,
      });
    } catch (error) {
      const message =
        error && typeof error.message === "string"
          ? error.message
          : String(error ?? `Unable to execute ${language === "c" ? "C" : "Python"}.`);

      setLocalTeacherExecution({
        status: "completed",
        output: "",
        error: message,
      });
      socket.emit("teacher-execution-change", {
        status: "completed",
        output: "",
        error: message,
      });
    } finally {
      setIsTeacherRunning(false);
    }
  };

  const handlePdfUpload = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    setUploadError("");

    if (!file) {
      return;
    }

    if (file.type !== "application/pdf") {
      setUploadError("Please choose a PDF file.");
      return;
    }

    if (file.size > MAX_PDF_SIZE) {
      setUploadError("PDF must be smaller than 8 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      socket.emit("presentation-upload", {
        name: file.name,
        data: reader.result,
      });
    };
    reader.onerror = () => setUploadError("Unable to read this PDF.");
    reader.readAsDataURL(file);
  };

  const handlePageCount = useCallback((pageCount) => {
    socket.emit("presentation-page-count", pageCount);
  }, []);

  const changePage = (page) => {
    socket.emit("presentation-page-change", page);
  };

  return (
    <main className="teacher-page">
      <header className="app-header teacher-header">
        <div>
          <p className="eyebrow">Code Classroom</p>
          <h1>Teacher Dashboard</h1>
        </div>
        <div className="teacher-stats">
          <strong>Online Students: {students.length}</strong>
          <span className={`connection ${isConnected ? "online" : ""}`}>
            {isConnected ? "Live" : "Reconnecting..."}
          </span>
        </div>
      </header>

      <nav className="workspace-tabs teacher-tabs" aria-label="Teacher workspace">
        <button
          className={activeTab === "students" ? "active" : ""}
          type="button"
          onClick={() => setActiveTab("students")}
        >
          Students
        </button>
        <button
          className={activeTab === "code" ? "active" : ""}
          type="button"
          onClick={() => setActiveTab("code")}
        >
          My Code
        </button>
        <button
          className={activeTab === "slides" ? "active" : ""}
          type="button"
          onClick={() => setActiveTab("slides")}
        >
          Presentation
        </button>
      </nav>

      {activeTab === "students" &&
        (students.length === 0 ? (
          <section className="empty-state">
            <h2>Waiting for students</h2>
            <p>Student editors will appear here as soon as they join.</p>
          </section>
        ) : (
          <section className="student-grid">
            {students.map((student) => (
              <StudentMonitorCard student={student} key={student.socketId} />
            ))}
          </section>
        ))}

      {activeTab === "code" && (
        <section className="teacher-shared-editor">
          <div className="shared-workspace-title">
            <strong>Code shared with every student</strong>
            <div className="editor-language-picker">
              <label htmlFor="teacher-language">Language</label>
              <select
                id="teacher-language"
                className="language-select"
                value={language}
                onChange={(event) => handleLanguageChange(event.target.value)}
              >
                <option value="python">Python</option>
                <option value="c">C</option>
              </select>
            </div>
            <span>Updates live</span>
          </div>
          <div className="teacher-code-editor-frame">
            <CodeEditor
              code={teacherCode}
              language={language}
              onChange={handleTeacherCodeChange}
              mobileToolbar
            />
          </div>
          <OutputPanel
            output={(localTeacherExecution ?? teacherExecution).output}
            error={(localTeacherExecution ?? teacherExecution).error}
            status={
              isTeacherRunning
                ? "running"
                : (localTeacherExecution ?? teacherExecution).status
            }
            runtimeStatus={language === "c" ? cStatus : pythonStatus}
            language={language === "c" ? "C" : "Python"}
            resizable
          />
          <footer className="app-footer">
            <button
              type="button"
              disabled={
                isTeacherRunning ||
                (language === "python" && pythonStatus === "loading")
              }
              onClick={handleTeacherRun}
            >
              {isTeacherRunning
                ? "Running..."
                : language === "python" && pythonStatus === "loading"
                  ? "Preparing Python..."
                  : "▶ Run Code"}
            </button>
            <span>
              {language === "c" ? "Teacher C preview" : "Teacher Python preview"}
            </span>
          </footer>
        </section>
      )}

      {activeTab === "slides" && (
        <section className="teacher-presentation">
          <div className="presentation-controls">
            <label className="upload-button">
              Upload PDF
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={handlePdfUpload}
              />
            </label>
            <button
              type="button"
              disabled={presentation.page <= 1}
              onClick={() => changePage(presentation.page - 1)}
            >
              Previous
            </button>
            <strong>
              {presentation.pageCount
                ? `${presentation.page} / ${presentation.pageCount}`
                : "No PDF"}
            </strong>
            <button
              type="button"
              disabled={
                !presentation.pageCount ||
                presentation.page >= presentation.pageCount
              }
              onClick={() => changePage(presentation.page + 1)}
            >
              Next
            </button>
            <select
              aria-label="Annotation tool"
              value={annotationTool}
              onChange={(event) => setAnnotationTool(event.target.value)}
            >
              <option value="pen">Pen</option>
              <option value="highlighter">Highlighter</option>
            </select>
            <input
              aria-label="Annotation color"
              type="color"
              value={annotationColor}
              onChange={(event) => setAnnotationColor(event.target.value)}
            />
            <button
              className="secondary-button"
              type="button"
              disabled={!presentation.data}
              onClick={() => socket.emit("annotations-clear")}
            >
              Clear page
            </button>
          </div>
          {uploadError && <p className="form-error">{uploadError}</p>}
          <div className="presentation-name">
            {presentation.name || "Upload a PDF to begin"}
          </div>
          <PresentationViewer
            presentation={presentation}
            canAnnotate
            tool={annotationTool}
            color={annotationColor}
            onPageCount={handlePageCount}
            onStroke={(stroke) => socket.emit("annotation-add", stroke)}
          />
        </section>
      )}
    </main>
  );
}

export default TeacherPage;
