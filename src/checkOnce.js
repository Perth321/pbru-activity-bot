import "dotenv/config";
import { getRuntimeConfig } from "./config.js";
import { checkAndNotify } from "./notifier.js";

async function main() {
  const { token, channelId, stateFile } = getRuntimeConfig();
  const forceLatest = process.argv.includes("--force-latest");

  if (!token || !channelId) {
    console.error("Missing DISCORD_BOT_TOKEN or DISCORD_CHANNEL_ID environment variable.");
    process.exit(1);
  }

  console.log(`[PBRU Notifier] Checking PBRU activities (forceLatest=${forceLatest})...`);
  const result = await checkAndNotify({
    token,
    channelId,
    stateFile,
    forceLatest,
  });

  console.log(
    `[PBRU Notifier] Done. Fetched=${result.totalFetched}, Sent=${result.sentCount}, Errors=${result.errors.length}`
  );
  if (result.sentTitles.length > 0) {
    console.log("[PBRU Notifier] Sent titles:", result.sentTitles);
  }
  if (result.errors.length > 0) {
    console.warn("[PBRU Notifier] Source warnings:", result.errors);
  }
}

main().catch((err) => {
  console.error("[PBRU Notifier] Fatal error:", err);
  process.exit(1);
});
