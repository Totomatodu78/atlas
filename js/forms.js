// ============================================================================
//  Formulaires générés à partir d'une description de champs
// ============================================================================
import { el, icon, chips, segmented, openSheet, toast, errorText, setBusy } from './lib.js';
import { state, all, nominatim, describePlace, photoPath, fillImg, uploadPhotos, deletePhotos, discardUploads, save } from './store.js';
import { MOODS, KINDS } from './kinds.js';

let uid = 0;
const LABELLED = new Set(['text', 'textarea', 'url', 'money', 'date', 'time', 'itemref']);

export function buildForm(fields, initial = {}, { onChange } = {}) {
  const v = { ...initial };
  const photos = {};
  const wrappers = [];
  const form = el('form', { class: 'form', novalidate: true });
  const changed = () => { refreshVisibility(); onChange?.(v); };

  for (const f of fields) {
    const id = `f${++uid}`;
    const control = render(f, v, changed, id, photos);
    const wrap = el('div', { class: `field field-${f.type}` }, [
      f.label ? el(LABELLED.has(f.type) ? 'label' : 'span', { class: 'field-label', for: LABELLED.has(f.type) ? id : undefined, text: f.label }) : null,
      control,
      f.hint ? el('p', { class: 'field-hint', text: f.hint }) : null,
    ]);
    wrappers.push([f, wrap]);
    form.append(wrap);
  }

  function refreshVisibility() {
    for (const [f, w] of wrappers) w.hidden = f.when ? !f.when(v) : false;
  }
  refreshVisibility();

  const visible = (f) => !f.when || f.when(v);

  return {
    el: form,
    values: v,
    photos,
    fieldByKey: Object.fromEntries(fields.map((f) => [f.key, f])),
    validate() {
      for (const f of fields) {
        if (!f.required || !visible(f)) continue;
        const val = v[f.key];
        if (val === undefined || val === null || String(val).trim() === '') return `Indique : ${f.label.toLowerCase()}.`;
      }
      for (const f of fields) {
        if (f.type === 'url' && v[f.key] && !/^https?:\/\//i.test(v[f.key])) return 'Le lien doit commencer par https://';
        if (f.type === 'money' && v[f.key] !== '' && v[f.key] != null && isNaN(Number(String(v[f.key]).replace(',', '.')))) return `Montant invalide : ${f.label.toLowerCase()}.`;
      }
      return null;
    },
    collect() {
      const row = {};
      for (const f of fields) {
        if (f.type === 'photos' || f.virtual) continue;
        if (f.type === 'place') {
          for (const k of ['place_name', 'neighborhood', 'country', 'country_code', 'lat', 'lng']) row[k] = v[k] ?? null;
          continue;
        }
        let val = v[f.key];
        if (typeof val === 'string') val = val.trim();
        if (val === '' || val === undefined) val = f.type === 'toggle' ? false : null;
        if (f.type === 'money' && val !== null) val = Math.round(Number(String(val).replace(',', '.')) * 100) / 100;
        row[f.key] = val;
      }
      return row;
    },
  };
}

// ---------------------------------------------------------------------------
// Rendu de chaque type de champ
// ---------------------------------------------------------------------------
function render(f, v, changed, id, photos) {
  const set = (val) => { v[f.key] = val; changed(); };

  switch (f.type) {
    case 'text':
    case 'url':
    case 'date':
    case 'time': {
      const input = el('input', {
        id, type: f.type === 'text' ? 'text' : f.type, value: v[f.key] ?? '', maxlength: f.max,
        placeholder: f.placeholder, autocomplete: 'off', inputmode: f.type === 'url' ? 'url' : undefined,
      });
      if (f.suggestions) {
        const listId = id + 'l';
        input.setAttribute('list', listId);
        const opts = typeof f.suggestions === 'function' ? f.suggestions() : f.suggestions;
        const dl = el('datalist', { id: listId }, opts.map((o) => el('option', { value: o })));
        input.addEventListener('input', () => set(input.value));
        return el('div', {}, [input, dl]);
      }
      input.addEventListener('input', () => set(input.value));
      return input;
    }
    case 'textarea': {
      const t = el('textarea', { id, rows: f.rows || 3, maxlength: f.max, placeholder: f.placeholder });
      t.value = v[f.key] ?? '';
      t.addEventListener('input', () => set(t.value));
      return t;
    }
    case 'money': {
      const input = el('input', { id, type: 'text', inputmode: 'decimal', value: v[f.key] ?? '', placeholder: f.placeholder || '0' });
      input.addEventListener('input', () => set(input.value));
      return el('div', { class: 'input-suffix' }, [input, el('span', { text: '€' })]);
    }
    case 'segmented':
      return segmented(f.options, v[f.key], set, 'segmented-form');
    case 'chips':
      return chips(f.options, v[f.key] ?? null, set, { allowNone: !f.required, className: 'chips-form' });
    case 'multichips':
      return chips(f.options, v[f.key] || [], set, { multi: true, className: 'chips-form' });
    case 'toggle': {
      const input = el('input', { type: 'checkbox', id, role: 'switch' });
      input.checked = !!v[f.key];
      input.addEventListener('change', () => set(input.checked));
      return el('label', { class: 'switch', for: id }, [input, el('span', { class: 'switch-track' }), el('span', { class: 'switch-label', text: f.toggleLabel })]);
    }
    case 'stars': {
      const box = el('div', { class: 'stars-input', role: 'radiogroup', 'aria-label': f.label });
      const draw = () => {
        box.replaceChildren();
        for (let i = 1; i <= 5; i++) {
          const b = el('button', { type: 'button', class: 'star-btn', 'aria-label': `${i} sur 5`, 'aria-pressed': String((v[f.key] || 0) >= i) }, [icon('star', (v[f.key] || 0) >= i ? 'ico star on' : 'ico star')]);
          b.addEventListener('click', () => { set(v[f.key] === i ? null : i); draw(); });
          box.append(b);
        }
      };
      draw();
      return box;
    }
    case 'mood':
      return chips(MOODS.map(([val, emoji, label]) => [val, label, emoji]), v[f.key] ?? null, set, { allowNone: true, className: 'chips-form' });
    case 'person': {
      const opts = state.members.map((m) => [m.user_id, m.display_name, m.color]);
      if (f.allowBoth) opts.unshift(['', 'Tous les deux', '#8A97A8']);
      return chips(opts, v[f.key] ?? '', (val) => set(val || null), { className: 'chips-form' });
    }
    case 'itemref': {
      const select = el('select', { id });
      select.append(el('option', { value: '', text: f.noneLabel || 'Aucun' }));
      const items = all('items').filter(f.filter || (() => true)).sort((a, b) => a.title.localeCompare(b.title, 'fr'));
      for (const it of items) {
        const o = el('option', { value: it.id, text: `${KINDS[it.kind].emoji} ${it.title}` });
        if (it.id === v[f.key]) o.selected = true;
        select.append(o);
      }
      select.addEventListener('change', () => set(select.value || null));
      return el('div', { class: 'select-wrap' }, [select]);
    }
    case 'place':
      return placeField(f, v, changed);
    case 'photos':
      return photoField(f, v, photos);
    default:
      return el('span', { text: '' });
  }
}

// ---------------------------------------------------------------------------
// Lieu : recherche OpenStreetMap ou position actuelle
// ---------------------------------------------------------------------------
function placeField(f, v, changed) {
  const card = el('div', { class: 'where-card' });
  const results = el('ul', { class: 'search-results', hidden: true });
  const input = el('input', { type: 'search', placeholder: f.placeholder || 'Ville, adresse, établissement…', enterkeyhint: 'search', 'aria-label': 'Rechercher un lieu', autocomplete: 'off' });
  const searchBtn = el('button', { class: 'btn btn-soft btn-small', type: 'button', text: 'Chercher' });
  const locate = el('button', { class: 'btn btn-quiet btn-small', type: 'button', text: 'Ma position' });
  const clear = el('button', { class: 'btn btn-quiet btn-small', type: 'button', text: 'Retirer le lieu' });

  const apply = (p) => {
    for (const k of ['place_name', 'neighborhood', 'country', 'country_code', 'lat', 'lng']) v[k] = p ? p[k] ?? null : null;
    if (p && f.fillTitle && !String(v.title || '').trim()) {
      v.title = p.place_name;
      const titleInput = card.closest('form')?.querySelector('.field-text input');
      if (titleInput && !titleInput.value) titleInput.value = p.place_name;
    }
    draw();
    changed();
  };
  const draw = () => {
    const has = v.lat != null;
    card.classList.toggle('is-empty', !has);
    card.replaceChildren(icon('pin', 'ico where-pin'), el('span', {}, [
      el('strong', { text: has ? v.place_name || 'Point choisi' : 'Aucun lieu' }),
      has ? el('small', { text: [v.neighborhood, v.country].filter(Boolean).join(', ') }) : null,
    ]));
    clear.hidden = !has;
  };

  const search = async () => {
    const q = input.value.trim();
    if (q.length < 2) return;
    results.hidden = false;
    results.replaceChildren(el('li', { class: 'muted', text: 'Recherche…' }));
    try {
      const list = await nominatim('search', { q, limit: 5 });
      results.replaceChildren();
      if (!list.length) { results.append(el('li', { class: 'muted', text: 'Aucun résultat. Essaie un autre nom.' })); return; }
      for (const r of list) {
        const p = describePlace(r);
        results.append(el('li', {}, [el('button', { type: 'button', onclick: () => { results.hidden = true; input.value = ''; apply(p); } }, [p.place_name, el('small', { text: p.detail })])]));
      }
    } catch (e) { results.hidden = true; toast(errorText(e), 'error'); }
  };
  searchBtn.addEventListener('click', search);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } });
  clear.addEventListener('click', () => apply(null));
  locate.addEventListener('click', () => {
    if (!navigator.geolocation) return toast("La localisation n'est pas disponible.", 'error');
    setBusy(locate, true, 'Localisation…');
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const r = await nominatim('reverse', { lat: pos.coords.latitude, lon: pos.coords.longitude, zoom: 16 });
        apply(describePlace({ ...r, lat: pos.coords.latitude, lon: pos.coords.longitude }));
      } catch {
        apply({ place_name: 'Ma position', lat: pos.coords.latitude, lng: pos.coords.longitude });
      }
      setBusy(locate, false);
    }, () => { setBusy(locate, false); toast('Position refusée ou introuvable.', 'error'); }, { timeout: 10000, maximumAge: 60000 });
  });

  draw();
  return el('div', { class: 'place-field' }, [
    card,
    el('div', { class: 'search-row' }, [input, searchBtn]),
    results,
    el('div', { class: 'row-links' }, [locate, clear]),
  ]);
}

