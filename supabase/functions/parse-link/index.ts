const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, status);
}

// ---------------------------------------------------------------------------
// URL validation
// ---------------------------------------------------------------------------
function isValidHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Manually follow HTTP redirects (up to 8 hops) reading the Location header.
// Deno Edge Functions can't always follow the maps.app.goo.gl redirect chain
// automatically, so we do it ourselves.
// ---------------------------------------------------------------------------
async function resolveRedirectManually(url: string): Promise<string> {
  let current = url;
  for (let i = 0; i < 8; i++) {
    let res: Response;
    try {
      res = await fetch(current, {
        method: "GET",
        headers: {
          // A plain curl-like UA causes Google to return HTTP 302 redirects instead of
          // the JavaScript "Open in App" interstitial page it shows to real browsers.
          "User-Agent": "curl/8.7.1",
          "Accept": "*/*",
        },
        redirect: "manual",
      });
    } catch {
      break;
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) break;
      current = location.startsWith("http") ? location : new URL(location, current).href;
    } else {
      break;
    }
  }
  return current;
}

// ---------------------------------------------------------------------------
// Page fetch + og:/JSON-LD extraction
// ---------------------------------------------------------------------------
type PageMeta = {
  title: string;
  description: string;
  imageUrl: string;
  resolvedUrl: string;
};

async function fetchPageMeta(url: string): Promise<PageMeta> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
  });

  const resolvedUrl = res.url ?? url;
  const html = await res.text();

  const og = (prop: string) => {
    const m = html.match(new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']+)["']`, "i"))
      ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${prop}["']`, "i"));
    return m ? decodeHtmlEntities(m[1]) : "";
  };

  const meta = (name: string) => {
    const m = html.match(new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, "i"))
      ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, "i"));
    return m ? decodeHtmlEntities(m[1]) : "";
  };

  const title =
    og("title") ||
    meta("title") ||
    extractTag(html, "title") ||
    "";

  const description = og("description") || meta("description") || "";
  const imageUrl = og("image") || "";

  return { title, description, imageUrl, resolvedUrl };
}

function extractTag(html: string, tag: string): string {
  const m = html.match(new RegExp(`<${tag}[^>]*>([^<]+)<\/${tag}>`, "i"));
  return m ? decodeHtmlEntities(m[1].trim()) : "";
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'");
}

// ---------------------------------------------------------------------------
// Google Maps URL handling: extract query/place name from URL patterns
// ---------------------------------------------------------------------------
function isGoogleMapsUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return (
      host === "maps.google.com" ||
      host === "www.google.com" ||
      host === "maps.app.goo.gl" ||
      host === "goo.gl"
    );
  } catch {
    return false;
  }
}

// Google rewrites search URLs (especially when fetched from a datacenter IP) into
// opaque reference tokens — e.g. q=EhAqBdAU... or a 0x..:0x.. CID, or bare lat,lng.
// None of these are human-readable and Places Text Search cannot resolve them, so we
// must reject them and fall back to a readable signal.
function looksLikeOpaqueToken(value: string): boolean {
  const v = value.trim();
  if (!v) return true;
  // Hex CID form: 0x123abc:0x456def
  if (/^0x[0-9a-f]+:0x[0-9a-f]+$/i.test(v)) return true;
  // Bare coordinates "48.8584,2.2945" — a location, not a name
  if (/^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(v)) return true;
  // Long, space-free base64url-ish blob (the EhAq... reference tokens)
  if (!/\s/.test(v) && v.length >= 24 && /^[A-Za-z0-9_+\-/=]+$/.test(v)) return true;
  return false;
}

