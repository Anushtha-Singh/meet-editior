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

const COMPILER_CANDIDATES = [
    "gcc",
    "clang",
    "cc",
    "x86_64-w64-mingw32-gcc",
    "g++",
];

const detectCompiler = () =>
    new Promise((resolve) => {
        let index = 0;

        const tryNext = () => {
            if (index >= COMPILER_CANDIDATES.length) {
                resolve(null);
                return;
            }

            const compiler = COMPILER_CANDIDATES[index];
            execFile(compiler, ["--version"], { timeout: 2000 }, (error) => {
                if (!error) {
                    resolve(compiler);
                    return;
                }

                index += 1;
                tryNext();
            });
        };

        tryNext();
    });

const removeTempDir = (tempDir) => {
    try {
        fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
        if (error?.code !== "EPERM") {
            throw error;
        }
    }
};

const runCCode = (code, compiler = "gcc") =>
    new Promise((resolve) => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "c-runner-"));
        const sourcePath = path.join(tempDir, "main.c");
        const binaryPath = path.join(tempDir, "main");
        const executablePath = process.platform === "win32" ? `${binaryPath}.exe` : binaryPath;

        fs.writeFileSync(sourcePath, code || "");

        execFile(
            compiler,
            [sourcePath, "-o", binaryPath],
            { timeout: 5000, maxBuffer: 1024 * 1024 },
            (compileError, compileStdout, compileStderr) => {
                if (compileError) {
                    removeTempDir(tempDir);
                    resolve({
                        output: "",
                        error: compileStderr?.trim() || compileError.message,
                    });
                    return;
                }

                execFile(
                    executablePath,
                    [],
                    { timeout: 5000, maxBuffer: 1024 * 1024 },
                    (runError, runStdout, runStderr) => {
                        removeTempDir(tempDir);

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
            const compiler = await detectCompiler();

            if (!compiler) {
                res.status(500).json({
                    error:
                        "C runtime is unavailable because no C compiler is installed. Install GCC/Clang on Linux/macOS or MinGW-w64 on Windows, then restart the backend service.",
                });
                return;
            }

            const result = await runCCode(code, compiler);
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
