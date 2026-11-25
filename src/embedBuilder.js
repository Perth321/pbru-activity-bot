import { PBRU_URLS } from "./config.js";

const COLOR_BY_KIND = {
  news: 0x006837, // PBRU green
  update: 0xf59e0b, // Amber for schedule/room change notices
  calendar: 0x2563eb, // Blue for calendar events
};

function truncate(str, max) {
  if (!str) return "";
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

/**
 * Builds a Discord Embed object for an activity item.
 * Compatible with both Discord REST API v10 and discord.js messages.
 */
export function buildActivityEmbed(item, { isTest = false, imageOverride } = {}) {
  const prefix = isTest ? "🧪 [ทดสอบแจ้งเตือน] " : "";
  const descriptionParts = [];

  if (item.postedAt) {
    descriptionParts.push(`🕒 **วันที่ประกาศ/กำหนดการ:** ${item.postedAt}`);
  }
  if (item.quota) {
    descriptionParts.push(`👥 **จำนวนที่รับ:** ${item.quota}`);
  }

  const fields = [
    {
      name: "📍 ลงทะเบียนได้ที่ไหน",
      value: truncate(item.registrationPlace || PBRU_URLS.studentLogin, 1024),
      inline: false,
    },
    {
      name: "🗓️ เริ่ม–สิ้นสุดการลงทะเบียน",
      value: truncate(item.registrationWindow || "ไม่ระบุในประกาศ", 1024),
      inline: false,
    },
    {
      name: "🎓 เครดิต / ชั่วโมง / คะแนน",
      value: truncate(item.credits || "ไม่ระบุในประกาศสาธารณะ", 1024),
      inline: true,
    },
    {
      name: "🏫 ลงได้ทุกคณะไหม",
      value: truncate(item.facultyEligibility || "ตรวจสอบในระบบ PBRU", 1024),
      inline: true,
    },
    {
      name: "⏰ วัน-เวลา / สถานที่จัดกิจกรรม",
      value: truncate(
        item.venue ? `${item.eventSchedule}\n📍 ${item.venue}` : item.eventSchedule,
        1024
      ),
      inline: false,
    },
  ];

  const links = [`[เว็บไซต์กิจกรรม PBRU](${item.sourceUrl})`];
  if (item.externalUrl && item.externalUrl !== item.sourceUrl) {
    links.push(`[โพสต์/ลิงก์ต้นฉบับ](${item.externalUrl})`);
  }
  links.push(`[ระบบนักศึกษา PBRU](${PBRU_URLS.studentLogin})`);

  fields.push({
    name: "🔗 ลิงก์ที่เกี่ยวข้อง",
    value: links.join(" • "),
    inline: false,
  });

  const embed = {
    title: truncate(`${prefix}${item.title}`, 256),
    url: item.externalUrl || item.sourceUrl,
    color: COLOR_BY_KIND[item.kind] ?? COLOR_BY_KIND.news,
    author: {
      name: "มหาวิทยาลัยราชภัฏเพชรบุรี (PBRU Activity)",
      url: PBRU_URLS.home,
      icon_url: PBRU_URLS.logo,
    },
    thumbnail: {
      url: PBRU_URLS.logo,
    },
    description: truncate(descriptionParts.join("\n"), 4096) || undefined,
    fields,
    footer: {
      text: `${item.sourceName} • มรภ.เพชรบุรี`,
      icon_url: PBRU_URLS.logo,
    },
    timestamp: new Date().toISOString(),
  };

  const resolvedImage = imageOverride === undefined ? item.imageUrl : imageOverride;
  if (resolvedImage) {
    embed.image = { url: resolvedImage };
  }

  return embed;
}
