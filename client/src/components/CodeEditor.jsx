import Editor from "@monaco-editor/react";

function CodeEditor({ code, onChange, readOnly = false, height = "100%" }) {
  const handleChange = (value) => {
    onChange?.(value ?? "");
  };

  return (
    <Editor
      height={height}
      language="python"
      theme="vs-dark"
      value={code}
      onChange={handleChange}
      options={{
        automaticLayout: true,
        minimap: { enabled: false },
        readOnly,
        scrollBeyondLastLine: false,
      }}
    />
  );
}

export default CodeEditor;
