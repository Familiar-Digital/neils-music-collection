/* ---------------------------------------------------------------------------
   Photographing a sleeve
   ---------------------------------------------------------------------------
   Compression happens here, on the phone, before anything is sent. A phone
   camera produces 4MB photographs; a record sleeve is legible at a fraction of
   that, and sending the original would be slow on mobile data and wasteful of
   storage forever afterwards.

   Sleeves are square, so the image is centre-cropped to a square rather than
   letterboxed — a photograph taken in portrait would otherwise sit in a tall
   frame with grey bars, which looks broken next to fetched covers.
--------------------------------------------------------------------------- */
const UPLOAD = (function () {
  const MAX_EDGE = 800;        // plenty for a sleeve on any screen
  const QUALITY = 0.82;        // visually indistinguishable from 1.0 at this size

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

  /* Centre-crops to a square and scales to MAX_EDGE. Returns bare base64, since
     that is what the upload endpoint expects. */
  async function compress(file) {
    const img = await loadImage(await readAsDataUrl(file));
    const edge = Math.min(img.width, img.height);
    const size = Math.min(MAX_EDGE, edge);

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img,
      Math.round((img.width - edge) / 2), Math.round((img.height - edge) / 2), edge, edge,
      0, 0, size, size);

    const dataUrl = canvas.toDataURL('image/jpeg', QUALITY);
    return {
      base64: dataUrl.replace(/^data:image\/[a-z]+;base64,/, ''),
      preview: dataUrl,
      originalBytes: file.size,
      compressedBytes: Math.round(dataUrl.length * 0.75)   // base64 is ~4/3 of the bytes
    };
  }

  function describeSize(bytes) {
    return bytes >= 1024 * 1024
      ? (bytes / (1024 * 1024)).toFixed(1) + 'MB'
      : Math.max(1, Math.round(bytes / 1024)) + 'KB';
  }

  return { compress, describeSize };
})();
