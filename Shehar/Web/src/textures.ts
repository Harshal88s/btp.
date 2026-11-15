// Procedural canvas textures (no image assets): asphalt, grass/soil detail, facades, shutters + signboards.
import * as THREE from 'three';

function canvas(w: number, h: number) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')!] as const; }
function tex(c: HTMLCanvasElement, repeat = true, aniso = 4) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
function rnd(seed: number) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

/** greyscale noise multiplied with vertex colour: asphalt grain, cracks and patches */
export function asphalt(): THREE.Texture {
  const [c, g] = canvas(256, 256), r = rnd(7);
  const img = g.createImageData(256, 256);
  for (let i = 0; i < 256 * 256; i++) { const v = 205 + r() * 50; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  for (let k = 0; k < 14; k++) { g.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.08})`; g.beginPath(); g.ellipse(r() * 256, r() * 256, 10 + r() * 40, 6 + r() * 20, r() * 3, 0, 7); g.fill(); }
  g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1;
  for (let k = 0; k < 6; k++) { g.beginPath(); let x = r() * 256, y = r() * 256; g.moveTo(x, y); for (let s = 0; s < 6; s++) { x += r() * 30 - 15; y += r() * 30 - 15; g.lineTo(x, y); } g.stroke(); }
  return tex(c);
}

/** terrain detail: grass blades + soil speckles (multiplied with the land-use vertex colour) */
export function ground(): THREE.Texture {
  const [c, g] = canvas(256, 256), r = rnd(11);
  const img = g.createImageData(256, 256);
  for (let i = 0; i < 256 * 256; i++) { const v = 200 + r() * 55; img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v * 0.97; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  for (let k = 0; k < 900; k++) { g.fillStyle = `rgba(${r() < 0.5 ? '40,60,20' : '90,70,40'},${0.12 + r() * 0.15})`; g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 2 + r() * 4); }
  return tex(c);
}

type Style = 'apt' | 'glass' | 'old' | 'hostel';
/** one window bay x one floor; vertex colour tints the wall */
export function facade(style: Style): THREE.Texture {
  const [c, g] = canvas(128, 128), r = rnd(style.length * 97);
  g.fillStyle = '#f2f2f0'; g.fillRect(0, 0, 128, 128);
  for (let k = 0; k < 60; k++) { g.fillStyle = `rgba(80,70,60,${r() * 0.06})`; g.fillRect(r() * 128, r() * 128, 2 + r() * 8, 6 + r() * 30); } // monsoon streaks
  if (style === 'apt') {
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, 110, 128, 18);             // balcony slab shadow
    g.fillStyle = '#c9c9c4'; g.fillRect(0, 104, 128, 8);                       // slab
    g.fillStyle = '#4c5866'; g.fillRect(22, 30, 84, 58);                       // window
    g.fillStyle = '#2b2a28'; for (let x = 22; x <= 106; x += 12) g.fillRect(x, 30, 2, 58); // grille
    g.fillStyle = '#8a6a4a'; g.fillRect(16, 26, 96, 4);                        // chajja
  } else if (style === 'glass') {
    g.fillStyle = '#5d7488'; g.fillRect(4, 10, 120, 108);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.moveTo(4, 118); g.lineTo(60, 10); g.lineTo(90, 10); g.lineTo(34, 118); g.fill();
    g.fillStyle = '#a7b0b8'; g.fillRect(62, 10, 4, 108); g.fillRect(4, 60, 120, 3);
  } else if (style === 'old') {
    g.fillStyle = '#6b4a2c'; g.fillRect(30, 22, 68, 76);
    g.fillStyle = '#3b4652'; g.fillRect(38, 30, 52, 60);
    g.fillStyle = '#5a3d22'; for (let x = 38; x <= 90; x += 9) g.fillRect(x, 30, 2, 60);
    g.fillStyle = '#7a5434'; g.fillRect(0, 0, 128, 10);                        // wooden cornice
  } else {
    // hostel: cream wall, maroon floor band, larger aluminium-frame windows
    g.fillStyle = '#efe3c8'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#8d2b2b'; g.fillRect(0, 112, 128, 16);
    g.fillStyle = '#3f5163'; g.fillRect(18, 26, 92, 62);
    g.fillStyle = '#c8ccd0'; g.fillRect(62, 26, 4, 62); g.fillRect(18, 56, 92, 3); g.strokeStyle = '#c8ccd0'; g.lineWidth = 4; g.strokeRect(18, 26, 92, 62);
  }
  return tex(c);
}

const SHOPS: [string, string, string, string][] = [
  ['SHREE MEDICAL', 'श्री मेडिकल', '#1a7f37', '#ffffff'], ['KIRANA STORES', 'किराणा स्टोअर्स', '#c7262c', '#ffe25a'], ['VADA PAV CENTRE', 'वडापाव सेंटर', '#f2a516', '#3b1d00'],
  ['MOBILE SHOPPE', 'मोबाईल शॉपी', '#1f4fa8', '#ffffff'], ['XEROX & PRINTS', 'झेरॉक्स', '#ffffff', '#c7262c'], ['SWEET MART', 'मिठाई', '#ff7a1a', '#ffffff'],
  ['HARDWARE', 'हार्डवेअर', '#3b3b3b', '#ffd21a'], ['OPTICIANS', 'चष्मा घर', '#004c7a', '#ffffff'], ['BOOK DEPOT', 'बुक डेपो', '#7a1f4a', '#ffffff'],
  ['PURE VEG RESTAURANT', 'शुद्ध शाकाहारी', '#0f6d3a', '#fff3c4'], ['AMRUT TEA HOUSE', 'अमृत चहा', '#b31b1b', '#ffffff'], ['ELECTRICALS', 'इलेक्ट्रिकल्स', '#ffd21a', '#1a1a1a'],
];
/** atlas: bottom quarter = rolling shutters, top 3/4 = 12 signboard rows */
export function shopAtlas(): THREE.Texture {
  const W = 512, H = 1024, [c, g] = canvas(W, H);
  // v runs bottom (0) -> top (1); canvas y runs top -> bottom
  const shutterTop = H * 0.75;
  for (let y = shutterTop; y < H; y += 4) { g.fillStyle = (y / 4) % 2 ? '#9aa0a6' : '#7d848b'; g.fillRect(0, y, W, 4); }
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, shutterTop, 6, H - shutterTop); g.fillRect(W - 6, shutterTop, 6, H - shutterTop);
  const rowH = (H * 0.75) / SHOPS.length;
  SHOPS.forEach(([en, mr, bg, fg], i) => {
    const y = H * 0.75 - (i + 1) * rowH; // row i occupies v in [0.25 + i*0.75/12, ...]
    g.fillStyle = bg; g.fillRect(0, y, W, rowH);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, y + rowH - 4, W, 4);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `bold ${Math.round(rowH * 0.42)}px Arial, sans-serif`; g.fillText(en, W / 2, y + rowH * 0.36, W - 16);
    g.font = `${Math.round(rowH * 0.3)}px 'Noto Sans Devanagari', 'Mangal', sans-serif`; g.fillText(mr, W / 2, y + rowH * 0.75, W - 16);
  });
  const t = tex(c, false, 8); t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** big lettered sign texture, e.g. RATHI MAHESHWARI HOSTEL */
export function signTexture(text: string, sub: string, bg = '#0b2a5b', fg = '#ffd21a'): THREE.Texture {
  const [c, g] = canvas(1024, 256);
  g.fillStyle = bg; g.fillRect(0, 0, 1024, 256);
  g.strokeStyle = fg; g.lineWidth = 10; g.strokeRect(10, 10, 1004, 236);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 92px Arial, sans-serif'; g.fillText(text, 512, sub ? 110 : 128, 960);
  if (sub) { g.fillStyle = '#ffffff'; g.font = '40px Arial, sans-serif'; g.fillText(sub, 512, 200, 960); }
  return tex(c, false, 8);
}

/** blue municipal street-name board */
const boardCache = new Map<string, THREE.Texture>();
export function streetBoard(name: string): THREE.Texture {
  let t = boardCache.get(name); if (t) return t;
  const [c, g] = canvas(512, 128);
  g.fillStyle = '#123f8c'; g.fillRect(0, 0, 512, 128); g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.strokeRect(6, 6, 500, 116);
  g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 44px Arial, sans-serif'; g.fillText(name, 256, 56, 480);
  g.font = '24px Arial, sans-serif'; g.fillText('PUNE', 256, 100);
  t = tex(c, false, 4);
  if (boardCache.size > 80) { for (const v of boardCache.values()) v.dispose(); boardCache.clear(); }
  boardCache.set(name, t);
  return t;
}
