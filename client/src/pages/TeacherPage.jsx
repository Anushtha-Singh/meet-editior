import { useCallback, useEffect, useState } from "react";
import CodeEditor from "../components/CodeEditor";
import OutputPanel from "../components/OutputPanel";
import PresentationViewer from "../components/PresentationViewer";
import useSharedClassroom from "../hooks/useSharedClassroom";
import useSocketStatus from "../hooks/useSocketStatus";
import socket from "../services/socket";

const MAX_PDF_SIZE = 8 * 1024 * 1024;

function TeacherPage() {
  const [students, setStudents] = useState([]);
  const [activeTab, setActiveTab] = useState("students");
  const [annotationTool, setAnnotationTool] = useState("pen");
  const [annotationColor, setAnnotationColor] = useState("#ef4444");
  const [uploadError, setUploadError] = useState("");
  const isConnected = useSocketStatus();
  const { teacherCode, setTeacherCode, presentation } = useSharedClassroom();

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

    if (socket.connected) {
      joinAsTeacher();
    }

    socket.on("connect", joinAsTeacher);
    socket.on("code-update", handleCodeUpdate);
    socket.on("execution-update", handleExecutionUpdate);
    socket.on("students-update", handleStudentsUpdate);

    return () => {
      socket.off("connect", joinAsTeacher);
      socket.off("code-update", handleCodeUpdate);
      socket.off("execution-update", handleExecutionUpdate);
      socket.off("students-update", handleStudentsUpdate);
    };
  }, []);

  const handleTeacherCodeChange = (code) => {
    setTeacherCode(code);
    socket.emit("teacher-code-change", code);
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
          <p className="eyebrow">Python Classroom</p>
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
              <article className="student-card" key={student.socketId}>
                <div className="student-card-header">
                  <strong>{student.name}</strong>
                  <span title={student.socketId}>
                    #{student.socketId.slice(0, 6)}
                  </span>
                </div>
                <div className="teacher-editor">
                  <CodeEditor code={student.code} readOnly />
                </div>
                <OutputPanel
                  output={student.execution?.output}
                  error={student.execution?.error}
                  status={student.execution?.status}
                  compact
                />
              </article>
            ))}
          </section>
        ))}

      {activeTab === "code" && (
        <section className="teacher-shared-editor">
          <div className="shared-workspace-title">
            <strong>Code shared with every student</strong>
            <span>Updates live</span>
          </div>
          <div className="shared-editor">
            <CodeEditor
              code={teacherCode}
              onChange={handleTeacherCodeChange}
              mobileToolbar
            />
          </div>
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
