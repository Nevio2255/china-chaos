import { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import crypto from 'crypto';
import { getStats, top } from './db.js';

const gold = 0xd4a017;
let bot = null;

const commands = [
  new SlashCommandBuilder().setName('china').setDescription('🐉 Startet CHINA CHAOS'),
  new SlashCommandBuilder().setName('stats').setDescription('Deine Statistik'),
  new SlashCommandBuilder().setName('leaderboard').setDescription('Globale Bestenliste'),
].map(c => c.toJSON());

function isUnknownInteraction(error) {
  return error?.code === 10062 || error?.rawError?.code === 10062;
}

async function safeReply(interaction, payload) {
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload);
    } else {
      await interaction.reply(payload);
    }
    return true;
  } catch (error) {
    if (isUnknownInteraction(error)) {
      console.warn('⚠️ Discord Interaction war bereits abgelaufen (10062). Server läuft weiter.');
    } else {
      console.error('Discord Antwort:', error?.message || error);
    }
    return false;
  }
}

export async function announceRecord(r) {
  try {
    const id = process.env.DISCORD_RECORD_CHANNEL_ID;
    if (!bot || !id) return;
    const ch = await bot.channels.fetch(id);
    if (!ch?.isTextBased()) return;
    await ch.send({
      embeds: [
        new EmbedBuilder()
          .setColor(gold)
          .setTitle('🏆 NEUER CHINA-CHAOS-REKORD! 🐉')
          .setDescription(`**${r.name}** hat einen neuen **${r.difficulty.toUpperCase()}**-Rekord!`)
          .addFields(
            { name: 'Alter Rekord', value: `${r.old} Punkte`, inline: true },
            { name: 'Neuer Rekord', value: `${r.score} Punkte`, inline: true },
          )
          .setTimestamp(),
      ],
    });
  } catch (e) {
    console.error('Rekord-Nachricht:', e?.message || e);
  }
}

async function handleChina(interaction) {
  if (process.env.DISCORD_GUILD_ID && interaction.guildId !== process.env.DISCORD_GUILD_ID) {
    await safeReply(interaction, {
      content: '❌ China Chaos ist auf diesem Server nicht verfügbar.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (process.env.DISCORD_CHANNEL_ID && interaction.channelId !== process.env.DISCORD_CHANNEL_ID) {
    await safeReply(interaction, {
      content: '❌ China Chaos kann nur im dafür vorgesehenen Channel gestartet werden.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const rawGameUrl = (process.env.GAME_URL || '').trim();
  let gameUrl;
  try {
    gameUrl = new URL(rawGameUrl);
    if (!['http:', 'https:'].includes(gameUrl.protocol)) throw new Error('invalid protocol');
  } catch {
    await safeReply(interaction, {
      content: '⚠️ GAME_URL fehlt oder ist ungültig. Trage in der `.env` deine aktuelle HTTPS-Spieladresse ein.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Signed short-lived browser login: lets the game know which Discord user opened /china
  // without exposing the bot token or trusting a plain Discord ID from the browser.
  const authSecret = process.env.IP_HASH_SECRET || process.env.DISCORD_CLIENT_SECRET;
  if (authSecret) {
    const avatar = interaction.user.displayAvatarURL({ extension: 'png', size: 128 });
    const payload = Buffer.from(JSON.stringify({
      id: interaction.user.id,
      name: interaction.user.globalName || interaction.user.username,
      avatar,
      exp: Date.now() + 10 * 60 * 1000,
    })).toString('base64url');
    const sig = crypto.createHmac('sha256', authSecret).update(payload).digest('base64url');
    gameUrl.searchParams.set('auth', `${payload}.${sig}`);
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('🐉 China Chaos öffnen')
      .setStyle(ButtonStyle.Link)
      .setURL(gameUrl.toString()),
  );

  await safeReply(interaction, {
    content: '🐉 **China Chaos ist bereit!**\nKlicke auf den Button, um das Spiel im Browser zu öffnen.',
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
  console.log(`🔗 /china Browser-Link an ${interaction.user.tag} gesendet`);
}
export async function startBot() {
  if (!process.env.DISCORD_TOKEN) {
    console.warn('⚠️ DISCORD_TOKEN fehlt – Bot aus, lokales Game bleibt aktiv.');
    return null;
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  bot = client;

  client.on('error', error => {
    console.error('Discord Client:', error?.message || error);
  });

  client.on('warn', warning => {
    console.warn('Discord Warnung:', warning);
  });

  client.once('ready', async () => {
    console.log(`🤖 Bot online als ${client.user.tag}`);
    try {
      const guildId = process.env.DISCORD_GUILD_ID;
      if (guildId) {
        const guild = await client.guilds.fetch(guildId);
        await guild.commands.set(commands);
        console.log(`✅ Slash Commands für Server ${guildId} synchronisiert`);
      } else {
        await client.application.commands.set(commands);
        console.log('✅ Globale Slash Commands synchronisiert');
      }
    } catch (e) {
      console.error('Commands:', e?.message || e);
    }
  });

  client.on('interactionCreate', interaction => {
    // Den Handler bewusst komplett auffangen, damit KEIN Discord-Fehler den
    // Game-Server durch eine unbehandelte Promise-Rejection beendet.
    void (async () => {
      if (!interaction.isChatInputCommand()) return;

      if (interaction.commandName === 'china') {
        await handleChina(interaction);
        return;
      }

      if (interaction.commandName === 'stats') {
        const s = getStats(interaction.user.id);
        await safeReply(
          interaction,
          s
            ? {
                embeds: [
                  new EmbedBuilder()
                    .setColor(gold)
                    .setTitle(`📊 ${interaction.user.displayName}`)
                    .setDescription(`Games: **${s.games}** · Siege: **${s.wins}** · Best: **${s.best}** · Beste Combo: **x${s.best_combo || 0}**`),
                ],
              }
            : { content: 'Noch keine Statistik.', flags: MessageFlags.Ephemeral },
        );
        return;
      }

      if (interaction.commandName === 'leaderboard') {
        const t = top(10);
        await safeReply(interaction, {
          embeds: [
            new EmbedBuilder()
              .setColor(gold)
              .setTitle('🏆 CHINA CHAOS')
              .setDescription(t.map((r, n) => `${n + 1}. **${r.name}** — ${r.best} Best`).join('\n') || 'Noch leer.'),
          ],
        });
      }
    })().catch(error => {
      if (isUnknownInteraction(error)) {
        console.warn('⚠️ Discord Interaction abgelaufen (10062). Server läuft weiter.');
      } else {
        console.error('Interaction Handler:', error?.message || error);
      }
    });
  });

  try {
    await client.login(process.env.DISCORD_TOKEN);
  } catch (error) {
    bot = null;
    throw error;
  }

  return client;
}
