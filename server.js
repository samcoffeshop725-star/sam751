'use strict';
/*
 * Boutique Telegram Mini App — serveur sans dépendance (Node.js 18+)
 * - Sert la mini-app (/) et le panel admin (/admin)
 * - API JSON + stockage dans data/db.json + images dans public/uploads
 * - Bot Telegram (long polling) avec bouton "Ouvrir la boutique"
 * - Envoi des commandes sur WhatsApp (CallMeBot, WhatsApp Cloud API ou lien wa.me)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

loadEnv(path.join(__dirname, '.env'));

const CFG = {
  port: Number(process.env.PORT) || 3000,
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  adminPhone: (process.env.ADMIN_PHONE || '').replace(/\D/g, ''),
  botToken: (process.env.BOT_TOKEN || '').trim(),
  webappUrl: (process.env.WEBAPP_URL || '').trim().replace(/\/+$/, ''),
  adminChatId: (process.env.TELEGRAM_ADMIN_CHAT_ID || '').trim(),
  requireTelegram: process.env.REQUIRE_TELEGRAM === 'true',
  // IDs Telegram ayant l'accès admin direct (en plus de ceux ajoutés dans le panel)
  adminTgIds: (process.env.ADMIN_TELEGRAM_IDS || '').split(/[\s,;]+/).filter((x) => /^\d+$/.test(x)),
  wa: {
    provider: (process.env.WHATSAPP_PROVIDER || 'link').trim().toLowerCase(), // link | callmebot | cloud
    callmebotKey: (process.env.CALLMEBOT_APIKEY || '').trim(),
    cloudToken: (process.env.WHATSAPP_CLOUD_TOKEN || '').trim(),
    cloudPhoneId: (process.env.WHATSAPP_CLOUD_PHONE_ID || '').trim(),
  },
};

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOAD_DIR = path.join(PUBLIC_DIR, 'uploads');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/* ------------------------------------------------------------------ utils */

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

