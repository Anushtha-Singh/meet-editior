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

let cachedJavaCmd = null;

const getJavaCandidatePaths = () => {
    const candidates = ["java", "java.exe"];

    // Local project-level portable JDK (e.g. installed on Render via scripts/install-java.js)
    candidates.push(
        path.join(__dirname, "..", ".jdk", "bin", "java"),
        path.join(process.cwd(), ".jdk", "bin", "java"),
        path.join(__dirname, "..", ".jdk", "bin", "java.exe"),
        path.join(process.cwd(), ".jdk", "bin", "java.exe"),
    );

    if (process.env.JAVA_HOME) {
        candidates.push(path.join(process.env.JAVA_HOME, "bin", "java.exe"));
        candidates.push(path.join(process.env.JAVA_HOME, "bin", "java"));
    }

    // Standard Linux paths (Render, Ubuntu, Debian, Docker)
    candidates.push(
        "/usr/bin/java",
        "/usr/local/bin/java",
        "/usr/lib/jvm/default-java/bin/java",
        "/opt/java/openjdk/bin/java",
    );

    if (fs.existsSync("/usr/lib/jvm")) {
        try {
            const jvmDirs = fs.readdirSync("/usr/lib/jvm");
            for (const jvmDir of jvmDirs) {
                candidates.push(path.join("/usr/lib/jvm", jvmDir, "bin", "java"));
            }
        } catch (_) {}
    }

    const programFiles = process.env.ProgramFiles || "C:\\Program Files";
    const programFilesX86 =
        process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";

    candidates.push(
        path.join(
            programFiles,
            "Common Files",
            "Oracle",
            "Java",
            "javapath",
            "java.exe",
        ),
        path.join(
            programFilesX86,
            "Common Files",
            "Oracle",
            "Java",
            "javapath",
            "java.exe",
        ),
    );

    for (const baseDir of [
        path.join(programFiles, "Java"),
        path.join(programFiles, "Eclipse Adoptium"),
        path.join(programFiles, "Microsoft"),
        path.join(programFiles, "Amazon Corretto"),
    ]) {
        if (fs.existsSync(baseDir)) {
            try {
                const subdirs = fs.readdirSync(baseDir);
                for (const sub of subdirs) {
                    candidates.push(path.join(baseDir, sub, "bin", "java.exe"));
                }
            } catch (_) {}
        }
    }

    return [
        ...new Set(
            candidates.filter((c) => !path.isAbsolute(c) || fs.existsSync(c)),
        ),
    ];
};

const detectJavaRuntime = () =>
    new Promise((resolve) => {
        if (cachedJavaCmd) {
            resolve(cachedJavaCmd);
            return;
        }

        const candidates = getJavaCandidatePaths();
        let index = 0;

        const tryNext = () => {
            if (index >= candidates.length) {
                execFile("javac", ["-version"], { timeout: 5000 }, (javacErr) => {
                    if (!javacErr) {
                        cachedJavaCmd = "javac";
                        resolve("javac");
                        return;
                    }
                    resolve(null);
                });
                return;
            }

            const candidate = candidates[index];
            execFile(candidate, ["-version"], { timeout: 5000 }, (error) => {
                if (!error) {
                    if (path.isAbsolute(candidate)) {
                        const binDir = path.dirname(candidate);
                        if (!process.env.PATH?.includes(binDir)) {
                            process.env.PATH = `${binDir};${process.env.PATH || ""}`;
                        }
                    }
                    cachedJavaCmd = candidate;
                    resolve(candidate);
                    return;
                }

                index += 1;
                tryNext();
            });
        };

        tryNext();
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
                const javacCmd = path.isAbsolute(javaCmd)
                    ? path.join(
                          path.dirname(javaCmd),
                          process.platform === "win32" ? "javac.exe" : "javac",
                      )
                    : "javac";

                execFile(
                    javacCmd,
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
