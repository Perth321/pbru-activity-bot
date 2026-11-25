export const PBRU_URLS = {
  base: "https://sdd.pbru.ac.th",
  news: "https://sdd.pbru.ac.th/activity/new/news.php",
  home: "https://sdd.pbru.ac.th/activity/new/",
  studentLogin: "https://sdd.pbru.ac.th/activity/new/student_login.php",
  studentDashboard: "https://sdd.pbru.ac.th/activity/new/student_dashboard.php",
  regPortal: "https://reg.pbru.ac.th/register",
  logo: "https://www.pbru.ac.th/pbru/wp-content/uploads/2019/09/cropped-apple-touch-icon-144-precomposed-192x192.png",
  saLogo: "https://sdd.pbru.ac.th/activity/new/assets/logo-pbru-sa.png",
  icalFeeds: [
    {
      name: "ปฏิทินกิจกรรมนักศึกษา PBRU",
      url: "https://calendar.google.com/calendar/ical/c_91tqtoos9bbbkp35fg27c6v5i4%40group.calendar.google.com/public/basic.ics",
    },
    {
      name: "ปฏิทินกิจกรรม กองพัฒนานักศึกษา PBRU",
      url: "https://calendar.google.com/calendar/ical/mail.pbru.ac.th_98tbfraoep13plf0kj9nj2ll54%40group.calendar.google.com/public/basic.ics",
    },
  ],
};

export function getRuntimeConfig() {
  const token = (process.env.DISCORD_BOT_TOKEN || "").trim();
  const channelId = (process.env.DISCORD_CHANNEL_ID || "").trim();
  const guildId = (process.env.DISCORD_GUILD_ID || "").trim();
  const pollIntervalSeconds = Math.max(
    30,
    Number.parseInt(process.env.POLL_INTERVAL_SECONDS || "120", 10) || 120
  );
  const stateFile = (process.env.STATE_FILE || "data/state.json").trim();

  return {
    token,
    channelId,
    guildId,
    pollIntervalSeconds,
    stateFile,
  };
}
