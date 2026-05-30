/* =====================================================================
   parser-github.js
   Fetches public profile + repos from the GitHub REST API (no auth
   required for public data). Computes stats and a language breakdown.

   Exposes: window.GitHubParser.fetchProfile(username) -> Promise<gh>
   Shape:
     { available, private, username, name, avatar, bio, location,
       blog, stats:{repos,stars,followers,following},
       languages:[{name,pct,color}], repos:[{...}] }
   ===================================================================== */
(function () {
  "use strict";

  const API = "https://api.github.com";

  // A small palette so language dots look like GitHub's.
  const LANG_COLORS = {
    JavaScript: "#f1e05a",
    TypeScript: "#3178c6",
    Python: "#3572A5",
    Java: "#b07219",
    "C++": "#f34b7d",
    C: "#555555",
    "C#": "#178600",
    Go: "#00ADD8",
    Rust: "#dea584",
    Ruby: "#701516",
    PHP: "#4F5D95",
    Swift: "#F05138",
    Kotlin: "#A97BFF",
    Dart: "#00B4AB",
    HTML: "#e34c26",
    CSS: "#563d7c",
    SCSS: "#c6538c",
    Shell: "#89e051",
    Vue: "#41b883",
    Svelte: "#ff3e00",
    Jupyter: "#DA5B0B",
    "Jupyter Notebook": "#DA5B0B",
    Solidity: "#AA6746",
    Lua: "#000080",
    Elixir: "#6e4a7e",
    Haskell: "#5e5086",
    Scala: "#c22d40",
    R: "#198CE7",
    Objective: "#438eff",
    "Objective-C": "#438eff",
    PowerShell: "#012456",
    Perl: "#0298c3",
    Zig: "#ec915c",
  };

  const colorFor = (lang) => {
    if (!lang) return "#6b7280";
    if (LANG_COLORS[lang]) return LANG_COLORS[lang];
    // deterministic fallback hue from the name
    let h = 0;
    for (let i = 0; i < lang.length; i++) h = (h * 31 + lang.charCodeAt(i)) % 360;
    return `hsl(${h}, 65%, 58%)`;
  };

  async function getJSON(url) {
    const res = await fetch(url, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (res.status === 404) return { _status: 404 };
    if (res.status === 403) return { _status: 403 }; // rate limited
    if (!res.ok) return { _status: res.status };
    return res.json();
  }

  // Accurate language breakdown by bytes, sampled from the top repos.
  // Falls back to the cheaper repo-count proxy if the calls fail / rate-limit.
  async function accurateLanguages(login, sampleRepos, fallback) {
    try {
      const results = await Promise.all(
        sampleRepos.map((r) =>
          getJSON(`${API}/repos/${encodeURIComponent(login)}/${encodeURIComponent(r.name)}/languages`).catch(
            () => ({})
          )
        )
      );
      const bytes = {};
      results.forEach((res) => {
        if (!res || res._status) return;
        Object.entries(res).forEach(([lang, n]) => {
          bytes[lang] = (bytes[lang] || 0) + (Number(n) || 0);
        });
      });
      const total = Object.values(bytes).reduce((a, b) => a + b, 0);
      if (!total) return fallback;
      return Object.entries(bytes)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([name, n]) => ({ name, pct: Math.round((n / total) * 100), color: colorFor(name) }));
    } catch (e) {
      return fallback;
    }
  }

  // Recent public activity (last ~90 days) from the events API — the only
  // contribution signal available without an auth token.
  async function recentActivity(login) {
    try {
      const events = await getJSON(`${API}/users/${encodeURIComponent(login)}/events/public?per_page=100`);
      if (!Array.isArray(events)) return null;
      const counts = {};
      let total = 0;
      events.forEach((ev) => {
        const day = (ev.created_at || "").slice(0, 10);
        if (!day) return;
        let weight = 1;
        if (ev.type === "PushEvent" && ev.payload && Array.isArray(ev.payload.commits))
          weight = ev.payload.commits.length || 1;
        counts[day] = (counts[day] || 0) + weight;
        total += weight;
      });
      if (!total) return null;
      return { counts, total };
    } catch (e) {
      return null;
    }
  }

  async function fetchProfile(usernameRaw) {
    const username = String(usernameRaw || "")
      .trim()
      .replace(/^@/, "")
      .replace(/^https?:\/\/github\.com\//i, "")
      .replace(/\/.*$/, "");
    if (!username) return null;

    let user;
    try {
      user = await getJSON(`${API}/users/${encodeURIComponent(username)}`);
    } catch (err) {
      console.warn("[github] fetch failed:", err);
      return { available: false, error: "network", username };
    }

    if (user._status === 404) return { available: false, error: "notfound", username };
    if (user._status === 403)
      return { available: false, error: "ratelimit", username };
    if (user._status) return { available: false, error: "error", username };

    // Repos (up to 100, sorted by recent push).
    let repos = [];
    try {
      const list = await getJSON(
        `${API}/users/${encodeURIComponent(username)}/repos?per_page=100&sort=pushed`
      );
      if (Array.isArray(list)) repos = list;
    } catch (err) {
      console.warn("[github] repo fetch failed:", err);
    }

    const ownRepos = repos.filter((r) => !r.fork);
    const totalStars = repos.reduce((s, r) => s + (r.stargazers_count || 0), 0);

    // Cheap fallback: language breakdown by repo count (no extra requests).
    const langCount = {};
    ownRepos.forEach((r) => {
      if (r.language) langCount[r.language] = (langCount[r.language] || 0) + 1;
    });
    const totalLang = Object.values(langCount).reduce((a, b) => a + b, 0) || 1;
    const fallbackLangs = Object.entries(langCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, n]) => ({
        name,
        pct: Math.round((n / totalLang) * 100),
        color: colorFor(name),
      }));

    // Repos to surface + sample for accurate languages: non-forks, by stars.
    const ranked = (ownRepos.length ? ownRepos : repos)
      .slice()
      .sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0));
    const topRepos = ranked.slice(0, 9).map((r) => ({
      name: r.name,
      description: r.description || "",
      stars: r.stargazers_count || 0,
      forks: r.forks_count || 0,
      language: r.language || "",
      langColor: colorFor(r.language),
      url: r.html_url,
    }));

    // Accurate languages (by bytes) + recent activity, in parallel, best-effort.
    const [languages, activity] = await Promise.all([
      accurateLanguages(user.login, ranked.slice(0, 10), fallbackLangs),
      recentActivity(user.login),
    ]);

    const isPrivate = (user.public_repos || 0) === 0 && topRepos.length === 0;

    return {
      available: true,
      private: isPrivate,
      username: user.login,
      name: user.name || "",
      avatar: user.avatar_url || "",
      bio: user.bio || "",
      location: user.location || "",
      blog: user.blog || "",
      url: user.html_url,
      twitter: user.twitter_username || "",
      stats: {
        repos: user.public_repos || 0,
        stars: totalStars,
        followers: user.followers || 0,
        following: user.following || 0,
      },
      languages,
      activity,
      repos: topRepos,
    };
  }

  window.GitHubParser = { fetchProfile, colorFor };
})();
