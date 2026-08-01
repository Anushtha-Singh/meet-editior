import Editor from "@monaco-editor/react";
import { memo, useEffect, useMemo, useRef } from "react";

const SYMBOLS = ["()", "[]", "{}", ":", '"', "'", "=", "_", "#"];

const getFeedbackDecorations = (line) =>
  Number.isInteger(line)
    ? [
        {
          range: {
            startLineNumber: line,
            startColumn: 1,
            endLineNumber: line,
            endColumn: 1,
          },
          options: {
            isWholeLine: true,
            className: "teacher-feedback-line",
            glyphMarginClassName: "teacher-feedback-glyph",
          },
        },
      ]
    : [];

const applyRemoteCode = (editor, nextCode) => {
  const model = editor?.getModel();

  if (!model) {
    return;
  }

  const currentCode = model.getValue();

  if (currentCode === nextCode) {
    return;
  }

  let prefixLength = 0;
  const sharedLength = Math.min(currentCode.length, nextCode.length);

  while (
    prefixLength < sharedLength &&
    currentCode[prefixLength] === nextCode[prefixLength]
  ) {
    prefixLength += 1;
  }

  let suffixLength = 0;

  while (
    suffixLength < sharedLength - prefixLength &&
    currentCode[currentCode.length - 1 - suffixLength] ===
      nextCode[nextCode.length - 1 - suffixLength]
  ) {
    suffixLength += 1;
  }

  const start = model.getPositionAt(prefixLength);
  const end = model.getPositionAt(currentCode.length - suffixLength);
  const replacement = nextCode.slice(prefixLength, nextCode.length - suffixLength);

  model.applyEdits([
    {
      range: {
        startLineNumber: start.lineNumber,
        startColumn: start.column,
        endLineNumber: end.lineNumber,
        endColumn: end.column,
      },
      text: replacement,
    },
  ]);
};

function CodeEditor({
  code,
  onChange,
  readOnly = false,
  height = "100%",
  mobileToolbar = false,
  highlightedLine,
  onCursorLineChange,
  remoteUpdates = false,
}) {
  const editorRef = useRef();
  const decorationsRef = useRef();
  const editorOptions = useMemo(
    () => ({
      automaticLayout: true,
      fontSize: 15,
      minimap: { enabled: false },
      readOnly,
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      glyphMargin: Boolean(highlightedLine),
      scrollbar: {
        vertical: "visible",
        horizontal: "visible",
        verticalScrollbarSize: 12,
        horizontalScrollbarSize: 12,
        alwaysConsumeMouseWheel: false,
      },
    }),
    [highlightedLine, readOnly],
  );

  useEffect(() => {
    if (!editorRef.current) {
      return;
    }

    decorationsRef.current?.set(getFeedbackDecorations(highlightedLine));
  }, [highlightedLine]);

  useEffect(() => {
    if (remoteUpdates) {
      applyRemoteCode(editorRef.current, code);
    }
  }, [code, remoteUpdates]);

  const handleChange = (value) => {
    onChange?.(value ?? "");
  };

  const insertSymbol = (symbol) => {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    const selection = editor.getSelection();
    const selectedText = editor.getModel().getValueInRange(selection);
    const isPair = ["()", "[]", "{}"].includes(symbol);
    const text = isPair
      ? `${symbol[0]}${selectedText}${symbol[1]}`
      : symbol === "Tab"
        ? "    "
        : symbol;

    editor.executeEdits("mobile-symbol-toolbar", [
      { range: selection, text, forceMoveMarkers: true },
    ]);

    if (isPair && !selectedText) {
      const position = editor.getPosition();
      editor.setPosition({
        lineNumber: position.lineNumber,
        column: Math.max(position.column - 1, 1),
      });
    }

    editor.focus();
  };

  const undo = () => {
    editorRef.current?.trigger("mobile-symbol-toolbar", "undo");
    editorRef.current?.focus();
  };

  return (
    <div className="code-editor-shell" style={{ height }}>
      <div className="monaco-container">
        <Editor
          height="100%"
          language="python"
          theme="vs-dark"
          value={remoteUpdates ? undefined : code}
          defaultValue={remoteUpdates ? code : undefined}
          onChange={handleChange}
          onMount={(editor) => {
            editorRef.current = editor;
            if (remoteUpdates) {
              applyRemoteCode(editor, code);
            }
            decorationsRef.current = editor.createDecorationsCollection();
            decorationsRef.current.set(
              getFeedbackDecorations(highlightedLine),
            );
            editor.onDidChangeCursorPosition(({ position }) => {
              onCursorLineChange?.(position.lineNumber);
            });
          }}
          options={editorOptions}
        />
      </div>
      {mobileToolbar && !readOnly && (
        <div className="mobile-symbol-toolbar" aria-label="Coding symbols">
          {SYMBOLS.map((symbol) => (
            <button
              key={symbol}
              type="button"
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => insertSymbol(symbol)}
            >
              {symbol}
            </button>
          ))}
          <button
            type="button"
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => insertSymbol("Tab")}
          >
            Tab
          </button>
          <button
            type="button"
            onPointerDown={(event) => event.preventDefault()}
            onClick={undo}
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}

export default memo(CodeEditor);
