import { Game } from "./game.js";

/**
 * Codeword — section §04 « La grille » (README §2, §13).
 *
 * Grille numérotée, entièrement vide au départ : aucune lettre n'est donnée
 * d'avance. Le déroulé est celui de `game.js`, commun aux deux jeux.
 *
 * @param {{state:object, contenu:object, aller:Function, enregistrer:Function}} contexte
 * @returns {HTMLElement}
 */
export function Codeword(contexte) {
  return Game(contexte, { jeu: "grille", titre: "La grille" });
}
