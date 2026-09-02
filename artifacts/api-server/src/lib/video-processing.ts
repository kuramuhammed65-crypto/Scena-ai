import { randomUUID } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

export type SceneFrame = {
  id: string;
  index: number;
  timestamp: number;
  timestampLabel: string;
  imageUrl: string;
  filename?: string;
};

export type VideoBreakdown = {
  id: string;
  filename: string;
  duration: number;
  width: number;
  height: number;
  originalVideoUrl: string;
  scenes: SceneFrame[];
};

export type StoredBreakdown = VideoBreakdown & {
  directory: string;
  originalPath: string;
  zipPath: string;
  storyboardPath: string;
};

const storageRoot = path.join(os.tmpdir(), "scene-breakdown");
const allowedExtensions = new Set([".mp4", ".mov", ".webm"]);

function formatTimestamp(seconds: number) {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(wholeSeconds / 60);
  const remainingSeconds = wholeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function getExtension(filename: string) {
  const extension = path.extname(filename).toLowerCase();
  if (!allowedExtensions.has(extension)) {
    throw new Error("Unsupported video format. Please upload an MP4, MOV, or WebM file.");
  }
  return extension;
}

function parseMultipart(contentType: string | undefined, body: Buffer) {
  const match = contentType?.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!match) {
    throw new Error("Upload must use multipart form data.");
  }

  const boundary = Buffer.from(`--${match[1] ?? match[2]}`);
  const headerEnd = Buffer.from("\r\n\r\n");
  let cursor = 0;

  while (cursor < body.length) {
    const boundaryIndex = body.indexOf(boundary, cursor);
    if (boundaryIndex < 0) break;
    const partStart = boundaryIndex + boundary.length;
    if (body.subarray(partStart, partStart + 2).toString() === "--") break;

    const contentStart = partStart + 2;
    const headerIndex = body.indexOf(headerEnd, contentStart);
    if (headerIndex < 0) break;

    const headers = body.subarray(contentStart, headerIndex).toString("utf8");
    const dataStart = headerIndex + headerEnd.length;
    const nextBoundary = body.indexOf(boundary, dataStart);
    if (nextBoundary < 0) break;
    const dataEnd = Math.max(dataStart, nextBoundary - 2);

    const disposition = headers.match(/content-disposition:\s*([^\r\n]+)/i)?.[1] ?? "";
    const fieldName = disposition.match(/name="([^"]+)"/i)?.[1];
    if (fieldName === "video") {
      const filename = disposition.match(/filename="([^"]*)"/i)?.[1] || "video.mp4";
      return { filename: path.basename(filename), data: body.subarray(dataStart, dataEnd) };
    }
    cursor = nextBoundary;
  }

  throw new Error("No video file was found in the upload.");
}

async function probeVideo(inputPath: string) {
  const { stdout } = await execFile(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height,duration:format=duration",
      "-of",
      "json",
      inputPath,
    ],
    { maxBuffer: 2 * 1024 * 1024 },
  );
  const parsed = JSON.parse(stdout) as {
    streams?: Array<{ width?: number; height?: number; duration?: string }>;
    format?: { duration?: string };
  };
  const stream = parsed.streams?.[0];
  const duration = Number(stream?.duration ?? parsed.format?.duration ?? 0);
  if (!stream?.width || !stream.height || !Number.isFinite(duration) || duration <= 0) {
    throw new Error("This video could not be read.");
  }
  return { width: stream.width, height: stream.height, duration };
}

