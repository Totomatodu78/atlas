// ============================================================================
//  Gestion de couple : agenda, courses, tâches, budget
// ============================================================================
import { put, el, icon, chips, segmented, spaceHeader, addButton, empty, toast, errorText, iso, todayISO, parseDay, addDays, addMonths, fmtWeekday, fmtMonth, fmtRange, fmtRelative, money, cap } from './lib.js';
import { all, get, save, patch, remove, removeMany, memberOf, me, partner, state } from './store.js';
import { KINDS, EVENT_KINDS, eventKindOf, TASK_KINDS, TASK_STATUS, RECURRENCE, EXPENSE_CATS, expenseCatOf, SPLITS, AISLES } from './kinds.js';
import { formSheet } from './forms.js';
import { openItem, itemEmoji } from './item.js';

const SECTIONS = [['agenda', 'Agenda'], ['courses', 'Courses'], ['taches', 'Tâches'], ['budget', 'Budget']];

export function render(root, section, nav) {
  const current = SECTIONS.some(([s]) => s === section) ? section : 'agenda';
  const body = el('div', { class: 'section-body' });
  const action = {
    agenda: addButton('Événement', () => openEventForm(null, { starts_on: A.selected })),
    taches: addButton('Tâche', () => openTaskForm(null, { kind: T.kind })),
    budget: addButton('Dépense', () => openExpenseForm()),
  }[current];
  put(root, ...spaceHeader({
    title: 'Gestion de couple', subtitle: 'Notre quotidien et notre organisation',
    tabs: SECTIONS, current, onTab: (s) => nav(`couple/${s}`), action,
  }), body);
  const draw = { agenda: drawAgenda, courses: drawCourses, taches: drawTasks, budget: drawBudget }[current];
  const refresh = () => draw(body);
  refresh();
  return { refresh };
}

const personChips = (value, onChange, { none } = {}) => chips([
  ['all', 'Tous'],
  ...state.members.map((m) => [m.user_id, m.display_name, m.color]),
  ...(none ? [['none', 'À répartir']] : []),
], value, onChange, { className: 'chips-scroll' });

// ===========================================================================
// Agenda
// ===========================================================================
const A = { cursor: todayISO().slice(0, 8) + '01', selected: todayISO(), mode: 'mois', who: 'all' };
const daysBetween = (a, b) => Math.round((parseDay(b) - parseDay(a)) / 86400000);

// Toutes les occurrences entre deux dates : événements (anniversaires répétés) + expériences prévues
export function occurrences(from, to, who = 'all') {
  const out = [];
  for (const e of all('events')) {
    if (who !== 'all' && e.who && e.who !== who) continue;
    const len = e.ends_on ? daysBetween(e.starts_on, e.ends_on) : 0;
    const starts = [];
    if (e.yearly) {
      for (let y = +from.slice(0, 4) - 1; y <= +to.slice(0, 4); y++) {
        const s = `${y}${e.starts_on.slice(4)}`;
        if (s >= e.starts_on && iso(parseDay(s)) === s) starts.push(s);
      }
    } else starts.push(e.starts_on);
    const [, label, color] = eventKindOf(e.kind);
    for (const s of starts) {
      const end = addDays(s, len);
      if (end < from || s > to) continue;
      const years = e.yearly ? +s.slice(0, 4) - +e.starts_on.slice(0, 4) : 0;
      out.push({ type: 'event', id: e.id, title: e.title + (years > 0 ? ` (${years} an${years > 1 ? 's' : ''})` : ''), start: s, end, time: e.start_time?.slice(0, 5), color, label, who: e.who });
    }
  }
  for (const i of all('items')) {
    if (i.status !== 'prevue' || !i.planned_on) continue;
    const end = i.planned_end || i.planned_on;
    if (end < from || i.planned_on > to) continue;
    out.push({ type: 'item', id: i.id, title: `${itemEmoji(i)} ${i.title}`, start: i.planned_on, end, color: KINDS[i.kind].color, label: `${KINDS[i.kind].label} prévu${i.kind === 'activite' ? 'e' : ''}`, who: null });
  }
  return out.sort((a, b) => a.start.localeCompare(b.start) || (a.time || '99').localeCompare(b.time || '99'));
}

