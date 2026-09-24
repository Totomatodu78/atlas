// ============================================================================
//  Souvenirs : album, historique, rétrospective (+ carte, dans map.js)
// ============================================================================
import { put, el, icon, openSheet, toast, errorText, fmtDay, fmtMonth, fmtMonthShort, parseDay, todayISO, spaceHeader, addButton, empty, chips, debounce, normalize, openLightbox, stars } from './lib.js';
import { all, get, remove, photoPath, fillImg, signedUrls, deletePhotos, memberOf, state } from './store.js';
import { KINDS, moodOf, CATEGORIES, categoryOf } from './kinds.js';
import { formSheet } from './forms.js';
import { openItem, itemCard, itemEmoji } from './item.js';
import { renderMap } from './map.js';

// ---------------------------------------------------------------------------
// Souvenir : vignette, fiche, formulaire
// ---------------------------------------------------------------------------
export function memoryTile(m, onClick) {
  const mood = moodOf(m.mood);
  const cover = el('span', { class: 'memory-cover' });
  if (m.photos.length) {
    const img = el('img', { alt: '', loading: 'lazy', decoding: 'async' });
    fillImg(img, photoPath(m.id, m.photos[0], true));
    cover.append(img);
    if (m.photos.length > 1) cover.append(el('span', { class: 'memory-count', text: `${m.photos.length}` }));
  } else {
    cover.append(el('span', { class: 'memory-emoji', text: mood?.[1] || '📝' }));
  }
  return el('button', { class: 'memory-tile', type: 'button', onclick: onClick }, [
    cover,
    el('span', { class: 'memory-title', text: m.title }),
    el('span', { class: 'memory-date', text: [m.happened_on ? fmtDay(m.happened_on) : null, mood?.[1]].filter(Boolean).join('  ') }),
  ]);
}

export function openMemory(id) {
  const hero = el('div', { class: 'hero hero-gallery' });
  const sheet = openSheet({ hero, className: 'sheet-detail' });
  sheet.refresh = () => {
    const m = get('memories', id);
    if (!m) return sheet.close();
    renderGallery(hero, m);
    const mood = moodOf(m.mood);
    const item = get('items', m.item_id);
    sheet.set([
      el('div', { class: 'detail-kicker' }, [
        el('span', { class: 'kind-tag', style: '--k:var(--souvenirs)', text: m.album ? `📚 ${m.album}` : '📷 Souvenir' }),
      ]),
      el('h2', { class: 'detail-title', text: m.title }),
      el('p', { class: 'detail-meta', text: [m.happened_on ? fmtDay(m.happened_on) : null, mood ? `${mood[1]} ${mood[2]}` : null, `par ${memberOf(m.created_by).display_name}`].filter(Boolean).join(' · ') }),
      m.story ? el('p', { class: 'prose story', text: m.story }) : null,
      item ? el('section', { class: 'block' }, [el('h3', { text: 'Lié à' }), itemCard(item)]) : null,
      el('div', { class: 'cta-row cta-row-end' }, [
        el('button', { class: 'btn btn-soft', type: 'button', onclick: () => openMemoryForm(m.id) }, [icon('edit'), 'Modifier']),
        el('button', { class: 'btn btn-quiet btn-danger-text', type: 'button', onclick: () => deleteMemory(m, sheet) }, [icon('trash'), 'Supprimer']),
      ]),
    ]);
  };
  sheet.refresh();
}

function renderGallery(hero, m) {
  hero.replaceChildren();
  if (!m.photos.length) {
    hero.classList.remove('hero-photo');
    hero.style.setProperty('--k', 'var(--souvenirs)');
    hero.append(el('span', { class: 'hero-emoji', text: moodOf(m.mood)?.[1] || '📝' }));
    return;
  }
  hero.classList.add('hero-photo');
  const track = el('div', { class: 'gallery' });
  const count = el('span', { class: 'gallery-count', hidden: m.photos.length < 2, text: `1 / ${m.photos.length}` });
  const paths = m.photos.map((p) => photoPath(m.id, p));
  signedUrls(paths).then((urls) => {
    urls.forEach((u, i) => {
      if (!u) return;
      const img = el('img', { src: u, alt: `Photo ${i + 1} : ${m.title}`, loading: i ? 'lazy' : 'eager' });
      img.addEventListener('click', () => openLightbox(u, img.alt));
      track.append(el('figure', {}, [img]));
    });
  });
  track.addEventListener('scroll', () => {
    count.textContent = `${Math.round(track.scrollLeft / track.clientWidth) + 1} / ${m.photos.length}`;
  }, { passive: true });
  hero.append(track, count);
}

async function deleteMemory(m, sheet) {
  if (!confirm(`Supprimer le souvenir « ${m.title} » et ses ${m.photos.length} photo(s) ?`)) return;
  try {
    await remove('memories', m.id);
    await deletePhotos(m.id, m.photos);
    sheet.close();
    toast('Souvenir supprimé');
  } catch (e) { toast(errorText(e), 'error'); }
}

const albums = () => [...new Set(all('memories').map((m) => m.album).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));