const uid = (n = 6) => crypto.randomBytes(n).toString('hex');
const round2 = (n) => Math.round(n * 100) / 100;
const digits = (s) => String(s || '').replace(/\D/g, '');
const str = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const bool = (v) => v === true || v === 'true' || v === 1 || v === 'on';
const num = (v, min = 0, max = 1e7) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
};
const color = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v)) ? String(v) : d);
// URLs d'images autorisées : fichiers locaux ou https, sans caractères pouvant casser le CSS/HTML
const imgUrl = (v) => {
  v = str(v, 1000);
  if (!v || /["'()<>\s\\]/.test(v)) return '';
  return v.startsWith('/uploads/') || v.startsWith('/img/') || v.startsWith('https://') ? v : '';
};
const linkUrl = (v) => {
  v = str(v, 1000);
  return /^(https?:\/\/|tg:\/\/|mailto:|tel:)/i.test(v) && !/["'<>\s]/.test(v) ? v : '';
};
const eur = (n) => n.toFixed(2).replace('.', ',') + ' €';
const fmtG = (g) => String(g).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' g';
const httpError = (status, message) => Object.assign(new Error(message), { status });

/* --------------------------------------------------------------- database */

const SOCIAL_TYPES = ['instagram', 'tiktok', 'telegram', 'snapchat', 'whatsapp', 'facebook', 'x', 'youtube', 'signal', 'website'];
const ORDER_STATUSES = ['nouvelle', 'confirmée', 'expédiée', 'livrée', 'annulée'];

function defaultSettings() {
  return {
    shopName: 'NEON LEAF',
    tagline: 'Boutique premium • Livraison rapide',
    logo: '',
    whatsapp: process.env.WHATSAPP_NUMBER || '',
    deliveryFee: 4.9,
    freeDeliveryFrom: 60,
    minOrder: 0,
    cartNote: 'Après validation, votre commande est transmise sur WhatsApp pour finaliser le paiement et la livraison.',
    reviewsEnabled: true,
    adminTelegramIds: [],
    theme: {
      preset: 'cyber',
      accent: '#00f0ff',
      accent2: '#b44cff',
      gramColor: '#00f0ff',
      priceColor: '#39ff88',
      bgColor: '#05060f',
      bgImage: '',
      overlay: 0.55,
      blur: 14,
      panelOpacity: 0.45,
      glow: 1,
      animatedBg: true,
    },
  };
}

function svgArt(emoji, h1, h2) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
<defs>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h1},85%,16%)"/><stop offset="1" stop-color="hsl(${h2},90%,6%)"/></linearGradient>
<radialGradient id="r" cx=".5" cy=".47" r=".5"><stop offset="0" stop-color="hsl(${h1},100%,62%)" stop-opacity=".6"/><stop offset="1" stop-color="hsl(${h1},100%,60%)" stop-opacity="0"/></radialGradient>
<pattern id="p" width="26" height="26" patternUnits="userSpaceOnUse"><path d="M26 0H0V26" fill="none" stroke="hsl(${h2},100%,72%)" stroke-opacity=".13"/></pattern>
</defs>
<rect width="400" height="300" fill="url(#g)"/><rect width="400" height="300" fill="url(#p)"/>
<circle cx="200" cy="142" r="150" fill="url(#r)"/>
<circle cx="200" cy="142" r="80" fill="none" stroke="hsl(${h1},100%,72%)" stroke-opacity=".55" stroke-width="2"/>
<circle cx="200" cy="142" r="96" fill="none" stroke="hsl(${h2},100%,72%)" stroke-opacity=".25" stroke-width="1" stroke-dasharray="4 8"/>
<text x="200" y="170" font-size="82" text-anchor="middle" font-family="Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif">${emoji}</text>
</svg>`;
}

function seed() {
  const art = (name, emoji, h1, h2) => {
    const file = `demo-${name}.svg`;
    fs.writeFileSync(path.join(UPLOAD_DIR, file), svgArt(emoji, h1, h2));
    return `/uploads/${file}`;
  };
  const cats = [
    { id: 'c-the', name: 'Thés', image: art('the', '🍵', 155, 200) },
    { id: 'c-cafe', name: 'Cafés', image: art('cafe', '☕', 28, 320) },
    { id: 'c-epices', name: 'Épices', image: art('epices', '🌶️', 350, 275) },
  ];
  const P = (id, name, categoryId, emoji, h1, h2, description, options, extra = {}) => ({
    id, name, categoryId, description, image: art(id, emoji, h1, h2),
    options: options.map(([grams, price]) => ({ grams, price })),
    badge: '', active: true, ...extra,
  });
  return {
    settings: defaultSettings(),
    categories: cats,
    products: [
      P('p-matcha', 'Matcha Cérémonial', 'c-the', '🍵', 120, 170, 'Matcha japonais grade cérémonial, broyé à la meule de pierre. Notes végétales intenses et douceur umami.', [[30, 18], [100, 49]], { badge: 'TOP' }),
      P('p-sencha', 'Sencha Premium', 'c-the', '🌿', 140, 210, 'Thé vert japonais aux notes fraîches et iodées. Parfait infusé à 70 °C pendant 1 minute.', [[50, 9.9], [100, 17.9], [250, 39]]),
      P('p-ethiopie', 'Éthiopie Yirgacheffe', 'c-cafe', '☕', 30, 340, 'Café de spécialité torréfié artisanalement. Arômes floraux, agrumes et bergamote.', [[250, 14.5], [500, 26], [1000, 48]], { badge: 'NOUVEAU' }),
      P('p-espresso', 'Espresso Neon Blend', 'c-cafe', '⚡', 10, 300, 'Assemblage intense pour espresso : chocolat noir, noisette grillée, crema dense.', [[250, 12.9], [1000, 44]]),
      P('p-safran', "Safran d'Iran", 'c-epices', '🌸', 330, 270, 'Pistils de safran catégorie I, récolte manuelle. Pouvoir colorant et aromatique exceptionnel.', [[1, 9.9], [5, 42]], { badge: 'RARE' }),
      P('p-kampot', 'Poivre de Kampot', 'c-epices', '🌶️', 0, 290, 'Poivre noir IGP du Cambodge, notes chaudes et florales. À moudre au dernier moment.', [[50, 8.5], [100, 15]]),
    ],
    reviews: [
      { id: 'r1', name: 'Sarah M.', rating: 5, text: 'Livraison ultra rapide et produits de très grande qualité. Le matcha est incroyable !', date: '2026-09-02', approved: true },
      { id: 'r2', name: 'Karim B.', rating: 5, text: 'Commande simple via WhatsApp, réponse en quelques minutes. Je recommande à 100 %.', date: '2026-08-27', approved: true },
      { id: 'r3', name: 'Julie D.', rating: 4, text: 'Très bon café, bien emballé. Petit délai de livraison mais service au top.', date: '2026-08-15', approved: true },
      { id: 'r4', name: 'Lucas P.', rating: 5, text: 'Le safran est d\'une qualité rare. Boutique sérieuse, je repasserai commande.', date: '2026-07-30', approved: true },
    ],
    socials: [
      { id: 's1', type: 'instagram', label: 'Instagram', handle: '@neonleaf', url: 'https://instagram.com/' },
      { id: 's2', type: 'tiktok', label: 'TikTok', handle: '@neonleaf', url: 'https://tiktok.com/' },
      { id: 's3', type: 'telegram', label: 'Canal Telegram', handle: '@neonleaf', url: 'https://t.me/' },
      { id: 's4', type: 'snapchat', label: 'Snapchat', handle: 'neonleaf', url: 'https://snapchat.com/' },
    ],
    orders: [],
  };
}

function migrate(d) {
  const def = defaultSettings();
  d.settings = { ...def, ...(d.settings || {}), theme: { ...def.theme, ...((d.settings || {}).theme || {}) } };
  for (const k of ['categories', 'products', 'reviews', 'socials', 'orders']) if (!Array.isArray(d[k])) d[k] = [];
  return d;
}

function loadDb() {
  if (fs.existsSync(DB_FILE)) {
    try { return migrate(JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))); }
    catch (e) { console.error('❌ data/db.json illisible :', e.message); process.exit(1); }
  }
  const d = seed();
  writeDb(d);
  console.log('✨ Base de données créée avec des produits de démonstration');
  return d;
}

function writeDb(d = db) {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(d, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

let db = loadDb();

/* ------------------------------------------------------------ normalizers */

function normSettings(input, cur) {
  const i = input || {};
  const t = i.theme || {};
  const ct = cur.theme;
  return {
    shopName: 'shopName' in i ? str(i.shopName, 60) || 'Ma Boutique' : cur.shopName,
    tagline: 'tagline' in i ? str(i.tagline, 140) : cur.tagline,
    logo: 'logo' in i ? imgUrl(i.logo) : cur.logo,
    whatsapp: 'whatsapp' in i ? str(i.whatsapp, 30) : cur.whatsapp,
    deliveryFee: 'deliveryFee' in i ? round2(num(i.deliveryFee, 0, 1000)) : cur.deliveryFee,
    freeDeliveryFrom: 'freeDeliveryFrom' in i ? round2(num(i.freeDeliveryFrom, 0, 100000)) : cur.freeDeliveryFrom,
    minOrder: 'minOrder' in i ? round2(num(i.minOrder, 0, 100000)) : cur.minOrder,
    cartNote: 'cartNote' in i ? str(i.cartNote, 400) : cur.cartNote,
    reviewsEnabled: 'reviewsEnabled' in i ? bool(i.reviewsEnabled) : cur.reviewsEnabled,
    adminTelegramIds: 'adminTelegramIds' in i
      ? [...new Set((Array.isArray(i.adminTelegramIds) ? i.adminTelegramIds.join(',') : String(i.adminTelegramIds || '')).split(/[\s,;]+/).filter((x) => /^\d{3,20}$/.test(x)))].slice(0, 20)
      : cur.adminTelegramIds || [],
    theme: {
      preset: 'preset' in t ? str(t.preset, 20) : ct.preset,
      accent: color(t.accent, ct.accent),
      accent2: color(t.accent2, ct.accent2),
      gramColor: color(t.gramColor, ct.gramColor),
      priceColor: color(t.priceColor, ct.priceColor),
      bgColor: color(t.bgColor, ct.bgColor),
      bgImage: 'bgImage' in t ? imgUrl(t.bgImage) : ct.bgImage,
      overlay: 'overlay' in t ? num(t.overlay, 0, 0.95) : ct.overlay,
      blur: 'blur' in t ? Math.round(num(t.blur, 0, 40)) : ct.blur,
      panelOpacity: 'panelOpacity' in t ? num(t.panelOpacity, 0, 1) : ct.panelOpacity,
      glow: 'glow' in t ? num(t.glow, 0, 2) : ct.glow,
      animatedBg: 'animatedBg' in t ? bool(t.animatedBg) : ct.animatedBg,
    },
  };
}

const normCategory = (c) => ({ id: str(c.id, 40) || 'c-' + uid(4), name: str(c.name, 40) || 'Catégorie', image: imgUrl(c.image) });

function normProduct(p) {
  const seen = new Set();
  const options = (Array.isArray(p.options) ? p.options : [])
    .map((o) => ({ grams: Math.round(num(o.grams, 0, 1000000)), price: round2(num(o.price, 0, 1000000)) }))
    .filter((o) => o.grams > 0 && !seen.has(o.grams) && seen.add(o.grams))
    .sort((a, b) => a.grams - b.grams)
    .slice(0, 20);
  return {
    id: str(p.id, 40) || 'p-' + uid(4),
    name: str(p.name, 80) || 'Produit',
    categoryId: str(p.categoryId, 40),
    description: str(p.description, 2000),
    image: imgUrl(p.image),
    options,
    badge: str(p.badge, 16),
    active: p.active === undefined ? true : bool(p.active),
  };
}

const normReview = (r) => ({
  id: str(r.id, 40) || 'r-' + uid(4),
  name: str(r.name, 40) || 'Client',
  rating: Math.round(num(r.rating, 1, 5)),
  text: str(r.text, 1000),
  date: /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : new Date().toISOString().slice(0, 10),
  approved: bool(r.approved),
});

const normSocial = (s) => ({
  id: str(s.id, 40) || 's-' + uid(4),
  type: SOCIAL_TYPES.includes(s.type) ? s.type : 'website',
  label: str(s.label, 40) || 'Lien',
  handle: str(s.handle, 60),
  url: linkUrl(s.url),
});

const list = (v, fn, max) => (Array.isArray(v) ? v.slice(0, max).map((x) => fn(x || {})) : null);

/* -------------------------------------------------------------- telegram */

async function tgApi(method, body) {
  if (!CFG.botToken) throw new Error('BOT_TOKEN manquant');
  const r = await fetch(`https://api.telegram.org/bot${CFG.botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
    signal: AbortSignal.timeout(method === 'getUpdates' ? 40000 : 15000),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.description || 'Erreur Telegram');
  return j.result;
}