// ---------------------------------------------------------------------------
// Photos : aperçu, ajout, retrait (envoi au moment d'enregistrer)
// ---------------------------------------------------------------------------
function photoField(f, v, photos) {
  const existing = f.max === 1 ? (v[f.key] ? [v[f.key]] : []) : [...(v[f.key] || [])];
  const draft = photos[f.key] = { keep: existing, removed: [], added: [] };
  const grid = el('div', { class: `photo-grid ${f.max === 1 ? 'photo-grid-single' : ''}` });
  const input = el('input', { type: 'file', accept: 'image/*', multiple: f.max !== 1 });
  const add = el('label', { class: 'photo-add' }, [input, icon('plus'), el('span', { text: f.max === 1 ? 'Ajouter une photo' : 'Ajouter' })]);

  input.addEventListener('change', () => {
    const files = [...input.files].filter((x) => x.type.startsWith('image/') || /\.(heic|heif)$/i.test(x.name));
    input.value = '';
    const room = f.max - draft.keep.length - draft.added.length;
    if (files.length > room) toast(`${f.max} photo${f.max > 1 ? 's' : ''} maximum.`, 'error');
    for (const file of files.slice(0, Math.max(0, room))) draft.added.push({ file, preview: URL.createObjectURL(file) });
    draw();
  });

  const tile = (setSrc, onRemove) => {
    const img = el('img', { alt: '' });
    setSrc(img);
    return el('div', { class: 'photo-tile' }, [img, el('button', { class: 'photo-remove', type: 'button', 'aria-label': 'Retirer la photo', onclick: onRemove }, [icon('close')])]);
  };
  const draw = () => {
    grid.replaceChildren();
    for (const pid of draft.keep) {
      grid.append(tile((img) => fillImg(img, photoPath(f.ownerId, pid, true)), () => {
        draft.keep = draft.keep.filter((x) => x !== pid); draft.removed.push(pid); draw();
      }));
    }
    for (const a of draft.added) {
      grid.append(tile((img) => { img.src = a.preview; }, () => {
        URL.revokeObjectURL(a.preview); draft.added = draft.added.filter((x) => x !== a); draw();
      }));
    }
    if (draft.keep.length + draft.added.length < f.max) grid.append(add);
  };
  draw();
  return el('div', {}, [grid, f.max > 1 ? el('p', { class: 'field-hint', text: "Réduites avant l'envoi, sans leurs données de localisation (EXIF)." }) : null]);
}

