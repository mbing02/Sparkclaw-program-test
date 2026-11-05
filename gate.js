// mbing02 password gate — shared core. Entry points: middleware.js (static/other
// frameworks on Vercel) or proxy.ts (Next.js 16). Copy this file unchanged.
//
// GATE_PASSWORD unset  -> project is public, every request passes through.
// GATE_PASSWORD set    -> visitors need the unlock cookie; otherwise they get /__gate.
// The cookie holds an HMAC of the password (never the password) and is scoped to
// .mbing02.com, so one unlock covers every project and the home page.


const COOKIE = "mbing02_gate";
const MESSAGE = "mbing02-gate-v1";
const GATE_PATH = "/__gate";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

async function token(password) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(MESSAGE));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function readCookie(request, name) {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return undefined;
}

function safeNext(value) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function cookieDomain(host) {
  const h = (host || "").split(":")[0];
  return h === "mbing02.com" || h.endsWith(".mbing02.com") ? "; Domain=.mbing02.com" : "";
}

const pass = () => new Response(null, { headers: { "x-middleware-next": "1" } });

function page(next, error) {
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>mbing02 — private</title>
<style>
:root{--navy:#12386b;--yellow:#ffd23f;--bg:#f7f8fb;--surface:#fff;--text:#12213a;--muted:#5b6577;--border:#dde2ea}
@media (prefers-color-scheme:dark){:root{--bg:#0d1626;--surface:#14213a;--text:#e8edf5;--muted:#9aa6bb;--border:#24365a}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:16px}
form{width:100%;max-width:340px;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:28px;display:flex;flex-direction:column;gap:14px}
h1{font-size:1.1rem;margin:0}p{margin:0;color:var(--muted);font-size:.95rem}
input{font:inherit;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text)}
button{font:inherit;font-weight:600;padding:10px;border:0;border-radius:8px;background:var(--navy);color:#fff;cursor:pointer}
.err{color:#c0392b}svg{width:44px;height:44px}
</style></head><body>
<form method="post" action="${GATE_PATH}">
<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="50" fill="#12386B"/><path d="M26 72V34M74 34V72" fill="none" stroke="#fff" stroke-width="11" stroke-linecap="round"/><path d="M26 34L50 64L74 34" fill="none" stroke="#FFD23F" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/></svg>
<h1>This project is still being built</h1>
<p>Enter the password to take a look.</p>
${error ? `<p class="err">That password didn't work.</p>` : ""}
<input type="password" name="password" aria-label="Password" autocomplete="current-password" required autofocus>
<input type="hidden" name="next" value="${esc(next)}">
<button type="submit">Unlock</button>
</form></body></html>`;
}

function html(body, status) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" },
  });
}

export default async function gate(request) {
  const password = process.env.GATE_PASSWORD;
  if (!password) return pass();

  const url = new URL(request.url);
  const expected = await token(password);

  if (url.pathname === GATE_PATH) {
    if (request.method === "POST") {
      const form = await request.formData();
      const next = safeNext(form.get("next"));
      if (safeEqual(await token(String(form.get("password") || "")), expected)) {
        return new Response(null, {
          status: 303,
          headers: {
            location: next,
            "set-cookie": `${COOKIE}=${expected}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax${cookieDomain(url.host)}`,
            "cache-control": "no-store",
          },
        });
      }
      return html(page(next, true), 401);
    }
    return html(page(safeNext(url.searchParams.get("next")), false), 200);
  }

  if (safeEqual(readCookie(request, COOKIE), expected)) return pass();

  // API and non-page requests get a plain 401 instead of a redirect.
  const wantsHtml = (request.headers.get("accept") || "").includes("text/html");
  if (request.method !== "GET" || !wantsHtml) {
    return new Response("Locked", { status: 401, headers: { "cache-control": "no-store" } });
  }
  const to = new URL(GATE_PATH, url);
  to.searchParams.set("next", url.pathname + url.search);
  return new Response(null, { status: 307, headers: { location: to.toString(), "cache-control": "no-store" } });
}
