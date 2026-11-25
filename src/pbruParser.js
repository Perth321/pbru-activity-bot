import crypto from "node:crypto";
import * as cheerio from "cheerio";
import { PBRU_URLS } from "./config.js";

const THAI_MONTHS_SHORT = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

/**
 * Generates a short deterministic ID for deduplicating items across runs.
 */
function makeId(prefix, key) {
  const hash = crypto.createHash("sha256").update(key).digest("hex").slice(0, 12);
  return `${prefix}:${hash}`;
}

function cleanLine(text) {
  return (text || "").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
}

function stripLeadingEmojiAndBullets(line) {
  return cleanLine(
    line.replace(/^[\p{Extended_Pictographic}\uFE0F\u200D•\-*👉📝📍📅⏰🕧🎓🕐💯📌📣📢🎉🔎✅⭕]+/gu, "")
  );
}

/**
 * Extracts registration place / URL from Thai announcement body.
 */
export function extractRegistrationPlace(title, body) {
  const lines = body.split(/\r?\n/).map(cleanLine).filter(Boolean);
  const urls = [...body.matchAll(/https?:\/\/[^\s<>()]+/gi)].map((m) =>
    m[0].replace(/[.,;)\]]+$/, "")
  );
  const regUrls = urls.filter(
    (u) => /reg\.pbru|register|forms\.gle|docs\.google\.com\/forms|sdd\.pbru/i.test(u)
  );

  const inPersonLine = lines.find(
    (l) =>
      /(ลงชื่อ|สมัครได้ที่|สมัครได้ตั้งแต่วันที่|ที่ห้อง|ช่องหมายเลข|ยื่นใบสมัคร|ลงทะเบียนได้ที่)/i.test(l) &&
      !/(ตั้งแต่วันที่|สมัครได้ตั้งแต่วันที่)/i.test(l.replace(/ที่ห้อง.*/, ""))
  );

  const locationLineAfterReg = (() => {
    const regIdx = lines.findIndex((l) => /สมัครได้ตั้งแต่|ลงชื่อเข้าร่วมกิจกรรมได้ที่|ลงทะเบียนได้ที่/i.test(l));
    if (regIdx >= 0 && regIdx + 1 < lines.length) {
      const next = lines[regIdx + 1];
      if (/ที่ห้อง|ช่องหมายเลข|กองพัฒนา|อาคาร|https?:\/\//i.test(next)) {
        return stripLeadingEmojiAndBullets(next);
      }
    }
    return "";
  })();

  if (regUrls.length > 0) {
    return regUrls[0];
  }
  if (locationLineAfterReg) {
    return locationLineAfterReg;
  }
  if (inPersonLine && /ที่ห้อง|ช่องหมายเลข|อาคาร|กองพัฒนา|ออนไลน์|เว็บไซต์/i.test(inPersonLine)) {
    return stripLeadingEmojiAndBullets(inPersonLine);
  }
  if (/แจ้งเลื่อน|แจ้งเปลี่ยนสถานที่|แจ้งเปลี่ยนห้อง|ยกเลิก/i.test(`${title}\n${body}`)) {
    return `ประกาศอัปเดตกำหนดการ/สถานที่ (ตรวจสอบที่ [ระบบนักศึกษา PBRU](${PBRU_URLS.studentLogin}))`;
  }
  return `ตรวจสอบ/ลงทะเบียนที่ [ระบบนักศึกษา PBRU](${PBRU_URLS.studentLogin})`;
}

/**
 * Extracts registration start-to-end window from Thai announcement body.
 */
export function extractRegistrationWindow(title, body) {
  const lines = body.split(/\r?\n/).map(cleanLine).filter(Boolean);
  const matched = [];

  for (const line of lines) {
    if (
      /(ตั้งแต่วันที่|สมัครได้ตั้งแต่|เปิดรับสมัคร.{0,20}วัน|รับสมัคร.{0,20}ตั้งแต่|หมดเขต|ปิดรับสมัคร)/i.test(
        line
      )
    ) {
      matched.push(stripLeadingEmojiAndBullets(line));
    }
  }

  if (matched.length > 0) {
    return matched.join(" • ");
  }
  if (/แจ้งเลื่อน|แจ้งเปลี่ยนสถานที่|แจ้งเปลี่ยนห้อง/i.test(`${title}\n${body}`)) {
    return "ประกาศแจ้งเปลี่ยนแปลงสำหรับผู้สมัครไว้แล้ว (ไม่เปิดรับรอบใหม่ในโพสต์นี้)";
  }
  return "ไม่ระบุช่วงเวลาเปิด–ปิดในประกาศสาธารณะ";
}

