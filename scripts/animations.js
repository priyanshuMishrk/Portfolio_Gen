/* =====================================================================
   animations.js
   The reveal engine: Intersection Observer scroll reveals, count-up
   numbers, animated language bars, the hero typewriter, a Canvas
   particle field, 3D card tilt, and scroll-spy nav highlighting.

   Exposes: window.Animations.{ observe, typewriter, countUp,
                                initParticles, initTilt, initNav, revealAll }
   ===================================================================== */
(function () {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  /* ----------------------------- count-up numbers ----------------------------- */
  function countUp(node, target, opts) {
    opts = opts || {};
    target = Number(target) || 0;
    const fmt = (n) => format(n, opts);
    if (reduceMotion) {
      node.textContent = fmt(target);
      return;
    }
    const duration = opts.duration || 1400;
    const start = performance.now();
    function tick(now) {
      const t = Math.min((now - start) / duration, 1);
      const raw = target * easeOutCubic(t);
      node.textContent = fmt(opts.decimal ? Math.round(raw * 10) / 10 : Math.round(raw));
      if (t < 1) requestAnimationFrame(tick);
      else node.textContent = fmt(target);
    }
    requestAnimationFrame(tick);
  }
  function format(n, opts) {
    opts = opts || {};
    let s;
    if (opts.decimal) s = (Math.round(n * 10) / 10).toFixed(1);
    else if (n >= 1000) s = (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "") + "k";
    else s = String(Math.round(n));
    return (opts.prefix || "") + s + (opts.suffix || "");
  }

  /* ----------------------------- typewriter ----------------------------- */
  function typewriter(node, text) {
    text = String(text || "");
    if (reduceMotion) {
      node.textContent = text;
      return;
    }
    node.textContent = "";
    let i = 0;
    const speed = Math.max(18, Math.min(45, 1100 / Math.max(text.length, 1)));
    function step() {
      if (i <= text.length) {
        node.textContent = text.slice(0, i);
        i++;
        setTimeout(step, speed);
      }
    }
    setTimeout(step, 350);
  }

  /* ----------------------------- when a section reveals ----------------------------- */
  function activate(section) {
    // animate any count-up numbers
    section.querySelectorAll("[data-count]").forEach((n) => {
      countUp(n, n.dataset.count, {
        suffix: n.dataset.suffix || "",
        prefix: n.dataset.prefix || "",
        decimal: n.dataset.decimal === "1",
      });
    });
    // animate language bar widths
    section.querySelectorAll(".lang-bar__fill[data-w]").forEach((f) => {
      requestAnimationFrame(() => {
        f.style.width = f.dataset.w + "%";
      });
    });
  }

  /* ----------------------------- Intersection Observer ----------------------------- */
  let observer = null;
  function observe() {
    const targets = Array.from(document.querySelectorAll("[data-reveal]")).filter(
      (s) => !s.hasAttribute("hidden")
    );
    if (reduceMotion) {
      targets.forEach((s) => {
        s.classList.add("is-visible");
        activate(s);
      });
      return;
    }
    if (observer) observer.disconnect();
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            activate(entry.target);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.2, rootMargin: "0px 0px -8% 0px" }
    );
    targets.forEach((t) => observer.observe(t));
  }

  function revealAll() {
    document.querySelectorAll("[data-reveal]").forEach((s) => {
      s.classList.add("is-visible");
      activate(s);
    });
  }

  /* ----------------------------- 3D tilt on hover ----------------------------- */
  function initTilt() {
    if (reduceMotion || window.matchMedia("(hover: none)").matches) return;
    document.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseout", onOut, { passive: true });
  }
  function tiltTarget(e) {
    const card = e.target.closest(".repo-card, .glass-card, .cert-badge, .edu-card");
    return card;
  }
  let activeCard = null;
  function onMove(e) {
    const card = tiltTarget(e);
    if (activeCard && activeCard !== card) resetCard(activeCard);
    if (!card) return;
    activeCard = card;
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    card.style.transform = `perspective(800px) rotateX(${(-py * 6).toFixed(2)}deg) rotateY(${(px * 6).toFixed(2)}deg) translateY(-4px)`;
  }
  function onOut(e) {
    if (!e.relatedTarget && activeCard) {
      resetCard(activeCard);
      activeCard = null;
    }
  }
  function resetCard(card) {
    card.style.transform = "";
  }

  /* ----------------------------- scroll-spy nav ----------------------------- */
  function initNav() {
    const links = Array.from(document.querySelectorAll("[data-nav]"));
    if (!links.length) return;
    const map = new Map();
    links.forEach((a) => {
      const id = a.getAttribute("href").slice(1);
      const sec = document.getElementById(id);
      if (sec) map.set(sec, a);
    });
    const spy = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            links.forEach((l) => l.classList.remove("is-active"));
            const link = map.get(entry.target);
            if (link) link.classList.add("is-active");
          }
        });
      },
      { threshold: 0.5 }
    );
    map.forEach((_, sec) => spy.observe(sec));
  }

  /* ----------------------------- particle field -----------------------------
     A sparse field of slow "flying dots" (kept faint so the background never
     feels busy) PLUS a small swarm of brighter dots that chase the cursor and
     orbit it — so moving the mouse feels alive without being distracting.
  --------------------------------------------------------------------------- */
  function initParticles() {
    const canvas = document.getElementById("bg-particles");
    if (!canvas || reduceMotion) return;
    const ctx = canvas.getContext("2d");
    let w, h, dpr, dots, swarm, raf;
    const mouse = { x: null, y: null, sx: 0, sy: 0, active: false };

    const rand = (a, b) => a + Math.random() * (b - a);
    const drift = () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: rand(-0.13, 0.13) * dpr,
      vy: rand(-0.13, 0.13) * dpr,
      r: rand(0.4, 1.5) * dpr,
      cyan: Math.random() > 0.5,
    });

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.width = window.innerWidth * dpr;
      h = canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
      // sparse: fewer dots than before, so it reads as ambient, not crowded
      const count = Math.min(54, Math.floor(window.innerWidth / 28));
      dots = Array.from({ length: count }, drift);
      // cursor-following swarm
      const sn = Math.min(9, Math.max(5, Math.floor(window.innerWidth / 220)));
      swarm = Array.from({ length: sn }, () => ({
        ...drift(),
        ease: rand(0.018, 0.06),
        ang: Math.random() * Math.PI * 2,
        spin: rand(0.012, 0.03),
        orbit: rand(18, 70) * dpr,
        r: rand(1.1, 2.4) * dpr,
      }));
      mouse.sx = w / 2;
      mouse.sy = h / 2;
    }

    function bounce(p) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
    }
    function fill(p, a) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.cyan ? `rgba(0,245,255,${a})` : `rgba(168,85,247,${a - 0.05})`;
      ctx.fill();
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      if (mouse.x != null) {
        mouse.sx += (mouse.x - mouse.sx) * 0.12;
        mouse.sy += (mouse.y - mouse.sy) * 0.12;
      }
      const linkDist = 92 * dpr;
      const pullDist = 150 * dpr;

      // ambient flying dots (faint)
      for (let i = 0; i < dots.length; i++) {
        const p = dots[i];
        bounce(p);
        // a gentle nudge toward the cursor when it's nearby
        if (mouse.active) {
          const dx = mouse.sx - p.x;
          const dy = mouse.sy - p.y;
          const d = Math.hypot(dx, dy) || 1;
          if (d < pullDist) {
            const f = (1 - d / pullDist) * 0.05 * dpr;
            p.vx += (dx / d) * f;
            p.vy += (dy / d) * f;
          }
        }
        p.vx *= 0.99;
        p.vy *= 0.99;
        fill(p, 0.42);

        // very faint links between close neighbours
        for (let j = i + 1; j < dots.length; j++) {
          const q = dots[j];
          const dx = p.x - q.x;
          const dy = p.y - q.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < linkDist * linkDist) {
            const dd = Math.sqrt(d2);
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.strokeStyle = `rgba(0,245,255,${(0.05 * (1 - dd / linkDist)).toFixed(3)})`;
            ctx.lineWidth = 0.5 * dpr;
            ctx.stroke();
          }
        }
      }

      // cursor-following swarm (brighter, glows, trailing lines to cursor)
      swarm.forEach((s) => {
        if (mouse.active) {
          s.ang += s.spin;
          const tx = mouse.sx + Math.cos(s.ang) * s.orbit;
          const ty = mouse.sy + Math.sin(s.ang) * s.orbit;
          s.x += (tx - s.x) * s.ease;
          s.y += (ty - s.y) * s.ease;
        } else {
          bounce(s); // idle: drift like the rest
        }
        ctx.save();
        ctx.shadowColor = s.cyan ? "rgba(0,245,255,0.9)" : "rgba(168,85,247,0.8)";
        ctx.shadowBlur = 8 * dpr;
        fill(s, s.cyan ? 0.85 : 0.78);
        ctx.restore();
        if (mouse.active) {
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(mouse.sx, mouse.sy);
          ctx.strokeStyle = "rgba(0,245,255,0.12)";
          ctx.lineWidth = 0.6 * dpr;
          ctx.stroke();
        }
      });

      raf = requestAnimationFrame(draw);
    }

    resize();
    draw();

    window.addEventListener(
      "pointermove",
      (e) => {
        mouse.x = e.clientX * dpr;
        mouse.y = e.clientY * dpr;
        mouse.active = true;
      },
      { passive: true }
    );
    window.addEventListener("pointerleave", () => (mouse.active = false), { passive: true });
    window.addEventListener("blur", () => (mouse.active = false));
    let to;
    window.addEventListener("resize", () => {
      clearTimeout(to);
      to = setTimeout(resize, 200);
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else raf = requestAnimationFrame(draw);
    });
  }

  window.Animations = {
    observe,
    typewriter,
    countUp,
    initParticles,
    initTilt,
    initNav,
    revealAll,
  };
})();
