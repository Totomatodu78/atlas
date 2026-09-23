// ============================================================================
//  Atlas : logique de l'application
// ============================================================================
import * as maplibregl from '../vendor/maplibre-gl.mjs';
import { SUPABASE_URL, SUPABASE_KEY, MAP_STYLE } from './config.js';

const PERSON_COLORS = ['#F08A24', '#169C8A'];   // abricot, lagon
const FALLBACK_COLOR = '#8A97A8';
const MAX_PHOTOS = 12;
const BUCKET = 'photos';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const configured = !/VOTRE/.test(SUPABASE_URL + SUPABASE_KEY);
let sb = null;

const state = {
  user: null,
  map: null,            // { id, name, invite_code }
  members: [],          // [{ user_id, display_name, color }]
  places: new Map(),    // id -> place
  markers: new Map(),   // id -> maplibre Marker
  filter: 'all',
  channel: null,
  urls: new Map(),      // chemin -> { url, exp }
  draft: null,
  detailId: null,
  ghost: null,
};
let globe = null;       // instance MapLibre
let globeReady = null;  // promesse résolue quand le globe est prêt
let pendingEmail = '';

// ---------------------------------------------------------------------------
// Utilitaires d'interface
// ---------------------------------------------------------------------------
function showView(name) {
  for (const v of $$('.view')) v.hidden = v.dataset.view !== name;
}

let toastTimer;
function toast(message, kind = 'info') {
  const t = $('#toast');
  t.textContent = message;
  t.dataset.kind = kind;
  t.hidden = false;
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => { t.hidden = true; }, 250);
  }, kind === 'error' ? 5000 : 3200);
}

function errorText(err) {
  const msg = String(err?.message || err || '');
  if (/failed to fetch|networkerror|load failed/i.test(msg)) return 'Connexion impossible. Vérifie ta connexion internet.';
  if (/token has expired|invalid|otp/i.test(msg) && /token|otp/i.test(msg)) return 'Code incorrect ou expiré. Demande un nouveau code.';
  if (/signups? not allowed|signup is disabled/i.test(msg)) return "Cette adresse n'est pas autorisée sur cette carte.";
  if (/rate limit|security purposes|too many/i.test(msg)) return 'Trop de demandes. Réessaie dans quelques minutes.';
  if (/row-level security|permission denied/i.test(msg)) return "Action refusée : tu n'as pas accès à cette carte.";
  if (/payload too large|maximum allowed size/i.test(msg)) return 'Photo trop lourde, même après réduction.';
  if (msg) return msg;
  return 'Une erreur est survenue. Réessaie.';
}

function setBusy(button, busy, label) {
  if (!button) return;
  if (busy) {
    button.dataset.label = button.textContent;
    button.textContent = label || 'Un instant…';
    button.disabled = true;
  } else {
    button.textContent = button.dataset.label || button.textContent;
    button.disabled = false;
  }
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'style') node.style.cssText = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c) node.append(c);
  return node;
}

const CLOSE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none"/></svg>';

// Feuilles
function openSheet(id) {
  const s = $('#' + id);
  s.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => s.classList.add('open')));
}
function closeSheet(id) {
  const s = $('#' + id);
  if (!s || s.hidden) return;
  s.classList.remove('open');
  setTimeout(() => { if (!s.classList.contains('open')) s.hidden = true; }, 320);
  if (id === 'sheet-edit' && !state.picking) clearGhost();
  if (id === 'sheet-detail') state.detailId = null;
}
document.addEventListener('click', (e) => {
  const closer = e.target.closest('[data-close]');
  if (closer) closeSheet(closer.closest('.sheet').id);
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!$('#lightbox').hidden) return closeLightbox();
  const open = $$('.sheet.open');
  if (open.length) closeSheet(open[open.length - 1].id);
});

// Dates
const fmtDay = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtMonth = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
const asDate = (d) => new Date(d + 'T12:00:00');
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Membres
function memberOf(userId) {
  return state.members.find((m) => m.user_id === userId)
    || { user_id: userId, display_name: 'Quelqu’un', color: FALLBACK_COLOR };
}

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------
async function boot() {
  registerServiceWorker();

  const join = new URLSearchParams(location.search).get('join');
  if (join) sessionStorage.setItem('atlas.join', join.toUpperCase().replace(/[^A-Z0-9]/g, ''));

  if (!configured) return showView('config');

  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });

  sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') location.replace(location.pathname);
  });

  const { data: { session } } = await sb.auth.getSession();
  if (!session) return showAuth();
  state.user = session.user;
  await enterApp();
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Connexion par code reçu par e-mail
// ---------------------------------------------------------------------------
function showAuth() {
  showView('auth');
  $('#form-email').hidden = false;
  $('#form-code').hidden = true;
  $('#input-email').focus();
}

