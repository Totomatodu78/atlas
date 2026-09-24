// ============================================================================
//  Expériences (dates, restos, voyages, lieux) : une seule fiche qui évolue
//  Idée -> Prévue -> Réalisée, jamais recopiée.
// ============================================================================
import { el, icon, openSheet, toast, errorText, fmtDay, fmtRange, money, todayISO, stars, openLightbox } from './lib.js';
import { all, get, patch, remove, photoPath, fillImg, signedUrls, deletePhotos, memberOf } from './store.js';
import { KINDS, STATUS, statusOptions, CATEGORIES, categoryOf, DURATIONS, SETTINGS, PRICES, CUISINES } from './kinds.js';
import { formSheet } from './forms.js';
import { openMemoryForm, memoryTile, openMemory } from './memories.js';

// ---------------------------------------------------------------------------
// Champs des formulaires, selon le type
// ---------------------------------------------------------------------------
const is = (...st) => (v) => st.includes(v.status);

export function itemFields(kind, id) {
  const f = {
    title: { key: 'title', type: 'text', required: true, max: 120,
      label: { activite: 'Quoi ?', resto: 'Nom du restaurant', voyage: 'Destination', lieu: 'Nom du lieu' }[kind],
      placeholder: { activite: 'Cours de poterie à deux', resto: 'Chez Janou', voyage: 'Japon', lieu: 'Lisbonne' }[kind] },
    status: { key: 'status', type: 'segmented', label: 'Statut', options: statusOptions(kind) },
    favorite: { key: 'favorite', type: 'toggle', toggleLabel: 'Coup de cœur ♥' },
    place: { key: 'place', type: 'place', label: 'Où ?', fillTitle: kind === 'voyage' || kind === 'lieu',
      placeholder: kind === 'resto' ? 'Nom ou adresse du restaurant' : undefined },
    link: { key: 'link', type: 'url', label: 'Lien', placeholder: 'https://…', max: 500 },
    cover: { key: 'cover', type: 'photos', label: 'Photo', max: 1, ownerId: id },
    trip: { key: 'trip_id', type: 'itemref', label: 'Pendant un voyage ?', noneLabel: 'Non', filter: (i) => i.kind === 'voyage' && i.id !== id },
    planned: { key: 'planned_on', type: 'date', label: kind === 'resto' ? 'Réservé pour le' : 'Prévu le', when: is('prevue') },
    done: { key: 'done_on', type: 'date', label: kind === 'voyage' ? 'Rentrés le' : 'Fait le', when: is('realisee') },
    rating: { key: 'rating', type: 'stars', label: 'Note', when: is('realisee') },
    review: { key: 'review', type: 'textarea', max: 4000, when: is('realisee'), rows: 4,
      label: { activite: 'Commentaire', resto: 'Notre avis', voyage: 'Journal de voyage', lieu: 'Notes' }[kind] },
  };
  switch (kind) {
    case 'activite': return [
      f.title, f.status,
      { key: 'category', type: 'chips', label: 'Catégorie', options: CATEGORIES.map(([v, l, e]) => [v, l, e]) },
      f.planned, f.done, f.rating, f.review,
      f.place,
      { key: 'budget', type: 'money', label: 'Budget' },
      { key: 'duration', type: 'chips', label: 'Durée', options: DURATIONS },
      { key: 'setting', type: 'chips', label: 'Cadre', options: SETTINGS },
      { key: 'practical', type: 'textarea', label: 'Infos pratiques', max: 4000, placeholder: 'Réserver 48 h avant, prévoir des baskets…' },
      f.link, f.favorite, f.cover, f.trip,
    ];
    case 'resto': return [
      f.title, f.status,
      { key: 'cuisine', type: 'text', label: 'Type de cuisine', max: 40, suggestions: CUISINES, placeholder: 'Japonais' },
      { key: 'price_level', type: 'chips', label: 'Gamme de prix', options: PRICES },
      f.planned, f.done, f.rating, f.review,
      f.place,
      { key: 'why', type: 'textarea', label: 'Pourquoi le tester ?', max: 1000, placeholder: 'Recommandé par Julie, les gyozas maison…', when: is('idee', 'prevue') },
      f.link, f.favorite, f.cover, f.trip,
    ];
    case 'voyage': return [
      f.place, f.title, f.status,
      { key: 'planned_on', type: 'date', label: 'Départ', when: is('prevue', 'realisee') },
      { key: 'planned_end', type: 'date', label: 'Retour', when: is('prevue', 'realisee') },
      f.rating, f.review,
      { key: 'budget', type: 'money', label: 'Budget' },
      { key: 'practical', type: 'textarea', label: 'Préparation et planning', max: 4000, rows: 5, placeholder: 'Passeports, vols, hébergement, itinéraire…' },
      f.link, f.favorite, f.cover,
    ];
    default: return [f.place, f.title, f.status, f.done, f.review, f.favorite, f.cover];
  }
}