function occRow(o) {
  const who = o.who ? memberOf(o.who) : null;
  return el('button', { class: 'occ', type: 'button', style: `--c:${o.color}`, onclick: () => (o.type === 'item' ? openItem(o.id) : openEventForm(o.id)) }, [
    el('span', { class: 'occ-bar' }),
    el('span', { class: 'occ-body' }, [
      el('span', { class: 'occ-title', text: o.title }),
      el('span', { class: 'occ-meta', text: [o.time, o.start !== o.end ? fmtRange(o.start, o.end) : null, o.label, who ? who.display_name : null].filter(Boolean).join(' · ') }),
    ]),
  ]);
}

function drawAgenda(body) {
  const header = el('div', { class: 'toolbar' }, [
    el('div', { class: 'agenda-bar' }, [
      segmented([['mois', 'Mois'], ['semaine', 'Semaine']], A.mode, (v) => { A.mode = v; drawAgenda(body); }, 'segmented-small'),
      el('button', { class: 'btn btn-quiet btn-small', type: 'button', text: "Aujourd'hui", onclick: () => { A.selected = todayISO(); A.cursor = A.selected.slice(0, 8) + '01'; drawAgenda(body); } }),
    ]),
    state.members.length > 1 ? personChips(A.who, (v) => { A.who = v || 'all'; drawAgenda(body); }) : null,
  ]);
  put(body, header, A.mode === 'mois' ? monthView(body) : weekView(body));
}

function monthView(body) {
  const first = A.cursor;
  const gridStart = addDays(first, -((parseDay(first).getDay() + 6) % 7));
  const lastOfMonth = addDays(addMonths(first, 1), -1);
  const weeks = Math.ceil((daysBetween(gridStart, lastOfMonth) + 1) / 7);
  const gridEnd = addDays(gridStart, weeks * 7 - 1);
  const occ = occurrences(gridStart, gridEnd, A.who);
  const today = todayISO();

  const grid = el('div', { class: 'month-grid', role: 'grid' });
  for (const d of ['L', 'M', 'M', 'J', 'V', 'S', 'D']) grid.append(el('span', { class: 'wd', text: d, 'aria-hidden': 'true' }));
  for (let i = 0; i < weeks * 7; i++) {
    const day = addDays(gridStart, i);
    const on = occ.filter((o) => o.start <= day && o.end >= day);
    const band = on.find((o) => o.start !== o.end);
    const cell = el('button', {
      class: ['day', day.slice(0, 7) !== first.slice(0, 7) ? 'out' : '', day === today ? 'today' : '', day === A.selected ? 'sel' : '', band ? 'band' : ''].join(' '),
      type: 'button', style: band ? `--band:${band.color}` : null, 'aria-label': `${fmtWeekday(day)}, ${on.length} élément(s)`,
      onclick: () => { A.selected = day; drawAgenda(body); },
    }, [
      el('span', { class: 'day-n', text: String(parseDay(day).getDate()) }),
      el('span', { class: 'day-dots' }, on.filter((o) => o.start === o.end || o.start === day).slice(0, 3).map((o) => el('i', { style: `--c:${o.color}` }))),
    ]);
    grid.append(cell);
  }
  const dayOcc = occ.filter((o) => o.start <= A.selected && o.end >= A.selected);
  return el('div', {}, [
    el('div', { class: 'month-nav' }, [
      el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Mois précédent', onclick: () => { A.cursor = addMonths(first, -1); drawAgenda(body); } }, [icon('back')]),
      el('h2', { text: fmtMonth(first) }),
      el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Mois suivant', onclick: () => { A.cursor = addMonths(first, 1); drawAgenda(body); } }, [icon('next')]),
    ]),
    grid,
    el('section', { class: 'day-panel' }, [
      el('h3', { text: fmtWeekday(A.selected) }),
      ...(dayOcc.length ? dayOcc.map(occRow) : [el('p', { class: 'muted', text: 'Rien de prévu ce jour-là.' })]),
      el('button', { class: 'btn btn-soft btn-block', type: 'button', text: 'Ajouter ce jour-là', onclick: () => openEventForm(null, { starts_on: A.selected }) }),
    ]),
  ]);
}