$('#form-email').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#input-email').value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast('Adresse e-mail invalide.', 'error');
  const btn = e.submitter || $('#form-email .btn-primary');
  setBusy(btn, true, 'Envoi du code…');
  const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  setBusy(btn, false);
  if (error) return toast(errorText(error), 'error');
  pendingEmail = email;
  $('#code-email').textContent = email;
  $('#form-email').hidden = true;
  $('#form-code').hidden = false;
  $('#input-code').value = '';
  $('#input-code').focus();
});

$('#form-code').addEventListener('submit', async (e) => {
  e.preventDefault();
  const token = $('#input-code').value.replace(/\D/g, '');
  if (token.length < 6) return toast('Le code contient au moins 6 chiffres.', 'error');
  const btn = e.submitter || $('#form-code .btn-primary');
  setBusy(btn, true, 'Vérification…');
  const { data, error } = await sb.auth.verifyOtp({ email: pendingEmail, token, type: 'email' });
  setBusy(btn, false);
  if (error) return toast(errorText(error), 'error');
  state.user = data.user;
  await enterApp();
});

$('#btn-code-back').addEventListener('click', showAuth);

for (const b of $$('[data-action="logout"]')) {
  b.addEventListener('click', async () => {
    await sb.auth.signOut();
    localStorage.removeItem('atlas.map');
    location.replace(location.pathname);
  });
}

// ---------------------------------------------------------------------------
// Choix de la carte : créer ou rejoindre
// ---------------------------------------------------------------------------
async function enterApp() {
  showView('loading');
  const { data, error } = await sb
    .from('map_members')
    .select('map_id, maps ( id, name, invite_code )')
    .eq('user_id', state.user.id);

  if (error) {
    toast(errorText(error), 'error');
    return showAuth();
  }

  const pending = sessionStorage.getItem('atlas.join');
  if (!data.length || pending) return showOnboard(pending);

  const stored = localStorage.getItem('atlas.map');
  const row = data.find((r) => r.map_id === stored) || data[0];
  await openMap(row.maps);
}

function showOnboard(code) {
  showView('onboard');
  selectTab(code ? 'join' : 'create');
  if (code) $('#join-code').value = code;
}

function selectTab(name) {
  for (const t of $$('.segment')) t.setAttribute('aria-selected', String(t.dataset.tab === name));
  for (const p of $$('[data-panel]')) p.hidden = p.dataset.panel !== name;
}
for (const t of $$('.segment')) t.addEventListener('click', () => selectTab(t.dataset.tab));

$('#form-create').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#create-name').value.trim() || 'Nos voyages';
  const me = $('#create-me').value.trim();
  if (!me) return toast('Indique ton prénom.', 'error');
  const btn = e.submitter || e.target.querySelector('[type=submit]');
  setBusy(btn, true, 'Création…');
  const { error } = await sb.rpc('create_map', { p_name: name, p_display_name: me });
  setBusy(btn, false);
  if (error) return toast(errorText(error), 'error');
  await afterJoin();
  openSheet('sheet-menu');
});

$('#form-join').addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = $('#join-code').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const me = $('#join-me').value.trim();
  if (!code) return toast("Indique le code d'invitation.", 'error');
  if (!me) return toast('Indique ton prénom.', 'error');
  const btn = e.submitter || e.target.querySelector('[type=submit]');
  setBusy(btn, true, 'Connexion à la carte…');
  const { data: mapId, error } = await sb.rpc('join_map', { p_code: code, p_display_name: me });
  setBusy(btn, false);
  if (error) return toast(errorText(error), 'error');
  localStorage.setItem('atlas.map', mapId);
  await afterJoin();
  toast('Bienvenue sur la carte !');
});

async function afterJoin() {
  sessionStorage.removeItem('atlas.join');
  if (location.search) history.replaceState(null, '', location.pathname);
  await enterApp();
}

// ---------------------------------------------------------------------------
// Ouverture d'une carte
// ---------------------------------------------------------------------------
async function openMap(m) {
  state.map = m;
  localStorage.setItem('atlas.map', m.id);
  $('#map-title').textContent = m.name;
  $('#menu-title').textContent = m.name;
  document.title = `${m.name} · Atlas`;

  await loadMembers();
  showView('app');
  initGlobe();
  await loadPlaces();
  subscribeRealtime();
}

