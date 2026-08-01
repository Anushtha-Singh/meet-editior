import { useState } from "react";
import socket from "../services/socket";
import CodeEditor from "./CodeEditor";
import OutputPanel from "./OutputPanel";

function StudentMonitorCard({ student }) {
  const [isEditing, setIsEditing] = useState(false);
  const [selectedLine, setSelectedLine] = useState(student.feedback?.line ?? 1);
  const [message, setMessage] = useState(student.feedback?.message ?? "");

  const sendFeedback = () => {
    socket.emit("teacher-student-feedback", {
      socketId: student.socketId,
      line: selectedLine,
      message: message.trim() || "Please review this line.",
    });
  };

  const clearFeedback = () => {
    setMessage("");
    socket.emit("teacher-student-feedback", {
      socketId: student.socketId,
      line: null,
    });
  };

  return (
    <article className="student-card">
      <div className="student-card-header">
        <strong>{student.name}</strong>
        <span title={student.socketId}>#{student.socketId.slice(0, 6)}</span>
      </div>

      <div className="student-review-controls">
        <button
          className={isEditing ? "danger-button" : "secondary-button"}
          type="button"
          onClick={() => setIsEditing((current) => !current)}
        >
          {isEditing ? "Stop editing" : "Edit student code"}
        </button>
        <span>
          {isEditing
            ? "Teacher edit mode: latest change wins"
            : `Selected line: ${selectedLine}`}
        </span>
      </div>

      <div className="teacher-editor">
        <CodeEditor
          code={student.code}
          readOnly={!isEditing}
          highlightedLine={student.feedback?.line ?? selectedLine}
          onCursorLineChange={setSelectedLine}
          onChange={(code) =>
            socket.emit("teacher-edit-student", {
              socketId: student.socketId,
              code,
            })
          }
        />
      </div>

      <div className="student-feedback-controls">
        <input
          value={message}
          maxLength={200}
          placeholder="What should the student change?"
          onChange={(event) => setMessage(event.target.value)}
        />
        <button type="button" onClick={sendFeedback}>
          Mark line {selectedLine}
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={!student.feedback}
          onClick={clearFeedback}
        >
          Clear
        </button>
      </div>

      <OutputPanel
        output={student.execution?.output}
        error={student.execution?.error}
        status={student.execution?.status}
        compact
      />
    </article>
  );
}

export default StudentMonitorCard;
