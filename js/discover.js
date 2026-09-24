// ============================================================================
//  À découvrir : ce que nous voulons faire
// ============================================================================
import { put, el, icon, chips, segmented, spaceHeader, addButton, empty, debounce, normalize, toast, errorText } from './lib.js';
import { all, get, patch, remove, memberOf, state } from './store.js';
import { KINDS, STATUS, CATEGORIES, PRICES, WISH_KINDS } from './kinds.js';
import { itemCard, openItemForm } from './item.js';
import { formSheet } from './forms.js';

const SECTIONS = [['activite', 'Dates & activités'], ['resto', 'Restos'], ['voyage', 'Voyages'], ['envies', 'Envies & cadeaux']];
const ADD_LABEL = { activite: 'Idée', resto: 'Resto', voyage: 'Voyage', envies: 'Envie' };

// Filtres mémorisés par section pendant la session
const F = Object.fromEntries(['activite', 'resto', 'voyage'].map((k) => [k, { status: 'tous', q: '', category: null, fav: false, price: null, cuisine: null, hood: null }]));
let wishKind = 'envie';

export function render(root, section, nav) {
  const current = SECTIONS.some(([s]) => s === section) ? section : 'activite';
  const body = el('div', { class: 'section-body' });
  put(root, ...spaceHeader({
    title: 'À découvrir',
    subtitle: 'Ce que nous voulons faire',
    tabs: SECTIONS, current, onTab: (s) => nav(`decouvrir/${s}`),
    action: addButton(ADD_LABEL[current], () => (current === 'envies' ? openWishForm(null, { kind: wishKind }) : openItemForm(current, null, { status: F[current].status === 'tous' ? 'idee' : F[current].status }))),
  }), body);

  if (current === 'envies') {
    const refresh = () => drawWishes(body);
    refresh();
    return { refresh };
  }
  return drawItems(body, current);
}