async function findSceneChanges(inputPath: string, duration: number) {
  let stderr = "";
  try {
    const result = await execFile(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "info",
        "-i",
        inputPath,
        "-filter:v",
        "select='gt(scene,0.30)',showinfo",
        "-an",
        "-f",
        "null",
        "-",
      ],
      { maxBuffer: 20 * 1024 * 1024 },
    );
    stderr = result.stderr;
  } catch (error) {
    const commandError = error as { stderr?: string };
    stderr = commandError.stderr ?? "";
    if (!stderr.includes("showinfo")) {
      throw new Error("Scene detection failed for this video.");
    }
  }

  const detected = [...stderr.matchAll(/pts_time:([0-9]+(?:\.[0-9]+)?)/g)]
    .map((match) => Number(match[1]))
    .filter((time) => Number.isFinite(time) && time > 0.65 && time < duration - 0.25);

  const changes: number[] = [];
  for (const time of detected) {
    if (!changes.length || time - changes[changes.length - 1] > 0.8) {
      changes.push(time);
    }
  }
  return changes;
}

async function extractFrame(inputPath: string, outputPath: string, timestamp: number) {
  await execFile(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      inputPath,
      "-ss",
      String(timestamp),
      "-frames:v",
      "1",
      "-q:v",
      "2",
      "-y",
      outputPath,
    ],
    { maxBuffer: 2 * 1024 * 1024 },
  );
}

async function createStoryboard(directory: string, sceneCount: number, outputPath: string) {
  const columns = Math.min(3, sceneCount);
  const rows = Math.max(1, Math.ceil(sceneCount / columns));
  await execFile(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-pattern_type",
      "glob",
      "-i",
      path.join(directory, "scene-*.jpg"),
      "-vf",
      `scale=480:-2,tile=${columns}x${rows}:padding=24:margin=24`,
      "-frames:v",
      "1",
      "-q:v",
      "2",
      "-y",
      outputPath,
    ],
    { maxBuffer: 2 * 1024 * 1024 },
  );
}

async function createZip(directory: string, zipPath: string) {
  const { readdir } = await import("node:fs/promises");
  const frameFiles = (await readdir(directory))
    .filter((filename) => filename.startsWith("scene-") && filename.endsWith(".jpg"))
    .sort();
  await execFile("zip", ["-j", "-q", zipPath, ...frameFiles], {
    cwd: directory,
    maxBuffer: 2 * 1024 * 1024,
  });
}

export async function processVideoUpload(contentType: string | undefined, body: Buffer) {
  const upload = parseMultipart(contentType, body);
  const extension = getExtension(upload.filename);
  const id = randomUUID();
  const directory = path.join(storageRoot, id);
  const originalPath = path.join(directory, `original${extension}`);
  await mkdir(directory, { recursive: true });
  await writeFile(originalPath, upload.data);

  try {
    const metadata = await probeVideo(originalPath);
    const changes = await findSceneChanges(originalPath, metadata.duration);
    const starts = [0, ...changes];
    const scenes: SceneFrame[] = [];

    for (let index = 0; index < starts.length; index += 1) {
      const start = starts[index];
      const nextStart = starts[index + 1] ?? metadata.duration;
      const segmentLength = Math.max(0.25, nextStart - start);
      const timestamp = Math.min(
        metadata.duration - 0.05,
        start + Math.min(1.2, Math.max(0.45, segmentLength * 0.35)),
      );
      const filename = `scene-${index + 1}.jpg`;
      await extractFrame(originalPath, path.join(directory, filename), timestamp);
      scenes.push({
        id: `${id}-${index + 1}`,
        index: index + 1,
        timestamp,
        timestampLabel: formatTimestamp(timestamp),
        imageUrl: `/api/videos/${id}/frames/${filename}`,
        filename,
      });
    }

    const storyboardPath = path.join(directory, "storyboard.jpg");
    const zipPath = path.join(directory, "frames.zip");
    await createStoryboard(directory, scenes.length, storyboardPath);
    await createZip(directory, zipPath);

    const stored: StoredBreakdown = {
      id,
      filename: upload.filename,
      duration: metadata.duration,
      width: metadata.width,
      height: metadata.height,
      originalVideoUrl: `/api/videos/${id}/original`,
      scenes,
      directory,
      originalPath,
      zipPath,
      storyboardPath,
    };
    return stored;
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

export function getFilePath(breakdown: StoredBreakdown, filename: string) {
  return path.join(breakdown.directory, filename);
}
