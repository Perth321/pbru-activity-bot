import "dotenv/config";
import {
  ActivityType,
  Client,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import { getRuntimeConfig, PBRU_URLS } from "./config.js";
import { buildActivityEmbed } from "./embedBuilder.js";
import { checkAndNotify, fetchAllPbruActivities, fetchPosterAttachment } from "./notifier.js";
import { loadState } from "./stateStore.js";

const config = getRuntimeConfig();
if (!config.token || !config.channelId) {
  console.error("Missing DISCORD_BOT_TOKEN or DISCORD_CHANNEL_ID environment variable.");
  process.exit(1);
}

const startedAt = Date.now();
let isPolling = false;
let lastPollSummary = { at: null, fetched: 0, sent: 0, errors: [] };

const commands = [
  new SlashCommandBuilder()
    .setName("activities")
    .setDescription("แสดงข่าวประกาศและกิจกรรมล่าสุดของ มรภ.เพชรบุรี (PBRU)"),
  new SlashCommandBuilder()
    .setName("check")
    .setDescription("สั่งเช็กกิจกรรมใหม่จากเว็บ มรภ.เพชรบุรี ทันที"),
  new SlashCommandBuilder()
    .setName("status")
    .setDescription("ตรวจสอบสถานะการทำงานของบอทแจ้งเตือนกิจกรรม PBRU"),
].map((cmd) => cmd.toJSON());

async function registerCommands(client) {
  const rest = new REST({ version: "10" }).setToken(config.token);
  const appId = client.user.id;
  if (config.guildId) {
    await rest.put(Routes.applicationGuildCommands(appId, config.guildId), {
      body: commands,
    });
    console.log(`[Bot] Registered guild slash commands for guild ${config.guildId}`);
  } else {
    await rest.put(Routes.applicationCommands(appId), { body: commands });
    console.log("[Bot] Registered global slash commands");
  }
}

async function runPoll({ forceLatest = false } = {}) {
  if (isPolling) {
    return null;
  }
  isPolling = true;
  try {
    const res = await checkAndNotify({
      token: config.token,
      channelId: config.channelId,
      stateFile: config.stateFile,
      forceLatest,
    });
    lastPollSummary = {
      at: new Date().toISOString(),
      fetched: res.totalFetched,
      sent: res.sentCount,
      errors: res.errors,
    };
    console.log(
      `[Poll] fetched=${res.totalFetched}, sent=${res.sentCount}, errors=${res.errors.length}`
    );
    return res;
  } finally {
    isPolling = false;
  }
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`[Bot] Logged in as ${readyClient.user.tag}`);
  readyClient.user.setPresence({
    status: "online",
    activities: [
      {
        name: "กิจกรรม มรภ.เพชรบุรี (PBRU)",
        type: ActivityType.Watching,
      },
    ],
  });

  try {
    await registerCommands(readyClient);
  } catch (err) {
    console.error("[Bot] Failed to register slash commands:", err);
  }

  try {
    await runPoll();
  } catch (err) {
    console.error("[Poll] Initial poll error:", err);
  }

  const interval = setInterval(async () => {
    try {
      await runPoll();
    } catch (err) {
      console.error("[Poll] Scheduled poll error:", err);
    }
  }, config.pollIntervalSeconds * 1000);

  const shutdown = () => {
    clearInterval(interval);
    client.destroy();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "activities") {
    await interaction.deferReply();
    try {
      const fetched = await fetchAllPbruActivities();
      const topNews = fetched.newsItems.slice(0, 2);
      const topCal = fetched.icsItems.slice(0, 1);
      const showcase = [...topNews, ...topCal];
      if (showcase.length === 0) {
        await interaction.editReply("ไม่พบรายการกิจกรรมจากหน้าเว็บสาธารณะในขณะนี้");
        return;
      }
      const embeds = [];
      const files = [];
      for (let i = 0; i < showcase.length; i += 1) {
        const item = showcase[i];
        const att = await fetchPosterAttachment(item.imageUrl);
        if (att) {
          const uniqueName = `poster_${i}_${att.filename}`;
          files.push({ attachment: att.buffer, name: uniqueName });
          embeds.push(buildActivityEmbed(item, { imageOverride: `attachment://${uniqueName}` }));
        } else {
          embeds.push(buildActivityEmbed(item, { imageOverride: null }));
        }
      }
      await interaction.editReply({
        content: `📋 **กิจกรรมและข่าวสารล่าสุดของ มรภ.เพชรบุรี (PBRU)** (พบทั้งหมด ${fetched.allItems.length} รายการ):`,
        embeds,
        files,
      });
    } catch (err) {
      await interaction.editReply(`❌ ดึงข้อมูลจาก PBRU ไม่สำเร็จ: ${err.message}`);
    }
    return;
  }

  if (interaction.commandName === "check") {
    await interaction.deferReply();
    try {
      const res = await runPoll();
      if (!res) {
        await interaction.editReply("⏳ บอทกำลังตรวจสอบข้อมูลอยู่ กรุณารอสักครู่แล้วลองใหม่ครับ");
        return;
      }
      await interaction.editReply(
        `✅ ตรวจสอบเว็บ มรภ.เพชรบุรี เรียบร้อยแล้ว!\n• ดึงข้อมูลทั้งหมด: **${res.totalFetched}** รายการ\n• ส่งแจ้งเตือนใหม่เข้าห้อง <#${config.channelId}>: **${res.sentCount}** รายการ`
      );
    } catch (err) {
      await interaction.editReply(`❌ เกิดข้อผิดพลาดขณะตรวจสอบ: ${err.message}`);
    }
    return;
  }

  if (interaction.commandName === "status") {
    const state = await loadState(config.stateFile);
    const uptimeSec = Math.floor((Date.now() - startedAt) / 1000);
    const mins = Math.floor(uptimeSec / 60);
    const secs = uptimeSec % 60;
    await interaction.reply({
      embeds: [
        {
          title: "🟢 สถานะบอทแจ้งเตือนกิจกรรม มรภ.เพชรบุรี (PBRU)",
          color: 0x006837,
          thumbnail: { url: PBRU_URLS.logo },
          fields: [
            { name: "ความถี่ในการเช็ก", value: `ทุก ${config.pollIntervalSeconds} วินาที`, inline: true },
            { name: "Uptime รอบนี้", value: `${mins} นาที ${secs} วินาที`, inline: true },
            { name: "จำนวนรายการที่จำไว้", value: `${state.notifiedIds.length} รายการ`, inline: true },
            { name: "เช็กครั้งล่าสุด", value: lastPollSummary.at || state.lastCheckedAt || "-", inline: false },
            {
              name: "แหล่งข้อมูลที่ติดตาม",
              value: `• ${PBRU_URLS.news}\n• ${PBRU_URLS.home}\n• Google Calendar กองพัฒนานักศึกษา PBRU (2 ปฏิทิน)`,
              inline: false,
            },
          ],
          timestamp: new Date().toISOString(),
        },
      ],
    });
  }
});

client.login(config.token);
