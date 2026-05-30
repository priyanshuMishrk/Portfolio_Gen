/* =====================================================================
   server.js — PORTFOLIO_GEN backend
   - Serves the static front-end (the Check/ folder).
   - POST /api/analyze       (multipart "resume")  -> { ok, data }
   - POST /api/analyze-text  (json   { text })     -> { ok, data }
   - GET  /api/health        -> { ok, ai }

   It extracts text from the resume (pdf-parse / mammoth) and asks the Groq
   LLM to return BOTH a clean structured profile (accurate company names,
   dates, roles — no regex artifacts) AND a recruiter-style analysis
   (skill proficiency, 6-month progress, gaps, score). All shapes are
   sanitized server-side so the front-end always receives valid JSON.
   ===================================================================== */
import express from "express";
import multer from "multer";
import * as pdfParse from "pdf-parse";
import mammoth from "mammoth";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import axios from "axios";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, ".."); // the Check/ folder (static site)

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const upload = multer({ dest: path.join(__dirname, "uploads/") });

const HAS_KEY = !!process.env.GROQ_API_KEY;

/* ----------------------------- text extraction ----------------------------- */
async function extractText(filePath, mimetype) {
  const ext = path.extname(filePath).toLowerCase();
  if (mimetype === "application/pdf" || ext === ".pdf") {
    const buffer = await fs.readFile(filePath);
    const data = await pdfParse.default(buffer);
    return data.text;
  }
  if (mimetype.includes("officedocument") || ext === ".docx" || ext === ".doc") {
    const buffer = await fs.readFile(filePath);
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  return (await fs.readFile(filePath, "utf8")).toString();
}

/* ----------------------------- Groq ----------------------------- */
async function callGroq(prompt) {
  const url = "https://api.groq.com/openai/v1/chat/completions";
  const body = {
    model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
    max_tokens: 3000,
    response_format: { type: "json_object" },
  };
  const res = await axios.post(url, body, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    timeout: 60000,
  });
  return res.data?.choices?.[0]?.message?.content || "";
}

const SYSTEM_PROMPT = `You are an expert resume parser AND career analyst. Read the resume text (and any LinkedIn / GitHub context) and respond with ONE valid JSON object — nothing else.

Schema (return EXACTLY these keys):
{
  "profile": {
    "name": "string",
    "title": "string (professional headline)",
    "summary": "string (2-4 sentence professional summary)",
    "location": "string",
    "contacts": [{"type":"email|phone|github|linkedin|website","value":"string","url":"string"}],
    "skills": ["string", ...],
    "experience": [{"role":"string","company":"string","dates":"string e.g. 'Jan 2022 - Present'","description":"string (concise, 1-3 sentences, achievements only — do NOT merge multiple jobs)"}],
    "education": [{"school":"string","degree":"string","dates":"string"}],
    "certifications": ["string", ...],
    "projects": [{"name":"string","description":"string","url":"string"}]
  },
  "analysis": {
    "skills": {"SkillName": 0-100, ...},
    "progress": {"Jan":0-100,"Feb":0-100,"Mar":0-100,"Apr":0-100,"May":0-100,"Jun":0-100},
    "missing_keywords": ["string", ...],
    "suggested_improvements": ["string", ...],
    "overall_score": 0-100,
    "rank_percentile": 0-100,
    "experience_years": number
  }
}

CRITICAL RULES:
- Output VALID JSON only. No markdown, no commentary.
- Fix OCR / spacing artifacts: "A CCENTURE" -> "Accenture", "2 024" -> "2024". Use correct, human-readable Title Case company names.
- Each job in "experience" must be a SEPARATE entry with its OWN company, role, dates. NEVER merge two companies' text into one description.
- Preserve real dates exactly as written (normalize spacing only). If a job is current, use "Present".
- "skills" in profile: 8-25 concrete technologies/tools actually present in the resume.
- "analysis.skills": pick the 6-10 MOST important skills, score each 0-100 by demonstrated proficiency (years used, seniority, project depth). Real estimates — never all the same value, never 0 for a clearly-used skill.
- "analysis.progress": a realistic, MOSTLY INCREASING 6-month growth curve (0-100) reflecting how the candidate grew (basics -> backend -> cloud/deployment -> advanced). Infer from the resume, not random.
- "missing_keywords": 5-10 in-demand skills/keywords the resume LACKS but would strengthen it for this person's field.
- "suggested_improvements": 4-6 specific, actionable resume tips.
- "experience_years": total professional years (number, may be decimal). If unknown, estimate conservatively.
- Never invent employers, schools, or degrees that are not in the text. Leave arrays empty if truly absent.`;

/* ----------------------------- sanitizers ----------------------------- */
const str = (v) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(n) || 0)));
const arr = (v) => (Array.isArray(v) ? v : []);

