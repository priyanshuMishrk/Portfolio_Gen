/* =====================================================================
   parser-linkedin.js
   LinkedIn blocks direct scraping (CORS + ToS), so we accept either:
     - a pasted block of "About / Experience" text, and/or
     - a profile URL (used only as a contact link).
   If neither yields usable data, the caller renders a private/locked card.

   Experience parsing is format-agnostic. LinkedIn paste comes in many
   shapes (one field per line, every line duplicated, several roles on one
   line, or a single paragraph), so we anchor on DATE RANGES — every job
   has exactly one — and guarantee one entry per date range via a
   position-based fallback when the line-based pass under-counts.

   Exposes: window.LinkedInParser.parse({ url, text }) -> linkedin
   Shape: { available, private, url, headline, about, experience:[], skills:[] }
   ===================================================================== */
(function () {
  "use strict";

  // Single date range, e.g. "Jan 2021 - Present", "2019 – 2021", "2015 to 2017".
  const DATE_SRC =
    "((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?\\s*\\d{4}|\\b(?:19|20)\\d{2})\\s*(?:-|–|—|to)\\s*((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?\\s*\\d{4}|\\b(?:19|20)\\d{2}|present|current|now)";
  const DATE_RANGE = new RegExp(DATE_SRC, "i");
  const DATE_GLOBAL = new RegExp(DATE_SRC, "gi");

  const isBullet = (l) => /^\s*[•·▪‣◦\-–*]\s+/.test(l);
  const stripBullet = (l) => l.replace(/^\s*[•·▪‣◦\-–*]\s+/, "").trim();

  function cleanUrl(url) {
    if (!url) return "";
    let u = url.trim();
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    return /linkedin\.com/i.test(u) ? u : "";
  }

  /* ----------------------------- header/meta helpers ----------------------------- */

  // Strip trailing LinkedIn metadata: "· Full-time", "· 3 yrs 2 mos", etc.
  // (kept narrow so a real "Role · Company" separator survives).
  function stripMeta(s) {
    return String(s || "")
      .replace(
        /\s·\s*(full[\s-]?time|part[\s-]?time|contract|internship|freelance|self[\s-]?employed|permanent|temporary|seasonal|apprenticeship)\b.*$/i,
        ""
      )
      .replace(/\s·\s*\d+\s*(yr|yrs|year|years|mo|mos|month|months)\b.*$/i, "")
      .trim();
  }

  // A line that is ONLY metadata (employment type / duration) — never a header.
  function isMetaLine(s) {
    const t = String(s || "").replace(/^·\s*/, "").trim();
    return (
      /^(full[\s-]?time|part[\s-]?time|contract|internship|freelance|self[\s-]?employed|permanent|temporary|seasonal|apprenticeship)\b/i.test(
        t
      ) ||
      /^\d+\s*(yr|yrs|year|years|mo|mos|month|months)\b/i.test(t) ||
      /^·/.test(s)
    );
  }

  // A "City, Region, Country" style location line (so it doesn't leak into desc).
  const LOCATION = /^[A-Z][\w.'-]+(?:\s[A-Z][\w.'-]+)*(?:,\s*[A-Z][\w.'-]+){1,3}$/;

  function deriveRoleCompany(headerLines) {
    const clean = headerLines
      .map((s) => stripBullet(s))
      .map(stripMeta)
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => !isMetaLine(s));
    let role = clean[0] || "";
    let company = clean[1] || "";
    if (!company && role) {
      // "Role at Company" / "Role | Company" / "Role · Company" / "Role — Company"
      let m = role.split(/\s+(?:@|\||·|—|–|\bat\b)\s+/i);
      // last resort (paragraph blobs): "Role, Company"
      if (m.length < 2) m = role.split(/\s*,\s*/);
      if (m.length >= 2) {
        role = m[0].trim();
        company = m.slice(1).join(", ").trim();
      }
    }
    const tidy = (s) => stripMeta(s).replace(/^[\s,;|.]+|[\s,;|.]+$/g, "").trim();
    return { role: tidy(role) || "Role", company: tidy(company) };
  }

  /* ----------------------------- line-based pass ----------------------------- */
  function parseLines(lines) {
    const dateIdx = [];
    lines.forEach((l, i) => {
      if (DATE_RANGE.test(l)) dateIdx.push(i);
    });
    if (!dateIdx.length) return [];

    // Walk back from a date line to find where this entry's header begins.
    const headerStart = (di, lowerBound) => {
      let s = di;
      let n = 0;
      while (s - 1 > lowerBound && n < 2) {
        const p = lines[s - 1];
        if (!p.trim() || isBullet(p) || isMetaLine(p) || LOCATION.test(p.trim()) || DATE_RANGE.test(p))
          break;
        s--;
        n++;
      }
      return s;
    };

    const out = [];
    dateIdx.forEach((di, k) => {
      const prevDi = k > 0 ? dateIdx[k - 1] : -1;
      const line = lines[di];
      const dm = line.match(DATE_RANGE);
      const dates = dm ? dm[0].replace(/\s+/g, " ").trim() : "";
      const dPos = dm ? line.indexOf(dm[0]) : -1;

      // role/company may sit on the date line itself, before the date.
      const inlineBefore =
        dPos > 0 ? line.slice(0, dPos).replace(/[\s,|·•\-–—]+$/, "").trim() : "";
      // …or a description fragment may follow the date on the same line.
      let inlineAfter = dPos >= 0 ? line.slice(dPos + dm[0].length) : "";
      inlineAfter = inlineAfter
        .replace(/^\s*·\s*\d+\s*(yr|yrs|year|years|mo|mos|month|months)\b[^A-Za-z]*/i, "")
        .replace(/^[\s·,|]+/, "")
        .trim();

      const hStart = headerStart(di, prevDi);
      let headerLines = lines.slice(hStart, di).map((s) => s.trim()).filter(Boolean);
      if (inlineBefore) headerLines = headerLines.concat(inlineBefore);
      const { role, company } = deriveRoleCompany(headerLines);

      const descEnd = k + 1 < dateIdx.length ? headerStart(dateIdx[k + 1], di) : lines.length;
      const descParts = [];
      if (inlineAfter && inlineAfter.length > 40 && !LOCATION.test(inlineAfter))
        descParts.push(inlineAfter);
      lines.slice(di + 1, descEnd).forEach((l) => {
        const t = l.trim();
        if (!t || isMetaLine(t) || LOCATION.test(t)) return;
        if (isBullet(l) || t.length > 40) descParts.push(stripBullet(l));
      });
      const description = descParts.join(" ").replace(/\s+/g, " ").trim();

      out.push({ role, company, dates, description });
    });
    return out;
  }

  /* ----------------------------- position-based fallback ----------------------------- */
  // Guarantees one entry per date range regardless of line structure (handles
  // several dates on one line, or a single paragraph blob).
  function parseByDates(text) {
    const norm = text.replace(/\u00a0/g, " ");
    const ms = [...norm.matchAll(DATE_GLOBAL)];
    if (!ms.length) return [];

    const out = [];
    ms.forEach((m, k) => {
      const dates = m[0].replace(/\s+/g, " ").trim();
      const prevEnd = k > 0 ? ms[k - 1].index + ms[k - 1][0].length : 0;
      const before = norm.slice(prevEnd, m.index);
      const nextStart = k + 1 < ms.length ? ms[k + 1].index : norm.length;
      const after = norm.slice(m.index + m[0].length, nextStart);

      // header = trailing segment(s) of `before`
      const bSegs = before.split(/\n/).map((s) => s.trim()).filter(Boolean);
      let headerLines;
      if (bSegs.length > 1) {
        headerLines = bSegs.slice(-2).filter((s) => !isMetaLine(s) && !LOCATION.test(s));
        if (!headerLines.length) headerLines = bSegs.slice(-2);
      } else {
        // paragraph: take the last clause before the date, capped to a few words
        const tail = (before.split(/(?<=[.!?])\s+/).pop() || before).trim();
        headerLines = [tail.split(/\s+/).slice(-9).join(" ")];
      }
      const { role, company } = deriveRoleCompany(headerLines);

      // description = `after`, with the next entry's trailing header removed
      let aSegs = after.split(/\n/).map((s) => s.trim()).filter(Boolean);
      if (k + 1 < ms.length) {
        let removed = 0;
        while (
          aSegs.length &&
          removed < 2 &&
          aSegs[aSegs.length - 1].length < 60 &&
          !isBullet(aSegs[aSegs.length - 1])
        ) {
          aSegs.pop();
          removed++;
        }
      }
      const description = aSegs
        .filter((s) => !isMetaLine(s) && !LOCATION.test(s))
        .map(stripBullet)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      out.push({ role, company, dates, description });
    });
    return out;
  }

  function parseExperience(lines) {
    const fullText = lines.join("\n");
    const matchCount = (fullText.match(DATE_GLOBAL) || []).length;
    if (!matchCount) return [];

    let result = parseLines(lines);
    // If the line-based pass missed entries (e.g. several dates share a line,
    // or it's one big paragraph), fall back to the date-position splitter.
    if (matchCount > result.length) {
      const fb = parseByDates(fullText);
      if (fb.length > result.length) result = fb;
    }
    return result.slice(0, 12);
  }

  /* ----------------------------- parse ----------------------------- */
  function parse(input) {
    const url = cleanUrl(input && input.url);
    const text = ((input && input.text) || "").trim();

    if (!text) {
      if (url) return { available: true, private: true, url };
      return null;
    }

    const rawLines = text
      .replace(/\r/g, "")
      .replace(/\u00a0/g, " ")
      .split("\n")
      .map((l) => l.replace(/[ \t]+/g, " ").trimEnd());

    // LinkedIn's "copy" duplicates almost every line (an accessibility quirk):
    //   Senior Engineer / Senior Engineer / Acme · Full-time / Acme · Full-time …
    // Collapse consecutive identical lines so the parser sees clean structure.
    const lines = rawLines.filter((l, i) => {
      const t = l.trim();
      if (!t) return true; // keep blank lines as separators
      return t !== (rawLines[i - 1] || "").trim();
    });

    const nonEmpty = lines.filter((l) => l.trim());

    // Section markers (optional).
    const aboutIdx = lines.findIndex((l) => /^\s*about\s*$/i.test(l));
    const expIdx = lines.findIndex((l) => /^\s*experience\s*$/i.test(l));

    // Headline: first non-empty, non-marker line.
    let headline = "";
    for (const l of nonEmpty) {
      if (/^(about|experience)$/i.test(l.trim())) continue;
      if (l.length < 140) headline = l.trim();
      break;
    }

    // About: text under an "About" marker, else the first paragraph if there's
    // no date region competing for it.
    let about = "";
    if (aboutIdx !== -1) {
      const end = expIdx > aboutIdx ? expIdx : lines.length;
      about = lines
        .slice(aboutIdx + 1, end)
        .filter((l) => !DATE_RANGE.test(l))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    } else if (!DATE_RANGE.test(text)) {
      about = nonEmpty.slice(headline ? 1 : 0).join(" ").replace(/\s+/g, " ").trim();
    }

    // Experience: lines after the marker, else everything after the About block,
    // else all lines.
    let expLines;
    if (expIdx !== -1) expLines = lines.slice(expIdx + 1);
    else if (aboutIdx !== -1) expLines = lines.slice(aboutIdx + 1);
    else expLines = lines;
    const experience = parseExperience(expLines);

    const hasData = about || experience.length || headline;
    return {
      available: true,
      private: !hasData,
      url,
      headline: headline || "",
      about: about || "",
      experience,
      skills: [],
    };
  }

  window.LinkedInParser = { parse };
})();
