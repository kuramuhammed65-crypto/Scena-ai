import type { SceneFrame } from '@workspace/api-client-react';

const columns = 3;
const panelWidth = 640;
const panelHeight = 360;
const outerMargin = 32;
const panelGap = 24;
const panelBorder = 2;

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('A scene image could not be added to the storyboard.'));
    image.src = new URL(url, window.location.origin).toString();
  });
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('The storyboard image could not be created.'));
    }, 'image/png');
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

export async function downloadContactSheet(scenes: SceneFrame[], filename: string) {
  const orderedScenes = [...scenes].sort((left, right) => left.index - right.index);
  const rows = Math.max(1, Math.ceil(orderedScenes.length / columns));
  const canvas = document.createElement('canvas');
  canvas.width = outerMargin * 2 + columns * panelWidth + (columns - 1) * panelGap;
  canvas.height = outerMargin * 2 + rows * panelHeight + (rows - 1) * panelGap;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('The storyboard image could not be created.');
  context.fillStyle = '#0d0b12';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  for (const [position, scene] of orderedScenes.entries()) {
    const image = await loadImage(scene.imageUrl);
    const x = outerMargin + (position % columns) * (panelWidth + panelGap);
    const y = outerMargin + Math.floor(position / columns) * (panelHeight + panelGap);
    const imageBoxWidth = panelWidth - panelBorder * 2;
    const imageBoxHeight = panelHeight - panelBorder * 2;
    const scale = Math.min(imageBoxWidth / image.naturalWidth, imageBoxHeight / image.naturalHeight);
    const imageWidth = image.naturalWidth * scale;
    const imageHeight = image.naturalHeight * scale;

    context.fillStyle = '#27222f';
    context.fillRect(x, y, panelWidth, panelHeight);
    context.drawImage(
      image,
      x + panelBorder + (imageBoxWidth - imageWidth) / 2,
      y + panelBorder + (imageBoxHeight - imageHeight) / 2,
      imageWidth,
      imageHeight,
    );
    context.strokeStyle = '#b9f238';
    context.lineWidth = panelBorder;
    context.strokeRect(x + panelBorder / 2, y + panelBorder / 2, panelWidth - panelBorder, panelHeight - panelBorder);
    context.fillStyle = 'rgba(13, 11, 18, .86)';
    context.fillRect(x + 14, y + 14, 32, 24);
    context.fillStyle = '#f5f2e9';
    context.font = '600 16px monospace';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(String(scene.index), x + 30, y + 26);
  }

  downloadBlob(await canvasBlob(canvas), filename);
}