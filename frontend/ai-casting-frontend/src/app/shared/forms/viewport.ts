/** Bas utile de l'écran : au-dessus de la barre d'onglets mobile quand elle est affichée. */
export function usableBottom(): number {
  const bar = document.querySelector('app-main-layout .tabbar') as HTMLElement | null;
  if (bar && getComputedStyle(bar).display !== 'none' && getComputedStyle(bar).opacity !== '0') {
    return Math.min(window.innerHeight, bar.getBoundingClientRect().top - 6);
  }
  return window.innerHeight;
}
