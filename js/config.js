// ============================================================================
//  Configuration : le SEUL fichier à modifier.
//  Les deux valeurs se trouvent dans Supabase > Project Settings > API Keys / Data API.
// ============================================================================

// URL du projet, par exemple 'https://abcdefghijklmnop.supabase.co'
export const SUPABASE_URL = 'https://VOTRE-PROJET.supabase.co';

// Clé publique : "Publishable key" (sb_publishable_...) ou, sur un ancien projet, "anon public".
// Elle peut être publique sur GitHub : c'est la sécurité RLS de la base qui protège les données.
// Ne mets JAMAIS ici la "secret key" ni la "service_role key".
export const SUPABASE_KEY = 'VOTRE_CLE_PUBLISHABLE';

// Style de la carte (gratuit, sans clé). Autres choix : 'liberty' ou 'bright'.
export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/positron';