/** Vérifie la signature initData envoyée par Telegram.WebApp — renvoie l'utilisateur ou null */
function verifyInitData(initData) {
  if (!initData || !CFG.botToken) return null;
  try {
    const params = new URLSearchParams(String(initData));
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');
    const dataCheck = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('\n');
    const secret = crypto.createHmac('sha256', 'WebAppData').update(CFG.botToken).digest();
    const calc = crypto.createHmac('sha256', secret).update(dataCheck).digest('hex');
    if (calc.length !== hash.length || !crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(hash))) return null;
    if (Date.now() / 1000 - Number(params.get('auth_date')) > 86400) return null;
    return JSON.parse(params.get('user') || 'null');
  } catch { return null; }
}

let botInfo = null;
async function startBot() {
  if (!CFG.botToken) { console.log('ℹ️  BOT_TOKEN non défini : bot Telegram désactivé (la mini-app fonctionne quand même)'); return; }
  try {
    botInfo = await tgApi('getMe');
    await tgApi('deleteWebhook', { drop_pending_updates: false });
    await tgApi('setMyCommands', { commands: [
      { command: 'start', description: 'Ouvrir la boutique' },
      { command: 'id', description: 'Afficher mon ID Telegram' },
      { command: 'admin', description: 'Accès administrateur' },
    ] });
    if (CFG.webappUrl.startsWith('https://')) {
      await tgApi('setChatMenuButton', { menu_button: { type: 'web_app', text: '🛍️ Boutique', web_app: { url: CFG.webappUrl + '/' } } });
    } else {
      console.log('⚠️  WEBAPP_URL doit être une URL https:// pour ouvrir la mini-app depuis Telegram');
    }
    console.log(`🤖 Bot Telegram connecté : @${botInfo.username}`);
  } catch (e) {
    console.error('❌ Bot Telegram :', e.message);
    return;
  }
  let offset = 0;
  for (;;) {
    try {
      const updates = await tgApi('getUpdates', { offset, timeout: 30, allowed_updates: ['message'] });
      for (const u of updates) {
        offset = u.update_id + 1;
        handleUpdate(u).catch((e) => console.error('Bot :', e.message));
      }
    } catch (e) {
      if (!/aborted|timeout/i.test(e.message)) console.error('Bot polling :', e.message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

async function handleUpdate(u) {
  const m = u.message;
  if (!m || typeof m.text !== 'string') return;
  const chatId = m.chat.id;
  const cmd = m.text.trim().split(/[\s@]/)[0].toLowerCase();
  const ok = CFG.webappUrl.startsWith('https://');
  const admin = isTgAdmin(m.from);
  if (cmd === '/id') return tgApi('sendMessage', { chat_id: chatId, text: `🆔 Votre ID Telegram : ${m.from.id}\n\n• Pour l'accès admin : ajoutez-le dans Admin → Général → « Accès admin Telegram » (ou ADMIN_TELEGRAM_IDS).\n• Pour recevoir les commandes ici : mettez ${chatId} dans TELEGRAM_ADMIN_CHAT_ID.` });
  if (cmd === '/admin') {
    if (!admin) return tgApi('sendMessage', { chat_id: chatId, text: '⛔ Accès réservé à l\'administrateur.' });
    return tgApi('sendMessage', {
      chat_id: chatId,
      text: ok ? '⚙️ Panel administrateur — connexion automatique, sans mot de passe.' : '⚙️ WEBAPP_URL (https) doit être configuré pour ouvrir le panel ici.',
      reply_markup: ok ? { inline_keyboard: [[{ text: '⚙️ Ouvrir le panel admin', web_app: { url: CFG.webappUrl + '/admin' } }]] } : undefined,
    });
  }
  const s = db.settings;
  const kb = [[{ text: '🛍️ Ouvrir la boutique', web_app: { url: CFG.webappUrl + '/' } }]];
  if (admin) kb.push([{ text: '⚙️ Panel admin', web_app: { url: CFG.webappUrl + '/admin' } }]);
  return tgApi('sendMessage', {
    chat_id: chatId,
    text: `✨ Bienvenue chez ${s.shopName} !\n${s.tagline}\n\n${ok ? '👇 Appuyez sur le bouton pour ouvrir la boutique.' : '⚙️ La boutique n\'est pas encore configurée (WEBAPP_URL).'}`,
    reply_markup: ok ? { inline_keyboard: kb } : undefined,
  });
}

async function notifyTelegram(text) {
  if (!CFG.botToken || !CFG.adminChatId) return { ok: false, error: 'non configuré' };
  await tgApi('sendMessage', { chat_id: CFG.adminChatId, text: text.replace(/\*/g, '') });
  return { ok: true };
}

/* -------------------------------------------------------------- whatsapp */

async function sendWhatsApp(text) {
  const to = digits(db.settings.whatsapp);
  const p = CFG.wa.provider;
  if (!to) return { ok: false, error: 'Numéro WhatsApp non configuré (Admin → Général)' };
  if (p === 'callmebot') {
    if (!CFG.wa.callmebotKey) return { ok: false, error: 'CALLMEBOT_APIKEY manquant' };
    const url = `https://api.callmebot.com/whatsapp.php?phone=${to}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(CFG.wa.callmebotKey)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    const body = await r.text();
    const ok = r.ok && /queued|sent|delivered/i.test(body) && !/error|invalid/i.test(body);
    return ok ? { ok } : { ok, error: body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200) };
  }
  if (p === 'cloud') {
    if (!CFG.wa.cloudToken || !CFG.wa.cloudPhoneId) return { ok: false, error: 'WHATSAPP_CLOUD_TOKEN / WHATSAPP_CLOUD_PHONE_ID manquants' };
    const r = await fetch(`https://graph.facebook.com/v21.0/${CFG.wa.cloudPhoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${CFG.wa.cloudToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text.slice(0, 4000) } }),
      signal: AbortSignal.timeout(20000),
    });
    const j = await r.json().catch(() => ({}));
    return r.ok ? { ok: true } : { ok: false, error: j.error?.message || 'Erreur WhatsApp Cloud' };
  }
  return { ok: false, mode: 'link' };
}

/* ---------------------------------------------------------------- orders */

function orderMessage(o) {
  const d = new Date(o.createdAt).toLocaleString('fr-FR', { timeZone: process.env.TZ || 'Europe/Paris' });
  const L = [
    `🛒 *NOUVELLE COMMANDE #${o.id}*`,
    `🏪 ${db.settings.shopName} — ${d}`,
    '',
    '👤 *Client*',
    `Nom : ${o.customer.name}`,
    `Téléphone : ${o.customer.phone}`,
  ];
  if (o.customer.address) L.push(`Adresse : ${o.customer.address}`);
  if (o.telegram) L.push(`Telegram : ${o.telegram.username ? '@' + o.telegram.username : ''} (ID ${o.telegram.id})`.replace(':  (', ': ('));
  if (o.customer.note) L.push(`Note : ${o.customer.note}`);
  L.push('', '📦 *Articles*');
  for (const it of o.items) L.push(`• ${it.name} — ${fmtG(it.grams)} × ${it.qty} = ${eur(it.lineTotal)}`);
  L.push('', `Sous-total : ${eur(o.subtotal)}`, `Livraison : ${o.delivery ? eur(o.delivery) : 'offerte'}`, `⚖️ Poids total : ${fmtG(o.totalGrams)}`, `💶 *TOTAL : ${eur(o.total)}*`);
  return L.join('\n');
}

async function createOrder(body) {
  const s = db.settings;
  const lines = [];
  for (const it of Array.isArray(body.items) ? body.items.slice(0, 50) : []) {
    const p = db.products.find((x) => x.id === it.productId && x.active);
    const opt = p && p.options.find((o) => o.grams === Number(it.grams));
    if (!opt) continue;
    const qty = Math.min(99, Math.max(1, parseInt(it.qty, 10) || 1));
    lines.push({ productId: p.id, name: p.name, grams: opt.grams, unitPrice: opt.price, qty, lineTotal: round2(opt.price * qty) });
  }
  if (!lines.length) throw httpError(400, 'Panier vide ou produits indisponibles');
  const c = body.customer || {};
  const customer = { name: str(c.name, 80), phone: str(c.phone, 30), address: str(c.address, 300), note: str(c.note, 500) };
  if (!customer.name || digits(customer.phone).length < 6) throw httpError(400, 'Nom et numéro de téléphone obligatoires');
  const user = verifyInitData(body.initData);
  if (CFG.requireTelegram && !user) throw httpError(403, 'Les commandes se passent uniquement depuis Telegram');

  const subtotal = round2(lines.reduce((a, l) => a + l.lineTotal, 0));
  if (s.minOrder > 0 && subtotal < s.minOrder) throw httpError(400, `Minimum de commande : ${eur(s.minOrder)}`);
  const delivery = s.freeDeliveryFrom > 0 && subtotal >= s.freeDeliveryFrom ? 0 : s.deliveryFee;
  const order = {
    id: uid(3).toUpperCase(),
    createdAt: new Date().toISOString(),
    status: 'nouvelle',
    customer,
    telegram: user ? { id: user.id, username: user.username || '', name: [user.first_name, user.last_name].filter(Boolean).join(' ') } : null,
    items: lines,
    subtotal,
    delivery,
    total: round2(subtotal + delivery),
    totalGrams: lines.reduce((a, l) => a + l.grams * l.qty, 0),
    delivered: { whatsapp: false, telegram: false },
  };
  db.orders.unshift(order);
  db.orders = db.orders.slice(0, 5000);
  writeDb();

  const text = orderMessage(order);
  const [wa, tg] = await Promise.all([
    sendWhatsApp(text).catch((e) => ({ ok: false, error: e.message })),
    notifyTelegram(text).catch((e) => ({ ok: false, error: e.message })),
  ]);
  if (!wa.ok && wa.error) console.error(`WhatsApp (commande ${order.id}) :`, wa.error);
  order.delivered = { whatsapp: !!wa.ok, telegram: !!tg.ok };
  writeDb();

  if (user && CFG.botToken) {
    tgApi('sendMessage', { chat_id: user.id, text: `✅ Commande #${order.id} reçue !\nTotal : ${eur(order.total)}\n\nNous vous recontactons très vite sur WhatsApp pour finaliser.` }).catch(() => {});
  }
  const to = digits(s.whatsapp);
  return {
    ok: true,
    orderId: order.id,
    total: order.total,
    whatsappSent: !!wa.ok,
    waLink: to ? `https://wa.me/${to}?text=${encodeURIComponent(text)}` : '',
  };
}

/* ------------------------------------------------------------------ http */

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

function send(res, status, data) {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': typeof data === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

function serveStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return send(res, 400, 'Requête invalide'); }
  if (rel === '/' || rel === '') rel = '/index.html';
  if (rel === '/admin' || rel === '/admin/') rel = '/admin.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'Interdit');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Introuvable');
    const ext = path.extname(file).toLowerCase();
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': rel.startsWith('/uploads/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    };
    if (ext === '.svg') headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'";
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

