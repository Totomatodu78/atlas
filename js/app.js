// ============================================================================
//  Atlas : démarrage, connexion, navigation
// ============================================================================
import { $, $$, el, icon, toast, errorText, setBusy, openSheet, openSheets, closeLightbox } from './lib.js';
import { configured, initClient, sb, state, loadMembers, loadAll, subscribe, onChange, onRemoteInsert, memberOf } from './store.js';
import * as home from './home.js';
import * as discover from './discover.js';
import * as memories from './memories.js';
import * as couple from './couple.js';
import { openItemForm } from './item.js';
import { openMemoryForm } from './memories.js';
import { openEventForm, openTaskForm, openExpenseForm } from './couple.js';
import { openWishForm } from './discover.js';

const MIN_PASSWORD = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const showView = (name) => { for (const v of $$('.view')) v.hidden = v.dataset.view !== name; };

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------
async function boot() {
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  const join = new URLSearchParams(location.search).get('join');
  if (join) sessionStorage.setItem('atlas.join', join.toUpperCase().replace(/[^A-Z0-9]/g, ''));
  if (!configured) return showView('config');

  initClient();
  sb.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT') location.replace(location.pathname); });
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return showAuth();
  state.user = session.user;
  await enterApp();
}

// ---------------------------------------------------------------------------
// Connexion par e-mail et mot de passe (aucun e-mail envoyé)
// ---------------------------------------------------------------------------
function showAuth(tab) {
  showView('auth');
  selectAuthTab(tab || (sessionStorage.getItem('atlas.join') ? 'signup' : 'login'));
}
function selectAuthTab(name) {
  for (const t of $$('[data-auth-tab]')) t.setAttribute('aria-selected', String(t.dataset.authTab === name));
  $('#form-login').hidden = name !== 'login';
  $('#form-signup').hidden = name !== 'signup';
}
for (const t of $$('[data-auth-tab]')) t.addEventListener('click', () => selectAuthTab(t.dataset.authTab));

$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#login-email').value.trim().toLowerCase();
  const password = $('#login-password').value;
  if (!EMAIL_RE.test(email)) return toast('Adresse e-mail invalide.', 'error');
  if (!password) return toast('Saisis ton mot de passe.', 'error');
  const btn = e.submitter || e.target.querySelector('[type=submit]');
  setBusy(btn, true, 'Connexion…');
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  setBusy(btn, false);
  if (error) return toast(errorText(error), 'error');
  $('#login-password').value = '';
  state.user = data.user;
  await enterApp();
});

$('#form-signup').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#signup-email').value.trim().toLowerCase();
  const password = $('#signup-password').value;
  if (!EMAIL_RE.test(email)) return toast('Adresse e-mail invalide.', 'error');
  if (password.length < MIN_PASSWORD) return toast(`Le mot de passe doit faire au moins ${MIN_PASSWORD} caractères.`, 'error');
  if (password !== $('#signup-password2').value) return toast('Les deux mots de passe ne sont pas identiques.', 'error');
  const btn = e.submitter || e.target.querySelector('[type=submit]');
  setBusy(btn, true, 'Création du compte…');
  const { data, error } = await sb.auth.signUp({ email, password });
  setBusy(btn, false);
  if (error) return toast(errorText(error), 'error');
  if (!data.session) return toast('Compte créé, mais Supabase demande une confirmation par e-mail. Désactive « Confirm email » dans Supabase, puis connecte-toi.', 'error');
  $('#signup-password').value = '';
  $('#signup-password2').value = '';
  state.user = data.user;
  await enterApp();
});

async function logout() {
  await sb.auth.signOut();
  localStorage.removeItem('atlas.map');
  location.replace(location.pathname);
}
for (const b of $$('[data-action="logout"]')) b.addEventListener('click', logout);

// ---------------------------------------------------------------------------
// Espace commun : créer ou rejoindre
// ---------------------------------------------------------------------------
async function enterApp() {
  showView('loading');
  const { data, error } = await sb.from('map_members').select('map_id, maps ( id, name, invite_code )').eq('user_id', state.user.id);
  if (error) { toast(errorText(error), 'error'); return showAuth(); }
  const pending = sessionStorage.getItem('atlas.join');
  if (!data.length || pending) return showOnboard(pending);
  const stored = localStorage.getItem('atlas.map');
  const row = data.find((r) => r.map_id === stored) || data[0];
  await openSpace(row.maps);
}

function showOnboard(code) {
  showView('onboard');
  selectTab(code ? 'join' : 'create');
  if (code) $('#join-code').value = code;
}
function selectTab(name) {
  for (const t of $$('.segment[data-tab]')) t.setAttribute('aria-selected', String(t.dataset.tab === name));
  for (const p of $$('[data-panel]')) p.hidden = p.dataset.panel !== name;
}
for (const t of $$('.segment[data-tab]')) t.addEventListener('click', () => selectTab(t.dataset.tab));

