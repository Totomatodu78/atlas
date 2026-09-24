// ============================================================================
//  Vocabulaire de l'app : types, statuts, catégories
//  (modifiable librement : ajouter une catégorie ne demande rien d'autre)
// ============================================================================

export const KINDS = {
  activite: { label: 'Date / activité', plural: 'Dates & activités', short: 'Dates', emoji: '✨', color: '#E0613F' },
  resto:    { label: 'Restaurant', plural: 'Restaurants', short: 'Restos', emoji: '🍽️', color: '#C9821C' },
  voyage:   { label: 'Voyage', plural: 'Voyages', short: 'Voyages', emoji: '✈️', color: '#2F7FD8' },
  lieu:     { label: 'Lieu', plural: 'Lieux', short: 'Lieux', emoji: '📍', color: '#7456D6' },
};

// Le même statut technique porte un nom adapté à chaque type
export const STATUS = {
  activite: { idee: 'Idée', prevue: 'Prévue', realisee: 'Réalisée' },
  resto:    { idee: 'À tester', prevue: 'Réservé', realisee: 'Testé' },
  voyage:   { idee: 'Envisagé', prevue: 'Prévu', realisee: 'Réalisé' },
  lieu:     { idee: 'À voir', prevue: 'Prévu', realisee: 'Visité' },
};
export const statusOptions = (kind) => Object.entries(STATUS[kind]);

export const CATEGORIES = [
  ['maison', 'Maison', '🏠'], ['exterieur', 'Extérieur', '🌳'], ['food', 'Food', '🍜'],
  ['culture', 'Culture', '🎭'], ['sport', 'Sport', '🏃'], ['insolite', 'Insolite', '🦄'],
  ['journee', 'Journée', '☀️'], ['weekend', 'Week-end', '🧳'],
];
export const categoryOf = (v) => CATEGORIES.find((c) => c[0] === v);

export const DURATIONS = [['1h', '1 h'], ['2-3h', '2-3 h'], ['demi', 'Demi-journée'], ['journee', 'Journée'], ['weekend', 'Week-end']];
export const SETTINGS = [['interieur', 'Intérieur'], ['exterieur', 'Extérieur'], ['les_deux', 'Les deux']];
export const PRICES = [[1, '€'], [2, '€€'], [3, '€€€'], [4, '€€€€']];
export const CUISINES = ['Français', 'Italien', 'Japonais', 'Chinois', 'Coréen', 'Vietnamien', 'Thaï', 'Indien',
  'Libanais', 'Mexicain', 'Burger', 'Pizza', 'Brunch', 'Végétarien', 'Fruits de mer', 'Street food', 'Gastronomique', 'Bar à vins'];

export const MOODS = [
  ['love', '🥰', 'Amoureux'], ['fun', '😂', 'Fou rire'], ['wow', '🤩', 'Waouh'],
  ['calm', '😌', 'Paisible'], ['tasty', '😋', 'Gourmand'], ['moved', '🥲', 'Émouvant'],
];
export const moodOf = (v) => MOODS.find((m) => m[0] === v);

export const EVENT_KINDS = [
  ['evenement', 'Événement', '#3D5AE0'], ['rdv', 'Rendez-vous', '#1C9A8B'],
  ['anniversaire', 'Anniversaire', '#D6457A'], ['alternance', 'Alternance', '#C98A12'],
  ['vacances', 'Vacances', '#2E9E5B'],
];
export const eventKindOf = (v) => EVENT_KINDS.find((k) => k[0] === v) || EVENT_KINDS[0];

export const TASK_KINDS = [['menage', 'Ménage'], ['projet', 'Projets']];
export const TASK_STATUS = [['a_faire', 'À faire'], ['en_cours', 'En cours'], ['fait', 'Fait']];
export const RECURRENCE = [['aucune', 'Une fois'], ['quotidienne', 'Chaque jour'], ['hebdo', 'Chaque semaine'], ['mensuelle', 'Chaque mois']];

export const EXPENSE_CATS = [
  ['courses', 'Courses', '🛒'], ['sorties', 'Sorties', '🎟️'], ['restos', 'Restos', '🍽️'],
  ['voyages', 'Voyages', '✈️'], ['maison', 'Maison', '🏠'], ['autre', 'Autre', '💶'],
];
export const expenseCatOf = (v) => EXPENSE_CATS.find((c) => c[0] === v) || EXPENSE_CATS[5];
export const SPLITS = [['moitie', 'Partagé 50/50'], ['perso', 'Pour moi seul·e'], ['remboursement', 'Remboursement']];

export const WISH_KINDS = [['envie', 'Envies'], ['cadeau', 'Cadeaux'], ['projet', 'Projets']];
export const AISLES = ['Fruits & légumes', 'Frais', 'Boulangerie', 'Épicerie', 'Boissons', 'Surgelés', 'Hygiène', 'Maison'];