function extractGoogleMapsHints(url: string): string {
  try {
    const u = new URL(url);

    // Readable place path is the most reliable signal:
    // https://www.google.com/maps/place/Name/@lat,lng,...
    const placeMatch = u.pathname.match(/\/maps\/place\/([^/@]+)/);
    if (placeMatch) {
      const name = decodeURIComponent(placeMatch[1].replace(/\+/g, " ")).trim();
      if (name && !looksLikeOpaqueToken(name)) return name;
    }

    // https://www.google.com/maps/search/Name+of+Place/...
    const searchMatch = u.pathname.match(/\/maps\/search\/([^/@]+)/);
    if (searchMatch) {
      const name = decodeURIComponent(searchMatch[1].replace(/\+/g, " ")).trim();
      if (name && !looksLikeOpaqueToken(name)) return name;
    }

    // https://maps.google.com/?q=Name+of+Place — checked last because this is the
    // param Google most often replaces with an opaque token.
    const q = u.searchParams.get("q");
    if (q) {
      const name = q.trim();
      if (name && !looksLikeOpaqueToken(name)) return name;
    }

    // Anti-bot interstitials (google.com/sorry, consent.google.com) wrap the real
    // destination in a ?continue= param — unwrap it and extract from there.
    const cont = u.searchParams.get("continue");
    if (cont) {
      const inner = extractGoogleMapsHints(cont);
      if (inner) return inner;
    }
  } catch {
    // ignore
  }
  return "";
}

// ---------------------------------------------------------------------------
// Gemini: extract structured place info from page text
// ---------------------------------------------------------------------------
type GeminiPlace = {
  name: string;
  city: string;
  hints: string;
};

// Retry transient Gemini failures (503 overloaded, 429 rate-limited) with backoff.
async function fetchGeminiWithRetry(
  url: string,
  init: RequestInit,
  attempts = 3,
): Promise<Response> {
  let res = await fetch(url, init);
  for (let i = 1; i < attempts && (res.status === 503 || res.status === 429); i++) {
    await new Promise((r) => setTimeout(r, 500 * 2 ** (i - 1)));
    res = await fetch(url, init);
  }
  return res;
}

async function extractWithGemini(
  pageText: string,
  geminiKey: string,
): Promise<GeminiPlace> {
  const prompt = `You are a place-extraction assistant. Given the following text scraped from a webpage or social media post, extract the name of the real-world place being referred to and the city it is in.

Return ONLY a JSON object with these fields (no markdown, no explanation):
{
  "name": "exact name of the place (restaurant, bar, café, hotel, museum, shop, etc.)",
  "city": "city name, e.g. Vienna, Paris, New York",
  "hints": "any additional context that helps identify the place (address fragment, neighbourhood, landmark nearby)"
}

If there is no identifiable place in the text, return:
{"name":"","city":"","hints":""}

Text:
${pageText.slice(0, 2000)}`;

  // gemini-2.5-flash-lite: highest free-tier limits (30 RPM / ~1k+ RPD / 1M TPM),
  // ample for this tiny extraction task. The free tier is best-effort and returns
  // 503 (overloaded) / 429 (rate-limited) intermittently, so retry with backoff.
  const res = await fetchGeminiWithRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${geminiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 256 },
      }),
    },
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gemini API error: ${res.status} ${detail}`);
  }

  const data = await res.json();
  const raw: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Gemini returned no JSON");

  return JSON.parse(jsonMatch[0]) as GeminiPlace;
}

// ---------------------------------------------------------------------------
// Gemini Vision: extract structured place info from a screenshot
//
// Instagram blocks server-side reads of a post from a datacenter IP, so the
// caption/location never reach us via a URL fetch. A screenshot, however, is
// fully readable: the account @handle, the location tag, the caption, and any
// on-photo signage are all visible pixels. We hand the image to Gemini's
// multimodal model and let it read those signals into a structured place.
// ---------------------------------------------------------------------------
type ImageInput = { data: string; mimeType: string };

// Accepts either a bare base64 string or a data URL (data:image/png;base64,...).
function parseImageInput(image: string, fallbackMime?: string): ImageInput {
  const dataUrl = image.match(/^data:([^;]+);base64,(.*)$/s);
  if (dataUrl) return { mimeType: dataUrl[1], data: dataUrl[2] };
  return { mimeType: fallbackMime || "image/jpeg", data: image };
}

async function extractWithGeminiVision(
  image: ImageInput,
  geminiKey: string,
): Promise<GeminiPlace> {
  const prompt = `This image is a screenshot of an Instagram post, reel, or profile that refers to a real-world place (restaurant, bar, café, hotel, shop, museum, etc.).

Read EVERYTHING visible in the image:
- the account @handle (e.g. @cafenil)
- the location tag shown at the top of a post (this is often the most reliable signal)
- the caption text and hashtags
- any signage, logo, or text visible inside the photo itself

From all of that, identify the single real-world place the post is about.