// ---------------------------------------------------------------------------
// Dates, restos, voyages
// ---------------------------------------------------------------------------
function drawItems(body, kind) {
  const f = F[kind];
  const st = STATUS[kind];
  const list = el('div', { class: 'card-list' });
  const filtersBox = el('div', { class: 'toolbar' });
  const search = el('input', { type: 'search', class: 'search-input', value: f.q, placeholder: `Rechercher dans ${KINDS[kind].plural.toLowerCase()}`, 'aria-label': 'Rechercher' });
  search.addEventListener('input', debounce(() => { f.q = search.value; drawList(); }, 150));

  const drawFilters = () => {
    const items = all('items').filter((i) => i.kind === kind);
    const rows = [
      segmented([['tous', 'Tout'], ['idee', st.idee], ['prevue', st.prevue], ['realisee', st.realisee]], f.status, (v) => { f.status = v; drawList(); }, 'segmented-status'),
      el('div', { class: 'search-box' }, [icon('search'), search]),
    ];
    // Tous les filtres sur une seule bande qui défile au doigt
    const strip = el('div', { class: 'filter-strip' }, [
      chips([['fav', 'Coups de cœur', '♥']], f.fav ? 'fav' : null, (v) => { f.fav = v === 'fav'; drawList(); }, { allowNone: true }),
    ]);
    if (kind === 'activite') {
      strip.append(chips(CATEGORIES.map(([v, l, e]) => [v, l, e]), f.category, (v) => { f.category = v; drawList(); }, { allowNone: true }));
    }
    if (kind === 'resto') {
      strip.append(chips(PRICES, f.price, (v) => { f.price = v; drawList(); }, { allowNone: true }));
      const cuisines = [...new Set(items.map((i) => i.cuisine).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
      if (cuisines.length > 1) strip.append(chips(cuisines.map((c) => [c, c]), f.cuisine, (v) => { f.cuisine = v; drawList(); }, { allowNone: true }));
      const hoods = [...new Set(items.map((i) => i.neighborhood).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
      if (hoods.length > 1) strip.append(chips(hoods.map((h) => [h, h, '📍']), f.hood, (v) => { f.hood = v; drawList(); }, { allowNone: true }));
    }
    rows.push(strip);
    put(filtersBox, ...rows);
  };

  const drawList = () => {
    const q = normalize(f.q);
    const items = all('items').filter((i) => i.kind === kind
      && (f.status === 'tous' || i.status === f.status)
      && (!f.fav || i.favorite)
      && (!f.category || i.category === f.category)
      && (!f.price || i.price_level === f.price)
      && (!f.cuisine || i.cuisine === f.cuisine)
      && (!f.hood || i.neighborhood === f.hood)
      && (!q || normalize(`${i.title} ${i.place_name || ''} ${i.cuisine || ''} ${i.neighborhood || ''} ${i.practical || ''} ${i.why || ''}`).includes(q)));

    const total = all('items').filter((i) => i.kind === kind).length;
    if (!total) {
      const text = {
        activite: 'Notez ici toutes vos idées de dates : un cours de cuisine, une expo, une rando… Elles passeront de « Idée » à « Prévue » puis « Réalisée ».',
        resto: 'La liste des restos à tester. Une fois testés, notez-les et gardez un avis pour la prochaine fois.',
        voyage: 'Les voyages dont vous rêvez et ceux que vous avez faits, avec leur préparation et leur journal.',
      }[kind];
      return put(list, empty(text, `Ajouter ${kind === 'activite' ? 'une idée' : kind === 'resto' ? 'un resto' : 'un voyage'}`, () => openItemForm(kind, null, { status: 'idee' })));
    }
    if (!items.length) return put(list, el('p', { class: 'muted pad', text: 'Rien ne correspond à ces filtres.' }));

    const groups = f.status === 'tous' ? ['prevue', 'idee', 'realisee'] : [f.status];
    const out = [];
    for (const g of groups) {
      const part = items.filter((i) => i.status === g).sort(sorters[g]);
      if (!part.length) continue;
      if (f.status === 'tous') out.push(el('h2', { class: 'list-heading' }, [st[g], el('span', { class: 'count', text: String(part.length) })]));
      out.push(...part.map((i) => itemCard(i, { showStatus: false })));
    }
    put(list, ...out);
  };

  put(body, filtersBox, list);
  drawFilters();
  drawList();
  return { refresh: () => { drawFilters(); drawList(); } };
}

const sorters = {
  prevue: (a, b) => (a.planned_on || '9999').localeCompare(b.planned_on || '9999'),
  idee: (a, b) => (b.favorite - a.favorite) || b.created_at.localeCompare(a.created_at),
  realisee: (a, b) => (b.done_on || b.updated_at).localeCompare(a.done_on || a.updated_at),
};

// ---------------------------------------------------------------------------
// Envies & cadeaux
// ---------------------------------------------------------------------------
function drawWishes(body) {
  const list = all('wishes').filter((w) => w.kind === wishKind);
  const open = list.filter((w) => !w.done).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const done = list.filter((w) => w.done).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const intro = {
    envie: 'Les choses qui vous font envie à tous les deux.',
    cadeau: 'Les idées de cadeaux, notées au fil de l’eau. Chacun voit toutes les idées : à vous de jouer la discrétion.',
    projet: 'Vos projets et objectifs à long terme.',
  }[wishKind];
  put(body, 
    el('div', { class: 'toolbar' }, [segmented(WISH_KINDS, wishKind, (v) => { wishKind = v; drawWishes(body); }, 'segmented-status')]),
    el('p', { class: 'muted pad-x', text: intro }),
    open.length || done.length ? el('ul', { class: 'check-list' }, [...open, ...done].map(wishRow)) : empty('Rien pour l’instant.', 'Ajouter', () => openWishForm(null, { kind: wishKind })),
  );
}

function wishRow(w) {
  const who = w.for_user ? memberOf(w.for_user) : null;
  return el('li', { class: `check-row ${w.done ? 'is-done' : ''}` }, [
    el('button', { class: 'check', type: 'button', 'aria-pressed': String(w.done), 'aria-label': w.done ? 'Marquer comme à faire' : 'Marquer comme fait',
      onclick: () => patch('wishes', w.id, { done: !w.done }).catch((e) => toast(errorText(e), 'error')) }, [icon('check')]),
    el('button', { class: 'check-body', type: 'button', onclick: () => openWishForm(w.id) }, [
      el('span', { class: 'check-title', text: w.title }),
      el('span', { class: 'check-meta' }, [
        who ? el('span', { class: 'dot', style: `--c:${who.color}` }) : null,
        who ? `Pour ${who.display_name}` : null,
        w.link ? el('span', {}, [icon('link'), ' lien']) : null,
        w.notes ? ` ${w.notes.slice(0, 60)}` : null,
      ]),
    ]),
  ]);
}

export function openWishForm(id = null, preset = {}) {
  const current = id ? get('wishes', id) : null;
  formSheet({
    title: current ? 'Modifier' : 'Nouvelle envie',
    fields: [
      { key: 'title', type: 'text', label: 'Quoi ?', required: true, max: 120, placeholder: 'Un week-end à la neige' },
      { key: 'kind', type: 'segmented', label: 'Type', options: [['envie', 'Envie'], ['cadeau', 'Cadeau'], ['projet', 'Projet']] },
      { key: 'for_user', type: 'person', label: 'Pour qui ?', when: (v) => v.kind === 'cadeau' },
      { key: 'link', type: 'url', label: 'Lien', max: 500, placeholder: 'https://…' },
      { key: 'notes', type: 'textarea', label: 'Notes', max: 1000 },
    ],
    initial: current ? { ...current } : { kind: 'envie', ...preset },
    table: 'wishes',
    id,
    submitLabel: current ? 'Enregistrer' : 'Ajouter',
    onDelete: current ? async (sheet) => {
      if (!confirm(`Supprimer « ${current.title} » ?`)) return;
      try { await remove('wishes', id); sheet.close(); } catch (e) { toast(errorText(e), 'error'); }
    } : null,
  });
}
