/* =====================================================================
   parser-resume.js
   Client-side resume parsing. Extracts raw text from PDF (pdf.js) or
   DOCX (mammoth.js), then runs heuristics to pull out name, title,
   summary, skills, experience, education, certifications and contacts.

   Exposes: window.ResumeParser.parse(file) -> Promise<partialProfile>
   Everything is best-effort and never throws; missing fields are simply
   omitted so the renderer can skip them.
   ===================================================================== */
(function () {
  "use strict";

  // Configure pdf.js worker (matches the CDN version loaded in index.html).
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  /* ----------------------------- Text extraction ----------------------------- */

  async function extractPdf(file) {
    const buf = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    let out = "";
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      // Reconstruct lines from item y-positions, and insert spaces based on the
      // horizontal GAP between runs — not blindly after every run. Blindly adding
      // a space turns "ACCENTURE" (split into runs "A" + "CCENTURE") into
      // "A CCENTURE" and "2024" into "2 024". Gap-based spacing avoids that.
      const lines = [];
      let line = "";
      let lastY = null;
      let lastXEnd = null;
      let lastH = 10;
      const flush = () => {
        if (line.trim()) lines.push(line.replace(/[ \t]+/g, " ").trim());
        line = "";
        lastXEnd = null;
      };
      content.items.forEach((it) => {
        if (!it.str) {
          if (it.hasEOL) flush();
          return;
        }
        const x = it.transform[4];
        const y = it.transform[5];
        const h = it.height || Math.abs(it.transform[3]) || 10;
        const w = it.width || 0;

        if (lastY !== null && Math.abs(y - lastY) > Math.max(2, lastH * 0.5)) flush();

        if (line !== "" && lastXEnd != null) {
          const gap = x - lastXEnd;
          const wantSpace = gap > Math.max(1, lastH * 0.28);
          if (wantSpace && !/\s$/.test(line) && !/^\s/.test(it.str)) line += " ";
        }
        line += it.str;
        lastY = y;
        lastXEnd = x + w;
        lastH = h;
        if (it.hasEOL) flush();
      });
      flush();
      out += lines.join("\n") + "\n";
    }
    return out;
  }

  async function extractDocx(file) {
    const buf = await file.arrayBuffer();
    const result = await window.mammoth.extractRawText({ arrayBuffer: buf });
    return result.value || "";
  }

  /* ----------------------------- Heuristic helpers ----------------------------- */

  const RE = {
    email: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i,
    phone: /(\+?\(?\d[\d\s().-]{7,}\d)/,
    linkedin: /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/(?:in|pub)\/[^\s)]+/i,
    github: /(?:https?:\/\/)?github\.com\/([a-z0-9-]+)/i,
    website: /https?:\/\/[^\s)]+/i,
    // date range: "Jan 2020 - Present", "2019 – 2021", "03/2018 - 06/2020"
    dateRange:
      /((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*'?\d{2,4}|\d{1,2}\/\d{2,4}|\b(?:19|20)\d{2})\s*(?:-|–|—|to)\s*((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*'?\d{2,4}|\d{1,2}\/\d{2,4}|\b(?:19|20)\d{2}|present|current|now)/i,
  };

  const SECTION_KEYS = {
    summary: ["summary", "about", "profile", "objective", "professional summary"],
    experience: [
      "experience",
      "work experience",
      "employment",
      "work history",
      "professional experience",
    ],
    education: ["education", "academic", "academics"],
    skills: ["skills", "technical skills", "technologies", "core competencies", "expertise"],
    certifications: [
      "certifications",
      "certificates",
      "licenses",
      "awards",
      "honors",
      "achievements",
    ],
    projects: ["projects", "selected projects"],
  };

  const isBullet = (l) => /^[\s]*[•·▪‣◦\-–*]\s+/.test(l);
  const stripBullet = (l) => l.replace(/^[\s]*[•·▪‣◦\-–*]\s+/, "").trim();

  function matchSection(line) {
    const clean = line.trim().toLowerCase().replace(/[:|_]+$/g, "").trim();
    if (clean.length > 38) return null; // headers are short
    for (const key in SECTION_KEYS) {
      if (SECTION_KEYS[key].some((k) => clean === k || clean === k + "s")) return key;
    }
    // also accept "EXPERIENCE" style where the keyword is the whole short line
    for (const key in SECTION_KEYS) {
      if (SECTION_KEYS[key].some((k) => clean.startsWith(k) && clean.length <= k.length + 14))
        return key;
    }
    return null;
  }

  function looksLikeName(line) {
    const t = line.trim();
    if (!t || t.length > 40) return false;
    if (RE.email.test(t) || RE.website.test(t) || /\d/.test(t)) return false;
    const words = t.split(/\s+/);
    if (words.length < 2 || words.length > 4) return false;
    // mostly alphabetic, title-ish
    return words.every((w) => /^[A-Za-z][A-Za-z.'-]*$/.test(w));
  }

  function initialsFrom(name) {
    if (!name) return "::";
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] || "") + (parts[parts.length - 1]?.[0] || "")).toUpperCase() || "::";
  }

  /* ----------------------------- Section partitioning ----------------------------- */

  function partition(rawLines) {
    // Returns { header: [...lines before first section], sections: {key: [lines]} }
    const sections = {};
    let current = "header";
    sections.header = [];
    rawLines.forEach((line) => {
      const sec = matchSection(line);
      if (sec) {
        current = sec;
        if (!sections[current]) sections[current] = [];
      } else {
        if (!sections[current]) sections[current] = [];
        sections[current].push(line);
      }
    });
    return sections;
  }

  // Group lines into blocks separated by blank lines.
  function blocks(lines) {
    const out = [];
    let cur = [];
    lines.forEach((l) => {
      if (l.trim() === "") {
        if (cur.length) out.push(cur);
        cur = [];
      } else {
        cur.push(l);
      }
    });
    if (cur.length) out.push(cur);
    return out;
  }

  /* ----------------------------- Field extractors ----------------------------- */

  function extractContacts(text, headerLines) {
    const contacts = [];
    const seen = new Set();
    const add = (type, value, href, label) => {
      const k = type + value;
      if (seen.has(k)) return;
      seen.add(k);
      contacts.push({ type, value, href, label: label || value });
    };

    const email = text.match(RE.email);
    if (email) add("email", email[0], "mailto:" + email[0]);

    const li = text.match(RE.linkedin);
    if (li) {
      const url = li[0].startsWith("http") ? li[0] : "https://" + li[0];
      add("linkedin", "LinkedIn", url, "LinkedIn");
    }

    const gh = text.match(RE.github);
    if (gh) {
      const url = gh[0].startsWith("http") ? gh[0] : "https://" + gh[0];
      add("github", gh[1], url, gh[1]);
    }

    const phone = text.match(RE.phone);
    if (phone) add("phone", phone[1].trim(), "tel:" + phone[1].replace(/[^\d+]/g, ""));

    return contacts;
  }

  function extractLocation(headerLines) {
    // Look for a "City, ST" or "City, Country" style token in the header block.
    for (const l of headerLines) {
      const m = l.match(/([A-Z][a-zA-Z.]+(?:\s[A-Z][a-zA-Z.]+)*,\s*[A-Z][a-zA-Z.]+)/);
      if (m && !RE.email.test(l) && m[1].length < 40) return m[1];
    }
    return "";
  }

  function extractSkills(lines) {
    if (!lines || !lines.length) return [];
    const raw = lines
      .map((l) => stripBullet(l))
      .join(", ")
      .replace(/\b(?:proficient in|familiar with|including)\b/gi, ",");
    const items = raw
      .split(/[,;|•·\n]/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 2 && s.length <= 30 && !/^\d+$/.test(s));
    // de-dupe, cap
    const seen = new Set();
    const out = [];
    items.forEach((s) => {
      const k = s.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        out.push(s);
      }
    });
    return out.slice(0, 40);
  }

  // A line that is mostly UPPERCASE (a company name like "ACCENTURE").
  const isCapsName = (s) => {
    const L = s.replace(/[^A-Za-z]/g, "");
    return L.length >= 2 && L === L.toUpperCase();
  };
  // "Company | Role" / "Company – Role" / "Company · Role" separators.
  const HSEP = /\s[|•·–—]\s/;

  // Does this line START a new job? (a company name, optionally "Company | Role")
  function startsNewCompany(line) {
    const t = line.trim();
    if (!t || isBullet(t) || t.length > 90) return false;
    if (HSEP.test(t)) {
      const first = t.split(HSEP)[0].trim();
      return first.length <= 48 && /[A-Za-z]/.test(first) && /^[A-Z0-9]/.test(first);
    }
    return isCapsName(t) && t.length <= 55;
  }

  function fillHeader(cur, line) {
    let t = line.trim();
    const dm = t.match(RE.dateRange);
    if (dm && !cur.dates) cur.dates = dm[0].replace(/\s+/g, " ").trim();
    if (dm) t = t.replace(dm[0], "").trim();
    t = t.replace(/^[|•·–—\s,]+|[|•·–—\s,]+$/g, "").trim();
    if (!t) return;
    if (HSEP.test(t)) {
      const p = t.split(HSEP).map((s) => s.trim()).filter(Boolean);
      if (!cur.company) cur.company = p[0];
      if (!cur.role && p[1]) cur.role = p[1];
    } else if (isCapsName(t)) {
      if (!cur.company) cur.company = t;
      else if (!cur.role) cur.role = t;
    } else if (!cur.role) {
      cur.role = t;
    } else if (!cur.company) {
      cur.company = t;
    }
  }

  function buildDescription(descLines) {
    return descLines
      .map((l) => stripBullet(l))
      .join(" ")
      .replace(/\s+/g, " ")
      .replace(/\s+([.,])/g, "$1")
      .trim();
  }

  // A short, non-sentence line that belongs to the header block (role, dates,
  // location) rather than the description body.
  function isHeaderCont(line) {
    const t = line.trim();
    if (!t || isBullet(t)) return false;
    if (RE.dateRange.test(t) || HSEP.test(t) || isCapsName(t)) return true;
    const words = t.split(/\s+/).length;
    return t.length <= 55 && words <= 6 && !/[.;:]$/.test(t);
  }

  // Header-boundary parser with a header/body state machine. A new entry starts
  // at each company header; the lines between a company and its first
  // description sentence are treated as header (role / dates / location).
  function parseByHeaders(lines) {
    const entries = [];
    let cur = null;
    let state = "header";
    const push = () => {
      if (cur && (cur.company || cur.role || cur.descLines.length)) {
        entries.push({
          role: cur.role || "",
          company: cur.company || "",
          dates: cur.dates || "",
          description: buildDescription(cur.descLines),
        });
      }
    };
    lines.forEach((raw) => {
      const line = raw.trim();
      if (!line) return;
      const newCo = startsNewCompany(line);
      if (newCo && cur && (cur.company || cur.role || cur.descLines.length)) {
        push();
        cur = null;
      }
      if (!cur) {
        cur = { company: "", role: "", dates: "", descLines: [] };
        state = "header";
      }
      if (state === "header" && isHeaderCont(line)) {
        fillHeader(cur, line);
      } else {
        state = "body";
        cur.descLines.push(stripBullet(line));
      }
    });
    push();
    return entries.filter((e) => e.company || e.role);
  }

  // Date-anchored fallback: one entry per date range (for resumes without
  // ALL-CAPS / separator company headers).
  function parseByDates(lines) {
    const idx = [];
    lines.forEach((l, i) => {
      if (RE.dateRange.test(l)) idx.push(i);
    });
    if (!idx.length) return [];
    const out = [];
    idx.forEach((di, k) => {
      const prevDi = k > 0 ? idx[k - 1] : -1;
      const line = lines[di];
      const dm = line.match(RE.dateRange);
      const dates = dm ? dm[0].replace(/\s+/g, " ").trim() : "";
      // header = up to 2 non-bullet lines before the date (+ inline text)
      let s = di;
      let n = 0;
      while (s - 1 > prevDi && n < 2) {
        const p = lines[s - 1];
        if (!p || !p.trim() || isBullet(p) || RE.dateRange.test(p)) break;
        s--;
        n++;
      }
      const headerLines = lines.slice(s, di).map((l) => l.trim()).filter(Boolean);
      const inline = dm ? line.slice(0, line.indexOf(dm[0])).replace(/[|•·–—\s,]+$/, "").trim() : "";
      if (inline) headerLines.push(inline);
      let role = "";
      let company = "";
      const cand = headerLines.join(" | ");
      const parts = cand.split(/\s*\|\s*/).map((s2) => s2.trim()).filter(Boolean);
      if (parts.length >= 2) {
        company = parts[0];
        role = parts[1];
      } else {
        role = headerLines[0] || "";
        company = headerLines[1] || "";
      }
      const descEnd = k + 1 < idx.length ? idx[k + 1] : lines.length;
      const desc = buildDescription(
        lines.slice(di + 1, descEnd).filter((l) => isBullet(l) || l.trim().length > 30)
      );
      out.push({ role, company, dates, description: desc });
    });
    return out;
  }

  function extractExperience(lines) {
    if (!lines || !lines.length) return [];
    const byHeaders = parseByHeaders(lines);
    const byDates = parseByDates(lines);
    // Pick whichever found more distinct jobs.
    const best = byDates.length > byHeaders.length ? byDates : byHeaders;
    return best.slice(0, 12);
  }

  function extractEducation(lines) {
    if (!lines || !lines.length) return [];
    const DEGREE =
      /\b(b\.?\s?(?:s|a|sc|tech)\.?|m\.?\s?(?:s|a|sc|tech|ba)\.?|ph\.?\s?d\.?|bachelor|master|associate|diploma|certificate)\b/i;
    const DATES = /\b(?:19|20)\d{2}\b(?:\s*[-–—]\s*(?:(?:19|20)\d{2}|present))?/i;
    const out = [];
    blocks(lines).forEach((block) => {
      const nonEmpty = block.filter((l) => l.trim());
      if (!nonEmpty.length) return;
      const joined = nonEmpty.join(" ").trim();
      const dm = joined.match(DATES);
      const dates = dm ? dm[0] : "";
      const stripDates = (s) => (dm ? s.replace(dm[0], "").trim() : s.trim());

      const school = stripDates(nonEmpty[0]);
      // Prefer a full line that reads like a degree; fall back to a keyword match.
      let degree = "";
      for (let i = 1; i < nonEmpty.length; i++) {
        if (DEGREE.test(nonEmpty[i])) {
          degree = stripDates(nonEmpty[i]).replace(/[,|]+$/, "").trim();
          break;
        }
      }
      if (!degree) {
        const m = joined.match(DEGREE);
        if (m) degree = m[0].trim();
      }
      out.push({ school, degree, dates });
    });
    return out.slice(0, 6);
  }

  function extractCerts(lines) {
    const out = [];
    (lines || []).forEach((l) => {
      const t = stripBullet(l).trim();
      if (t.length >= 3 && t.length <= 110) out.push(t);
    });
    return [...new Set(out)].slice(0, 12);
  }

  function extractProjects(lines) {
    if (!lines || !lines.length) return [];
    // "Name — description" / "Name: description" (separator must have spaces).
    const SEP = /^(.{2,70}?)\s[-–—:|]\s+(.+)$/;
    const out = [];
    blocks(lines).forEach((block) => {
      const items = block.map((l) => stripBullet(l).trim()).filter(Boolean);
      if (!items.length) return;

      // If every line in the block is its own "Name — desc", split per line.
      if (items.length > 1 && items.every((l) => SEP.test(l))) {
        items.forEach((l) => {
          const m = l.match(SEP);
          out.push({ name: m[1].trim().slice(0, 80), description: m[2].trim() });
        });
        return;
      }

      // Otherwise the block is one project: first line is the name (it may
      // carry an inline description), the rest is the description body.
      const first = items[0];
      const m = first.match(SEP);
      let name, desc;
      if (m) {
        name = m[1].trim().slice(0, 80);
        desc = [m[2].trim(), items.slice(1).join(" ")].filter(Boolean).join(" ").trim();
      } else {
        name = first.slice(0, 80);
        desc = items.slice(1).join(" ").trim();
      }
      if (name) out.push({ name, description: desc });
    });
    return out.slice(0, 8);
  }

  /* ----------------------------- Orchestrator ----------------------------- */

  function parseText(text) {
    const rawLines = text
      .replace(/\r/g, "")
      .split("\n")
      .map((l) => l.replace(/ /g, " ").replace(/[ \t]+/g, " ").trimEnd());

    const sections = partition(rawLines);
    const headerLines = (sections.header || []).filter((l) => l.trim());

    // Name + title from header block.
    let name = "";
    let title = "";
    for (const l of headerLines) {
      if (looksLikeName(l)) {
        name = l.trim();
        break;
      }
    }
    if (!name && headerLines[0] && headerLines[0].length < 45) name = headerLines[0].trim();

    // Title = the line right after the name (if it isn't contact info / location).
    const nameIdx = headerLines.findIndex((l) => l.trim() === name);
    for (let i = nameIdx + 1; i < headerLines.length && i <= nameIdx + 3; i++) {
      const l = headerLines[i];
      if (!l) continue;
      if (RE.email.test(l) || RE.phone.test(l) || RE.website.test(l)) continue;
      if (/,\s*[A-Z]{2}\b/.test(l)) continue; // looks like a location
      if (l.length > 4 && l.length < 70) {
        title = l.trim();
        break;
      }
    }

    const summary = (sections.summary || [])
      .map((l) => stripBullet(l))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    const profile = {
      name: name || "",
      title: title || "",
      summary: summary || "",
      initials: initialsFrom(name),
      location: extractLocation(headerLines),
      contacts: extractContacts(text, headerLines),
      skills: extractSkills(sections.skills),
      experience: extractExperience(sections.experience),
      education: extractEducation(sections.education),
      certifications: extractCerts(sections.certifications),
      projects: extractProjects(sections.projects),
      _source: "resume",
    };
    return profile;
  }

  async function parse(file) {
    const name = (file.name || "").toLowerCase();
    let text = "";
    try {
      if (name.endsWith(".pdf") || file.type === "application/pdf") {
        text = await extractPdf(file);
      } else if (name.endsWith(".docx") || name.endsWith(".doc") || /word/.test(file.type)) {
        text = await extractDocx(file);
      } else {
        // Fall back to plain text read.
        text = await file.text();
      }
    } catch (err) {
      console.warn("[resume] extraction failed:", err);
      return { _source: "resume", _error: "Could not read this file." };
    }
    try {
      return parseText(text);
    } catch (err) {
      console.warn("[resume] parsing failed:", err);
      return { _source: "resume", _error: "Could not parse this resume." };
    }
  }

  window.ResumeParser = { parse, parseText };
})();
