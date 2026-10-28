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
const { fetchWithTimeout } = require("./runtime");
const { RED } = require("./config");

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
  return 9.5 * 1024 * 1024;
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
    const videoUrl =
      extractMetaTag(html, "og:video:secure_url") ||
      extractMetaTag(html, "og:video") ||
      extractMetaTag(html, "og:video:url") ||
      extractMetaTag(html, "twitter:player:stream");

    if (!videoUrl || !/^https?:\/\//i.test(videoUrl)) return null;

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
      platform: "Enlace directo",
      author: host,
      title: parsed.pathname.split("/").pop() || "Video",
      videoUrl: rawUrl,
      sourceUrl: rawUrl,
    };
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

async function downloadVideoBuffer(videoUrl, maxBytes) {
  const res = await fetchWithTimeout(
    videoUrl,
    {
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "*/*",
      },
      redirect: "follow",
    },
    20_000
  );

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

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

  const headerLines = [`### 🎬 ${meta.platform}`];
  if (meta.author && meta.author !== meta.platform) {
    headerLines.push(`> **Autor:** ${meta.author}`);
  }
  if (meta.title && meta.title !== `Video de ${meta.platform}`) {
    const cleanTitle = meta.title.replace(/\s+/g, " ").trim().slice(0, 240);
    if (cleanTitle) headerLines.push(`> ${cleanTitle}`);
  }

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(headerLines.join("\n"))
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
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
        `⚠️ El video pesa **${sizeMb}** y supera el límite de subida directa de este servidor. Puedes verlo o descargarlo desde el botón inferior.`
      )
    );
  }

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("Enlace original")
      .setStyle(ButtonStyle.Link)
      .setURL(meta.sourceUrl)
  );

  if (downloadResult.tooLarge && meta.videoUrl) {
    row.addComponents(
      new ButtonBuilder()
        .setLabel("Descargar MP4")
        .setStyle(ButtonStyle.Link)
        .setURL(meta.videoUrl)
    );
  }

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