async function loadMembers() {
  const { data, error } = await sb
    .from('map_members')
    .select('user_id, display_name, joined_at')
    .eq('map_id', state.map.id)
    .order('joined_at');
  if (error) return toast(errorText(error), 'error');
  state.members = data.map((m, i) => ({ ...m, color: PERSON_COLORS[i] || FALLBACK_COLOR }));
  renderMenu();
  renderChips();
}

async function loadPlaces() {
  const { data, error } = await sb.from('places').select('*').eq('map_id', state.map.id);
  if (error) return toast(errorText(error), 'error');
  const ids = new Set(data.map((p) => p.id));
  for (const id of [...state.places.keys()]) if (!ids.has(id)) removePlace(id, false);
  for (const p of data) state.places.set(p.id, p);

  // Toutes les miniatures en une seule requête
  await signedUrls(data.filter((p) => p.photos.length).map((p) => thumbPath(p, p.photos[0])));
  for (const [id, mk] of state.markers) { mk.remove(); state.markers.delete(id); }
  refresh();
}

function subscribeRealtime() {
  if (state.channel) sb.removeChannel(state.channel);
  state.channel = sb
    .channel('places-' + state.map.id)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'places', filter: `map_id=eq.${state.map.id}` },
      onRealtime)
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'places', filter: `map_id=eq.${state.map.id}` },
      onRealtime)
    // Les suppressions ne sont pas filtrables côté Supabase : on ne reçoit que l'identifiant,
    // et on ignore ceux qui ne sont pas sur notre carte.
    .on('postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'places' },
      onRealtime)
    .subscribe();
}

async function onRealtime(payload) {
  if (payload.eventType === 'DELETE') {
    if (payload.old?.id && state.places.has(payload.old.id)) removePlace(payload.old.id);
    return;
  }
  const p = payload.new;
  if (!p || p.map_id !== state.map.id) return;
  const isNew = !state.places.has(p.id);
  if (!state.members.some((m) => m.user_id === p.created_by)) await loadMembers();
  if (p.photos.length) await signedUrls([thumbPath(p, p.photos[0])]);
  applyPlace(p);
  if (isNew && p.created_by !== state.user.id) {
    toast(`${memberOf(p.created_by).display_name} a ajouté ${p.name}`);
  }
}

// Rattrapage quand l'app revient au premier plan
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.map && sb) loadPlaces();
});

// ---------------------------------------------------------------------------
// Photos : chemins, liens signés (temporaires), compression
// ---------------------------------------------------------------------------
const photoPath = (p, id) => `${p.map_id}/${p.id}/${id}.jpg`;
const thumbPath = (p, id) => `${p.map_id}/${p.id}/${id}_t.jpg`;

async function signedUrls(paths) {
  const now = Date.now();
  const missing = [...new Set(paths)].filter((p) => {
    const c = state.urls.get(p);
    return !c || c.exp < now + 5 * 60 * 1000;
  });
  for (let i = 0; i < missing.length; i += 100) {
    const batch = missing.slice(i, i + 100);
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrls(batch, 3600);
    if (error || !data) continue;
    for (const d of data) {
      if (d.signedUrl && d.path) state.urls.set(d.path, { url: d.signedUrl, exp: now + 3600 * 1000 });
    }
  }
  return paths.map((p) => state.urls.get(p)?.url || null);
}
const cachedUrl = (path) => state.urls.get(path)?.url || null;

async function decodeImage(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
}

// Réencode en JPEG : réduit le poids et supprime les métadonnées (dont le GPS)
function toJpeg(source, { max, square = false, quality = 0.82 }) {
  const w0 = source.naturalWidth || source.width;
  const h0 = source.naturalHeight || source.height;
  let sx = 0, sy = 0, sw = w0, sh = h0;
  if (square) {
    const side = Math.min(w0, h0);
    sx = (w0 - side) / 2; sy = (h0 - side) / 2; sw = sh = side;
  }
  const scale = Math.min(1, max / Math.max(sw, sh));
  const w = Math.round(sw * scale), h = Math.round(sh * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, w, h);
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Conversion de la photo impossible'))), 'image/jpeg', quality);
  });
}

