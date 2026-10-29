const {
  AttachmentBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");
const { fetchWithTimeout, Logger } = require("./runtime");
const { RED } = require("./config");

const log = new Logger("DOWNLOAD");

const DISCORD_BOT_UA = "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)";
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function extractFirstUrl(text) {
  if (!text || typeof text !== "string") return null;
  const match = text.match(/https?:\/\/[^\s<>"]+/i);
  return match ? match[0] : null;
}

function decodeHtmlEntities(str) {
  if (!str) return "";
  return String(str)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}

function extractMetaTag(html, prop) {
  const escaped = prop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const r1 = new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i");
  const r2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, "i");
  const m = html.match(r1) || html.match(r2);
  return m ? decodeHtmlEntities(m[1]) : null;
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
    if (host === "youtu.be" || host.endsWith(".youtu.be")) {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (host.includes("youtube.com") || host.includes("youtube-nocookie.com")) {
      const v = parsed.searchParams.get("v");
      if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
      const pathMatch = parsed.pathname.match(/\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{11})/);
      if (pathMatch) return pathMatch[1];
    }
  } catch {}
  return null;
}

async function fetchYouTubeVisitorData(videoId) {
  try {
    const res = await fetchWithTimeout(
      `https://www.youtube.com/embed/${videoId}`,
      { headers: { "User-Agent": BROWSER_UA } },
      6000
    );
    if (!res.ok) return undefined;
    const html = await res.text();
    const match = html.match(/"VISITOR_DATA":"([^"]+)"/);
    return match ? match[1] : undefined;
  } catch {
    return undefined;
  }
}

async function extractYouTube(url) {
  const videoId = extractYouTubeId(url);
  if (!videoId) return null;

  const visitorData = await fetchYouTubeVisitorData(videoId);

  const clients = [
    {
      name: "ANDROID",
      version: "20.03.32",
      ua: "com.google.android.youtube/20.03.32 (Linux; U; Android 14) gzip",
      id: 3,
      extra: { androidSdkVersion: 34, osName: "Android", osVersion: "14" },
    },
    {
      name: "ANDROID_VR",
      version: "1.60.19",
      ua: "com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip",
      id: 28,
      extra: { androidSdkVersion: 32, osName: "Android", osVersion: "12L", deviceMake: "Oculus", deviceModel: "Quest 3" },
    },
  ];

  for (const c of clients) {
    try {
      const res = await fetchWithTimeout(
        "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": c.ua,
            "X-YouTube-Client-Name": String(c.id),
            "X-YouTube-Client-Version": c.version,
            ...(visitorData ? { "X-Goog-Visitor-Id": visitorData } : {}),
          },
          body: JSON.stringify({
            videoId,
            contentCheckOk: true,
            racyCheckOk: true,
            context: {
              client: {
                clientName: c.name,
                clientVersion: c.version,
                hl: "es",
                gl: "US",
                ...(visitorData ? { visitorData } : {}),
                ...c.extra,
              },
            },
          }),
        },
        10_000
      );

      if (!res.ok) {
        log.warn("[download:yt] HTTP no OK", { client: c.name, status: res.status });
        continue;
      }
      const data = await res.json();
      if (data?.playabilityStatus?.status !== "OK") {
        log.warn("[download:yt] no reproducible", {
          client: c.name,
          status: data?.playabilityStatus?.status,
          reason: data?.playabilityStatus?.reason,
        });
        continue;
      }

      const formats = (data?.streamingData?.formats ?? []).filter(
        (f) => f?.url && f?.mimeType?.includes("video/mp4")
      );
      if (!formats.length) {
        log.warn("[download:yt] sin formatos mp4 con url", { client: c.name });
        continue;
      }

      formats.sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
      const chosen = formats[0];

      return {
        platform: "YouTube",
        author: data?.videoDetails?.author || "YouTube",
        title: data?.videoDetails?.title || "Video de YouTube",
        videoUrl: chosen.url,
        sourceUrl: url,
        userAgent: c.ua,
      };
    } catch (err) {
      log.warn("[download:yt] error de cliente", { client: c.name, err: err?.message ?? String(err) });
    }
  }

  return extractYouTubeViaPiped(videoId, url);
}

const PIPED_APIS = ["https://api.piped.private.coffee", "https://pipedapi.kavin.rocks"];

async function extractYouTubeViaPiped(videoId, url) {
  for (const base of PIPED_APIS) {
    try {
      const res = await fetchWithTimeout(
        `${base}/streams/${videoId}`,
        { headers: { "User-Agent": BROWSER_UA, Accept: "application/json" } },
        10_000
      );
      if (!res.ok) {
        log.warn("[download:yt] piped HTTP no OK", { base, status: res.status });
        continue;
      }
      const data = await res.json();
      const streams = (data?.videoStreams ?? []).filter(
        (s) => !s.videoOnly && s.format === "MPEG_4" && s.url
      );
      if (!streams.length) {
        log.warn("[download:yt] piped sin streams", { base });
        continue;
      }
      return {
        platform: "YouTube",
        author: data.uploader || "YouTube",
        title: data.title || "Video de YouTube",
        videoUrl: streams[0].url,
        sourceUrl: url,
      };
    } catch (err) {
      log.warn("[download:yt] piped error", { base, err: err?.message ?? String(err) });
    }
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
      const redir = await fetchWithTimeout(url, { redirect: "follow", headers: { "User-Agent": DISCORD_BOT_UA } }, 6000);
      if (redir?.url) targetUrl = redir.url;
    } catch {}
  }

  const parsed = new URL(targetUrl);
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
        const html = await res.text();
        const vMatch = html.match(/"video_url"\s*:\s*"([^"]+)"/);
        if (vMatch?.[1]) {
          const cleanVideoUrl = JSON.parse(`"${vMatch[1]}"`);
          return {
            platform: "Instagram",
            author: "Instagram",
            title: "Reel / Video de Instagram",
            videoUrl: cleanVideoUrl,
            sourceUrl: url,
          };
        }
      }
    } catch {}
  }

  return null;
}

