// ── BOUTON RETOUR DU NAVIGATEUR ────────────────────────────
// Le site est une page unique : sans historique, un "retour" (bouton du
// navigateur ou glissement à deux doigts) faisait sortir du site.
// On enregistre donc chaque étape — changement d'onglet, ouverture d'une
// annonce — pour que le retour revienne en arrière DANS l'app.
//
// Ce module enveloppe les fonctions existantes : aucune logique n'est
// modifiée ailleurs, il suffit de le charger en dernier.

let _navEnCours = false;   // vrai pendant qu'on applique un retour/avance

// Photographie de ce qui est affiché maintenant
function _navEtat() {
  const ecran = document.querySelector('.screen.on')?.id.replace(/^sc-/, '') || 'dash';
  const ouvert = (id) => {
    const el = document.getElementById(id);
    return !!el && !el.classList.contains('hidden');
  };
  return {
    ecran,
    split:   ouvert('split-modal-overlay'),
    analyse: ouvert('analysis-modal-overlay')
  };
}

function _navPush(etat) {
  const a = history.state;
  // Évite d'empiler deux fois la même chose (clics répétés sur le même onglet)
  if (a && a.sc === etat.sc && a.modal === etat.modal && a.cand === etat.cand) return;
  history.pushState(etat, '');
}

(function installerNavigation() {
  if (window._navInstallee) return;
  window._navInstallee = true;

  // Point de départ : l'écran affiché au chargement
  history.replaceState({ sc: _navEtat().ecran }, '');

  // ── Changement d'onglet ──
  const _goTo = window.goTo;
  if (typeof _goTo === 'function') {
    window.goTo = function (id) {
      const pousser = !_navEnCours;
      _goTo.apply(this, arguments);
      if (pousser) _navPush({ sc: id });
    };
  }

  // ── Ouverture d'une annonce ──
  const _openSplit = window.openSplitView;
  if (typeof _openSplit === 'function') {
    window.openSplitView = async function (candId) {
      const pousser = !_navEnCours;
      const r = await _openSplit.apply(this, arguments);
      if (pousser) _navPush({ sc: _navEtat().ecran, modal: 'split', cand: candId });
      return r;
    };
  }

  // ── Fermetures : on repasse par l'historique pour rester synchronisé ──
  const _closeSplit = window.closeSplitView;
  if (typeof _closeSplit === 'function') {
    window.closeSplitView = function () {
      if (!_navEnCours && history.state?.modal === 'split') {
        history.back();          // le retour déclenchera la fermeture
        return;
      }
      return _closeSplit.apply(this, arguments);
    };
  }

  const _openAnalyse = window.openAnalysisModal;
  if (typeof _openAnalyse === 'function') {
    window.openAnalysisModal = function (candId) {
      const pousser = !_navEnCours;
      const r = _openAnalyse.apply(this, arguments);
      if (pousser) _navPush({ sc: _navEtat().ecran, modal: 'analyse', cand: candId });
      return r;
    };
  }

  const _closeAnalyse = window.closeAnalysisModal;
  if (typeof _closeAnalyse === 'function') {
    window.closeAnalysisModal = function () {
      if (!_navEnCours && history.state?.modal === 'analyse') {
        history.back();
        return;
      }
      return _closeAnalyse.apply(this, arguments);
    };
  }

  // ── Retour / avance du navigateur ──
  window.addEventListener('popstate', async (e) => {
    _navEnCours = true;
    try {
      const cible = e.state || { sc: 'dash' };
      const cur   = _navEtat();

      // 1) Fermer ce qui ne doit plus être ouvert
      if (cur.analyse && cible.modal !== 'analyse') closeAnalysisModal();
      if (cur.split   && cible.modal !== 'split')   closeSplitView();

      // 2) Revenir sur le bon onglet
      if (cible.sc && cible.sc !== cur.ecran) goTo(cible.sc);

      // 3) Rouvrir si l'utilisateur fait "avancer"
      if (cible.modal === 'split'   && !_navEtat().split)   await openSplitView(cible.cand);
      if (cible.modal === 'analyse' && !_navEtat().analyse) openAnalysisModal(cible.cand);
    } finally {
      _navEnCours = false;
    }
  });
})();
