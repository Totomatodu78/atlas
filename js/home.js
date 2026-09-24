// ============================================================================
//  Accueil : tableau de bord
// ============================================================================
import { put, el, icon, chips, openSheet, fmtRelative, fmtRange, todayISO, addDays, cap, fmtWeekday } from './lib.js';
import { all, me, photoPath, signedUrls, state } from './store.js';
import { KINDS, CATEGORIES, DURATIONS, SETTINGS } from './kinds.js';
import { itemCard, openItem, openItemForm, planItem } from './item.js';
import { memoryTile, openMemory, openMemoryForm } from './memories.js';
import { occurrences } from './couple.js';

export function render(root, _section, nav, { openMenu, quickAdd }) {
  const refresh = () => draw(root, nav, { openMenu, quickAdd });
  refresh();
  return { refresh };
}

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Bonne nuit' : h < 18 ? 'Bonjour' : 'Bonsoir';
}

function draw(root, nav, { openMenu, quickAdd }) {
  const items = all('items');
  const mems = all('memories');
  const today = todayISO();
  const name = me()?.display_name || '';

  const ideas = items.filter((i) => i.status === 'idee');
  const openTasks = all('tasks').filter((t) => t.status !== 'fait' && t.due_on && t.due_on <= today).length;
  const toBuy = all('shopping').filter((s) => !s.done).length;

  const next = occurrences(today, addDays(today, 45)).filter((o) => o.end >= today).slice(0, 5);
  const lastIdeas = [...ideas].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 3);
  const lastMems = [...mems].sort((a, b) => (b.happened_on || b.created_at).localeCompare(a.happened_on || a.created_at)).slice(0, 8);
  signedUrls(lastMems.filter((m) => m.photos.length).map((m) => photoPath(m.id, m.photos[0], true)));

  const space = (key, title, sub, count, route) => el('button', { class: `space-tile tile-${key}`, type: 'button', onclick: () => nav(route) }, [
    el('span', { class: 'space-tile-title', text: title }),
    el('span', { class: 'space-tile-sub', text: sub }),
    el('span', { class: 'space-tile-count', text: count }),
  ]);

  put(root, 
    el('header', { class: 'home-head' }, [
      el('div', {}, [
        el('p', { class: 'home-date', text: fmtWeekday(today) }),
        el('h1', { class: 'home-hello', text: `${greeting()}${name ? ' ' + name : ''}` }),
      ]),
      el('button', { class: 'avatar-btn', type: 'button', 'aria-label': 'Menu et réglages', onclick: openMenu }, [icon('menu')]),
    ]),

    el('button', { class: 'dice-banner', type: 'button', onclick: () => openDice() }, [
      icon('dice', 'ico dice-ico'),
      el('span', {}, [el('strong', { text: 'On ne sait pas quoi faire ?' }), el('span', { text: 'Tirons une idée au sort parmi les vôtres' })]),
    ]),

    el('div', { class: 'space-tiles' }, [
      space('decouvrir', 'À découvrir', 'Ce que nous voulons faire', `${ideas.length} idée${ideas.length > 1 ? 's' : ''}`, 'decouvrir/activite'),
      space('souvenirs', 'Souvenirs', 'Ce que nous avons vécu', `${mems.length} souvenir${mems.length > 1 ? 's' : ''}`, 'souvenirs/album'),
      space('couple', 'Couple', 'Notre quotidien', [toBuy ? `${toBuy} à acheter` : null, openTasks ? `${openTasks} tâche${openTasks > 1 ? 's' : ''}` : null].filter(Boolean).join(', ') || 'Tout est à jour', 'couple/agenda'),
    ]),

    el('div', { class: 'quick-row' }, [
      el('button', { class: 'quick-chip', type: 'button', onclick: () => openItemForm('activite', null, { status: 'idee' }) }, [el('span', { text: '💡' }), 'Une idée']),
      el('button', { class: 'quick-chip', type: 'button', onclick: () => openMemoryForm() }, [el('span', { text: '📷' }), 'Un souvenir']),
      el('button', { class: 'quick-chip', type: 'button', onclick: () => nav('couple/courses') }, [el('span', { text: '🛒' }), 'Courses']),
      el('button', { class: 'quick-chip', type: 'button', onclick: quickAdd }, [el('span', { text: '＋' }), 'Autre']),
    ]),

    el('section', { class: 'home-section' }, [
      el('div', { class: 'block-head' }, [el('h2', { text: 'Prochainement' }), el('button', { class: 'btn btn-quiet btn-small', type: 'button', text: 'Agenda', onclick: () => nav('couple/agenda') })]),
      next.length
        ? el('div', { class: 'upcoming' }, next.map((o) => el('button', { class: 'upcoming-row', type: 'button', style: `--c:${o.color}`, onclick: () => (o.type === 'item' ? openItem(o.id) : nav('couple/agenda')) }, [
          el('span', { class: 'upcoming-when', text: fmtRelative(o.start < today ? today : o.start) }),
          el('span', { class: 'upcoming-title', text: o.title }),
          el('span', { class: 'upcoming-meta', text: [o.time, o.start !== o.end ? fmtRange(o.start, o.end) : null].filter(Boolean).join(' · ') }),
        ])))
        : el('p', { class: 'muted', text: 'Rien de prévu pour les semaines à venir. Une idée à planifier ?' }),
    ]),

    lastIdeas.length ? el('section', { class: 'home-section' }, [
      el('div', { class: 'block-head' }, [el('h2', { text: 'Dernières idées' }), el('button', { class: 'btn btn-quiet btn-small', type: 'button', text: 'Tout voir', onclick: () => nav('decouvrir/activite') })]),
      ...lastIdeas.map((i) => itemCard(i)),
    ]) : null,

    lastMems.length ? el('section', { class: 'home-section' }, [
      el('div', { class: 'block-head' }, [el('h2', { text: 'Derniers souvenirs' }), el('button', { class: 'btn btn-quiet btn-small', type: 'button', text: "L'album", onclick: () => nav('souvenirs/album') })]),
      el('div', { class: 'memory-scroll' }, lastMems.map((m) => memoryTile(m, () => openMemory(m.id)))),
    ]) : null,
  );
}

