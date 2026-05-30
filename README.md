<div align="center">

```
██████╗  ██████╗ ██████╗ ████████╗███████╗ ██████╗ ██╗     ██╗ ██████╗
██╔══██╗██╔═══██╗██╔══██╗╚══██╔══╝██╔════╝██╔═══██╗██║     ██║██╔═══██╗
██████╔╝██║   ██║██████╔╝   ██║   █████╗  ██║   ██║██║     ██║██║   ██║
██╔═══╝ ██║   ██║██╔══██╗   ██║   ██╔══╝  ██║   ██║██║     ██║██║   ██║
██║     ╚██████╔╝██║  ██║   ██║   ██║     ╚██████╔╝███████╗██║╚██████╔╝
╚═╝      ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚═╝      ╚═════╝ ╚══════╝╚═╝ ╚═════╝
```

### **PORTFOLIO_GEN**

**Turn a résumé, a LinkedIn paste, or a GitHub handle into a jaw-dropping, animated portfolio — in about four seconds.**

*Drop your data in. An LLM reads it like a recruiter would. Out comes a site that looks like a senior designer spent a week on it.*

`Dark-mode cyberpunk` · `iOS-spring motion` · `AI skill analysis` · `zero-build vanilla JS`

</div>

---

## ✦ The one-paragraph pitch

Most "resume → website" tools spit out the same boring template with your name pasted in. This one is different in two ways. First, it **understands** your résumé — a Groq-hosted Llama 3.3 model parses it into clean, structured data (real company names, separated jobs, correct dates) and then *grades* it like a hiring manager: proficiency radar, a skill-growth curve, missing keywords, a resume score. Second, it **looks alive** — a frosted-glass, deep-space UI with iOS-style spring reveals, a cursor-following particle field, count-up stats, a self-drawing timeline, and charts that draw themselves on scroll. The whole thing is vanilla HTML/CSS/JS (no React, no build step) with one tiny Node backend for the AI. Open it, and a recruiter's first thought is *"okay, this person actually ships."*

---

## 📸 Screenshots

A full top-to-bottom look at a generated portfolio — from the intake screen all the way down through the hero, experience timeline, **Career Trajectory** charts, the AI **Skill Intelligence** dashboard, GitHub stats, and education:

<div align="center">

<img src="screenshots/full-page.png" alt="PORTFOLIO_GEN — full generated portfolio, top to bottom" width="420" />

</div>

---

## 🤔 Why I built it the way I did

I had opinions. Here they are, with the reasoning — because *how* something is built says as much as *that* it was built.

### Vanilla JS, no framework, no build step
React/Vite would've been the "default" choice. I deliberately didn't.
- **It opens instantly.** No `npm run build`, no bundle, no hydration. The whole front-end is ~9 small files you can read top to bottom.
- **It's honest about the DOM.** Reveal animations, the particle canvas, SVG charts — these are DOM/Canvas problems, and writing them directly is *clearer* than fighting a virtual DOM and a chart library's abstractions.
- **It's fast.** No framework runtime tax. Animations run on `requestAnimationFrame` and CSS transforms (GPU-composited), `will-change` only where it earns its keep.

> If this were a 20-screen product, I'd reach for React. For a single, motion-heavy showcase page, a framework is overhead you pay for and a user never benefits from.

### Charts hand-drawn as SVG instead of a chart library
Recharts/Chart.js are great — and they're 50–150 KB that all look the same. The growth line, the radar, the progress curve, and the contribution heatmap are **bespoke SVG/Canvas**, which means:
- they re-tint live with the accent picker (a library would fight me on theming),
- they animate exactly how I want (`pathLength="1"` + `stroke-dashoffset` so a line *draws itself*, no JS measuring),
- the bundle stays at **zero dependencies on the front-end.**

