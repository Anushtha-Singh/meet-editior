import { useEffect, useState } from "react";
import CodeEditor from "../components/CodeEditor";
import OutputPanel from "../components/OutputPanel";
import useSocketStatus from "../hooks/useSocketStatus";
import socket from "../services/socket";

function TeacherPage() {
  const [students, setStudents] = useState([]);
  const isConnected = useSocketStatus();

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

      {students.length === 0 ? (
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
      )}
    </main>
  );
}

export default TeacherPage;
