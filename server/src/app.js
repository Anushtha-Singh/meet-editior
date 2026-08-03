const express = require("express");
const cors = require("cors");

const app = express();
const allowedOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim());

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

app.get("/", (req, res) => {
    res.json({
        message: "Backend Connected Successfully!"
    });
});

app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        realtimeProtocol: 2,
    });
});

module.exports = app;
