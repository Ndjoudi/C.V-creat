/**
 * sync.js — recopie de l'état sur un serveur distant (README §6.6).
 *
 * `localStorage` ne suffit pas : sur iPhone, Safari efface le stockage d'un
 * site qui n'a pas été ouvert depuis sept jours. Tout l'état — les mots, les
 * boîtes Leitner, la progression — disparaîtrait avec lui. Le rappel de
 * sauvegarde manuelle existe (§6.6) mais suppose d'y penser.
 *
 * L'état complet est donc recopié dans Supabase sous un **identifiant long et
 * aléatoire**. Cet identifiant n'est pas un secret : il est simplement
 * introuvable par hasard. C'est volontaire — il n'y a rien de confidentiel
 * dans une liste de mots appris, le risque à écarter était qu'un tiers puisse
 * ÉCRASER la progression, pas qu'il la lise.
 *
 * La table n'est pas accessible en direct : deux fonctions SQL `security
 * definer` sont les seules portes, et elles exigent l'identifiant. Sans lui,
 * la clé publiable ne donne rien.
 *
 * Aucune bibliothèque : deux appels REST. Comme `api.js`, rien ici ne lève —
 * une panne de réseau ne doit jamais casser une séance de révision.
 */

export const URL_SUPABASE = "https://kacpcyyivmbcsytoropi.supabase.co";

/** Clé publiable : prévue pour vivre dans une page publique. */
export const CLE_PUBLIABLE = "sb_publishable_7yz5dwsQRJk9BOHJlw9beA_fQF3PBg5";

/** Où l'identifiant de synchronisation est gardé, côté appareil. */
export const CLE_ID = "wordcode_sync_id";

/** Au-delà, on abandonne : mieux vaut réviser hors ligne qu'attendre. */
export const TIMEOUT_MS = 10000;

export const CAUSES = {
  SANS_ID: "sans-id",
  HORS_LIGNE: "hors-ligne",
  TIMEOUT: "timeout",
  RESEAU: "reseau",
  REFUS: "refus",
  VIDE: "vide",
};

const MESSAGES = {
  [CAUSES.SANS_ID]: "Aucun identifiant de synchronisation sur cet appareil.",
  [CAUSES.HORS_LIGNE]: "Pas de connexion : la sauvegarde en ligne attendra.",
  [CAUSES.TIMEOUT]: "Le serveur met trop de temps à répondre.",
  [CAUSES.RESEAU]: "Le serveur de sauvegarde est injoignable.",
  [CAUSES.REFUS]: "Le serveur a refusé la sauvegarde.",
  [CAUSES.VIDE]: "Aucune sauvegarde en ligne pour cet identifiant.",
};

const echec = (cause) => ({ ok: false, donnees: null, cause, erreur: MESSAGES[cause] });

/**
 * Identifiant de cet appareil, créé au premier appel.
 *
 * 32 caractères tirés au sort : c'est ce qui rend la ligne introuvable. Le
 * même identifiant recopié sur un autre appareil y restaure la progression —
 * c'est le seul moyen de passer du téléphone à l'ordinateur.
 *
 * @param {object} options
 * @param {Storage} options.storage
 * @param {Function} options.alea  injectable pour les tests
 * @returns {string}
 */
export function identifiant({ storage = localStorage, alea = aleaParDefaut } = {}) {
  try {
    const lu = storage.getItem(CLE_ID);
    if (lu) return lu;
    const neuf = alea();
    storage.setItem(CLE_ID, neuf);
    return neuf;
  } catch {
    // Navigation privée, stockage refusé : on rend un identifiant jetable
    // plutôt que de faire échouer l'appel.
    return alea();
  }
}

/** Remplace l'identifiant — pour relier un second appareil au premier. */
export function definirIdentifiant(valeur, { storage = localStorage } = {}) {
  const propre = String(valeur ?? "").trim();
  if (!propre) return null;
  try { storage.setItem(CLE_ID, propre); } catch { /* stockage refusé */ }
  return propre;
}

/**
 * Recopie l'état en ligne.
 *
 * @param {object} options
 * @param {object} options.state
 * @param {string} options.id
 * @returns {Promise<{ok:boolean, cause:?string, erreur:?string}>}
 */
export async function sauvegarderEnLigne({ state, id, url = URL_SUPABASE,
                                           cle = CLE_PUBLIABLE,
                                           recuperer = globalThis.fetch,
                                           enLigne = globalThis.navigator?.onLine ?? true,
                                           timeout = TIMEOUT_MS } = {}) {
  if (!id) return echec(CAUSES.SANS_ID);
  if (!enLigne) return echec(CAUSES.HORS_LIGNE);

  const reponse = await appeler("ecrire_etat", { cle: id, contenu: state },
                                { url, cle, recuperer, timeout });
  if (!reponse.ok) return reponse;
  return { ok: true, donnees: null, cause: null, erreur: null };
}

/**
 * Relit l'état en ligne. Rend `VIDE` si cet identifiant n'a jamais rien écrit.
 *
 * @returns {Promise<{ok:boolean, donnees:?object, cause:?string, erreur:?string}>}
 */
export async function restaurerDepuisLigne({ id, url = URL_SUPABASE,
                                             cle = CLE_PUBLIABLE,
                                             recuperer = globalThis.fetch,
                                             enLigne = globalThis.navigator?.onLine ?? true,
                                             timeout = TIMEOUT_MS } = {}) {
  if (!id) return echec(CAUSES.SANS_ID);
  if (!enLigne) return echec(CAUSES.HORS_LIGNE);

  const reponse = await appeler("lire_etat", { cle: id }, { url, cle, recuperer, timeout });
  if (!reponse.ok) return reponse;
  if (!reponse.donnees || typeof reponse.donnees !== "object") return echec(CAUSES.VIDE);
  return reponse;
}

/** Un appel de fonction SQL. Ne lève jamais. */
async function appeler(fonction, corps, { url, cle, recuperer, timeout }) {
  const arret = new AbortController();
  const minuteur = setTimeout(() => arret.abort(), timeout);

  let reponse;
  try {
    reponse = await recuperer(`${url}/rest/v1/rpc/${fonction}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: cle,
        Authorization: `Bearer ${cle}`,
      },
      body: JSON.stringify(corps),
      signal: arret.signal,
    });
  } catch (e) {
    clearTimeout(minuteur);
    return echec(e?.name === "AbortError" ? CAUSES.TIMEOUT : CAUSES.RESEAU);
  }
  clearTimeout(minuteur);

  if (!reponse.ok) return echec(CAUSES.REFUS);

  try {
    return { ok: true, donnees: await reponse.json(), cause: null, erreur: null };
  } catch {
    // `ecrire_etat` ne renvoie rien : un corps vide est un succès, pas un refus.
    return { ok: true, donnees: null, cause: null, erreur: null };
  }
}

function aleaParDefaut() {
  const octets = new Uint8Array(16);
  (globalThis.crypto ?? {}).getRandomValues?.(octets);
  return [...octets].map((o) => o.toString(16).padStart(2, "0")).join("");
}