// ---------------------------------------------------------------------------
// Petits éléments visuels
// ---------------------------------------------------------------------------
export function itemEmoji(item) {
  return (item.kind === 'activite' && categoryOf(item.category)?.[2]) || KINDS[item.kind].emoji;
}

export function itemThumb(item, cls = 'thumb') {
  const box = el('span', { class: cls, style: `--k:${KINDS[item.kind].color}` });
  if (item.cover) {
    const img = el('img', { alt: '', loading: 'lazy', decoding: 'async' });
    fillImg(img, photoPath(item.id, item.cover, true));
    box.append(img);
  } else {
    box.append(el('span', { class: 'thumb-emoji', text: itemEmoji(item) }));
  }
  return box;
}

export function statusPill(item) {
  return el('span', { class: `pill pill-${item.status}`, text: STATUS[item.kind][item.status] });
}

export function itemMeta(item) {
  const parts = [];
  if (item.kind === 'activite' && item.category) parts.push(categoryOf(item.category)?.[1]);
  if (item.kind === 'resto' && item.cuisine) parts.push(item.cuisine);
  if (item.kind === 'resto' && item.price_level) parts.push('€'.repeat(item.price_level));
  if (item.status === 'prevue' && item.planned_on) parts.push(fmtRange(item.planned_on, item.planned_end));
  else if (item.status === 'realisee' && item.done_on) parts.push(fmtDay(item.done_on));
  const where = item.kind === 'resto' ? item.neighborhood || item.place_name : item.place_name !== item.title ? item.place_name : item.country;
  if (where) parts.push(where);
  if (item.kind !== 'resto' && item.budget != null) parts.push(Number(item.budget) === 0 ? 'Gratuit' : money(item.budget));
  return parts.filter(Boolean).join(' · ');
}

export function itemCard(item, { onClick, showStatus = true } = {}) {
  return el('button', { class: 'card-item', type: 'button', onclick: onClick || (() => openItem(item.id)) }, [
    itemThumb(item),
    el('span', { class: 'card-body' }, [
      el('span', { class: 'card-title' }, [item.title, item.favorite ? el('span', { class: 'fav', 'aria-label': 'Coup de cœur', text: ' ♥' }) : null]),
      el('span', { class: 'card-meta', text: itemMeta(item) }),
      item.status === 'realisee' && item.rating ? stars(item.rating, 'stars-sm') : null,
    ]),
    showStatus ? statusPill(item) : null,
  ]);
}

// ---------------------------------------------------------------------------
// Fiche détaillée
// ---------------------------------------------------------------------------
export function openItem(id) {
  const item = get('items', id);
  if (!item) return;
  const hero = el('div', { class: 'hero' });
  const sheet = openSheet({ hero, className: 'sheet-detail' });
  sheet.refresh = () => {
    const it = get('items', id);
    if (!it) return sheet.close();
    renderHero(hero, it);
    sheet.set(renderItem(it, sheet));
  };
  sheet.refresh();
  return sheet;
}

function renderHero(hero, item) {
  hero.replaceChildren();
  hero.style.setProperty('--k', KINDS[item.kind].color);
  hero.classList.toggle('hero-photo', !!item.cover);
  if (item.cover) {
    const img = el('img', { alt: item.title });
    const path = photoPath(item.id, item.cover);
    fillImg(img, path);
    img.addEventListener('click', () => img.src && openLightbox(img.src, item.title));
    hero.append(img);
  } else {
    hero.append(el('span', { class: 'hero-emoji', text: itemEmoji(item) }));
  }
}

