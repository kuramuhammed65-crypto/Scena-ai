import type { SceneFrame, VideoBreakdown } from '@workspace/api-client-react';

const databaseName = 'scene-breakdown';
const storeName = 'saved-breakdowns';
const databaseVersion = 1;

type SavedBreakdownRecord = {
  id: string;
  breakdown: VideoBreakdown;
  scenes: Array<{ scene: SceneFrame; image: Blob }>;
  storyboard: Blob;
  framesZip: Blob;
  savedAt: number;
};

export type SavedBreakdown = VideoBreakdown & {
  storyboardUrl: string;
  framesZipUrl: string;
  savedAt: number;
};

export type SavedBreakdownSummary = {
  id: string;
  filename: string;
  duration: number;
  sceneCount: number;
  savedAt: number;
};

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('Saved breakdowns are not supported in this browser.'));
      return;
    }

    const request = window.indexedDB.open(databaseName, databaseVersion);
    request.onerror = () => reject(request.error ?? new Error('Could not open saved breakdown storage.'));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(storeName)) {
        database.createObjectStore(storeName, { keyPath: 'id' });
      }
    };
  });
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onerror = () => reject(request.error ?? new Error('Saved breakdown storage failed.'));
    request.onsuccess = () => resolve(request.result);
  });
}

function transactionComplete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Saved breakdown storage failed.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Saved breakdown storage was aborted.'));
  });
}

async function fetchBlob(url: string, description: string) {
  const response = await fetch(new URL(url, window.location.origin));
  if (!response.ok) {
    throw new Error(`The ${description} could not be saved.`);
  }
  return response.blob();
}

export async function saveBreakdown(breakdown: VideoBreakdown) {
  const [scenes, storyboard, framesZip] = await Promise.all([
    Promise.all(
      breakdown.scenes.map(async (scene) => ({
        scene,
        image: await fetchBlob(scene.imageUrl, 'scene images'),
      })),
    ),
    fetchBlob(`/api/videos/${breakdown.id}/storyboard.jpg`, 'storyboard'),
    fetchBlob(`/api/videos/${breakdown.id}/frames.zip`, 'frame archive'),
  ]);

  const database = await openDatabase();
  try {
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put({
      id: breakdown.id,
      breakdown,
      scenes,
      storyboard,
      framesZip,
      savedAt: Date.now(),
    } satisfies SavedBreakdownRecord);
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}

export async function listSavedBreakdowns(): Promise<SavedBreakdownSummary[]> {
  const database = await openDatabase();
  try {
    const records = await requestResult<SavedBreakdownRecord[]>(
      database.transaction(storeName, 'readonly').objectStore(storeName).getAll(),
    );
    return records
      .sort((left, right) => right.savedAt - left.savedAt)
      .map(({ id, breakdown, savedAt }) => ({
        id,
        filename: breakdown.filename,
        duration: breakdown.duration,
        sceneCount: breakdown.scenes.length,
        savedAt,
      }));
  } finally {
    database.close();
  }
}

export async function loadSavedBreakdown(id: string): Promise<SavedBreakdown | null> {
  const database = await openDatabase();
  try {
    const record = await requestResult<SavedBreakdownRecord | undefined>(
      database.transaction(storeName, 'readonly').objectStore(storeName).get(id),
    );
    if (!record) return null;

    const sceneUrls = record.scenes.map(({ scene, image }) => ({
      ...scene,
      imageUrl: URL.createObjectURL(image),
    }));
    return {
      ...record.breakdown,
      originalVideoUrl: '',
      scenes: sceneUrls,
      storyboardUrl: URL.createObjectURL(record.storyboard),
      framesZipUrl: URL.createObjectURL(record.framesZip),
      savedAt: record.savedAt,
    };
  } finally {
    database.close();
  }
}

export async function isBreakdownSaved(id: string) {
  const database = await openDatabase();
  try {
    const record = await requestResult<SavedBreakdownRecord | undefined>(
      database.transaction(storeName, 'readonly').objectStore(storeName).get(id),
    );
    return Boolean(record);
  } finally {
    database.close();
  }
}

export async function deleteSavedBreakdown(id: string) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).delete(id);
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}

export function releaseSavedBreakdown(breakdown: SavedBreakdown) {
  breakdown.scenes.forEach((scene) => URL.revokeObjectURL(scene.imageUrl));
  URL.revokeObjectURL(breakdown.storyboardUrl);
  URL.revokeObjectURL(breakdown.framesZipUrl);
}