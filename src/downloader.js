const { ComponentsV2Builder, V2Text } = require("gralonium");
const { Logger } = require("./runtime");
// Todas las peticiones del downloader pasan por validacion de host publico (anti-SSRF) y redirecciones controladas
const { assertPublicUrl, fetchPublic: fetchWithTimeout, readBodyLimited, readTextLimited } = require("./security");
const { RED } = require("./config");
const { decodeHtmlEntities } = require("./shared/utils");

const log = new Logger("DOWNLOAD");
const MAX_HTML_BYTES = 1024 * 1024;

const DISCORD_BOT_UA = "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)";
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const ANDROID_UA = "com.google.android.youtube/20.03.32 (Linux; U; Android 14) gzip";
const DOWNLOAD_CONCURRENCY = 4;

function extractFirstUrl(text) {
  if (!text || typeof text !== "string") return null;
  const match = text.match(/https?:\/\/[^\s<>"]+/i);
  return match ? match[0] : null;
}

function isHost(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

function extractMetaTag(html, prop) {
  const escaped = prop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const r1 = new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=(["'])((?:(?!\\1).)+)\\1`, "i");
  const r2 = new RegExp(`<meta[^>]+content=(["'])((?:(?!\\1).)+)\\1[^>]+(?:property|name)=["']${escaped}["']`, "i");
  const m = html.match(r1) || html.match(r2);
  return m ? decodeHtmlEntities(m[2]) : null;
}

function getGuildUploadLimitBytes(guild) {
  const tier = guild?.premiumTier ?? 0;
  if (tier >= 3) return 95 * 1024 * 1024;
  if (tier === 2) return 48 * 1024 * 1024;
  return 24.5 * 1024 * 1024;
}

function extractYouTubeId(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    if (isHost(host, "youtu.be")) {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (isHost(host, "youtube.com") || isHost(host, "youtube-nocookie.com")) {
      const v = parsed.searchParams.get("v");
      if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
      const pathMatch = parsed.pathname.match(/\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{11})/);
      if (pathMatch) return pathMatch[1];
    }
  } catch {}
  return null;
}

async function fetchVisitorDataFromInnertube() {
  try {
    const res = await fetchWithTimeout(
      "https://www.youtube.com/youtubei/v1/visitor_id?prettyPrint=false",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": ANDROID_UA,
          "X-YouTube-Client-Name": "3",
          "X-YouTube-Client-Version": "20.03.32",
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: "ANDROID",
              clientVersion: "20.03.32",
              androidSdkVersion: 34,
              osName: "Android",
              osVersion: "14",
              hl: "es",
              gl: "US",
            },
          },
        }),
      },
      6000
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.responseContext?.visitorData || null;
  } catch {
    return null;
  }
}

async function fetchVisitorDataFromEmbed(videoId) {
  try {
    const res = await fetchWithTimeout(
      `https://www.youtube.com/embed/${videoId}`,
      { headers: { "User-Agent": BROWSER_UA } },
      8000
    );
    if (!res.ok) return null;
    const html = await readTextLimited(res, MAX_HTML_BYTES);
    const match = html.match(/"VISITOR_DATA":"([^"]+)"/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

async function extractYouTube(url) {
  const videoId = extractYouTubeId(url);
  if (!videoId) return null;

  try {
    const visitorData =
      (await fetchVisitorDataFromInnertube()) ||
      (await fetchVisitorDataFromEmbed(videoId));

    if (visitorData) {
      const res = await fetchWithTimeout(
        "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": ANDROID_UA,
            "X-YouTube-Client-Name": "3",
            "X-YouTube-Client-Version": "20.03.32",
            "X-Goog-Visitor-Id": visitorData,
          },
          body: JSON.stringify({
            videoId,
            contentCheckOk: true,
            racyCheckOk: true,
            context: {
              client: {
                clientName: "ANDROID",
                clientVersion: "20.03.32",
                hl: "es",
                gl: "US",
                visitorData,
                androidSdkVersion: 34,
                osName: "Android",
                osVersion: "14",
              },
            },
          }),
        },
        10_000
      );

      if (res.ok) {
        const data = await res.json();
        if (data?.playabilityStatus?.status === "OK") {
          const formats = (data?.streamingData?.formats ?? []).filter(
            (f) => f?.url && f?.mimeType?.includes("video/mp4")
          );
          if (formats.length) {
            formats.sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
            return {
              platform: "YouTube",
              author: data?.videoDetails?.author || "YouTube",
              title: data?.videoDetails?.title || "Video de YouTube",
              videoUrl: formats[0].url,
              sourceUrl: url,
              userAgent: ANDROID_UA,
            };
          }
        }
      }
    }
  } catch {}

  return extractYouTubeViaNoTube(videoId, url);
}

