const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

export const runC = async (code) => {
  const response = await fetch(`${API_BASE}/api/run-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ language: "c", code }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "Unable to execute C.");
  }

  return {
    output: payload.output || "",
    error: payload.error || "",
  };
};
