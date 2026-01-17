/**
 * Test Telegram notifications
 *
 * Setup:
 * 1. Create a bot via @BotFather in Telegram, get the token
 * 2. Send any message to your bot
 * 3. Get your chat_id: https://api.telegram.org/bot<TOKEN>/getUpdates
 * 4. Add to .env.local:
 *    TELEGRAM_BOT_TOKEN=your_bot_token
 *    TELEGRAM_CHAT_ID=your_chat_id
 *
 * npx tsx bots/predictfun-btc15/test-telegram.ts
 */

import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendTelegram(message: string): Promise<boolean> {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.log("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in .env.local");
    return false;
  }

  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: message,
        parse_mode: "HTML",
      }),
    });

    const data = await res.json() as { ok: boolean; description?: string };

    if (data.ok) {
      console.log("Message sent successfully!");
      return true;
    } else {
      console.log(`Telegram error: ${data.description}`);
      return false;
    }
  } catch (error) {
    console.log(`Error: ${error}`);
    return false;
  }
}

async function main() {
  console.log("Testing Telegram notification...\n");

  if (!BOT_TOKEN) {
    console.log("TELEGRAM_BOT_TOKEN not set in .env.local");
    console.log("\nSetup instructions:");
    console.log("1. Open Telegram and message @BotFather");
    console.log("2. Send /newbot and follow instructions");
    console.log("3. Copy the token and add to .env.local:");
    console.log("   TELEGRAM_BOT_TOKEN=your_token_here");
    return;
  }

  if (!CHAT_ID) {
    console.log("TELEGRAM_CHAT_ID not set in .env.local");
    console.log("\nTo get your chat ID:");
    console.log("1. Send any message to your bot in Telegram");
    console.log(`2. Open: https://api.telegram.org/bot${BOT_TOKEN}/getUpdates`);
    console.log("3. Find your chat.id in the response");
    console.log("4. Add to .env.local:");
    console.log("   TELEGRAM_CHAT_ID=your_chat_id");
    return;
  }

  const success = await sendTelegram("Привіт! 👋 Telegram notifications working.");

  if (success) {
    console.log("\n✅ Check your Telegram!");
  }
}

main().catch(console.error);
