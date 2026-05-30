/* =====================================================================
   analytics.js
   Derives "career growth" time-series from the merged profile (CV +
   LinkedIn), so the portfolio can show how experience and skills grew
   over time — the stuff that makes a recruiter believe real work happened.

   Exposes: window.CareerAnalytics.analyze(profile) -> {
     ok, totalYears, companies, skillsCount, currentRole, span:{from,to},
     experienceSeries:[{label, value}],   // cumulative years over time
     skillsSeries:[{label, value}],       // cumulative distinct skills
     topSkills:[{name, years}]            // estimated yrs per skill
   } | null
   ===================================================================== */
(function () {
  "use strict";

  const MONTHS = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };

  function nowDecimal() {
    const d = new Date();
    return d.getFullYear() + d.getMonth() / 12;
  }

  // "Jan 2021" | "2021" | "03/2018" | "Present" -> decimal year, or null.
  function parseToken(tok) {
    if (!tok) return null;
    const t = tok.trim();
    if (/present|current|now|ongoing|date/i.test(t)) return nowDecimal();
    let m = t.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*'?(\d{2,4})/i);
    if (m) {
      const yr = +(m[2].length === 2 ? "20" + m[2] : m[2]);
      return yr + (MONTHS[m[1].slice(0, 3).toLowerCase()] || 0) / 12;
    }
    m = t.match(/(\d{1,2})\/(\d{4})/); // MM/YYYY
    if (m) return +m[2] + (Math.min(12, Math.max(1, +m[1])) - 1) / 12;
    m = t.match(/\b(19|20)\d{2}\b/); // bare year
    if (m) return +m[0];
    return null;
  }

  function parseRange(str) {
    if (!str) return null;
    const parts = String(str).split(/\s*(?:-|–|—|to|until)\s*/i).filter(Boolean);
    if (!parts.length) return null;
    let start = parseToken(parts[0]);
    let end = parts.length > 1 ? parseToken(parts[parts.length - 1]) : null;
    if (start == null && end == null) return null;
    if (start == null) start = end;
    if (end == null) end = /present|current|now/i.test(str) ? nowDecimal() : start;
    if (end < start) {
      const tmp = start;
      start = end;
      end = tmp;
    }
    // cap "present" at now
    end = Math.min(end, nowDecimal());
    return { start, end };
  }

  // Merge overlapping intervals, then measure total covered length up to `cut`.
  function coveredUpTo(intervals, cut) {
    let total = 0;
    intervals.forEach(([s, e]) => {
      const a = s;
      const b = Math.min(e, cut);
      if (b > a) total += b - a;
    });
    return total;
  }
  function mergeIntervals(list) {
    const sorted = list.slice().sort((a, b) => a[0] - b[0]);
    const out = [];
    sorted.forEach(([s, e]) => {
      const last = out[out.length - 1];
      if (last && s <= last[1]) last[1] = Math.max(last[1], e);
      else out.push([s, e]);
    });
    return out;
  }

  const esc = (s) => String(s == null ? "" : s);

  function skillRegex(skill) {
    const e = esc(skill).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!e) return null;
    return new RegExp("(^|[^A-Za-z0-9+#.])" + e + "($|[^A-Za-z0-9+#.])", "i");
  }

  function analyze(profile) {
    const p = profile || {};
    const exp = (p.experience || [])
      .map((j) => ({ ...j, range: parseRange(j.dates) }))
      .filter((j) => j.range);

    // Need a couple of dated roles to draw a meaningful trajectory.
    if (exp.length < 1) return null;

    const intervalsRaw = exp.map((j) => [j.range.start, j.range.end]);
    const merged = mergeIntervals(intervalsRaw);
    const careerStart = Math.min(...intervalsRaw.map((i) => i[0]));
    const now = nowDecimal();
    // Last *actual* job end (already capped at now). Don't count idle time after.
    const careerEnd = Math.min(now, Math.max(...intervalsRaw.map((i) => i[1])));
    const ongoing = careerEnd >= now - 0.12;
    const totalYears = coveredUpTo(merged, careerEnd);
    if (totalYears < 0.5 || careerEnd - careerStart < 1) return null;

    const startYear = Math.floor(careerStart);
    // For ongoing roles end at the current year; otherwise at the last job's end.
    const endYear = Math.max(startYear + 1, ongoing ? Math.floor(now) : Math.ceil(careerEnd));

    // ---- experience series (cumulative years over time) ----
    const experienceSeries = [];
    for (let y = startYear; y <= endYear; y++) {
      const cut = y >= endYear ? careerEnd : y;
      experienceSeries.push({ label: String(y), value: round1(coveredUpTo(merged, cut)) });
    }

    // ---- skill acquisition: earliest dated role that mentions each skill ----
    const skills = (p.skills || []).filter((s) => typeof s === "string").map((s) => s.trim()).filter(Boolean);
    const uniqueSkills = [...new Set(skills.map((s) => s))];
    const sortedExp = exp.slice().sort((a, b) => a.range.start - b.range.start);

    const skillYear = {}; // skill -> decimal year acquired
    uniqueSkills.forEach((skill) => {
      const re = skillRegex(skill);
      let acquired = careerStart; // foundational skills count from the start
      if (re) {
        for (const j of sortedExp) {
          const hay = `${j.role || ""} ${j.company || ""} ${j.description || ""}`;
          if (re.test(hay)) {
            acquired = j.range.start;
            break;
          }
        }
      }
      skillYear[skill] = acquired;
    });

    const skillsSeries = [];
    for (let y = startYear; y <= endYear; y++) {
      const cut = y >= endYear ? careerEnd + 0.001 : y + 1; // count a skill once its year has begun
      const count = uniqueSkills.filter((s) => skillYear[s] < cut).length;
      skillsSeries.push({ label: String(y), value: count });
    }

    const topSkills = uniqueSkills
      .map((s) => ({ name: s, years: round1(Math.max(0.1, now - skillYear[s])) }))
      .sort((a, b) => b.years - a.years)
      .slice(0, 8);

    // current role = the one whose interval reaches closest to now
    const current = exp.slice().sort((a, b) => b.range.end - a.range.end)[0];

    return {
      ok: true,
      totalYears: round1(totalYears),
      companies: new Set(exp.map((j) => (j.company || j.role || "").toLowerCase())).size,
      skillsCount: uniqueSkills.length,
      currentRole: current ? current.role || current.company : "",
      span: { from: startYear, to: endYear },
      experienceSeries,
      skillsSeries,
      topSkills,
    };
  }

  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  window.CareerAnalytics = { analyze, parseRange };
})();
