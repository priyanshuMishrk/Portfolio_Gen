/* =====================================================================
   state.js
   Profile persistence + shareable links — all client-side.

   - persist(profile)      : save to localStorage
   - load()                : restore last profile (or null)
   - clear()               : forget saved profile
   - encode(profile)       : -> compact, URL-safe string (async; gzip if available)
   - decode(str)           : -> profile  (async)
   - readHash()            : decode a profile from location.hash (#p=…) or null
   - buildShareUrl(profile): -> absolute URL with the profile embedded (async)
   - writeHash(profile)    : update location.hash in place (async)

   Exposes: window.ProfileState
   ===================================================================== */
(function () {
  "use strict";

  const LS_KEY = "portfolio_gen.profile.v1";
  const HASH_PREFIX = "p=";

  /* ----------------------------- localStorage ----------------------------- */
  function persist(profile) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(profile));
    } catch (e) {
      /* private mode / quota — non-fatal */
    }
  }
  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }
  function clear() {
    try {
      localStorage.removeItem(LS_KEY);
    } catch (e) {}
  }

  /* ----------------------------- base64url helpers ----------------------------- */
  function bytesToB64url(bytes) {
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function b64urlToBytes(str) {
    str = str.replace(/-/g, "+").replace(/_/g, "/");
    while (str.length % 4) str += "=";
    const bin = atob(str);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /* ----------------------------- gzip (optional) ----------------------------- */
  const canGzip =
    typeof window.CompressionStream === "function" &&
    typeof window.DecompressionStream === "function";

  async function streamThrough(stream, bytes) {
    const ws = stream.writable.getWriter();
    ws.write(bytes);
    ws.close();
    const reader = stream.readable.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
    const out = new Uint8Array(total);
    let off = 0;
    chunks.forEach((c) => {
      out.set(c, off);
      off += c.length;
    });
    return out;
  }

  /* ----------------------------- encode / decode ----------------------------- */
  // We strip large/derived fields to keep links short. GitHub data is kept
  // (avatar URL + repos are small strings) but the activity heatmap is dropped
  // since it's easily refetched and bulky.
  function slim(profile) {
    const p = JSON.parse(JSON.stringify(profile || {}));
    if (p.github && p.github.activity) delete p.github.activity;
    return p;
  }

  async function encode(profile) {
    const json = JSON.stringify(slim(profile));
    const raw = new TextEncoder().encode(json);
    if (canGzip) {
      try {
        const gz = await streamThrough(new window.CompressionStream("gzip"), raw);
        return "1" + bytesToB64url(gz);
      } catch (e) {
        /* fall through to plain */
      }
    }
    return "0" + bytesToB64url(raw);
  }

  async function decode(str) {
    if (!str) return null;
    const flag = str[0];
    const bytes = b64urlToBytes(str.slice(1));
    let jsonBytes = bytes;
    if (flag === "1") {
      if (!canGzip) return null;
      jsonBytes = await streamThrough(new window.DecompressionStream("gzip"), bytes);
    }
    const json = new TextDecoder().decode(jsonBytes);
    return JSON.parse(json);
  }

  /* ----------------------------- hash <-> profile ----------------------------- */
  function hashPayload() {
    const h = (location.hash || "").replace(/^#/, "");
    return h.startsWith(HASH_PREFIX) ? h.slice(HASH_PREFIX.length) : "";
  }

  async function readHash() {
    const payload = hashPayload();
    if (!payload) return null;
    try {
      return await decode(payload);
    } catch (e) {
      console.warn("[state] could not decode shared profile:", e);
      return null;
    }
  }

  async function buildShareUrl(profile) {
    const payload = await encode(profile);
    const base = location.href.split("#")[0];
    return `${base}#${HASH_PREFIX}${payload}`;
  }

  async function writeHash(profile) {
    try {
      const payload = await encode(profile);
      // Replace state so we don't spam browser history on every edit.
      history.replaceState(null, "", `#${HASH_PREFIX}${payload}`);
    } catch (e) {}
  }

  function clearHash() {
    history.replaceState(null, "", location.pathname + location.search);
  }

  window.ProfileState = {
    persist,
    load,
    clear,
    encode,
    decode,
    readHash,
    buildShareUrl,
    writeHash,
    clearHash,
  };
})();