/**
 * Extracts activity credits, volunteer/scholarship hours, or behavior points.
 */
export function extractCredits(title, body) {
  const combined = `${title}\n${body}`;
  const lines = combined.split(/\r?\n/).map(cleanLine).filter(Boolean);
  const found = new Set();

  const patterns = [
    /กิจกรรม(?:เลือก|บังคับ)?\s*\d+(?:\.\d+)?\s*เครดิต/gi,
    /ชั่วโมง(?:จิตอาสา|ทุน|กิจกรรม)\s*\d+(?:\.\d+)?\s*(?:ชม\.|ชั่วโมง)/gi,
    /คะแนนความประพฤติ\s*\d+(?:\.\d+)?\s*คะแนน/gi,
    /จำนวน\s*\d+(?:\.\d+)?\s*(?:คะแนน|เครดิต|หน่วยกิต|ชั่วโมง|ชม\.)/gi,
    /\d+(?:\.\d+)?\s*(?:เครดิต|หน่วยกิต)/gi,
  ];

  for (const line of lines) {
    // Skip penalty lines like "ตัดคะแนนความประพฤติ 10 คะแนน" when looking for earned credits
    if (/ตัดคะแนน|หักคะแนน/i.test(line)) {
      continue;
    }
    for (const pattern of patterns) {
      const matches = line.match(pattern);
      if (matches) {
        for (const m of matches) {
          found.add(cleanLine(m));
        }
      }
    }
  }

  if (found.size > 0) {
    return [...found].join(" • ");
  }
  return "ไม่ระบุในประกาศสาธารณะ (ตรวจสอบได้ในระบบนักศึกษา PBRU)";
}

/**
 * Extracts faculty / student eligibility while avoiding false positives from venue names.
 */
export function extractFacultyEligibility(body) {
  const lines = body.split(/\r?\n/).map(cleanLine).filter(Boolean);

  for (const line of lines) {
    // Ignore lines describing a physical room/building in a faculty
    if (/^(?:📍|ห้องใหม่|ห้องเดิม|สถานที่|ณ\s)/.test(line) && /ห้องประชุม|อาคาร|ชั้น\s*\d/.test(line)) {
      continue;
    }

    if (/(ทุกคณะ|ไม่จำกัดคณะ|นักศึกษาทุกชั้นปี|ทุกสาขาวิชา)/i.test(line)) {
      return stripLeadingEmojiAndBullets(line);
    }
    if (/(เฉพาะคณะ|เฉพาะนักศึกษาคณะ|สำหรับนักศึกษาคณะ|สาขาวิชา|ชั้นปีที่)/i.test(line)) {
      return stripLeadingEmojiAndBullets(line);
    }
  }

  if (/นักศึกษามหาวิทยาลัยราชภัฏเพชรบุรี|นักศึกษาร่วมกิจกรรม|นักศึกษาที่สนใจ/i.test(body)) {
    return "เปิดกว้างสำหรับนักศึกษา มรภ.เพชรบุรี (ไม่ระบุจำกัดคณะในประกาศ — โปรดตรวจสิทธิ์ในระบบ)";
  }
  return "ไม่ระบุเงื่อนไขคณะในประกาศ (ตรวจสอบสิทธิ์ในระบบนักศึกษา PBRU)";
}

/**
 * Extracts event schedule, venue, and quota details from announcement body.
 */
export function extractScheduleAndVenue(body) {
  const lines = body.split(/\r?\n/).map(cleanLine).filter(Boolean);
  const scheduleParts = [];
  const venueParts = [];
  let quota = "";

  for (const line of lines) {
    if (/(วันจัดใหม่|วันพุธที่|วันจันทร์ที่|วันอังคารที่|วันพฤหัสบดีที่|วันศุกร์ที่|วันเสาร์ที่|วันอาทิตย์ที่|ในวันที่|📅|⏰|🕧)/.test(line)) {
      if (!/สมัครได้ตั้งแต่|ตั้งแต่วันที่/.test(line)) {
        scheduleParts.push(stripLeadingEmojiAndBullets(line));
      }
    }
    if (/^(?:📍|ห้องใหม่|สถานที่|ณ\s)/.test(line) && !/ที่ห้องงานพัฒนานักศึกษา.*ช่องหมายเลข/.test(line)) {
      venueParts.push(stripLeadingEmojiAndBullets(line));
    }
    const quotaMatch = line.match(/รับ(?:สมัคร)?(?:จำนวน)?(?:จำกัด)?(?:เพียง)?\s*(\d+\s*คน)/i);
    if (quotaMatch) {
      quota = quotaMatch[1];
    }
  }

  return {
    eventSchedule: scheduleParts.join(" • ") || "ดูรายละเอียดในประกาศ",
    venue: venueParts.join(" • "),
    quota,
  };
}

