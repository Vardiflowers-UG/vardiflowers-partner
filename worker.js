// VARDI Partner-Gateway (Cloudflare Worker) v1.1.0 — gebuendelt, nicht von Hand aendern.
// Einrichten (wrangler, Cloudflare-Dashboard oder Deploy-Knopf): VARDI Partner-Dashboard → Eigene Domain.
// Noetig ist nur der KV-Speicher GATEWAY_KV; alle Variablen sind optional.
// Kein Geheimnis noetig: das Gateway meldet sich selbst an; VARDI verknuepft es im Hub.

// gateway.ts
var VERSION = "1.1.0";
var VARDI_API_VORGABE = "https://api.vardi-fs.de";
var RUECKRUF_PFAD = "/.well-known/vardi-gateway";
var FEHLERBRUECKE_PFAD = "/api/affiliate/seiten-fehler";
var STAND_TAKT_S = 60;
var FRISCH_S = 60;
var STALE_S = 24 * 3600;
var enc = new TextEncoder();
var hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
async function sha256Hex(t) {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(t)));
}
async function hmacHex(k, m) {
  const key = await crypto.subtle.importKey("raw", enc.encode(k), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(m)));
}
function kanon(methode, pfadMitQuery, zeit, nonce, besucher) {
  return [methode.toUpperCase(), pfadMitQuery, zeit, nonce, besucher].join("\n");
}
function besucherKopf(b) {
  const json = JSON.stringify(b);
  let bin = "";
  for (const byte of enc.encode(json)) bin += String.fromCharCode(byte);
  return btoa(bin);
}
var zufall = (n = 16) => [...crypto.getRandomValues(new Uint8Array(n))].map((x) => x.toString(16).padStart(2, "0")).join("");
var text = (status, body, kopf = {}) => new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", ...kopf } });
var EINRICHTUNG = (domain) => new Response(
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Wird eingerichtet</title><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem"><h1>Diese Seite wird gerade eingerichtet</h1><p>${domain.replace(/[<>&"]/g, "")} ist gleich erreichbar. Bitte in ein paar Minuten erneut versuchen.</p></body>`,
  { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Retry-After": "120", "Cache-Control": "no-store" } }
);
function erstelleGateway(env, deps) {
  const jetzt = deps.jetzt ?? (() => Math.floor(Date.now() / 1e3));
  const nonce = deps.nonce ?? (() => zufall(16));
  const api = (env.VARDI_API || VARDI_API_VORGABE).replace(/\/+$/, "");
  const art = env.ART === "worker_eigen" ? "worker_eigen" : "worker_partner";
  const weg = env.WEG || (art === "worker_eigen" ? "cname" : "dashboard");
  const durchreichen = art === "worker_eigen" ? (env.DURCHREICHEN ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean) : [];
  const erlaubt = (env.DOMAINS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const goSub = env.GO_SUBDOMAIN === "1";
  function ordne(host) {
    const h = host.toLowerCase();
    const go = h.startsWith("go.");
    const domain = go ? h.slice(3) : h;
    if (erlaubt.length && !erlaubt.includes(domain)) return null;
    return { domain, go };
  }
  const kvKey = (domain) => `gw:${domain}`;
  async function lies(domain) {
    const roh = await env.GATEWAY_KV.get(kvKey(domain));
    try {
      return roh ? JSON.parse(roh) : null;
    } catch {
      return null;
    }
  }
  const schreib = (domain, z) => env.GATEWAY_KV.put(kvKey(domain), JSON.stringify(z));
  async function anmelden(domain) {
    const res = await deps.fetch(`${api}/api/partner-gateway/anmelden`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        domain,
        art,
        version: VERSION,
        weg,
        go_host: goSub ? `go.${domain}` : void 0
      })
    });
    if (res.status !== 201) return null;
    const d = await res.json();
    const z = { gateway_id: d.gateway_id, abholtoken: d.abholtoken, abhol_hash: await sha256Hex(d.abholtoken) };
    await schreib(domain, z);
    return z;
  }
  const tokenKopf = (z) => ({ "X-VG-Id": z.gateway_id, Authorization: `Bearer ${z.abholtoken}` });
  async function einrichten(domain, z) {
    if ((z.stand_gefragt ?? 0) > jetzt() - STAND_TAKT_S) return z;
    z.stand_gefragt = jetzt();
    if (!z.bewiesen) {
      const b = await deps.fetch(`${api}/api/partner-gateway/beweisen`, { method: "POST", headers: tokenKopf(z) });
      if (b.status === 200) z.bewiesen = true;
    } else {
      const s = await deps.fetch(`${api}/api/partner-gateway/stand`, { headers: tokenKopf(z) });
      if (s.status === 200) {
        const d = await s.json();
        if (d.secret) {
          z.secret = d.secret;
          z.generation = d.generation;
        }
      }
    }
    await schreib(domain, z);
    return z;
  }
  async function signiert(z, methode, pfadMitQuery, req, extra = {}) {
    const cf = req.cf;
    const besucher = besucherKopf({
      ip: req.headers.get("CF-Connecting-IP"),
      land: cf?.country ?? req.headers.get("CF-IPCountry"),
      sprache: req.headers.get("Accept-Language"),
      ua: req.headers.get("User-Agent")
    });
    const zeit = String(jetzt());
    const n = nonce();
    const sig = await hmacHex(z.secret, kanon(methode, pfadMitQuery, zeit, n, besucher));
    const kopf = {
      "X-VG-Id": z.gateway_id,
      "X-VG-Zeit": zeit,
      "X-VG-Nonce": n,
      "X-VG-Besucher": besucher,
      "X-VG-Sig": sig,
      ...extra.headers ?? {}
    };
    const referer = req.headers.get("Referer");
    if (referer) kopf["X-VG-Referer"] = referer;
    return deps.fetch(`${api}${pfadMitQuery}`, { ...extra, method: methode, headers: kopf, redirect: "manual" });
  }
  function cacheSchluessel(url, req) {
    const sprache = (req.headers.get("Accept-Language") ?? "").split(/[,;-]/)[0].trim().toLowerCase() || "xx";
    const cf = req.cf;
    const land = (cf?.country ?? req.headers.get("CF-IPCountry") ?? "XX").toUpperCase();
    return new Request(`https://vardi-gateway-cache.invalid/${url.host}${url.pathname}${url.search}#${sprache}.${land}`);
  }
  async function seite(z, url, req) {
    const schluessel = cacheSchluessel(url, req);
    const alt = await deps.cache.match(schluessel);
    const gespeichert = Number(alt?.headers.get("X-VG-Gespeichert") ?? 0);
    if (alt && gespeichert > jetzt() - FRISCH_S) return ohneIntern(alt);
    const pfad = `/api/partner-gateway/seite?pfad=${encodeURIComponent(url.pathname + url.search)}`;
    let neu;
    try {
      neu = await signiert(z, "GET", pfad, req, { headers: alt?.headers.get("ETag") ? { "If-None-Match": alt.headers.get("ETag") } : {} });
    } catch {
      return alt && gespeichert > jetzt() - STALE_S ? ohneIntern(alt) : text(502, "Die Seite ist gerade nicht erreichbar.");
    }
    if (neu.status === 304 && alt) {
      await merke(schluessel, alt.clone(), alt.headers.get("ETag"));
      return ohneIntern(alt);
    }
    if (neu.status >= 500 && alt && gespeichert > jetzt() - STALE_S) return ohneIntern(alt);
    if (neu.status === 200) {
      const body = await neu.text();
      const antwort = new Response(body, { status: 200, headers: { "Content-Type": neu.headers.get("Content-Type") ?? "text/html; charset=utf-8" } });
      await merke(schluessel, antwort.clone(), neu.headers.get("ETag"));
      return antwort;
    }
    return new Response(neu.body, { status: neu.status, headers: { "Content-Type": neu.headers.get("Content-Type") ?? "text/plain", "Cache-Control": "no-store" } });
  }
  async function merke(schluessel, res, etag) {
    const h = new Headers(res.headers);
    h.set("X-VG-Gespeichert", String(jetzt()));
    h.set("Cache-Control", `public, max-age=${STALE_S}`);
    if (etag) h.set("ETag", etag);
    await deps.cache.put(schluessel, new Response(await res.text(), { status: 200, headers: h }));
  }
  function ohneIntern(res) {
    const h = new Headers(res.headers);
    h.delete("X-VG-Gespeichert");
    h.set("Cache-Control", "public, max-age=60");
    return new Response(res.body, { status: res.status, headers: h });
  }
  return async function bearbeite(req) {
    const url = new URL(req.url);
    const host = url.hostname.toLowerCase();
    if (durchreichen.some((z2) => host === z2 || host.endsWith(`.${z2}`))) return deps.fetch(req);
    const ort = ordne(url.host);
    if (!ort) return text(404, "Unbekannte Domain.");
    let z = await lies(ort.domain);
    if (url.pathname === RUECKRUF_PFAD) {
      const n = url.searchParams.get("n") ?? "";
      if (!z || !n) return text(404, "");
      return text(200, await hmacHex(z.abhol_hash, n));
    }
    if (!z) z = await anmelden(ort.domain);
    if (!z) return EINRICHTUNG(ort.domain);
    if (!z.secret) {
      z = await einrichten(ort.domain, z);
      if (!z.secret) return EINRICHTUNG(ort.domain);
    }
    const goToken = ort.go ? url.pathname.slice(1) : url.pathname.startsWith("/go/") ? url.pathname.slice(4) : null;
    if (goToken !== null) {
      if (!goToken) return Response.redirect(`https://${ort.domain}/`, 302);
      const r = await signiert(z, "GET", `/api/partner-gateway/go/${encodeURIComponent(goToken)}${url.search}`, req);
      const ziel = r.headers.get("Location");
      if (r.status >= 300 && r.status < 400 && ziel) {
        return new Response(null, { status: 302, headers: { Location: ziel, "Cache-Control": "no-store" } });
      }
      return new Response(r.body, { status: r.status, headers: { "Content-Type": r.headers.get("Content-Type") ?? "text/html; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (req.method === "POST" && (url.pathname === "/api/track/view" || url.pathname === "/api/track/click")) {
      const art2 = url.pathname.endsWith("view") ? "view" : "click";
      const r = await signiert(z, "POST", `/api/partner-gateway/track/${art2}${url.search}`, req, {
        body: await req.text(),
        headers: { "Content-Type": "application/json" }
      });
      return new Response(r.body, { status: r.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
    }
    if (req.method === "POST" && url.pathname === FEHLERBRUECKE_PFAD) {
      const r = await deps.fetch(`${api}${FEHLERBRUECKE_PFAD}`, {
        method: "POST",
        body: await req.text(),
        headers: { "Content-Type": req.headers.get("Content-Type") ?? "application/json" }
      });
      return new Response(r.body, { status: r.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
    }
    if (req.method !== "GET" && req.method !== "HEAD") return text(405, "Nicht erlaubt.");
    return seite(z, url, req);
  };
}

// index.ts
var index_default = {
  async fetch(request, env) {
    if (!env.GATEWAY_KV) {
      return new Response("Gateway nicht eingerichtet: KV-Speicher GATEWAY_KV ist nicht verbunden (siehe README).", { status: 500 });
    }
    return erstelleGateway(env, { fetch: (i, init) => fetch(i, init), cache: caches.default })(request);
  }
};
export {
  index_default as default
};