function sanitize(raw) {
  const p = raw && raw.profile ? raw.profile : {};
  const a = raw && raw.analysis ? raw.analysis : {};

  const profile = {
    name: str(p.name),
    title: str(p.title),
    summary: str(p.summary),
    location: str(p.location),
    contacts: arr(p.contacts)
      .map((c) => ({ type: str(c.type) || "website", value: str(c.value), url: str(c.url) }))
      .filter((c) => c.value || c.url),
    skills: arr(p.skills).map(str).filter(Boolean).slice(0, 40),
    experience: arr(p.experience)
      .map((e) => ({
        role: str(e.role),
        company: str(e.company),
        dates: str(e.dates),
        description: str(e.description),
      }))
      .filter((e) => e.role || e.company),
    education: arr(p.education)
      .map((e) => ({ school: str(e.school), degree: str(e.degree), dates: str(e.dates) }))
      .filter((e) => e.school || e.degree),
    certifications: arr(p.certifications).map(str).filter(Boolean).slice(0, 16),
    projects: arr(p.projects)
      .map((pr) => ({ name: str(pr.name), description: str(pr.description), url: str(pr.url) }))
      .filter((pr) => pr.name),
  };

  const skills = {};
  const rawSkills = a.skills && typeof a.skills === "object" ? a.skills : {};
  Object.entries(rawSkills)
    .slice(0, 10)
    .forEach(([k, v]) => {
      if (str(k)) skills[str(k)] = clamp(v, 0, 100);
    });

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
  const progress = {};
  const rawProg = a.progress && typeof a.progress === "object" ? a.progress : {};
  months.forEach((m) => (progress[m] = clamp(rawProg[m], 0, 100)));

  const analysis = {
    skills,
    progress,
    missing_keywords: arr(a.missing_keywords).map(str).filter(Boolean).slice(0, 12),
    suggested_improvements: arr(a.suggested_improvements).map(str).filter(Boolean).slice(0, 8),
    overall_score: clamp(a.overall_score, 0, 100),
    rank_percentile: clamp(a.rank_percentile, 0, 100),
    experience_years: Math.max(0, Math.round((Number(a.experience_years) || 0) * 10) / 10),
  };

  return { profile, analysis };
}

function parseJsonLoose(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error("Model returned non-JSON output.");
  }
}

async function analyzeText(resumeText, context) {
  if (!HAS_KEY) {
    const err = new Error("GROQ_API_KEY is not configured on the server.");
    err.code = "NO_KEY";
    throw err;
  }
  const ctx = context ? `\n\n--- ADDITIONAL CONTEXT ---\n${context}` : "";
  const prompt = `${SYSTEM_PROMPT}\n\n--- RESUME TEXT START ---\n${resumeText.slice(0, 16000)}\n--- RESUME TEXT END ---${ctx}`;
  const raw = await callGroq(prompt);
  return sanitize(parseJsonLoose(raw));
}

/* ----------------------------- routes ----------------------------- */
app.get("/api/health", (_req, res) => res.json({ ok: true, ai: HAS_KEY }));

app.post("/api/analyze", upload.single("resume"), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: "No resume uploaded." });
  try {
    const text = await extractText(req.file.path, req.file.mimetype);
    await fs.unlink(req.file.path).catch(() => {});
    if (!text || text.trim().length < 30)
      return res.status(422).json({ ok: false, error: "Could not read enough text from the file." });
    const data = await analyzeText(text, req.body && req.body.context);
    return res.json({ ok: true, data });
  } catch (err) {
    if (req.file) await fs.unlink(req.file.path).catch(() => {});
    const msg = err.response?.data?.error?.message || err.message;
    console.error("[analyze] error:", msg);
    return res.status(err.code === "NO_KEY" ? 503 : 500).json({ ok: false, error: msg });
  }
});

app.post("/api/analyze-text", async (req, res) => {
  const text = req.body && req.body.text;
  if (!text || String(text).trim().length < 30)
    return res.status(400).json({ ok: false, error: "Provide at least a short block of resume / profile text." });
  try {
    const data = await analyzeText(String(text), req.body.context);
    return res.json({ ok: true, data });
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    console.error("[analyze-text] error:", msg);
    return res.status(err.code === "NO_KEY" ? 503 : 500).json({ ok: false, error: msg });
  }
});

/* ----------------------------- static site ----------------------------- */
app.use(express.static(ROOT));
app.get("/", (_req, res) => res.sendFile(path.join(ROOT, "index.html")));

const PORT = process.env.PORT || 5050;
app.listen(PORT, () => {
  console.log(`\n  PORTFOLIO_GEN  →  http://localhost:${PORT}`);
  console.log(`  AI analysis    →  ${HAS_KEY ? "enabled (Groq)" : "DISABLED (set GROQ_API_KEY in server/.env)"}\n`);
});
