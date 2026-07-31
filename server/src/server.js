const http = require("http");
const { Server } = require("socket.io");

const app = require("./app");
const registerClassroomHandlers = require("./socket/classroomSocket");

const server = http.createServer(app);
const allowedOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim());

const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"],
    },
    maxHttpBufferSize: 12_000_000,
});

registerClassroomHandlers(io);

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
