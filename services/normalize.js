/**
 * normalize.js — normalisation des saisies texte (README §17.4).
 *
 * Source unique : `InputAnswer`, `ClozeInput`, `VerbTriad` et `WordOrder`
 * importent ces fonctions, aucune ne réimplémente la comparaison.
 */

/**
    .replace(/[\u0300-\u036f]/g, "")   // accents
    .replace(/\s+/g, " ")              // espaces multiples
    .trim();                           // le retrait de la ponctuation peut
                                       // recréer un espace en bord de chaîne
 * @param {string} s
 * @returns {string}
 */
export function normaliser(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // accents
    .replace(/[^a-z0-9 ]/g, "")        // ponctuation
    .replace(/\s+/g, " ")              // espaces multiples
    .trim();                           // le retrait de la ponctuation peut
                                       // recréer un espace en bord de chaîne
}

/**
 * Un champ `fr` peut contenir plusieurs traductions acceptables séparées
 * par « | » (README §17.4). Renvoie la liste normalisée.
 * @param {string} attendu
 * @returns {string[]}
 */
export function variantes(attendu) {
  return String(attendu ?? "")
    .split("|")
    .map(normaliser)
    .filter((v) => v.length > 0);
}

/**
 * Compare une saisie à la réponse attendue. N'importe laquelle des variantes
 * sépararées par « | » valide.
 * @param {string} saisie
 * @param {string} attendu
 * @returns {boolean}
 */
export function estCorrect(saisie, attendu) {
  const propose = normaliser(saisie);
  if (!propose) return false;
  return variantes(attendu).includes(propose);
}
