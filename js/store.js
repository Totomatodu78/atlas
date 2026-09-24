// ============================================================================
//  Données : Supabase, temps réel, photos, géocodage
// ============================================================================
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const TABLES = ['items', 'memories', 'events', 'shopping', 'tasks', 'expenses', 'wishes'];
export const PERSON_COLORS = ['#E07A2E', '#1C9A8B'];
const BUCKET = 'photos';

export const configured = !/VOTRE/.test(SUPABASE_URL + SUPABASE_KEY);
export let sb = null;

export const state = {
  user: null,
  space: null,       // { id, name, invite_code }
  members: [],       // [{ user_id, display_name, color }]
  data: Object.fromEntries(TABLES.map((t) => [t, new Map()])),
  urls: new Map(),
  channel: null,
};

export function initClient() {
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return sb;
}

// ---------------------------------------------------------------------------
// Abonnements internes : les vues se redessinent quand les données changent
// ---------------------------------------------------------------------------
const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
function emit(table) { for (const fn of listeners) fn(table); }

export const all = (t) => [...state.data[t].values()];
export const get = (t, id) => (id ? state.data[t].get(id) : null);

// ---------------------------------------------------------------------------
// Membres
// ---------------------------------------------------------------------------
export async function loadMembers() {
  const { data, error } = await sb.from('map_members')
    .select('user_id, display_name, joined_at').eq('map_id', state.space.id).order('joined_at');
  if (error) throw error;
  state.members = data.map((m, i) => ({ ...m, color: PERSON_COLORS[i] || '#8A97A8' }));
  emit('members');
}
export const me = () => state.members.find((m) => m.user_id === state.user.id);
export const partner = () => state.members.find((m) => m.user_id !== state.user.id);
export function memberOf(id) {
  return state.members.find((m) => m.user_id === id) || { user_id: id, display_name: 'Quelqu’un', color: '#8A97A8' };
}

// ---------------------------------------------------------------------------
// Chargement et temps réel
// ---------------------------------------------------------------------------
export async function loadAll() {
  const results = await Promise.all(TABLES.map((t) => sb.from(t).select('*').eq('map_id', state.space.id)));
  results.forEach(({ data, error }, i) => {
    if (error) throw error;
    state.data[TABLES[i]] = new Map(data.map((r) => [r.id, r]));
  });
  emit('*');
}

export function subscribe() {
  if (state.channel) sb.removeChannel(state.channel);
  const filter = `map_id=eq.${state.space.id}`;
  let ch = sb.channel('space-' + state.space.id);
  for (const table of TABLES) {
    ch = ch
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter }, (p) => onRemote(table, p))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table, filter }, (p) => onRemote(table, p))
      // les suppressions ne sont pas filtrables : on ignore les identifiants inconnus
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, (p) => onRemote(table, p));
  }
  state.channel = ch.subscribe();
}

const remoteListeners = new Set();
export const onRemoteInsert = (fn) => remoteListeners.add(fn);

async function onRemote(table, payload) {
  if (payload.eventType === 'DELETE') {
    const id = payload.old?.id;
    if (id && state.data[table].has(id)) { state.data[table].delete(id); emit(table); }
    return;
  }
  const row = payload.new;
  if (!row || row.map_id !== state.space.id) return;
  const isNew = !state.data[table].has(row.id);
  if (!state.members.some((m) => m.user_id === row.created_by)) await loadMembers().catch(() => {});
  state.data[table].set(row.id, row);
  emit(table);
  if (isNew && row.created_by !== state.user.id) for (const fn of remoteListeners) fn(table, row);
}

// Rattrapage quand l'app revient au premier plan
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.space && sb) loadAll().catch(() => {});
});

// ---------------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------------
export async function save(table, row, id = null) {
  const query = id
    ? sb.from(table).update(row).eq('id', id)
    : sb.from(table).insert({ map_id: state.space.id, ...row });
  const { data, error } = await query.select().single();
  if (error) throw error;
  state.data[table].set(data.id, data);
  emit(table);
  return data;
}

// Modification instantanée à l'écran, confirmée ensuite par le serveur
export async function patch(table, id, changes) {
  const before = state.data[table].get(id);
  if (!before) return;
  state.data[table].set(id, { ...before, ...changes });
  emit(table);
  const { data, error } = await sb.from(table).update(changes).eq('id', id).select().single();
  if (error) {
    state.data[table].set(id, before);
    emit(table);
    throw error;
  }
  state.data[table].set(id, data);
  emit(table);
  return data;
}

export async function remove(table, id) {
  const { error } = await sb.from(table).delete().eq('id', id);
  if (error) throw error;
  state.data[table].delete(id);
  emit(table);
}

export async function removeMany(table, ids) {
  if (!ids.length) return;
  const { error } = await sb.from(table).delete().in('id', ids);
  if (error) throw error;
  for (const id of ids) state.data[table].delete(id);
  emit(table);
}