function infoRow(label, value, extra) {
  if (value === null || value === undefined || value === '') return null;
  return el('div', { class: 'info-row' }, [el('dt', { text: label }), el('dd', {}, [value, extra])]);
}

function renderItem(item, sheet) {
  const k = KINDS[item.kind];
  const st = STATUS[item.kind];
  const children = [];

  // En-tête
  children.push(el('div', { class: 'detail-kicker' }, [
    el('span', { class: 'kind-tag', style: `--k:${k.color}`, text: `${k.emoji} ${k.label}` }),
    el('button', {
      class: `fav-btn ${item.favorite ? 'on' : ''}`, type: 'button', 'aria-pressed': String(item.favorite),
      'aria-label': item.favorite ? 'Retirer des coups de cœur' : 'Ajouter aux coups de cœur',
      onclick: () => patch('items', item.id, { favorite: !item.favorite }).catch((e) => toast(errorText(e), 'error')),
    }, [icon('heart')]),
  ]));
  children.push(el('h2', { class: 'detail-title', text: item.title }));
  const meta = itemMeta(item);
  if (meta) children.push(el('p', { class: 'detail-meta', text: meta }));

  // Parcours de statut : la même fiche avance, elle n'est jamais recopiée
  const steps = ['idee', 'prevue', 'realisee'];
  const idx = steps.indexOf(item.status);
  children.push(el('ol', { class: 'status-track', 'aria-label': 'Avancement' }, steps.map((s, i) =>
    el('li', { class: i < idx ? 'past' : i === idx ? 'current' : '' }, [el('span', { class: 'status-dot' }), st[s]]))));

  const actions = el('div', { class: 'cta-row' });
  if (item.status === 'idee') {
    actions.append(
      el('button', { class: 'btn btn-soft', type: 'button', text: item.kind === 'resto' ? 'On réserve' : 'On le prévoit', onclick: () => planItem(item) }),
      el('button', { class: 'btn btn-accent', type: 'button', text: "C'est fait !", onclick: () => completeItem(item) }),
    );
  } else if (item.status === 'prevue') {
    actions.append(
      el('button', { class: 'btn btn-soft', type: 'button', text: 'Changer la date', onclick: () => planItem(item) }),
      el('button', { class: 'btn btn-accent', type: 'button', text: "C'est fait !", onclick: () => completeItem(item) }),
    );
  }
  if (actions.children.length) children.push(actions);

  // Retour d'expérience
  if (item.status === 'realisee' && (item.rating || item.review)) {
    children.push(el('div', { class: 'review-card' }, [
      item.rating ? stars(item.rating) : null,
      item.review ? el('p', { text: item.review }) : null,
    ]));
  }

  // Informations
  const place = item.place_name
    ? el('span', {}, [
      [item.place_name, item.neighborhood, item.country].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(', '),
      item.lat != null ? el('a', {
        class: 'inline-link', target: '_blank', rel: 'noopener noreferrer',
        href: `https://www.openstreetmap.org/?mlat=${item.lat}&mlon=${item.lng}#map=16/${item.lat}/${item.lng}`,
        text: ' Ouvrir le plan',
      }) : null,
    ]) : null;
  const trip = get('items', item.trip_id);
  const rows = [
    infoRow('Où', place),
    item.kind === 'activite' ? infoRow('Catégorie', categoryOf(item.category) ? `${categoryOf(item.category)[2]} ${categoryOf(item.category)[1]}` : null) : null,
    infoRow('Cuisine', item.cuisine),
    infoRow('Prix', item.price_level ? '€'.repeat(item.price_level) : null),
    infoRow('Budget', item.budget != null ? (Number(item.budget) === 0 ? 'Gratuit' : money(item.budget)) : null),
    infoRow('Durée', DURATIONS.find((d) => d[0] === item.duration)?.[1]),
    infoRow('Cadre', SETTINGS.find((d) => d[0] === item.setting)?.[1]),
    infoRow(item.status === 'realisee' ? 'Dates' : 'Prévu', item.planned_on ? fmtRange(item.planned_on, item.planned_end) : null),
    infoRow('Fait le', item.status === 'realisee' && item.done_on && item.kind !== 'voyage' ? fmtDay(item.done_on) : null),
    infoRow('Voyage', trip ? el('button', { class: 'inline-link', type: 'button', text: `${KINDS.voyage.emoji} ${trip.title}`, onclick: () => openItem(trip.id) }) : null),
    infoRow('Lien', item.link ? el('a', { class: 'inline-link', href: item.link, target: '_blank', rel: 'noopener noreferrer', text: shortUrl(item.link) }) : null),
    infoRow('Ajouté par', memberOf(item.created_by).display_name),
  ].filter(Boolean);
  if (rows.length) children.push(el('dl', { class: 'info-list' }, rows));
  if (item.why && item.status !== 'realisee') children.push(textBlock('Pourquoi le tester', item.why));
  if (item.practical) children.push(textBlock(item.kind === 'voyage' ? 'Préparation et planning' : 'Infos pratiques', item.practical));

  // Voyage : ce qu'on fait sur place
  if (item.kind === 'voyage') {
    const onsite = all('items').filter((i) => i.trip_id === item.id);
    children.push(el('section', { class: 'block' }, [
      el('h3', { text: 'Sur place' }),
      ...onsite.map((i) => itemCard(i)),
      onsite.length ? null : el('p', { class: 'muted', text: 'Les activités et restos de ce voyage apparaîtront ici.' }),
      el('div', { class: 'row-links' }, [
        el('button', { class: 'btn btn-quiet btn-small', type: 'button', text: '+ Activité', onclick: () => openItemForm('activite', null, { trip_id: item.id, status: 'idee' }) }),
        el('button', { class: 'btn btn-quiet btn-small', type: 'button', text: '+ Restaurant', onclick: () => openItemForm('resto', null, { trip_id: item.id, status: 'idee' }) }),
      ]),
    ]));
  }

  // Album lié (souvenirs accessibles dans les deux sens)
  const mems = all('memories').filter((m) => m.item_id === item.id).sort(byDateDesc);
  const photoPaths = mems.flatMap((m) => m.photos.map((p) => photoPath(m.id, p, true))).slice(0, 8);
  if (photoPaths.length) signedUrls(photoPaths);
  children.push(el('section', { class: 'block' }, [
    el('div', { class: 'block-head' }, [
      el('h3', { text: item.kind === 'voyage' ? 'Journal et album' : 'Album' }),
      mems.length ? el('button', { class: 'btn btn-quiet btn-small', type: 'button', text: `Voir l'album (${mems.length})`, onclick: () => openAlbumFor(item) }) : null,
    ]),
    photoPaths.length ? el('div', { class: 'strip' }, photoPaths.map((p, i) => {
      const img = el('img', { alt: '', loading: 'lazy' });
      fillImg(img, p);
      return el('button', { type: 'button', class: 'strip-photo', 'aria-label': `Photo ${i + 1}`, onclick: () => openAlbumFor(item) }, [img]);
    })) : el('p', { class: 'muted', text: 'Aucun souvenir pour l’instant.' }),
    el('button', { class: 'btn btn-soft btn-block', type: 'button', text: 'Ajouter un souvenir', onclick: () => addMemoryFor(item) }),
  ]));

  // Modifier / supprimer
  children.push(el('div', { class: 'cta-row cta-row-end' }, [
    el('button', { class: 'btn btn-soft', type: 'button', onclick: () => openItemForm(item.kind, item.id) }, [icon('edit'), 'Modifier']),
    el('button', { class: 'btn btn-quiet btn-danger-text', type: 'button', onclick: () => deleteItem(item, sheet) }, [icon('trash'), 'Supprimer']),
  ]));
  return children;
}