Return ONLY a JSON object (no markdown, no explanation):
{
  "name": "the place's real-world name (expand handles sensibly, e.g. @cafenil -> Café Nil)",
  "city": "the city the place is in, if you can determine it",
  "hints": "other identifying details that help locate it: neighbourhood, address fragment, the @handle, country"
}

If no real-world place can be identified, return:
{"name":"","city":"","hints":""}`;

  const res = await fetchGeminiWithRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inlineData: { mimeType: image.mimeType, data: image.data } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 512,
          // gemini-2.5-flash enables "thinking" by default, which silently consumes
          // the output-token budget and can return empty text. Disable it for this
          // small extraction task, and force a pure-JSON response.
          thinkingConfig: { thinkingBudget: 0 },
          responseMimeType: "application/json",
        },
      }),
    },
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gemini Vision API error: ${res.status} ${detail}`);
  }

  const data = await res.json();
  const raw: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    const finish = data?.candidates?.[0]?.finishReason ?? "unknown";
    throw new Error(`Gemini Vision returned no JSON (finishReason: ${finish})`);
  }

  return JSON.parse(jsonMatch[0]) as GeminiPlace;
}

// ---------------------------------------------------------------------------
// Google Places Text Search
// ---------------------------------------------------------------------------
type ResolvedPlace = {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  websiteUri?: string;
  phoneNumber?: string;
  placeId?: string;
  photoNames?: string[];
};

async function resolveWithPlaces(
  query: string,
  placesKey: string,
): Promise<ResolvedPlace | null> {
  const res = await fetch(
    "https://places.googleapis.com/v1/places:searchText",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": placesKey,
        "X-Goog-FieldMask":
          "places.displayName,places.formattedAddress,places.location,places.websiteUri,places.nationalPhoneNumber,places.id,places.photos",
      },
      body: JSON.stringify({ textQuery: query }),
    },
  );

  if (!res.ok) {
    // Google puts the actionable reason (key restrictions, disabled API, bad field
    // mask) in the body, not the status — surface it or the failure is undiagnosable.
    const detail = await res.text().catch(() => "");
    throw new Error(`Places API error: ${res.status} ${detail}`);
  }

  const data = await res.json();
  const place = data?.places?.[0];
  if (!place) return null;

  const photoNames: string[] = (place.photos ?? [])
    .slice(0, 6)
    .map((p: { name: string }) => p.name)
    .filter(Boolean);

  return {
    name: place.displayName?.text ?? "",
    address: place.formattedAddress ?? "",
    latitude: place.location?.latitude ?? 0,
    longitude: place.location?.longitude ?? 0,
    websiteUri: place.websiteUri,
    phoneNumber: place.nationalPhoneNumber,
    placeId: place.id,
    photoNames,
  };
}

// ---------------------------------------------------------------------------
// Resolve photo names -> public photoUri values via Places photo-media API
// ---------------------------------------------------------------------------
async function resolvePhotoUrls(
  photoNames: string[],
  placesKey: string,
): Promise<string[]> {
  const results = await Promise.allSettled(
    photoNames.map(async (name) => {
      const url = `https://places.googleapis.com/v1/${name}/media?maxWidthPx=800&skipHttpRedirect=true`;
      const res = await fetch(url, {
        headers: { "X-Goog-Api-Key": placesKey },
      });
      if (!res.ok) throw new Error(`photo media error: ${res.status}`);
      const data = await res.json();
      const uri = data?.photoUri as string | undefined;
      if (!uri) throw new Error("no photoUri");
      return uri;
    }),
  );

  return results
    .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
    .map((r) => r.value);
}