function readBody(req, limit = 200 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(httpError(413, 'Fichier ou requête trop volumineux')); req.destroy(); }
      else chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(httpError(400, 'JSON invalide')); }
    });
    req.on('error', reject);
  });
}

const hits = new Map();
function rateLimited(key, max, windowMs) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 10000) hits.clear();
  return arr.length > max;
}
const clientIp = (req) => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';

const sessions = new Map(); // token -> expiration
function isAdmin(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const exp = token && sessions.get(token);
  if (!exp) return false;
  if (exp < Date.now()) { sessions.delete(token); return false; }
  return true;
}
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function isTgAdmin(user) {
  if (!user || !user.id) return false;
  const id = String(user.id);
  return CFG.adminTgIds.includes(id) || (db.settings.adminTelegramIds || []).includes(id);
}

function newSession() {
  const token = uid(24);
  sessions.set(token, Date.now() + 7 * 24 * 3600 * 1000);
  return token;
}

// Accepte +212777300420, 00212777300420 ou 0777300420 pour le même numéro
function samePhone(input, expected) {
  let d = digits(input);
  if (d.startsWith('00')) d = d.slice(2);
  const candidates = [d];
  if (d.startsWith('0')) candidates.push(expected.slice(0, expected.length - (d.length - 1)) + d.slice(1));
  return candidates.some((c) => c.length >= 6 && safeEqual(c, expected));
}

