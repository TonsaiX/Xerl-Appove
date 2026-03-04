const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events,
} = require("discord.js");

require("dotenv").config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const cooldown = new Map();
const pendingRequests = new Map();
const COOLDOWN_TIME = 60 * 1000;

const APPROVER_ROLES = process.env.APPROVER_ROLE_IDS
  ? process.env.APPROVER_ROLE_IDS.split(",").map(id => id.trim())
  : [];

client.once("ready", () => {
  console.log("✅ Bot Online");
});

client.on(Events.InteractionCreate, async (interaction) => {

  // ================= SLASH =================
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "request") {

      const member = interaction.member;

      if (!member.voice.channel ||
          member.voice.channel.id !== process.env.WAITING_VOICE_ID) {
        return interaction.reply({
          content: "❌ ต้องอยู่ในห้องรอก่อน",
          ephemeral: true,
        });
      }

      if (pendingRequests.has(member.id)) {
        return interaction.reply({
          content: "⏳ คุณมีคำขอรออยู่แล้ว",
          ephemeral: true,
        });
      }

      const lastUsed = cooldown.get(member.id);
      const now = Date.now();

      if (lastUsed && now - lastUsed < COOLDOWN_TIME) {
        const timeLeft = Math.ceil(
          (COOLDOWN_TIME - (now - lastUsed)) / 1000
        );
        return interaction.reply({
          content: `⏳ รออีก ${timeLeft} วินาที`,
          ephemeral: true,
        });
      }

      cooldown.set(member.id, now);

      const embed = new EmbedBuilder()
        .setTitle("🎤 ขอเข้าห้อง Voice")
        .setDescription("กดปุ่มเพื่อส่งคำขอ")
        .setColor("Blue");

      const button = new ButtonBuilder()
        .setCustomId("request_voice")
        .setLabel("📩 ขอเข้าห้อง")
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder().addComponents(button);

      await interaction.reply({
        embeds: [embed],
        components: [row],
        ephemeral: true,
      });
    }
  }

  // ================= BUTTON =================
  if (interaction.isButton()) {

    if (interaction.customId === "request_voice") {

      if (pendingRequests.has(interaction.user.id)) {
        return interaction.reply({
          content: "⏳ คุณมีคำขอรออยู่แล้ว",
          ephemeral: true,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("📢 มีคำขอเข้าห้อง")
        .setDescription(`ผู้ใช้: ${interaction.member}`)
        .setColor("Yellow");

      const approveBtn = new ButtonBuilder()
        .setCustomId(`approve_${interaction.user.id}`)
        .setLabel("✅ อนุญาต")
        .setStyle(ButtonStyle.Success);

      const denyBtn = new ButtonBuilder()
        .setCustomId(`deny_${interaction.user.id}`)
        .setLabel("❌ ปฏิเสธ")
        .setStyle(ButtonStyle.Danger);

      const row = new ActionRowBuilder().addComponents(
        approveBtn,
        denyBtn
      );

      const adminChannel =
        interaction.guild.channels.cache.find(
          c => c.name === "admin-requests"
        );

      const msg = await adminChannel.send({
        embeds: [embed],
        components: [row],
      });

      pendingRequests.set(interaction.user.id, msg.id);

      return interaction.reply({
        content: "✅ ส่งคำขอแล้ว",
        ephemeral: true,
      });
    }

    // ===== APPROVE / DENY =====
    if (
      interaction.customId.startsWith("approve_") ||
      interaction.customId.startsWith("deny_")
    ) {

      const hasPermission = APPROVER_ROLES.some(roleId =>
        interaction.member.roles.cache.has(roleId)
      );

      if (!hasPermission) {
        return interaction.reply({
          content: "❌ คุณไม่มีสิทธิ์อนุมัติ",
          ephemeral: true,
        });
      }

      const userId = interaction.customId.split("_")[1];
      const target =
        interaction.guild.members.cache.get(userId);

      const logChannel =
        interaction.guild.channels.cache.get(
          process.env.LOG_CHANNEL_ID
        );

      const time = `<t:${Math.floor(Date.now() / 1000)}:F>`;

      if (interaction.customId.startsWith("approve_")) {

        let targetChannelName = "ไม่พบ";

        if (target?.voice.channel) {
          await target.voice.setChannel(
            process.env.TARGET_VOICE_ID
          );
          targetChannelName =
            interaction.guild.channels.cache.get(
              process.env.TARGET_VOICE_ID
            )?.name || "ไม่พบ";
        }

        // ===== SEND LOG =====
        if (logChannel) {
          const logEmbed = new EmbedBuilder()
            .setTitle("✅ อนุมัติคำขอเข้า Voice")
            .setColor("Green")
            .addFields(
              { name: "ผู้ใช้", value: `<@${userId}>`, inline: true },
              { name: "อนุมัติโดย", value: `${interaction.member}`, inline: true },
              { name: "ย้ายไปห้อง", value: targetChannelName, inline: false },
              { name: "เวลา", value: time }
            );

          logChannel.send({ embeds: [logEmbed] });
        }

      } else {

        // ===== SEND DENY LOG =====
        if (logChannel) {
          const logEmbed = new EmbedBuilder()
            .setTitle("❌ ปฏิเสธคำขอเข้า Voice")
            .setColor("Red")
            .addFields(
              { name: "ผู้ใช้", value: `<@${userId}>`, inline: true },
              { name: "ปฏิเสธโดย", value: `${interaction.member}`, inline: true },
              { name: "เวลา", value: time }
            );

          logChannel.send({ embeds: [logEmbed] });
        }
      }

      pendingRequests.delete(userId);

      await interaction.message.delete();
    }
  }
});

client.login(process.env.TOKEN);