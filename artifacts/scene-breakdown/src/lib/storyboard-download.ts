import type { SceneFrame } from '@workspace/api-client-react';

const panelWidth = 640;
const panelHeight = 800;
const panelGap = 3;
const minColumns = 2;
const maxColumns = 6;

function computeColumns(count: number) {
  const ideal = Math.round(Math.sqrt(count * (panelHeight / panelWidth)));
  return Math.min(maxColumns, Math.max(minColumns, ideal));
}

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
  const columns = computeColumns(orderedScenes.length);
  const rows = Math.max(1, Math.ceil(orderedScenes.length / columns));
  const canvas = document.createElement('canvas');
  canvas.width = columns * panelWidth + (columns - 1) * panelGap;
  canvas.height = rows * panelHeight + (rows - 1) * panelGap;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('The storyboard image could not be created.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  for (const [position, scene] of orderedScenes.entries()) {
    const image = await loadImage(scene.imageUrl);
    const x = (position % columns) * (panelWidth + panelGap);
    const y = Math.floor(position / columns) * (panelHeight + panelGap);

    const scale = Math.max(panelWidth / image.naturalWidth, panelHeight / image.naturalHeight);
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    const drawX = x + (panelWidth - drawWidth) / 2;
    const drawY = y + (panelHeight - drawHeight) / 2;

    context.save();
    context.beginPath();
    context.rect(x, y, panelWidth, panelHeight);
    context.clip();
    context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
    context.restore();

    const badgeRadius = 26;
    const badgeCenterX = x + 34;
    const badgeCenterY = y + 34;
    context.beginPath();
    context.arc(badgeCenterX, badgeCenterY, badgeRadius, 0, Math.PI * 2);
    context.fillStyle = '#111111';
    context.fill();
    context.fillStyle = '#ffffff';
    context.font = '600 26px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(String(scene.index), badgeCenterX, badgeCenterY + 1);
  }

  downloadBlob(await canvasBlob(canvas), filename);
}