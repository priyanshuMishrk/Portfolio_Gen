# AI Prompt: Techy Portfolio Website with Resume/LinkedIn/GitHub Parsing

---

## THE PROMPT

You are an expert full-stack developer and UI/UX designer. Build a **single-page, fully responsive, production-grade portfolio website** that parses and beautifully displays information from a user's resume (PDF/DOCX), LinkedIn profile URL, and/or GitHub username.

---

### 🎯 CORE FUNCTIONALITY

**Input Methods (all optional — at least one required):**
- **Resume Upload** — Accept PDF or DOCX. Parse: name, title, summary, skills, experience (company, role, dates, description), education, certifications, contact info.
- **LinkedIn URL** — Scrape or accept manual paste of profile data. Extract: headline, about, experience, skills, recommendations count, education, profile photo.
- **GitHub Username** — Fetch via GitHub public API (`https://api.github.com/users/{username}` + `/repos`). Extract: avatar, bio, location, top repos (name, description, stars, forks, language), contribution languages, pinned repos if available.

**Privacy Handling:**
- If a LinkedIn profile is private / scraping fails → show a sleek **"🔒 Profile is Private"** card in that section instead of erroring out.
- If a GitHub profile has 0 public repos → show **"🔒 Repositories are Private"**.
- If a resume field is missing → gracefully skip that section, no empty cards.
- Never crash — every section degrades gracefully.

---

### 🖥️ VISUAL DESIGN SYSTEM

