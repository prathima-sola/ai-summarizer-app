import { useState } from "react";

function App() {
  const [text, setText] = useState("");
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSummarize = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setSummary("");
    try {
      const response = await fetch("https://ai-summarizer-backend-pxyg.onrender.com/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await response.json();
      setSummary(data.summary);
    } catch (error) {
      setSummary("Error: Could not get summary. Make sure the backend is running.");
    }
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: "700px", margin: "60px auto", padding: "0 20px", fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: "28px", marginBottom: "8px" }}>AI Text Summarizer</h1>
      <p style={{ color: "#666", marginBottom: "24px" }}>Paste any text below and get an instant AI summary</p>

      <textarea
        rows={8}
        style={{ width: "100%", padding: "12px", fontSize: "15px", borderRadius: "8px", border: "1px solid #ddd", resize: "vertical", boxSizing: "border-box" }}
        placeholder="Paste your text here..."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      <button
        onClick={handleSummarize}
        disabled={loading}
        style={{ marginTop: "12px", padding: "12px 28px", fontSize: "15px", background: loading ? "#aaa" : "#185FA5", color: "white", border: "none", borderRadius: "8px", cursor: loading ? "not-allowed" : "pointer" }}
      >
        {loading ? "Summarizing..." : "Summarize"}
      </button>

      {summary && (
        <div style={{ marginTop: "32px", padding: "20px", background: "#f0f7ff", borderRadius: "8px", border: "1px solid #b5d4f4" }}>
          <h2 style={{ fontSize: "18px", marginBottom: "12px" }}>Summary</h2>
          <p style={{ whiteSpace: "pre-wrap", lineHeight: "1.7", color: "#333" }}>{summary}</p>
        </div>
      )}
    </div>
  );
}

export default App;