async function upload(path, blob) {
  const { error } = await sb.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/jpeg', upsert: false, cacheControl: '31536000',
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Globe
// ---------------------------------------------------------------------------
function initGlobe() {
  if (globe) return;
  globe = new maplibregl.Map({
    container: 'map',
    style: MAP_STYLE,
    center: [8, 32],
    zoom: window.innerWidth < 600 ? 0.9 : 1.6,
    minZoom: 0.4,
    maxPitch: 60,
    attributionControl: { compact: true },
    dragRotate: false,
  });
  globe.touchZoomRotate.disableRotation();

  globeReady = new Promise((resolve) => {
    globe.on('style.load', () => {
      try { globe.setProjection({ type: 'globe' }); } catch {}
      try {
        globe.setSky({
          'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0],
        });
      } catch {}
    });
    globe.once('load', () => globe.once('idle', resolve));
    // Si le fond de carte ne répond pas, on affiche quand même les lieux
    globe.once('error', () => setTimeout(resolve, 1500));
  });

  // Appui long (mobile) ou clic droit (ordinateur) : ajouter un lieu ici
  globe.on('contextmenu', (e) => {
    if (state.picking) return;
    startAdd({ lng: e.lngLat.lng, lat: e.lngLat.lat });
  });

  globe.on('click', (e) => {
    if (!state.picking) return;
    finishPick({ lng: e.lngLat.lng, lat: e.lngLat.lat });
  });

  globe.on('error', (e) => console.warn('Carte :', e?.error?.message || e));
}

function passesFilter(p) {
  return state.filter === 'all' || p.created_by === state.filter;
}

function markerFace(p, size = 'marker') {
  const m = memberOf(p.created_by);
  const face = el('span', { class: size === 'marker' ? 'marker-face' : 'place-thumb', style: `--c:${m.color}` });
  const path = p.photos.length ? thumbPath(p, p.photos[0]) : null;
  const url = path && cachedUrl(path);
  if (url) {
    face.append(el('img', { src: url, alt: '', loading: 'lazy', decoding: 'async' }));
  } else {
    face.textContent = (p.name || '?').trim().charAt(0).toUpperCase();
    if (path) {
      signedUrls([path]).then(([u]) => {
        if (u) { face.textContent = ''; face.append(el('img', { src: u, alt: '', decoding: 'async' })); }
      });
    }
  }
  return face;
}

function buildMarker(p) {
  const m = memberOf(p.created_by);
  const button = el('button', {
    class: 'marker',
    type: 'button',
    style: `--ring:${m.color}`,
    'aria-label': `${p.name}, ajouté par ${m.display_name}`,
  }, [markerFace(p)]);
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!state.picking) openDetail(p.id);
  });
  return new maplibregl.Marker({ element: button, anchor: 'bottom', offset: [0, -8] })
    .setLngLat([p.lng, p.lat])
    .addTo(globe);
}

async function refresh() {
  if (!globe) return;
  await globeReady;
  for (const p of state.places.values()) {
    const has = state.markers.has(p.id);
    if (passesFilter(p) && !has) state.markers.set(p.id, buildMarker(p));
    if (!passesFilter(p) && has) { state.markers.get(p.id).remove(); state.markers.delete(p.id); }
  }
  renderStats();
  renderList();
  $('#hint').hidden = state.places.size > 0;
}

function applyPlace(p) {
  state.places.set(p.id, p);
  const mk = state.markers.get(p.id);
  if (mk) { mk.remove(); state.markers.delete(p.id); }
  refresh();
  if (state.detailId === p.id) renderDetail(p);
}

function removePlace(id, doRefresh = true) {
  state.places.delete(id);
  const mk = state.markers.get(id);
  if (mk) { mk.remove(); state.markers.delete(id); }
  if (state.detailId === id) closeSheet('sheet-detail');
  if (doRefresh) refresh();
}

function renderStats() {
  const all = [...state.places.values()];
  const n = all.length;
  const countries = new Set(all.map((p) => p.country_code).filter(Boolean)).size;
  const lieux = n === 0 ? 'Aucun lieu' : n === 1 ? '1 lieu' : `${n} lieux`;
  const pays = countries === 0 ? '' : countries === 1 ? ', 1 pays' : `, ${countries} pays`;
  $('#map-stats').textContent = lieux + pays;
}

// ---------------------------------------------------------------------------
// Liste et filtres
// ---------------------------------------------------------------------------
function renderChips() {
  const box = $('#chips');
  box.replaceChildren();
  const options = [{ id: 'all', label: 'Tous', color: null }]
    .concat(state.members.map((m) => ({ id: m.user_id, label: m.display_name, color: m.color })));
  if (options.length < 3) { box.hidden = true; return; }
  box.hidden = false;
  for (const o of options) {
    const chip = el('button', { class: 'chip', type: 'button', 'aria-pressed': String(state.filter === o.id) }, [
      o.color ? el('span', { class: 'dot', style: `--c:${o.color}` }) : null,
      o.label,
    ]);
    chip.addEventListener('click', () => {
      state.filter = o.id;
      renderChips();
      refresh();
    });
    box.append(chip);
  }
}

