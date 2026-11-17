/**
 * Vitrine · carte animée (MapLibre + fonds OpenFreeMap, gratuits et sans clé).
 * Départ en vue large sur la Méditerranée, puis vol vers le repère quand la carte entre à l'écran.
 * La molette ne capture pas le défilement de la page (Ctrl + molette pour zoomer, deux doigts sur mobile).
 */
export const LOCATION = { lng: 10.1815, lat: 36.8065, label: 'Tunis', note: 'Adresse exacte à confirmer' };

let cssLoaded = false;
function loadCss(): void {
  if (cssLoaded) return;
  cssLoaded = true;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = 'maplibre.css';          // feuille livrée à part par angular.json (inject: false)
  document.head.appendChild(l);
}

export async function startMap(el: HTMLElement, still: boolean, onError: () => void): Promise<{ fly: () => void; destroy: () => void }> {
  loadCss();
  const maplibregl = await import('maplibre-gl');
  maplibregl.setWorkerUrl(new URL('maplibre/maplibre-gl-worker.mjs', document.baseURI).href);   // fichiers copiés par angular.json
  const map = new maplibregl.Map({
    container: el,
    style: 'https://tiles.openfreemap.org/styles/dark',
    center: still ? [LOCATION.lng, LOCATION.lat] : [12.5, 37.8],
    zoom: still ? 12 : 3.6, pitch: still ? 40 : 0, bearing: 0,
    attributionControl: { compact: true },
    cooperativeGestures: true,
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  map.on('error', (e: unknown) => { if ((e as { error?: { status?: number } }).error?.status !== 404) onError(); });

  // Repère : anneau « crayon gras » qui pulse
  const pin = document.createElement('div');
  pin.className = 'pin';
  pin.setAttribute('role', 'img');
  pin.setAttribute('aria-label', `${LOCATION.label} — ${LOCATION.note}`);
  pin.innerHTML = '<span class="pulse"></span><span class="ring"></span>';
  new maplibregl.Marker({ element: pin }).setLngLat([LOCATION.lng, LOCATION.lat]).addTo(map);

  let flown = false, spin = 0;
  const rotate = () => {
    if (still) return;
    map.easeTo({ bearing: map.getBearing() - 12, duration: 12000, easing: (t: number) => t });
  };
  map.on('moveend', () => { if (flown && !map.isMoving()) spin = window.setTimeout(rotate, 50); });
  map.on('mousedown', () => clearTimeout(spin));
  map.on('touchstart', () => clearTimeout(spin));

  return {
    fly: () => {
      if (flown || still) return;
      flown = true;
      const go = () => map.flyTo({ center: [LOCATION.lng, LOCATION.lat], zoom: 12.6, pitch: 52, bearing: -18, speed: 0.55, curve: 1.6, essential: true });
      if (map.loaded()) go(); else map.once('load', go);
    },
    destroy: () => { clearTimeout(spin); map.remove(); },
  };
}
