/* =====================================================================
   ai.js — front-end client for the Groq-powered analysis backend.

   Works whether the page is served BY the backend (same origin) or opened
   as a file:// (falls back to http://localhost:5050). If the backend is
   unreachable, callers fall back to the client-side heuristic parsers.

   Exposes: window.AI = {
     ready,                       // boolean, set after health()
     health(): Promise<bool>,     // probe backend + key
     analyzeResume(file, ctx),    // -> { profile, analysis }
     analyzeText(text, ctx),      // -> { profile, analysis }
   }
   ===================================================================== */
(function () {
  "use strict";

  const isHttp = location.protocol === "http:" || location.protocol === "https:";
  const BASE = isHttp ? "" : "http://localhost:5050";
  const url = (p) => BASE + p;

  const state = { ready: false, ai: false };

  async function health() {
    try {
      const res = await fetch(url("/api/health"), { method: "GET" });
      if (!res.ok) throw new Error("bad status");
      const j = await res.json();
      state.ready = !!(j && j.ok);
      state.ai = !!(j && j.ai);
      AI.ready = state.ready && state.ai;
      return AI.ready;
    } catch (e) {
      state.ready = false;
      state.ai = false;
      AI.ready = false;
      return false;
    }
  }

  async function analyzeResume(file, context) {
    const fd = new FormData();
    fd.append("resume", file);
    if (context) fd.append("context", context);
    const res = await fetch(url("/api/analyze"), { method: "POST", body: fd });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.ok) throw new Error(j.error || "Analysis failed");
    return j.data;
  }

  async function analyzeText(text, context) {
    const res = await fetch(url("/api/analyze-text"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, context }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.ok) throw new Error(j.error || "Analysis failed");
    return j.data;
  }

  const AI = { ready: false, base: BASE, health, analyzeResume, analyzeText };
  window.AI = AI;
})();
