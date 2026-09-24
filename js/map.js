// ============================================================================
//  Carte des lieux : restos, activités, villes et voyages sur un globe
// ============================================================================
import { put, el, chips, segmented, openSheet, toast } from './lib.js';
import { all, nominatim, describePlace } from './store.js';
import { KINDS, STATUS } from './kinds.js';
import { MAP_STYLE } from './config.js';
import { openItem, openItemForm, itemEmoji } from './item.js';

let lib = null;       // MapLibre, chargé seulement quand on ouvre la carte
let map = null;
let markers = new Map();
const filter = { kinds: Object.keys(KINDS), done: 'all' };

export function renderMap(body) {
  if (map) { map.remove(); map = null; markers = new Map(); }
  const canvas = el('div', { class: 'map-canvas', 'aria-label': 'Carte des lieux' });
  const hint = el('p', { class: 'map-hint', text: 'Appui long sur la carte pour ajouter un lieu' });
  put(body, 
    el('div', { class: 'map-controls' }, [
      chips(Object.entries(KINDS).map(([k, v]) => [k, v.short, v.emoji]), filter.kinds, (v) => { filter.kinds = v; refresh(); }, { multi: true, className: 'chips-scroll chips-glass' }),
      segmented([['all', 'Tout'], ['todo', 'À faire'], ['done', 'Déjà fait']], filter.done, (v) => { filter.done = v; refresh(); }, 'segmented-glass'),
    ]),
    canvas,
    hint,
  );

  let first = true;
  const refresh = () => {
    if (!map) return;
    const visible = all('items').filter((i) => i.lat != null && filter.kinds.includes(i.kind)
      && (filter.done === 'all' || (filter.done === 'done') === (i.status === 'realisee')));
    const ids = new Set(visible.map((i) => i.id));
    for (const [id, mk] of markers) if (!ids.has(id)) { mk.remove(); markers.delete(id); }
    for (const it of visible) {
      markers.get(it.id)?.remove();
      markers.set(it.id, new lib.Marker({ element: pin(it), anchor: 'bottom' }).setLngLat([it.lng, it.lat]).addTo(map));
    }
    if (first && visible.length) {
      first = false;
      const b = new lib.LngLatBounds();
      visible.forEach((i) => b.extend([i.lng, i.lat]));
      map.fitBounds(b, { padding: 70, maxZoom: 5, duration: 0 });
    }
  };

  (async () => {
    lib = lib || await import('../vendor/maplibre-gl.mjs');
    map = new lib.Map({
      container: canvas, style: MAP_STYLE, center: [8, 35], zoom: 1, minZoom: 0.4,
      attributionControl: { compact: true }, dragRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    map.on('style.load', () => { try { map.setProjection({ type: 'globe' }); } catch {} });
    map.on('contextmenu', (e) => addHere(e.lngLat));
    map.once('load', refresh);
  })().catch(() => toast('La carte ne peut pas se charger pour le moment.', 'error'));

  return { refresh };
}

function pin(item) {
  const done = item.status === 'realisee';
  const b = el('button', {
    class: `map-pin ${done ? 'is-done' : 'is-todo'}`, type: 'button', style: `--k:${KINDS[item.kind].color}`,
    'aria-label': `${item.title}, ${STATUS[item.kind][item.status]}`,
  }, [el('span', { text: itemEmoji(item) })]);
  b.addEventListener('click', (e) => { e.stopPropagation(); openItem(item.id); });
  return b;
}

// Appui long : on choisit le type, le lieu est prérempli
async function addHere(lngLat) {
  const base = { lat: Math.round(lngLat.lat * 1e6) / 1e6, lng: Math.round(lngLat.lng * 1e6) / 1e6, place_name: 'Point choisi' };
  const sheet = openSheet({ title: 'Ajouter ici', body: el('p', { class: 'muted', text: 'Recherche du nom du lieu…' }) });
  let place = base;
  try { place = { ...describePlace(await nominatim('reverse', { lat: base.lat, lon: base.lng, zoom: 14 })), lat: base.lat, lng: base.lng }; } catch {}
  sheet.set([
    el('p', { class: 'detail-meta', text: [place.place_name, place.country].filter(Boolean).join(', ') }),
    el('div', { class: 'quick-grid quick-grid-2' }, Object.entries(KINDS).map(([k, v]) =>
      el('button', { class: 'quick-tile', type: 'button', style: `--k:${v.color}`, onclick: () => {
        openItemForm(k, null, { status: 'idee', ...place, title: k === 'voyage' || k === 'lieu' ? place.place_name : '' });
        sheet.close();
      } }, [el('span', { class: 'quick-emoji', text: v.emoji }), v.label]))),
  ]);
}