function sortedPlaces() {
  return [...state.places.values()].filter(passesFilter).sort((a, b) => {
    if (a.visited_on && b.visited_on) return b.visited_on.localeCompare(a.visited_on);
    if (a.visited_on) return -1;
    if (b.visited_on) return 1;
    return b.created_at.localeCompare(a.created_at);
  });
}

function renderList() {
  const list = $('#place-list');
  list.replaceChildren();
  const items = sortedPlaces();
  $('#list-empty').hidden = items.length > 0;
  for (const p of items) {
    const m = memberOf(p.created_by);
    const when = p.visited_on ? capitalize(fmtMonth.format(asDate(p.visited_on))) : null;
    const meta = [when, p.country].filter(Boolean).join(', ');
    const btn = el('button', { class: 'place-item', type: 'button' }, [
      markerFace(p, 'list'),
      el('span', {}, [
        el('span', { class: 'place-name', text: p.name }),
        el('span', { class: 'place-meta' }, [
          el('span', { class: 'dot', style: `--c:${m.color}` }),
          meta || `Ajouté par ${m.display_name}`,
        ]),
      ]),
    ]);
    btn.addEventListener('click', () => {
      closeSheet('sheet-list');
      openDetail(p.id);
    });
    list.append(el('li', {}, [btn]));
  }
}

$('#btn-list').addEventListener('click', () => openSheet('sheet-list'));

// ---------------------------------------------------------------------------
// Détail d'un lieu
// ---------------------------------------------------------------------------
async function openDetail(id) {
  const p = state.places.get(id);
  if (!p) return;
  state.detailId = id;
  renderDetail(p);
  openSheet('sheet-detail');
  globe?.flyTo({
    center: [p.lng, p.lat],
    zoom: Math.max(globe.getZoom(), 4),
    padding: { bottom: Math.round(window.innerHeight * 0.45) },
    essential: true,
    duration: 1400,
  });
}

async function renderDetail(p) {
  const m = memberOf(p.created_by);
  $('#detail-title').textContent = p.name;
  const when = p.visited_on ? fmtDay.format(asDate(p.visited_on)) : null;
  $('#detail-where').textContent = [p.country, when].filter(Boolean).join(', ');
  $('#detail-where').hidden = !p.country && !when;
  $('#detail-by').replaceChildren(el('span', { class: 'dot', style: `--c:${m.color}` }), `Ajouté par ${m.display_name}`);
  $('#detail-notes').textContent = p.notes || '';
  $('#detail-notes').hidden = !p.notes;

  const wrap = $('#detail-gallery-wrap');
  const gallery = $('#detail-gallery');
  gallery.replaceChildren();
  wrap.hidden = p.photos.length === 0;
  $('#sheet-detail .detail-body').style.paddingTop = p.photos.length ? '20px' : '56px';
  if (!p.photos.length) return;

  const urls = await signedUrls(p.photos.map((ph) => photoPath(p, ph)));
  if (state.detailId !== p.id) return;
  urls.forEach((u, i) => {
    if (!u) return;
    const img = el('img', { src: u, alt: `Photo ${i + 1} de ${p.name}`, loading: i ? 'lazy' : 'eager', decoding: 'async' });
    img.addEventListener('click', () => openLightbox(u, img.alt));
    gallery.append(el('figure', {}, [img]));
  });
  const count = $('#detail-count');
  const total = gallery.children.length;
  count.hidden = total < 2;
  count.textContent = `1 / ${total}`;
  gallery.onscroll = () => {
    const i = Math.round(gallery.scrollLeft / gallery.clientWidth);
    count.textContent = `${i + 1} / ${total}`;
  };
}

$('#btn-edit').addEventListener('click', () => {
  const id = state.detailId;
  closeSheet('sheet-detail');
  startEdit(id);
});

