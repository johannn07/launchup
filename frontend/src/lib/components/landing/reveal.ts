/** Reveals a node once it scrolls into view. No-op under reduced motion. */
export function reveal(node: HTMLElement, delay = 0) {
  node.classList.add('lu-rv');
  if (delay) node.style.transitionDelay = `${delay}ms`;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    node.classList.add('lu-in');
    return {};
  }

  const obs = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        node.classList.add('lu-in');
        obs.disconnect();
      }
    },
    { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
  );

  obs.observe(node);
  return { destroy: () => obs.disconnect() };
}