function publicShop() {
  const productsCats = new Set(db.categories.map((c) => c.id));
  return {
    settings: { ...db.settings, adminTelegramIds: undefined },
    categories: db.categories,
    products: db.products.filter((p) => p.active && p.options.length).map((p) => ({ ...p, categoryId: productsCats.has(p.categoryId) ? p.categoryId : '' })),
    reviews: db.reviews.filter((r) => r.approved),
    socials: db.socials.filter((s) => s.url),
    whatsappMode: CFG.wa.provider === 'link' ? 'link' : 'auto',
  };
}

async function api(req, res, url) {
  const p = url.pathname;
  const m = req.method;
  const ip = clientIp(req);

  // ---- public
  if (m === 'GET' && p === '/api/shop') return send(res, 200, publicShop());

  if (m === 'POST' && p === '/api/order') {
    if (rateLimited('order:' + ip, 8, 10 * 60 * 1000)) throw httpError(429, 'Trop de commandes, réessayez dans quelques minutes');
    return send(res, 200, await createOrder(await readBody(req)));
  }

  if (m === 'POST' && p === '/api/reviews') {
    if (!db.settings.reviewsEnabled) throw httpError(403, 'Avis désactivés');
    if (rateLimited('review:' + ip, 3, 60 * 60 * 1000)) throw httpError(429, 'Trop d\'avis envoyés, réessayez plus tard');
    const b = await readBody(req);
    if (!str(b.text) || !str(b.name)) throw httpError(400, 'Nom et avis obligatoires');
    db.reviews.unshift(normReview({ ...b, id: '', date: '', approved: false }));
    writeDb();
    return send(res, 200, { ok: true });
  }

  // Accès admin spécial : l'admin ouvert depuis Telegram est reconnu par sa signature
  if (m === 'POST' && p === '/api/me') {
    const user = verifyInitData((await readBody(req)).initData);
    return send(res, 200, { isAdmin: isTgAdmin(user) });
  }
  if (m === 'POST' && p === '/api/admin/tg-login') {
    if (rateLimited('login:' + ip, 20, 15 * 60 * 1000)) throw httpError(429, 'Trop de tentatives, réessayez dans 15 minutes');
    const user = verifyInitData((await readBody(req)).initData);
    if (!isTgAdmin(user)) throw httpError(403, 'Ce compte Telegram n\'a pas l\'accès admin');
    return send(res, 200, { token: newSession(), name: user.first_name || '' });
  }

  if (m === 'POST' && p === '/api/admin/login') {
    if (rateLimited('login:' + ip, 10, 15 * 60 * 1000)) throw httpError(429, 'Trop de tentatives, réessayez dans 15 minutes');
    const b = await readBody(req);
    const phoneOk = !CFG.adminPhone || samePhone(b.phone, CFG.adminPhone);
    const passOk = safeEqual(b.password || '', CFG.adminPassword);
    if (!phoneOk || !passOk) throw httpError(401, 'Numéro ou mot de passe incorrect');
    return send(res, 200, { token: newSession() });
  }

  // ---- admin
  if (!p.startsWith('/api/admin/')) throw httpError(404, 'Route inconnue');
  if (!isAdmin(req)) throw httpError(401, 'Non autorisé');

  if (m === 'GET' && p === '/api/admin/data') {
    const { orders, ...rest } = db;
    return send(res, 200, { ...rest, newOrders: orders.filter((o) => o.status === 'nouvelle').length });
  }
  if (m === 'PUT' && p === '/api/admin/settings') {
    db.settings = normSettings(await readBody(req), db.settings);
    writeDb();
    return send(res, 200, { settings: db.settings });
  }
  const collections = { categories: [normCategory, 50], products: [normProduct, 1000], reviews: [normReview, 1000], socials: [normSocial, 30] };
  const cm = p.match(/^\/api\/admin\/(categories|products|reviews|socials)$/);
  if (m === 'PUT' && cm) {
    const [fn, max] = collections[cm[1]];
    const arr = list((await readBody(req, 2 * 1024 * 1024)).items, fn, max);
    if (!arr) throw httpError(400, 'Format invalide');
    db[cm[1]] = arr;
    writeDb();
    return send(res, 200, { items: arr });
  }
  if (m === 'POST' && p === '/api/admin/upload') {
    const b = await readBody(req, 12 * 1024 * 1024);
    const mm = String(b.dataUrl || '').match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/=]+)$/);
    if (!mm) throw httpError(400, 'Image invalide (PNG, JPG, WEBP ou GIF)');
    const buf = Buffer.from(mm[2], 'base64');
    if (buf.length > 8 * 1024 * 1024) throw httpError(413, 'Image trop lourde (8 Mo max)');
    const name = `${Date.now().toString(36)}-${uid(4)}.${mm[1] === 'jpeg' ? 'jpg' : mm[1]}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
    return send(res, 200, { url: `/uploads/${name}` });
  }
  if (m === 'GET' && p === '/api/admin/orders') return send(res, 200, { orders: db.orders, statuses: ORDER_STATUSES });
  const om = p.match(/^\/api\/admin\/orders\/([A-Z0-9]+)$/);
  if (om) {
    const idx = db.orders.findIndex((o) => o.id === om[1]);
    if (idx < 0) throw httpError(404, 'Commande introuvable');
    if (m === 'PATCH') {
      const b = await readBody(req);
      if (!ORDER_STATUSES.includes(b.status)) throw httpError(400, 'Statut invalide');
      db.orders[idx].status = b.status;
      writeDb();
      return send(res, 200, { order: db.orders[idx] });
    }
    if (m === 'DELETE') { db.orders.splice(idx, 1); writeDb(); return send(res, 200, { ok: true }); }
  }
  if (m === 'GET' && p === '/api/admin/status') {
    return send(res, 200, {
      bot: botInfo ? { username: botInfo.username } : null,
      botTokenSet: !!CFG.botToken,
      webappUrl: CFG.webappUrl,
      adminChatId: !!CFG.adminChatId,
      adminTgCount: new Set([...CFG.adminTgIds, ...(db.settings.adminTelegramIds || [])]).size,
      requireTelegram: CFG.requireTelegram,
      whatsapp: { provider: CFG.wa.provider, number: db.settings.whatsapp, callmebotKey: !!CFG.wa.callmebotKey, cloud: !!(CFG.wa.cloudToken && CFG.wa.cloudPhoneId) },
      defaultPassword: CFG.adminPassword === 'admin123',
    });
  }
  if (m === 'POST' && p === '/api/admin/test') {
    const text = `✅ Test de connexion — ${db.settings.shopName}\nLes commandes arriveront ici.`;
    const [wa, tg] = await Promise.all([
      sendWhatsApp(text).catch((e) => ({ ok: false, error: e.message })),
      notifyTelegram(text).catch((e) => ({ ok: false, error: e.message })),
    ]);
    return send(res, 200, { whatsapp: wa, telegram: tg });
  }
  throw httpError(404, 'Route inconnue');
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Méthode non autorisée');
    return serveStatic(req, res, url.pathname);
  } catch (e) {
    if (!e.status) console.error(e);
    if (!res.headersSent) send(res, e.status || 500, { error: e.status ? e.message : 'Erreur serveur' });
  }
});

server.listen(CFG.port, () => {
  console.log(`\n🛍️  Boutique : http://localhost:${CFG.port}`);
  console.log(`🔐 Admin     : http://localhost:${CFG.port}/admin`);
  if (CFG.adminPassword === 'admin123') console.log('⚠️  Mot de passe admin par défaut (admin123) — changez ADMIN_PASSWORD dans .env');
  console.log(`💬 WhatsApp  : mode "${CFG.wa.provider}"${db.settings.whatsapp ? ' → ' + db.settings.whatsapp : ' (numéro à définir dans l\'admin)'}\n`);
  startBot();
});
