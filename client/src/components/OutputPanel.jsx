function OutputPanel({
  output = "",
  error = "",
  status = "idle",
  runtimeStatus,
  compact = false,
}) {
  const statusLabel =
    status === "running"
      ? "Running Python..."
      : status === "completed"
        ? "Finished"
      : runtimeStatus === "ready"
        ? "Python ready"
        : runtimeStatus === "error"
          ? "Runtime unavailable"
          : runtimeStatus === "loading"
            ? "Preparing Python..."
            : "Not run yet";

  const content = error
    ? [output, error].filter(Boolean).join("\n")
    : output || "Run code to see its output here.";

  return (
    <section
      className={`output-panel ${compact ? "output-panel-compact" : ""}`}
      aria-live="polite"
    >
      <div className="output-header">
        <strong>Output</strong>
        <span>{statusLabel}</span>
      </div>
      <pre className={error ? "output-error" : ""}>{content}</pre>
    </section>
  );
}

export default OutputPanel;