// ---------------------------------------------------------------------------
// Photos : stockage privé, liens temporaires, compression
// ---------------------------------------------------------------------------
export const photoPath = (ownerId, photoId, thumb = false) =>
  `${state.space.id}/${ownerId}/${photoId}${thumb ? '_t' : ''}.jpg`;

export async function signedUrls(paths) {
  const now = Date.now();
  const missing = [...new Set(paths.filter(Boolean))].filter((p) => {
    const c = state.urls.get(p);
    return !c || c.exp < now + 5 * 60 * 1000;
  });
  for (let i = 0; i < missing.length; i += 100) {
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrls(missing.slice(i, i + 100), 3600);
    if (error || !data) continue;
    for (const d of data) if (d.signedUrl && d.path) state.urls.set(d.path, { url: d.signedUrl, exp: now + 3600 * 1000 });
  }
  return paths.map((p) => state.urls.get(p)?.url || null);
}
export const cachedUrl = (path) => state.urls.get(path)?.url || null;

// Remplit une balise <img> avec un lien signé (depuis le cache si possible)
export function fillImg(img, path) {
  const cached = cachedUrl(path);
  if (cached) { img.src = cached; return; }
  signedUrls([path]).then(([u]) => { if (u) img.src = u; });
}

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

// Réencodage JPEG : réduit le poids et supprime les métadonnées (dont le GPS)
function toJpeg(source, { max, square = false, quality = 0.82 }) {
  const w0 = source.naturalWidth || source.width;
  const h0 = source.naturalHeight || source.height;
  let sx = 0, sy = 0, sw = w0, sh = h0;
  if (square) { const s = Math.min(w0, h0); sx = (w0 - s) / 2; sy = (h0 - s) / 2; sw = sh = s; }
  const scale = Math.min(1, max / Math.max(sw, sh));
  const w = Math.round(sw * scale), h = Math.round(sh * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, w, h);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Conversion de la photo impossible'))), 'image/jpeg', quality));
}

async function upload(path, blob) {
  const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' });
  if (error) throw error;
}

// Envoie les nouvelles photos d'un brouillon ; renvoie leurs identifiants et les chemins envoyés
export async function uploadPhotos(ownerId, files, onProgress) {
  const ids = [], paths = [];
  try {
    for (let i = 0; i < files.length; i++) {
      onProgress?.(i + 1, files.length);
      const source = await decodeImage(files[i]).catch(() => {
        throw new Error(`La photo « ${files[i].name} » n'est pas dans un format lisible par ce navigateur.`);
      });
      const [full, thumb] = await Promise.all([
        toJpeg(source, { max: 1600, quality: 0.82 }),
        toJpeg(source, { max: 360, square: true, quality: 0.8 }),
      ]);
      source.close?.();
      const id = crypto.randomUUID();
      await upload(photoPath(ownerId, id), full); paths.push(photoPath(ownerId, id));
      await upload(photoPath(ownerId, id, true), thumb); paths.push(photoPath(ownerId, id, true));
      ids.push(id);
    }
  } catch (err) {
    if (paths.length) await sb.storage.from(BUCKET).remove(paths).catch(() => {});
    throw err;
  }
  return { ids, paths };
}

export async function deletePhotos(ownerId, ids) {
  if (!ids?.length) return;
  await sb.storage.from(BUCKET).remove(ids.flatMap((id) => [photoPath(ownerId, id), photoPath(ownerId, id, true)])).catch(() => {});
}
export const discardUploads = (paths) => (paths.length ? sb.storage.from(BUCKET).remove(paths).catch(() => {}) : null);

// ---------------------------------------------------------------------------
// Géocodage OpenStreetMap (Nominatim) : à la demande uniquement
// ---------------------------------------------------------------------------
export async function nominatim(kind, params) {
  const url = new URL(`https://nominatim.openstreetmap.org/${kind}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('accept-language', 'fr');
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('Recherche de lieux indisponible pour le moment');
  return r.json();
}

export function describePlace(res) {
  const a = res.address || {};
  const locality = a.city || a.town || a.village || a.municipality || a.hamlet || a.county || a.state || a.country;
  const hood = a.suburb || a.neighbourhood || a.quarter || a.city_district || '';
  const name = (res.name || locality || (res.display_name || '').split(',')[0] || 'Lieu').slice(0, 160);
  return {
    place_name: name,
    neighborhood: hood.slice(0, 60) || null,
    country: (a.country || '').slice(0, 80) || null,
    country_code: (a.country_code || '').toUpperCase().slice(0, 3) || null,
    lat: Math.round(+res.lat * 1e6) / 1e6,
    lng: Math.round(+res.lon * 1e6) / 1e6,
    detail: [locality && locality !== res.name ? locality : null, a.country].filter(Boolean).join(', '),
  };
}