$('#btn-delete').addEventListener('click', async () => {
  const p = state.places.get(state.detailId);
  if (!p) return;
  if (!confirm(`Supprimer « ${p.name} » et ses photos ? Cette action est définitive.`)) return;
  const btn = $('#btn-delete');
  setBusy(btn, true, 'Suppression…');
  const { error } = await sb.from('places').delete().eq('id', p.id);
  if (error) { setBusy(btn, false); return toast(errorText(error), 'error'); }
  const paths = p.photos.flatMap((ph) => [photoPath(p, ph), thumbPath(p, ph)]);
  if (paths.length) await sb.storage.from(BUCKET).remove(paths);
  setBusy(btn, false);
  removePlace(p.id);
  closeSheet('sheet-detail');
  toast('Lieu supprimé');
});

function openLightbox(url, alt) {
  $('#lightbox-img').src = url;
  $('#lightbox-img').alt = alt;
  $('#lightbox').hidden = false;
}
function closeLightbox() {
  $('#lightbox').hidden = true;
  $('#lightbox-img').removeAttribute('src');
}
$('#lightbox').addEventListener('click', closeLightbox);

// ---------------------------------------------------------------------------
// Ajouter / modifier un lieu
// ---------------------------------------------------------------------------
function emptyDraft() {
  return {
    id: null, lng: null, lat: null, country: '', country_code: '',
    keep: [], removed: [], added: [],   // added: [{ file, preview }]
  };
}

function startAdd(loc) {
  closeSheet('sheet-detail');
  closeSheet('sheet-list');
  state.draft = emptyDraft();
  $('#edit-title').textContent = 'Nouveau lieu';
  $('#btn-save').textContent = 'Enregistrer le lieu';
  $('#form-place').reset();
  $('#search-input').value = '';
  $('#search-results').hidden = true;
  $('#save-progress').hidden = true;
  renderWhere();
  renderPhotoGrid();
  openSheet('sheet-edit');
  if (loc) setLocation(loc, { geocode: true });
}

function startEdit(id) {
  const p = state.places.get(id);
  if (!p) return;
  state.draft = {
    ...emptyDraft(),
    id: p.id, lng: p.lng, lat: p.lat,
    country: p.country || '', country_code: p.country_code || '',
    keep: [...p.photos],
  };
  $('#edit-title').textContent = 'Modifier le lieu';
  $('#btn-save').textContent = 'Enregistrer les modifications';
  $('#place-name').value = p.name;
  $('#place-date').value = p.visited_on || '';
  $('#place-notes').value = p.notes || '';
  $('#search-input').value = '';
  $('#search-results').hidden = true;
  $('#save-progress').hidden = true;
  renderWhere();
  renderPhotoGrid();
  showGhost();
  openSheet('sheet-edit');
}

$('#btn-add').addEventListener('click', () => startAdd(null));

function renderWhere() {
  const d = state.draft;
  const card = $('#where-card');
  const hasLoc = d.lat != null;
  card.classList.toggle('is-empty', !hasLoc);
  $('#where-text').textContent = hasLoc
    ? [d.label || $('#place-name').value || 'Point choisi', d.country].filter(Boolean).join(', ')
    : 'Aucun endroit choisi';
}

async function setLocation({ lng, lat }, { geocode = false, name = '', country = '', country_code = '' } = {}) {
  const d = state.draft;
  d.lng = Math.round(lng * 1e6) / 1e6;
  d.lat = Math.round(lat * 1e6) / 1e6;
  d.label = name;
  d.country = country;
  d.country_code = country_code;
  if (name && !$('#place-name').value.trim()) $('#place-name').value = name;
  renderWhere();
  showGhost();
  if (geocode) {
    $('#where-text').textContent = 'Recherche du nom du lieu…';
    try {
      const res = await nominatim('reverse', { lat: d.lat, lon: d.lng, zoom: 10 });
      if (state.draft !== d) return;
      const info = describe(res);
      d.label = info.name;
      d.country = info.country;
      d.country_code = info.country_code;
      if (!$('#place-name').value.trim()) $('#place-name').value = info.name;
    } catch { /* sans nom, ce n'est pas bloquant */ }
    renderWhere();
  }
}

function showGhost() {
  const d = state.draft;
  if (!globe || !d || d.lat == null) return;
  if (!state.ghost) {
    const face = el('span', { class: 'marker-face', text: '+' });
    const node = el('div', { class: 'marker marker-ghost', 'aria-hidden': 'true' }, [face]);
    state.ghost = new maplibregl.Marker({ element: node, anchor: 'bottom', offset: [0, -8] });
  }
  state.ghost.setLngLat([d.lng, d.lat]).addTo(globe);
  globe.flyTo({
    center: [d.lng, d.lat],
    zoom: Math.max(globe.getZoom(), 3.5),
    padding: { bottom: Math.round(window.innerHeight * 0.55) },
    essential: true,
  });
}
function clearGhost() {
  if (state.ghost) state.ghost.remove();
}

