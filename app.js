/* Boutique néon — mini-app Telegram (client) */
(() => {
  'use strict';

  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg) {
    try { tg.ready(); tg.expand(); tg.disableVerticalSwipes && tg.disableVerticalSwipes(); } catch (e) { /* hors Telegram */ }
  }

  const $ = (s, r = document) => r.querySelector(s);
  const app = $('#app');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const eurFmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
  const eur = (n) => eurFmt.format(n || 0);
  const g = (n) => new Intl.NumberFormat('fr-FR').format(n || 0) + ' g';
  const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const haptic = (t = 'light') => { try { tg && tg.HapticFeedback && tg.HapticFeedback.impactOccurred(t); } catch (e) { /* */ } };
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* */ } },
  };

  const S = {
    data: null,
    isAdmin: false,
    view: 'home',
    cat: '',
    q: '',
    cart: store.get('cart', []), // [{ pid, grams, qty }]
    sheet: null,
    order: null,
    busy: false,
  };

  /* ---------------- thème ---------------- */
  const hexRgb = (h) => { const n = parseInt(String(h).slice(1), 16); return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`; };
  function applyTheme(s) {
    const t = s.theme || {};
    const r = document.documentElement.style;
    const set = (k, v) => { if (v) { r.setProperty('--' + k, v); r.setProperty('--' + k + '-rgb', hexRgb(v)); } };
    set('accent', t.accent); set('accent2', t.accent2); set('gram', t.gramColor); set('price', t.priceColor);
    r.setProperty('--bg', t.bgColor || '#05060f');
    r.setProperty('--blur', (t.blur ?? 14) + 'px');
    r.setProperty('--panel', t.panelOpacity ?? 0.45);
    r.setProperty('--overlay', t.overlay ?? 0.55);
    r.setProperty('--glow', t.glow ?? 1);
    const bgi = $('#bgImage');
    bgi.classList.toggle('on', !!t.bgImage);
    bgi.style.backgroundImage = t.bgImage ? `url("${t.bgImage}")` : '';
    $('#bg').classList.toggle('hidden-fx', !!t.bgImage && !t.animatedBg);
    $('#bg').classList.toggle('static', !t.animatedBg);
    document.title = s.shopName || 'Boutique';
    const meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.content = t.bgColor || '#05060f';
    try { if (tg) { tg.setHeaderColor(t.bgColor || '#05060f'); tg.setBackgroundColor(t.bgColor || '#05060f'); } } catch (e) { /* */ }
  }

  /* ---------------- données ---------------- */
  async function load() {
    try {
      const r = await fetch('/api/shop', { cache: 'no-store' });
      if (!r.ok) throw new Error();
      S.data = await r.json();
      applyTheme(S.data.settings);
      pruneCart();
      render();
    } catch (e) {
      app.innerHTML = `<div class="empty view"><div class="ico">📡</div><h3>Connexion impossible</h3><p>Vérifiez votre connexion puis réessayez.</p><button class="btn" data-act="reload">Réessayer</button></div>`;
    }
  }
  const product = (id) => S.data.products.find((p) => p.id === id);
  const category = (id) => S.data.categories.find((c) => c.id === id);
  const minOpt = (p) => p.options.reduce((a, o) => (o.price < a.price ? o : a), p.options[0]);

  /* ---------------- panier ---------------- */
  function pruneCart() {
    S.cart = S.cart.filter((it) => { const p = product(it.pid); return p && p.options.some((o) => o.grams === it.grams); });
    saveCart(false);
  }
  function saveCart(bump = true) {
    store.set('cart', S.cart);
    const n = S.cart.reduce((a, it) => a + it.qty, 0);
    const b = $('#cartBadge');
    b.hidden = !n;
    b.textContent = n > 99 ? '99+' : n;
    if (bump) { b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
  }
  function addToCart(pid, grams, qty) {
    const it = S.cart.find((x) => x.pid === pid && x.grams === grams);
    if (it) it.qty = Math.min(99, it.qty + qty); else S.cart.push({ pid, grams, qty });
    saveCart();
    haptic('medium');
    const p = product(pid);
    toast(`✓ ${p.name} · ${g(grams)} ajouté au panier`);
  }
  function cartLines() {
    return S.cart.map((it) => {
      const p = product(it.pid);
      const o = p.options.find((x) => x.grams === it.grams);
      return { ...it, p, price: o.price, total: o.price * it.qty };
    });
  }
  function totals() {
    const s = S.data.settings;
    const lines = cartLines();
    const subtotal = Math.round(lines.reduce((a, l) => a + l.total, 0) * 100) / 100;
    const delivery = !lines.length ? 0 : s.freeDeliveryFrom > 0 && subtotal >= s.freeDeliveryFrom ? 0 : s.deliveryFee;
    return { lines, subtotal, delivery, total: subtotal + delivery, grams: lines.reduce((a, l) => a + l.grams * l.qty, 0) };
  }

  /* ---------------- vues ---------------- */
  const imgOr = (src, alt, cls = '') => (src ? `<img class="${cls}" src="${esc(src)}" alt="${esc(alt)}" loading="lazy">` : `<div class="ph ${cls}">${esc((alt || '?').slice(0, 1))}</div>`);

  function vHome() {
    const s = S.data.settings;
    return `<div class="view">
      <header class="hero glass">
        ${S.isAdmin ? '<button class="admin-btn" data-act="admin">⚙️ Admin</button>' : ''}
        ${s.logo ? `<img class="logo" src="${esc(s.logo)}" alt="Logo" data-act="logo-tap">` : `<div class="logo fallback" data-act="logo-tap">${esc(s.shopName.slice(0, 1))}</div>`}
        <div><h1 class="shop-name">${esc(s.shopName)}</h1>${s.tagline ? `<p class="tagline">${esc(s.tagline)}</p>` : ''}</div>
      </header>
      <label class="search glass">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input id="search" type="search" placeholder="Rechercher un produit…" value="${esc(S.q)}" autocomplete="off" enterkeyhint="search">
        <button class="icon-btn" data-act="clear-search" ${S.q ? '' : 'hidden'} aria-label="Effacer">✕</button>
      </label>
      <section>
        <div class="sec-head"><h2 id="prodTitle">Produits</h2><span class="count" id="prodCount"></span></div>
        <div id="products"></div>
      </section>
    </div>`;
  }

  function filteredProducts() {
    const q = norm(S.q.trim());
    return S.data.products.filter((p) => {
      if (S.cat && p.categoryId !== S.cat) return false;
      if (!q) return true;
      const c = category(p.categoryId);
      return norm(p.name + ' ' + p.description + ' ' + (c ? c.name : '') + ' ' + p.badge).includes(q);
    });
  }

  const cardHtml = (p) => {
    const o = minOpt(p);
    return `<article class="card glass" data-act="open" data-id="${esc(p.id)}">
      <div class="img">${imgOr(p.image, p.name)}${p.badge ? `<span class="tag">${esc(p.badge)}</span>` : ''}</div>
      <div class="body">
        <div class="name">${esc(p.name)}</div>
        <div><span class="chip grams">${g(o.grams)}</span></div>
        <div class="row">
          <div>${p.options.length > 1 ? '<span class="from">à partir de</span>' : ''}<span class="price">${eur(o.price)}</span></div>
          <button class="add-mini" data-act="quick-add" data-id="${esc(p.id)}" aria-label="Ajouter">+</button>
        </div>
      </div>
    </article>`;
  };

  // Chaque catégorie affiche ses produits juste en dessous
  function renderProducts() {
    const el = $('#products');
    if (!el) return;
    const list = filteredProducts();
    $('#prodCount').textContent = `${list.length} article${list.length > 1 ? 's' : ''}`;
    if (!list.length) {
      el.innerHTML = `<div class="empty glass"><div class="ico">🔍</div><h3>Aucun résultat</h3><p>Essayez un autre mot-clé.</p></div>`;
      return;
    }
    const groups = S.data.categories.map((c) => ({ c, items: list.filter((p) => p.categoryId === c.id) }));
    const other = list.filter((p) => !category(p.categoryId));
    if (other.length) groups.push({ c: { id: 'autres', name: 'Autres produits', image: '' }, items: other });
    el.innerHTML = groups.filter((gr) => gr.items.length).map(({ c, items }) => `<div class="group" id="grp-${esc(c.id)}">
      <div class="group-head glass">
        ${c.image ? `<img src="${esc(c.image)}" alt="">` : '<span class="gh-ph">✦</span>'}
        <div><h3>${esc(c.name)}</h3><small>${items.length} produit${items.length > 1 ? 's' : ''}</small></div>
      </div>
      <div class="products">${items.map(cardHtml).join('')}</div>
    </div>`).join('');
  }

  function vCart() {
    const t = totals();
    const s = S.data.settings;
    if (!t.lines.length) {
      return `<div class="view"><h1 class="page-title">Panier</h1>
        <div class="empty glass"><div class="ico">🛒</div><h3>Votre panier est vide</h3><p>Découvrez nos produits et ajoutez vos favoris.</p>
        <button class="btn" data-act="nav" data-view="home">Voir la boutique</button></div></div>`;
    }
    const c = store.get('customer', {});
    const tgUser = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
    const name = c.name || (tgUser ? [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') : '');
    const missing = s.freeDeliveryFrom > 0 && t.delivery > 0 ? s.freeDeliveryFrom - t.subtotal : 0;
    return `<div class="view"><h1 class="page-title">Panier</h1>
      ${t.lines.map((l) => `<div class="line glass">
        ${imgOr(l.p.image, l.p.name)}
        <div class="info">
          <div class="name">${esc(l.p.name)}</div>
          <div class="sub"><span class="chip grams">${g(l.grams)}</span><span class="muted">× ${eur(l.price)}</span></div>
          <button class="del" data-act="cart-del" data-id="${esc(l.pid)}" data-g="${l.grams}" style="align-self:flex-start">Retirer</button>
        </div>
        <div class="right">
          <span class="price">${eur(l.total)}</span>
          <div class="stepper"><button data-act="cart-qty" data-d="-1" data-id="${esc(l.pid)}" data-g="${l.grams}">−</button><span>${l.qty}</span><button data-act="cart-qty" data-d="1" data-id="${esc(l.pid)}" data-g="${l.grams}">+</button></div>
        </div>
      </div>`).join('')}
      <div class="summary glass">
        <div class="r"><span>Poids total</span><span class="grams">${g(t.grams)}</span></div>
        <div class="r"><span>Sous-total</span><span class="price">${eur(t.subtotal)}</span></div>
        <div class="r"><span>Livraison</span>${t.delivery ? `<span class="price">${eur(t.delivery)}</span>` : '<span class="price">Offerte</span>'}</div>
        ${missing > 0 ? `<div class="r muted" style="font-size:13px"><span>Plus que ${eur(missing)} pour la livraison offerte</span></div>` : ''}
        <div class="r total"><span>Total</span><span class="price big">${eur(t.total)}</span></div>
      </div>
      <form class="form glass" id="checkout" novalidate>
        <p class="lbl">Vos coordonnées</p>
        <div class="field"><label for="f-name">Nom complet *</label><input class="input" id="f-name" name="name" required maxlength="80" value="${esc(name)}" autocomplete="name"></div>
        <div class="field"><label for="f-phone">Téléphone (WhatsApp) *</label><input class="input" id="f-phone" name="phone" type="tel" required maxlength="30" value="${esc(c.phone || '')}" autocomplete="tel" placeholder="+33 6 12 34 56 78"></div>
        <div class="field"><label for="f-address">Adresse de livraison</label><textarea class="input" id="f-address" name="address" maxlength="300" autocomplete="street-address" placeholder="N°, rue, code postal, ville">${esc(c.address || '')}</textarea></div>
        <div class="field"><label for="f-note">Note (facultatif)</label><input class="input" id="f-note" name="note" maxlength="500" placeholder="Créneau, instructions…"></div>
        ${s.cartNote ? `<div class="note">${esc(s.cartNote)}</div>` : ''}
        <button class="btn wa" type="submit" id="orderBtn">${waIcon} Commander · ${eur(t.total)}</button>
      </form>
    </div>`;
  }

  const waIcon = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.2c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.4.6-.4.4c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.4 1.5.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.7-.1 1.3z"/></svg>';

  function vSuccess() {
    const o = S.order;
    const auto = o.whatsappSent;
    return `<div class="view"><div class="success glass">
      <div class="check">✓</div>
      <h2>Commande ${auto ? 'envoyée' : 'enregistrée'} !</h2>
      <p>Référence <span class="oid">#${esc(o.orderId)}</span> · Total <span class="price">${eur(o.total)}</span></p>
      <p>${auto
        ? 'Vos détails de commande ont été transmis automatiquement sur WhatsApp. Nous vous recontactons très vite pour finaliser.'
        : 'Dernière étape : envoyez le récapitulatif sur WhatsApp pour finaliser le paiement et la livraison.'}</p>
      <div class="stack">
        ${o.waLink ? `<button class="btn wa" data-act="open-wa">${waIcon} ${auto ? 'Discuter sur WhatsApp' : 'Envoyer sur WhatsApp'}</button>` : ''}
        <button class="btn ghost" data-act="nav" data-view="home">Retour à la boutique</button>
      </div>
    </div></div>`;
  }

  const stars = (n) => `<span class="stars">${'★'.repeat(n)}<span class="off">${'★'.repeat(5 - n)}</span></span>`;

  function vReviews() {
    const r = S.data.reviews;
    const avg = r.length ? r.reduce((a, x) => a + x.rating, 0) / r.length : 0;
    const date = (d) => { try { return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return d; } };
    return `<div class="view"><h1 class="page-title">Avis clients</h1>
      <div class="rating-hero glass">
        <div class="score">${avg ? avg.toFixed(1).replace('.', ',') : '–'}</div>
        <div>${stars(Math.round(avg))}<div class="muted" style="font-size:13px;margin-top:4px">${r.length} avis vérifié${r.length > 1 ? 's' : ''}</div></div>
      </div>
      ${S.data.settings.reviewsEnabled ? '<button class="btn" data-act="review-new" style="margin-bottom:16px">★ Laisser un avis</button>' : ''}
      ${r.length ? r.map((x) => `<div class="review glass">
        <div class="top"><div class="avatar">${esc(x.name.slice(0, 1).toUpperCase())}</div>
        <div class="who"><b>${esc(x.name)}</b><small>${esc(date(x.date))}</small></div>${stars(x.rating)}</div>
        <p>${esc(x.text)}</p></div>`).join('') : '<div class="empty glass"><div class="ico">💬</div><h3>Pas encore d\'avis</h3><p>Soyez le premier à donner votre avis !</p></div>'}
    </div>`;
  }

  const SOCIAL = {
    instagram: ['#ff3fa4', '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".6" fill="currentColor"/>'],
    tiktok: ['#25f4ee', '<path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 3c.5 2.6 2.3 4.3 5 4.5"/>'],
    telegram: ['#2aabee', '<path d="m21 4-18 7.2 6 2.3L18 7l-7 7.6.3 5.4 3-4 4.2 3z"/>'],
    snapchat: ['#fffc00', '<path d="M12 3c3 0 5 2.2 5 5v2.4l1.8-.5c.5 0 .8.6.3.9l-2 1.2c.6 1.8 2 3.1 3.6 3.6-.3.8-1.5 1-2.5 1.1l-.4 1.3-1.9-.2c-1.2 0-2 1.2-3.9 1.2s-2.7-1.2-3.9-1.2l-1.9.2-.4-1.3c-1-.1-2.2-.3-2.5-1.1 1.6-.5 3-1.8 3.6-3.6l-2-1.2c-.5-.3-.2-.9.3-.9l1.8.5V8c0-2.8 2-5 5-5z"/>'],
    whatsapp: ['#25d366', '<path d="M4 20l1.3-4A8 8 0 1 1 8 18.7z"/><path d="M9 9.5c.3 2 2.5 4.3 5 5l1-1.3-1.8-.9-.8.7c-.9-.4-1.7-1.2-2.1-2.1l.7-.8-.9-1.8z"/>'],
    facebook: ['#3b8bff', '<path d="M15 3h-2.5A3.5 3.5 0 0 0 9 6.5V10H6.5v3.5H9V21h3.5v-7.5H15l.5-3.5h-3V7a1 1 0 0 1 1-1H15z"/>'],
    x: ['#e8ecff', '<path d="M4 4l16 16M20 4 4 20"/>'],
    youtube: ['#ff2d55', '<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="m10 9 5 3-5 3z" fill="currentColor"/>'],
    signal: ['#4d8dff', '<circle cx="12" cy="12" r="8"/><path d="M5 19l-1.5 2 3-.7"/>'],
    website: ['var(--accent)', '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9S14.5 18.3 12 21c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/>'],
  };

  function vSocials() {
    const list = S.data.socials;
    return `<div class="view"><h1 class="page-title">Nos réseaux</h1>
      <p class="muted" style="margin:-8px 2px 16px">Suivez-nous pour les nouveautés, promos et arrivages.</p>
      ${list.length ? `<div class="socials">${list.map((s) => {
        const [c, ic] = SOCIAL[s.type] || SOCIAL.website;
        return `<a class="social glass" style="--c:${c}" href="${esc(s.url)}" data-act="link" target="_blank" rel="noopener">
          <span class="ic"><svg viewBox="0 0 24 24">${ic}</svg></span><b>${esc(s.label)}</b>${s.handle ? `<small>${esc(s.handle)}</small>` : ''}</a>`;
      }).join('')}</div>` : '<div class="empty glass"><div class="ico">🔗</div><h3>Bientôt disponible</h3><p>Nos réseaux arrivent très vite.</p></div>'}
    </div>`;
  }

  function render() {
    if (!S.data) return;
    const views = { home: vHome, cart: vCart, reviews: vReviews, socials: vSocials, success: vSuccess };
    app.innerHTML = (views[S.view] || vHome)();
    if (S.view === 'home') renderProducts();
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === (S.view === 'success' ? 'cart' : S.view)));
    syncBack();
  }

  function go(view) {
    if (S.view === view && view === 'home') { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    S.view = view;
    render();
    window.scrollTo(0, 0);
  }

  /* ---------------- feuilles ---------------- */
  function openSheet(html) {
    $('#sheetPanel').innerHTML = `<div class="grab"></div><button class="sheet-close" data-act="close" aria-label="Fermer">✕</button>${html}`;
    $('#sheet').hidden = false;
    $('#sheetPanel').scrollTop = 0;
    document.body.style.overflow = 'hidden';
    syncBack();
  }
  function closeSheet() {
    $('#sheet').hidden = true;
    S.sheet = null;
    document.body.style.overflow = '';
    syncBack();
  }

  function renderProductSheet() {
    const { pid, grams, qty } = S.sheet;
    const p = product(pid);
    const o = p.options.find((x) => x.grams === grams);
    const c = category(p.categoryId);
    openSheet(`${p.image ? `<img class="pd-img" src="${esc(p.image)}" alt="${esc(p.name)}">` : ''}
      <div class="pd">
        ${c ? `<p class="lbl" style="color:var(--accent)">${esc(c.name)}</p>` : ''}
        <h3>${esc(p.name)}</h3>
        ${p.description ? `<p class="desc">${esc(p.description)}</p>` : ''}
        <p class="lbl">Quantité</p>
        <div class="opts">${p.options.map((x) => `<button class="opt ${x.grams === grams ? 'sel' : ''}" data-act="pick" data-g="${x.grams}">
          <span class="grams">${g(x.grams)}</span><span class="price">${eur(x.price)}</span></button>`).join('')}</div>
        <div class="pd-foot">
          <div class="stepper"><button data-act="sheet-qty" data-d="-1">−</button><span>${qty}</span><button data-act="sheet-qty" data-d="1">+</button></div>
          <button class="btn" data-act="sheet-add">Ajouter · ${eur(o.price * qty)}</button>
        </div>
      </div>`);
  }

  function renderReviewSheet(rating = 5) {
    openSheet(`<form class="pd" id="reviewForm" style="padding-top:26px">
      <h3>Votre avis</h3><p class="muted" style="margin:0 0 12px">Il sera publié après validation.</p>
      <div class="star-pick" id="starPick">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-act="star" data-n="${n}" class="${n <= rating ? 'on' : ''}">★</button>`).join('')}</div>
      <input type="hidden" name="rating" value="${rating}">
      <div class="field"><label>Prénom</label><input class="input" name="name" required maxlength="40" value="${esc((tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.first_name) || '')}"></div>
      <div class="field"><label>Votre avis</label><textarea class="input" name="text" required maxlength="1000" placeholder="Qualité, livraison, service…"></textarea></div>
      <button class="btn" type="submit">Envoyer mon avis</button>
    </form>`);
  }

  /* ---------------- Telegram BackButton ---------------- */
  function syncBack() {
    if (!tg || !tg.BackButton) return;
    try { (!$('#sheet').hidden || S.view !== 'home') ? tg.BackButton.show() : tg.BackButton.hide(); } catch (e) { /* */ }
  }
  if (tg && tg.BackButton) tg.BackButton.onClick(() => { if (!$('#sheet').hidden) closeSheet(); else go('home'); });

  function openLink(url) {
    try {
      if (tg && tg.initData) {
        if (/^https:\/\/t\.me\//.test(url)) return tg.openTelegramLink(url);
        return tg.openLink(url);
      }
    } catch (e) { /* */ }
    window.open(url, '_blank', 'noopener');
  }

  /* ---------------- toast ---------------- */
  let toastT;
  function toast(msg, err) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.toggle('err', !!err);
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), 2400);
  }

  /* ---------------- actions ---------------- */
  const A = {
    reload: load,
    nav: (el) => { closeSheet(); go(el.dataset.view); },
    close: closeSheet,
    cat: (el) => {
      haptic();
      const grp = document.getElementById('grp-' + el.dataset.id);
      if (!grp) return toast(S.q ? 'Aucun résultat dans cette catégorie' : 'Aucun produit dans cette catégorie pour le moment');
      grp.scrollIntoView({ behavior: 'smooth', block: 'start' });
      grp.classList.remove('flash'); void grp.offsetWidth; grp.classList.add('flash');
    },
    admin: goAdmin,
    'logo-tap': () => { // accès discret : 5 appuis rapides sur le logo
      const now = Date.now();
      S.taps = (S.taps || []).filter((t) => now - t < 2000).concat(now);
      if (S.taps.length >= 5) { S.taps = []; goAdmin(); }
    },
    'clear-search': (el, e) => { e.preventDefault(); S.q = ''; $('#search').value = ''; el.hidden = true; renderProducts(); },
    open: (el) => { const p = product(el.dataset.id); S.sheet = { pid: p.id, grams: minOpt(p).grams, qty: 1 }; haptic(); renderProductSheet(); },
    'quick-add': (el, e) => {
      e.stopPropagation();
      const p = product(el.dataset.id);
      if (p.options.length > 1) return A.open(el);
      addToCart(p.id, p.options[0].grams, 1);
    },
    pick: (el) => { S.sheet.grams = Number(el.dataset.g); haptic('soft'); renderProductSheet(); },
    'sheet-qty': (el) => { S.sheet.qty = Math.max(1, Math.min(99, S.sheet.qty + Number(el.dataset.d))); haptic('soft'); renderProductSheet(); },
    'sheet-add': () => { const { pid, grams, qty } = S.sheet; addToCart(pid, grams, qty); closeSheet(); },
    'cart-qty': (el) => {
      const it = S.cart.find((x) => x.pid === el.dataset.id && x.grams === Number(el.dataset.g));
      if (!it) return;
      it.qty += Number(el.dataset.d);
      if (it.qty < 1) S.cart.splice(S.cart.indexOf(it), 1);
      it.qty = Math.min(99, it.qty);
      saveCart(false); haptic('soft'); keepForm(render);
    },
    'cart-del': (el) => { S.cart = S.cart.filter((x) => !(x.pid === el.dataset.id && x.grams === Number(el.dataset.g))); saveCart(false); haptic(); keepForm(render); },
    'open-wa': () => openLink(S.order.waLink),
    'review-new': () => renderReviewSheet(),
    star: (el) => { const n = Number(el.dataset.n); document.querySelectorAll('#starPick button').forEach((b) => b.classList.toggle('on', Number(b.dataset.n) <= n)); $('#reviewForm [name=rating]').value = n; haptic('soft'); },
    link: (el, e) => { e.preventDefault(); openLink(el.href); },
  };

  // Garde les champs saisis quand le panier est re-rendu
  function keepForm(fn) {
    const f = $('#checkout');
    const vals = f ? Object.fromEntries(new FormData(f)) : null;
    fn();
    const nf = $('#checkout');
    if (vals && nf) for (const [k, v] of Object.entries(vals)) if (nf.elements[k]) nf.elements[k].value = v;
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.tagName === 'INPUT') return;
    const fn = A[el.dataset.act];
    if (fn) fn(el, e);
  });

  document.addEventListener('input', (e) => {
    if (e.target.id !== 'search') return;
    S.q = e.target.value;
    const clr = $('[data-act=clear-search]');
    if (clr) clr.hidden = !S.q;
    renderProducts();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet();
    if (e.key === 'Enter' && e.target.id === 'search') e.target.blur();
  });

  document.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (e.target.id === 'checkout') return submitOrder(e.target);
    if (e.target.id === 'reviewForm') return submitReview(e.target);
  });

  async function submitOrder(form) {
    if (S.busy) return;
    const f = Object.fromEntries(new FormData(form));
    for (const k of ['name', 'phone', 'address', 'note']) f[k] = String(f[k] || '').trim();
    if (!f.name) { toast('Merci d\'indiquer votre nom', true); return form.elements.name.focus(); }
    if (f.phone.replace(/\D/g, '').length < 6) { toast('Numéro de téléphone invalide', true); return form.elements.phone.focus(); }
    store.set('customer', { name: f.name, phone: f.phone, address: f.address });
    const btn = $('#orderBtn');
    S.busy = true;
    btn.disabled = true;
    btn.textContent = 'Envoi en cours…';
    try {
      const r = await fetch('/api/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: S.cart.map((it) => ({ productId: it.pid, grams: it.grams, qty: it.qty })),
          customer: f,
          initData: (tg && tg.initData) || '',
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Erreur lors de la commande');
      S.order = j;
      S.cart = [];
      saveCart(false);
      try { tg && tg.HapticFeedback && tg.HapticFeedback.notificationOccurred('success'); } catch (er) { /* */ }
      go('success');
      if (!j.whatsappSent && j.waLink) setTimeout(() => openLink(j.waLink), 600);
    } catch (err) {
      toast(err.message, true);
      try { tg && tg.HapticFeedback && tg.HapticFeedback.notificationOccurred('error'); } catch (er) { /* */ }
      btn.disabled = false;
      btn.innerHTML = `${waIcon} Commander · ${eur(totals().total)}`;
    } finally {
      S.busy = false;
    }
  }

  async function submitReview(form) {
    const f = Object.fromEntries(new FormData(form));
    if (!String(f.name).trim() || !String(f.text).trim()) return toast('Merci de remplir tous les champs', true);
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const r = await fetch('/api/reviews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Erreur');
      closeSheet();
      toast('Merci ! Votre avis sera publié après validation ✨');
    } catch (err) { toast(err.message, true); btn.disabled = false; }
  }

  // Aperçu en direct depuis le panel admin (iframe même origine)
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data || e.data.type !== 'preview' || !S.data) return;
    S.data.settings = { ...S.data.settings, ...e.data.settings, theme: { ...S.data.settings.theme, ...(e.data.settings.theme || {}) } };
    applyTheme(S.data.settings);
    if (e.data.reload) return load();
    render();
  });

  function goAdmin() {
    try { if (tg && tg.initData) sessionStorage.setItem('tg_init', tg.initData); } catch (e) { /* */ }
    location.href = '/admin';
  }

  // Reconnaît l'admin quand la mini-app est ouverte depuis son compte Telegram
  async function checkAdmin() {
    if (!tg || !tg.initData) return;
    try {
      const r = await fetch('/api/me', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData: tg.initData }) });
      const j = await r.json();
      if (j.isAdmin) { S.isAdmin = true; if (S.view === 'home') render(); }
    } catch (e) { /* */ }
  }

  saveCart(false);
  load().then(checkAdmin);
})();
