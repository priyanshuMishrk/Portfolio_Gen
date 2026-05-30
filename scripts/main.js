/* =====================================================================
   main.js
   Orchestration: intake form, terminal loading sequence, parser calls,
   merge -> edit-before-reveal -> render, plus theme controls, shareable
   links, persistence, copy and reset.
   ===================================================================== */
(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  let state = null; // last rendered profile
  let editingExisting = false; // editor opened from the profile view?

  const THEME_KEY = "portfolio_gen.theme";
  const ACCENT_KEY = "portfolio_gen.accent";

  /* ----------------------------- view switching ----------------------------- */
  const VIEWS = ["intake", "loader", "editor", "profile"];
  function showOnly(view) {
    VIEWS.forEach((id) => {
      const node = $("#" + id);
      if (!node) return;
      if (id === view) node.removeAttribute("hidden");
      else node.setAttribute("hidden", "");
    });
    const inProfile = view === "profile";
    $("#edit-btn").hidden = !inProfile;
    $("#share-btn").hidden = !inProfile;
    $("#reset-btn").hidden = !inProfile;
    $("#site-nav").hidden = !inProfile;
  }

  /* ----------------------------- merge parsers -> profile ----------------------------- */
  function initials(name) {
    if (!name) return "::";
    const p = name.trim().split(/\s+/);
    return ((p[0]?.[0] || "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase() || "::";
  }

  function mergeProfile({ resume, github, linkedin }) {
    resume = resume && !resume._error ? resume : {};
    const gh = github && github.available !== undefined ? github : null;
    const li = linkedin || null;

    const name = resume.name || (gh && gh.name) || "";
    const title = resume.title || (li && li.headline) || (gh && gh.bio) || "";
    const summary = resume.summary || (li && li.about) || (gh && gh.bio) || "";

    const contacts = [];
    const seen = {};
    const add = (type, label, href, value) => {
      if (seen[type]) return;
      seen[type] = true;
      contacts.push({ type, label, href, value });
    };
    (resume.contacts || []).forEach((c) => add(c.type, c.label, c.href, c.value));
    if (gh && gh.available) add("github", "@" + gh.username, gh.url, gh.username);
    if (li && li.url) add("linkedin", "LinkedIn", li.url, li.url);

    let experience = resume.experience && resume.experience.length ? resume.experience : [];
    if (!experience.length && li && li.experience && li.experience.length)
      experience = li.experience;

    let skills = (resume.skills || []).slice();
    if (li && li.skills) skills = skills.concat(li.skills);

    return {
      name: name || "Anonymous Dev",
      title,
      summary,
      avatar: gh && gh.avatar ? gh.avatar : null,
      initials: initials(name),
      location: resume.location || (gh && gh.location) || "",
      contacts,
      skills,
      experience,
      projects: resume.projects || [],
      education: resume.education || [],
      certifications: resume.certifications || [],
      github: gh,
      linkedin: li,
    };
  }

  /* ----------------------------- terminal loading sequence ----------------------------- */
  async function typeLine(node, text, speed) {
    speed = speed || 14;
    for (let i = 0; i <= text.length; i++) {
      node.textContent = text.slice(0, i);
      await wait(speed);
    }
  }

  async function runTerminal(steps, doneSignal) {
    const body = $("#terminal-body");
    body.innerHTML = "";
    for (const step of steps) {
      const line = document.createElement("div");
      const prompt = document.createElement("span");
      prompt.className = "prompt";
      prompt.textContent = "> ";
      const cmd = document.createElement("span");
      line.appendChild(prompt);
      line.appendChild(cmd);
      body.appendChild(line);
      await typeLine(cmd, step.cmd, step.speed);
      await wait(step.wait || 220);
      if (step.tag) {
        const tag = document.createElement("span");
        tag.className = step.tagClass || "ok";
        tag.textContent = "  " + step.tag;
        line.appendChild(tag);
      }
      await wait(120);
    }
    const caret = document.createElement("span");
    caret.className = "cursor";
    body.appendChild(caret);
    await doneSignal;
    await wait(250);
  }

  function buildSteps(inputs, resumeName, aiOn) {
    const steps = [{ cmd: "initializing build_profile.sh", tag: "[ok]", wait: 200 }];
    if (inputs.hasResume) {
      if (aiOn)
        steps.push({ cmd: `analyzing resume with AI :: ${resumeName || "document"}`, tag: "[ok]", wait: 320 });
      else steps.push({ cmd: `parsing resume :: ${resumeName || "document"}`, tag: "[ok]" });
    }
    if (inputs.hasGithub)
      steps.push({ cmd: `fetching github.com/@${inputs.githubName}`, tag: "[ok]" });
    if (inputs.hasLinkedin) steps.push({ cmd: "decoding linkedin payload", tag: "[ok]" });
    if (aiOn && (inputs.hasResume || inputs.hasLinkedin))
      steps.push({ cmd: "scoring skills + gap analysis", tag: "[ok]", wait: 260 });
    steps.push({ cmd: "compiling sections", tag: "[ok]" });
    steps.push({ cmd: "rendering profile", tag: "✦", tagClass: "accent" });
    return steps;
  }

  /* ----------------------------- pipeline ----------------------------- */
  async function runPipeline(inputs) {
    showError("");
    setLoading(true);
    showOnly("loader");

    // GitHub + LinkedIn run client-side, in parallel.
    const githubTask = inputs.githubName
      ? window.GitHubParser.fetchProfile(inputs.githubName).catch(() => ({
          available: false,
          error: "network",
          username: inputs.githubName,
        }))
      : Promise.resolve(null);
    const linkedinHeuristic =
      inputs.linkedinUrl || inputs.linkedinText
        ? window.LinkedInParser.parse({ url: inputs.linkedinUrl, text: inputs.linkedinText })
        : null;

    // Resume / profile text -> prefer the AI backend (accurate), else heuristics.
    const aiOn = window.AI && window.AI.ready;
    let analysis = null;
    const resumeTask = (async () => {
      const ctx = inputs.linkedinText ? "LinkedIn:\n" + inputs.linkedinText : "";
      if (inputs.file && aiOn) {
        try {
          const r = await window.AI.analyzeResume(inputs.file, ctx);
          analysis = r.analysis || null;
          return normalizeAiProfile(r.profile);
        } catch (e) {
          console.warn("[ai] resume failed, falling back:", e.message);
          return window.ResumeParser.parse(inputs.file).catch((er) => ({ _error: String(er) }));
        }
      }
      if (inputs.file) return window.ResumeParser.parse(inputs.file).catch((e) => ({ _error: String(e) }));
      // No resume file: if we only have LinkedIn text, the AI can still structure it.
      if (!inputs.file && inputs.linkedinText && aiOn) {
        try {
          const r = await window.AI.analyzeText(inputs.linkedinText);
          analysis = r.analysis || null;
          return normalizeAiProfile(r.profile);
        } catch (e) {
          console.warn("[ai] text failed:", e.message);
        }
      }
      return null;
    })();

    const parsing = Promise.all([resumeTask, githubTask]).then(([resume, github]) => ({
      resume,
      github,
      linkedin: linkedinHeuristic,
    }));

    const steps = buildSteps(inputs, inputs.file ? inputs.file.name : "", aiOn);
    await runTerminal(steps, parsing);

    const results = await parsing;
    const profile = mergeProfile(results);
    profile.analysis = analysis;
    openEditor(profile, false); // review before the big reveal
  }

  // Convert the LLM profile shape -> the resume shape mergeProfile expects.
  function normalizeAiProfile(p) {
    if (!p) return null;
    return {
      name: p.name || "",
      title: p.title || "",
      summary: p.summary || "",
      location: p.location || "",
      contacts: (p.contacts || []).map((c) => ({
        type: c.type || "website",
        label: c.value || c.url || "",
        href:
          c.url ||
          (c.type === "email" ? "mailto:" + c.value : c.type === "phone" ? "tel:" + c.value : c.value),
        value: c.value || c.url || "",
      })),
      skills: p.skills || [],
      experience: p.experience || [],
      education: p.education || [],
      certifications: p.certifications || [],
      projects: p.projects || [],
      _source: "ai",
    };
  }

  /* ----------------------------- editor + reveal ----------------------------- */
  function openEditor(profile, fromExisting) {
    editingExisting = !!fromExisting;
    window.ProfileEditor.build(profile);
    showOnly("editor");
    setLoading(false);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function reveal(profile) {
    state = profile;
    window.Renderer.render(profile);
    showOnly("profile");
    setLoading(false);
    window.ProfileState.persist(profile);

    requestAnimationFrame(() => {
      window.Animations.observe();
      window.Animations.initNav();
      $("#hero").classList.add("is-visible");
      window.scrollTo({ top: 0, behavior: "auto" });
    });
  }

  /* ----------------------------- UI helpers ----------------------------- */
  function setLoading(on) {
    const btn = $("#generate-btn");
    btn.classList.toggle("is-loading", on);
    btn.disabled = on;
  }
  function showError(msg) {
    const e = $("#intake-error");
    if (!msg) {
      e.hidden = true;
      e.textContent = "";
    } else {
      e.hidden = false;
      e.textContent = msg;
    }
  }

  let toastTimer;
  function toast(text) {
    const t = $("#toast");
    $("#toast-text").textContent = text;
    t.hidden = false;
    requestAnimationFrame(() => t.classList.add("is-show"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      t.classList.remove("is-show");
      setTimeout(() => (t.hidden = true), 320);
    }, 1900);
  }

  async function clipboardWrite(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ----------------------------- theme controls ----------------------------- */
  function applyTheme(mode) {
    const m = mode === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", m);
    $("#theme-toggle-icon").innerHTML = m === "light" ? "&#9728;" : "&#9789;"; // sun / moon
  }
  function selectSwatch(sw, all) {
    all.forEach((s) => s.classList.remove("is-active"));
    sw.classList.add("is-active");
    const r = document.documentElement.style;
    r.setProperty("--accent-cyan", sw.dataset.c1);
    r.setProperty("--accent-violet", sw.dataset.c2);
    r.setProperty("--accent-cyan-rgb", sw.dataset.rgb1);
    r.setProperty("--accent-violet-rgb", sw.dataset.rgb2);
  }
  function initTheme() {
    let mode = null;
    try {
      mode = localStorage.getItem(THEME_KEY);
    } catch (e) {}
    if (!mode)
      mode = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    applyTheme(mode);

    const swatches = Array.from(document.querySelectorAll("#accent-swatches .swatch"));
    let idx = 0;
    try {
      const saved = localStorage.getItem(ACCENT_KEY);
      if (saved != null) idx = parseInt(saved, 10);
    } catch (e) {}
    if (isNaN(idx) || idx < 0 || idx >= swatches.length) idx = 0;
    if (swatches[idx]) selectSwatch(swatches[idx], swatches);

    $("#theme-toggle").addEventListener("click", () => {
      const cur = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
      const next = cur === "light" ? "dark" : "light";
      applyTheme(next);
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch (e) {}
    });
    swatches.forEach((sw, i) =>
      sw.addEventListener("click", () => {
        selectSwatch(sw, swatches);
        try {
          localStorage.setItem(ACCENT_KEY, String(i));
        } catch (e) {}
      })
    );
  }

  /* ----------------------------- demo profile ----------------------------- */
  function demoActivity() {
    const counts = {};
    let total = 0;
    const today = new Date();
    for (let i = 0; i < 90; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      if (Math.random() > 0.42) {
        const c = 1 + Math.floor(Math.random() * 6);
        counts[d.toISOString().slice(0, 10)] = c;
        total += c;
      }
    }
    return { counts, total };
  }

  function demoProfile() {
    return {
      name: "Ada Lovelace",
      title: "Full-Stack Engineer · Systems & Machine Learning",
      summary:
        "Engineer obsessed with the seam between elegant interfaces and the systems beneath them. I build fast, resilient products end-to-end — from type-safe APIs and distributed pipelines to the pixel-perfect frontends people actually enjoy using. Equal parts pragmatist and tinkerer.",
      avatar: null,
      initials: "AL",
      location: "London, UK",
      contacts: [
        { type: "email", label: "ada@analytical.dev", href: "mailto:ada@analytical.dev", value: "ada@analytical.dev" },
        { type: "github", label: "@analyticalada", href: "https://github.com/analyticalada", value: "analyticalada" },
        { type: "linkedin", label: "LinkedIn", href: "https://linkedin.com/in/analyticalada", value: "https://linkedin.com/in/analyticalada" },
      ],
      skills: [
        "TypeScript", "Python", "Rust", "Go", "SQL",
        "React", "Next.js", "Node.js", "FastAPI", "PyTorch", "TailwindCSS",
        "Docker", "Kubernetes", "AWS", "PostgreSQL", "Redis", "GraphQL", "Figma",
      ],
      experience: [
        { role: "Principal Engineer", company: "Difference Engine Labs", dates: "2022 — Present",
          description: "Lead the platform team building a real-time analytics engine processing 4B+ events/day. Cut p99 latency 63% by rewriting the ingestion path in Rust and introducing tiered caching." },
        { role: "Senior Software Engineer", company: "Babbage Systems", dates: "2019 — 2022",
          description: "Owned the design system and core API. Shipped the company's first ML-driven recommendations, lifting engagement 28%. Mentored five engineers." },
        { role: "Software Engineer", company: "Nautilus", dates: "2017 — 2019",
          description: "Built customer-facing dashboards in React and a GraphQL gateway consolidating eight legacy services." },
      ],
      projects: [
        { name: "Aurora", description: "GPU-accelerated charting library rendering 1M+ points at a steady 60fps in the browser.", url: "#" },
        { name: "Quill", description: "Local-first markdown notes with CRDT sync and end-to-end encryption.", url: "#" },
        { name: "Beacon", description: "A tiny uptime monitor that auto-generates a public status page." },
      ],
      education: [
        { school: "University of London", degree: "B.Sc. Computer Science", dates: "2013 — 2017" },
        { school: "Royal Institution", degree: "Cert. Applied Mathematics", dates: "2012" },
      ],
      certifications: [
        "AWS Certified Solutions Architect — Professional",
        "Certified Kubernetes Administrator (CKA)",
        "Google Cloud Professional ML Engineer",
        "Hackathon Grand Prize — DevCon 2023",
      ],
      github: {
        available: true, private: false, username: "analyticalada", name: "Ada Lovelace",
        avatar: null, url: "https://github.com/analyticalada",
        stats: { repos: 48, stars: 1284, followers: 910, following: 64 },
        languages: [
          { name: "TypeScript", pct: 38, color: "#3178c6" },
          { name: "Rust", pct: 24, color: "#dea584" },
          { name: "Python", pct: 20, color: "#3572A5" },
          { name: "Go", pct: 12, color: "#00ADD8" },
          { name: "CSS", pct: 6, color: "#563d7c" },
        ],
        activity: demoActivity(),
        repos: [
          { name: "tensor-stream", description: "A zero-copy streaming tensor library for the browser.", stars: 642, forks: 73, language: "Rust", langColor: "#dea584", url: "#" },
          { name: "spring-ui", description: "iOS-style spring animation primitives for React.", stars: 318, forks: 41, language: "TypeScript", langColor: "#3178c6", url: "#" },
          { name: "edge-rag", description: "Retrieval-augmented generation that runs entirely at the edge.", stars: 204, forks: 28, language: "Python", langColor: "#3572A5", url: "#" },
          { name: "glasscn", description: "Glassmorphic component kit with a focus on motion.", stars: 96, forks: 12, language: "TypeScript", langColor: "#3178c6", url: "#" },
          { name: "go-pipe", description: "Composable concurrent pipelines for Go.", stars: 21, forks: 4, language: "Go", langColor: "#00ADD8", url: "#" },
          { name: "dotfiles", description: "My terminal, neatly automated.", stars: 3, forks: 1, language: "Shell", langColor: "#89e051", url: "#" },
        ],
      },
      linkedin: null,
      analysis: {
        skills: {
          TypeScript: 92, Rust: 84, Python: 80, React: 90,
          "Node.js": 86, AWS: 74, GraphQL: 70, PyTorch: 66,
        },
        progress: { Jan: 58, Feb: 63, Mar: 68, Apr: 76, May: 83, Jun: 90 },
        missing_keywords: ["Kubernetes", "Terraform", "gRPC", "Observability", "LLM Ops"],
        suggested_improvements: [
          "Quantify impact with hard numbers on every role (latency, scale, revenue).",
          "Add a leadership/mentorship line to underscore seniority.",
          "List a cloud certification (AWS / GCP) to pass ATS filters.",
          "Link a flagship project with a live demo or case study.",
        ],
        overall_score: 91,
        rank_percentile: 8,
        experience_years: 9,
      },
    };
  }

  async function runDemo() {
    setLoading(true);
    showOnly("loader");
    const ready = wait(40).then(() => demoProfile());
    await runTerminal(
      buildSteps(
        { hasResume: true, hasGithub: true, githubName: "analyticalada", hasLinkedin: true },
        "ada_lovelace.pdf",
        true
      ),
      ready
    );
    reveal(await ready); // demo skips the editor and reveals directly
  }

  /* ----------------------------- reset ----------------------------- */
  function reset() {
    state = null;
    window.ProfileState.clear();
    window.ProfileState.clearHash();
    showOnly("intake");
    $("#intake-form").reset();
    const f = $("#dropzone-file");
    f.hidden = true;
    f.textContent = "";
    fileRef = null;
    showError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ----------------------------- wire up ----------------------------- */
  let fileRef = null;

  function bindDropzone() {
    const dz = $("#dropzone");
    const input = $("#resume-input");
    const label = $("#dropzone-file");

    const setFile = (file) => {
      if (!file) return;
      const ok = /\.(pdf|docx?|txt)$/i.test(file.name) || /pdf|word/i.test(file.type);
      if (!ok) {
        showError("Please choose a PDF or DOCX file.");
        return;
      }
      fileRef = file;
      label.hidden = false;
      label.textContent = "✓ " + file.name;
      showError("");
    };

    input.addEventListener("change", () => setFile(input.files[0]));
    dz.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        input.click();
      }
    });
    ["dragenter", "dragover"].forEach((ev) =>
      dz.addEventListener(ev, (e) => {
        e.preventDefault();
        dz.classList.add("is-drag");
      })
    );
    ["dragleave", "drop"].forEach((ev) =>
      dz.addEventListener(ev, (e) => {
        e.preventDefault();
        dz.classList.remove("is-drag");
      })
    );
    dz.addEventListener("drop", (e) => {
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) setFile(file);
    });
  }

  function bindForm() {
    $("#intake-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const githubName = $("#github-input").value.trim();
      const linkedinUrl = $("#linkedin-url").value.trim();
      const linkedinText = $("#linkedin-text").value.trim();

      if (!fileRef && !githubName && !linkedinUrl && !linkedinText) {
        showError("Add at least one input — a resume, a GitHub handle, or LinkedIn text.");
        return;
      }
      runPipeline({
        file: fileRef,
        hasResume: !!fileRef,
        githubName,
        hasGithub: !!githubName,
        linkedinUrl,
        linkedinText,
        hasLinkedin: !!(linkedinUrl || linkedinText),
      });
    });
  }

  function bindEditor() {
    $("#editor-confirm").addEventListener("click", () => {
      reveal(window.ProfileEditor.collect());
    });
    $("#editor-cancel").addEventListener("click", () => {
      if (editingExisting && state) showOnly("profile");
      else showOnly("intake");
    });
    $("#edit-btn").addEventListener("click", () => {
      if (state) openEditor(state, true);
    });
  }

  function bindMisc() {
    $("#demo-btn").addEventListener("click", runDemo);
    $("#reset-btn").addEventListener("click", reset);

    $("#download-btn").addEventListener("click", () => {
      window.Animations.revealAll();
      setTimeout(() => window.print(), 200);
    });

    $("#share-btn").addEventListener("click", async () => {
      if (!state) return;
      try {
        const url = await window.ProfileState.buildShareUrl(state);
        const ok = await clipboardWrite(url);
        toast(ok ? "Share link copied!" : "Could not copy link");
      } catch (e) {
        toast("Could not build share link");
      }
    });

    // copy-to-clipboard on contact pills
    $("#hero-meta").addEventListener("click", async (e) => {
      const a = e.target.closest("a[data-copy]");
      if (a) {
        e.preventDefault();
        const ok = await clipboardWrite(a.dataset.copy);
        toast(ok ? "Copied " + a.dataset.copy : "Copy failed");
      }
    });
  }

  /* ----------------------------- restore on boot ----------------------------- */
  async function tryRestore() {
    let profile = null;
    try {
      profile = await window.ProfileState.readHash();
    } catch (e) {}
    if (!profile) profile = window.ProfileState.load();
    if (profile) reveal(profile);
    else showOnly("intake");
  }

  // Reflect AI availability on the intake screen.
  function updateAiBadge() {
    const note = $("#intake-note");
    if (!note) return;
    if (window.AI && window.AI.ready) {
      note.innerHTML =
        '<span class="ai-pill ai-pill--on">⚡ AI analysis ON</span> &mdash; resumes are parsed &amp; scored by an LLM.';
    } else {
      note.innerHTML =
        '<span class="ai-pill ai-pill--off">○ AI analysis OFF</span> &mdash; using fast local parsing. Run <code>node server/server.js</code> for AI.';
    }
  }

  /* ----------------------------- boot ----------------------------- */
  document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    bindDropzone();
    bindForm();
    bindEditor();
    bindMisc();
    window.Animations.initParticles();
    window.Animations.initTilt();
    tryRestore();
    if (window.AI) window.AI.health().then(updateAiBadge);
  });
})();
