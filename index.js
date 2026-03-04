const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require("discord.js");

require("dotenv").config();

/* ================= CLIENT ================= */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

/* ================= CONFIG ================= */

const pendingRequests = new Map();

const APPROVER_ROLES = process.env.APPROVER_ROLE_IDS
  ? process.env.APPROVER_ROLE_IDS.split(",").map(id => id.trim())
  : [];

/* ================= AUTO REGISTER ================= */

async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName("setuprequest")
      .setDescription("สร้างข้อความขอเข้าห้อง Voice")
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .toJSON(),
  ];

  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(
      process.env.CLIENT_ID,
      process.env.GUILD_ID
    ),
    { body: commands }
  );

  console.log("✅ Slash commands registered");
}

/* ================= READY ================= */

client.once("ready", async () => {
  console.log("✅ Bot Online");
  await registerCommands();
});

/* ================= INTERACTION ================= */

client.on(Events.InteractionCreate, async (interaction) => {

  /* ===== SLASH COMMAND ===== */
  if (interaction.isChatInputCommand()) {

    if (interaction.commandName === "setuprequest") {

      const embed = new EmbedBuilder()
        .setTitle("🎤 ระบบขอเข้าห้อง Live")
        .setDescription("กดปุ่มด้านล่างเพื่อส่งคำขอเข้า Live Stream")
        .setColor("Blue");

      const button = new ButtonBuilder()
        .setCustomId("request_voice")
        .setLabel("📩 ขอเข้าห้อง")
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder().addComponents(button);

      await interaction.channel.send({
        embeds: [embed],
        components: [row],
      });

      return interaction.reply({
        content: "✅ สร้างระบบขอเข้าเรียบร้อย",
        ephemeral: true,
      });
    }
  }

  /* ===== BUTTON ===== */
  if (interaction.isButton()) {

    if (interaction.customId === "request_voice") {

      const member = interaction.member;

      if (
        !member.voice.channel ||
        member.voice.channel.id !== process.env.WAITING_VOICE_ID
      ) {
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

      const adminChannel = interaction.guild.channels.cache.get(
        process.env.REQUEST_CHANNEL_ID
      );

      if (!adminChannel) {
        return interaction.reply({
          content: "❌ ไม่พบห้องคำขอ",
          ephemeral: true,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("📢 มีคำขอเข้าห้อง")
        .setDescription(`ผู้ใช้: <@${interaction.user.id}>`)
        .setColor("Yellow");

      const approveBtn = new ButtonBuilder()
        .setCustomId(`approve_${interaction.user.id}`)
        .setLabel("✅ อนุญาต")
        .setStyle(ButtonStyle.Success);

      const denyBtn = new ButtonBuilder()
        .setCustomId(`deny_${interaction.user.id}`)
        .setLabel("❌ ปฏิเสธ")
        .setStyle(ButtonStyle.Danger);

      const row = new ActionRowBuilder().addComponents(approveBtn, denyBtn);

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

    /* ===== APPROVE / DENY ===== */
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
      const target = interaction.guild.members.cache.get(userId);

      if (interaction.customId.startsWith("approve_")) {
        if (target?.voice.channel) {
          await target.voice.setChannel(process.env.TARGET_VOICE_ID);
        }
      }

      pendingRequests.delete(userId);
      await interaction.message.delete();
    }
  }
});

client.login(process.env.TOKEN);