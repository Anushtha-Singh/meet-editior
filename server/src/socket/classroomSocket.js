const MAX_NAME_LENGTH = 40;
const MAX_CODE_LENGTH = 100_000;
const MAX_OUTPUT_LENGTH = 20_000;
const MAX_PDF_DATA_LENGTH = 11_000_000;
const MAX_ANNOTATION_STROKES = 2_000;
const MAX_POINTS_PER_STROKE = 1_000;

const serializeStudents = (students) =>
    Array.from(students.values()).map(({ socketId, name, code, execution, feedback }) => ({
        socketId,
        name,
        code,
        execution,
        feedback,
    }));

const registerClassroomHandlers = (io) => {
    const students = new Map();
    let teacherCode = '# Welcome to class\nprint("Follow along!")';
    let presentation = {
        name: "",
        data: "",
        page: 1,
        pageCount: 0,
        strokes: [],
    };

    const broadcastStudents = () => {
        io.emit("students-update", serializeStudents(students));
    };

    const sendSharedContent = (socket) => {
        socket.emit("teacher-code-update", teacherCode);
        socket.emit("presentation-state", presentation);
    };

    io.on("connection", (socket) => {
        console.log("Client Connected:", socket.id);

        socket.on("teacher-join", () => {
            socket.emit("students-update", serializeStudents(students));
            sendSharedContent(socket);
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
                feedback: existingStudent?.feedback ?? null,
            });

            broadcastStudents();
            sendSharedContent(socket);
        });

        socket.on("teacher-code-change", (rawCode) => {
            if (typeof rawCode !== "string") {
                return;
            }

            teacherCode = rawCode.slice(0, MAX_CODE_LENGTH);
            socket.broadcast.emit("teacher-code-update", teacherCode);
        });

        socket.on("teacher-edit-student", (payload) => {
            const student = students.get(payload?.socketId);

            if (!student || typeof payload.code !== "string") {
                return;
            }

            student.code = payload.code.slice(0, MAX_CODE_LENGTH);
            students.set(student.socketId, student);

            io.to(student.socketId).emit("teacher-code-replace", student.code);
            io.emit("code-update", {
                socketId: student.socketId,
                code: student.code,
            });
        });

        socket.on("teacher-student-feedback", (payload) => {
            const student = students.get(payload?.socketId);

            if (!student) {
                return;
            }

            if (payload.line === null) {
                student.feedback = null;
            } else {
                const line = Number(payload.line);

                if (!Number.isInteger(line) || line < 1 || line > 10_000) {
                    return;
                }

                student.feedback = {
                    line,
                    message:
                        typeof payload.message === "string"
                            ? payload.message.trim().slice(0, 200)
                            : "Please review this line.",
                };
            }

            students.set(student.socketId, student);
            io.to(student.socketId).emit("student-feedback", student.feedback);
            socket.emit("student-feedback-update", {
                socketId: student.socketId,
                feedback: student.feedback,
            });
        });

        socket.on("presentation-upload", (rawPresentation) => {
            if (
                !rawPresentation ||
                typeof rawPresentation.name !== "string" ||
                typeof rawPresentation.data !== "string" ||
                !rawPresentation.data.startsWith("data:application/pdf;base64,") ||
                rawPresentation.data.length > MAX_PDF_DATA_LENGTH
            ) {
                return;
            }

            presentation = {
                name: rawPresentation.name.slice(0, 120),
                data: rawPresentation.data,
                page: 1,
                pageCount: 0,
                strokes: [],
            };

            io.emit("presentation-state", presentation);
        });

        socket.on("presentation-page-count", (rawPageCount) => {
            const pageCount = Number(rawPageCount);

            if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > 500) {
                return;
            }

            presentation.pageCount = pageCount;
            presentation.page = Math.min(presentation.page, pageCount);
            io.emit("presentation-page-update", {
                page: presentation.page,
                pageCount,
            });
        });

        socket.on("presentation-page-change", (rawPage) => {
            const page = Number(rawPage);

            if (
                !Number.isInteger(page) ||
                page < 1 ||
                page > presentation.pageCount
            ) {
                return;
            }

            presentation.page = page;
            io.emit("presentation-page-update", {
                page,
                pageCount: presentation.pageCount,
            });
        });

        socket.on("annotation-add", (rawStroke) => {
            if (
                !rawStroke ||
                !Array.isArray(rawStroke.points) ||
                rawStroke.points.length < 2 ||
                rawStroke.points.length > MAX_POINTS_PER_STROKE
            ) {
                return;
            }

            const points = rawStroke.points
                .filter(
                    (point) =>
                        Number.isFinite(point?.x) &&
                        Number.isFinite(point?.y) &&
                        point.x >= 0 &&
                        point.x <= 1 &&
                        point.y >= 0 &&
                        point.y <= 1,
                )
                .map(({ x, y }) => ({ x, y }));

            if (points.length < 2) {
                return;
            }

            const stroke = {
                id: `${socket.id}-${Date.now()}`,
                page: presentation.page,
                tool: rawStroke.tool === "highlighter" ? "highlighter" : "pen",
                color:
                    typeof rawStroke.color === "string" &&
                    /^#[0-9a-f]{6}$/i.test(rawStroke.color)
                        ? rawStroke.color
                        : "#ef4444",
                points,
            };

            presentation.strokes.push(stroke);

            if (presentation.strokes.length > MAX_ANNOTATION_STROKES) {
                presentation.strokes.shift();
            }

            io.emit("annotation-update", stroke);
        });

        socket.on("annotations-clear", () => {
            presentation.strokes = presentation.strokes.filter(
                (stroke) => stroke.page !== presentation.page,
            );
            io.emit("annotations-cleared", { page: presentation.page });
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
