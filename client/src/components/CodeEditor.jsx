import Editor from "@monaco-editor/react";
import { useRef } from "react";

const SYMBOLS = ["()", "[]", "{}", ":", '"', "'", "=", "_", "#"];

function CodeEditor({
  code,
  onChange,
  readOnly = false,
  height = "100%",
  mobileToolbar = false,
}) {
  const editorRef = useRef();

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
          value={code}
          onChange={handleChange}
          onMount={(editor) => {
            editorRef.current = editor;
          }}
          options={{
            automaticLayout: true,
            fontSize: 15,
            minimap: { enabled: false },
            readOnly,
            scrollBeyondLastLine: false,
          }}
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

export default CodeEditor;