**Theme:** Dark-mode-first, cyberpunk-meets-Apple-design-language. Think: deep space black (#0a0a0f) base, electric cyan (#00f5ff) and violet (#a855f7) as accent duo, frosted glass cards, subtle grid/circuit-board background pattern, crisp monospace + geometric sans font pairing.

**Fonts:**
- Display/Headings: `Orbitron` or `Space Mono` (Google Fonts)
- Body: `DM Sans` or `Sora`
- Code/Tech labels: `JetBrains Mono`

**Color Palette (CSS Variables):**
```css
--bg-primary: #0a0a0f;
--bg-secondary: #0f0f1a;
--glass: rgba(255, 255, 255, 0.04);
--border-glow: rgba(0, 245, 255, 0.2);
--accent-cyan: #00f5ff;
--accent-violet: #a855f7;
--text-primary: #f0f0ff;
--text-muted: #6b7280;
--success: #10b981;
--card-bg: rgba(15, 15, 26, 0.8);
```

---

### ✨ ANIMATIONS — iOS-STYLE REVEAL SYSTEM

Implement a **staggered reveal animation system** inspired by iOS springboard and Apple keynote transitions:

1. **Page Load Sequence:**
   - Header fades in with `translateY(-20px) → 0` over 600ms, ease-out-expo
   - Upload zone slides in from bottom with spring physics
   - Background grid pulses in slowly

2. **Post-Parse Reveal (the WOW moment):**
   - Hero section (name, title, avatar) scales from `0.85 → 1.0` with `opacity 0 → 1`, 500ms, cubic-bezier(0.34, 1.56, 0.64, 1) — the iOS spring curve
   - Each section card reveals sequentially with 120ms stagger:
     - Starts: `opacity: 0; transform: translateY(30px) scale(0.96)`
     - Ends: `opacity: 1; transform: translateY(0) scale(1)`
     - Easing: `cubic-bezier(0.25, 0.46, 0.45, 0.94)`
   - Skill badges pop in with `scale(0) → scale(1)` with 40ms stagger between each badge
   - GitHub repo cards slide in from alternating left/right
   - Stats/numbers count up from 0 using a smooth easing counter animation
   - Section headers have a **text-reveal** effect: text slides up from behind a clip mask

3. **Scroll Animations (Intersection Observer):**
   - Any off-screen section animates in when 20% visible
   - Cards tilt subtly on mouse hover (3D perspective transform)
   - Parallax depth on the hero background

4. **Micro-interactions:**
   - Skill tags glow on hover with `box-shadow` pulse
   - Repo cards lift with `translateY(-4px)` + glow border on hover
   - Copy-to-clipboard on contact info with a satisfying checkmark animation
   - Language color dots in repos animate in like paint splats

---

### 🧩 SECTIONS & LAYOUT

**1. Upload/Input Zone (shown before data)**
- Glassmorphic drag-and-drop zone for resume
- Input fields for LinkedIn URL and GitHub username
- A glowing **"Generate Profile →"** CTA button
- Animated scanning/loading state after submission (fake terminal lines scrolling)

**2. Hero Section**
- Full-width with avatar (GitHub or initials fallback with gradient)
- Name in large display font with a subtle gradient text effect
- Job title/headline with a **typewriter cursor blinking**
- Location, contact icons (email, linkedin, github) as pill buttons
- Background: blurred bokeh orbs + faint hexagonal grid

**3. About / Summary**
- Full-bleed frosted glass card
- Animated quote marks
- Text fades in word-by-word on reveal

**4. Skills**
- Grouped by category (Languages, Frameworks, Tools, etc.)
- Each skill as a glowing pill tag with proficiency implied by brightness
- Animate in as a waterfall

**5. Experience Timeline**
- Vertical timeline with glowing node dots
- Each entry: company logo placeholder, role, dates, description
- Timeline line draws itself with a CSS stroke animation

**6. GitHub Stats (if provided)**
- Stats grid: repos, stars, followers, following — animated count-up
- Top language bar chart (CSS-only, animated widths)
- Repo cards in a horizontal scroll or masonry grid:
  - Repo name, description, star count, fork count, language badge
  - If private: frosted lock card

**7. Education**
- Clean cards with institution, degree, dates

**8. Certifications / Awards**
- Badge-style cards with glow effect

**9. Private Section Placeholder**
```
┌─────────────────────────────────┐
│  🔒  LinkedIn Profile           │
│      This profile is private    │
│      or could not be accessed   │
└─────────────────────────────────┘
```
Styled as a frosted, slightly desaturated card with a lock icon and muted text.

---

### ⚙️ TECHNICAL REQUIREMENTS

**Stack:**
- Vanilla HTML + CSS + JavaScript (no framework required, keep it fast)
- OR React with Vite for component structure
- Use GitHub REST API (`https://api.github.com`) for GitHub data — no auth required for public data
- Use `pdf.js` (Mozilla) for PDF parsing client-side
- Use `mammoth.js` for DOCX parsing client-side
- All parsing happens **client-side** (no backend needed) for resume
- LinkedIn: since direct scraping is blocked by CORS, accept a **"Paste your LinkedIn About/Experience text"** fallback input, or accept a LinkedIn JSON export

**Performance:**
- Lazy load all sections
- Images: use `loading="lazy"` and WebP where possible
- CSS animations use `will-change: transform, opacity` only where needed
- No animation jank: use `requestAnimationFrame` for JS animations
- Lighthouse score target: 90+ performance

**Responsive Breakpoints:**
- Mobile (< 768px): single column, stacked sections
- Tablet (768–1024px): 2-column grid for cards
- Desktop (> 1024px): 3-column masonry for repos, side-by-side for timeline

---

### 🔧 CODE STRUCTURE

```
index.html          — Main shell, font imports, meta tags
styles/
  main.css          — CSS variables, reset, base
  animations.css    — All keyframes and transition classes
  components.css    — Cards, badges, timeline, hero
  responsive.css    — Media queries
scripts/
  parser-resume.js  — PDF.js + mammoth.js parsing logic
  parser-github.js  — GitHub API fetching
  parser-linkedin.js — LinkedIn text parsing
  renderer.js       — DOM injection of parsed data
  animations.js     — Intersection Observer + reveal system
  main.js           — Orchestration, event listeners
```

---

### 🎨 EXTRA POLISH DETAILS

- Add a **subtle animated background**: slowly drifting particles or a pulsing circuit grid using Canvas or pure CSS
- Terminal-style **loading sequence** after user hits generate: show fake lines like `> Parsing resume...`, `> Fetching GitHub repos...`, `> Building profile...` then transition to the reveal
- Each section has a **glowing section label** in the top-left corner like a system tag: `[ EXPERIENCE ]`, `[ SKILLS ]`, `[ REPOSITORIES ]`
- Footer: `Built with ✦ and too much caffeine` in monospace
- Add a **"Download as PDF"** button that prints the rendered profile cleanly

---

### ✅ DELIVERABLE

A single working `index.html` file (or Vite project) that:
1. Accepts resume upload + LinkedIn text + GitHub username
2. Parses all available data client-side
3. Renders a stunning, animated, responsive portfolio page
4. Handles missing/private data gracefully
5. Looks like it was designed by a senior Apple + Vercel designer

Make it **jaw-dropping**. This is a showcase piece.