export function openMemoryForm(id = null, preset = {}) {
  const current = id ? get('memories', id) : null;
  return formSheet({
    title: current ? 'Modifier le souvenir' : 'Nouveau souvenir',
    fields: [
      { key: 'photos', type: 'photos', label: 'Photos', max: 20, ownerId: id },
      { key: 'title', type: 'text', label: 'Titre', required: true, max: 120, placeholder: 'Pique-nique au bord du lac' },
      { key: 'happened_on', type: 'date', label: 'Date' },
      { key: 'mood', type: 'mood', label: 'Humeur' },
      { key: 'story', type: 'textarea', label: 'Anecdote', max: 4000, rows: 4, placeholder: 'Ce dont on veut se souvenir…' },
      { key: 'item_id', type: 'itemref', label: 'Lié à', noneLabel: 'Souvenir libre (sans expérience)' },
      { key: 'album', type: 'text', label: 'Album', max: 60, suggestions: albums(), placeholder: 'Espagne 2026' },
    ],
    initial: current ? { ...current } : { happened_on: todayISO(), photos: [], ...preset },
    table: 'memories',
    id,
    submitLabel: current ? 'Enregistrer' : 'Ajouter le souvenir',
    onSaved: (data) => { if (!current) { toast('Souvenir ajouté'); openMemory(data.id); } },
  });
}

// ---------------------------------------------------------------------------
// L'espace Souvenirs
// ---------------------------------------------------------------------------
const SECTIONS = [['album', 'Album'], ['carte', 'Carte'], ['historique', 'Historique'], ['retro', 'Rétro']];
const filters = { q: '', year: null, type: null, album: null };
let retroYear = null;

export function render(root, section, nav) {
  const current = SECTIONS.some(([s]) => s === section) ? section : 'album';
  const body = el('div', { class: `section-body section-${current}` });
  put(root, ...spaceHeader({
    title: 'Souvenirs',
    subtitle: 'Ce que nous avons vécu et gardé',
    tabs: SECTIONS, current, onTab: (s) => nav(`souvenirs/${s}`),
    action: current === 'album' ? addButton('Souvenir', () => openMemoryForm()) : null,
  }), body);

  if (current === 'carte') return renderMap(body);
  const draw = { album: drawAlbum, historique: drawHistory, retro: drawRetro }[current];
  const refresh = () => draw(body);
  refresh();
  return { refresh };
}

// Album : toutes les photos, filtrables
function drawAlbum(body) {
  const mems = all('memories').sort((a, b) => (b.happened_on || b.created_at).localeCompare(a.happened_on || a.created_at));
  if (!mems.length) {
    return put(body, empty('Votre album est vide. Ajoutez votre premier souvenir, avec autant de photos que vous voulez.', 'Ajouter un souvenir', () => openMemoryForm()));
  }
  const years = [...new Set(mems.map((m) => (m.happened_on || m.created_at).slice(0, 4)))];
  const typeOf = (m) => get('items', m.item_id)?.kind || 'libre';
  const types = [[null, 'Tous'], ...Object.entries(KINDS).filter(([k]) => mems.some((m) => typeOf(m) === k)).map(([k, v]) => [k, v.short, v.emoji]), ...(mems.some((m) => typeOf(m) === 'libre') ? [['libre', 'Libres', '📝']] : [])];

  const search = el('input', { type: 'search', class: 'search-input', placeholder: 'Rechercher un souvenir', value: filters.q, 'aria-label': 'Rechercher' });
  const grid = el('div', { class: 'memory-grid' });
  const drawGrid = () => {
    const q = normalize(filters.q);
    const list = mems.filter((m) =>
      (!filters.year || (m.happened_on || m.created_at).startsWith(filters.year))
      && (!filters.type || typeOf(m) === filters.type)
      && (!filters.album || m.album === filters.album)
      && (!q || normalize(`${m.title} ${m.story || ''} ${m.album || ''} ${get('items', m.item_id)?.title || ''}`).includes(q)));
    signedUrls(list.filter((m) => m.photos.length).map((m) => photoPath(m.id, m.photos[0], true)));
    put(grid, ...(list.length ? list.map((m) => memoryTile(m, () => openMemory(m.id))) : [el('p', { class: 'muted', text: 'Aucun souvenir ne correspond.' })]));
  };
  search.addEventListener('input', debounce(() => { filters.q = search.value; drawGrid(); }, 150));

  const albumList = albums();
  put(body, 
    el('div', { class: 'toolbar' }, [
      el('div', { class: 'search-box' }, [icon('search'), search]),
      chips([[null, 'Toutes les années'], ...years.map((y) => [y, y])], filters.year, (v) => { filters.year = v; drawGrid(); }, { className: 'chips-scroll' }),
      types.length > 2 ? chips(types, filters.type, (v) => { filters.type = v; drawGrid(); }, { className: 'chips-scroll' }) : null,
      albumList.length ? chips(albumList.map((a) => [a, a, '📚']), filters.album, (v) => { filters.album = v; drawGrid(); }, { className: 'chips-scroll', allowNone: true }) : null,
    ]),
    grid,
  );
  drawGrid();
}