async function pickNoTubeServers(count = 2, exclude = new Set()) {
  const pool = [];
  for (let n = 40; n <= 76; n++) {
    const host = `https://s${n}.notube.im`;
    if (!exclude.has(host)) pool.push(host);
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const candidates = pool.slice(0, 8);
  if (!candidates.length) return ["https://s60.notube.im"];
  const ready = [];

  await new Promise((resolve) => {
    let settled = 0;
    const timer = setTimeout(resolve, 1500);
    timer.unref();
    for (const host of candidates) {
      fetchWithTimeout(
        `${host}/check-server-load.php`,
        { headers: { "User-Agent": BROWSER_UA, Origin: "https://notube.im", Referer: "https://notube.im/" } },
        1500
      )
        .then(async (res) => {
          if (!res.ok) {
            await res.body?.cancel?.().catch(() => {});
            return;
          }
          const text = (await readTextLimited(res, 64 * 1024)).trim();
          if (text === "OK" && ready.length < count) {
            ready.push(host);
            if (ready.length >= count) {
              clearTimeout(timer);
              resolve();
            }
          }
        })
        .catch(() => {})
        .finally(() => {
          settled++;
          if (settled >= candidates.length) {
            clearTimeout(timer);
            resolve();
          }
        });
    }
  });

  for (const host of candidates) {
    if (ready.length >= count) break;
    if (!ready.includes(host)) ready.push(host);
  }
  return ready.length ? ready.slice(0, count) : ["https://s60.notube.im"];
}

const NOTUBE_POST_HEADERS = {
  "Content-Type": "application/x-www-form-urlencoded",
  "User-Agent": BROWSER_UA,
  Origin: "https://notube.im",
  Referer: "https://notube.im/",
};

async function runNoTubeHost(host, watchUrl, originalUrl) {
  const r1 = await fetchWithTimeout(
    `${host}/recover_weight.php`,
    {
      method: "POST",
      headers: NOTUBE_POST_HEADERS,
      body: new URLSearchParams({
        url: watchUrl,
        format: "mp4",
        lang: "es",
        subscribed: "false",
      }).toString(),
    },
    15_000
  );
  if (!r1.ok) {
    await r1.body?.cancel?.().catch(() => {});
    throw new Error(`weight HTTP ${r1.status}`);
  }
  const weightData = await r1.json();
  if (!weightData?.token || !weightData?.name_mp4) {
    throw new Error("missing token/name_mp4");
  }

  const r2 = await fetchWithTimeout(
    `${host}/recover_file.php`,
    {
      method: "POST",
      headers: NOTUBE_POST_HEADERS,
      body: new URLSearchParams({
        url: watchUrl,
        format: "mp4",
        name_mp4: weightData.name_mp4,
        lang: "es",
        token: weightData.token,
        subscribed: "false",
        playlist: "false",
        adblock: "false",
      }).toString(),
    },
    25_000
  );
  if (!r2.ok) {
    await r2.body?.cancel?.().catch(() => {});
    throw new Error(`file HTTP ${r2.status}`);
  }

  let finalToken = weightData.token;
  try {
    const rfJson = await r2.json();
    if (rfJson?.token) finalToken = rfJson.token;
  } catch {}

  const convRes = await fetchWithTimeout(
    `${host}/conversion.php`,
    {
      method: "POST",
      headers: NOTUBE_POST_HEADERS,
      body: new URLSearchParams({ token: finalToken }).toString(),
    },
    12_000
  ).catch(() => null);
  await convRes?.body?.cancel?.().catch(() => {});

  const pageRes = await fetchWithTimeout(
    `https://notube.im/es/download?token=${encodeURIComponent(finalToken)}`,
    { headers: { "User-Agent": BROWSER_UA, Referer: "https://notube.im/" } },
    8_000
  );
  if (!pageRes.ok) {
    await pageRes.body?.cancel?.().catch(() => {});
    throw new Error(`download page HTTP ${pageRes.status}`);
  }
  const pageHtml = await readTextLimited(pageRes, MAX_HTML_BYTES);
  const dlMatch = pageHtml.match(/href="(https:\/\/[^"]+download\.php\?[^"]+)"/i);
  if (!dlMatch?.[1]) throw new Error("missing download.php link");

  let decodedTitle = "Video de YouTube";
  if (weightData.titre_mp4) {
    const rawTitle = weightData.titre_mp4.replace(/\+/g, " ");
    try {
      decodedTitle = decodeURIComponent(rawTitle);
    } catch {
      decodedTitle = rawTitle;
    }
  }

  return {
    platform: "YouTube",
    author: "YouTube",
    title: decodedTitle,
    videoUrl: dlMatch[1],
    sourceUrl: originalUrl,
    userAgent: BROWSER_UA,
    headers: { Referer: "https://notube.im/" },
  };
}

async function extractYouTubeViaNoTube(videoId, url) {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const tried = new Set();

  for (let round = 0; round < 2; round++) {
    const hosts = await pickNoTubeServers(2, tried);
    hosts.forEach((h) => tried.add(h));
    try {
      return await Promise.any(hosts.map((host) => runNoTubeHost(host, watchUrl, url)));
    } catch {}
  }

  log.error("[download:yt] todos los métodos fallaron", { videoId });
  return null;
}

async function extractTikTok(url) {
  try {
    const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`;
    const res = await fetchWithTimeout(apiUrl, { headers: { "User-Agent": BROWSER_UA } }, 10_000);
    if (res.ok) {
      const json = await res.json();
      const d = json?.data;
      const videoUrl = d?.play || d?.wmplay || d?.hdplay;
      if (json?.code === 0 && videoUrl) {
        const authorName = d.author?.nickname || d.author?.unique_id || "TikTok";
        const handle = d.author?.unique_id ? `@${d.author.unique_id}` : "";
        return {
          platform: "TikTok",
          author: handle ? `${authorName} (${handle})` : authorName,
          title: d.title?.trim() || "Video de TikTok",
          videoUrl,
          sourceUrl: url,
        };
      }
    }
  } catch {}

  return extractOpenGraphVideo(url.replace(/tiktok\.com/i, "tnktok.com"), "TikTok", url);
}

async function extractTwitter(url) {
  const idMatch = url.match(/(?:status|statuses)\/(\d+)/i);
  if (!idMatch) return null;
  const tweetId = idMatch[1];

  try {
    const res = await fetchWithTimeout(
      `https://api.vxtwitter.com/Twitter/status/${tweetId}`,
      { headers: { "User-Agent": BROWSER_UA, Accept: "application/json" } },
      8000
    );
    if (res.ok) {
      const data = await res.json();
      const media = (data?.media_extended ?? []).find((m) => m.type === "video" || m.type === "gif");
      if (media?.url) {
        const author = data.user_name
          ? `${data.user_name} (@${data.user_screen_name})`
          : `@${data.user_screen_name || "X"}`;
        return {
          platform: "X (Twitter)",
          author,
          title: data.text?.trim() || "Video de X",
          videoUrl: media.url,
          sourceUrl: url,
        };
      }
    }
  } catch {}

  try {
    const res = await fetchWithTimeout(
      `https://api.fxtwitter.com/status/${tweetId}`,
      { headers: { "User-Agent": BROWSER_UA, Accept: "application/json" } },
      8000
    );
    if (res.ok) {
      const data = await res.json();
      const tweet = data?.tweet;
      const video = tweet?.media?.videos?.[0];
      if (video?.url) {
        const author = tweet.author?.name
          ? `${tweet.author.name} (@${tweet.author.screen_name})`
          : `@${tweet.author?.screen_name || "X"}`;
        return {
          platform: "X (Twitter)",
          author,
          title: tweet.text?.trim() || "Video de X",
          videoUrl: video.url,
          sourceUrl: url,
        };
      }
    }
  } catch {}

  return null;
}

