/* ---------------------------------------------------------------------------
   Photographing a sleeve
   ---------------------------------------------------------------------------
   Neil frames the crop himself. Automatic centre-cropping is fine when the
   sleeve fills the frame, but clips it whenever the photograph is taken at an
   angle or off-centre — which is most of the time, holding a record in one hand.

   The crop is square because sleeves are square and the whole grid is square.
   Drag to move, pinch or use the slider to zoom; the image is always kept
   covering the frame, so there is no way to produce a crop with an empty corner.

   Compression happens here too, on the phone, before anything is sent. A phone
   camera produces multi-megabyte photographs and a sleeve is legible at a
   fraction of that — measured at around a 90% reduction.
--------------------------------------------------------------------------- */
const UPLOAD = (function () {
  const OUTPUT_EDGE = 800;     // plenty for a sleeve on any screen
  const QUALITY = 0.82;        // visually indistinguishable at this size
  const MAX_ZOOM = 4;

  function readAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(new Error('Could not read that file.')); };
      reader.readAsDataURL(file);
    });
  }

  function loadImage(dataUrl) {
    return new Promise(function (resolve, reject) {
      const img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('That does not look like an image.')); };
      img.src = dataUrl;
    });
  }

  function describeSize(bytes) {
    return bytes >= 1024 * 1024
      ? (bytes / (1024 * 1024)).toFixed(1) + 'MB'
      : Math.max(1, Math.round(bytes / 1024)) + 'KB';
  }

  /* Opens the cropper and resolves with the finished image, or null if
     cancelled. All geometry is kept in one place: `zoom` plus an offset from
     centre, clamped so the image always covers the square. */
  async function cropAndCompress(file) {
    const img = await loadImage(await readAsDataUrl(file));

    const overlay = document.getElementById('crop-overlay');
    const frame = document.getElementById('crop-frame');
    const canvasEl = document.getElementById('crop-canvas');
    const zoomInput = document.getElementById('crop-zoom');
    const hint = document.getElementById('crop-hint');

    overlay.hidden = false;
    zoomInput.value = '1';

    let zoom = 1, offsetX = 0, offsetY = 0;

    function frameSize() { return frame.clientWidth; }

    // Scale at which the image exactly covers the square.
    function baseScale() {
      return Math.max(frameSize() / img.width, frameSize() / img.height);
    }

    function clamp() {
      const f = frameSize();
      const dw = img.width * baseScale() * zoom;
      const dh = img.height * baseScale() * zoom;
      const maxX = Math.max(0, (dw - f) / 2);
      const maxY = Math.max(0, (dh - f) / 2);
      offsetX = Math.min(maxX, Math.max(-maxX, offsetX));
      offsetY = Math.min(maxY, Math.max(-maxY, offsetY));
    }

    function draw() {
      clamp();
      const f = frameSize();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvasEl.width = f * dpr;
      canvasEl.height = f * dpr;
      canvasEl.style.width = f + 'px';
      canvasEl.style.height = f + 'px';

      const ctx = canvasEl.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, f, f);
      ctx.imageSmoothingQuality = 'high';

      const dw = img.width * baseScale() * zoom;
      const dh = img.height * baseScale() * zoom;
      ctx.drawImage(img, (f - dw) / 2 + offsetX, (f - dh) / 2 + offsetY, dw, dh);
    }

    /* Turns the current view into the source rectangle it represents, so the
       output is rendered from the original pixels rather than upscaled from
       whatever the preview happened to be. */
    function sourceRect() {
      const f = frameSize();
      const scale = baseScale() * zoom;
      const dw = img.width * scale;
      const dh = img.height * scale;
      const left = (f - dw) / 2 + offsetX;
      const top = (f - dh) / 2 + offsetY;
      return {
        sx: -left / scale,
        sy: -top / scale,
        size: f / scale
      };
    }

    // ---- interaction ----
    let dragging = false, lastX = 0, lastY = 0;
    let pinchStart = 0, pinchZoom = 1;

    const onPointerDown = function (e) {
      dragging = true;
      lastX = e.clientX; lastY = e.clientY;
      frame.setPointerCapture && frame.setPointerCapture(e.pointerId);
    };
    const onPointerMove = function (e) {
      if (!dragging) return;
      offsetX += e.clientX - lastX;
      offsetY += e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      draw();
    };
    const onPointerUp = function () { dragging = false; };

    const distance = function (t) {
      const dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };
    const onTouchStart = function (e) {
      if (e.touches.length === 2) { pinchStart = distance(e.touches); pinchZoom = zoom; }
    };
    const onTouchMove = function (e) {
      if (e.touches.length === 2 && pinchStart) {
        e.preventDefault();
        zoom = Math.min(MAX_ZOOM, Math.max(1, pinchZoom * (distance(e.touches) / pinchStart)));
        zoomInput.value = String(zoom);
        draw();
      }
    };
    const onWheel = function (e) {
      e.preventDefault();
      zoom = Math.min(MAX_ZOOM, Math.max(1, zoom * (e.deltaY < 0 ? 1.08 : 0.93)));
      zoomInput.value = String(zoom);
      draw();
    };
    const onZoomInput = function () { zoom = Number(zoomInput.value); draw(); };

    frame.addEventListener('pointerdown', onPointerDown);
    frame.addEventListener('pointermove', onPointerMove);
    frame.addEventListener('pointerup', onPointerUp);
    frame.addEventListener('pointercancel', onPointerUp);
    frame.addEventListener('touchstart', onTouchStart, { passive: true });
    frame.addEventListener('touchmove', onTouchMove, { passive: false });
    frame.addEventListener('wheel', onWheel, { passive: false });
    zoomInput.addEventListener('input', onZoomInput);

    hint.textContent = describeSize(file.size) + ' photo · drag to position, pinch or slide to zoom';
    draw();

    // ---- resolve on confirm or cancel ----
    return new Promise(function (resolve) {
      function cleanup() {
        frame.removeEventListener('pointerdown', onPointerDown);
        frame.removeEventListener('pointermove', onPointerMove);
        frame.removeEventListener('pointerup', onPointerUp);
        frame.removeEventListener('pointercancel', onPointerUp);
        frame.removeEventListener('touchstart', onTouchStart);
        frame.removeEventListener('touchmove', onTouchMove);
        frame.removeEventListener('wheel', onWheel);
        zoomInput.removeEventListener('input', onZoomInput);
        document.getElementById('crop-confirm').removeEventListener('click', onConfirm);
        document.getElementById('crop-cancel').removeEventListener('click', onCancel);
        overlay.hidden = true;
      }

      function onConfirm() {
        const rect = sourceRect();
        const out = document.createElement('canvas');
        const edge = Math.min(OUTPUT_EDGE, Math.round(rect.size));
        out.width = edge;
        out.height = edge;
        const ctx = out.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, rect.sx, rect.sy, rect.size, rect.size, 0, 0, edge, edge);
        const dataUrl = out.toDataURL('image/jpeg', QUALITY);
        cleanup();
        resolve({
          base64: dataUrl.replace(/^data:image\/[a-z]+;base64,/, ''),
          preview: dataUrl,
          originalBytes: file.size,
          compressedBytes: Math.round(dataUrl.length * 0.75),
          edge: edge
        });
      }

      function onCancel() { cleanup(); resolve(null); }

      document.getElementById('crop-confirm').addEventListener('click', onConfirm);
      document.getElementById('crop-cancel').addEventListener('click', onCancel);
    });
  }

  return { cropAndCompress, describeSize };
})();
