// ============================================================================
//  Outils d'interface partagés
// ============================================================================

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// Remplace le contenu d'un nœud en ignorant les valeurs vides (null, false)
export function put(node, ...kids) {
  node.replaceChildren(...kids.flat(Infinity).filter((k) => k !== null && k !== undefined && k !== false));
  return node;
}

// Crée un élément. Le texte passe toujours par textContent (jamais de HTML injecté).
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'style') node.style.cssText = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : String(c));
  }
  return node;
}

// ---------------------------------------------------------------------------
// Icônes (tracés statiques uniquement)
// ---------------------------------------------------------------------------
const PATHS = {
  home: '<path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>',
  pin: '<path d="M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="9" cy="9" r="1.2" fill="currentColor"/><circle cx="15" cy="15" r="1.2" fill="currentColor"/><circle cx="15" cy="9" r="1.2" fill="currentColor"/><circle cx="9" cy="15" r="1.2" fill="currentColor"/>',
  photo: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 16l-5-5-8 8"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  menu: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="10" r="3"/><path d="M6.5 18.5a6 6 0 0 1 11 0"/>',
  map: '<path d="M9 4L3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  cart: '<path d="M3 4h2.5l2 11h10l2-8H7"/><circle cx="9.5" cy="19" r="1.3"/><circle cx="16.5" cy="19" r="1.3"/>',
};
export function icon(name, cls = 'ico') {
  const span = document.createElement('span');
  span.className = cls;
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 24 24">${PATHS[name] || ''}</svg>`;
  return span;
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------
let toastTimer;
export function toast(message, kind = 'info', action) {
  const t = $('#toast');
  t.replaceChildren(el('span', { text: message }));
  if (action) {
    t.append(el('button', { class: 'toast-action', type: 'button', text: action.label, onclick: () => { hideToast(); action.run(); } }));
  }
  t.dataset.kind = kind;
  t.hidden = false;
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, action ? 6000 : kind === 'error' ? 5000 : 3000);
}
function hideToast() {
  const t = $('#toast');
  t.classList.remove('show');
  setTimeout(() => { t.hidden = true; }, 250);
}

export function errorText(err) {
  const msg = String(err?.message || err || '');
  if (/failed to fetch|networkerror|load failed/i.test(msg)) return 'Connexion impossible. Vérifie ta connexion internet.';
  if (/invalid login credentials/i.test(msg)) return 'E-mail ou mot de passe incorrect.';
  if (/already registered|already been registered|user already exists/i.test(msg)) return 'Un compte existe déjà avec cette adresse. Utilise « Se connecter ».';
  if (/email not confirmed/i.test(msg)) return 'Adresse non confirmée : désactive « Confirm email » dans Supabase (voir le guide).';
  if (/signups? not allowed|signup is disabled/i.test(msg)) return 'Les inscriptions sont fermées sur cette app.';
  if (/password/i.test(msg) && /should|weak|least|characters|known/i.test(msg)) return 'Mot de passe trop faible : 10 caractères minimum.';
  if (/same.*password|different from the old/i.test(msg)) return "Le nouveau mot de passe doit être différent de l'ancien.";
  if (/rate limit|security purposes|too many/i.test(msg)) return 'Trop de tentatives. Réessaie dans quelques minutes.';
  if (/row-level security|permission denied/i.test(msg)) return "Action refusée : tu n'as pas accès à cet espace.";
  if (/violates check constraint.*link/i.test(msg)) return 'Le lien doit commencer par https://';
  if (/violates check constraint/i.test(msg)) return 'Une valeur saisie est invalide ou trop longue.';
  if (/payload too large|maximum allowed size/i.test(msg)) return 'Photo trop lourde, même après réduction.';
  return msg || 'Une erreur est survenue. Réessaie.';
}