async function extractReddit(url) {
  let targetUrl = url;
  if (/redd\.it\//i.test(url) || /\/s\/[A-Za-z0-9]+/i.test(url)) {
    try {
      const redir = await fetchWithTimeout(url, { redirect: "follow", headers: { "User-Agent": DISCORD_BOT_UA } }, 6000);
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
      { headers: { "User-Agent": DISCORD_BOT_UA, Accept: "text/html,application/xhtml+xml" }, redirect: "follow" },
      8000
    );
    if (!res.ok) return null;

    const ctype = (res.headers.get("content-type") || "").toLowerCase();
    if (ctype.startsWith("video/")) {
      return {
        platform: platformLabel,
        author: null,
        title: "Video",
        videoUrl: res.url || fetchUrl,
        sourceUrl: originalUrl,
      };
    }

    const html = await res.text();
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
    if (/\/embed\//i.test(videoUrl)) return null;

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

  if (host.includes("youtube.com") || host === "youtu.be" || host.endsWith(".youtu.be")) {
    return extractYouTube(rawUrl);
  }

  if (host.includes("tiktok.com")) {
    return extractTikTok(rawUrl);
  }

  if (host.includes("twitter.com") || host.includes("x.com") || host.includes("vxtwitter.com") || host.includes("fxtwitter.com")) {
    return extractTwitter(rawUrl);
  }

  if (host.includes("instagram.com") || host.includes("instagramez.com") || host.includes("kkinstagram.com")) {
    return extractInstagram(rawUrl);
  }

  if (host.includes("reddit.com") || host.includes("redd.it") || host.includes("rxddit.com")) {
    return extractReddit(rawUrl);
  }

  return extractOpenGraphVideo(rawUrl, host.replace(/^www\./, ""), rawUrl);
}

async function downloadVideoBuffer(videoUrl, maxBytes, userAgent = BROWSER_UA) {
  const ua = userAgent || BROWSER_UA;

  if (/googlevideo\.com/i.test(videoUrl)) {
    const probe = await fetchWithTimeout(
      videoUrl,
      {
        headers: { "User-Agent": ua, Range: "bytes=0-0" },
        redirect: "follow",
      },
      10_000
    );
    if (!probe.ok && probe.status !== 206) throw new Error(`HTTP ${probe.status}`);

    const contentRange = probe.headers.get("content-range");
    const totalSize = contentRange
      ? Number(contentRange.split("/")[1])
      : Number(probe.headers.get("content-length") ?? 0);

    if (totalSize > maxBytes) {
      return { tooLarge: true, size: totalSize };
    }

    if (totalSize > 0) {
      const chunkSize = 2 * 1024 * 1024;
      const ranges = [];
      for (let start = 0; start < totalSize; start += chunkSize) {
        ranges.push([start, Math.min(start + chunkSize - 1, totalSize - 1)]);
      }

      const buffers = await Promise.all(
        ranges.map(async ([start, end]) => {
          const r = await fetchWithTimeout(
            videoUrl,
            {
              headers: { "User-Agent": ua, Range: `bytes=${start}-${end}` },
              redirect: "follow",
            },
            45_000
          );
          if (!r.ok && r.status !== 206) throw new Error(`HTTP ${r.status}`);
          return Buffer.from(await r.arrayBuffer());
        })
      );

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
      },
      redirect: "follow",
    },
    35_000
  );

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const ctype = (res.headers.get("content-type") || "").toLowerCase();
  if (ctype.includes("text/html")) {
    throw new Error("URL resolved to HTML instead of a video stream");
  }

  const contentLength = Number(res.headers.get("content-length") ?? 0);
  if (contentLength > maxBytes) {
    return { tooLarge: true, size: contentLength };
  }

  const arrayBuf = await res.arrayBuffer();
  if (arrayBuf.byteLength > maxBytes) {
    return { tooLarge: true, size: arrayBuf.byteLength };
  }

  return {
    tooLarge: false,
    buffer: Buffer.from(arrayBuf),
    size: arrayBuf.byteLength,
  };
}

const ACCENT_COLOR =
  typeof RED === "number"
    ? RED
    : Number.parseInt(String(RED).replace("#", ""), 16) || 0xff383d;

function buildDownloadV2Payload(meta, downloadResult) {
  const container = new ContainerBuilder().setAccentColor(ACCENT_COLOR);

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# ${meta.platform}`)
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
  );

  const files = [];
  if (!downloadResult.tooLarge && downloadResult.buffer) {
    const fileName = "redbot_video.mp4";
    files.push(new AttachmentBuilder(downloadResult.buffer, { name: fileName }));
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(`attachment://${fileName}`)
      )
    );
  } else {
    const sizeMb = downloadResult.size
      ? `${(downloadResult.size / (1024 * 1024)).toFixed(1)} MB`
      : "más del límite permitido";
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `⚠️ El video pesa **${sizeMb}** y supera el límite de subida directa de este servidor.`
      )
    );
  }

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
  );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("Original")
      .setStyle(ButtonStyle.Link)
      .setURL(meta.sourceUrl)
  );

  container.addActionRowComponents(row);

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [container],
    files,
    allowedMentions: { repliedUser: false },
  };
}

module.exports = {
  extractFirstUrl,
  getGuildUploadLimitBytes,
  resolveVideoMetadata,
  downloadVideoBuffer,
  buildDownloadV2Payload,
};