### An LLM for parsing — not regex
I tried regex first. Résumés are chaos: a PDF turns `ACCENTURE` into `A CCENTURE`, `2024` into `2 024`, and smashes three jobs into one paragraph. Heuristics get you 70% there and then plateau, forever.
- An LLM reads a résumé the way a human does — it *knows* `KSOLVES PVT. LTD.` is a company, that "Present" means current, that two date ranges mean two jobs.
- **Groq** (not OpenAI) because it's free-tier-friendly and *fast* — sub-second responses on Llama 3.3 70B, so the "AI" step doesn't stall the reveal.
- The server **sanitizes and clamps every field** the model returns, so a hallucinated shape can never crash the UI. The model proposes; the server disposes.
- The client-side regex parser still ships as a **graceful fallback** — open `index.html` with no backend and it still works, just without the AI smarts.

### Everything degrades, nothing crashes
Private LinkedIn? Frosted "🔒 locked" card. GitHub 404? A friendly "no public user" card. Rate-limited? It says so. Missing résumé field? The section just doesn't render — no empty boxes. Reduced-motion preference? All animation collapses to instant. **The unhappy path was designed, not patched in.**

### CSS variables all the way down
The accent duo lives in `--accent-cyan` / `--accent-violet` **and** their RGB triplets (`--accent-cyan-rgb`) so every glow, border, and chart fill is one `rgba(var(--accent-cyan-rgb), α)`. That's why the **accent picker re-themes the entire site instantly**, light mode is a ~20-line override, and nothing is hard-coded.

---

## 🆚 How it's different from the usual "resume to website" tools

