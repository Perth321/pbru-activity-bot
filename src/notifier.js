import { PBRU_URLS } from "./config.js";
import { buildActivityEmbed } from "./embedBuilder.js";
import { parseHomepageEventsHtml, parseIcs, parseNewsHtml } from "./pbruParser.js";
import { loadState, saveState } from "./stateStore.js";

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "PBRU-Activity-Discord-Bot/1.0 (+https://sdd.pbru.ac.th/activity/new/)",
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }
  return res.text();
}

/**
 * Fetches all public PBRU activity sources concurrently and returns deduplicated items.
 */
export async function fetchAllPbruActivities(now = new Date()) {
  const errors = [];

  const [newsRes, homeRes, ...icsResults] = await Promise.allSettled([
    fetchText(PBRU_URLS.news),
    fetchText(PBRU_URLS.home),
    ...PBRU_URLS.icalFeeds.map((feed) => fetchText(feed.url)),
  ]);

  const newsItems =
    newsRes.status === "fulfilled"
      ? parseNewsHtml(newsRes.value)
      : (errors.push(`news.php: ${newsRes.reason?.message}`), []);

  const homeItems =
    homeRes.status === "fulfilled"
      ? parseHomepageEventsHtml(homeRes.value)
      : (errors.push(`home: ${homeRes.reason?.message}`), []);

  const icsItems = [];
  icsResults.forEach((res, idx) => {
    const feed = PBRU_URLS.icalFeeds[idx];
    if (res.status === "fulfilled") {
      icsItems.push(...parseIcs(res.value, feed.name, now));
    } else {
      errors.push(`${feed.name}: ${res.reason?.message}`);
    }
  });

  // Deduplicate calendar events that already share exact title with news/home items
  const seenTitles = new Set();
  const combined = [];

  for (const item of [...newsItems, ...homeItems, ...icsItems]) {
    const normTitle = item.title.replace(/\s+/g, " ").trim();
    if (item.kind === "calendar" && seenTitles.has(normTitle)) {
      continue;
    }
    seenTitles.add(normTitle);
    combined.push(item);
  }

  return {
    newsItems,
    homeItems,
    icsItems,
    allItems: combined,
    errors,
  };
}

/**
 * Fetches an activity poster image directly so Discord hosts it reliably as an attachment.
 */
export async function fetchPosterAttachment(imageUrl) {
  if (!imageUrl) return null;
  try {
    const res = await fetch(imageUrl, {
      headers: {
        "User-Agent": "PBRU-Activity-Discord-Bot/1.0 (+https://sdd.pbru.ac.th/activity/new/)",
        Referer: PBRU_URLS.news,
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) return null;
    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length === 0 || buffer.length > 8 * 1024 * 1024) return null;
    return {
      filename: `poster.${ext}`,
      contentType,
      buffer,
    };
  } catch {
    return null;
  }
}

/**
 * Posts one Discord Embed (and optional poster attachment) via Discord REST API v10.
 */
export async function sendDiscordEmbed({ token, channelId, embed, content, attachment }) {
  const url = `https://discord.com/api/v10/channels/${channelId}/messages`;
  const payload = {
    content: content || undefined,
    embeds: [embed],
  };

  let res;
  if (attachment) {
    const form = new FormData();
    form.append("payload_json", JSON.stringify(payload));
    form.append(
      "files[0]",
      new Blob([attachment.buffer], { type: attachment.contentType }),
      attachment.filename
    );
    res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bot ${token}` },
      body: form,
      signal: AbortSignal.timeout(20000),
    });
  } else {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Discord API ${res.status}: ${body}`);
  }
  return res.json();
}

/**
 * Checks PBRU sources, sends notifications for newly discovered items, and persists state.
 */
export async function checkAndNotify({
  token,
  channelId,
  stateFile,
  forceLatest = false,
  initialSendLimit = 2,
}) {
  const state = await loadState(stateFile);
  const seen = new Set(state.notifiedIds);
  const fetched = await fetchAllPbruActivities();

  let itemsToNotify = [];

  if (forceLatest && fetched.allItems.length > 0) {
    itemsToNotify = [fetched.newsItems[0] || fetched.allItems[0]];
  } else if (!state.initialized) {
    // On first initialization, notify only the newest announcements + nearest upcoming event
    // and mark older historical entries as seen to avoid channel spam.
    const latestNews = fetched.newsItems.slice(0, initialSendLimit);
    const nearestCalendar = fetched.icsItems.slice(0, 1);
    itemsToNotify = [...latestNews, ...nearestCalendar];
  } else {
    itemsToNotify = fetched.allItems.filter((item) => !seen.has(item.id));
  }

  const sentItems = [];
  for (const item of itemsToNotify) {
    const attachment = await fetchPosterAttachment(item.imageUrl);
    const embed = buildActivityEmbed(item, {
      isTest: forceLatest,
      imageOverride: attachment ? `attachment://${attachment.filename}` : null,
    });
    await sendDiscordEmbed({
      token,
      channelId,
      embed,
      attachment,
      content:
        item.kind === "news"
          ? "📣 **พบประกาศกิจกรรมใหม่จาก มรภ.เพชรบุรี (PBRU)**"
          : undefined,
    });
    sentItems.push(item);
    seen.add(item.id);
  }

  // Mark all currently visible items as seen once initialized
  for (const item of fetched.allItems) {
    seen.add(item.id);
  }

  await saveState(stateFile, {
    initialized: true,
    lastCheckedAt: new Date().toISOString(),
    notifiedIds: [...seen],
  });

  return {
    totalFetched: fetched.allItems.length,
    sentCount: sentItems.length,
    sentTitles: sentItems.map((i) => i.title),
    errors: fetched.errors,
  };
}
