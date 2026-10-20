import express from "express";
import "dotenv/config";
import fs from "fs";
const app = express();
// पासवर्ड (Render में APP_PASSWORD डालो; यूज़रनेम कुछ भी चलेगा)
app.use((req, res, next) => {
  const pw = process.env.APP_PASSWORD;
  if (!pw) return next();
  const d = Buffer.from((req.headers.authorization || "").split(" ")[1] || "", "base64").toString();
  if (d.slice(d.indexOf(":") + 1) === pw) return next();
  res.set("WWW-Authenticate", 'Basic realm="Ad Spy"').status(401).send("Password chahiye");
});
// index.html रूट में हो या public/ में, दोनों चलेगा
const IDX = fs.existsSync("public/index.html") ? "public/index.html" : "index.html";
app.get("/", (q, s) => s.sendFile(IDX, { root: process.cwd() }));
const { APIFY_TOKEN, SERPAPI_KEY, COUNTRY = "IN", MAX_ADS = "20", PORT = 3000 } = process.env;

const post = async (u, body) => {
  const r = await fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`API error ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
};
const get = async (u) => {
  const r = await fetch(u);
  if (!r.ok) throw new Error(`API error ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
};

// ---- Facebook + Instagram: Apify "facebook-ads-scraper" (Meta Ad Library को स्क्रैप करता है) ----
function libUrl(q, plat, status) {
  const u = new URLSearchParams({
    active_status: status || "all", ad_type: "all", country: COUNTRY, media_type: "all",
    search_type: "keyword_unordered", q,
  });
  u.set("publisher_platforms[0]", plat);
