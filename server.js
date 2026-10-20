import express from "express";
import "dotenv/config";
const app = express();
app.use(express.static("public"));
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
  return "https://www.facebook.com/ads/library/?" + u;
}
// आउटपुट फ़ील्ड के नाम अलग-अलग हो सकते हैं, इसलिए कई विकल्प चेक करते हैं
function mapAd(a) {
  const s = a.snapshot || {};
  const id = a.adArchiveID || a.ad_archive_id || a.adArchiveId || a.id;
  const vid = s.videos?.[0] || a.videos?.[0];
  const img = s.images?.[0] || a.images?.[0];
  const media = vid?.video_hd_url || vid?.video_sd_url || vid?.videoHdUrl || img?.original_image_url || img?.resized_image_url;
  const active = a.isActive ?? a.is_active;
  return {
    brand: a.pageName || a.page_name || s.page_name || s.pageName || "—",
    text: (s.body?.text || s.body || a.text || s.title || "").toString().slice(0, 160),
    type: vid ? "Video" : "Image",
    active: active === undefined ? !(a.endDate || a.end_date) : !!active,
    start: a.startDateFormatted || a.startDate || a.start_date || "",
    lib: id ? "https://www.facebook.com/ads/library/?id=" + id : "",
    url: media || s.link_url || s.page_profile_uri || "",
    thumb: vid?.video_preview_image_url || vid?.videoPreviewImageUrl || img?.resized_image_url || "",
  };
}
async function facebook(q, plat, raw) {
  if (!APIFY_TOKEN) throw new Error("APIFY_TOKEN .env में डालें (README देखें)");
  const items = await post(
    `https://api.apify.com/v2/acts/apify~facebook-ads-scraper/run-sync-get-dataset-items?token=${APIFY_TOKEN}`,
    { startUrls: [{ url: libUrl(q, plat) }], resultsLimit: Number(MAX_ADS) }
  );
  if (raw) return items.slice(0, 1); // डीबग: /api/search?...&raw=1
  return items.map(mapAd);
}

// ---- YouTube: Google Ads Transparency (SerpApi) ----
async function youtube(q) {
  if (!SERPAPI_KEY) throw new Error("SERPAPI_KEY .env में डालें (README देखें)");
  const j = await get("https://serpapi.com/search.json?" + new URLSearchParams({ engine: "google_ads_transparency_center", text: q, api_key: SERPAPI_KEY }));
  const now = Date.now();
  return (j.ad_creatives || []).filter((a) => !a.format || /video/i.test(a.format)).map((a) => ({
    brand: a.advertiser || a.target_domain || "—", text: a.target_domain || "", type: "Video",
    active: a.last_shown_datetime ? now - new Date(a.last_shown_datetime).getTime() < 3 * 864e5 : true,
    start: a.first_shown_datetime, url: a.link,
  }));
}
async function tiktok() {
  throw new Error("TikTok API अप्रूवल मांगता है। अभी 'Ad Library खोलें' बटन इस्तेमाल करें।");
}

app.get("/api/search", async (req, res) => {
  const { platform, q, raw } = req.query;
  try {
    let ads = [];
    if (platform === "facebook" || platform === "instagram") ads = await facebook(q, platform, raw);
    else if (platform === "youtube") ads = await youtube(q);
    else ads = await tiktok(q);
    res.json({ ads, note: ads.length ? "" : "इस कीवर्ड पर कोई ऐड नहीं मिला।" });
  } catch (e) {
    res.json({ ads: [], note: "⚠️ " + e.message });
  }
});
app.listen(PORT, () => console.log("चल रहा है: http://localhost:" + PORT));
