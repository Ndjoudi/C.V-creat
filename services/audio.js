/**
 * audio.js — synthèse vocale anglaise via la Web Speech API (README §8, §12).
 *
 * Gratuit, hors ligne sur la plupart des systèmes, aucune dépendance.
 * Si la voix n'est pas disponible, l'application continue sans bruit : la
 * lecture est un confort, jamais un prérequis.
 */

const LANGUE = "en-GB";
const LANGUE_REPLI = "en";

/** La synthèse vocale est-elle utilisable ici ? */
export function disponible() {
  return typeof globalThis.speechSynthesis !== "undefined"
    && typeof globalThis.SpeechSynthesisUtterance !== "undefined";
}

/**
 * Meilleure voix anglaise disponible. Les voix arrivent de façon asynchrone :
 * le premier appel peut renvoyer null, l'appel suivant la trouvera.
 * @returns {?SpeechSynthesisVoice}
 */
export function voixAnglaise() {
  if (!disponible()) return null;
  const voix = globalThis.speechSynthesis.getVoices();
  return voix.find((v) => v.lang === LANGUE)
    ?? voix.find((v) => v.lang?.startsWith(LANGUE_REPLI))
    ?? null;
}

/**
 * Lit un texte en anglais. Interrompt toute lecture en cours.
 * @param {string} texte
 * @returns {boolean} false si rien n'a pu être lu
 */
export function parler(texte) {
  if (!disponible() || !texte) return false;

  try {
    globalThis.speechSynthesis.cancel();
    const enonce = new globalThis.SpeechSynthesisUtterance(String(texte));
    enonce.lang = LANGUE;
    enonce.rate = 0.9;
    const voix = voixAnglaise();
    if (voix) enonce.voice = voix;
    globalThis.speechSynthesis.speak(enonce);
    return true;
  } catch {
    return false;
  }
}

/** Coupe la lecture en cours. À appeler en quittant un écran. */
export function taire() {
  if (disponible()) globalThis.speechSynthesis.cancel();
}
