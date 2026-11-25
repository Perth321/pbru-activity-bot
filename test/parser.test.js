import test from "node:test";
import assert from "node:assert/strict";
import {
  parseHomepageEventsHtml,
  parseIcs,
  parseNewsHtml,
} from "../src/pbruParser.js";
import { buildActivityEmbed } from "../src/embedBuilder.js";

const SAMPLE_NEWS_HTML = `
<article class="row news-card">
  <small class="kicker">06/11/2026 10:23</small>
  <img src="/activity/new/image.php?key=img_3733.jpg" alt="behavior" class="news-card-image">
  <h3>📌 กิจกรรมแก้คะแนนความประพฤติ "สร้างจิตอาสา สร้างสำนึกรักในความดี" ประจำเดือน พฤศจิกายน จำนวน 10 คะแนน</h3>
  <div class="news-copy is-collapsed" id="news-copy-3">
    <p class="preline news-card-text">📣เปิดแล้วจร้าา
📌 กิจกรรมแก้คะแนนความประพฤติ "สร้างจิตอาสา สร้างสำนึกรักในความดี"
ประจำเดือน พฤศจิกายน จำนวน 10 คะแนน
⏰ ในวันที่ 11 พฤศจิกายน 2569 ณ กองพัฒนานักศึกษา อาคารสุเมธตันติเวชกุล
พร้อมกันเวลา 13.00 น.
⭕ รับจำนวน 20 คน เท่านั้น!!!
📝ลงชื่อเข้าร่วมกิจกรรมได้ที่
👉🏻 https://reg.pbru.ac.th/register 👈🏻
ตั้งแต่วันที่ 7 จนถึง 10 พฤศจิกายน 2569 เวลา 16.30 น.
***เงื่อนไข สมัครแล้วไม่เข้าร่วมกิจกรรมตัดคะแนนความประพฤติ 10 คะแนน***</p>
  </div>
  <a class="action news-external" href="https://www.facebook.com/share/p/1A4QvUt5dJ/">เปิดลิงก์ที่เกี่ยวข้อง ↗</a>
</article>

<article class="row news-card">
  <small class="kicker">02/11/2026 16:41</small>
  <img src="/activity/new/image.php?key=img_9f55.png" alt="parade" class="news-card-image">
  <h3>🎉 เปิดรับสมัคร นักศึกษาร่วมกิจกรรม พ.จ.น.ก.สัมพันธ์ ครั้งที่ 47 (ขบวนพาเหรด)</h3>
  <div class="news-copy is-collapsed" id="news-copy-5">
    <p class="preline news-card-text">🎉 เปิดรับสมัคร นักศึกษาร่วมกิจกรรม พ.จ.น.ก.สัมพันธ์ ครั้งที่ 47 (ขบวนพาเหรด)
📅 วันที่ 22 ธันวาคม 2569 (ไป-กลับ)
📍 ณ มหาวิทยาลัยราชภัฏนครปฐม
🎁 สิทธิประโยชน์ที่ได้รับ
🎓 กิจกรรมเลือก  5 เครดิต
🕐 ชั่วโมงจิตอาสา 20 ชม.
🕐 ชั่วโมงทุน 20 ชม.
💯คะแนนความประพฤติ 20 คะแนน
📌 รับสมัครจำนวนจำกัดเพียง 40 คนเท่านั้น!
📅 สมัครได้ตั้งแต่วันที่ 16–25 พฤศจิกายน 2569
📍 ที่ห้องงานพัฒนานักศึกษา กองพัฒนานักศึกษา ช่องหมายเลข 3</p>
  </div>
  <a class="action news-external" href="https://www.facebook.com/share/p/14yFXchS1Y4/">เปิดลิงก์ที่เกี่ยวข้อง ↗</a>
</article>

<article class="row news-card">
  <small class="kicker">19/11/2026 13:09</small>
  <img src="/activity/new/image.php?key=img_81c4.jpg" alt="venue-change" class="news-card-image">
  <h3>แจ้งเปลี่ยนสถานที่จัดกิจกรรม “สร้างภูมิคุ้มกันและป้องกันปัญหายาเสพติดในสถานศึกษา”</h3>
  <div class="news-copy is-collapsed" id="news-copy-2">
    <p class="preline news-card-text">📢 แจ้งเปลี่ยนสถานที่จัดกิจกรรม
📅 วันพุธที่ 25 พฤศจิกายน 2569
🕧 เวลา 12.30–16.30 น.
📍 ห้องใหม่ ห้องประชุมสันต์ธรรมบำรุง คณะวิทยาการจัดการ (ชั้น 1)
ห้องเดิม ห้องประชุมเอกศักดิ์บุตรลับ</p>
  </div>
  <a class="action news-external" href="https://www.facebook.com/share/p/1F1VnignJ8/">เปิดลิงก์ที่เกี่ยวข้อง ↗</a>
</article>
`;