$('#form-create').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#create-name').value.trim() || 'Nous deux';
  const mine = $('#create-me').value.trim();
  if (!mine) return toast('Indique ton prénom.', 'error');
  const btn = e.submitter || e.target.querySelector('[type=submit]');
  setBusy(btn, true, 'Création…');
  const { error } = await sb.rpc('create_map', { p_name: name, p_display_name: mine });
  setBusy(btn, false);
  if (error) return toast(errorText(error), 'error');
  await afterJoin();
  openMenu();
});

$('#form-join').addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = $('#join-code').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const mine = $('#join-me').value.trim();
  if (!code) return toast("Indique le code d'invitation.", 'error');
  if (!mine) return toast('Indique ton prénom.', 'error');
  const btn = e.submitter || e.target.querySelector('[type=submit]');
  setBusy(btn, true, 'Connexion à l’espace…');
  const { data: mapId, error } = await sb.rpc('join_map', { p_code: code, p_display_name: mine });
  setBusy(btn, false);
  if (error) return toast(errorText(error), 'error');
  localStorage.setItem('atlas.map', mapId);
  await afterJoin();
  toast('Bienvenue !');
});

async function afterJoin() {
  sessionStorage.removeItem('atlas.join');
  if (location.search) history.replaceState(null, '', location.pathname + location.hash);
  await enterApp();
}

async function openSpace(space) {
  state.space = space;
  localStorage.setItem('atlas.map', space.id);
  document.title = `${space.name} · Atlas`;
  try {
    await loadMembers();
    await loadAll();
  } catch (e) {
    const missing = /does not exist|schema cache|could not find/i.test(String(e?.message));
    toast(missing ? 'Base incomplète : exécute supabase/schema-v2.sql dans Supabase (voir le guide).' : errorText(e), 'error');
  }
  subscribe();
  showView('app');
  renderRoute();
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------
const VIEWS = { accueil: home, decouvrir: discover, souvenirs: memories, couple };
let currentView = null;

function parseRoute() {
  const [tab, section] = location.hash.replace(/^#\/?/, '').split('/');
  return { tab: VIEWS[tab] ? tab : 'accueil', section };
}

export function nav(path) {
  history.replaceState(history.state, '', '#' + path);
  renderRoute();
  $('#view').scrollTo(0, 0);
}

function renderRoute() {
  const { tab, section } = parseRoute();
  document.body.dataset.space = tab;
  for (const b of $$('.tab[data-tab]')) b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false');
  currentView = VIEWS[tab].render($('#view'), section, nav, { openMenu, quickAdd });
}

for (const b of $$('.tab[data-tab]')) b.addEventListener('click', () => nav(b.dataset.route));
$('#tab-add').addEventListener('click', () => quickAdd());
$('#lightbox').addEventListener('click', closeLightbox);

// Redessine la vue et les fiches ouvertes quand les données changent,
// sans interrompre une saisie en cours
let pending = false;
function scheduleRefresh() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    const active = document.activeElement;
    if (active && $('#view').contains(active) && /INPUT|TEXTAREA|SELECT/.test(active.tagName) && active.value) {
      active.addEventListener('blur', () => { pending = false; scheduleRefresh(); }, { once: true });
      return;
    }
    pending = false;
    currentView?.refresh?.();
    for (const s of openSheets()) s.refresh?.();
  });
}
onChange(() => { if (state.space && !$('[data-view="app"]').hidden) scheduleRefresh(); });

// Petite notification quand l'autre ajoute quelque chose
onRemoteInsert((table, row) => {
  const who = memberOf(row.created_by).display_name;
  const what = {
    items: `« ${row.title} »`, memories: 'un souvenir', events: 'un événement à l’agenda',
    shopping: `${row.label} aux courses`, tasks: 'une tâche', expenses: 'une dépense', wishes: 'une envie',
  }[table];
  if (what) toast(`${who} a ajouté ${what}`);
});