export function setBusy(button, busy, label) {
  if (!button) return;
  if (busy) {
    button.dataset.label = button.textContent;
    button.textContent = label || 'Un instant…';
    button.disabled = true;
  } else {
    if (button.dataset.label) button.textContent = button.dataset.label;
    button.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Dates et montants
// ---------------------------------------------------------------------------
export const pad = (n) => String(n).padStart(2, '0');
export const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => iso(new Date());
export const parseDay = (s) => new Date(s + 'T12:00:00');
export function addDays(s, n) { const d = parseDay(s); d.setDate(d.getDate() + n); return iso(d); }
export function addMonths(s, n) {
  const d = parseDay(s);
  const day = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return iso(d);
}
export const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const F = {
  day: new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
  short: new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }),
  month: new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }),
  monthShort: new Intl.DateTimeFormat('fr-FR', { month: 'short' }),
  weekday: new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }),
};
export const fmtDay = (s) => (s ? F.day.format(parseDay(s)) : '');
export const fmtMonth = (s) => (s ? cap(F.month.format(parseDay(s))) : '');
export const fmtMonthShort = (s) => F.monthShort.format(parseDay(s)).replace('.', '');
export const fmtWeekday = (s) => cap(F.weekday.format(parseDay(s)));
export function fmtRelative(s) {
  if (!s) return '';
  const t = todayISO();
  if (s === t) return "Aujourd'hui";
  if (s === addDays(t, 1)) return 'Demain';
  if (s === addDays(t, -1)) return 'Hier';
  return cap(F.short.format(parseDay(s)).replace('.', ''));
}
export function fmtRange(a, b) {
  if (!b || a === b) return fmtRelative(a);
  return `${fmtRelative(a)} → ${fmtRelative(b)}`;
}
const EUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
export const money = (n) => EUR.format(Number(n) || 0);

// ---------------------------------------------------------------------------
// Feuilles (panneaux qui montent du bas) + bouton retour du téléphone
// ---------------------------------------------------------------------------
const stack = [];
let armed = false;
let pendingBack = 0;

