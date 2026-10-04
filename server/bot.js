import { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events } from 'discord.js';
import { getStats, top } from './db.js';
import { sign } from './auth.js';

const gold = 0xd4a017;
let bot = null;
let systemStateProvider = () => ({ maintenance:false, version:'5.1.0' });
export function setSystemStateProvider(fn){ if(typeof fn==='function') systemStateProvider=fn; }
export async function announceUpdateStatus(kind, version=''){
  try{const id=process.env.DISCORD_RECORD_CHANNEL_ID||process.env.DISCORD_CHANNEL_ID;if(!bot||!id)return false;const ch=await bot.channels.fetch(id);if(!ch?.isTextBased())return false;
    if(kind==='maintenance') await ch.send({embeds:[new EmbedBuilder().setColor(0xe67e22).setTitle('🛠️ China Chaos Update').setDescription('Momentan wird gerade ein Update vorbereitet. Bitte um Geduld – China Chaos ist kurz offline.').setTimestamp()]});
    else await ch.send({embeds:[new EmbedBuilder().setColor(0x2ecc71).setTitle(`🚀 Update ${version||''} verfügbar!`).setDescription('Das Update ist online! Schreibe **/china**, um die neueste Version zu laden und zu spielen.').setTimestamp()]});
    return true;}catch(e){console.error('Update-Nachricht:',e?.message||e);return false}
}
const commands = [
  new SlashCommandBuilder().setName('china').setDescription('🐉 Startet CHINA CHAOS'),
  new SlashCommandBuilder().setName('stats').setDescription('Deine Statistik'),
  new SlashCommandBuilder().setName('leaderboard').setDescription('Globale Bestenliste'),
].map(c => c.toJSON());

const unknown = e => e?.code === 10062 || e?.rawError?.code === 10062;
async function reply(i,p){try{if(i.deferred||i.replied)await i.editReply(p);else await i.reply(p);return true}catch(e){if(unknown(e))console.warn('⚠️ Discord Interaction abgelaufen (10062).');else console.error('Discord Antwort:',e?.message||e);return false}}

export async function announceRecord(r){try{const id=process.env.DISCORD_RECORD_CHANNEL_ID;if(!bot||!id)return;const ch=await bot.channels.fetch(id);if(!ch?.isTextBased())return;await ch.send({embeds:[new EmbedBuilder().setColor(gold).setTitle('🏆 NEUER CHINA-CHAOS-REKORD! 🐉').setDescription(`**${r.name}** hat einen neuen **${r.difficulty.toUpperCase()}**-Rekord!`).addFields({name:'Alter Rekord',value:`${r.old} Punkte`,inline:true},{name:'Neuer Rekord',value:`${r.score} Punkte`,inline:true}).setTimestamp()]})}catch(e){console.error('Rekord-Nachricht:',e?.message||e)}}

async function china(i){
  try{await i.deferReply({flags:MessageFlags.Ephemeral})}catch(e){if(unknown(e))return;throw e}
  const sys=systemStateProvider();
  if(sys?.maintenance)return reply(i,{content:`🛠️ **China Chaos wird gerade aktualisiert.**\nMomentan wird ein Update vorbereitet. Bitte um Geduld.${sys.version?`\nGeplante Version: **${sys.version}**`:''}`,components:[]});
  if(process.env.DISCORD_GUILD_ID&&i.guildId!==process.env.DISCORD_GUILD_ID)return reply(i,{content:'❌ China Chaos ist auf diesem Server nicht verfügbar.',components:[]});
  if(process.env.DISCORD_CHANNEL_ID&&i.channelId!==process.env.DISCORD_CHANNEL_ID)return reply(i,{content:'❌ China Chaos kann nur im dafür vorgesehenen Channel gestartet werden.',components:[]});
  let base;try{base=new URL((process.env.GAME_URL||'').trim());if(base.protocol!=='https:'&&base.protocol!=='http:')throw 0}catch{return reply(i,{content:'⚠️ GAME_URL fehlt oder ist ungültig.',components:[]})}
  const avatar=i.user.displayAvatarURL({extension:'png',size:128});
  const ticket=sign({id:i.user.id,name:i.user.globalName||i.user.username,avatar},10*60*1000);
  const url=new URL('/auth/link',base);url.searchParams.set('ticket',ticket);
  const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('🐉 China Chaos öffnen').setStyle(ButtonStyle.Link).setURL(url.toString()));
  await reply(i,{content:'🐉 **China Chaos ist bereit!**\nDein Discord-Account wird automatisch verbunden. Die Anmeldung bleibt 30 Tage gespeichert.',components:[row]});
  console.log(`🔗 /china Browser-Link an ${i.user.tag} gesendet`);
}

export async function startBot(){
  if(!process.env.DISCORD_TOKEN){console.warn('⚠️ DISCORD_TOKEN fehlt – Bot aus.');return null}
  if(bot)return bot;
  const c=new Client({intents:[GatewayIntentBits.Guilds]});bot=c;
  c.on('error',e=>console.error('Discord Client:',e?.message||e));c.on('warn',w=>console.warn('Discord Warnung:',w));
  c.once(Events.ClientReady,async rc=>{console.log(`🤖 Bot online als ${rc.user.tag}`);try{const gid=process.env.DISCORD_GUILD_ID;if(gid){const g=await rc.guilds.fetch(gid);await g.commands.set(commands);console.log(`✅ Slash Commands für Server ${gid} synchronisiert`)}else{await rc.application.commands.set(commands);console.log('✅ Globale Slash Commands synchronisiert')}}catch(e){console.error('Commands:',e?.message||e)}});
  c.on(Events.InteractionCreate,i=>{void(async()=>{if(!i.isChatInputCommand())return;if(i.commandName==='china')return china(i);if(i.commandName==='stats'){await i.deferReply({flags:MessageFlags.Ephemeral});const s=getStats(i.user.id);return reply(i,s?{embeds:[new EmbedBuilder().setColor(gold).setTitle(`📊 ${i.user.displayName}`).setDescription(`Games: **${s.games}** · Siege: **${s.wins}** · Best: **${s.best}** · Punkte: **${s.points}** · Coins: **${s.coins}** · Beste Combo: **x${s.best_combo||0}**`)]}:{content:'Noch keine Statistik.'})}if(i.commandName==='leaderboard'){await i.deferReply({flags:MessageFlags.Ephemeral});const t=top(10);return reply(i,{embeds:[new EmbedBuilder().setColor(gold).setTitle('🏆 CHINA CHAOS').setDescription(t.map((r,n)=>`${n+1}. **${r.name}** — ${r.best} Best`).join('\n')||'Noch leer.')]})}})().catch(e=>console.error('Interaction Handler:',e?.stack||e))});
  try{await c.login(process.env.DISCORD_TOKEN)}catch(e){bot=null;throw e}return c;
}