async function extractInstagram(url) {
  let targetUrl = url;
  if (/instagram\.com\/share\//i.test(url)) {
    try {
      const redir = await fetchWithTimeout(url, { headers: { "User-Agent": DISCORD_BOT_UA } }, 6000);
      await redir?.body?.cancel?.().catch(() => {});
      if (redir?.url) targetUrl = redir.url;
    } catch {}
  }

  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return null;
  }
  for (const fixHost of ["instagramez.com", "kkinstagram.com"]) {
    const fixUrl = `https://${fixHost}${parsed.pathname}${parsed.search}`;
    const info = await extractOpenGraphVideo(fixUrl, "Instagram", url);
    if (info?.videoUrl) return info;
  }

  const codeMatch = parsed.pathname.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
  if (codeMatch) {
    try {
      const embedUrl = `https://www.instagram.com/p/${codeMatch[1]}/embed/captioned/`;
      const res = await fetchWithTimeout(embedUrl, { headers: { "User-Agent": BROWSER_UA } }, 8000);
      if (res.ok) {
        const html = await readTextLimited(res, MAX_HTML_BYTES);
        const vMatch = html.match(/"video_url"\s*:\s*"([^"]+)"/);
        if (vMatch?.[1]) {
          const cleanVideoUrl = JSON.parse(`"${vMatch[1]}"`);
          await assertPublicUrl(cleanVideoUrl);
          return {
            platform: "Instagram",
            author: "Instagram",
            title: "Reel / Video de Instagram",
            videoUrl: cleanVideoUrl,
            sourceUrl: url,
          };
        }
      } else {
        await res.body?.cancel?.().catch(() => {});
      }
    } catch {}
  }

  return null;
}

