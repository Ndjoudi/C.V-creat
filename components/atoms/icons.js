/**
 * icons.js — jeu d'icônes maison, SVG inline (README §17.5).
 *
 * Contraintes : viewBox "0 0 24 24", stroke="currentColor", stroke-width 2,
 * fill="none", extrémités et jonctions arrondies. Aucune couleur en dur : la
 * teinte est héritée du parent via currentColor.
 *
 * `Button`, `IconButton` et `Counter` reçoivent une CLÉ de cet objet,
 * jamais du SVG brut.
 */

const wrap = (paths) =>
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"' +
  ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
  paths +
  "</svg>";

export const ICONS = {
  mic: wrap(
    '<rect x="9" y="2" width="6" height="11" rx="3"/>' +
    '<path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8"/>',
  ),
  grid: wrap(
    '<rect x="3" y="3" width="18" height="18" rx="2"/>' +
    '<path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  ),
  home: wrap(
    '<path d="M3 10.5 12 3l9 7.5"/>' +
    '<path d="M5.5 9.4V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.4"/>' +
    '<path d="M9.5 21v-6.5h5V21"/>'
  ),

  back: wrap(
    '<path d="M20 12H4"/>' +
    '<path d="M10 6 4 12l6 6"/>'
  ),

  close: wrap(
    '<path d="M6 6l12 12"/>' +
    '<path d="M18 6 6 18"/>'
  ),

  audio: wrap(
    '<path d="M4 9.5h3L11.5 5v14L7 14.5H4z"/>' +
    '<path d="M15.5 9.2a4 4 0 0 1 0 5.6"/>' +
    '<path d="M18.2 6.4a7.8 7.8 0 0 1 0 11.2"/>'
  ),

  plus: wrap(
    '<path d="M12 5v14"/>' +
    '<path d="M5 12h14"/>'
  ),

  check: wrap(
    '<path d="M4.5 12.5 9.5 17.5 19.5 6.5"/>'
  ),

  cross: wrap(
    '<circle cx="12" cy="12" r="9"/>' +
    '<path d="M9 9l6 6"/>' +
    '<path d="M15 9l-6 6"/>'
  ),

  flame: wrap(
    '<path d="M12 21a6 6 0 0 0 6-6c0-4.2-3.6-6.6-4.6-9.4-1.6 2-2.6 3.2-2.6 4.7 0 1 .5 1.6.5 2.4a2 2 0 0 1-3.9.5A6.9 6.9 0 0 0 6 15a6 6 0 0 0 6 6z"/>'
  ),

  book: wrap(
    '<path d="M3 5h5a4 4 0 0 1 4 3v12a4 4 0 0 0-4-2H3z"/>' +
    '<path d="M21 5h-5a4 4 0 0 0-4 3v12a4 4 0 0 1 4-2h5z"/>'
  ),

  pencil: wrap(
    '<path d="M4 20h4L19 9a2.83 2.83 0 0 0-4-4L4 16v4z"/>' +
    '<path d="M14.5 5.5l4 4"/>'
  ),

  settings: wrap(
    '<path d="M4 7h9"/><path d="M19 7h1"/><circle cx="16" cy="7" r="2.2"/>' +
    '<path d="M4 17h3"/><path d="M13 17h7"/><circle cx="10" cy="17" r="2.2"/>'
  ),

  chart: wrap(
    '<path d="M4 3v17h16"/>' +
    '<path d="M8 20v-5"/>' +
    '<path d="M13 20V9"/>' +
    '<path d="M18 20v-8"/>'
  ),

  download: wrap(
    '<path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>' +
    '<path d="M12 3v11"/>' +
    '<path d="M7.5 9.5 12 14l4.5-4.5"/>'
  ),

  upload: wrap(
    '<path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>' +
    '<path d="M12 14V3"/>' +
    '<path d="M7.5 7.5 12 3l4.5 4.5"/>'
  ),
};