function weekView(body) {
  const monday = addDays(A.selected, -((parseDay(A.selected).getDay() + 6) % 7));
  const sunday = addDays(monday, 6);
  const occ = occurrences(monday, sunday, A.who);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(monday, i);
    const on = occ.filter((o) => o.start <= d && o.end >= d);
    days.push(el('section', { class: `week-day ${d === todayISO() ? 'today' : ''}` }, [
      el('h3', {}, [fmtWeekday(d), el('button', { class: 'icon-btn icon-btn-sm', type: 'button', 'aria-label': 'Ajouter ce jour-là', onclick: () => openEventForm(null, { starts_on: d }) }, [icon('plus')])]),
      ...(on.length ? on.map(occRow) : [el('p', { class: 'muted small', text: 'Libre' })]),
    ]));
  }
  return el('div', {}, [
    el('div', { class: 'month-nav' }, [
      el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Semaine précédente', onclick: () => { A.selected = addDays(A.selected, -7); drawAgenda(body); } }, [icon('back')]),
      el('h2', { text: `${cap(fmtRelative(monday))} → ${fmtRelative(sunday)}` }),
      el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Semaine suivante', onclick: () => { A.selected = addDays(A.selected, 7); drawAgenda(body); } }, [icon('next')]),
    ]),
    ...days,
  ]);
}

export function openEventForm(id = null, preset = {}) {
  const current = id ? get('events', id) : null;
  formSheet({
    title: current ? "Modifier l'événement" : 'Nouvel événement',
    fields: [
      { key: 'title', type: 'text', label: 'Quoi ?', required: true, max: 120, placeholder: 'Dîner chez mes parents' },
      { key: 'kind', type: 'chips', label: 'Type', required: true, options: EVENT_KINDS },
      { key: 'starts_on', type: 'date', label: 'Le (ou à partir du)', required: true },
      { key: 'ends_on', type: 'date', label: "Jusqu'au (pour une période)" },
      { key: 'start_time', type: 'time', label: 'Heure' },
      { key: 'who', type: 'person', label: 'Qui ?', allowBoth: true },
      { key: 'yearly', type: 'toggle', toggleLabel: 'Revient tous les ans' },
      { key: 'notes', type: 'textarea', label: 'Notes', max: 1000 },
    ],
    initial: current ? { ...current } : { kind: 'evenement', starts_on: todayISO(), yearly: false, ...preset },
    table: 'events',
    id,
    submitLabel: current ? 'Enregistrer' : 'Ajouter à l’agenda',
    onDelete: current ? async (sheet) => {
      if (!confirm(`Supprimer « ${current.title} » ?`)) return;
      try { await remove('events', id); sheet.close(); } catch (e) { toast(errorText(e), 'error'); }
    } : null,
  });
}

// ===========================================================================
// Courses
// ===========================================================================
let aisleChoice = null;

function drawCourses(body) {
  const items = all('shopping');
  const open = items.filter((i) => !i.done).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const done = items.filter((i) => i.done);

  const input = el('input', { type: 'text', class: 'quick-input', placeholder: 'Lait, pain, tomates…', enterkeyhint: 'done', maxlength: 400, 'aria-label': 'Ajouter des articles', autocomplete: 'off' });
  const add = async () => {
    const labels = input.value.split(/[,\n]/).map((s) => s.trim()).filter(Boolean).map((s) => s.slice(0, 80));
    if (!labels.length) return;
    input.value = '';
    try {
      for (const label of labels) await save('shopping', { label, aisle: aisleChoice });
      body.querySelector('.quick-input')?.focus();
    } catch (e) { toast(errorText(e), 'error'); }
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });

  const row = (i) => el('li', { class: `check-row ${i.done ? 'is-done' : ''}` }, [
    el('button', { class: 'check', type: 'button', 'aria-pressed': String(i.done), 'aria-label': i.done ? 'Remettre dans la liste' : 'Acheté',
      onclick: () => patch('shopping', i.id, { done: !i.done }).catch((e) => toast(errorText(e), 'error')) }, [icon('check')]),
    el('span', { class: 'check-body' }, [el('span', { class: 'check-title', text: i.label })]),
    el('button', { class: 'icon-btn icon-btn-sm icon-btn-ghost', type: 'button', 'aria-label': `Supprimer ${i.label}`,
      onclick: () => remove('shopping', i.id).catch((e) => toast(errorText(e), 'error')) }, [icon('close')]),
  ]);

  const groups = [];
  const aisles = [...new Set(open.map((i) => i.aisle || ''))].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : AISLES.indexOf(a) - AISLES.indexOf(b)));
  for (const a of aisles) {
    const part = open.filter((i) => (i.aisle || '') === a);
    if (aisles.length > 1) groups.push(el('h2', { class: 'list-heading', text: a || 'Sans rayon' }));
    groups.push(el('ul', { class: 'check-list' }, part.map(row)));
  }

  put(body, 
    el('div', { class: 'quick-add' }, [
      el('div', { class: 'quick-add-row' }, [input, el('button', { class: 'btn btn-accent', type: 'button', 'aria-label': 'Ajouter', onclick: add }, [icon('plus')])]),
      chips(AISLES.map((a) => [a, a]), aisleChoice, (v) => { aisleChoice = v; }, { allowNone: true, className: 'chips-scroll chips-small' }),
      el('p', { class: 'field-hint', text: 'Astuce : séparez par des virgules pour en ajouter plusieurs. Rayon facultatif.' }),
    ]),
    open.length ? el('div', {}, groups) : el('p', { class: 'muted pad', text: done.length ? 'Tout est dans le panier.' : 'La liste est vide.' }),
    done.length ? el('section', { class: 'block' }, [
      el('div', { class: 'block-head' }, [
        el('h3', { text: `Dans le panier (${done.length})` }),
        el('button', { class: 'btn btn-quiet btn-small', type: 'button', text: 'Vider', onclick: () => removeMany('shopping', done.map((i) => i.id)).catch((e) => toast(errorText(e), 'error')) }),
      ]),
      el('ul', { class: 'check-list' }, done.map(row)),
    ]) : null,
  );
}

