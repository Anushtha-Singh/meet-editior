const express = require("express");
const cors = require("cors");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

const app = express();
const allowedOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim());

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

const isGccInstalled = () =>
    new Promise((resolve) => {
        execFile("gcc", ["--version"], { timeout: 2000 }, (error) => {
            resolve(!error);
        });
    });

const runCCode = (code) =>
    new Promise((resolve, reject) => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "c-runner-"));
        const sourcePath = path.join(tempDir, "main.c");
        const binaryPath = path.join(tempDir, "main");

        fs.writeFileSync(sourcePath, code || "");

        execFile(
            "gcc",
            [sourcePath, "-o", binaryPath],
            { timeout: 5000, maxBuffer: 1024 * 1024 },
            (compileError, compileStdout, compileStderr) => {
                if (compileError) {
                    fs.rmSync(tempDir, { recursive: true, force: true });
                    resolve({
                        output: "",
                        error: compileStderr?.trim() || compileError.message,
                    });
                    return;
                }

                execFile(
                    binaryPath,
                    [],
                    { timeout: 5000, maxBuffer: 1024 * 1024 },
                    (runError, runStdout, runStderr) => {
                        fs.rmSync(tempDir, { recursive: true, force: true });

                        if (runError) {
                            resolve({
                                output: "",
                                error: runStderr?.trim() || runError.message,
                            });
                            return;
                        }

                        resolve({
                            output: runStdout || "",
                            error: runStderr || "",
                        });
                    },
                );
            },
        );
    });

app.get("/", (req, res) => {
    res.json({
        message: "Backend Connected Successfully!",
    });
});

app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        realtimeProtocol: 2,
    });
});

app.post("/api/run-code", async (req, res) => {
    const { language, code } = req.body || {};

    if (typeof code !== "string") {
        res.status(400).json({ error: "Code payload is required." });
        return;
    }

    if (language === "c") {
        try {
            const gccAvailable = await isGccInstalled();

            if (!gccAvailable) {
                res.status(500).json({
                    error:
                        "C runtime is unavailable because GCC is not installed. Install MinGW-w64 on Windows or GCC on Linux/macOS, then restart the server.",
                });
                return;
            }

            const result = await runCCode(code);
            res.json({
                output: result.output,
                error: result.error,
            });
        } catch (error) {
            res.status(500).json({
                error: error.message || "Unable to run C code.",
            });
        }
        return;
    }

    res.status(400).json({ error: "Unsupported language for backend execution." });
});

module.exports = app;
