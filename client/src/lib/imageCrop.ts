export async function centerCropToAspectRatioDataUrl(
  imageUrl: string,
  targetWidth: number = 16,
  targetHeight: number = 9,
): Promise<string> {
  const source = String(imageUrl || "").trim();
  if (!source || typeof window === "undefined") return source;

  const img = await loadImage(source).catch(() => null);
  if (!img) return source;

  const srcW = Math.max(1, img.naturalWidth || img.width || 1);
  const srcH = Math.max(1, img.naturalHeight || img.height || 1);
  const srcRatio = srcW / srcH;
  const targetRatio = Math.max(0.01, targetWidth / Math.max(1, targetHeight));

  if (Math.abs(srcRatio - targetRatio) <= 0.01) {
    return source;
  }

  let cropX = 0;
  let cropY = 0;
  let cropW = srcW;
  let cropH = srcH;

  if (srcRatio > targetRatio) {
    cropW = Math.max(1, Math.floor(srcH * targetRatio));
    cropX = Math.floor((srcW - cropW) / 2);
  } else {
    cropH = Math.max(1, Math.floor(srcW / targetRatio));
    cropY = Math.floor((srcH - cropH) / 2);
  }

  const canvas = document.createElement("canvas");
  canvas.width = cropW;
  canvas.height = cropH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return source;

  ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  try {
    return canvas.toDataURL("image/png");
  } catch {
    return source;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (/^https?:\/\//i.test(src)) {
      image.crossOrigin = "anonymous";
    }
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image load failed"));
    image.src = src;
  });
}
