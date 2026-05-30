/* =====================================================================
   editor.js
   "Edit before reveal" — client-side resume/LinkedIn parsing is fuzzy,
   so this lets the user correct the merged profile before it renders.
   Edits text fields + repeatable lists (experience / projects / education);
   GitHub data is preserved untouched.

   Exposes: window.ProfileEditor.{ build(profile), collect() }
   ===================================================================== */
(function () {
  "use strict";

  const esc = (s) =>
    String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  let base = null; // the profile passed to build(), preserved for collect()

  /* ----------------------------- row templates ----------------------------- */
  function expRow(e) {
    e = e || {};
    return `
      <div class="ed-row ed-exp-row">
        <button type="button" class="ed-remove" title="Remove" aria-label="Remove entry">&times;</button>
        <div class="ed-row__grid">
          <input class="ed-input ed-exp-role" placeholder="Role" value="${esc(e.role)}" />
          <input class="ed-input ed-exp-company" placeholder="Company" value="${esc(e.company)}" />
          <input class="ed-input ed-exp-dates" placeholder="Dates" value="${esc(e.dates)}" />
        </div>
        <textarea class="ed-input ed-exp-desc" rows="2" placeholder="What you did">${esc(e.description)}</textarea>
      </div>`;
  }
  function projRow(p) {
    p = p || {};
    return `
      <div class="ed-row ed-proj-row">
        <button type="button" class="ed-remove" title="Remove" aria-label="Remove entry">&times;</button>
        <input class="ed-input ed-proj-name" placeholder="Project name" value="${esc(p.name)}" />
        <textarea class="ed-input ed-proj-desc" rows="2" placeholder="Description">${esc(p.description)}</textarea>
      </div>`;
  }
  function eduRow(e) {
    e = e || {};
    return `
      <div class="ed-row ed-edu-row">
        <button type="button" class="ed-remove" title="Remove" aria-label="Remove entry">&times;</button>
        <div class="ed-row__grid">
          <input class="ed-input ed-edu-school" placeholder="Institution" value="${esc(e.school)}" />
          <input class="ed-input ed-edu-degree" placeholder="Degree" value="${esc(e.degree)}" />
          <input class="ed-input ed-edu-dates" placeholder="Dates" value="${esc(e.dates)}" />
        </div>
      </div>`;
  }

  function group(title, inner) {
    return `<fieldset class="ed-group"><legend class="ed-group__title">${title}</legend>${inner}</fieldset>`;
  }
  function listGroup(title, listId, rowsHtml, addId, addLabel) {
    return group(
      title,
      `<div class="ed-list" id="${listId}">${rowsHtml}</div>
       <button type="button" class="btn-link ed-add" id="${addId}">+ ${addLabel}</button>`
    );
  }

  /* ----------------------------- build ----------------------------- */
  function build(profile) {
    base = JSON.parse(JSON.stringify(profile || {}));
    const body = document.getElementById("editor-body");
    if (!body) return;

    const skills = (base.skills || [])
      .map((s) => (typeof s === "object" ? (s.items || []).join(", ") : s))
      .join(", ");
    const certs = (base.certifications || []).join("\n");
    const exp = (base.experience || []).map(expRow).join("") || expRow();
    const proj = (base.projects || []).map(projRow).join("");
    const edu = (base.education || []).map(eduRow).join("") || eduRow();

    let ghNote = "";
    if (base.github && base.github.available && !base.github.private) {
      ghNote = `<p class="ed-note">&#10003; GitHub data for <b>@${esc(base.github.username)}</b> is included automatically and kept as-is.</p>`;
    }

    body.innerHTML =
      group(
        "Basics",
        `<label class="ed-field"><span>Name</span><input class="ed-input" id="ed-name" value="${esc(base.name)}" /></label>
         <label class="ed-field"><span>Headline</span><input class="ed-input" id="ed-title" value="${esc(base.title)}" /></label>
         <label class="ed-field"><span>Location</span><input class="ed-input" id="ed-location" value="${esc(base.location)}" /></label>
         <label class="ed-field"><span>Photo URL <em>(LinkedIn photos can't be fetched automatically — paste an image link)</em></span><input class="ed-input" id="ed-avatar" placeholder="https://… (optional)" value="${esc(base.avatar || "")}" /></label>
         <label class="ed-field"><span>Summary / About</span><textarea class="ed-input" id="ed-summary" rows="3">${esc(base.summary)}</textarea></label>`
      ) +
      group(
        "Skills",
        `<label class="ed-field"><span>Comma-separated</span><textarea class="ed-input" id="ed-skills" rows="3" placeholder="TypeScript, React, Docker…">${esc(skills)}</textarea></label>`
      ) +
      listGroup("Experience", "ed-exp-list", exp, "ed-add-exp", "Add role") +
      listGroup("Projects", "ed-proj-list", proj, "ed-add-proj", "Add project") +
      listGroup("Education", "ed-edu-list", edu, "ed-add-edu", "Add education") +
      group(
        "Certifications & Awards",
        `<label class="ed-field"><span>One per line</span><textarea class="ed-input" id="ed-certs" rows="3" placeholder="AWS Certified Developer&#10;Hackathon Winner 2023">${esc(certs)}</textarea></label>`
      ) +
      ghNote;

    // delegated add / remove
    body.onclick = (ev) => {
      const rm = ev.target.closest(".ed-remove");
      if (rm) {
        const row = rm.closest(".ed-row");
        if (row) row.remove();
        return;
      }
      const add = ev.target.closest(".ed-add");
      if (add) {
        if (add.id === "ed-add-exp") appendRow("ed-exp-list", expRow());
        else if (add.id === "ed-add-proj") appendRow("ed-proj-list", projRow());
        else if (add.id === "ed-add-edu") appendRow("ed-edu-list", eduRow());
      }
    };
  }

  function appendRow(listId, html) {
    const list = document.getElementById(listId);
    if (!list) return;
    const tmp = document.createElement("div");
    tmp.innerHTML = html.trim();
    const row = tmp.firstChild;
    list.appendChild(row);
    const first = row.querySelector("input, textarea");
    if (first) first.focus();
  }

  /* ----------------------------- collect ----------------------------- */
  const val = (sel, root) => {
    const n = (root || document).querySelector(sel);
    return n ? n.value.trim() : "";
  };

  function collect() {
    const p = JSON.parse(JSON.stringify(base || {}));

    p.name = document.getElementById("ed-name").value.trim() || "Anonymous Dev";
    p.title = document.getElementById("ed-title").value.trim();
    p.location = document.getElementById("ed-location").value.trim();
    p.summary = document.getElementById("ed-summary").value.trim();
    const avatar = document.getElementById("ed-avatar").value.trim();
    p.avatar = avatar || null;

    // re-derive initials from the (possibly edited) name
    const parts = p.name.split(/\s+/);
    p.initials =
      ((parts[0]?.[0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() ||
      "::";

    p.skills = document
      .getElementById("ed-skills")
      .value.split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);

    p.experience = Array.from(document.querySelectorAll(".ed-exp-row"))
      .map((row) => ({
        role: val(".ed-exp-role", row),
        company: val(".ed-exp-company", row),
        dates: val(".ed-exp-dates", row),
        description: val(".ed-exp-desc", row),
      }))
      .filter((e) => e.role || e.company || e.description);

    p.projects = Array.from(document.querySelectorAll(".ed-proj-row"))
      .map((row) => ({
        name: val(".ed-proj-name", row),
        description: val(".ed-proj-desc", row),
      }))
      .filter((e) => e.name || e.description);

    p.education = Array.from(document.querySelectorAll(".ed-edu-row"))
      .map((row) => ({
        school: val(".ed-edu-school", row),
        degree: val(".ed-edu-degree", row),
        dates: val(".ed-edu-dates", row),
      }))
      .filter((e) => e.school || e.degree);

    p.certifications = document
      .getElementById("ed-certs")
      .value.split(/\n/)
      .map((s) => s.trim())
      .filter(Boolean);

    return p;
  }

  window.ProfileEditor = { build, collect };
})();