// ---------------------------------------------------------------------------
// Shared: resolve an extracted place against Google Places and build the
// ImportedSpot response. Used by both the URL path and the screenshot path.
// ---------------------------------------------------------------------------
async function buildSpotResponse(
  extracted: GeminiPlace,
  placesKey: string,
  sourceUrl: string | null,
): Promise<Response> {
  const searchQuery = [extracted.name, extracted.city, extracted.hints]
    .filter(Boolean)
    .join(", ");

  let resolved: ResolvedPlace | null;
  try {
    resolved = await resolveWithPlaces(searchQuery, placesKey);
  } catch (e) {
    return errorResponse(`Could not resolve place: ${(e as Error).message}`, 500);
  }

  if (!resolved) {
    return errorResponse(
      `Found a place called "${extracted.name}" but could not locate it in Google Maps. Try a clearer screenshot or a more specific link.`,
    );
  }

  const photos = resolved.photoNames?.length
    ? await resolvePhotoUrls(resolved.photoNames, placesKey)
    : [];

  return jsonResponse({
    name: resolved.name,
    address: resolved.address,
    latitude: resolved.latitude,
    longitude: resolved.longitude,
    websiteUri: resolved.websiteUri ?? null,
    phoneNumber: resolved.phoneNumber ?? null,
    notes: sourceUrl ? `Imported from: ${sourceUrl}` : "Imported from Instagram",
    sourceUrl: sourceUrl ?? null,
    photos,
  });
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  let body: { url?: string; image?: string; mimeType?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }

  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  const placesKey = Deno.env.get("GOOGLE_PLACES_API_KEY");

  if (!geminiKey || !placesKey) {
    return errorResponse("Server misconfiguration: missing API keys", 500);
  }

  // --- Screenshot path: read the place straight out of the image with Gemini Vision ---
  // This is the reliable Instagram route — Instagram blocks server-side reads of a post
  // URL from our datacenter IP, but a screenshot the user already has is fully readable.
  const rawImage = body?.image?.trim() ?? "";
  if (rawImage) {
    let extracted: GeminiPlace;
    try {
      extracted = await extractWithGeminiVision(
        parseImageInput(rawImage, body?.mimeType),
        geminiKey,
      );
    } catch (e) {
      return errorResponse(`Could not read the screenshot: ${(e as Error).message}`, 500);
    }

    if (!extracted.name) {
      return errorResponse(
        "Couldn't find a place in this screenshot. Make sure the location tag, caption, or the place's name is visible.",
      );
    }

    return buildSpotResponse(extracted, placesKey, null);
  }

  const rawUrl = body?.url?.trim() ?? "";
  if (!rawUrl) return errorResponse("Missing url or image");
  if (!isValidHttpUrl(rawUrl)) return errorResponse("Invalid URL — must be http or https");

  // --- Step 1: manually resolve short links to get the true destination URL ---
  // maps.app.goo.gl uses an app-detection interstitial that Deno's auto-redirect can't
  // follow reliably. We read Location headers ourselves.
  let startUrl = rawUrl;
  if (isGoogleMapsUrl(rawUrl) || rawUrl.includes("goo.gl")) {
    startUrl = await resolveRedirectManually(rawUrl);
  }

  // --- Step 2: fast path for Google Maps — extract place name straight from the URL ---
  // Prefer the ORIGINAL url: its q=/place/ values are human-readable. The redirect-
  // resolved url is often rewritten by Google into an opaque token, so it comes second.
  const googleMapsHint =
    extractGoogleMapsHints(rawUrl) || extractGoogleMapsHints(startUrl);

  // --- Step 3: fetch the page for og: tags (also captures any remaining redirect) ---
  let meta: PageMeta;
  try {
    meta = await fetchPageMeta(startUrl);
  } catch (e) {
    return errorResponse(`Could not fetch the link: ${(e as Error).message}`);
  }

  const resolvedUrl = meta.resolvedUrl;

  // Also check the final URL from the GET fetch in case manual resolution stopped short
  const mapsHint =
    googleMapsHint ||
    extractGoogleMapsHints(resolvedUrl);

  let extracted: GeminiPlace;

  if (mapsHint) {
    // Clean place name already in the URL — skip Gemini entirely
    extracted = { name: mapsHint, city: "", hints: "" };
  } else {
    // --- Step 3: Gemini extraction from og: tags / page text ---
    const pageText = [
      meta.title ? `Title: ${meta.title}` : "",
      meta.description ? `Description: ${meta.description}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    if (!pageText.trim()) {
      return errorResponse(
        "Could not read any content from this link. Instagram posts and some protected pages cannot be read — try pasting the place name directly.",
      );
    }

    try {
      extracted = await extractWithGemini(pageText, geminiKey);
    } catch (e) {
      return errorResponse(`Could not extract place info: ${(e as Error).message}`, 500);
    }

    if (!extracted.name) {
      return errorResponse(
        "No place found in this link. Try a Google Maps link, a restaurant website, or paste the place name directly.",
      );
    }
  }

  // --- Step 4: resolve against Google Places and build the response ---
  return buildSpotResponse(extracted, placesKey, resolvedUrl);
});
