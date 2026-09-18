/**
 * LaunchUp motion system: timings and actions. Mirrors the CSS tokens in
 * brand.css so Svelte transitions run on the same scale as CSS ones.
 * Components import from here, never from index.ts, to avoid an import cycle
 * (the kind that broke the kanban boards under Vite SSR in c1c32d6).
 */
export const QUICK = 120; // hover, press, focus
export const MOVE = 240; // a state or position changing
export const SETTLE = 600; // data arriving: counters, bars


/**
 * True when motion should be skipped: the OS setting, or the Settings >
 * Appearance preference. app.html folds both into html[data-motion] before
 * first paint; the media query is re-checked in case the OS setting changed.
 */
export function reducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    document.documentElement.dataset.motion === 'reduce' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** A duration for a Svelte transition: the given value, or 0 when reduced. */
export function dur(ms: number): number {
  return reducedMotion() ? 0 : ms;
}

/**
 * Marks an element ready the first time a quarter of it is on screen, which
 * releases the start state brand.css holds counters and fills in. Runs the
 * optional callback at the same moment. Under reduced motion it fires
 * immediately, so nothing waits to appear.
 */
export function arrive(node: HTMLElement, onArrive?: () => void) {
  const ready = () => {
    node.dataset.ready = '';
    onArrive?.();
  };

  if (reducedMotion() || typeof IntersectionObserver === 'undefined') {
    ready();
    return {};
  }

  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        ready();
      }
    },
    { threshold: 0.25 }
  );
  io.observe(node);
  return { destroy: () => io.disconnect() };
}

/**
 * Animates the element's height to follow its single child, so swapping what
 * is inside (tabs, view/edit mode, a message appearing) grows or shrinks the
 * container smoothly instead of jumping. ResizeObserver callbacks run after
 * layout but before paint, so the new size is never painted unclipped.
 * Overflow is only hidden while a resize is in flight, so focus rings on the
 * content are not clipped the rest of the time.
 */
export function autoHeight(node: HTMLElement) {
  const inner = node.firstElementChild as HTMLElement | null;
  if (!inner || typeof ResizeObserver === 'undefined') return {};

  let first = true;
  const settle = (e: TransitionEvent) => {
    if (e.target === node && e.propertyName === 'height') node.style.overflow = '';
  };
  node.addEventListener('transitionend', settle);

  const ro = new ResizeObserver(() => {
    const h = inner.offsetHeight;
    if (first) {
      first = false;
      node.style.height = `${h}px`;
      return;
    }
    if (node.style.height === `${h}px`) return;
    node.style.overflow = 'hidden';
    node.style.transition = 'height var(--lu-move) var(--lu-ease-inout)';
    node.style.height = `${h}px`;
  });
  ro.observe(inner);

  return {
    destroy() {
      ro.disconnect();
      node.removeEventListener('transitionend', settle);
    }
  };
}

/** Plays the one-off "this just changed" wash on an element. */
export function flash(el: Element | null) {
  if (!el || reducedMotion()) return;
  el.classList.remove('lu-flash');
  // Force a reflow so re-adding the class restarts the animation.
  void (el as HTMLElement).offsetWidth;
  el.classList.add('lu-flash');
}
