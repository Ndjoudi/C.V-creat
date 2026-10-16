import { Game } from "./game.js";

/**
 * Crossword — section §05 « Mots croisés » (README §2, §13).
 *
 * Mêmes règles que la grille, mais jamais les mêmes mots : la partition est
 * portée par `partie.jeu` et tenue par `gameBuilder`.
 *
 * @param {{state:object, contenu:object, aller:Function, enregistrer:Function}} contexte
 * @returns {HTMLElement}
 */
export function Crossword(contexte) {
  return Game(contexte, { jeu: "croises", titre: "Mots croisés" });
}