const byDateDesc = (a, b) => (b.happened_on || b.created_at).localeCompare(a.happened_on || a.created_at);
const textBlock = (title, text) => el('section', { class: 'block' }, [el('h3', { text: title }), el('p', { class: 'prose', text })]);
function shortUrl(u) {
  try { const x = new URL(u); return x.hostname.replace(/^www\./, '') + (x.pathname.length > 1 ? '/…' : ''); } catch { return u; }
}

async function deleteItem(item, sheet) {
  const mems = all('memories').filter((m) => m.item_id === item.id).length;
  const extra = mems ? ` Ses ${mems} souvenir(s) seront conservés dans l'album.` : '';
  if (!confirm(`Supprimer « ${item.title} » ?${extra}`)) return;
  try {
    await remove('items', item.id);
    if (item.cover) await deletePhotos(item.id, [item.cover]);
    sheet.close();
    toast('Supprimé');
  } catch (e) { toast(errorText(e), 'error'); }
}

// ---------------------------------------------------------------------------
// Création / modification
// ---------------------------------------------------------------------------
export function openItemForm(kind, id = null, preset = {}) {
  const current = id ? get('items', id) : null;
  const ownerId = id || null;
  const initial = current ? { ...current } : { status: 'idee', favorite: false, ...preset };
  return formSheet({
    title: current ? `Modifier` : `Nouveau : ${KINDS[kind].label.toLowerCase()}`,
    fields: itemFields(kind, ownerId),
    initial,
    table: 'items',
    id,
    extra: (v) => ({
      kind,
      done_on: v.status === 'realisee' ? v.done_on || v.planned_end || v.planned_on || todayISO() : v.done_on || null,
    }),
    submitLabel: current ? 'Enregistrer' : 'Ajouter',
    onSaved: (data) => {
      if (!current) {
        toast(`${KINDS[kind].label} ajouté${kind === 'activite' ? 'e' : ''}`);
        openItem(data.id);
      }
    },
  });
}