// ===========================================================================
// Tâches & projets
// ===========================================================================
const T = { kind: 'menage', who: 'all' };
const nextDate = (d, rec) => (rec === 'quotidienne' ? addDays(d, 1) : rec === 'hebdo' ? addDays(d, 7) : addMonths(d, 1));

async function completeTask(t) {
  const today = todayISO();
  try {
    if (t.status === 'fait') return await patch('tasks', t.id, { status: 'a_faire', done_on: null });
    if (t.recurrence !== 'aucune') {
      let next = nextDate(t.due_on || today, t.recurrence);
      while (next <= today) next = nextDate(next, t.recurrence);
      await patch('tasks', t.id, { done_on: today, due_on: next, status: 'a_faire' });
      toast(`Fait ! Prochaine fois : ${fmtRelative(next).toLowerCase()}`);
    } else {
      await patch('tasks', t.id, { status: 'fait', done_on: today });
    }
  } catch (e) { toast(errorText(e), 'error'); }
}

function drawTasks(body) {
  const today = todayISO();
  const tasks = all('tasks').filter((t) => t.kind === T.kind
    && (T.who === 'all' || (T.who === 'none' ? !t.assignee : t.assignee === T.who)));
  const open = tasks.filter((t) => t.status !== 'fait').sort((a, b) => (a.due_on || '9999').localeCompare(b.due_on || '9999'));
  const done = tasks.filter((t) => t.status === 'fait').sort((a, b) => (b.done_on || '').localeCompare(a.done_on || ''));

  const row = (t) => {
    const who = t.assignee ? memberOf(t.assignee) : null;
    const late = t.status !== 'fait' && t.due_on && t.due_on < today;
    return el('li', { class: `check-row ${t.status === 'fait' ? 'is-done' : ''} ${late ? 'is-late' : ''}` }, [
      el('button', { class: 'check', type: 'button', 'aria-pressed': String(t.status === 'fait'), 'aria-label': 'Marquer comme fait', onclick: () => completeTask(t) }, [icon('check')]),
      el('button', { class: 'check-body', type: 'button', onclick: () => openTaskForm(t.id) }, [
        el('span', { class: 'check-title', text: t.title }),
        el('span', { class: 'check-meta' }, [
          el('span', { class: 'dot', style: `--c:${who ? who.color : '#8A97A8'}` }),
          who ? who.display_name : 'À répartir',
          t.recurrence !== 'aucune' ? ` · ${RECURRENCE.find((r) => r[0] === t.recurrence)[1].toLowerCase()}` : '',
          t.due_on && t.status !== 'fait' ? ` · ${late ? 'en retard, ' : ''}${fmtRelative(t.due_on).toLowerCase()}` : '',
          t.status === 'en_cours' ? el('span', { class: 'pill pill-prevue', text: 'En cours' }) : null,
        ]),
      ]),
    ]);
  };

  put(body, 
    el('div', { class: 'toolbar' }, [
      segmented(TASK_KINDS, T.kind, (v) => { T.kind = v; drawTasks(body); }, 'segmented-status'),
      personChips(T.who, (v) => { T.who = v || 'all'; drawTasks(body); }, { none: true }),
    ]),
    open.length ? el('ul', { class: 'check-list' }, open.map(row))
      : empty(T.kind === 'menage' ? 'Aucune tâche en attente. Ajoutez les tâches récurrentes une fois : elles reviennent toutes seules.' : 'Aucun projet en cours.', 'Ajouter', () => openTaskForm(null, { kind: T.kind })),
    done.length ? el('details', { class: 'block collapsible' }, [
      el('summary', { text: `Terminé (${done.length})` }),
      el('ul', { class: 'check-list' }, done.slice(0, 30).map(row)),
    ]) : null,
  );
}