/**
 * Parses PBRU news.php HTML into structured activity items.
 */
export function parseNewsHtml(html) {
  const $ = cheerio.load(html);
  const items = [];

  $("article.news-card").each((_, el) => {
    const card = $(el);
    const title = cleanLine(card.find("h3").first().text());
    const postedAt = cleanLine(card.find("small.kicker").first().text());
    const imgPath = card.find("img.news-card-image").attr("src") || "";
    const imageUrl = imgPath ? new URL(imgPath, PBRU_URLS.base).toString() : "";
    const externalUrl = card.find("a.news-external").attr("href") || PBRU_URLS.news;
    const body = card.find(".news-card-text").text().trim();

    if (!title) return;

    const { eventSchedule, venue, quota } = extractScheduleAndVenue(body);
    const isUpdateNotice = /แจ้งเลื่อน|แจ้งเปลี่ยน|ยกเลิก/i.test(title);

    items.push({
      id: makeId("news", `${postedAt}|${title}`),
      kind: isUpdateNotice ? "update" : "news",
      sourceName: "ข่าวกิจกรรม กองพัฒนานักศึกษา PBRU",
      sourceUrl: PBRU_URLS.news,
      title,
      postedAt,
      body,
      imageUrl,
      externalUrl,
      registrationPlace: extractRegistrationPlace(title, body),
      registrationWindow: extractRegistrationWindow(title, body),
      credits: extractCredits(title, body),
      facultyEligibility: extractFacultyEligibility(body),
      eventSchedule,
      venue,
      quota,
    });
  });

  return items;
}

/**
 * Parses PBRU activity homepage upcoming events (<article class="hp-event">).
 */
export function parseHomepageEventsHtml(html) {
  const $ = cheerio.load(html);
  const items = [];

  $("article.hp-event").each((_, el) => {
    const card = $(el);
    const title = cleanLine(card.find("h3").first().text());
    const dateLine = cleanLine(card.find("p").first().text());
    if (!title) return;

    items.push({
      id: makeId("home", `${dateLine}|${title}`),
      kind: "calendar",
      sourceName: "กิจกรรมใกล้เข้ามาแล้ว (หน้าแรก PBRU)",
      sourceUrl: PBRU_URLS.home,
      title,
      postedAt: dateLine,
      body: dateLine,
      imageUrl: "",
      externalUrl: PBRU_URLS.home,
      registrationPlace: `ตรวจสอบ/ลงทะเบียนที่ [ระบบนักศึกษา PBRU](${PBRU_URLS.studentLogin})`,
      registrationWindow: "ไม่ระบุช่วงรับสมัครในปฏิทินหน้าแรก",
      credits: "ไม่ระบุในปฏิทินสาธารณะ (ตรวจสอบได้ในระบบนักศึกษา PBRU)",
      facultyEligibility: "ไม่ระบุเงื่อนไขคณะในปฏิทิน (ตรวจสอบสิทธิ์ในระบบนักศึกษา PBRU)",
      eventSchedule: dateLine || "ดูรายละเอียดในเว็บไซต์",
      venue: "",
      quota: "",
    });
  });

  return items;
}

