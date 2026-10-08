/**
 * Sharing a picture from Photo Mode.
 *
 *  - CapacitorShare (iOS / Android): the JPEG is written to the app's cache (`Directory.Cache`, folder `photos/`, the
 *    previous shot removed first) with @capacitor/filesystem, then handed to the OS share sheet with @capacitor/share
 *    (`files: [file://…]`). Android shares the cache file through the app's FileProvider
 *    (`${applicationId}.fileprovider`, `res/xml/file_paths.xml` has `<cache-path path=".">`). No permission is needed
 *    on either platform. Both plugins are imported lazily, only inside the native shell.
 *  - WebShare: the Web Share API with a File when the browser can share files (`navigator.canShare`), else nothing;
 *    `download()` saves through an `<a download>` link. `shareImage` must be called straight from the tap (the
 *    browser wants user activation), so nothing here awaits before `navigator.share`.
 *
 * Nothing throws: a closed sheet is 'cancelled', anything else that goes wrong 'failed' (logged).
 * OWNER: meta agent (platform). Tests: tests/platform.share.test.ts.
 */
import type { ShareImage, ShareResult, ShareService } from './types';

/** Cache sub-folder for shared photos (emptied before each new one, so the cache never grows). */
export const PHOTO_CACHE_DIR = 'photos';

/** A rejection that only means the player closed the sheet (Capacitor: "Share canceled"; web: AbortError). */
export function isShareCancel(e: unknown): boolean {
  const err = e as { name?: unknown; message?: unknown; code?: unknown } | null | undefined;
  if (!err) return false;
  if (err.name === 'AbortError') return true;
  return /cancel/i.test(String(err.message ?? err)) || /cancel/i.test(String(err.code ?? ''));
}

/** Base64 (no data: prefix) of a blob, in chunks (a 2 MB photo would overflow `String.fromCharCode(...all)`). */
export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const CHUNK = 0x8000;
  let s = '';
  for (let i = 0; i < bytes.length; i += CHUNK) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[]);
  return btoa(s);
}

// ================================================================================================ native

type FsModule = typeof import('@capacitor/filesystem');
type ShareModule = typeof import('@capacitor/share');

export class CapacitorShare implements ShareService {
  readonly native = true;
  private fs: Promise<FsModule> | null = null;
  private sh: Promise<ShareModule> | null = null;

  canShareFiles(): boolean {
    return true;
  }

  async shareImage(img: ShareImage): Promise<ShareResult> {
    let uri: string;
    try {
      this.fs ??= import('@capacitor/filesystem');
      const { Filesystem, Directory } = await this.fs;
      const data = await blobToBase64(img.blob);
      // one photo at a time in the cache: the previous shot (already shared or abandoned) goes first
      await Filesystem.rmdir({ path: PHOTO_CACHE_DIR, directory: Directory.Cache, recursive: true }).catch(() => undefined);
      ({ uri } = await Filesystem.writeFile({ path: `${PHOTO_CACHE_DIR}/${img.fileName}`, data, directory: Directory.Cache, recursive: true }));
    } catch (e) {
      console.warn('[share] could not write the photo', e);
      return 'failed';
    }
    try {
      this.sh ??= import('@capacitor/share');
      const { Share } = await this.sh;
      await Share.share({ title: img.title, text: img.text, files: [uri], dialogTitle: img.dialogTitle ?? img.title });
      return 'shared';
    } catch (e) {
      if (isShareCancel(e)) return 'cancelled';
      console.warn('[share] share sheet failed', e);
      return 'failed';
    }
  }

  async download(): Promise<ShareResult> {
    return 'unavailable'; // the share sheet has "Save image" / "Save to Photos"
  }
}

// ================================================================================================ web

interface ShareNavigator {
  canShare?: (data: { files?: File[] }) => boolean;
  share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
}

function toFile(img: ShareImage): File | null {
  try {
    return new File([img.blob], img.fileName, { type: img.blob.type || 'image/jpeg' });
  } catch {
    return null; // very old WebViews: no File constructor
  }
}

export class WebShare implements ShareService {
  readonly native = false;

  constructor(
    private readonly nav: ShareNavigator | undefined = typeof navigator !== 'undefined' ? (navigator as unknown as ShareNavigator) : undefined,
    private readonly doc: Document | undefined = typeof document !== 'undefined' ? document : undefined,
  ) {}

  canShareFiles(): boolean {
    const nav = this.nav;
    if (!nav || typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false;
    try {
      const probe = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'probe.jpg', { type: 'image/jpeg' });
      return !!nav.canShare({ files: [probe] });
    } catch {
      return false;
    }
  }

  async shareImage(img: ShareImage): Promise<ShareResult> {
    const nav = this.nav;
    const file = toFile(img);
    if (!nav || !file || typeof nav.share !== 'function') return 'unavailable';
    try {
      if (typeof nav.canShare === 'function' && !nav.canShare({ files: [file] })) return 'unavailable';
      await nav.share({ files: [file], title: img.title, text: img.text });
      return 'shared';
    } catch (e) {
      if (isShareCancel(e)) return 'cancelled';
      console.warn('[share] web share failed', e);
      return 'failed';
    }
  }

  async download(img: ShareImage): Promise<ShareResult> {
    const doc = this.doc;
    if (!doc || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return 'unavailable';
    try {
      const url = URL.createObjectURL(img.blob);
      const a = doc.createElement('a');
      a.href = url;
      a.download = img.fileName;
      a.rel = 'noopener';
      a.style.display = 'none';
      doc.body.appendChild(a);
      a.click();
      a.remove();
      // the download has its own copy once it started; keep the URL a while for slow browsers
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return 'downloaded';
    } catch (e) {
      console.warn('[share] download failed', e);
      return 'failed';
    }
  }
}

/** Tests / platforms without sharing: nothing to offer. */
export class NoopShare implements ShareService {
  readonly native = false;
  canShareFiles(): boolean {
    return false;
  }
  async shareImage(): Promise<ShareResult> {
    return 'unavailable';
  }
  async download(): Promise<ShareResult> {
    return 'unavailable';
  }
}
