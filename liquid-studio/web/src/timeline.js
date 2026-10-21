const $ = id => document.getElementById(id);
const timeLabel = frame => `${Math.floor(frame / 1800)}:${String(Math.floor(frame / 30) % 60).padStart(2, '0')}.${String(frame % 30).padStart(2, '0')}`;

export function setupTimeline({ studio, events, locked, onOpenChange, onPreview, onSettled, getLayer }) {
  const toggle = $('timeline-toggle'), range = $('timeline'), track = range.parentElement;
  let open = false, gesture = null, suppressClick = false, markers = null, scrub = null, settledTimer;
  const preview = () => { clearTimeout(settledTimer); onPreview(); };
  const settle = () => {
    clearTimeout(settledTimer);
    if (studio.scrubbing || studio.playing || studio.seeking) return;
    settledTimer = setTimeout(() => {
      if (!studio.scrubbing && !studio.playing && !studio.seeking) onSettled();
    }, 100);
  };
  const updateTime = () => {
    $('timeline').style.setProperty('--progress', `${studio.frame / Math.max(1, studio.frames - 1) * 100}%`);
    for (const id of ['timeline-add', 'timeline-remove']) $(id).disabled = locked() || !open || studio.seeking;
    const selected = studio.keyframes.some(key => key.frame === studio.frame);
    $('timeline-add').textContent = selected ? 'Upravit →' : 'Přidat +';
    $('timeline-remove').hidden = !selected || studio.frame === 0;
    for (const button of $('timeline-markers').children) button.setAttribute('aria-pressed', String(Number(button.dataset.frame) === studio.frame));
  };
  const sync = () => {
    toggle.disabled = locked();
    for (const id of ['play', 'timeline']) $(id).disabled = locked();
    if (markers !== studio.keyframes) {
      markers = studio.keyframes;
      $('timeline-markers').replaceChildren(...markers.map(key => {
        const button = document.createElement('button');
        button.type = 'button'; button.dataset.frame = key.frame;
        button.setAttribute('aria-label', `Klíčový snímek ${timeLabel(key.frame)}`);
        button.style.left = `${key.frame / Math.max(1, studio.frames - 1) * 100}%`;
        button.onclick = () => studio.seekFrame(key.frame);
        button.disabled = locked();
        return button;
      }));
    }
    for (const button of $('timeline-markers').children) button.disabled = locked();
    updateTime();
  };
  const setOpen = (value, notify = true) => {
    if (value === open) return;
    clearTimeout(settledTimer);
    open = value;
    document.body.dataset.timelineOpen = String(open);
    $('timeline-actions').inert = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Sbalit timeline videa' : 'Rozbalit timeline videa');
    if (notify) onOpenChange(open);
    sync();
  };
  toggle.onclick = () => {
    if (suppressClick) { suppressClick = false; return; }
    setOpen(!open);
  };
  toggle.addEventListener('pointerdown', event => {
    if (locked() || event.button !== 0) return;
    gesture = { id: event.pointerId, y: event.clientY };
    toggle.setPointerCapture(event.pointerId);
  });
  toggle.addEventListener('pointerup', event => {
    if (!gesture || event.pointerId !== gesture.id) return;
    const distance = gesture.y - event.clientY;
    gesture = null;
    if (Math.abs(distance) > 24) {
      suppressClick = true; setOpen(distance > 0);
      setTimeout(() => { suppressClick = false; }, 0);
    }
    if (toggle.hasPointerCapture(event.pointerId)) toggle.releasePointerCapture(event.pointerId);
  });
  toggle.addEventListener('pointercancel', () => { gesture = null; });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && open) { event.preventDefault(); setOpen(false); toggle.focus(); }
  });
  $('timeline-add').onclick = () => { studio.addKeyframe(getLayer()); setOpen(false); };
  $('timeline-remove').onclick = () => studio.removeKeyframe();
  const play = $('play').onclick, seek = $('timeline').oninput;
  $('play').onclick = async () => { preview(); await play(); settle(); };
  range.oninput = () => { preview(); seek(); };
  const scrubTo = (x, force = false) => {
    const box = range.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (x - box.left - 6) / Math.max(1, box.width - 12)));
    const frame = scrub.marker !== null && Math.abs(x - scrub.startX) < 6
      ? scrub.marker : Math.round(fraction * (studio.frames - 1));
    if (!force && Number(range.value) === frame) return;
    range.value = frame; range.oninput();
  };
  track.addEventListener('pointerdown', event => {
    if (locked() || event.button !== 0 || scrub) return;
    event.preventDefault();
    const marker = event.target.closest('[data-frame]');
    scrub = { id: event.pointerId, startX: event.clientX, marker: marker ? Number(marker.dataset.frame) : null };
    studio.setScrubbing(true);
    track.setPointerCapture(event.pointerId); range.focus({ preventScroll: true });
    scrubTo(event.clientX, true);
  }, { capture: true });
  track.addEventListener('pointermove', event => {
    if (scrub?.id === event.pointerId) scrubTo(event.clientX);
  });
  const finishScrub = event => {
    if (!scrub || (event && scrub.id !== event.pointerId)) return;
    if (event?.type === 'pointerup') scrubTo(event.clientX);
    const id = scrub.id; scrub = null;
    if (track.hasPointerCapture(id)) track.releasePointerCapture(id);
    studio.setScrubbing(false); settle();
  };
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) track.addEventListener(event, finishScrub);
  window.addEventListener('blur', () => finishScrub());
  // Pointer taps on markers are handled above; keyboard/assistive clicks keep
  // the normal button action. A drag starting on a marker must not snap back.
  track.addEventListener('click', event => {
    if (event.detail > 0) { event.preventDefault(); event.stopPropagation(); }
  }, { capture: true });
  events.addEventListener('timechange', () => {
    updateTime();
    settle();
  });
  return { sync, close: () => setOpen(false), reset: () => setOpen(false, false) };
}