function unescapeIcsValue(val) {
  return (val || "")
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function stripHtmlTags(raw) {
  if (!raw) return "";
  const $ = cheerio.load(`<div>${raw}</div>`);
  return cleanLine($("div").text());
}

/**
 * Converts an iCal DTSTART/DTEND string into a Bangkok Date and Thai display text.
 */
export function parseIcsDate(rawVal, isExclusiveEnd = false) {
  const clean = (rawVal || "").trim();
  const dateOnly = clean.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) {
    const y = Number(dateOnly[1]);
    const m = Number(dateOnly[2]) - 1;
    const d = Number(dateOnly[3]);
    const dt = new Date(Date.UTC(y, m, d, 0, 0, 0));
    if (isExclusiveEnd) {
      dt.setUTCDate(dt.getUTCDate() - 1);
    }
    const thaiYear = dt.getUTCFullYear() + 543;
    return {
      date: dt,
      hasTime: false,
      label: `${dt.getUTCDate()} ${THAI_MONTHS_SHORT[dt.getUTCMonth()]} ${thaiYear}`,
    };
  }

  const utcMatch = clean.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (utcMatch) {
    const dt = new Date(
      Date.UTC(
        Number(utcMatch[1]),
        Number(utcMatch[2]) - 1,
        Number(utcMatch[3]),
        Number(utcMatch[4]),
        Number(utcMatch[5]),
        Number(utcMatch[6])
      )
    );
    // Shift UTC -> Asia/Bangkok (UTC+7)
    const bkk = new Date(dt.getTime() + 7 * 60 * 60 * 1000);
    const hh = String(bkk.getUTCHours()).padStart(2, "0");
    const mm = String(bkk.getUTCMinutes()).padStart(2, "0");
    return {
      date: dt,
      hasTime: true,
      label: `${bkk.getUTCDate()} ${THAI_MONTHS_SHORT[bkk.getUTCMonth()]} ${bkk.getUTCFullYear() + 543} เวลา ${hh}:${mm} น.`,
    };
  }

  const localMatch = clean.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (localMatch) {
    const y = Number(localMatch[1]);
    const m = Number(localMatch[2]) - 1;
    const d = Number(localMatch[3]);
    const dt = new Date(Date.UTC(y, m, d, Number(localMatch[4]) - 7, Number(localMatch[5]), Number(localMatch[6])));
    return {
      date: dt,
      hasTime: true,
      label: `${d} ${THAI_MONTHS_SHORT[m]} ${y + 543} เวลา ${localMatch[4]}:${localMatch[5]} น.`,
    };
  }

  return null;
}

/**
 * Parses an iCal (.ics) feed into upcoming PBRU activity events.
 */
export function parseIcs(icsText, calendarName, now = new Date(), maxDaysAhead = 120) {
  const unfolded = (icsText || "").replace(/\r?\n[ \t]/g, "");
  const lines = unfolded.split(/\r?\n/);

  const events = [];
  let current = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (current) events.push(current);
      current = null;
      continue;
    }
    if (!current) continue;

    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const rawKey = line.slice(0, colonIdx);
    const propName = rawKey.split(";")[0].toUpperCase();
    const value = line.slice(colonIdx + 1);
    current[propName] = value;
  }

  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const horizonUtc = new Date(todayUtc.getTime() + maxDaysAhead * 86400000);

  const upcoming = [];
  for (const ev of events) {
    const title = cleanLine(unescapeIcsValue(ev.SUMMARY || ""));
    if (!title) continue;

    const start = parseIcsDate(ev.DTSTART, false);
    const end = parseIcsDate(ev.DTEND || ev.DTSTART, !String(ev.DTEND || "").includes("T"));
    if (!start || !end) continue;

    if (end.date < todayUtc || start.date > horizonUtc) {
      continue;
    }

    const description = stripHtmlTags(unescapeIcsValue(ev.DESCRIPTION || ""));
    const location = cleanLine(unescapeIcsValue(ev.LOCATION || ""));
    const schedule =
      start.label === end.label ? start.label : `${start.label} – ${end.label}`;

    upcoming.push({
      id: makeId("ics", ev.UID || `${calendarName}|${title}|${ev.DTSTART}`),
      kind: "calendar",
      sourceName: calendarName,
      sourceUrl: PBRU_URLS.home,
      title,
      postedAt: schedule,
      startTimeMs: start.date.getTime(),
      body: description || schedule,
      imageUrl: "",
      externalUrl: PBRU_URLS.home,
      registrationPlace: extractRegistrationPlace(title, description || ""),
      registrationWindow: description
        ? extractRegistrationWindow(title, description)
        : "ไม่ระบุช่วงรับสมัครในปฏิทิน (ตรวจสอบในระบบนักศึกษา PBRU)",
      credits: description
        ? extractCredits(title, description)
        : "ไม่ระบุในปฏิทินสาธารณะ (ตรวจสอบได้ในระบบนักศึกษา PBRU)",
      facultyEligibility: description
        ? extractFacultyEligibility(description)
        : "ไม่ระบุเงื่อนไขคณะในปฏิทิน (ตรวจสอบสิทธิ์ในระบบนักศึกษา PBRU)",
      eventSchedule: schedule,
      venue: location,
      quota: "",
    });
  }

  upcoming.sort((a, b) => a.startTimeMs - b.startTimeMs);
  return upcoming;
}