async function extractReddit(url) {
  let targetUrl = url;
  if (/redd\.it\//i.test(url) || /\/s\/[A-Za-z0-9]+/i.test(url)) {
    try {
      const redir = await fetchWithTimeout(url, { headers: { "User-Agent": DISCORD_BOT_UA } }, 6000);
      await redir?.body?.cancel?.().catch(() => {});
      if (redir?.url) targetUrl = redir.url;
    } catch {}
  }

  try {
    const parsed = new URL(targetUrl);
    const rxUrl = `https://rxddit.com${parsed.pathname}`;
    const info = await extractOpenGraphVideo(rxUrl, "Reddit", url);
    if (info?.videoUrl) return info;
  } catch {}

  return null;
}

async function extractOpenGraphVideo(fetchUrl, platformLabel = "Web", originalUrl = fetchUrl) {
  try {
    const res = await fetchWithTimeout(
      fetchUrl,
      { headers: { "User-Agent": DISCORD_BOT_UA, Accept: "text/html,application/xhtml+xml" } },
      8000
    );
    if (!res.ok) {
      await res.body?.cancel?.().catch(() => {});
      return null;
    }

    const ctype = (res.headers.get("content-type") || "").toLowerCase();
    if (ctype.startsWith("video/")) {
      const finalVideoUrl = res.url || fetchUrl;
      await res.body?.cancel?.().catch(() => {});
      return {
        platform: platformLabel,
        author: null,
        title: "Video",
        videoUrl: finalVideoUrl,
        sourceUrl: originalUrl,
      };
    }

    const html = await readTextLimited(res, MAX_HTML_BYTES);
    const videoType = extractMetaTag(html, "og:video:type");
    if (videoType && /text\/html|application\/x-shockwave-flash/i.test(videoType)) {
      return null;
    }

    const videoUrl =
      extractMetaTag(html, "og:video:secure_url") ||
      extractMetaTag(html, "og:video") ||
      extractMetaTag(html, "og:video:url") ||
      extractMetaTag(html, "twitter:player:stream");

    if (!videoUrl || !/^https?:\/\//i.test(videoUrl)) return null;
    if (/\/embed\//i.test(videoUrl) || /\.html?(\?|$)/i.test(videoUrl)) return null;

    const title =
      extractMetaTag(html, "og:description") ||
      extractMetaTag(html, "og:title") ||
      extractMetaTag(html, "twitter:title") ||
      `Video de ${platformLabel}`;
    const author = extractMetaTag(html, "og:site_name") || null;

    return {
      platform: platformLabel,
      author,
      title: title.slice(0, 300),
      videoUrl,
      sourceUrl: originalUrl,
    };
  } catch {
    return null;
  }
}

async function resolveVideoMetadata(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  if (!["http:", "https:"].includes(parsed.protocol)) return null;
  const host = parsed.hostname.toLowerCase();

  if (/\.(mp4|mov|webm)(\?.*)?$/i.test(parsed.pathname)) {
    return {
      platform: "Video",
      author: host,
      title: parsed.pathname.split("/").pop() || "Video",
      videoUrl: rawUrl,
      sourceUrl: rawUrl,
    };
  }

  if (isHost(host, "youtube.com") || isHost(host, "youtube-nocookie.com") || isHost(host, "youtu.be")) {
    return extractYouTube(rawUrl);
  }

  if (isHost(host, "tiktok.com")) {
    return extractTikTok(rawUrl);
  }

  if (isHost(host, "twitter.com") || isHost(host, "x.com") || isHost(host, "vxtwitter.com") || isHost(host, "fxtwitter.com")) {
    return extractTwitter(rawUrl);
  }

  if (isHost(host, "instagram.com") || isHost(host, "instagramez.com") || isHost(host, "kkinstagram.com")) {
    return extractInstagram(rawUrl);
  }

  if (isHost(host, "reddit.com") || isHost(host, "redd.it") || isHost(host, "rxddit.com")) {
    return extractReddit(rawUrl);
  }

  return extractOpenGraphVideo(rawUrl, host.replace(/^www\./, ""), rawUrl);
}

async function downloadVideoBuffer(videoUrl, maxBytes, userAgent = BROWSER_UA, extraHeaders = {}) {
  const ua = userAgent || BROWSER_UA;
  let videoHost = "";
  try {
    videoHost = new URL(videoUrl).hostname.toLowerCase();
  } catch {}

  if (isHost(videoHost, "googlevideo.com")) {
    const probe = await fetchWithTimeout(
      videoUrl,
      {
        headers: { "User-Agent": ua, Range: "bytes=0-0", ...extraHeaders },
      },
      10_000
    );
    if (!probe.ok && probe.status !== 206) {
      await probe.body?.cancel?.().catch(() => {});
      throw new Error(`HTTP ${probe.status}`);
    }

    const contentRange = probe.headers.get("content-range");
    const totalSize = contentRange
      ? Number(contentRange.split("/")[1])
      : Number(probe.headers.get("content-length") ?? 0);
    await probe.body?.cancel?.().catch(() => {});

    if (Number.isFinite(totalSize) && totalSize > maxBytes) {
      return { tooLarge: true, size: totalSize };
    }

    if (probe.status === 206 && Number.isFinite(totalSize) && totalSize > 0) {
      const chunkSize = 2 * 1024 * 1024;
      const ranges = [];
      for (let start = 0; start < totalSize; start += chunkSize) {
        ranges.push([start, Math.min(start + chunkSize - 1, totalSize - 1)]);
      }

      const buffers = new Array(ranges.length);
      let cursor = 0;
      let failed = false;
      const worker = async () => {
        while (!failed && cursor < ranges.length) {
          const index = cursor++;
          const [start, end] = ranges[index];
          try {
            const r = await fetchWithTimeout(
              videoUrl,
              {
                headers: { "User-Agent": ua, Range: `bytes=${start}-${end}`, ...extraHeaders },
              },
              45_000
            );
            if (!r.ok && r.status !== 206) {
              await r.body?.cancel?.().catch(() => {});
              throw new Error(`HTTP ${r.status}`);
            }
            const chunkBody = await readBodyLimited(r, chunkSize + 4096);
            if (chunkBody.tooLarge || !chunkBody.buffer) throw new Error("Chunk de video excede el tamaño esperado");
            buffers[index] = chunkBody.buffer;
          } catch (err) {
            failed = true;
            throw err;
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, ranges.length) }, worker));

      const full = Buffer.concat(buffers);
      return {
        tooLarge: full.length > maxBytes,
        buffer: full.length > maxBytes ? null : full,
        size: full.length,
      };
    }
  }

  const res = await fetchWithTimeout(
    videoUrl,
    {
      headers: {
        "User-Agent": ua,
        Accept: "*/*",
        ...extraHeaders,
      },
    },
    35_000
  );

  if (!res.ok) {
    await res.body?.cancel?.().catch(() => {});
    throw new Error(`HTTP ${res.status}`);
  }

  const ctype = (res.headers.get("content-type") || "").toLowerCase();
  if (ctype.includes("text/html")) {
    await res.body?.cancel?.().catch(() => {});
    throw new Error("URL resolved to HTML instead of a video stream");
  }

  const body = await readBodyLimited(res, maxBytes);
  if (body.tooLarge) {
    return { tooLarge: true, size: body.size };
  }

  return {
    tooLarge: false,
    buffer: body.buffer,
    size: body.size,
  };
}

async function downloadMeta(meta, maxBytes) {
  return downloadVideoBuffer(meta.videoUrl, maxBytes, meta.userAgent, meta.headers);
}

function buildDownloadV2Payload(meta, downloadResult) {
  const builder = new ComponentsV2Builder({ color: RED })
    .addText(V2Text.subtext(meta.platform))
    .addSpacer("small");

  if (!downloadResult.tooLarge && downloadResult.buffer) {
    const fileName = "redbot_video.mp4";
    builder
      .addAttachment(downloadResult.buffer, { name: fileName })
      .addGallery(`attachment://${fileName}`);
  } else {
    const sizeMb = downloadResult.size
      ? `${(downloadResult.size / (1024 * 1024)).toFixed(1)} MB`
      : "más del límite permitido";
    builder.addText(
      `El video pesa **${sizeMb}** y supera el límite de subida directa de este servidor.`
    );
  }

  builder
    .addSpacer("small")
    .addButton({ label: "Original", style: "link", url: meta.sourceUrl });

  return builder.toPayload({ allowedMentions: { repliedUser: false } });
}

module.exports = {
  extractFirstUrl,
  getGuildUploadLimitBytes,
  resolveVideoMetadata,
  downloadMeta,
  buildDownloadV2Payload,
};
