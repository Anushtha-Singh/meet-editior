const MAX_NAME_LENGTH = 40;
const MAX_CODE_LENGTH = 100_000;
const MAX_OUTPUT_LENGTH = 20_000;

const serializeStudents = (students) =>
    Array.from(students.values()).map(({ socketId, name, code, execution }) => ({
        socketId,
        name,
        code,
        execution,
    }));

const registerClassroomHandlers = (io) => {
    const students = new Map();

    const broadcastStudents = () => {
        io.emit("students-update", serializeStudents(students));
    };

    io.on("connection", (socket) => {
        console.log("Client Connected:", socket.id);

        socket.on("teacher-join", () => {
            socket.emit("students-update", serializeStudents(students));
        });

        socket.on("join-class", (rawName) => {
            if (typeof rawName !== "string") {
                return;
            }

            const name = rawName.trim().slice(0, MAX_NAME_LENGTH);

            if (!name) {
                return;
            }

            const existingStudent = students.get(socket.id);

            students.set(socket.id, {
                socketId: socket.id,
                name,
                code: existingStudent?.code ?? "",
                execution: existingStudent?.execution ?? {
                    status: "idle",
                    output: "",
                    error: "",
                },
            });

            broadcastStudents();
        });

        socket.on("execution-change", (rawExecution) => {
            const student = students.get(socket.id);

            if (!student || !rawExecution || typeof rawExecution !== "object") {
                return;
            }

            const execution = {
                status: rawExecution.status === "running" ? "running" : "completed",
                output:
                    typeof rawExecution.output === "string"
                        ? rawExecution.output.slice(0, MAX_OUTPUT_LENGTH)
                        : "",
                error:
                    typeof rawExecution.error === "string"
                        ? rawExecution.error.slice(0, MAX_OUTPUT_LENGTH)
                        : "",
            };

            student.execution = execution;
            students.set(socket.id, student);
            socket.broadcast.emit("execution-update", {
                socketId: socket.id,
                execution,
            });
        });

        socket.on("code-change", (rawCode) => {
            const student = students.get(socket.id);

            if (!student || typeof rawCode !== "string") {
                return;
            }

            student.code = rawCode.slice(0, MAX_CODE_LENGTH);
            students.set(socket.id, student);

            socket.broadcast.emit("code-update", {
                socketId: socket.id,
                code: student.code,
            });
        });

        socket.on("disconnect", () => {
            console.log("Client Disconnected:", socket.id);

            if (students.delete(socket.id)) {
                broadcastStudents();
            }
        });
    });
};

module.exports = registerClassroomHandlers;