// On le prévoit : la fiche passe en "prévue" et apparaît dans l'agenda
export function planItem(item) {
  const fields = item.kind === 'voyage'
    ? [{ key: 'planned_on', type: 'date', label: 'Départ', required: true }, { key: 'planned_end', type: 'date', label: 'Retour' }]
    : [{ key: 'planned_on', type: 'date', label: item.kind === 'resto' ? 'Réservé pour le' : 'Quand ?', required: true }];
  formSheet({
    title: item.kind === 'resto' ? 'On réserve' : 'On le prévoit',
    fields: [...fields, { key: 'hint', type: 'none', label: '', hint: "La date apparaîtra dans l'agenda commun.", virtual: true }],
    initial: { planned_on: item.planned_on || '', planned_end: item.planned_end || '' },
    table: 'items',
    id: item.id,
    extra: { status: 'prevue' },
    submitLabel: 'Enregistrer la date',
    onSaved: () => toast("C'est prévu, c'est dans l'agenda"),
  });
}

// C'est fait : date, note, avis, puis proposition d'ajouter un souvenir
export function completeItem(item) {
  const label = { activite: 'Commentaire', resto: 'Notre avis', voyage: 'Journal de voyage', lieu: 'Notes' }[item.kind];
  formSheet({
    title: "C'est fait !",
    fields: [
      { key: 'done_on', type: 'date', label: 'Quand ?', required: true },
      { key: 'rating', type: 'stars', label: 'Note' },
      { key: 'review', type: 'textarea', label, max: 4000, rows: 4 },
    ],
    initial: { done_on: item.planned_end || item.planned_on || todayISO(), rating: item.rating, review: item.review || '' },
    table: 'items',
    id: item.id,
    extra: { status: 'realisee' },
    submitLabel: 'Valider',
    onSaved: (data) => toast('Bien noté', 'info', { label: 'Ajouter un souvenir', run: () => addMemoryFor(data) }),
  });
}

export function addMemoryFor(item) {
  openMemoryForm(null, { item_id: item.id, title: item.title, happened_on: item.done_on || item.planned_on || todayISO() });
}

// Album d'une expérience
export function openAlbumFor(item) {
  const sheet = openSheet({ title: `Album : ${item.title}` });
  sheet.refresh = () => {
    const mems = all('memories').filter((m) => m.item_id === item.id).sort(byDateDesc);
    sheet.set([
      mems.length ? el('div', { class: 'memory-grid' }, mems.map((m) => memoryTile(m, () => openMemory(m.id)))) : el('p', { class: 'muted', text: 'Pas encore de souvenir.' }),
      el('button', { class: 'btn btn-accent btn-block', type: 'button', text: 'Ajouter un souvenir', onclick: () => addMemoryFor(item) }),
    ]);
  };
  sheet.refresh();
}
