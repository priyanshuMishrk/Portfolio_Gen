/* =====================================================================
   renderer.js
   Takes a merged, normalized profile object and injects it into the DOM.
   Each section reveals itself only when it has data, so missing fields
   degrade gracefully (no empty cards). Private GitHub/LinkedIn data is
   shown as a frosted "locked" card instead of an error.

   Exposes: window.Renderer.render(profile)
   ===================================================================== */
(function () {
  "use strict";

  /* ----------------------------- tiny DOM helpers ----------------------------- */
  const $ = (sel) => document.querySelector(sel);
  const show = (el) => el && el.removeAttribute("hidden");
  const hide = (el) => el && el.setAttribute("hidden", "");
  const clear = (el) => {
    while (el && el.firstChild) el.removeChild(el.firstChild);
  };
  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  const esc = (s) =>
    String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  /* ----------------------------- icons (inline SVG) ----------------------------- */
  const ICON = {
    mail: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
    pin: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    github:
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 1.3a10.7 10.7 0 0 0-3.4 20.9c.5.1.7-.2.7-.5v-2c-3 .6-3.6-1.3-3.6-1.3-.5-1.2-1.2-1.6-1.2-1.6-1-.6.1-.6.1-.6 1 .1 1.6 1 1.6 1 .9 1.6 2.4 1.1 3 .9.1-.7.4-1.1.6-1.4-2.4-.3-4.9-1.2-4.9-5.3 0-1.2.4-2.1 1-2.9-.1-.3-.5-1.4.1-2.8 0 0 .9-.3 2.9 1.1a10 10 0 0 1 5.2 0c2-1.4 2.9-1.1 2.9-1.1.6 1.4.2 2.5.1 2.8.7.8 1 1.7 1 2.9 0 4.1-2.5 5-4.9 5.3.4.3.7.9.7 1.9v2.8c0 .3.2.6.7.5A10.7 10.7 0 0 0 12 1.3Z"/></svg>',
    linkedin:
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3V9Zm6 0h3.8v1.7h.1c.5-1 1.8-2 3.7-2 4 0 4.7 2.6 4.7 6V21h-4v-5.3c0-1.3 0-2.9-1.8-2.9s-2 1.4-2 2.8V21H9V9Z"/></svg>',
    phone:
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 5 5L19 13l2 5v3a1 1 0 0 1-1 1A17 17 0 0 1 3 5a1 1 0 0 1 1-1Z"/></svg>',
    star: '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="m12 2 3 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.9 21l1.2-6.8-5-4.9 6.9-1L12 2Z"/></svg>',
    fork: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="5" r="2.2"/><circle cx="18" cy="5" r="2.2"/><circle cx="12" cy="19" r="2.2"/><path d="M6 7v3a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V7M12 13v4"/></svg>',
    repo: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 0 4 22V4.5Z"/><path d="M4 17.5A2.5 2.5 0 0 1 6.5 15H20"/></svg>',
    cert: "&#9733;",
  };

  const contactIcon = (type) =>
    ({
      email: ICON.mail,
      github: ICON.github,
      linkedin: ICON.linkedin,
      phone: ICON.phone,
      website: ICON.pin,
    }[type] || ICON.pin);

  /* ----------------------------- skill categorisation ----------------------------- */
  const SKILL_BUCKETS = [
    {
      label: "Languages",
      keys: /^(javascript|js|typescript|ts|python|java|c\+\+|c#|c|go|golang|rust|ruby|php|swift|kotlin|dart|scala|r|sql|html|css|bash|shell|perl|lua|elixir|haskell|solidity)$/i,
    },
    {
      label: "Frameworks & Libraries",
      keys: /^(react|reactjs|vue|vuejs|angular|svelte|next\.?js|nuxt|node\.?js|node|express|django|flask|fastapi|rails|spring|laravel|\.net|asp\.net|tensorflow|pytorch|keras|redux|tailwind|bootstrap|jquery|three\.?js|d3)$/i,
    },
    {
      label: "Tools & Platforms",
      keys: /^(docker|kubernetes|k8s|aws|gcp|azure|git|github|gitlab|jenkins|terraform|ansible|figma|jira|postgres|postgresql|mysql|mongodb|redis|kafka|rabbitmq|graphql|rest|webpack|vite|linux|nginx|firebase|supabase|vercel|netlify)$/i,
    },
  ];

  function groupSkills(skills) {
    // Already grouped? pass through.
    if (skills.length && typeof skills[0] === "object" && skills[0].items) return skills;
    const groups = { Languages: [], "Frameworks & Libraries": [], "Tools & Platforms": [], Other: [] };
    skills.forEach((s) => {
      const bucket = SKILL_BUCKETS.find((b) => b.keys.test(s.replace(/\.js$/i, "").trim()));
      (groups[bucket ? bucket.label : "Other"]).push(s);
    });
    const result = Object.entries(groups)
      .filter(([, arr]) => arr.length)
      .map(([category, items]) => ({ category, items }));
    // If everything landed in "Other", relabel for a cleaner look.
    if (result.length === 1 && result[0].category === "Other") result[0].category = "Core Skills";
    return result;
  }

  /* ----------------------------- locked card ----------------------------- */
  function lockedCard(title, sub) {
    const c = el("div", "lock-card stagger-item");
    c.innerHTML = `
      <span class="lock-card__icon" aria-hidden="true">&#128274;</span>
      <span class="lock-card__title">${esc(title)}</span>
      <span class="lock-card__sub">${esc(sub)}</span>`;
    return c;
  }

  /* ----------------------------- section renderers ----------------------------- */

  function renderHero(p) {
    const avatar = $("#hero-avatar");
    clear(avatar);
    if (p.avatar) {
      const img = el("img");
      img.src = p.avatar;
      img.alt = p.name ? p.name + " avatar" : "avatar";
      img.loading = "lazy";
      img.onerror = () => {
        clear(avatar);
        avatar.textContent = p.initials || "::";
      };
      avatar.appendChild(img);
    } else {
      avatar.textContent = p.initials || "::";
    }

    $("#hero-name").textContent = p.name || "Anonymous Dev";

    // Headline animated by the typewriter (animations.js) if available.
    const headlineEl = $("#hero-headline");
    const headline = p.title || (p.github && p.github.bio) || "Builder of things";
    headlineEl.textContent = "";
    if (window.Animations && window.Animations.typewriter) {
      window.Animations.typewriter(headlineEl, headline);
    } else {
      headlineEl.textContent = headline;
    }

    // Meta pills
    const meta = $("#hero-meta");
    clear(meta);
    if (p.location) {
      const pill = el("span", "pill");
      pill.innerHTML = `<span class="pill__icon">${ICON.pin}</span>${esc(p.location)}`;
      meta.appendChild(pill);
    }
    (p.contacts || []).forEach((c) => {
      const a = el("a", "pill is-clickable");
      a.innerHTML = `<span class="pill__icon">${contactIcon(c.type)}</span>${esc(c.label)}`;
      if (c.type === "email" || c.type === "phone") {
        // copy-to-clipboard niceties handled in main.js via data attr
        a.href = c.href || "#";
        a.dataset.copy = c.value;
      } else {
        a.href = c.href || "#";
        a.target = "_blank";
        a.rel = "noopener";
      }
      meta.appendChild(a);
    });
  }

  function renderAbout(p) {
    const sec = $("#about");
    const about = p.summary || (p.linkedin && p.linkedin.about) || (p.github && p.github.bio) || "";
    if (!about) return hide(sec);
    const target = $("#about-text");
    clear(target);
    // Word-by-word reveal: wrap each word in an inline-block span. The space
    // must live OUTSIDE the span as a real text node — a trailing space inside
    // an inline-block is collapsed by the browser, which jams words together.
    about
      .trim()
      .split(/\s+/)
      .forEach((w, i) => {
        const span = el("span", "word", esc(w));
        span.style.setProperty("--w", i);
        target.appendChild(span);
        target.appendChild(document.createTextNode(" "));
      });
    show(sec);
  }

  function renderSkills(p) {
    const sec = $("#skills");
    const skills = p.skills || [];
    if (!skills.length) return hide(sec);
    const wrap = $("#skills-groups");
    clear(wrap);
    let idx = 0;
    groupSkills(skills).forEach((group) => {
      const g = el("div", "skill-group stagger-item");
      g.style.setProperty("--i", idx++);
      g.appendChild(el("div", "skill-group__label", esc(group.category)));
      const tags = el("div", "skill-tags");
      group.items.forEach((s, i) => {
        const t = el("span", "skill-tag badge-pop", esc(s));
        t.style.setProperty("--i", i);
        tags.appendChild(t);
      });
      g.appendChild(tags);
      wrap.appendChild(g);
    });
    show(sec);
  }

  function renderExperience(p) {
    const sec = $("#experience");
    const exp = p.experience || [];
    const tl = $("#timeline");
    clear(tl);

    if (!exp.length) {
      // If a LinkedIn profile was provided but private, surface it here.
      if (p.linkedin && p.linkedin.private) {
        tl.appendChild(
          lockedCard(
            "LinkedIn Profile is Private",
            "This profile is private or could not be accessed. Paste your About / Experience text to include it."
          )
        );
        show(sec);
        return;
      }
      return hide(sec);
    }

    tl.appendChild(el("span", "timeline__line"));
    exp.forEach((e, i) => {
      const item = el("div", "timeline-item stagger-item");
      item.style.setProperty("--i", i);

      const title = e.role || e.company || "Role";
      const sub = e.role && e.company ? e.company : "";
      const initial = ((e.company || e.role || "?").trim()[0] || "?").toUpperCase();

      // Render long descriptions as scannable bullets instead of a wall of text.
      const points = splitSentences(e.description);
      let descHtml = "";
      if (points.length > 1) {
        descHtml = `<ul class="timeline-item__list">${points
          .map((b) => `<li>${esc(b)}</li>`)
          .join("")}</ul>`;
      } else if (e.description) {
        descHtml = `<p class="timeline-item__desc">${esc(e.description)}</p>`;
      }

      item.innerHTML = `
        <span class="timeline-item__dot"></span>
        <div class="timeline-item__card">
          <div class="timeline-item__head">
            <span class="timeline-item__logo" aria-hidden="true">${esc(initial)}</span>
            <div class="timeline-item__titles">
              <span class="timeline-item__role">${esc(title)}</span>
              ${sub ? `<span class="timeline-item__company">${esc(sub)}</span>` : ""}
            </div>
            ${e.dates ? `<span class="timeline-item__dates">${esc(e.dates)}</span>` : ""}
          </div>
          ${descHtml}
        </div>`;
      tl.appendChild(item);
    });
    show(sec);
  }

  // Split a joined description into individual sentences/achievements.
  function splitSentences(text) {
    if (!text) return [];
    return text
      .split(/(?<=[.!?])\s+(?=[A-Z(])/)
      .map((s) => s.trim().replace(/\s*[,;]\s*$/, ""))
      .filter((s) => s.length > 2)
      .slice(0, 6);
  }

  function renderGithub(p) {
    const sec = $("#repos");
    const gh = p.github;
    if (!gh) return hide(sec); // no username supplied

    const statsEl = $("#gh-stats");
    const langsEl = $("#gh-langs");
    const activityEl = $("#gh-activity");
    const gridEl = $("#repo-grid");
    clear(statsEl);
    clear(langsEl);
    clear(activityEl);
    clear(gridEl);

    if (!gh.available || gh.private) {
      let msg = "Repositories are private or unavailable.";
      if (gh.error === "notfound") msg = `No public GitHub user "@${gh.username}" was found.`;
      else if (gh.error === "ratelimit")
        msg = "GitHub API rate limit reached — try again in a little while.";
      else if (gh.private) msg = "This account has no public repositories.";
      gridEl.appendChild(lockedCard("Repositories are Private", msg));
      show(sec);
      return;
    }

    renderActivity(gh, activityEl);

    // Stats grid (count-up handled by animations.js via data-count)
    const stats = [
      ["repos", "Repos"],
      ["stars", "Stars"],
      ["followers", "Followers"],
      ["following", "Following"],
    ];
    stats.forEach(([key, label], i) => {
      const card = el("div", "stat stagger-item");
      card.style.setProperty("--i", i);
      const num = el("div", "stat__num");
      num.dataset.count = gh.stats[key] || 0;
      num.textContent = "0";
      card.appendChild(num);
      card.appendChild(el("div", "stat__label", label));
      statsEl.appendChild(card);
    });

    // Language bar
    if (gh.languages && gh.languages.length) {
      const bar = el("div", "lang-bar");
      gh.languages.forEach((l) => {
        const fill = el("span", "lang-bar__fill");
        fill.dataset.w = l.pct;
        fill.style.background = l.color;
        fill.title = `${l.name} ${l.pct}%`;
        bar.appendChild(fill);
      });
      langsEl.appendChild(bar);

      const legend = el("div", "lang-legend");
      gh.languages.forEach((l, i) => {
        const item = el("span", "lang-legend__item");
        const dot = el("span", "lang-dot");
        dot.style.background = l.color;
        dot.style.setProperty("--i", i);
        item.appendChild(dot);
        item.appendChild(document.createTextNode(`${l.name} · ${l.pct}%`));
        legend.appendChild(item);
      });
      langsEl.appendChild(legend);
    }

    // Repo cards (alternating slide-in)
    gh.repos.forEach((r, i) => {
      const a = el("a", "repo-card " + (i % 2 === 0 ? "slide-left" : "slide-right"));
      a.href = r.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.style.setProperty("--i", Math.floor(i / 2));
      a.innerHTML = `
        <span class="repo-card__name"><span class="repo-ico">${ICON.repo}</span>${esc(r.name)}</span>
        <span class="repo-card__desc">${esc(r.description || "No description provided.")}</span>
        <span class="repo-card__meta">
          ${r.language ? `<span><span class="lang-dot" style="background:${r.langColor}"></span>${esc(r.language)}</span>` : ""}
          <span>${ICON.star}${r.stars}</span>
          <span>${ICON.fork}${r.forks}</span>
        </span>`;
      gridEl.appendChild(a);
    });

    show(sec);
  }

  // Build an animated SVG area+line chart from a [{label,value}] series.
  function areaLineChart(series, opts) {
    opts = opts || {};
    const W = 600;
    const H = 250;
    const pad = { l: 38, r: 16, t: 18, b: 30 };
    const n = series.length;
    const maxV = Math.max(1, ...series.map((d) => d.value));
    // round the axis max up to something tidy (or use a forced max, e.g. 100)
    const axisMax = opts.max || niceMax(maxV);
    const x = (i) => pad.l + (n === 1 ? 0 : (i / (n - 1)) * (W - pad.l - pad.r));
    const y = (v) => H - pad.b - (v / axisMax) * (H - pad.t - pad.b);

    const pts = series.map((d, i) => [x(i), y(d.value)]);
    const linePath = "M " + pts.map((q) => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(" L ");
    const areaPath =
      `M ${pts[0][0].toFixed(1)} ${(H - pad.b).toFixed(1)} L ` +
      pts.map((q) => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(" L ") +
      ` L ${pts[n - 1][0].toFixed(1)} ${(H - pad.b).toFixed(1)} Z`;

    // y gridlines + labels
    const gridN = 4;
    let grid = "";
    for (let g = 0; g <= gridN; g++) {
      const val = (axisMax / gridN) * g;
      const gy = y(val);
      grid += `<line class="growth-chart__grid" x1="${pad.l}" y1="${gy.toFixed(1)}" x2="${W - pad.r}" y2="${gy.toFixed(1)}"/>`;
      grid += `<text class="growth-chart__ytick" x="${pad.l - 6}" y="${(gy + 3).toFixed(1)}" text-anchor="end">${fmtTick(val, opts.unit)}</text>`;
    }

    // x labels — thin them out so they don't collide
    const step = Math.max(1, Math.ceil(n / 6));
    let xlabels = "";
    series.forEach((d, i) => {
      if (i % step === 0 || i === n - 1) {
        xlabels += `<text class="growth-chart__xtick" x="${x(i).toFixed(1)}" y="${H - pad.b + 18}" text-anchor="middle">${esc(d.label)}</text>`;
      }
    });

    // dots
    let dots = "";
    pts.forEach((q, i) => {
      dots += `<circle class="growth-chart__dot" style="--i:${i}" cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="3.5"><title>${esc(series[i].label)}: ${fmtTick(series[i].value, opts.unit)}</title></circle>`;
    });

    return `
      <figcaption class="growth-chart__cap">
        <span class="growth-chart__title">${esc(opts.title || "")}</span>
        <span class="growth-chart__val">${esc(opts.value || "")}</span>
      </figcaption>
      <svg class="growth-chart__svg ${opts.variant || ""}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(opts.title || "chart")}">
        ${grid}
        <path class="growth-chart__area" d="${areaPath}"/>
        <path class="growth-chart__line" pathLength="1" d="${linePath}"/>
        ${dots}
        ${xlabels}
      </svg>`;
  }

  function niceMax(v) {
    if (v <= 5) return Math.ceil(v);
    if (v <= 10) return Math.ceil(v / 2) * 2;
    if (v <= 50) return Math.ceil(v / 5) * 5;
    return Math.ceil(v / 10) * 10;
  }
  function fmtTick(v, unit) {
    const r = Math.round(v * 10) / 10;
    const s = Number.isInteger(r) ? String(r) : r.toFixed(1);
    return unit ? s + unit : s;
  }

  function renderGrowth(p) {
    const sec = $("#growth");
    const a = window.CareerAnalytics ? window.CareerAnalytics.analyze(p) : null;
    if (!a) return hide(sec);

    // summary stat chips (count-up animated via animations.js)
    const stats = $("#growth-stats");
    clear(stats);
    const chip = (value, label, unit, decimal) => {
      const c = el("div", "growth-stat stagger-item");
      const num = el("div", "growth-stat__num");
      num.dataset.count = value;
      if (unit) num.dataset.suffix = unit;
      if (decimal) num.dataset.decimal = "1";
      num.textContent = "0";
      c.appendChild(num);
      c.appendChild(el("div", "growth-stat__label", label));
      return c;
    };
    stats.appendChild(chip(a.totalYears, "Years Experience", "+", true));
    stats.appendChild(chip(a.companies, "Companies", "", false));
    stats.appendChild(chip(a.skillsCount, "Technologies", "", false));
    if (a.currentRole) {
      const c = el("div", "growth-stat growth-stat--wide stagger-item");
      c.innerHTML = `<div class="growth-stat__role">${esc(a.currentRole)}</div><div class="growth-stat__label">Current Focus</div>`;
      stats.appendChild(c);
    }
    Array.from(stats.children).forEach((n, i) => n.style.setProperty("--i", i));

    $("#growth-exp").innerHTML = areaLineChart(a.experienceSeries, {
      title: "Experience Growth",
      value: `${a.totalYears}+ yrs`,
      unit: "y",
      variant: "growth-chart--cyan",
    });
    $("#growth-skills").innerHTML = areaLineChart(a.skillsSeries, {
      title: "Skills Acquired",
      value: `${a.skillsCount} techs`,
      variant: "growth-chart--violet",
    });

    show(sec);
  }

  // Radar (spider) chart from { skill: 0-100 }.
  function buildRadar(skillsObj) {
    const entries = Object.entries(skillsObj || {}).filter(([k]) => k);
    const n = entries.length;
    if (n < 3) return "";
    const W = 400, H = 360, cx = 200, cy = 185, R = 118;
    const ang = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const pt = (i, r) => [cx + Math.cos(ang(i)) * r, cy + Math.sin(ang(i)) * r];

    let rings = "";
    [0.25, 0.5, 0.75, 1].forEach((f) => {
      const pts = entries.map((_, i) => pt(i, R * f).map((v) => v.toFixed(1)).join(",")).join(" ");
      rings += `<polygon class="radar__ring" points="${pts}"/>`;
    });
    let spokes = "";
    entries.forEach((_, i) => {
      const [x, y] = pt(i, R);
      spokes += `<line class="radar__spoke" x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`;
    });
    const dataPts = entries
      .map(([, v], i) => pt(i, R * (Math.max(0, Math.min(100, v)) / 100)).map((c) => c.toFixed(1)).join(","))
      .join(" ");
    let dots = "";
    let labels = "";
    entries.forEach(([k, v], i) => {
      const [dx, dy] = pt(i, R * (Math.max(0, Math.min(100, v)) / 100));
      dots += `<circle class="radar__dot" cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="3"><title>${esc(k)}: ${v}%</title></circle>`;
      const a = ang(i);
      const [lx, ly] = pt(i, R + 16);
      const anchor = Math.cos(a) > 0.3 ? "start" : Math.cos(a) < -0.3 ? "end" : "middle";
      const ldy = Math.sin(a) > 0.5 ? "0.9em" : Math.sin(a) < -0.5 ? "-0.35em" : "0.32em";
      labels += `<text class="radar__label" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}" dy="${ldy}">${esc(k)}</text>`;
    });

    return `<svg class="radar__svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Skill proficiency radar">
      ${rings}${spokes}
      <g class="radar__shape"><polygon class="radar__area" points="${dataPts}"/>${dots}</g>
      ${labels}</svg>`;
  }

  function renderSkillIntel(p) {
    const sec = $("#intel");
    const a = p.analysis;
    if (!a || !a.skills || Object.keys(a.skills).length < 3) return hide(sec);

    // ---- score stat chips ----
    const scoreEl = $("#intel-score");
    clear(scoreEl);
    const chip = (cfg) => {
      const c = el("div", "growth-stat stagger-item");
      const num = el("div", "growth-stat__num");
      num.dataset.count = cfg.value;
      if (cfg.suffix) num.dataset.suffix = cfg.suffix;
      if (cfg.prefix) num.dataset.prefix = cfg.prefix;
      if (cfg.decimal) num.dataset.decimal = "1";
      num.textContent = cfg.prefix || "0";
      c.appendChild(num);
      c.appendChild(el("div", "growth-stat__label", cfg.label));
      return c;
    };
    scoreEl.appendChild(chip({ value: a.overall_score, suffix: "", label: "Resume Score" }));
    scoreEl.appendChild(chip({ value: a.rank_percentile, prefix: "Top ", suffix: "%", label: "Ranking" }));
    if (a.experience_years)
      scoreEl.appendChild(chip({ value: a.experience_years, suffix: "y", decimal: true, label: "Experience" }));
    scoreEl.appendChild(chip({ value: Object.keys(a.skills).length, suffix: "", label: "Skills Scored" }));
    Array.from(scoreEl.children).forEach((n, i) => n.style.setProperty("--i", i));

    // ---- radar ----
    $("#intel-radar").innerHTML =
      `<figcaption class="intel-card__title">Skill Proficiency Radar</figcaption>` + buildRadar(a.skills);

    // ---- progress over time ----
    const prog = a.progress || {};
    const order = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
    const series = order
      .filter((m) => m in prog)
      .map((m) => ({ label: m, value: Number(prog[m]) || 0 }));
    $("#intel-progress").innerHTML = areaLineChart(series, {
      title: "Progress Over Time",
      value: "",
      variant: "growth-chart--violet",
      max: 100,
    });

    // ---- top skills chips with proficiency bars ----
    const ts = $("#intel-topskills");
    clear(ts);
    Object.entries(a.skills)
      .sort((x, y) => y[1] - x[1])
      .forEach(([k, v], i) => {
        const c = el("div", "intel-chip stagger-item");
        c.style.setProperty("--i", i);
        c.innerHTML = `
          <span class="intel-chip__name">${esc(k)}</span>
          <span class="intel-chip__bar" style="--w:${Math.max(0, Math.min(100, v))}%"><i></i></span>
          <span class="intel-chip__score">${v}%</span>`;
        ts.appendChild(c);
      });

    // ---- missing keywords + suggestions ----
    const fill = (sel, items, cls) => {
      const ul = $(sel);
      clear(ul);
      (items || []).forEach((t, i) => {
        const li = el("li", cls ? cls + " stagger-item" : "stagger-item", esc(t));
        li.style.setProperty("--i", i);
        ul.appendChild(li);
      });
    };
    fill("#intel-missing", a.missing_keywords);
    fill("#intel-suggest", a.suggested_improvements);

    show(sec);
  }

  function renderProjects(p) {
    const sec = $("#projects");
    const projects = p.projects || [];
    if (!projects.length) return hide(sec);
    const grid = $("#projects-grid");
    clear(grid);
    projects.forEach((pr, i) => {
      const card = el("div", "edu-card project-card stagger-item");
      card.style.setProperty("--i", i);
      const title = pr.url
        ? `<a class="project-card__name" href="${esc(pr.url)}" target="_blank" rel="noopener">${esc(pr.name)}</a>`
        : `<div class="project-card__name">${esc(pr.name)}</div>`;
      card.innerHTML = `${title}${
        pr.description ? `<p class="project-card__desc">${esc(pr.description)}</p>` : ""
      }`;
      grid.appendChild(card);
    });
    show(sec);
  }

  // GitHub-style contribution heatmap from recent public activity (~90 days).
  function renderActivity(gh, container) {
    clear(container);
    if (!gh.activity || !gh.activity.counts) return;
    const counts = gh.activity.counts;
    const WEEKS = 13;
    const today = new Date();
    // align end to the upcoming Saturday so columns are whole weeks
    const end = new Date(today);
    end.setDate(end.getDate() + (6 - end.getDay()));
    const start = new Date(end);
    start.setDate(start.getDate() - (WEEKS * 7 - 1));

    let max = 1;
    Object.values(counts).forEach((c) => (max = Math.max(max, c)));
    const level = (c) => {
      if (!c) return 0;
      const r = c / max;
      return r > 0.66 ? 4 : r > 0.33 ? 3 : r > 0.1 ? 2 : 1;
    };
    const iso = (d) => d.toISOString().slice(0, 10);

    const grid = el("div", "heatmap");
    for (let w = 0; w < WEEKS; w++) {
      const col = el("div", "heatmap__col");
      for (let d = 0; d < 7; d++) {
        const day = new Date(start);
        day.setDate(start.getDate() + w * 7 + d);
        const cell = el("span", "heatmap__cell");
        if (day <= today) {
          const c = counts[iso(day)] || 0;
          cell.dataset.lvl = level(c);
          cell.title = `${c} contribution${c === 1 ? "" : "s"} · ${iso(day)}`;
        } else {
          cell.dataset.lvl = "empty";
        }
        col.appendChild(cell);
      }
      grid.appendChild(col);
    }

    const head = el("div", "heatmap__head");
    head.innerHTML = `<span class="heatmap__title">Recent activity</span>
      <span class="heatmap__sub">${gh.activity.total} contributions · last 90 days</span>`;
    const legend = el("div", "heatmap__legend");
    legend.innerHTML =
      "Less " +
      [0, 1, 2, 3, 4].map((l) => `<span class="heatmap__cell" data-lvl="${l}"></span>`).join("") +
      " More";

    container.appendChild(head);
    container.appendChild(grid);
    container.appendChild(legend);
  }

  function renderEducation(p) {
    const sec = $("#education");
    const edu = p.education || [];
    if (!edu.length) return hide(sec);
    const grid = $("#education-grid");
    clear(grid);
    edu.forEach((e, i) => {
      const card = el("div", "edu-card stagger-item");
      card.style.setProperty("--i", i);
      card.innerHTML = `
        <div class="edu-card__school">${esc(e.school || "Institution")}</div>
        ${e.degree ? `<div class="edu-card__degree">${esc(e.degree)}</div>` : ""}
        ${e.dates ? `<div class="edu-card__dates">${esc(e.dates)}</div>` : ""}`;
      grid.appendChild(card);
    });
    show(sec);
  }

  function renderCerts(p) {
    const sec = $("#certs");
    const certs = p.certifications || [];
    if (!certs.length) return hide(sec);
    const grid = $("#certs-grid");
    clear(grid);
    certs.forEach((c, i) => {
      const badge = el("div", "cert-badge stagger-item");
      badge.style.setProperty("--i", i);
      badge.innerHTML = `
        <span class="cert-badge__icon">${ICON.cert}</span>
        <span class="cert-badge__text">${esc(c)}</span>`;
      grid.appendChild(badge);
    });
    show(sec);
  }

  /* ----------------------------- public render ----------------------------- */
  function render(profile) {
    const p = profile || {};
    renderHero(p);
    renderAbout(p);
    renderSkills(p);
    renderExperience(p);
    renderGrowth(p);
    renderSkillIntel(p);
    renderProjects(p);
    renderGithub(p);
    renderEducation(p);
    renderCerts(p);

    // Reveal nav once we have a profile.
    const nav = $("#site-nav");
    if (nav) nav.hidden = false;
  }

  window.Renderer = { render };
})();
