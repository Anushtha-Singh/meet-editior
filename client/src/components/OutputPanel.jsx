import { useRef, useState } from "react";

const MIN_OUTPUT_HEIGHT = 90;

function OutputPanel({
  output = "",
  error = "",
  status = "idle",
  runtimeStatus,
  compact = false,
  resizable = false,
  language = "Python",
}) {
  const [height, setHeight] = useState(140);
  const panelRef = useRef();
  const dragStartRef = useRef();
  const statusLabel =
    status === "running"
      ? `Running ${language}...`
      : status === "completed"
        ? "Finished"
      : runtimeStatus === "ready"
          ? `${language} ready`
          : runtimeStatus === "error"
            ? "Runtime unavailable"
            : runtimeStatus === "loading"
              ? `Preparing ${language}...`
              : "Not run yet";

  const content = error
    ? [output, error].filter(Boolean).join("\n")
    : output || "Run code to see its output here.";

  const resizeBy = (amount) => {
    const maxHeight = Math.max(window.innerHeight * 0.65, MIN_OUTPUT_HEIGHT);
    setHeight((current) =>
      Math.min(Math.max(current + amount, MIN_OUTPUT_HEIGHT), maxHeight),
    );
  };

  const handleResizeStart = (event) => {
    if (!resizable) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartRef.current = {
      y: event.clientY,
      height: panelRef.current.getBoundingClientRect().height,
    };
  };

  const handleResizeMove = (event) => {
    if (!dragStartRef.current) {
      return;
    }

    const nextHeight =
      dragStartRef.current.height + dragStartRef.current.y - event.clientY;
    const maxHeight = Math.max(window.innerHeight * 0.65, MIN_OUTPUT_HEIGHT);
    setHeight(Math.min(Math.max(nextHeight, MIN_OUTPUT_HEIGHT), maxHeight));
  };

  return (
    <section
      className={[
        "output-panel",
        compact ? "output-panel-compact" : "",
        resizable ? "output-panel-resizable" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-live="polite"
      ref={panelRef}
      style={resizable ? { height } : undefined}
    >
      {resizable && (
        <div
          className="output-resize-handle"
          role="separator"
          aria-label="Resize output"
          aria-orientation="horizontal"
          onPointerDown={handleResizeStart}
          onPointerMove={handleResizeMove}
          onPointerUp={() => {
            dragStartRef.current = undefined;
          }}
          onPointerCancel={() => {
            dragStartRef.current = undefined;
          }}
        >
          <span />
        </div>
      )}
      <div className="output-header">
        <strong>Output</strong>
        <div className="output-header-actions">
          <span>{statusLabel}</span>
          {resizable && (
            <>
              <button
                type="button"
                aria-label="Make output smaller"
                onClick={() => resizeBy(-60)}
              >
                −
              </button>
              <button
                type="button"
                aria-label="Make output larger"
                onClick={() => resizeBy(60)}
              >
                +
              </button>
            </>
          )}
        </div>
      </div>
      <pre className={error ? "output-error" : ""}>{content}</pre>
    </section>
  );
}

export default OutputPanel;
