import { Router, type IRouter, type Request, type Response } from "express";
import { GetVideoBreakdownParams, ProcessVideoResponse } from "@workspace/api-zod";
import {
  getFilePath,
  processVideoUpload,
  type StoredBreakdown,
} from "../lib/video-processing";

const router: IRouter = Router();
const breakdowns = new Map<string, StoredBreakdown>();

function getBreakdown(videoId: string, res: Response) {
  const breakdown = breakdowns.get(videoId);
  if (!breakdown) {
    res.status(404).json({ error: "Breakdown not found." });
    return null;
  }
  return breakdown;
}

router.post("/videos/process", async (req: Request, res: Response) => {
  try {
    const body = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let total = 0;
      const limit = 250 * 1024 * 1024;
      req.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += buffer.length;
        if (total > limit) {
          reject(new Error("Video is too large. Please upload a file under 250 MB."));
          req.destroy();
          return;
        }
        chunks.push(buffer);
      });
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", reject);
    });
    const breakdown = await processVideoUpload(req.headers["content-type"], body);
    breakdowns.set(breakdown.id, breakdown);
    res.json(ProcessVideoResponse.parse(breakdown));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Video processing failed.";
    req.log?.warn({ err: error }, "Video processing failed");
    res.status(message.startsWith("Unsupported") || message.startsWith("Upload") || message.startsWith("No video") ? 400 : 422).json({ error: message });
  }
});

router.get("/videos/:videoId", (req, res) => {
  const parsed = GetVideoBreakdownParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid video id." });
    return;
  }
  const breakdown = getBreakdown(parsed.data.videoId, res);
  if (!breakdown) return;
  res.json(ProcessVideoResponse.parse(breakdown));
});

router.get("/videos/:videoId/original", (req, res) => {
  const breakdown = getBreakdown(req.params.videoId, res);
  if (!breakdown) return;
  res.sendFile(breakdown.originalPath);
});

router.get("/videos/:videoId/frames/:filename", (req, res) => {
  const breakdown = getBreakdown(req.params.videoId, res);
  if (!breakdown) return;
  const scene = breakdown.scenes.find((candidate) => candidate.filename === req.params.filename);
  if (!scene || !req.params.filename.startsWith("scene-") || !req.params.filename.endsWith(".jpg")) {
    res.status(404).json({ error: "Frame not found." });
    return;
  }
  res.sendFile(getFilePath(breakdown, req.params.filename));
});

router.get("/videos/:videoId/frames.zip", (req, res) => {
  const breakdown = getBreakdown(req.params.videoId, res);
  if (!breakdown) return;
  res.download(breakdown.zipPath, `${breakdown.filename.replace(/\.[^.]+$/, "")}-frames.zip`);
});

router.get("/videos/:videoId/storyboard.jpg", (req, res) => {
  const breakdown = getBreakdown(req.params.videoId, res);
  if (!breakdown) return;
  res.download(breakdown.storyboardPath, `${breakdown.filename.replace(/\.[^.]+$/, "")}-storyboard.jpg`);
});

export default router;