const $ = id => document.getElementById(id);
const timeLabel = frame => `${Math.floor(frame / 1800)}:${String(Math.floor(frame / 30) % 60).padStart(2, '0')}.${String(frame % 30).padStart(2, '0')}`;

export function setupTimeline({ studio, events, locked, onPreview, onEdit, getLayer }) {
  const add = $('timeline-add'), range = $('timeline'), track = range.parentElement;
  let markers = null, scrub = null;
  const preview = (seed = false) => onPreview(seed);
  const updateTime = () => {
    track.style.setProperty('--progress', `${studio.frame / Math.max(1, studio.frames - 1) * 100}%`);
    add.disabled = locked() || studio.seeking || studio.scrubbing;
    const selected = studio.keyframes.some(key => key.frame === studio.frame);
    add.title = selected ? 'Upravit klíčový snímek' : 'Přidat klíčový snímek';
    add.setAttribute('aria-label', add.title);
    for (const button of $('timeline-markers').children) button.setAttribute('aria-pressed', String(Number(button.dataset.frame) === studio.frame));
  };
  const sync = () => {
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
  const play = $('play').onclick, seek = $('timeline').oninput;
  add.onclick = async () => {
    if (add.disabled) return;
    if (studio.playing) await play();
    preview(true);
    studio.addKeyframe(getLayer());
    onEdit();
  };
  $('play').onclick = () => { preview(); return play(); };
  range.oninput = () => { preview(); seek(); };
  const scrubTo = (x, force = false) => {
    const box = range.getBoundingClientRect();
    const thumbInset = 6, travel = Math.max(1, box.width - thumbInset * 2);
    const start = box.left + thumbInset;
    const fraction = Math.max(0, Math.min(1, (x - start) / travel));
    const maxFrame = Math.max(1, studio.frames - 1);
    let frame = Math.round(fraction * maxFrame);
    if (scrub.marker !== null && Math.abs(x - scrub.startX) < 6) frame = scrub.marker;
    else {
      let nearest = null;
      for (const key of studio.keyframes) {
        const markerX = start + key.frame / maxFrame * travel;
        const distance = Math.abs(markerX - x);
        if (!nearest || distance < nearest.distance) nearest = { frame: key.frame, distance };
      }
      if (nearest?.distance <= 10) frame = nearest.frame;
    }
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
    studio.setScrubbing(false); updateTime();
  };
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) track.addEventListener(event, finishScrub);
  window.addEventListener('blur', () => finishScrub());
  // Pointer taps on markers are handled above; keyboard/assistive clicks keep
  // the normal button action. A drag starting on a marker must not snap back.
  track.addEventListener('click', event => {
    if (event.detail > 0) { event.preventDefault(); event.stopPropagation(); }
  }, { capture: true });
  events.addEventListener('timechange', updateTime);
  return { sync };
}
