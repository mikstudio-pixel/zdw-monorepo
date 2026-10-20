import { VideoRenderer } from './video-renderer.js';
try {
  const renderer = new VideoRenderer(document.getElementById('render'));
  let settings;
  window.renderBridge.onFrame(frame => {
    try {
      renderer.upload(frame.data, frame.sourceWidth, frame.sourceHeight);
      if (frame.settings) settings = frame.settings;
      renderer.draw(settings, frame.time);
      window.renderBridge.result({ index: frame.index, data: renderer.readPixels() });
    } catch (error) { window.renderBridge.result({ index: frame.index, error: error.message }); }
  });
  window.renderBridge.ready();
} catch (error) { window.renderBridge.ready(error.message); }
