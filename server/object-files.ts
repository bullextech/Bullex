import path from "path";
import type { Response } from "express";
import { objectStorageClient } from "./replit_integrations/object_storage";

// Resolves the persistent Object Storage bucket + key prefix from PRIVATE_OBJECT_DIR
// (format: "/<bucket>/.private"). Uploaded user files live under
// "<prefix>/uploads/<category>/<storedName>" so they survive deploys & instance recycles.
function getPrivateBucketAndPrefix(): { bucketName: string; prefix: string } {
  const dir = process.env.PRIVATE_OBJECT_DIR || "";
  if (!dir) {
    throw new Error(
      "PRIVATE_OBJECT_DIR not set. Object Storage must be configured for file uploads.",
    );
  }
  const parts = dir.replace(/^\/+/, "").split("/").filter(Boolean);
  const bucketName = parts[0];
  if (!bucketName) {
    throw new Error(
      `PRIVATE_OBJECT_DIR is malformed ("${dir}"); expected "/<bucket>/.private".`,
    );
  }
  const prefix = parts.slice(1).join("/");
  return { bucketName, prefix };
}

function objectKey(category: string, storedName: string): string {
  const { prefix } = getPrivateBucketAndPrefix();
  return [prefix, "uploads", category, storedName].filter(Boolean).join("/");
}

function getObjectFile(category: string, storedName: string) {
  const { bucketName } = getPrivateBucketAndPrefix();
  return objectStorageClient.bucket(bucketName).file(objectKey(category, storedName));
}

// Generates a unique stored name preserving the original extension.
export function genStoredName(prefix: string, originalName: string): string {
  const ext = path.extname(originalName).toLowerCase() || ".bin";
  const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
  return `${prefix}-${uniqueSuffix}${ext}`;
}

interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

const EXT_TO_MIME: Record<string, string> = {
  ".pdf":  "application/pdf",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png":  "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".doc":  "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls":  "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/**
 * Returns a safe, server-derived MIME type based on the file extension.
 * Never trusts the client-supplied Content-Type.
 */
export function safeContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return EXT_TO_MIME[ext] ?? "application/octet-stream";
}

// Saves an in-memory uploaded file to Object Storage. Returns the generated storedName.
// The content-type stored in the bucket is derived from the filename extension,
// not from the client-supplied mimetype, to prevent stored-XSS via MIME spoofing.
export async function saveUpload(
  category: string,
  prefix: string,
  file: UploadedFile,
): Promise<string> {
  const storedName = genStoredName(prefix, file.originalname);
  const contentType = safeContentType(file.originalname);
  await getObjectFile(category, storedName).save(file.buffer, {
    contentType,
    resumable: false,
  });
  return storedName;
}

export async function objectExists(category: string, storedName: string): Promise<boolean> {
  const [exists] = await getObjectFile(category, storedName).exists();
  return exists;
}

export async function deleteObject(category: string, storedName: string): Promise<void> {
  try {
    await getObjectFile(category, storedName).delete({ ignoreNotFound: true });
  } catch {
    // Best-effort cleanup; ignore failures.
  }
}

export async function getObjectBuffer(
  category: string,
  storedName: string,
): Promise<Buffer> {
  const [buf] = await getObjectFile(category, storedName).download();
  return buf;
}

interface StreamOptions {
  contentType?: string;
  cacheControl?: string;
  // When provided, sets Content-Disposition with the given (original) filename.
  downloadName?: string;
  inline?: boolean;
}

// Streams a stored object to the response. Sends a 404 JSON body if missing.
export async function streamObject(
  category: string,
  storedName: string,
  res: Response,
  opts: StreamOptions = {},
): Promise<void> {
  const file = getObjectFile(category, storedName);
  const [exists] = await file.exists();
  if (!exists) {
    res.status(404).json({ message: "File not found" });
    return;
  }
  if (opts.downloadName) {
    const safeName = opts.downloadName.replace(/"/g, "");
    const disposition = opts.inline ? "inline" : "attachment";
    res.setHeader("Content-Disposition", `${disposition}; filename="${safeName}"`);
  }
  if (opts.contentType) res.setHeader("Content-Type", opts.contentType);
  if (opts.cacheControl) res.setHeader("Cache-Control", opts.cacheControl);

  await new Promise<void>((resolve) => {
    file
      .createReadStream()
      .on("error", (err) => {
        // Once piping has begun headers are already flushed, so we cannot send a
        // JSON error body. Destroy the socket and resolve so callers don't try to
        // write a second (conflicting) response.
        if (!res.headersSent) {
          res.status(500).json({ message: "Failed to read file" });
        } else {
          res.destroy(err);
        }
        resolve();
      })
      .on("end", resolve)
      .pipe(res);
  });
}
