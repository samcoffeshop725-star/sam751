/* Panel admin — boutique néon */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const eur = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n || 0);
  const g = (n) => new Intl.NumberFormat('fr-FR').format(n || 0) + ' g';
  const store = {
    get(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } },
    set(k, v) { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) { /* */ } },
  };
  const root = $('#root');
  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg) { try { tg.ready(); tg.expand(); } catch (e) { /* */ } }
  const initData = () => {
    if (tg && tg.initData) return tg.initData;
    try { return sessionStorage.getItem('tg_init') || ''; } catch (e) { return ''; }
  };
  const inTelegram = () => !!initData();

  let TOKEN = store.get('adm_token');
  let D = null; // données chargées
  let tab = location.hash.slice(1) || 'general';

  const TABS = [
    ['general', '⚙️', 'Général'], ['theme', '🎨', 'Thème'], ['categories', '🗂️', 'Catégories'], ['products', '📦', 'Produits'],
    ['reviews', '⭐', 'Avis'], ['socials', '🔗', 'Réseaux'], ['orders', '🧾', 'Commandes'], ['integrations', '🔌', 'Intégrations'],
  ];
  const SOCIAL_TYPES = { instagram: 'Instagram', tiktok: 'TikTok', telegram: 'Telegram', snapchat: 'Snapchat', whatsapp: 'WhatsApp', facebook: 'Facebook', x: 'X / Twitter', youtube: 'YouTube', signal: 'Signal', website: 'Site web' };
  const PRESETS = {
    cyber: { name: 'Cyber', accent: '#00f0ff', accent2: '#b44cff', gramColor: '#00f0ff', priceColor: '#39ff88', bgColor: '#05060f' },
    toxic: { name: 'Toxic', accent: '#39ff14', accent2: '#00ffa3', gramColor: '#39ff14', priceColor: '#f5ff4d', bgColor: '#040a06' },
    sunset: { name: 'Sunset', accent: '#ff2bd6', accent2: '#ff8a00', gramColor: '#ff5ce1', priceColor: '#ffd23f', bgColor: '#0d0510' },
    ice: { name: 'Ice', accent: '#7df9ff', accent2: '#4d7cff', gramColor: '#a6fbff', priceColor: '#ffffff', bgColor: '#040814' },
    gold: { name: 'Gold', accent: '#ffcf4d', accent2: '#ff6b3d', gramColor: '#ffcf4d', priceColor: '#ffe9a8', bgColor: '#0a0804' },
    blood: { name: 'Blood', accent: '#ff1f4b', accent2: '#8a2bff', gramColor: '#ff4d6d', priceColor: '#ff9eb1', bgColor: '#0a0306' },
  };

  /* ---------------- API ---------------- */
  async function api(method, url, body) {
    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && url !== '/api/admin/login') { logout(); throw new Error('Session expirée, reconnectez-vous'); }
    if (!r.ok) throw new Error(j.error || 'Erreur ' + r.status);
    return j;
  }

  let toastT;
  function toast(msg, err) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.toggle('err', !!err);
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), 2600);
  }

  async function withBusy(btn, fn) {
    const txt = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Enregistrement…'; }
    try { await fn(); } catch (e) { toast(e.message, true); } finally { if (btn) { btn.disabled = false; btn.innerHTML = txt; } }
  }

  /* ---------------- connexion ---------------- */
  function renderLogin() {
    root.innerHTML = `<div class="login"><form class="card login-card" id="loginForm" autocomplete="on">
      <div class="login-ico">🔐</div>
      <div class="brand" style="text-align:center;margin-bottom:6px">ACCÈS ADMIN</div>
      <p class="muted" style="margin:0 0 20px;text-align:center">Réservé à l'administrateur de la boutique.</p>
      <div class="f" style="margin-bottom:14px"><label for="lg-phone">Numéro de téléphone</label>
        <input class="in" id="lg-phone" type="tel" name="phone" required autocomplete="tel" inputmode="tel" placeholder="+212 6 00 00 00 00" autofocus></div>
      <div class="f" style="margin-bottom:18px"><label for="lg-pass">Mot de passe</label>
        <div class="suffix"><input class="in" id="lg-pass" type="password" name="password" required autocomplete="current-password" placeholder="••••••••">
        <button type="button" class="eye" id="eye" aria-label="Afficher le mot de passe">👁</button></div></div>
      <button class="btn block" type="submit">Se connecter</button>
      <a href="/" class="back-link">← Retour à la boutique</a>
    </form></div>`;
    $('#eye').onclick = () => { const i = $('#lg-pass'); i.type = i.type === 'password' ? 'text' : 'password'; };
    $('#loginForm').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      const btn = f.querySelector('button[type=submit]');
      btn.disabled = true;
      btn.textContent = 'Connexion…';
      try {
        const { token } = await api('POST', '/api/admin/login', { phone: f.phone.value, password: f.password.value });
        TOKEN = token;
        store.set('adm_token', token);
        await boot();
      } catch (err) {
        toast(err.message, true);
        f.password.value = '';
        btn.disabled = false;
        btn.textContent = 'Se connecter';
      }
    };
  }
  let retried = false;
  function logout() {
    TOKEN = '';
    store.set('adm_token', '');
    if (inTelegram() && !retried) { retried = true; boot(); } else renderLogin();
  }

  // Accès spécial : ouvert depuis le compte Telegram de l'admin → connexion automatique
  async function tgLogin() {
    const data = initData();
    if (!data) return false;
    try {
      const { token } = await api('POST', '/api/admin/tg-login', { initData: data });
      TOKEN = token;
      store.set('adm_token', token);
      return true;
    } catch (e) { toast(e.message, true); return false; }
  }

  async function boot() {
    if (!TOKEN && !(await tgLogin())) return renderLogin();
    try { D = await api('GET', '/api/admin/data'); } catch (e) { return; }
    renderShell();
  }

  /* ---------------- structure ---------------- */
  function renderShell() {
    root.innerHTML = `<header class="top"><span class="brand">${esc(D.settings.shopName)}</span><span class="muted">· Admin</span><span class="sp"></span>
      <a class="btn ghost sm" href="/" ${inTelegram() ? '' : 'target="_blank"'}>${inTelegram() ? '← Boutique' : 'Voir la boutique ↗'}</a><button class="btn ghost sm" id="logout">Déconnexion</button></header>
      <nav class="tabs" id="tabs"></nav><main class="wrap" id="main"></main>`;
    $('#logout').onclick = logout;
    renderTabs();
    renderTab();
  }
  function renderTabs() {
    $('#tabs').innerHTML = TABS.map(([id, ic, label]) => `<button data-tab="${id}" class="${tab === id ? 'on' : ''}">${ic} ${label}${id === 'orders' && D.newOrders ? ` <span class="pill">${D.newOrders}</span>` : ''}${id === 'reviews' && D.reviews.some((r) => !r.approved) ? ` <span class="pill">${D.reviews.filter((r) => !r.approved).length}</span>` : ''}</button>`).join('');
    $$('#tabs button').forEach((b) => { b.onclick = () => { tab = b.dataset.tab; history.replaceState(null, '', '#' + tab); renderTabs(); renderTab(); }; });
  }
  function renderTab() {
    $('#main').oninput = null;
    const fn = { general: tGeneral, theme: tTheme, categories: tCategories, products: tProducts, reviews: tReviews, socials: tSocials, orders: tOrders, integrations: tIntegrations }[tab] || tGeneral;
    fn($('#main'));
  }

  const previewPanel = () => `<aside class="preview card"><div class="preview-h"><span>📱 Aperçu en direct</span><a href="/" target="_blank">Ouvrir ↗</a></div><iframe id="pv" src="/"></iframe></aside>`;
  function postPreview(settings, reload) {
    const f = $('#pv');
    if (f && f.contentWindow) f.contentWindow.postMessage({ type: 'preview', settings, reload }, location.origin);
  }

  /* ---------------- champ image ---------------- */
  function imgField(key, url, opts = {}) {
    return `<div class="imgf ${opts.wide ? 'wide' : ''}" data-imgf>
      <div class="imgf-prev" style="${url ? `background-image:url('${esc(url)}')` : ''}">${url ? '' : 'Aucune image'}</div>
      <div class="imgf-actions">
        <label class="btn ghost sm">📁 ${url ? 'Changer' : 'Choisir'}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden></label>
        <button type="button" class="btn ghost sm" data-imgclear>✕ Retirer</button>
      </div>
      <input type="hidden" data-k="${esc(key)}" value="${esc(url || '')}" data-max="${opts.max || 1400}">
    </div>`;
  }
  const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const readUrl = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  async function prepareImage(file, max) {
    if (file.type === 'image/gif') return readUrl(file);
    const img = await loadImg(URL.createObjectURL(file));
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    if (scale === 1 && file.size < 1.2e6) return readUrl(file);
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const webp = c.toDataURL('image/webp', 0.86);
    return webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/png');
  }
  function setImg(box, url) {
    const prev = $('.imgf-prev', box);
    const hidden = $('input[type=hidden]', box);
    hidden.value = url;
    prev.style.backgroundImage = url ? `url('${url}')` : '';
    prev.textContent = url ? '' : 'Aucune image';
    hidden.dispatchEvent(new Event('input', { bubbles: true }));
  }
  document.addEventListener('change', async (e) => {
    const input = e.target;
    if (input.type !== 'file' || !input.closest('[data-imgf]')) return;
    const box = input.closest('[data-imgf]');
    const file = input.files[0];
    if (!file) return;
    box.classList.add('loading');
    try {
      const dataUrl = await prepareImage(file, Number($('input[type=hidden]', box).dataset.max) || 1400);
      const { url } = await api('POST', '/api/admin/upload', { dataUrl });
      setImg(box, url);
      toast('Image importée ✓ — pensez à enregistrer');
    } catch (err) { toast(err.message || 'Import impossible', true); }
    box.classList.remove('loading');
    input.value = '';
  });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-imgclear]');
    if (b) setImg(b.closest('[data-imgf]'), '');
    if (e.target.closest('[data-act=modal-close]')) closeModal();
  });

  // Lit les champs [data-k] d'un conteneur
  function readFields(el) {
    const o = {};
    $$('[data-k]', el).forEach((i) => {
      const k = i.dataset.k;
      o[k] = i.type === 'checkbox' ? i.checked : i.type === 'number' || i.type === 'range' ? Number(i.value) : i.value;
    });
    return o;
  }
  const readRows = (container) => $$('[data-row]', container).map((r) => ({ ...JSON.parse(r.dataset.row), ...readFields(r) }));

  function openModal(html) { $('#modalBox').innerHTML = html; $('#modal').hidden = false; }
  function closeModal() { $('#modal').hidden = true; $('#modalBox').innerHTML = ''; }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });

  /* ================= GÉNÉRAL ================= */
  function tGeneral(main) {
    const s = D.settings;
    main.innerHTML = `<div class="layout with-preview"><div>
      <div class="sec card" id="gen">
        <h2>Identité de la boutique</h2><p class="hint">Nom, slogan et logo affichés en haut de la mini-app.</p>
        <div class="grid">
          <div class="f"><label>Nom de la boutique</label><input class="in" data-k="shopName" value="${esc(s.shopName)}" maxlength="60"></div>
          <div class="f"><label>Slogan</label><input class="in" data-k="tagline" value="${esc(s.tagline)}" maxlength="140"></div>
          <div class="f full"><label>Logo (carré conseillé)</label>${imgField('logo', s.logo, { max: 512 })}</div>
        </div>
      </div>
      <div class="sec card" id="gen2">
        <h2>Commandes & livraison</h2><p class="hint">Les commandes sont envoyées à ce numéro WhatsApp. Prix en euros.</p>
        <div class="grid">
          <div class="f"><label>Numéro WhatsApp (format international)</label><input class="in" data-k="whatsapp" value="${esc(s.whatsapp)}" placeholder="33612345678"><small>Ex. 33612345678 pour la France (sans + ni 0)</small></div>
          <div class="f"><label>Frais de livraison</label><div class="suffix"><input class="in" type="number" step="0.01" min="0" data-k="deliveryFee" value="${s.deliveryFee}"><span>€</span></div></div>
          <div class="f"><label>Livraison offerte dès (0 = jamais)</label><div class="suffix"><input class="in" type="number" step="0.01" min="0" data-k="freeDeliveryFrom" value="${s.freeDeliveryFrom}"><span>€</span></div></div>
          <div class="f"><label>Minimum de commande (0 = aucun)</label><div class="suffix"><input class="in" type="number" step="0.01" min="0" data-k="minOrder" value="${s.minOrder}"><span>€</span></div></div>
          <div class="f full"><label>Message affiché dans le panier</label><textarea class="in" data-k="cartNote" maxlength="400">${esc(s.cartNote)}</textarea></div>
          <label class="check f full"><input type="checkbox" data-k="reviewsEnabled" ${s.reviewsEnabled ? 'checked' : ''}> Autoriser les clients à publier des avis (validation requise)</label>
        </div>
      </div>
      <div class="sec card" id="gen3">
        <h2>🔑 Accès admin spécial (Telegram)</h2>
        <p class="hint">Les comptes Telegram listés ici voient un bouton <b>⚙️ Admin</b> dans la boutique et entrent dans ce panel <b>sans mot de passe</b>. Ils peuvent aussi taper <code>/admin</code> dans le bot.<br>
        Pour connaître votre ID : envoyez <code>/id</code> à votre bot.</p>
        <div class="f"><label>IDs Telegram administrateurs (séparés par des virgules)</label>
          <input class="in" data-k="adminTelegramIds" value="${esc((s.adminTelegramIds || []).join(', '))}" placeholder="123456789, 987654321" inputmode="numeric"></div>
        <p class="hint" style="margin:12px 0 0">Depuis un navigateur : ouvrez <code>/admin</code> avec votre mot de passe, ou appuyez 5 fois rapidement sur le logo de la boutique.</p>
      </div>
      <div class="actions"><button class="btn" id="save">💾 Enregistrer</button></div>
    </div>${previewPanel()}</div>`;
    const collect = () => ({ ...readFields($('#gen')), ...readFields($('#gen2')), ...readFields($('#gen3')) });
    main.oninput = () => postPreview(collect());
    $('#save').onclick = (e) => withBusy(e.currentTarget, async () => {
      const r = await api('PUT', '/api/admin/settings', collect());
      D.settings = r.settings;
      $('.top .brand').textContent = D.settings.shopName;
      postPreview(D.settings, true);
      toast('Paramètres enregistrés ✓');
    });
  }

  /* ================= THÈME ================= */
  function tTheme(main) {
    const t = D.settings.theme;
    const range = (k, label, min, max, step, fmt) => `<div class="f"><div class="range-row"><label>${label}</label><b data-out="${k}">${fmt(t[k])}</b></div>
      <input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${t[k]}"></div>`;
    const pct = (v) => Math.round(v * 100) + ' %';
    const FMT = { overlay: pct, panelOpacity: pct, blur: (v) => v + ' px', glow: (v) => '×' + Number(v).toFixed(1) };
    main.innerHTML = `<div class="layout with-preview"><div>
      <div class="sec card" id="th">
        <h2>Palette néon</h2><p class="hint">Choisissez un preset puis ajustez chaque couleur. L'aperçu se met à jour en direct.</p>
        <div class="presets">${Object.entries(PRESETS).map(([id, p]) => `<button class="preset ${t.preset === id ? 'on' : ''}" data-preset="${id}"><i style="background:linear-gradient(90deg,${p.accent},${p.accent2})"></i>${p.name}</button>`).join('')}</div>
        <input type="hidden" data-k="preset" value="${esc(t.preset)}">
        <div class="grid">
          <div class="f"><label>Couleur principale</label><input class="in" type="color" data-k="accent" value="${t.accent}"></div>
          <div class="f"><label>Couleur secondaire</label><input class="in" type="color" data-k="accent2" value="${t.accent2}"></div>
          <div class="f"><label>Néon des grammes</label><input class="in" type="color" data-k="gramColor" value="${t.gramColor}"></div>
          <div class="f"><label>Néon des prix (€)</label><input class="in" type="color" data-k="priceColor" value="${t.priceColor}"></div>
          <div class="f"><label>Couleur de fond</label><input class="in" type="color" data-k="bgColor" value="${t.bgColor}"></div>
          ${range('glow', 'Intensité lumineuse', 0, 2, 0.1, FMT.glow)}
        </div>
      </div>
      <div class="sec card" id="th2">
        <h2>Image de fond & lisibilité</h2><p class="hint">Ajoutez votre propre fond. Le voile et le flou derrière les textes garantissent la lisibilité.</p>
        <div class="f" style="margin-bottom:16px"><label>Image de fond personnalisée</label>${imgField('bgImage', t.bgImage, { wide: true, max: 1920 })}</div>
        <div class="grid">
          ${range('overlay', 'Voile sombre sur le fond', 0, 0.95, 0.05, FMT.overlay)}
          ${range('blur', 'Flou derrière les textes', 0, 40, 1, FMT.blur)}
          ${range('panelOpacity', 'Opacité des panneaux', 0, 1, 0.05, FMT.panelOpacity)}
          <label class="check f"><input type="checkbox" data-k="animatedBg" ${t.animatedBg ? 'checked' : ''}> Fond animé (halos + grille néon)</label>
        </div>
      </div>
      <div class="actions"><button class="btn ghost" id="reset">Réinitialiser</button><button class="btn" id="save">💾 Enregistrer le thème</button></div>
    </div>${previewPanel()}</div>`;

    const collect = () => ({ ...readFields($('#th')), ...readFields($('#th2')) });
    const update = () => {
      const v = collect();
      for (const k in FMT) { const o = $(`[data-out=${k}]`); if (o) o.textContent = FMT[k](v[k]); }
      postPreview({ theme: v });
    };
    main.oninput = (e) => {
      if (e.target.type === 'color') { $('[data-k=preset]').value = 'custom'; $$('.preset').forEach((b) => b.classList.remove('on')); }
      update();
    };
    $$('[data-preset]').forEach((b) => {
      b.onclick = () => {
        const p = PRESETS[b.dataset.preset];
        for (const k of ['accent', 'accent2', 'gramColor', 'priceColor', 'bgColor']) $(`[data-k=${k}]`).value = p[k];
        $('[data-k=preset]').value = b.dataset.preset;
        $$('.preset').forEach((x) => x.classList.toggle('on', x === b));
        update();
      };
    });
    $('#reset').onclick = () => { $('[data-preset=cyber]').click(); for (const [k, v] of Object.entries({ overlay: 0.55, blur: 14, panelOpacity: 0.45, glow: 1 })) $(`[data-k=${k}]`).value = v; $('[data-k=animatedBg]').checked = true; update(); };
    $('#save').onclick = (e) => withBusy(e.currentTarget, async () => {
      const r = await api('PUT', '/api/admin/settings', { theme: collect() });
      D.settings = r.settings;
      postPreview(D.settings, true);
      toast('Thème enregistré ✓');
    });
  }

  /* ================= CATÉGORIES ================= */
  function tCategories(main, items = D.categories) {
    main.innerHTML = `<div class="sec card">
      <h2>Catégories</h2><p class="hint">L'accueil affiche les catégories sous forme de tuiles avec image (3 par ligne). Glissez l'ordre avec ↑ ↓.</p>
      <div class="rows" id="rows">${items.map((c, i) => `<div class="row cat" data-row='${esc(JSON.stringify({ id: c.id }))}'>
        ${imgField('image', c.image, { max: 800 })}
        <div class="f"><label>Nom</label><input class="in" data-k="name" value="${esc(c.name)}" maxlength="40"><small>${D.products.filter((p) => p.categoryId === c.id).length} produit(s)</small></div>
        <div class="ctl"><button class="btn ghost sm" data-mv="-1" data-i="${i}" ${i ? '' : 'disabled'}>↑</button><button class="btn ghost sm" data-mv="1" data-i="${i}" ${i < items.length - 1 ? '' : 'disabled'}>↓</button><button class="btn danger sm" data-del="${i}">Supprimer</button></div>
      </div>`).join('') || '<div class="empty">Aucune catégorie</div>'}</div>
      <div class="actions"><button class="btn ghost" id="add">+ Ajouter une catégorie</button><button class="btn" id="save">💾 Enregistrer</button></div>
    </div>`;
    listControls(main, (list) => tCategories(main, list), () => ({ id: '', name: 'Nouvelle catégorie', image: '' }), (c) => {
      const n = D.products.filter((p) => p.categoryId === c.id).length;
      return !n || confirm(`${n} produit(s) sont dans cette catégorie. Ils resteront visibles sans catégorie. Supprimer ?`);
    });
    $('#save').onclick = (e) => withBusy(e.currentTarget, async () => {
      const r = await api('PUT', '/api/admin/categories', { items: readRows($('#rows')) });
      D.categories = r.items;
      tCategories(main);
      toast('Catégories enregistrées ✓');
    });
  }

  // Réordonner / supprimer / ajouter dans une liste en conservant les saisies en cours
  function listControls(main, rerender, blank, canDelete) {
    const cur = () => readRows($('#rows'));
    $$('[data-mv]', main).forEach((b) => { b.onclick = () => { const l = cur(); const i = +b.dataset.i; const j = i + +b.dataset.mv; [l[i], l[j]] = [l[j], l[i]]; rerender(l); }; });
    $$('[data-del]', main).forEach((b) => { b.onclick = () => { const l = cur(); const i = +b.dataset.del; if (canDelete && !canDelete(l[i])) return; l.splice(i, 1); rerender(l); toast('Supprimé — cliquez sur Enregistrer pour valider'); }; });
    $('#add', main).onclick = () => { const l = cur(); l.push(blank()); rerender(l); const rows = $$('[data-row]', main); rows[rows.length - 1].scrollIntoView({ behavior: 'smooth', block: 'center' }); };
  }

  /* ================= PRODUITS ================= */
  let pFilter = { q: '', cat: '' };
  function tProducts(main) {
    const cats = D.categories;
    const q = pFilter.q.toLowerCase();
    const list = D.products.filter((p) => (!pFilter.cat || p.categoryId === pFilter.cat) && (!q || p.name.toLowerCase().includes(q)));
    main.innerHTML = `<div class="sec card">
      <h2>Produits</h2><p class="hint">${D.products.length} produit(s). Chaque produit peut avoir plusieurs formats en grammes avec leur prix en euros.</p>
      <div class="bar">
        <input class="in" id="pq" placeholder="Rechercher…" value="${esc(pFilter.q)}">
        <select class="in" id="pc" style="flex:0 1 200px"><option value="">Toutes catégories</option>${cats.map((c) => `<option value="${esc(c.id)}" ${pFilter.cat === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
        <button class="btn" id="padd">+ Nouveau produit</button>
      </div>
      <div class="plist">${list.map((p) => {
        const c = cats.find((x) => x.id === p.categoryId);
        return `<div class="pitem ${p.active ? '' : 'off'}">
          <div class="th" style="${p.image ? `background-image:url('${esc(p.image)}')` : ''}"></div>
          <div class="info"><b>${esc(p.name)}</b><small>${c ? esc(c.name) : 'Sans catégorie'}${p.active ? '' : ' · masqué'}${p.badge ? ' · ' + esc(p.badge) : ''}</small>
          <small>${p.options.map((o) => `<span class="g">${g(o.grams)}</span> <span class="e">${eur(o.price)}</span>`).join(' · ') || '<span style="color:var(--err)">Aucun format</span>'}</small></div>
          <div class="ctl" style="display:flex;flex-direction:column;gap:6px"><button class="btn ghost sm" data-edit="${esc(p.id)}">Modifier</button><button class="btn ghost sm" data-dup="${esc(p.id)}">Dupliquer</button></div>
        </div>`;
      }).join('') || '<div class="empty">Aucun produit</div>'}</div>
    </div>`;
    $('#pq').oninput = (e) => { pFilter.q = e.target.value; const pos = e.target.selectionStart; tProducts(main); const n = $('#pq'); n.focus(); n.setSelectionRange(pos, pos); };
    $('#pc').onchange = (e) => { pFilter.cat = e.target.value; tProducts(main); };
    $('#padd').onclick = () => editProduct(main, null);
    $$('[data-edit]').forEach((b) => { b.onclick = () => editProduct(main, D.products.find((p) => p.id === b.dataset.edit)); });
    $$('[data-dup]').forEach((b) => {
      b.onclick = async () => {
        const p = D.products.find((x) => x.id === b.dataset.dup);
        await saveProducts([...D.products, { ...p, id: '', name: p.name + ' (copie)', active: false }], 'Produit dupliqué (masqué) ✓');
        tProducts(main);
      };
    });
  }

  async function saveProducts(items, msg) {
    const r = await api('PUT', '/api/admin/products', { items });
    D.products = r.items;
    toast(msg);
  }

  function editProduct(main, p) {
    const isNew = !p;
    p = p || { id: '', name: '', categoryId: pFilter.cat || (D.categories[0] && D.categories[0].id) || '', description: '', image: '', badge: '', active: true, options: [{ grams: 100, price: 10 }] };
    const optRow = (o) => `<div class="opt-row" data-opt>
      <div class="suffix"><input class="in" type="number" min="1" step="1" data-o="grams" value="${o.grams}" placeholder="Quantité"><span>g</span></div>
      <div class="suffix"><input class="in" type="number" min="0" step="0.01" data-o="price" value="${o.price}" placeholder="Prix"><span>€</span></div>
      <button type="button" class="btn danger sm" data-optdel>✕</button></div>`;
    openModal(`<h2>${isNew ? 'Nouveau produit' : 'Modifier le produit'}</h2>
      <form id="pform">
      <div class="grid">
        <div class="f"><label>Nom</label><input class="in" data-k="name" value="${esc(p.name)}" required maxlength="80"></div>
        <div class="f"><label>Catégorie</label><select class="in" data-k="categoryId"><option value="">— Sans catégorie —</option>${D.categories.map((c) => `<option value="${esc(c.id)}" ${c.id === p.categoryId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
        <div class="f full"><label>Description</label><textarea class="in" data-k="description" maxlength="2000">${esc(p.description)}</textarea></div>
        <div class="f full"><label>Image du produit</label>${imgField('image', p.image, { wide: true, max: 1200 })}</div>
        <div class="f"><label>Badge (optionnel)</label><input class="in" data-k="badge" value="${esc(p.badge)}" maxlength="16" placeholder="NOUVEAU, PROMO…"></div>
        <label class="check f" style="align-self:end;min-height:42px"><input type="checkbox" data-k="active" ${p.active ? 'checked' : ''}> Visible dans la boutique</label>
        <div class="f full"><label>Formats — quantité en grammes et prix en euros</label><div id="opts">${p.options.map(optRow).join('')}</div>
          <button type="button" class="btn ghost sm" id="optadd" style="align-self:flex-start">+ Ajouter un format</button></div>
      </div>
      <div class="actions">${isNew ? '' : '<button type="button" class="btn danger" id="pdel" style="margin-right:auto">Supprimer</button>'}
        <button type="button" class="btn ghost" data-act="modal-close">Annuler</button><button class="btn" type="submit">💾 Enregistrer</button></div>
      </form>`);
    const box = $('#modalBox');
    $('#optadd').onclick = () => { $('#opts').insertAdjacentHTML('beforeend', optRow({ grams: '', price: '' })); };
    box.addEventListener('click', (e) => { const d = e.target.closest('[data-optdel]'); if (d) d.closest('[data-opt]').remove(); });
    if (!isNew) {
      $('#pdel').onclick = async () => {
        if (!confirm(`Supprimer « ${p.name} » ?`)) return;
        try { await saveProducts(D.products.filter((x) => x.id !== p.id), 'Produit supprimé'); closeModal(); tProducts(main); } catch (e) { toast(e.message, true); }
      };
    }
    $('#pform').onsubmit = (e) => {
      e.preventDefault();
      const v = readFields($('#pform'));
      v.options = $$('[data-opt]').map((r) => ({ grams: Number($('[data-o=grams]', r).value), price: Number($('[data-o=price]', r).value) })).filter((o) => o.grams > 0);
      if (!v.name.trim()) return toast('Le nom est obligatoire', true);
      if (!v.options.length) return toast('Ajoutez au moins un format (grammes + prix)', true);
      const item = { ...p, ...v };
      const items = isNew ? [...D.products, item] : D.products.map((x) => (x.id === p.id ? item : x));
      withBusy(e.submitter, async () => { await saveProducts(items, 'Produit enregistré ✓'); closeModal(); tProducts(main); });
    };
  }

  /* ================= AVIS ================= */
  function tReviews(main, items = D.reviews) {
    main.innerHTML = `<div class="sec card">
      <h2>Avis & témoignages</h2><p class="hint">Les avis des clients arrivent en attente : cochez « Publié » pour les afficher.</p>
      <div class="rows" id="rows">${items.map((r, i) => `<div class="row rev" data-row='${esc(JSON.stringify({ id: r.id }))}' style="${r.approved ? '' : 'border-color:rgba(255,201,77,.5)'}">
        <div class="grid">
          <div class="f"><label>Nom</label><input class="in" data-k="name" value="${esc(r.name)}" maxlength="40"></div>
          <div class="f"><label>Note</label><select class="in" data-k="rating">${[5, 4, 3, 2, 1].map((n) => `<option value="${n}" ${r.rating === n ? 'selected' : ''}>${'★'.repeat(n)}${'☆'.repeat(5 - n)}</option>`).join('')}</select></div>
          <div class="f"><label>Date</label><input class="in" type="date" data-k="date" value="${esc(r.date)}"></div>
          <label class="check f" style="align-self:end;min-height:42px"><input type="checkbox" data-k="approved" ${r.approved ? 'checked' : ''}> Publié${r.approved ? '' : ' <span style="color:var(--warn)">(en attente)</span>'}</label>
          <div class="f full"><label>Avis</label><textarea class="in" data-k="text" maxlength="1000">${esc(r.text)}</textarea></div>
        </div>
        <div class="ctl" style="justify-content:flex-end"><button class="btn ghost sm" data-mv="-1" data-i="${i}" ${i ? '' : 'disabled'}>↑</button><button class="btn ghost sm" data-mv="1" data-i="${i}" ${i < items.length - 1 ? '' : 'disabled'}>↓</button><button class="btn danger sm" data-del="${i}">Supprimer</button></div>
      </div>`).join('') || '<div class="empty">Aucun avis</div>'}</div>
      <div class="actions"><button class="btn ghost" id="add">+ Ajouter un avis</button><button class="btn" id="save">💾 Enregistrer</button></div>
    </div>`;
    listControls(main, (l) => tReviews(main, l), () => ({ id: '', name: '', rating: 5, text: '', date: new Date().toISOString().slice(0, 10), approved: true }));
    $('#save').onclick = (e) => withBusy(e.currentTarget, async () => {
      const r = await api('PUT', '/api/admin/reviews', { items: readRows($('#rows')) });
      D.reviews = r.items;
      renderTabs();
      tReviews(main);
      toast('Avis enregistrés ✓');
    });
  }

  /* ================= RÉSEAUX ================= */
  function tSocials(main, items = D.socials) {
    main.innerHTML = `<div class="sec card">
      <h2>Réseaux sociaux</h2><p class="hint">Liens affichés sur la page « Réseaux » de la mini-app. L'URL doit commencer par https://</p>
      <div class="rows" id="rows">${items.map((s, i) => `<div class="row soc" data-row='${esc(JSON.stringify({ id: s.id }))}'>
        <div class="f"><label>Réseau</label><select class="in" data-k="type">${Object.entries(SOCIAL_TYPES).map(([k, v]) => `<option value="${k}" ${s.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="f"><label>Titre</label><input class="in" data-k="label" value="${esc(s.label)}" maxlength="40"></div>
        <div class="f"><label>Pseudo</label><input class="in" data-k="handle" value="${esc(s.handle)}" maxlength="60" placeholder="@moncompte"></div>
        <div class="f"><label>Lien</label><input class="in" data-k="url" value="${esc(s.url)}" placeholder="https://…"></div>
        <div class="ctl"><button class="btn ghost sm" data-mv="-1" data-i="${i}" ${i ? '' : 'disabled'}>↑</button><button class="btn ghost sm" data-mv="1" data-i="${i}" ${i < items.length - 1 ? '' : 'disabled'}>↓</button><button class="btn danger sm" data-del="${i}">✕</button></div>
      </div>`).join('') || '<div class="empty">Aucun réseau</div>'}</div>
      <div class="actions"><button class="btn ghost" id="add">+ Ajouter un réseau</button><button class="btn" id="save">💾 Enregistrer</button></div>
    </div>`;
    listControls(main, (l) => tSocials(main, l), () => ({ id: '', type: 'instagram', label: 'Instagram', handle: '', url: 'https://' }));
    main.querySelectorAll('[data-k=type]').forEach((sel) => {
      sel.onchange = () => { const lab = sel.closest('[data-row]').querySelector('[data-k=label]'); if (!lab.value || Object.values(SOCIAL_TYPES).includes(lab.value)) lab.value = SOCIAL_TYPES[sel.value]; };
    });
    $('#save').onclick = (e) => withBusy(e.currentTarget, async () => {
      const rows = readRows($('#rows'));
      const bad = rows.find((r) => !/^(https?:\/\/|tg:\/\/|mailto:|tel:)\S+$/i.test(r.url.trim()));
      if (bad) throw new Error(`Lien invalide pour « ${bad.label} » (doit commencer par https://)`);
      const r = await api('PUT', '/api/admin/socials', { items: rows });
      D.socials = r.items;
      tSocials(main);
      toast('Réseaux enregistrés ✓');
    });
  }

  /* ================= COMMANDES ================= */
  async function tOrders(main) {
    main.innerHTML = '<div class="empty">Chargement…</div>';
    let data;
    try { data = await api('GET', '/api/admin/orders'); } catch (e) { main.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    const { orders, statuses } = data;
    const ca = orders.filter((o) => o.status !== 'annulée').reduce((a, o) => a + o.total, 0);
    main.innerHTML = `<div class="sec card" style="display:flex;gap:24px;flex-wrap:wrap">
        <div><div class="muted">Commandes</div><div style="font:900 26px Orbitron">${orders.length}</div></div>
        <div><div class="muted">Nouvelles</div><div style="font:900 26px Orbitron;color:var(--accent)">${orders.filter((o) => o.status === 'nouvelle').length}</div></div>
        <div><div class="muted">Chiffre d'affaires</div><div class="e" style="font:900 26px Orbitron">${eur(ca)}</div></div>
        <div style="margin-left:auto;align-self:center"><button class="btn ghost sm" id="refresh">↻ Actualiser</button></div>
      </div>
      ${orders.map((o) => `<div class="order card">
        <div class="oh"><b>#${esc(o.id)}</b><span class="st st-${esc(o.status)}">${esc(o.status)}</span><span class="muted">${new Date(o.createdAt).toLocaleString('fr-FR')}</span><span class="sp"></span>
          <span class="flag">${o.delivered && o.delivered.whatsapp ? '✅ WhatsApp auto' : '🔗 WhatsApp via lien client'}${o.delivered && o.delivered.telegram ? ' · ✅ Telegram' : ''}</span>
          <select class="in" style="width:auto;min-height:34px;padding:4px 8px" data-status="${esc(o.id)}">${statuses.map((s) => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        <div class="cust"><span>👤 ${esc(o.customer.name)}</span><span>📞 ${esc(o.customer.phone)}</span>${o.customer.address ? `<span>📍 ${esc(o.customer.address)}</span>` : ''}${o.telegram ? `<span>✈️ ${o.telegram.username ? '@' + esc(o.telegram.username) : esc(o.telegram.name)} (${o.telegram.id})</span>` : ''}${o.customer.note ? `<span>📝 ${esc(o.customer.note)}</span>` : ''}</div>
        <table>${o.items.map((it) => `<tr><td>${esc(it.name)} — <span class="g">${g(it.grams)}</span> × ${it.qty}</td><td class="e">${eur(it.lineTotal)}</td></tr>`).join('')}
          <tr><td class="muted">Livraison</td><td>${o.delivery ? eur(o.delivery) : 'offerte'}</td></tr>
          <tr><td><b>Total</b> · <span class="g">${g(o.totalGrams)}</span></td><td class="e" style="font-size:16px">${eur(o.total)}</td></tr></table>
        <div class="actions" style="margin-top:8px">
          <a class="btn ghost sm" target="_blank" rel="noopener" href="https://wa.me/${esc(String(o.customer.phone).replace(/\D/g, '').replace(/^0/, '33'))}">💬 Contacter le client</a>
          <button class="btn danger sm" data-odel="${esc(o.id)}">Supprimer</button></div>
      </div>`).join('') || '<div class="sec card empty">Aucune commande pour le moment.</div>'}`;
    $('#refresh').onclick = () => tOrders(main);
    $$('[data-status]').forEach((s) => {
      s.onchange = async () => {
        try { await api('PATCH', `/api/admin/orders/${s.dataset.status}`, { status: s.value }); toast('Statut mis à jour ✓'); D.newOrders = (await api('GET', '/api/admin/data')).newOrders; renderTabs(); tOrders(main); } catch (e) { toast(e.message, true); }
      };
    });
    $$('[data-odel]').forEach((b) => {
      b.onclick = async () => {
        if (!confirm(`Supprimer la commande #${b.dataset.odel} ?`)) return;
        try { await api('DELETE', `/api/admin/orders/${b.dataset.odel}`); toast('Commande supprimée'); tOrders(main); } catch (e) { toast(e.message, true); }
      };
    });
  }

  /* ================= INTÉGRATIONS ================= */
  async function tIntegrations(main) {
    main.innerHTML = '<div class="empty">Chargement…</div>';
    let s;
    try { s = await api('GET', '/api/admin/status'); } catch (e) { main.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    const item = (state, title, desc) => `<div class="status-item"><span class="dot ${state}"></span><div><b>${title}</b><small>${desc}</small></div></div>`;
    const wa = s.whatsapp;
    const waAuto = wa.provider === 'callmebot' ? wa.callmebotKey : wa.provider === 'cloud' ? wa.cloud : false;
    main.innerHTML = `${s.defaultPassword ? '<div class="warnbox">⚠️ Vous utilisez le mot de passe admin par défaut. Définissez <code>ADMIN_PASSWORD</code> dans le fichier <code>.env</code> puis redémarrez le serveur.</div>' : ''}
      <div class="sec card"><h2>État des connexions</h2><p class="hint">Ces réglages se font dans le fichier <code>.env</code> (voir README).</p>
      <div class="status-list">
        ${item(s.bot ? 'ok' : s.botTokenSet ? 'ko' : 'mid', 'Bot Telegram', s.bot ? `Connecté : <a href="https://t.me/${esc(s.bot.username)}" target="_blank">@${esc(s.bot.username)}</a>` : s.botTokenSet ? 'Token invalide ou Telegram injoignable' : 'BOT_TOKEN non défini')}
        ${item(/^https:\/\//.test(s.webappUrl) ? 'ok' : 'ko', 'URL de la mini-app', s.webappUrl ? esc(s.webappUrl) : 'WEBAPP_URL non défini (URL https publique requise par Telegram)')}
        ${item(wa.number ? 'ok' : 'ko', 'Numéro WhatsApp de réception', wa.number ? esc(wa.number) : 'À renseigner dans l\'onglet Général')}
        ${item(waAuto ? 'ok' : 'mid', 'Envoi WhatsApp', wa.provider === 'link'
          ? 'Mode « lien » : le client envoie le récapitulatif pré-rempli en un clic. Pour un envoi 100 % automatique, configurez CallMeBot ou WhatsApp Cloud API.'
          : waAuto ? `Automatique via ${wa.provider === 'cloud' ? 'WhatsApp Cloud API' : 'CallMeBot'}` : `Mode ${esc(wa.provider)} sélectionné mais identifiants manquants`)}
        ${item(s.adminChatId ? 'ok' : 'mid', 'Copie des commandes sur Telegram', s.adminChatId ? 'Activée' : 'Optionnel : envoyez /id au bot et copiez la valeur dans TELEGRAM_ADMIN_CHAT_ID')}
        ${item(s.requireTelegram ? 'ok' : 'mid', 'Commandes réservées à Telegram', s.requireTelegram ? 'Oui (signature Telegram vérifiée)' : 'Non — la boutique fonctionne aussi dans un navigateur')}
      </div>
      <div class="actions"><button class="btn" id="test">📨 Envoyer un message de test</button></div></div>`;
    $('#test').onclick = (e) => withBusy(e.currentTarget, async () => {
      const r = await api('POST', '/api/admin/test');
      const w = r.whatsapp.ok ? 'WhatsApp ✓' : r.whatsapp.mode === 'link' ? 'WhatsApp : mode lien (pas d\'envoi auto)' : 'WhatsApp ✗ ' + (r.whatsapp.error || '');
      const t = r.telegram.ok ? 'Telegram ✓' : 'Telegram : ' + (r.telegram.error || '✗');
      toast(`${w} · ${t}`, !r.whatsapp.ok && !r.telegram.ok);
    });
  }

  boot();
})();