| | Typical generator | **PORTFOLIO_GEN** |
|---|---|---|
| Parsing | Fixed templates / keyword regex | **LLM-structured** (clean names, split jobs, real dates) |
| "Is this person good?" | — | **Resume score, percentile, skill radar, gap analysis** |
| Data sources | One at a time | **Résumé + LinkedIn + GitHub, merged** |
| Motion | Fade-in, maybe | iOS-spring reveals, cursor-follow particles, self-drawing charts |
| Theming | One look | **Light/dark + 4 accent duos, live** |
| Editing | Re-upload | **Review & edit every field before reveal** |
| Sharing | Hosted account | **Whole profile encoded in a URL** (gzip'd, no backend needed to view) |
| Privacy | Uploads to a server | **Client-side by default**; LLM step is opt-in and self-hosted |
| Footprint | SPA bundle | **Zero front-end dependencies, no build** |

---

## ✨ Feature tour

**Inputs (any one is enough)**
- **Résumé** PDF/DOCX — text extracted locally (pdf.js / mammoth) or server-side, then LLM-structured.
- **LinkedIn** — paste your About/Experience (LinkedIn blocks scraping by CORS + ToS). The parser even survives LinkedIn's "every line duplicated" copy quirk and splits jobs by date anchors.
- **GitHub** — public REST API: avatar, stats, **language breakdown by bytes**, top repos, and a **90-day contribution heatmap** from the events API.

**The page it builds**
- **Hero** — gradient name, blinking-cursor typewriter headline, copy-to-clipboard contact pills, conic-gradient avatar ring.
- **About · Skills · Experience** — word-by-word reveal, categorized skill tags, a self-drawing timeline with company logo badges and bulleted impact.
- **Career Trajectory** — cumulative **experience** and **skills** plotted over your real career span, with count-up headline stats.
- **Skill Intelligence (AI)** — **proficiency radar**, **6-month progress curve**, **top skills with %**, **missing keywords**, **suggested improvements**, and a **resume score / percentile**.
- **Projects · GitHub · Education · Certifications** — masonry repos, animated language bars, badge cards.

**The experience around it**
- **Edit before reveal** — fix any field; the AI is a draft, you're the editor.
- **Theme switcher** — light/dark + accent picker, both persisted.
- **Shareable link** — the entire profile gzip-encoded into the URL hash; open it anywhere, no server required.
- **Persistence** — your last profile is restored on reload.
- **Download as PDF** — print-styled clean export.
- **Terminal loading sequence**, particle background, scroll-spy nav, 3D card tilt, and a `prefers-reduced-motion` path that turns it all off.

---

## 🏗 How it works

```
                 ┌──────────── browser (vanilla JS) ────────────┐
  résumé ──▶ │  parser-resume.js ─┐                          │
  linkedin ─▶ │  parser-linkedin.js├─▶ merge ─▶ EDIT ─▶ render │──▶ 🎉 portfolio
  github  ──▶ │  parser-github.js ─┘     ▲                    │
                 │                ai.js ──────┘ (prefers LLM)      │
                 └───────────────────┬──────────────────────────┘
                                     │ POST /api/analyze (resume file)
                                     ▼
                 ┌──────────── server/server.js (Node) ─────────┐
                 │  pdf-parse / mammoth ─▶ Groq (Llama 3.3) ─▶   │
                 │  sanitize/clamp ─▶ { profile, analysis }      │
                 └───────────────────────────────────────────────┘
```

The front-end always tries the AI backend first and silently falls back to local heuristics if it isn't running.

---

## 🚀 Run it

### Recommended — with AI (accurate parsing + Skill Intelligence)
```bash
cd server
npm install      # first time only
npm start        # serves the whole app at http://localhost:5050
```
Open **http://localhost:5050**. The intake screen shows a green **⚡ AI analysis ON** badge when the backend is reachable.

The Groq key lives in [`server/.env`](server/.env) (`GROQ_API_KEY`, `GROQ_MODEL`) and is git-ignored. Grab a free key at <https://console.groq.com>.

### Without AI (static, instant, heuristic parsing)
Just open `index.html` (or serve the folder with any static server). The AI-only **Skill Intelligence** section hides itself; everything else works. Try **⚡ Load a demo profile** to see the whole thing with sample data.

---

## 🗂 Project layout

```
index.html                 # shell: fonts, sections, script/style includes
styles/
  main.css                 # design tokens, reset, themes, background system
  animations.css           # keyframes + reveal/draw classes
  components.css           # hero, cards, timeline, charts, radar, intel…
  responsive.css           # breakpoints
scripts/
  parser-resume.js         # pdf.js + mammoth + heuristic structuring (fallback)
  parser-github.js         # GitHub REST: stats, languages, repos, activity
  parser-linkedin.js       # date-anchored experience parser (paste-proof)
  analytics.js             # experience/skills time-series for the growth charts
  ai.js                    # talks to the backend (health, analyze)
  renderer.js              # all DOM injection + SVG chart/radar builders
  animations.js            # IntersectionObserver reveals, count-up, particles
  state.js                 # share-link encode/decode + localStorage
  editor.js                # edit-before-reveal form
  main.js                  # orchestration, theme, pipeline, demo
server/
  server.js                # Groq analysis + static host
  .env                     # GROQ_API_KEY (git-ignored)
```

---

## ♿ Accessibility & performance

- **`prefers-reduced-motion`** fully respected — particles off, reveals instant, count-ups jump to final.
- Semantic landmarks, ARIA labels on icon buttons, keyboard-operable dropzone, visible focus states.
- Lazy images (`loading="lazy"`), GPU-composited transforms, particle field paused on hidden tabs, debounced resize.
- Zero front-end dependencies; the only third-party scripts are pdf.js & mammoth, loaded from a CDN.

---

## ⚠️ Honest limitations

- **LinkedIn photo / connections / activity can't be fetched** programmatically (CORS + ToS + no public API). Set a photo via the **Edit** screen; the GitHub avatar is the fallback.
- **AI numbers are estimates.** Skill %, the progress curve, and the score are an LLM's informed guess, not ground truth — tweak roles/skills in **Edit** to sharpen the story.
- Unauthenticated GitHub API is rate-limited (60 req/hr per IP); accurate languages + activity use a handful of calls per profile.

---

## 🛠 Tech stack

**Front-end:** HTML5, modern CSS (custom properties, `backdrop-filter`, conic/`mask` gradients), vanilla ES2020, Canvas + hand-built SVG, IntersectionObserver, `CompressionStream` for share links.
**Back-end:** Node + Express, Multer, pdf-parse, mammoth, Groq (Llama 3.3 70B), dotenv.

---

<div align="center">

*Built with too much caffeine.*

</div>