export function openTaskForm(id = null, preset = {}) {
  const current = id ? get('tasks', id) : null;
  formSheet({
    title: current ? 'Modifier la tâche' : 'Nouvelle tâche',
    fields: [
      { key: 'title', type: 'text', label: 'Quoi ?', required: true, max: 120, placeholder: 'Sortir les poubelles' },
      { key: 'kind', type: 'segmented', label: 'Type', options: [['menage', 'Ménage'], ['projet', 'Projet']] },
      { key: 'assignee', type: 'person', label: 'Qui fait ?', allowBoth: true },
      { key: 'recurrence', type: 'chips', label: 'Fréquence', required: true, options: RECURRENCE },
      { key: 'due_on', type: 'date', label: 'Pour le' },
      { key: 'status', type: 'segmented', label: 'Statut', options: TASK_STATUS },
      { key: 'notes', type: 'textarea', label: 'Notes', max: 1000 },
    ],
    initial: current ? { ...current } : { kind: 'menage', recurrence: 'aucune', status: 'a_faire', assignee: null, ...preset },
    table: 'tasks',
    id,
    extra: (v) => ({ done_on: v.status === 'fait' ? v.done_on || todayISO() : v.done_on || null }),
    submitLabel: current ? 'Enregistrer' : 'Ajouter',
    onDelete: current ? async (sheet) => {
      if (!confirm(`Supprimer « ${current.title} » ?`)) return;
      try { await remove('tasks', id); sheet.close(); } catch (e) { toast(errorText(e), 'error'); }
    } : null,
  });
}

// ===========================================================================
// Budget
// ===========================================================================
// Solde : combien le 2e membre doit au 1er (négatif = l'inverse)
export function balance() {
  const [a, b] = state.members;
  if (!a || !b) return { net: 0 };
  let net = 0;
  for (const x of all('expenses')) {
    const amt = Number(x.amount);
    const byA = x.paid_by === a.user_id, byB = x.paid_by === b.user_id;
    if (x.split === 'moitie') net += byA ? amt / 2 : byB ? -amt / 2 : 0;
    if (x.split === 'remboursement') net += byA ? amt : byB ? -amt : 0;
  }
  net = Math.round(net * 100) / 100;
  return net > 0 ? { net, debtor: b, creditor: a } : net < 0 ? { net: -net, debtor: a, creditor: b } : { net: 0 };
}

