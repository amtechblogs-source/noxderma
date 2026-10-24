import { offlineDb, type PendingImageRecord } from "@/lib/offline/db";
import type { ProductImage } from "@/types";

export interface UploadOptions {
  productId: string;
  file: File;
  isPrimary?: boolean;
}

export interface ImageStorageProvider {
  name: string;
  upload(file: File, options?: { folder?: string; tags?: string[] }): Promise<ProductImage>;
  deleteImage(fileId: string): Promise<boolean>;
  getThumbnailUrl(url: string, width?: number, height?: number): string;
}

/**
 * Base URL of the external backend that serves /api/auth/imagekit.
 * Empty string = same-origin (not available on static Firebase Hosting).
 */
const apiBase = () => process.env.NEXT_PUBLIC_API_URL || "";

/**
 * ImageKit implementation using signed client-side uploads.
 * Private keys are NEVER exposed on the client. Tokens are fetched from /api/auth/imagekit.
 */
class ImageKitProvider implements ImageStorageProvider {
  name = "imagekit";
  private publicKey = process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY || "";
  private urlEndpoint = process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT || "https://ik.imagekit.io/h7g4dsggt";

  async upload(file: File, options?: { folder?: string; tags?: string[] }): Promise<ProductImage> {
    // 1. Fetch secure authentication parameters from trusted server route
    const authRes = await fetch(`${apiBase()}/api/auth/imagekit`);
    if (!authRes.ok) {
      throw new Error(`Failed to obtain upload authorization: ${authRes.statusText}`);
    }
    const { token, expire, signature } = await authRes.json();

    // 2. Prepare FormData for direct ImageKit upload
    const formData = new FormData();
    formData.append("file", file);
    formData.append("fileName", file.name);
    formData.append("publicKey", this.publicKey);
    formData.append("signature", signature);
    formData.append("expire", expire.toString());
    formData.append("token", token);
    formData.append("folder", options?.folder || "/products");
    if (options?.tags) {
      formData.append("tags", options.tags.join(","));
    }

    // 3. Upload to ImageKit API
    const uploadRes = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
      method: "POST",
      body: formData,
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.json().catch(() => ({ message: "Upload failed" }));
      throw new Error(err.message || "ImageKit upload failed");
    }

    const data = await uploadRes.json();

    return {
      id: data.fileId || `img_${Date.now()}`,
      url: data.url,
      provider: "imagekit",
      fileId: data.fileId,
      thumbnailUrl: data.thumbnailUrl || this.getThumbnailUrl(data.url, 200, 200),
      width: data.width,
      height: data.height,
      sizeBytes: data.size,
      isPrimary: false,
      uploadedAt: new Date().toISOString(),
    };
  }

  async deleteImage(fileId: string): Promise<boolean> {
    const res = await fetch(`${apiBase()}/api/auth/imagekit?fileId=${encodeURIComponent(fileId)}`, {
      method: "DELETE",
    });
    return res.ok;
  }

  getThumbnailUrl(url: string, width = 200, height = 200): string {
    if (!url.includes("ik.imagekit.io")) return url;
    // ImageKit URL transformation query or path: tr=w-200,h-200,cm-pad_resize
    return `${url}?tr=w-${width},h-${height},cm-pad_resize`;
  }
}

/**
 * ImageStorageService abstraction
 * Supports offline queueing into IndexedDB and graceful syncing
 */
export class ImageStorageService {
  private provider: ImageStorageProvider;

  constructor(provider?: ImageStorageProvider) {
    this.provider = provider || new ImageKitProvider();
  }

  public setProvider(newProvider: ImageStorageProvider) {
    this.provider = newProvider;
  }

  public getThumbnail(url: string, width = 200, height = 200): string {
    return this.provider.getThumbnailUrl(url, width, height);
  }

  /**
   * Saves an image either directly online or enqueues it offline in IndexedDB
   */
  public async saveProductImage(options: UploadOptions): Promise<ProductImage> {
    const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;

    // Convert file to Base64 data URL for local offline preview
    const dataUrl = await this.fileToDataUrl(options.file);

    if (!isOnline) {
      // Offline mode: Store locally in IndexedDB pendingImages table
      const pendingId = `pending_img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const pendingRecord: PendingImageRecord = {
        id: pendingId,
        productId: options.productId,
        blobDataUrl: dataUrl,
        fileName: options.file.name,
        mimeType: options.file.type,
        sizeBytes: options.file.size,
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      await offlineDb.pendingImages.add(pendingRecord);

      return {
        id: pendingId,
        url: dataUrl,
        provider: "local_blob",
        thumbnailUrl: dataUrl,
        sizeBytes: options.file.size,
        isPrimary: options.isPrimary ?? false,
        uploadedAt: new Date().toISOString(),
      };
    }

    try {
      const uploaded = await this.provider.upload(options.file, {
        folder: `/products/${options.productId}`,
        tags: [options.productId],
      });
      uploaded.isPrimary = options.isPrimary ?? false;
      return uploaded;
    } catch (error) {
      console.warn("Online image upload failed, falling back to offline pending queue:", error);
      const pendingId = `pending_img_${Date.now()}`;
      await offlineDb.pendingImages.add({
        id: pendingId,
        productId: options.productId,
        blobDataUrl: dataUrl,
        fileName: options.file.name,
        mimeType: options.file.type,
        sizeBytes: options.file.size,
        status: "failed",
        error: error instanceof Error ? error.message : "Upload failed",
        createdAt: new Date().toISOString(),
      });

      return {
        id: pendingId,
        url: dataUrl,
        provider: "local_blob",
        thumbnailUrl: dataUrl,
        sizeBytes: options.file.size,
        isPrimary: options.isPrimary ?? false,
        uploadedAt: new Date().toISOString(),
      };
    }
  }

  async uploadLogo(file: File, folder = "/logos"): Promise<string> {
    const uploaded = await this.provider.upload(file, { folder });
    return uploaded.url;
  }

  private fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
}

export const imageStorageService = new ImageStorageService();
export const imageStorage = imageStorageService;

