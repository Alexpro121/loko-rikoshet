/** Справжня емблема клубу (public/loko-logo.svg), завантажується один раз і ділиться між текстурами. */
const img = new Image();
const cbs = [];
let ready = false;
img.onload = () => { ready = true; cbs.splice(0).forEach((f) => f(img)); };
img.src = `${import.meta.env.BASE_URL}loko-logo.svg`;
export const logoReady = () => ready;
export const logoImg = () => img;
export function whenLogo(cb) { if (ready) cb(img); else cbs.push(cb); }