function drawBudget(body) {
  const month = todayISO().slice(0, 7);
  const exp = all('expenses').sort((x, y) => y.spent_on.localeCompare(x.spent_on) || y.created_at.localeCompare(x.created_at));
  const spending = (x) => x.split !== 'remboursement';
  const thisMonth = exp.filter((x) => x.spent_on.startsWith(month) && spending(x));
  const total = thisMonth.reduce((n, x) => n + Number(x.amount), 0);
  const bal = balance();

  const byCat = EXPENSE_CATS.map(([v, l, e]) => [e, l, thisMonth.filter((x) => x.category === v).reduce((n, x) => n + Number(x.amount), 0)]).filter((c) => c[2] > 0);
  const max = Math.max(1, ...byCat.map((c) => c[2]));

  const summary = el('section', { class: 'summary-card' }, [
    el('span', { class: 'summary-label', text: `Dépenses de ${fmtMonth(month + '-01').toLowerCase()}` }),
    el('strong', { class: 'summary-value', text: money(total) }),
    state.members.length > 1 ? el('div', { class: 'balance' }, [
      el('span', { text: bal.net ? `${bal.debtor.display_name} doit ${money(bal.net)} à ${bal.creditor.display_name}` : 'Vous êtes à l’équilibre' }),
      bal.net ? el('button', { class: 'btn btn-small btn-on-dark', type: 'button', text: 'Équilibrer', onclick: () => settle(bal) }) : null,
    ]) : null,
  ]);

  const list = [];
  let current = null;
  for (const x of exp.slice(0, 200)) {
    const m = x.spent_on.slice(0, 7);
    if (m !== current) {
      current = m;
      const sum = exp.filter((y) => y.spent_on.startsWith(m) && spending(y)).reduce((n, y) => n + Number(y.amount), 0);
      list.push(el('h2', { class: 'list-heading' }, [fmtMonth(m + '-01'), el('span', { class: 'count', text: money(sum) })]));
    }
    const cat = expenseCatOf(x.category);
    const payer = x.paid_by ? memberOf(x.paid_by) : null;
    const note = x.split === 'perso' ? 'perso' : x.split === 'remboursement' ? 'remboursement' : null;
    list.push(el('button', { class: `money-row ${x.split === 'remboursement' ? 'is-transfer' : ''}`, type: 'button', onclick: () => openExpenseForm(x.id) }, [
      el('span', { class: 'money-emoji', text: cat[2] }),
      el('span', { class: 'money-body' }, [
        el('span', { class: 'money-title', text: x.label }),
        el('span', { class: 'money-meta' }, [
          payer ? el('span', { class: 'dot', style: `--c:${payer.color}` }) : null,
          [fmtRelative(x.spent_on), payer ? `payé par ${payer.display_name}` : null, note].filter(Boolean).join(' · '),
        ]),
      ]),
      el('span', { class: 'money-amount', text: money(x.amount) }),
    ]));
  }

  put(body, 
    summary,
    byCat.length ? el('section', { class: 'block' }, [
      el('h3', { text: 'Ce mois-ci par catégorie' }),
      el('div', { class: 'bars' }, byCat.map(([e, l, n]) => el('div', { class: 'bar-row' }, [
        el('span', { class: 'bar-label', text: `${e} ${l}` }),
        el('span', { class: 'bar' }, [el('span', { style: `width:${(n / max) * 100}%` })]),
        el('span', { class: 'bar-value', text: money(n) }),
      ]))),
    ]) : null,
    exp.length ? el('div', { class: 'money-list' }, list) : empty('Notez vos dépenses communes : l’app calcule qui doit combien à qui.', 'Ajouter une dépense', () => openExpenseForm()),
  );
}

async function settle(bal) {
  if (!confirm(`Enregistrer un remboursement de ${money(bal.net)} de ${bal.debtor.display_name} à ${bal.creditor.display_name} ?`)) return;
  try {
    await save('expenses', { label: 'Remboursement', amount: bal.net, category: 'autre', split: 'remboursement', paid_by: bal.debtor.user_id, spent_on: todayISO() });
    toast('Comptes équilibrés');
  } catch (e) { toast(errorText(e), 'error'); }
}

export function openExpenseForm(id = null, preset = {}) {
  const current = id ? get('expenses', id) : null;
  formSheet({
    title: current ? 'Modifier la dépense' : 'Nouvelle dépense',
    fields: [
      { key: 'label', type: 'text', label: 'Quoi ?', required: true, max: 80, placeholder: 'Courses Auchan' },
      { key: 'amount', type: 'money', label: 'Montant', required: true },
      { key: 'category', type: 'chips', label: 'Catégorie', required: true, options: EXPENSE_CATS },
      { key: 'paid_by', type: 'person', label: 'Payé par' },
      { key: 'split', type: 'segmented', label: 'Répartition', options: SPLITS },
      { key: 'spent_on', type: 'date', label: 'Date', required: true },
    ],
    initial: current ? { ...current } : { category: 'courses', split: 'moitie', paid_by: state.user.id, spent_on: todayISO(), ...preset },
    table: 'expenses',
    id,
    submitLabel: current ? 'Enregistrer' : 'Ajouter',
    onDelete: current ? async (sheet) => {
      if (!confirm(`Supprimer « ${current.label} » ?`)) return;
      try { await remove('expenses', id); sheet.close(); } catch (e) { toast(errorText(e), 'error'); }
    } : null,
  });
}