// ---------------------------------------------------------------------------
// « On ne sait pas quoi faire ? » : tirage au sort dans vos idées
// (point d'entrée prévu pour l'IA dans une version future)
// ---------------------------------------------------------------------------
const D = { kind: null, budget: null, duration: null, setting: null, category: null };
const BUDGETS = [[0, 'Gratuit'], [20, '≤ 20 €'], [50, '≤ 50 €'], [100, '≤ 100 €']];

export function openDice() {
  const sheet = openSheet({ title: 'On ne sait pas quoi faire ?', className: 'sheet-dice' });
  const result = el('div', { class: 'dice-result', 'aria-live': 'polite' });
  let last = null;

  const pool = () => all('items').filter((i) => i.status === 'idee' && (i.kind === 'activite' || i.kind === 'resto')
    && (!D.kind || i.kind === D.kind)
    && (D.budget === null || (i.kind === 'resto' ? (i.price_level || 1) <= Math.max(1, Math.ceil(D.budget / 30)) : i.budget == null || Number(i.budget) <= D.budget))
    && (!D.duration || i.duration === D.duration || i.kind === 'resto')
    && (!D.setting || !i.setting || i.setting === D.setting || i.setting === 'les_deux')
    && (!D.category || i.category === D.category));

  const roll = () => {
    const list = pool();
    if (!list.length) {
      put(result, el('p', { class: 'muted', text: 'Aucune idée ne correspond. Élargissez les critères ou ajoutez des idées !' }));
      return;
    }
    // Les coups de cœur ont deux fois plus de chances
    const weighted = list.flatMap((i) => (i.favorite ? [i, i] : [i]));
    let pick = weighted[Math.floor(Math.random() * weighted.length)];
    if (list.length > 1 && pick === last) pick = list.find((i) => i !== last);
    last = pick;
    put(result, 
      el('p', { class: 'dice-label', text: 'Et si vous faisiez…' }),
      itemCard(pick, { showStatus: false }),
      el('div', { class: 'cta-row' }, [
        el('button', { class: 'btn btn-soft', type: 'button', text: 'Une autre', onclick: roll }),
        el('button', { class: 'btn btn-accent', type: 'button', text: 'On la prévoit', onclick: () => planItem(pick) }),
      ]),
    );
    result.classList.remove('pop');
    void result.offsetWidth;
    result.classList.add('pop');
  };

  sheet.set([
    el('span', { class: 'field-label', text: 'Plutôt' }),
    chips([['activite', 'Une sortie', '✨'], ['resto', 'Un resto', '🍽️']], D.kind, (v) => { D.kind = v; }, { allowNone: true }),
    el('span', { class: 'field-label', text: 'Budget' }),
    chips(BUDGETS, D.budget, (v) => { D.budget = v; }, { allowNone: true }),
    el('span', { class: 'field-label', text: 'Temps disponible' }),
    chips(DURATIONS, D.duration, (v) => { D.duration = v; }, { allowNone: true, className: 'chips-scroll' }),
    el('span', { class: 'field-label', text: 'Cadre' }),
    chips(SETTINGS.slice(0, 2), D.setting, (v) => { D.setting = v; }, { allowNone: true }),
    el('span', { class: 'field-label', text: 'Envie de' }),
    chips(CATEGORIES.map(([v, l, e]) => [v, l, e]), D.category, (v) => { D.category = v; }, { allowNone: true, className: 'chips-scroll' }),
    el('button', { class: 'btn btn-accent btn-block btn-dice', type: 'button', onclick: roll }, [icon('dice'), 'Tirer au sort']),
    result,
  ]);
}