// Géocodage OpenStreetMap (Nominatim) : uniquement à la demande, jamais à chaque frappe
async function nominatim(kind, params) {
  const url = new URL(`https://nominatim.openstreetmap.org/${kind}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('accept-language', 'fr');
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('Recherche indisponible pour le moment');
  return r.json();
}

function describe(res) {
  const a = res.address || {};
  const locality = a.city || a.town || a.village || a.municipality || a.hamlet
    || a.suburb || a.county || a.state || a.country;
  return {
    name: (res.name || locality || (res.display_name || '').split(',')[0] || 'Lieu sans nom').slice(0, 120),
    country: (a.country || '').slice(0, 80),
    country_code: (a.country_code || '').toUpperCase().slice(0, 3),
    detail: [locality && locality !== res.name ? locality : null, a.country].filter(Boolean).join(', '),
  };
}

$('#form-search').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('#search-input').value.trim();
  if (q.length < 2) return;
  const list = $('#search-results');
  list.hidden = false;
  list.replaceChildren(el('li', {}, [el('button', { type: 'button', disabled: '', text: 'Recherche…' })]));
  try {
    const results = await nominatim('search', { q, limit: 5 });
    list.replaceChildren();
    if (!results.length) {
      list.append(el('li', {}, [el('button', { type: 'button', disabled: '', text: 'Aucun résultat. Essaie un autre nom.' })]));
      return;
    }
    for (const r of results) {
      const info = describe(r);
      const b = el('button', { type: 'button' }, [info.name, el('small', { text: info.detail })]);
      b.addEventListener('click', () => {
        list.hidden = true;
        setLocation({ lng: +r.lon, lat: +r.lat }, info);
      });
      list.append(el('li', {}, [b]));
    }
  } catch (err) {
    list.hidden = true;
    toast(errorText(err), 'error');
  }
});

$('#btn-locate').addEventListener('click', () => {
  if (!navigator.geolocation) return toast("La localisation n'est pas disponible sur cet appareil.", 'error');
  const btn = $('#btn-locate');
  setBusy(btn, true, 'Localisation…');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      setBusy(btn, false);
      setLocation({ lng: pos.coords.longitude, lat: pos.coords.latitude }, { geocode: true });
    },
    () => {
      setBusy(btn, false);
      toast('Position refusée ou introuvable.', 'error');
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
  );
});

// Choisir un point en touchant le globe
$('#btn-pick-map').addEventListener('click', () => {
  state.picking = true;
  closeSheet('sheet-edit');
  $('#pick-banner').hidden = false;
  $('.dock').hidden = true;
});
$('#btn-pick-cancel').addEventListener('click', () => endPick());

function endPick() {
  state.picking = false;
  $('#pick-banner').hidden = true;
  $('.dock').hidden = false;
  openSheet('sheet-edit');
}
function finishPick(loc) {
  endPick();
  setLocation(loc, { geocode: true });
}

// Photos du formulaire
$('#photo-input').addEventListener('change', (e) => {
  const d = state.draft;
  const files = [...e.target.files].filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
  e.target.value = '';
  const room = MAX_PHOTOS - d.keep.length - d.added.length;
  if (files.length > room) toast(`${MAX_PHOTOS} photos maximum par lieu.`, 'error');
  for (const file of files.slice(0, Math.max(0, room))) {
    d.added.push({ file, preview: URL.createObjectURL(file) });
  }
  renderPhotoGrid();
});

function renderPhotoGrid() {
  const d = state.draft;
  const grid = $('#photo-grid');
  const add = $('#photo-add');
  for (const t of $$('.photo-tile', grid)) t.remove();
  const place = d.id ? state.places.get(d.id) : null;

  const tile = (src, onRemove) => {
    const img = el('img', { alt: '' });
    if (src instanceof Promise) src.then(([u]) => { if (u) img.src = u; });
    else img.src = src;
    const remove = el('button', { class: 'photo-remove', type: 'button', 'aria-label': 'Retirer cette photo' });
    remove.innerHTML = CLOSE_ICON;
    remove.addEventListener('click', onRemove);
    return el('div', { class: 'photo-tile' }, [img, remove]);
  };

  for (const id of d.keep) {
    grid.insertBefore(tile(signedUrls([thumbPath(place, id)]), () => {
      d.keep = d.keep.filter((x) => x !== id);
      d.removed.push(id);
      renderPhotoGrid();
    }), add);
  }
  for (const item of d.added) {
    grid.insertBefore(tile(item.preview, () => {
      URL.revokeObjectURL(item.preview);
      d.added = d.added.filter((x) => x !== item);
      renderPhotoGrid();
    }), add);
  }
  add.hidden = d.keep.length + d.added.length >= MAX_PHOTOS;
}

// Enregistrement
$('#form-place').addEventListener('submit', async (e) => {
  e.preventDefault();
  const d = state.draft;
  const name = $('#place-name').value.trim();
  if (d.lat == null) return toast('Choisis d’abord un endroit : recherche, carte ou position.', 'error');
  if (!name) return toast('Donne un nom à ce lieu.', 'error');

  const btn = $('#btn-save');
  const progress = $('#save-progress');
  const isNew = !d.id;
  const place = { id: d.id || crypto.randomUUID(), map_id: state.map.id };
  const uploaded = [];
  const newIds = [];

  setBusy(btn, true, 'Enregistrement…');
  try {
    for (let i = 0; i < d.added.length; i++) {
      progress.hidden = false;
      progress.textContent = `Préparation et envoi des photos : ${i + 1} sur ${d.added.length}`;
      const source = await decodeImage(d.added[i].file).catch(() => {
        throw new Error(`La photo « ${d.added[i].file.name} » n'est pas dans un format lisible par ce navigateur.`);
      });
      const [full, thumb] = await Promise.all([
        toJpeg(source, { max: 1600, quality: 0.82 }),
        toJpeg(source, { max: 240, square: true, quality: 0.8 }),
      ]);
      source.close?.();
      const id = crypto.randomUUID();
      await upload(photoPath(place, id), full);
      uploaded.push(photoPath(place, id));
      await upload(thumbPath(place, id), thumb);
      uploaded.push(thumbPath(place, id));
      newIds.push(id);
    }

    progress.hidden = false;
    progress.textContent = 'Enregistrement du lieu…';
    const row = {
      name,
      lat: d.lat,
      lng: d.lng,
      country: d.country || null,
      country_code: d.country_code || null,
      visited_on: $('#place-date').value || null,
      notes: $('#place-notes').value.trim() || null,
      photos: [...d.keep, ...newIds],
    };
    const query = isNew
      ? sb.from('places').insert({ id: place.id, map_id: place.map_id, ...row })
      : sb.from('places').update(row).eq('id', place.id);
    const { data, error } = await query.select().single();
    if (error) throw error;

    if (d.removed.length) {
      await sb.storage.from(BUCKET).remove(d.removed.flatMap((id) => [photoPath(place, id), thumbPath(place, id)]));
    }
    for (const a of d.added) URL.revokeObjectURL(a.preview);

    if (data.photos.length) await signedUrls([thumbPath(data, data.photos[0])]);
    closeSheet('sheet-edit');
    clearGhost();
    applyPlace(data);
    toast(isNew ? 'Lieu ajouté' : 'Modifications enregistrées');
    openDetail(data.id);
  } catch (err) {
    if (uploaded.length) await sb.storage.from(BUCKET).remove(uploaded).catch(() => {});
    toast(errorText(err), 'error');
  } finally {
    setBusy(btn, false);
    progress.hidden = true;
  }
});

