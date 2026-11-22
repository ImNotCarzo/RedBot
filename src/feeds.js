const { EmbedBuilder } = require("discord.js");
const mongoose = require("mongoose");
const { RED } = require("./config");
const { SocialFeed } = require("./database");
const { TtlCache } = require("./guild");
const { Logger } = require("./runtime");
const { fetchPublic, readTextLimited } = require("./security");
const { decodeHtmlEntities } = require("./shared/utils");

const log = new Logger("SOCIAL_FEEDS");
const PLATFORM_LIMITS = {
  youtube: 20,
  twitch: 5,
  tiktok: 10,
  reddit: 15,
  kick: 10,
};
const ytHandleCache = new TtlCache(6 * 60 * 60_000, 500);
let feedsInterval = null;
let isPollingFeeds = false;

function neutralizeMentions(str) {
  return String(str ?? "")
    .replace(/@(everyone|here)/gi, "@\u200b$1")
    .replace(/<@&(\d+)>/g, "<@\u200b&$1>");
}

async function fetchYouTubeLatest(account) {
  let channelId = account.trim();
  if (!/^UC[a-zA-Z0-9_-]{20,}$/.test(channelId)) {
    const clean = channelId.replace(/^@/, "");
    const cacheKey = clean.toLowerCase();
    const cachedId = ytHandleCache.get(cacheKey);
    if (cachedId) {
      channelId = cachedId;
    } else {
      const pageRes = await fetchPublic(`https://www.youtube.com/@${encodeURIComponent(clean)}`, {
        headers: { "User-Agent": "Mozilla/5.0" },
      }, 8000);
      if (!pageRes.ok) {
        await pageRes.body?.cancel?.().catch(() => {});
        return null;
      }
      const html = await readTextLimited(pageRes, 512 * 1024);
      const m = html.match(/"channelId":"(UC[a-zA-Z0-9_-]+)"/) || html.match(/channel_id=(UC[a-zA-Z0-9_-]+)/);
      if (!m?.[1]) return null;
      channelId = m[1];
      ytHandleCache.set(cacheKey, channelId);
    }
  }

  const res = await fetchPublic(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`, {}, 8000);
  if (!res.ok) {
    await res.body?.cancel?.().catch(() => {});
    return null;
  }
  const xml = await readTextLimited(res, 512 * 1024);
  const entry = xml.match(/<entry>([\s\S]*?)<\/entry>/)?.[1];
  if (!entry) return null;

  const videoId = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1]?.trim();
  const rawTitle = entry.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim();
  const rawAuthor = entry.match(/<name>([\s\S]*?)<\/name>/)?.[1]?.trim();
  const title = rawTitle ? decodeHtmlEntities(rawTitle) : "Nuevo video en YouTube";
  const author = rawAuthor ? decodeHtmlEntities(rawAuthor) : account;
  if (!videoId) return null;

  return {
    itemId: videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title,
    author,
    platformLabel: "YouTube",
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  };
}

async function fetchRedditLatest(subreddit) {
  const cleanSub = subreddit.replace(/^\/?r\//i, "").trim();
  const res = await fetchPublic(`https://www.reddit.com/r/${encodeURIComponent(cleanSub)}/new.json?limit=2`, {
    headers: { "User-Agent": "RedBot/1.0" },
  }, 8000);
  if (!res.ok) {
    await res.body?.cancel?.().catch(() => {});
    return null;
  }
  const raw = await readTextLimited(res, 512 * 1024);
  const data = JSON.parse(raw);
  const post = data?.data?.children?.[0]?.data;
  if (!post?.id) return null;

  const rawThumb = typeof post.thumbnail === "string" ? post.thumbnail.replace(/&amp;/g, "&") : null;

  return {
    itemId: post.id,
    url: `https://www.reddit.com${post.permalink}`,
    title: post.title || `Nuevo post en r/${cleanSub}`,
    author: `r/${cleanSub}`,
    platformLabel: "Reddit",
    thumbnail: rawThumb && /^https?:\/\//i.test(rawThumb) ? rawThumb : null,
  };
}

async function fetchKickLatest(username) {
  const clean = username.trim().toLowerCase();
  const res = await fetchPublic(`https://kick.com/api/v2/channels/${encodeURIComponent(clean)}`, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
  }, 8000);
  if (!res.ok) {
    await res.body?.cancel?.().catch(() => {});
    return null;
  }
  const raw = await readTextLimited(res, 512 * 1024);
  const data = JSON.parse(raw);
  const live = data?.livestream;
  if (!live?.id) return { offline: true };

  return {
    itemId: String(live.id),
    url: `https://kick.com/${clean}`,
    title: live.session_title || `${clean} está en directo en Kick`,
    author: data?.user?.username || clean,
    platformLabel: "Kick",
    thumbnail: live.thumbnail?.url || data?.user?.profile_pic || null,
    isLive: true,
  };
}