// Historique : tout ce qui est réalisé, en chronologie (simple vue, pas de base en plus)
const doneDate = (i) => i.done_on || i.planned_end || i.planned_on || i.updated_at.slice(0, 10);

function drawHistory(body) {
  const done = all('items').filter((i) => i.status === 'realisee').sort((a, b) => doneDate(b).localeCompare(doneDate(a)));
  if (!done.length) return put(body, empty('Rien de réalisé pour l’instant. Chaque date, resto ou voyage marqué « fait » apparaîtra ici, dans l’ordre.'));
  const out = [];
  let year = null;
  for (const it of done) {
    const d = doneDate(it);
    if (d.slice(0, 4) !== year) { year = d.slice(0, 4); out.push(el('h2', { class: 'timeline-year', text: year })); }
    out.push(el('div', { class: 'timeline-row' }, [
      el('span', { class: 'timeline-date' }, [el('strong', { text: String(parseDay(d).getDate()) }), fmtMonthShort(d)]),
      itemCard(it, { showStatus: false }),
    ]));
  }
  put(body, el('div', { class: 'timeline' }, out));
}

// Rétrospective : notre année en chiffres et en photos
function drawRetro(body) {
  const items = all('items');
  const mems = all('memories');
  const yearOf = (s) => (s || '').slice(0, 4);
  const years = [...new Set([
    ...items.filter((i) => i.status === 'realisee').map((i) => yearOf(doneDate(i))),
    ...mems.map((m) => yearOf(m.happened_on || m.created_at)),
  ])].filter(Boolean).sort().reverse();
  if (!years.length) return put(body, empty('La rétrospective se remplira au fil de vos sorties et de vos souvenirs.'));
  if (!retroYear || !years.includes(retroYear)) retroYear = years[0];

  const done = items.filter((i) => i.status === 'realisee' && yearOf(doneDate(i)) === retroYear);
  const yearMems = mems.filter((m) => yearOf(m.happened_on || m.created_at) === retroYear);
  const countries = new Set(done.map((i) => i.country_code).filter(Boolean));
  const count = (k) => done.filter((i) => i.kind === k).length;
  const photos = yearMems.reduce((n, m) => n + m.photos.length, 0);

  const stat = (n, label, color) => el('div', { class: 'stat', style: `--c:${color}` }, [el('strong', { text: String(n) }), el('span', { text: label })]);
  const byCat = CATEGORIES.map(([v, l, e]) => [e, l, done.filter((i) => i.kind === 'activite' && i.category === v).length]).filter((c) => c[2]);
  const max = Math.max(1, ...byCat.map((c) => c[2]));
  const best = done.filter((i) => i.rating === 5).slice(0, 3);
  const mosaic = yearMems.flatMap((m) => m.photos.map((p) => [m, p])).slice(0, 24);
  signedUrls(mosaic.map(([m, p]) => photoPath(m.id, p, true)));

  put(body, 
    chips(years.map((y) => [y, y]), retroYear, (v) => { retroYear = v; drawRetro(body); }, { className: 'chips-scroll' }),
    el('h2', { class: 'retro-title', text: `Notre année ${retroYear}` }),
    el('div', { class: 'stats' }, [
      stat(count('activite'), count('activite') > 1 ? 'dates réalisées' : 'date réalisée', KINDS.activite.color),
      stat(count('resto'), count('resto') > 1 ? 'restos testés' : 'resto testé', KINDS.resto.color),
      stat(count('voyage'), count('voyage') > 1 ? 'voyages' : 'voyage', KINDS.voyage.color),
      stat(countries.size, 'pays', '#2E9E5B'),
      stat(yearMems.length, yearMems.length > 1 ? 'souvenirs' : 'souvenir', 'var(--souvenirs)'),
      stat(photos, 'photos', '#D6457A'),
    ]),
    byCat.length ? el('section', { class: 'block' }, [
      el('h3', { text: 'Nos types de dates' }),
      el('div', { class: 'bars' }, byCat.map(([e, l, n]) => el('div', { class: 'bar-row' }, [
        el('span', { class: 'bar-label', text: `${e} ${l}` }),
        el('span', { class: 'bar' }, [el('span', { style: `width:${(n / max) * 100}%` })]),
        el('span', { class: 'bar-value', text: String(n) }),
      ]))),
    ]) : null,
    best.length ? el('section', { class: 'block' }, [el('h3', { text: 'Nos coups de cœur (5 étoiles)' }), ...best.map((i) => itemCard(i, { showStatus: false }))]) : null,
    mosaic.length ? el('section', { class: 'block' }, [
      el('h3', { text: 'Notre année en photos' }),
      el('div', { class: 'mosaic' }, mosaic.map(([m, p]) => {
        const img = el('img', { alt: m.title, loading: 'lazy' });
        fillImg(img, photoPath(m.id, p, true));
        return el('button', { type: 'button', class: 'mosaic-cell', 'aria-label': m.title, onclick: () => openMemory(m.id) }, [img]);
      })),
    ]) : null,
  );
}
