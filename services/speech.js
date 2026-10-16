/**
 * speech.js — reconnaissance vocale anglaise via la Web Speech API (README §17).
 *
 * Permet de **dire** une réponse au lieu de la taper, partout où l'application
 * demande d'écrire (§04, §08). C'est le pendant de `audio.js`, qui lui parle.
 *
 * Trois limites à connaître, parce qu'elles changent le comportement attendu :
 *
 *  1. **Ce n'est pas hors ligne.** Sur la plupart des navigateurs de bureau,
 *     l'audio part sur les serveurs de l'éditeur. C'est la seule fonction de
 *     l'application, avec la traduction, à sortir de l'appareil.
 *  2. **Il faut l'autorisation du micro**, demandée au premier usage.
 *  3. **Un francophone qui parle anglais sera parfois mal transcrit.** Ce que
 *     l'exercice corrige alors n'est plus l'orthographe mais la prononciation.
 *     C'est utile, mais ce n'est pas la même chose — l'écran doit laisser
 *     corriger le texte transcrit avant de valider.
 *
 * Si la reconnaissance n'existe pas, `disponible()` renvoie false et l'interface
 * n'affiche simplement pas le micro : aucune fonction ne disparaît.
 */

/** L'anglais visé. La reconnaissance est bien meilleure quand on le précise. */
export const LANGUE = "en-GB";

/** Au-delà, on coupe : une réponse d'un mot n'a pas besoin de dix secondes. */
export const DUREE_MAX_MS = 10000;

/** Motifs d'échec, pour que l'écran choisisse son message. */
export const CAUSES = {
  INDISPONIBLE: "indisponible",
  REFUSE: "refuse",
  SILENCE: "silence",
  RESEAU: "reseau",
  ANNULE: "annule",
  ERREUR: "erreur",
};

const MESSAGES = {
  [CAUSES.INDISPONIBLE]: "Ce navigateur ne sait pas transcrire la voix.",
  [CAUSES.REFUSE]: "Le micro n'est pas autorisé. Vérifie les réglages du navigateur.",
  [CAUSES.SILENCE]: "Rien n'a été entendu. Réessaie en parlant plus près du micro.",
  [CAUSES.RESEAU]: "La transcription a besoin du réseau et ne l'a pas trouvé.",
  [CAUSES.ANNULE]: "Écoute interrompue.",
  [CAUSES.ERREUR]: "La transcription a échoué.",
};

/** Le constructeur natif, quel que soit son préfixe. */
function moteur() {
  return globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition ?? null;
}

/** La reconnaissance vocale est-elle utilisable ici ? */
export function disponible() {
  return Boolean(moteur());
}

/** Traduit un code d'erreur natif en cause de l'application. */
export function causePourErreur(code) {
  if (code === "not-allowed" || code === "service-not-allowed") return CAUSES.REFUSE;
  if (code === "no-speech" || code === "audio-capture") return CAUSES.SILENCE;
  if (code === "network") return CAUSES.RESEAU;
  if (code === "aborted") return CAUSES.ANNULE;
  return CAUSES.ERREUR;
}

/** Message lisible associé à une cause. */
export function message(cause) {
  return MESSAGES[cause] ?? MESSAGES[CAUSES.ERREUR];
}

/**
 * Écoute une fois et rend le texte transcrit.
 *
 * Ne lève jamais : renvoie toujours un verdict exploitable, comme `api.js`.
 * L'écoute s'arrête d'elle-même au silence, ou au bout de `DUREE_MAX_MS`.
 *
 * @param {object}   options
 * @param {string}   options.langue
 * @param {number}   options.dureeMax
 * @param {Function} options.Moteur     injectable pour les tests
 * @returns {{promesse:Promise<{ok:boolean, texte:?string, cause:?string, erreur:?string}>,
 *            arreter:Function}}
 */
export function ecouter({ langue = LANGUE, dureeMax = DUREE_MAX_MS,
                          Moteur = moteur() } = {}) {
  if (!Moteur) {
    return {
      promesse: Promise.resolve({
        ok: false, texte: null,
        cause: CAUSES.INDISPONIBLE, erreur: message(CAUSES.INDISPONIBLE),
      }),
      arreter: () => {},
    };
  }

  const reconnaissance = new Moteur();
  reconnaissance.lang = langue;
  reconnaissance.interimResults = false;
  reconnaissance.maxAlternatives = 1;
  reconnaissance.continuous = false;

  let termine = false;
  let minuteur = null;

  const promesse = new Promise((resoudre) => {
    const finir = (verdict) => {
      if (termine) return;
      termine = true;
      clearTimeout(minuteur);
      resoudre(verdict);
    };

    reconnaissance.onresult = (evenement) => {
      const texte = evenement?.results?.[0]?.[0]?.transcript ?? "";
      finir(texte.trim()
        ? { ok: true, texte: texte.trim(), cause: null, erreur: null }
        : { ok: false, texte: null, cause: CAUSES.SILENCE, erreur: message(CAUSES.SILENCE) });
    };

    reconnaissance.onerror = (evenement) => {
      const cause = causePourErreur(evenement?.error);
      finir({ ok: false, texte: null, cause, erreur: message(cause) });
    };

    // `onend` sans `onresult` signifie que rien n'a été compris.
    reconnaissance.onend = () => {
      finir({ ok: false, texte: null, cause: CAUSES.SILENCE, erreur: message(CAUSES.SILENCE) });
    };

    try {
      reconnaissance.start();
    } catch {
      finir({ ok: false, texte: null, cause: CAUSES.ERREUR, erreur: message(CAUSES.ERREUR) });
      return;
    }

    minuteur = setTimeout(() => {
      try { reconnaissance.stop(); } catch { /* déjà arrêtée */ }
    }, dureeMax);
  });

  return {
    promesse,
    arreter: () => { try { reconnaissance.stop(); } catch { /* déjà arrêtée */ } },
  };
}
