const { createServer } = require("http");
const { Server } = require("socket.io");
const { io: createClient } = require("socket.io-client");
const registerClassroomHandlers = require("./classroomSocket");

const waitForEvent = (socket, eventName) =>
    new Promise((resolve) => socket.once(eventName, resolve));

const connectClient = (url) =>
    new Promise((resolve) => {
        const socket = createClient(url);
        socket.once("connect", () => resolve(socket));
    });

const run = async () => {
    const httpServer = createServer();
    const io = new Server(httpServer);
    registerClassroomHandlers(io);

    await new Promise((resolve) => httpServer.listen(0, resolve));

    const { port } = httpServer.address();
    const url = `http://localhost:${port}`;
    const teacher = await connectClient(url);
    const anush = await connectClient(url);
    const rahul = await connectClient(url);

    teacher.emit("teacher-join");
    await waitForEvent(teacher, "students-update");

    const firstJoin = waitForEvent(teacher, "students-update");
    anush.emit("join-class", "Anush");
    await firstJoin;

    const secondJoin = waitForEvent(teacher, "students-update");
    rahul.emit("join-class", "Rahul");
    const joinedStudents = await secondJoin;

    if (joinedStudents.length !== 2) {
        throw new Error("Teacher did not receive both students.");
    }

    const codeUpdate = waitForEvent(teacher, "code-update");
    anush.emit("code-change", 'print("Live")');
    const updatedAnush = await codeUpdate;

    if (
        updatedAnush.socketId !== anush.id ||
        updatedAnush.code !== 'print("Live")'
    ) {
        throw new Error("Teacher did not receive the live code update.");
    }

    const teacherReplacement = waitForEvent(anush, "teacher-code-replace");
    teacher.emit("teacher-edit-student", {
        socketId: anush.id,
        code: 'print("Teacher edited")',
    });

    if ((await teacherReplacement) !== 'print("Teacher edited")') {
        throw new Error("Student did not receive the teacher's code edit.");
    }

    const studentFeedback = waitForEvent(anush, "student-feedback");
    const teacherFeedbackUpdate = waitForEvent(teacher, "student-feedback-update");
    teacher.emit("teacher-student-feedback", {
        socketId: anush.id,
        line: 1,
        message: "Check this print statement.",
    });

    if ((await studentFeedback).line !== 1) {
        throw new Error("Student did not receive line feedback.");
    }

    if ((await teacherFeedbackUpdate).feedback.line !== 1) {
        throw new Error("Teacher feedback state did not update.");
    }

    const executionUpdate = waitForEvent(teacher, "execution-update");
    anush.emit("execution-change", {
        status: "completed",
        output: "Live",
        error: "",
    });
    const executedStudent = await executionUpdate;

    if (executedStudent.execution.output !== "Live") {
        throw new Error("Teacher did not receive the student's output.");
    }

    const teacherCodeUpdate = waitForEvent(anush, "teacher-code-update");
    teacher.emit("teacher-code-change", 'print("Teacher")');

    if ((await teacherCodeUpdate) !== 'print("Teacher")') {
        throw new Error("Student did not receive the teacher's code.");
    }

    const teacherExecutionUpdate = waitForEvent(
        anush,
        "teacher-execution-update",
    );
    teacher.emit("teacher-execution-change", {
        status: "completed",
        output: "Teacher output",
        error: "",
    });

    if ((await teacherExecutionUpdate).output !== "Teacher output") {
        throw new Error("Student did not receive the teacher's output.");
    }

    const presentationState = waitForEvent(anush, "presentation-state");
    teacher.emit("presentation-upload", {
        name: "lesson.pdf",
        data: "data:application/pdf;base64,JVBERi0=",
    });

    if ((await presentationState).name !== "lesson.pdf") {
        throw new Error("Student did not receive the presentation.");
    }

    const pageUpdate = waitForEvent(anush, "presentation-page-update");
    teacher.emit("presentation-page-count", 3);

    if ((await pageUpdate).pageCount !== 3) {
        throw new Error("Student did not receive the presentation page count.");
    }

    const annotationUpdate = waitForEvent(anush, "annotation-update");
    teacher.emit("annotation-add", {
        tool: "pen",
        color: "#ef4444",
        points: [
            { x: 0.1, y: 0.1 },
            { x: 0.2, y: 0.2 },
        ],
    });

    if ((await annotationUpdate).points.length !== 2) {
        throw new Error("Student did not receive the teacher's annotation.");
    }

    const disconnectUpdate = waitForEvent(teacher, "students-update");
    rahul.disconnect();
    const remainingStudents = await disconnectUpdate;

    if (remainingStudents.length !== 1) {
        throw new Error("Disconnected student remained in the roster.");
    }

    teacher.disconnect();
    anush.disconnect();
    io.close();
    await new Promise((resolve) => httpServer.close(resolve));

    console.log("Classroom socket integration test passed.");
};

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
