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

const detectJavaRuntime = () =>
    new Promise((resolve) => {
        execFile("java", ["-version"], { timeout: 2000 }, (javaErr) => {
            if (!javaErr) {
                resolve("java");
                return;
            }
            execFile("javac", ["-version"], { timeout: 2000 }, (javacErr) => {
                if (!javacErr) {
                    resolve("javac");
                    return;
                }
                resolve(null);
            });
        });
    });

const extractJavaClassName = (code) => {
    if (!code || typeof code !== "string") {
        return "Main";
    }
    const publicMatch = code.match(
        /public\s+(?:final\s+|abstract\s+)*(?:class|enum|interface|record)\s+([A-Za-z0-9_$]+)/,
    );
    if (publicMatch && publicMatch[1]) {
        return publicMatch[1];
    }
    const anyClassMatch = code.match(
        /(?:class|enum|interface|record)\s+([A-Za-z0-9_$]+)/,
    );
    if (anyClassMatch && anyClassMatch[1]) {
        return anyClassMatch[1];
    }
    return "Main";
};

const runJavaCode = (code, javaCmd = "java") =>
    new Promise((resolve) => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "java-runner-"));
        const className = extractJavaClassName(code);
        const sourcePath = path.join(tempDir, `${className}.java`);

        fs.writeFileSync(sourcePath, code || "");

        // 1. Try Java 11+ single file direct execution: java <file.java>
        execFile(
            javaCmd,
            [sourcePath],
            { timeout: 8000, maxBuffer: 1024 * 1024 },
            (runError, runStdout, runStderr) => {
                if (!runError) {
                    removeTempDir(tempDir);
                    resolve({
                        output: runStdout || "",
                        error: runStderr || "",
                    });
                    return;
                }

                const combinedErr = `${runStderr || ""} ${runError.message || ""}`;
                const isUnsupportedDirectRun =
                    combinedErr.includes("Unrecognized option") ||
                    combinedErr.includes("Could not find or load main class") ||
                    combinedErr.includes("Usage: java");

                if (!isUnsupportedDirectRun) {
                    removeTempDir(tempDir);
                    resolve({
                        output: runStdout || "",
                        error: runStderr?.trim() || runError.message,
                    });
                    return;
                }

                // 2. Fallback: javac then java -cp
                execFile(
                    "javac",
                    [sourcePath],
                    { timeout: 5000, maxBuffer: 1024 * 1024 },
                    (compileErr, compileStdout, compileStderr) => {
                        if (compileErr) {
                            removeTempDir(tempDir);
                            resolve({
                                output: "",
                                error: compileStderr?.trim() || compileErr.message,
                            });
                            return;
                        }

                        execFile(
                            javaCmd,
                            ["-cp", tempDir, className],
                            { timeout: 5000, maxBuffer: 1024 * 1024 },
                            (execErr, execStdout, execStderr) => {
                                removeTempDir(tempDir);
                                if (execErr) {
                                    resolve({
                                        output: execStdout || "",
                                        error: execStderr?.trim() || execErr.message,
                                    });
                                    return;
                                }

                                resolve({
                                    output: execStdout || "",
                                    error: execStderr || "",
                                });
                            },
                        );
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

    if (language === "java") {
        try {
            const javaCmd = await detectJavaRuntime();

            if (!javaCmd) {
                res.status(500).json({
                    error:
                        "Java runtime is unavailable because Java is not installed. Install OpenJDK/Oracle JDK, then restart the backend service.",
                });
                return;
            }

            const result = await runJavaCode(code, javaCmd);
            res.json({
                output: result.output,
                error: result.error,
            });
        } catch (error) {
            res.status(500).json({
                error: error.message || "Unable to run Java code.",
            });
        }
        return;
    }

    res.status(400).json({ error: "Unsupported language for backend execution." });
});

module.exports = app;