export function openSheet({ title, body, className = '', onClose, hero = null }) {
  const content = el('div', { class: 'sheet-content' });
  const closeBtn = el('button', { class: 'icon-btn sheet-close', type: 'button', 'aria-label': 'Fermer' }, [icon('close')]);
  const head = title
    ? el('header', { class: 'sheet-head' }, [el('h2', { text: title }), closeBtn])
    : null;
  const panel = el('section', { class: `sheet-panel ${className}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Détail' }, [
    el('div', { class: 'sheet-grip', 'aria-hidden': 'true' }),
    hero,
    head,
    head ? null : closeBtn,
    content,
  ]);
  if (!head) closeBtn.classList.add('icon-btn-float');
  const root = el('div', { class: 'sheet' }, [el('div', { class: 'sheet-backdrop' }), panel]);
  const api = {
    root, panel, body: content, onClose, refresh: null,
    close: () => closeSheet(api),
    set(children) { content.replaceChildren(...[].concat(children).filter(Boolean)); },
  };
  root.firstChild.addEventListener('click', api.close);
  closeBtn.addEventListener('click', api.close);
  if (body) api.set(body);
  $('#sheets').append(root);
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('open')));
  stack.push(api);
  if (!armed) { history.pushState({ sheet: true }, ''); armed = true; }
  return api;
}

function hide(api) {
  api.root.classList.remove('open');
  setTimeout(() => api.root.remove(), 330);
  api.onClose?.();
}

export function closeSheet(api) {
  const i = stack.indexOf(api);
  if (i < 0) return;
  stack.splice(i, 1);
  hide(api);
  if (!stack.length && armed) { armed = false; pendingBack++; history.back(); }
}

export function closeAllSheets() { [...stack].reverse().forEach(closeSheet); }
export const openSheets = () => stack;

window.addEventListener('popstate', () => {
  if (!$('#lightbox').hidden) { closeLightbox(); if (armed) history.pushState({ sheet: true }, ''); return; }
  if (pendingBack) { pendingBack--; return; }
  if (stack.length) {
    hide(stack.pop());
    if (stack.length) history.pushState({ sheet: true }, '');
    else armed = false;
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!$('#lightbox').hidden) return closeLightbox();
  if (stack.length) closeSheet(stack[stack.length - 1]);
});

// ---------------------------------------------------------------------------
// Photo plein écran
// ---------------------------------------------------------------------------
export function openLightbox(url, alt = '') {
  const img = $('#lightbox-img');
  img.src = url;
  img.alt = alt;
  $('#lightbox').hidden = false;
}
export function closeLightbox() {
  $('#lightbox').hidden = true;
  $('#lightbox-img').removeAttribute('src');
}

// ---------------------------------------------------------------------------
// Petits composants
// ---------------------------------------------------------------------------

// Rangée de puces à choix unique (ou multiple)
export function chips(options, value, onChange, { multi = false, className = '', allowNone = false } = {}) {
  const box = el('div', { class: `chips ${className}`, role: 'group' });
  let current = multi ? new Set(value || []) : value;
  const draw = () => {
    box.replaceChildren();
    for (const o of options) {
      const [val, label, extra] = o;
      const on = multi ? current.has(val) : current === val;
      const b = el('button', { class: 'chip', type: 'button', 'aria-pressed': String(on) }, [
        extra && /^#/.test(extra) ? el('span', { class: 'dot', style: `--c:${extra}` }) : extra ? el('span', { class: 'chip-emoji', text: extra }) : null,
        label,
      ]);
      b.addEventListener('click', () => {
        if (multi) { current.has(val) ? current.delete(val) : current.add(val); onChange([...current]); }
        else { current = allowNone && current === val ? null : val; onChange(current); }
        draw();
      });
      box.append(b);
    }
  };
  draw();
  return box;
}

// Onglets segmentés (sous-sections)
export function segmented(options, value, onChange, cls = '') {
  const box = el('div', { class: `segmented ${cls}`, role: 'tablist' });
  for (const [val, label] of options) {
    const b = el('button', { class: 'segment', type: 'button', role: 'tab', 'aria-selected': String(val === value), text: label });
    b.addEventListener('click', () => {
      for (const x of box.children) x.setAttribute('aria-selected', 'false');
      b.setAttribute('aria-selected', 'true');
      onChange(val);
    });
    box.append(b);
  }
  return box;
}

export function empty(text, actionLabel, onAction) {
  return el('div', { class: 'empty' }, [
    el('p', { text }),
    actionLabel ? el('button', { class: 'btn btn-accent btn-small', type: 'button', text: actionLabel, onclick: onAction }) : null,
  ]);
}

export function stars(n, size = '') {
  const box = el('span', { class: `stars ${size}`, 'aria-label': `${n} sur 5` });
  for (let i = 1; i <= 5; i++) box.append(icon('star', i <= n ? 'ico star on' : 'ico star'));
  return box;
}

export function debounce(fn, ms = 200) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export const normalize = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// En-tête d'un espace : titre, sous-titre, onglets de sections
export function spaceHeader({ title, subtitle, tabs, current, onTab, action }) {
  const nav = tabs
    ? el('nav', { class: 'section-tabs', role: 'tablist', 'aria-label': 'Sections' }, tabs.map(([v, l]) =>
      el('button', { class: 'section-tab', role: 'tab', type: 'button', 'aria-selected': String(v === current), onclick: () => onTab(v) }, [l])))
    : null;
  return [
    el('header', { class: 'space-head' }, [
      el('div', { class: 'space-title' }, [el('h1', { text: title }), subtitle ? el('p', { text: subtitle }) : null]),
      action || null,
    ]),
    nav,
  ];
}

export function addButton(label, onClick) {
  return el('button', { class: 'btn btn-accent btn-small btn-add', type: 'button', onclick: onClick }, [icon('plus'), label]);
}
