/**
 * ProgressDots — avancement dans une phase : ○ ○ ● ○ ○ (README §10.1).
 *
 * @param {number} total    nombre d'étapes
 * @param {number} current  étape en cours, numérotée à partir de 1
 * @returns {HTMLDivElement}
 */
export function ProgressDots({ total = 0, current = 1 } = {}) {
  const el = document.createElement("div");
  el.className = "progress-dots";
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", `étape ${current} sur ${total}`);

  for (let i = 1; i <= total; i += 1) {
    const dot = document.createElement("span");
    let modifier = "";
    if (i === current) modifier = " progress-dots__dot--current";
    else if (i < current) modifier = " progress-dots__dot--done";
    dot.className = `progress-dots__dot${modifier}`;
    el.append(dot);
  }

  return el;
}