test("parseNewsHtml extracts online registration, window, credits, and image URL", () => {
  const items = parseNewsHtml(SAMPLE_NEWS_HTML);
  assert.equal(items.length, 3);

  const onlinePost = items[0];
  assert.equal(onlinePost.kind, "news");
  assert.equal(onlinePost.registrationPlace, "https://reg.pbru.ac.th/register");
  assert.match(onlinePost.registrationWindow, /7 จนถึง 10 พฤศจิกายน 2569/);
  assert.match(onlinePost.credits, /10 คะแนน/);
  assert.equal(onlinePost.quota, "20 คน");
  assert.equal(
    onlinePost.imageUrl,
    "https://sdd.pbru.ac.th/activity/new/image.php?key=img_3733.jpg"
  );

  const paradePost = items[1];
  assert.match(paradePost.registrationPlace, /ห้องงานพัฒนานักศึกษา.*ช่องหมายเลข 3/);
  assert.match(paradePost.registrationWindow, /16–25 พฤศจิกายน 2569/);
  assert.match(paradePost.credits, /กิจกรรมเลือก 5 เครดิต/);
  assert.match(paradePost.credits, /ชั่วโมงจิตอาสา 20 ชม\./);
  assert.equal(paradePost.quota, "40 คน");

  const roomChangePost = items[2];
  assert.equal(roomChangePost.kind, "update");
  // Should NOT falsely mark คณะวิทยาการจัดการ (room venue) as faculty-only restriction
  assert.doesNotMatch(roomChangePost.facultyEligibility, /เฉพาะคณะวิทยาการจัดการ/);
});

test("parseHomepageEventsHtml parses hp-event cards", () => {
  const html = `
    <div class="hp-events">
      <article class="hp-event">
        <div class="hp-event-date"><strong>20</strong><small>ม.ค.</small></div>
        <div><h3>พัฒนาทักษะการช่วยชีวิตขั้นพื้นฐาน (CPR)</h3><p>20 ม.ค. 2570 · 00:00 น.</p></div>
      </article>
    </div>
  `;
  const events = parseHomepageEventsHtml(html);
  assert.equal(events.length, 1);
  assert.equal(events[0].title, "พัฒนาทักษะการช่วยชีวิตขั้นพื้นฐาน (CPR)");
  assert.equal(events[0].eventSchedule, "20 ม.ค. 2570 · 00:00 น.");
});

test("parseIcs unfolds lines, converts Bangkok times, and filters past events", () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:past-event@google.com",
    "DTSTART;VALUE=DATE:20241114",
    "DTEND;VALUE=DATE:20241115",
    "SUMMARY:กิจกรรมเก่า",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:future-event@google.com",
    "DTSTART:20261205T020000Z",
    "DTEND:20261205T090000Z",
    "SUMMARY:อบรมพัฒนาทักษะคอมพิวเตอร์",
    "DESCRIPTION:เปิดรับสมัครนักศึกษาทุกคณะ ลงทะเบียนได้ที่ https://reg.pbru.ac.th/register กิจกรรมเลือ",
    " ก 3 เครดิต",
    "LOCATION:อาคารคณะเทคโนโลยีสารสนเทศ\\, PBRU",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const now = new Date("2026-11-25T16:00:00Z");
  const events = parseIcs(ics, "ปฏิทินทดสอบ", now, 120);
  assert.equal(events.length, 1);
  assert.equal(events[0].title, "อบรมพัฒนาทักษะคอมพิวเตอร์");
  assert.equal(events[0].registrationPlace, "https://reg.pbru.ac.th/register");
  assert.match(events[0].credits, /กิจกรรมเลือก 3 เครดิต/);
  assert.match(events[0].facultyEligibility, /ทุกคณะ/);
  assert.match(events[0].eventSchedule, /5 ธ\.ค\. 2569 เวลา 09:00 น\./);
  assert.equal(events[0].venue, "อาคารคณะเทคโนโลยีสารสนเทศ, PBRU");
});

test("buildActivityEmbed constructs valid Discord embed with PBRU icon and all fields", () => {
  const [item] = parseNewsHtml(SAMPLE_NEWS_HTML);
  const embed = buildActivityEmbed(item, { isTest: true });
  assert.match(embed.title, /^🧪 \[ทดสอบแจ้งเตือน\]/);
  assert.ok(embed.author.icon_url.includes("pbru.ac.th"));
  assert.ok(embed.thumbnail.url.includes("pbru.ac.th"));
  assert.equal(embed.fields.length, 6);
  assert.equal(embed.image.url, "https://sdd.pbru.ac.th/activity/new/image.php?key=img_3733.jpg");
});