// ---------------------------------------------------------------------------
// Menu : membres et invitation
// ---------------------------------------------------------------------------
function renderMenu() {
  const list = $('#member-list');
  list.replaceChildren();
  for (const m of state.members) {
    list.append(el('li', {}, [
      el('span', { class: 'dot', style: `--c:${m.color}` }),
      m.display_name,
      m.user_id === state.user.id ? el('small', { text: '(toi)' }) : null,
    ]));
  }
  const canInvite = state.members.length < 2;
  $('#invite').hidden = !canInvite;
  if (canInvite) $('#invite-code').textContent = state.map.invite_code;
}

$('#btn-menu').addEventListener('click', async () => {
  await loadMembers();
  openSheet('sheet-menu');
});

$('#btn-share').addEventListener('click', async () => {
  const link = `${location.origin}${location.pathname}?join=${state.map.invite_code}`;
  const text = `Rejoins notre carte de voyages « ${state.map.name} » : ${link}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: state.map.name, text, url: link });
    } else {
      await navigator.clipboard.writeText(link);
      toast('Lien copié');
    }
  } catch { /* partage annulé */ }
});

// ---------------------------------------------------------------------------
boot().catch((err) => {
  console.error(err);
  toast(errorText(err), 'error');
  if (configured) showAuth(); else showView('config');
});