async function fetchTwitchLatest(username) {
  const clean = username.trim().toLowerCase();
  const res = await fetchPublic(`https://decapi.me/twitch/uptime/${encodeURIComponent(clean)}`, {
    headers: { "User-Agent": "RedBot/1.0" },
  }, 8000);
  if (!res.ok) {
    await res.body?.cancel?.().catch(() => {});
    return null;
  }
  const uptimeText = (await readTextLimited(res, 16 * 1024)).trim();
  if (!uptimeText || /^(?:an )?error\b|not found|failed/i.test(uptimeText)) {
    return null;
  }
  if (/offline|not live/i.test(uptimeText)) {
    return { offline: true };
  }

  let title = `${clean} está en directo en Twitch`;
  const titleRes = await fetchPublic(`https://decapi.me/twitch/title/${encodeURIComponent(clean)}`, {}, 5000).catch(() => null);
  if (titleRes?.ok) {
    const t = (await readTextLimited(titleRes, 16 * 1024)).trim();
    if (t && !/^(?:an )?error\b|not found|failed/i.test(t)) title = t;
  } else if (titleRes) {
    await titleRes.body?.cancel?.().catch(() => {});
  }

  return {
    itemId: `${clean}:${new Date().toISOString().slice(0, 13)}`,
    url: `https://www.twitch.tv/${clean}`,
    title,
    author: clean,
    platformLabel: "Twitch",
    thumbnail: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${encodeURIComponent(clean)}-640x360.jpg`,
    isLive: true,
  };
}

async function fetchTikTokLatest(username) {
  const clean = username.trim().replace(/^@/, "");
  const res = await fetchPublic(`https://www.tiktok.com/@${encodeURIComponent(clean)}`, {
    headers: { "User-Agent": "Mozilla/5.0" },
  }, 8000);
  if (!res.ok) {
    await res.body?.cancel?.().catch(() => {});
    return null;
  }
  const html = await readTextLimited(res, 1024 * 1024);
  const vidMatch = html.match(/\/video\/(\d{15,25})/);
  if (!vidMatch?.[1]) return null;

  return {
    itemId: vidMatch[1],
    url: `https://www.tiktok.com/@${clean}/video/${vidMatch[1]}`,
    title: `Nuevo TikTok de @${clean}`,
    author: `@${clean}`,
    platformLabel: "TikTok",
    thumbnail: null,
  };
}

async function fetchLatestForFeed(platform, account) {
  switch (platform) {
    case "youtube": return fetchYouTubeLatest(account);
    case "reddit":  return fetchRedditLatest(account);
    case "kick":    return fetchKickLatest(account);
    case "twitch":  return fetchTwitchLatest(account);
    case "tiktok":  return fetchTikTokLatest(account);
    default:        return null;
  }
}

async function dispatchFeedNotification(client, feed, item) {
  const ch = client.channels?.cache?.get(feed.channelId) ?? await client.channels?.fetch?.(feed.channelId).catch(() => null);
  if (!ch?.isTextBased?.()) return false;

  const embed = new EmbedBuilder()
    .setColor(RED)
    .setAuthor({ name: `${item.platformLabel} · ${item.author}` })
    .setTitle(String(item.title || item.url).slice(0, 256))
    .setURL(item.url)
    .setTimestamp();
  if (item.thumbnail) embed.setImage(item.thumbnail);

  const safeAuthor = neutralizeMentions(item.author);
  const safeTitle = neutralizeMentions(item.title);
  const safePlatform = neutralizeMentions(item.platformLabel);

  const customMsg = (feed.customMessage || "")
    .replace(/\{author\}/g, () => safeAuthor)
    .replace(/\{url\}/g, () => item.url)
    .replace(/\{title\}/g, () => safeTitle)
    .replace(/\{platform\}/g, () => safePlatform);

  const content = (customMsg || item.url).slice(0, 2000);
  const sent = await ch.send({
    content,
    embeds: [embed],
    allowedMentions: { parse: ["roles", "everyone"] },
  }).catch(() => null);
  return Boolean(sent);
}

async function pollSocialFeeds(client) {
  if (isPollingFeeds || !client?.channels || mongoose.connection.readyState !== 1) return;
  isPollingFeeds = true;
  try {
    const feeds = await SocialFeed.find().lean().catch(() => []);
    if (!feeds.length) return;

    const cycleResults = new Map();

    for (const feed of feeds) {
      try {
        const cacheKey = `${feed.platform}:${String(feed.account || "").toLowerCase()}`;
        let latest;
        if (cycleResults.has(cacheKey)) {
          latest = cycleResults.get(cacheKey);
        } else {
          latest = await fetchLatestForFeed(feed.platform, feed.account).catch(() => null);
          cycleResults.set(cacheKey, latest);
        }
        if (!latest) continue;

        if (latest.offline) {
          if (feed.isLive) {
            await SocialFeed.updateOne({ _id: feed._id }, { $set: { isLive: false } }).catch(() => {});
          }
          continue;
        }

        const isStream = feed.platform === "twitch" || feed.platform === "kick";
        if (!feed.lastItemId && !isStream) {
          await SocialFeed.updateOne({ _id: feed._id }, { $set: { lastItemId: latest.itemId } }).catch(() => {});
          continue;
        }

        if (isStream) {
          if (feed.isLive) continue;
          await SocialFeed.updateOne({ _id: feed._id }, { $set: { isLive: true, lastItemId: latest.itemId } }).catch(() => {});
          await dispatchFeedNotification(client, feed, latest);
        } else if (latest.itemId !== feed.lastItemId) {
          await SocialFeed.updateOne({ _id: feed._id }, { $set: { lastItemId: latest.itemId } }).catch(() => {});
          await dispatchFeedNotification(client, feed, latest);
        }
      } catch (err) {
        log.debug("Error consultando feed social", { platform: feed.platform, account: feed.account, err: err?.message });
      }
    }
  } finally {
    isPollingFeeds = false;
  }
}

function startSocialFeedWorker(client) {
  if (feedsInterval) clearInterval(feedsInterval);
  feedsInterval = setInterval(() => {
    pollSocialFeeds(client).catch(() => {});
  }, 2 * 60_000);
  feedsInterval.unref();
}

function stopSocialFeedWorker() {
  if (feedsInterval) {
    clearInterval(feedsInterval);
    feedsInterval = null;
  }
}

module.exports = {
  PLATFORM_LIMITS,
  fetchLatestForFeed,
  dispatchFeedNotification,
  startSocialFeedWorker,
  stopSocialFeedWorker,
};