// ---------------------------------------------------------------------------
// Ajout rapide (bouton central)
// ---------------------------------------------------------------------------
function quickAdd() {
  const sheet = openSheet({ title: 'Ajouter' });
  const go = (fn) => () => { fn(); sheet.close(); };
  const tile = (emoji, label, color, fn) => el('button', { class: 'quick-tile', type: 'button', style: `--k:${color}`, onclick: go(fn) }, [el('span', { class: 'quick-emoji', text: emoji }), label]);
  sheet.set([
    el('p', { class: 'quick-group', text: 'À découvrir' }),
    el('div', { class: 'quick-grid' }, [
      tile('✨', 'Idée de date', 'var(--decouvrir)', () => openItemForm('activite', null, { status: 'idee' })),
      tile('🍽️', 'Restaurant', 'var(--decouvrir)', () => openItemForm('resto', null, { status: 'idee' })),
      tile('✈️', 'Voyage', 'var(--decouvrir)', () => openItemForm('voyage', null, { status: 'idee' })),
    ]),
    el('p', { class: 'quick-group', text: 'Souvenirs' }),
    el('div', { class: 'quick-grid' }, [
      tile('📷', 'Souvenir', 'var(--souvenirs)', () => openMemoryForm()),
      tile('📍', 'Lieu visité', 'var(--souvenirs)', () => openItemForm('lieu', null, { status: 'realisee' })),
      tile('🎁', 'Envie, cadeau', 'var(--decouvrir)', () => openWishForm()),
    ]),
    el('p', { class: 'quick-group', text: 'Gestion de couple' }),
    el('div', { class: 'quick-grid' }, [
      tile('📅', 'Événement', 'var(--couple)', () => openEventForm()),
      tile('✅', 'Tâche', 'var(--couple)', () => openTaskForm()),
      tile('💶', 'Dépense', 'var(--couple)', () => openExpenseForm()),
    ]),
    el('button', { class: 'btn btn-soft btn-block', type: 'button', onclick: () => { sheet.close(); nav('couple/courses'); setTimeout(() => $('.quick-input')?.focus(), 350); } }, [icon('cart'), 'Liste de courses']),
  ]);
}

// ---------------------------------------------------------------------------
// Menu : membres, invitation, mot de passe, déconnexion
// ---------------------------------------------------------------------------
async function openMenu() {
  await loadMembers().catch(() => {});
  const sheet = openSheet({ title: state.space.name });
  const pw1 = el('input', { type: 'password', autocomplete: 'new-password', id: 'new-password', minlength: MIN_PASSWORD });
  const pw2 = el('input', { type: 'password', autocomplete: 'new-password', id: 'new-password2' });
  const pwForm = el('form', { class: 'stack', novalidate: true }, [
    el('label', { class: 'field-label', for: 'new-password', text: 'Nouveau mot de passe' }), pw1,
    el('label', { class: 'field-label', for: 'new-password2', text: 'Confirme-le' }), pw2,
    el('button', { class: 'btn btn-accent', type: 'submit', text: 'Enregistrer le mot de passe' }),
  ]);
  const details = el('details', { class: 'menu-password' }, [el('summary', { text: 'Changer mon mot de passe' }), pwForm]);
  pwForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (pw1.value.length < MIN_PASSWORD) return toast(`Au moins ${MIN_PASSWORD} caractères.`, 'error');
    if (pw1.value !== pw2.value) return toast('Les deux mots de passe ne sont pas identiques.', 'error');
    const btn = pwForm.querySelector('[type=submit]');
    setBusy(btn, true, 'Enregistrement…');
    const { error } = await sb.auth.updateUser({ password: pw1.value });
    setBusy(btn, false);
    if (error) return toast(errorText(error), 'error');
    pwForm.reset();
    details.open = false;
    toast('Mot de passe modifié');
  });

  const canInvite = state.members.length < 2;
  const share = async () => {
    const link = `${location.origin}${location.pathname}?join=${state.space.invite_code}`;
    try {
      if (navigator.share) await navigator.share({ title: state.space.name, text: `Rejoins notre espace « ${state.space.name} » : ${link}`, url: link });
      else { await navigator.clipboard.writeText(link); toast('Lien copié'); }
    } catch { /* partage annulé */ }
  };

  sheet.set([
    el('ul', { class: 'member-list' }, state.members.map((m) => el('li', {}, [
      el('span', { class: 'avatar', style: `--c:${m.color}`, text: m.display_name.charAt(0).toUpperCase() }),
      m.display_name,
      m.user_id === state.user.id ? el('small', { text: '(toi)' }) : null,
    ]))),
    canInvite ? el('div', { class: 'invite' }, [
      el('p', { text: "Envoie ce code à l'autre personne pour qu'elle rejoigne l'espace :" }),
      el('p', { class: 'invite-code', text: state.space.invite_code }),
      el('button', { class: 'btn btn-accent btn-block', type: 'button', text: "Partager le lien d'invitation", onclick: share }),
    ]) : null,
    details,
    el('button', { class: 'btn btn-soft btn-block', type: 'button', text: 'Se déconnecter', onclick: logout }),
  ]);
}

// ---------------------------------------------------------------------------
boot().catch((err) => {
  console.error(err);
  toast(errorText(err), 'error');
  if (configured) showAuth(); else showView('config');
});