// ---------------------------------------------------------------------------
// Enregistrement d'une ligne avec ses photos
// ---------------------------------------------------------------------------
export async function saveWithPhotos(table, id, form, extra = {}, onProgress) {
  const ownerId = id || crypto.randomUUID();
  const row = { ...form.collect(), ...extra };
  const uploaded = [];
  const removed = [];
  try {
    for (const [key, draft] of Object.entries(form.photos)) {
      const { ids, paths } = await uploadPhotos(ownerId, draft.added.map((a) => a.file), onProgress);
      uploaded.push(...paths);
      const list = [...draft.keep, ...ids];
      row[key] = form.fieldByKey[key].max === 1 ? list[0] || null : list;
      removed.push(...draft.removed);
      draft.added.forEach((a) => URL.revokeObjectURL(a.preview));
    }
    if (!id) row.id = ownerId;
    const data = await save(table, row, id);
    await deletePhotos(ownerId, removed);
    return data;
  } catch (err) {
    await discardUploads(uploaded);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Feuille de formulaire prête à l'emploi
// ---------------------------------------------------------------------------
export function formSheet({ title, fields, initial, submitLabel = 'Enregistrer', table, id = null, extra = {}, onSaved, onDelete, deleteLabel = 'Supprimer' }) {
  const form = buildForm(fields, initial);
  const submit = el('button', { class: 'btn btn-accent btn-block', type: 'submit', text: submitLabel });
  const progress = el('p', { class: 'progress', hidden: true });
  const footer = el('div', { class: 'sheet-footer' }, [
    progress,
    submit,
    onDelete ? el('button', { class: 'btn btn-quiet btn-danger-text btn-block', type: 'button', text: deleteLabel, onclick: () => onDelete(sheet) }) : null,
  ]);
  form.el.append(footer);
  const sheet = openSheet({ title, body: form.el, className: 'sheet-form' });

  form.el.addEventListener('submit', async (e) => {
    e.preventDefault();
    const problem = form.validate();
    if (problem) return toast(problem, 'error');
    setBusy(submit, true, 'Enregistrement…');
    try {
      const data = await saveWithPhotos(table, id, form, typeof extra === 'function' ? extra(form.values) : extra, (i, n) => {
        progress.hidden = false;
        progress.textContent = `Envoi des photos : ${i} sur ${n}`;
      });
      onSaved?.(data, sheet);
      sheet.close();
    } catch (err) {
      toast(errorText(err), 'error');
    } finally {
      setBusy(submit, false);
      progress.hidden = true;
    }
  });
  return { sheet, form };
}
