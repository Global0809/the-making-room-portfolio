// Small, event-driven depth cues for the archive's still images. The room owns
// its own render loop; reading the archive never starts an animation loop here.
export function createArchiveDepth({ container, canAnimate = () => true } = {}) {
  if (!container) throw new TypeError('Archive depth needs a scroll container.');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const dialog = container.closest('dialog');
  let entries = [];
  let bySurface = new Map();
  let active = false;
  let disposed = false;
  let frame = 0;
  let pointer = null;
  let paints = 0;
  let measuredTargets = 0;
  let transformedTargets = 0;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const allowed = () => active && !disposed && !document.hidden && Boolean(canAnimate());

  function restore(entry) {
    if (!entry.transformed) return;
    if (entry.previousTransform) entry.image.style.setProperty('transform', entry.previousTransform, entry.previousPriority);
    else entry.image.style.removeProperty('transform');
    entry.transformed = false;
    entry.lastTransform = '';
  }
  function resetTransforms() {
    for (const entry of entries) restore(entry);
    transformedTargets = 0;
  }
  function cancelFrame() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  }
  function schedule() {
    if (!active || disposed || frame) return;
    if (!allowed()) { pointer = null; resetTransforms(); return; }
    frame = requestAnimationFrame(paint);
  }

  function paint() {
    frame = 0;
    if (!allowed()) { pointer = null; resetTransforms(); return; }
    const viewport = container.getBoundingClientRect();
    if (viewport.width < 1 || viewport.height < 1) { resetTransforms(); return; }
    const centerY = viewport.top + viewport.height * .5;

    // All geometry reads happen before any style writes. Surface rectangles are
    // stable even though their child image has its own small transform.
    const measurements = entries.map(entry => ({
      entry,
      rect: entry.surface.getBoundingClientRect(),
      width: entry.image.clientWidth,
      height: entry.image.clientHeight
    }));
    measuredTargets = measurements.length;
    let changed = 0;
    for (const { entry, rect, width, height } of measurements) {
      if (!entry.image.isConnected || width < 1 || height < 1 || rect.bottom < viewport.top - 40 || rect.top > viewport.bottom + 40) {
        restore(entry);
        continue;
      }
      const progress = clamp((centerY - (rect.top + rect.height * .5)) / (viewport.height * .65 + rect.height * .35), -1, 1);
      const hovered = finePointer.matches && pointer?.entry === entry;
      const px = hovered ? clamp((pointer.x - rect.left) / Math.max(rect.width, 1) * 2 - 1, -1, 1) : 0;
      const py = hovered ? clamp((pointer.y - rect.top) / Math.max(rect.height, 1) * 2 - 1, -1, 1) : 0;
      let scale, rotation, y;
      if (entry.main) {
        // Preserve the entire submitted infographic. Scaling slightly inward
        // leaves room for the tiny tilt and the scroll offset, never a crop.
        scale = .985 + .009 * (1 - Math.abs(progress));
        const maxAngle = Math.min(.35 * Math.PI / 180, (1 - scale) * Math.min(width, height) / (2 * Math.max(width, height)));
        const angle = px * maxAngle;
        rotation = angle * 180 / Math.PI;
        const safeY = Math.max(0, (height - scale * (height * Math.cos(angle) + width * Math.abs(Math.sin(angle)))) / 2 - .3);
        y = clamp(progress * 3.8 + py * .8, -Math.min(5, safeY), Math.min(5, safeY));
      } else {
        scale = hovered ? 1.03 : 1.022;
        rotation = clamp(px * .55 + progress * .055, -.7, .7);
        const angle = Math.abs(rotation) * Math.PI / 180;
        // The card image already fills a crop. Keep its transformed corners
        // covering that frame rather than revealing a strip of empty space.
        const cosine = Math.cos(angle), sine = Math.sin(angle);
        const safeY = Math.max(0, (scale * height / 2 - sine * width / 2) / cosine - height / 2 - .25);
        y = clamp(progress * 3.8 + py * .85, -Math.min(5, safeY), Math.min(5, safeY));
      }
      const transform = `translate3d(0,${y.toFixed(3)}px,0) rotate(${rotation.toFixed(3)}deg) scale(${scale.toFixed(5)})`;
      if (entry.lastTransform !== transform) {
        entry.image.style.setProperty('transform', transform);
        entry.lastTransform = transform;
      }
      entry.transformed = true;
      changed++;
    }
    transformedTargets = changed;
    paints++;
  }

  function refresh() {
    if (disposed) return;
    cancelFrame();
    resetTransforms();
    pointer = null;
    bySurface.clear();
    entries = [...container.querySelectorAll('.work-card .card-image img, .detail > .asset-view img')].map(image => {
      const main = Boolean(image.closest('.detail > .asset-view'));
      const surface = image.closest(main ? '.asset-view' : '.card-image');
      const entry = {
        image, surface, main, transformed: false, lastTransform: '',
        previousTransform: image.style.getPropertyValue('transform'),
        previousPriority: image.style.getPropertyPriority('transform')
      };
      bySurface.set(surface, entry);
      if (!main) bySurface.set(image.closest('.work-card'), entry);
      return entry;
    });
    active = true;
    schedule();
  }

  function clear() {
    cancelFrame();
    resetTransforms();
    active = false;
    pointer = null;
    entries = [];
    bySurface.clear();
    measuredTargets = 0;
  }

  function onPointerMove(event) {
    if (!finePointer.matches || event.pointerType === 'touch' || !allowed()) {
      if (pointer) { pointer = null; schedule(); }
      return;
    }
    const surface = event.target?.closest?.('.card-image, .work-card, .asset-view');
    const entry = bySurface.get(surface);
    pointer = entry ? { entry, x: event.clientX, y: event.clientY } : null;
    schedule();
  }
  function onPointerLeave() { if (pointer) { pointer = null; schedule(); } }
  function onVisibility() {
    if (document.hidden) { cancelFrame(); pointer = null; resetTransforms(); }
    else schedule();
  }
  function onFinePointerChange() { pointer = null; schedule(); }
  function onStateChange() {
    if (!allowed()) { cancelFrame(); pointer = null; resetTransforms(); }
    else schedule();
  }
  function onImageLoad(event) { if (event.target?.tagName === 'IMG') schedule(); }
  container.addEventListener('scroll', schedule, { passive: true });
  container.addEventListener('pointermove', onPointerMove, { passive: true });
  container.addEventListener('pointerleave', onPointerLeave, { passive: true });
  container.addEventListener('pointercancel', onPointerLeave, { passive: true });
  container.addEventListener('play', onStateChange, true);
  container.addEventListener('pause', onStateChange, true);
  container.addEventListener('ended', onStateChange, true);
  container.addEventListener('load', onImageLoad, true);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('resize', schedule, { passive: true });
  if (finePointer.addEventListener) finePointer.addEventListener('change', onFinePointerChange);
  else finePointer.addListener(onFinePointerChange);

  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
  resizeObserver?.observe(container);
  const stateObserver = typeof MutationObserver === 'function' ? new MutationObserver(onStateChange) : null;
  if (document.body) stateObserver?.observe(document.body, { attributes: true, attributeFilter: ['data-motion'] });
  if (dialog) stateObserver?.observe(dialog, { attributes: true, attributeFilter: ['open'] });

  function dispose() {
    if (disposed) return;
    clear();
    disposed = true;
    resizeObserver?.disconnect();
    stateObserver?.disconnect();
    container.removeEventListener('scroll', schedule);
    container.removeEventListener('pointermove', onPointerMove);
    container.removeEventListener('pointerleave', onPointerLeave);
    container.removeEventListener('pointercancel', onPointerLeave);
    container.removeEventListener('play', onStateChange, true);
    container.removeEventListener('pause', onStateChange, true);
    container.removeEventListener('ended', onStateChange, true);
    container.removeEventListener('load', onImageLoad, true);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('resize', schedule);
    if (finePointer.removeEventListener) finePointer.removeEventListener('change', onFinePointerChange);
    else finePointer.removeListener(onFinePointerChange);
  }

  function getDiagnostics() {
    return {
      active, disposed, canAnimate: allowed(), finePointer: finePointer.matches,
      targets: entries.length, transformedTargets, measuredTargets,
      hoveredImage: pointer?.entry?.main ? 'artwork' : pointer ? 'card' : null,
      framePending: Boolean(frame), paints
    };
  }
  return { refresh, clear, dispose, getDiagnostics };
}
