require('dotenv').config();
const {
  Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, PermissionFlagsBits, ChannelType,
} = require('discord.js');

// ====== AYARLAR ======
// Değerler .env dosyasından okunur (bkz. .env.example)
const TOKEN = process.env.TOKEN;
const FEST_LOGO = process.env.FEST_LOGO;                 // FEST logosunun direkt resim linki
const DESTEK_ROL_ID = process.env.DESTEK_ROL_ID;       // Ticketları görecek yetkili rolü
const TICKET_KATEGORI_ID = process.env.TICKET_KATEGORI_ID; // Ticket kanallarının açılacağı kategori
const RENK = 0x2b6cff;
const DM_BEKLEME_MS = 2000; // DM'ler arası bekleme (spam/ban riskini azaltmak için)
// =====================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,     // Developer Portal'dan "Server Members Intent" aç
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,   // Developer Portal'dan "Message Content Intent" aç
  ],
  partials: [Partials.Channel],
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

client.once('ready', () => console.log(`${client.user.tag} hazır!`));

client.on('messageCreate', async (msg) => {
  if (msg.author.bot || !msg.guild) return;
  const icerik = msg.content.trim();
  const admin = msg.member.permissions.has(PermissionFlagsBits.Administrator);

  // ---- TICKET KURULUM ----
  if (icerik.toLowerCase() === 'ticket kurulum') {
    if (!admin) return msg.reply('Bu komut için yönetici olmalısın.');

    const embed = new EmbedBuilder()
      .setColor(RENK)
      .setTitle('FEST Destek Sistemi')
      .setDescription('Destek almak için aşağıdaki butona tıklayarak ticket açabilirsin.')
      .setThumbnail(FEST_LOGO)
      .setFooter({ text: 'FEST', iconURL: FEST_LOGO });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_ac').setLabel('Ticket Aç')
        .setEmoji('🎫').setStyle(ButtonStyle.Primary),
    );

    await msg.channel.send({ embeds: [embed], components: [row] });
    return msg.delete().catch(() => {});
  }

  // ---- DM DUYURU ----
  // Kullanım: dm duyuru Mesajın buraya
  //           dm duyuru @rol Mesajın buraya   (sadece o roldekilere)
  if (icerik.toLowerCase().startsWith('dm duyuru')) {
    if (!admin) return msg.reply('Bu komut için yönetici olmalısın.');

    const rol = msg.mentions.roles.first();
    let metin = icerik.slice('dm duyuru'.length).trim();
    if (rol) metin = metin.replace(`<@&${rol.id}>`, '').trim();
    if (!metin) return msg.reply('Kullanım: `dm duyuru [@rol] mesaj`');

    await msg.guild.members.fetch();
    const hedefler = msg.guild.members.cache.filter(
      (m) => !m.user.bot && (!rol || m.roles.cache.has(rol.id)),
    );

    const durum = await msg.reply(`📨 ${hedefler.size} kişiye gönderiliyor...`);

    const embed = new EmbedBuilder()
      .setColor(RENK)
      .setTitle(`📢 ${msg.guild.name} Duyuru`)
      .setDescription(metin)
      .setThumbnail(FEST_LOGO)
      .setFooter({ text: 'FEST', iconURL: FEST_LOGO })
      .setTimestamp();

    let basarili = 0, basarisiz = 0;
    for (const [, m] of hedefler) {
      try { await m.send({ embeds: [embed] }); basarili++; }
      catch { basarisiz++; } // DM'i kapalı olanlar
      await sleep(DM_BEKLEME_MS);
    }
    return durum.edit(`✅ Bitti. Başarılı: **${basarili}** | Başarısız (DM kapalı): **${basarisiz}**`);
  }
});

// ---- BUTONLAR ----
client.on('interactionCreate', async (i) => {
  if (!i.isButton()) return;

  if (i.customId === 'ticket_ac') {
    const ad = `ticket-${i.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '');
    const var_mi = i.guild.channels.cache.find((c) => c.name === ad);
    if (var_mi) return i.reply({ content: `Zaten açık ticketın var: ${var_mi}`, ephemeral: true });

    const kanal = await i.guild.channels.create({
      name: ad,
      type: ChannelType.GuildText,
      parent: TICKET_KATEGORI_ID,
      permissionOverwrites: [
        { id: i.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        { id: DESTEK_ROL_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      ],
    });

    const embed = new EmbedBuilder()
      .setColor(RENK)
      .setTitle('🎫 Ticket Açıldı')
      .setDescription(`Merhaba ${i.user}, sorununu yaz. <@&${DESTEK_ROL_ID}> ekibi en kısa sürede dönecek.`)
      .setThumbnail(FEST_LOGO)
      .setFooter({ text: 'FEST', iconURL: FEST_LOGO });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_kapat').setLabel('Ticketı Kapat')
        .setEmoji('🔒').setStyle(ButtonStyle.Danger),
    );

    await kanal.send({ content: `${i.user} <@&${DESTEK_ROL_ID}>`, embeds: [embed], components: [row] });
    return i.reply({ content: `Ticketın açıldı: ${kanal}`, ephemeral: true });
  }

  if (i.customId === 'ticket_kapat') {
    const yetkili = i.member.roles.cache.has(DESTEK_ROL_ID) ||
      i.member.permissions.has(PermissionFlagsBits.Administrator);
    if (!yetkili) return i.reply({ content: 'Sadece yetkililer kapatabilir.', ephemeral: true });

    await i.reply('🔒 Ticket 5 saniye içinde kapatılacak...');
    setTimeout(() => i.channel.delete().catch(() => {}), 5000);
  }
});

client.login(TOKEN);
