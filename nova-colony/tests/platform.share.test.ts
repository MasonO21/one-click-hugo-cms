/**
 * Photo Mode sharing (src/platform/share.ts) without a device: the native adapter writes the JPEG to the app cache
 * and opens the share sheet with that file (a closed sheet is not an error), the web adapter uses the Web Share API
 * only when the browser can share files and falls back to a download link; nothing ever throws. Plus the platform
 * factory's pick and the analytics events.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const cap = vi.hoisted(() => ({
  files: new Map<string, string>(),
  removed: [] as string[],
  shared: [] as { title?: string; text?: string; files?: string[]; dialogTitle?: string }[],
  shareFail: { current: '' as string },
  writeFail: { current: false },
}));

vi.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE' },
  Filesystem: {
    rmdir: vi.fn(async ({ path }: { path: string }) => {
      cap.removed.push(path);
      for (const k of [...cap.files.keys()]) if (k.startsWith(path + '/')) cap.files.delete(k);
    }),
    writeFile: vi.fn(async ({ path, data, directory }: { path: string; data: string; directory: string }) => {
      if (cap.writeFail.current) throw new Error('disk full');
      cap.files.set(path, data);
      return { uri: `file:///data/user/0/com.novacolony.game/cache/${path}`, directory };
    }),
  },
}));
vi.mock('@capacitor/share', () => ({
  Share: {
    share: vi.fn(async (opts: { title?: string; text?: string; files?: string[]; dialogTitle?: string }) => {
      if (cap.shareFail.current) throw new Error(cap.shareFail.current);
      cap.shared.push(opts);
      return { activityType: 'com.example.chat' };
    }),
  },
}));

import { Filesystem } from '@capacitor/filesystem';
import { CapacitorShare, NoopShare, PHOTO_CACHE_DIR, WebShare, blobToBase64, isShareCancel } from '../src/platform/share';
import type { ShareImage } from '../src/platform/types';
import { createMockServices } from '../src/platform/mock';
import { installAnalyticsHooks } from '../src/platform/analyticsHooks';
import { Game } from '../src/core/Game';

const jpeg = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 250])], { type: 'image/jpeg' });
const img = (over: Partial<ShareImage> = {}): ShareImage => ({ blob: jpeg(), fileName: 'nova-colony-new-hope-day-3.jpg', title: 'New Hope · Nova Colony', text: 'My colony on Nova Colony 🌱', dialogTitle: 'Share your photo', ...over });

beforeEach(() => {
  cap.files.clear();
  cap.removed.length = 0;
  cap.shared.length = 0;
  cap.shareFail.current = '';
  cap.writeFail.current = false;
  vi.mocked(Filesystem.writeFile).mockClear();
});

describe('share helpers', () => {
  it('base64 of a blob (chunked, any size)', async () => {
    expect(await blobToBase64(jpeg())).toBe(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 250]).toString('base64'));
    const big = new Uint8Array(200_000).map((_, i) => i % 251);
    expect(await blobToBase64(new Blob([big]))).toBe(Buffer.from(big).toString('base64'));
  });

  it('knows a closed sheet from a failure', () => {
    expect(isShareCancel(new Error('Share canceled'))).toBe(true);
    expect(isShareCancel(Object.assign(new Error('x'), { name: 'AbortError' }))).toBe(true);
    expect(isShareCancel(new Error('disk full'))).toBe(false);
    expect(isShareCancel(null)).toBe(false);
  });
});

describe('native share (iOS / Android)', () => {
  it('writes the photo to the app cache and shares that file with title and text', async () => {
    const s = new CapacitorShare();
    expect(s.native).toBe(true);
    expect(s.canShareFiles()).toBe(true);
    expect(await s.shareImage(img())).toBe('shared');
    const path = `${PHOTO_CACHE_DIR}/nova-colony-new-hope-day-3.jpg`;
    expect(cap.files.get(path)).toBe(await blobToBase64(jpeg()));
    expect(vi.mocked(Filesystem.writeFile).mock.calls[0][0]).toMatchObject({ directory: 'CACHE', recursive: true });
    expect(cap.shared).toEqual([{ title: 'New Hope · Nova Colony', text: 'My colony on Nova Colony 🌱', files: [`file:///data/user/0/com.novacolony.game/cache/${path}`], dialogTitle: 'Share your photo' }]);
  });

  it('keeps one photo in the cache: the previous one is removed first', async () => {
    const s = new CapacitorShare();
    await s.shareImage(img({ fileName: 'a.jpg' }));
    await s.shareImage(img({ fileName: 'b.jpg' }));
    expect(cap.removed).toEqual([PHOTO_CACHE_DIR, PHOTO_CACHE_DIR]);
    expect([...cap.files.keys()]).toEqual([`${PHOTO_CACHE_DIR}/b.jpg`]);
  });

  it('a closed sheet is "cancelled", a broken one "failed", and nothing throws', async () => {
    const s = new CapacitorShare();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    cap.shareFail.current = 'Share canceled';
    expect(await s.shareImage(img())).toBe('cancelled');
    cap.shareFail.current = 'No Activity found';
    expect(await s.shareImage(img())).toBe('failed');
    cap.shareFail.current = '';
    cap.writeFail.current = true;
    expect(await s.shareImage(img())).toBe('failed');
    warn.mockRestore();
  });

  it('offers no download (the share sheet saves to the gallery)', async () => {
    expect(await new CapacitorShare().download()).toBe('unavailable');
  });
});

describe('web share', () => {
  it('uses the Web Share API with the file when the browser can share files', async () => {
    const calls: { files?: File[]; title?: string; text?: string }[] = [];
    const nav = { canShare: (d: { files?: File[] }) => !!d.files?.length, share: async (d: { files?: File[]; title?: string; text?: string }) => void calls.push(d) };
    const s = new WebShare(nav);
    expect(s.native).toBe(false);
    expect(s.canShareFiles()).toBe(true);
    expect(await s.shareImage(img())).toBe('shared');
    expect(calls).toHaveLength(1);
    expect(calls[0].files![0].name).toBe('nova-colony-new-hope-day-3.jpg');
    expect(calls[0].files![0].type).toBe('image/jpeg');
    expect(calls[0].text).toBe('My colony on Nova Colony 🌱');
  });

  it('calls navigator.share synchronously from the tap (user activation)', () => {
    let called = false;
    const s = new WebShare({ canShare: () => true, share: () => ((called = true), new Promise<void>(() => undefined)) });
    void s.shareImage(img());
    expect(called).toBe(true);
  });

  it('no file sharing (desktop browsers, old WebViews): unavailable, and the download link works', async () => {
    expect(new WebShare(undefined).canShareFiles()).toBe(false);
    expect(new WebShare({}).canShareFiles()).toBe(false);
    expect(new WebShare({ canShare: () => false, share: async () => undefined }).canShareFiles()).toBe(false);
    expect(await new WebShare({ canShare: () => false, share: async () => undefined }).shareImage(img())).toBe('unavailable');
    expect(await new WebShare(undefined, undefined).download(img())).toBe('unavailable');
  });

  it('a dismissed browser sheet is "cancelled"', async () => {
    const abort = Object.assign(new Error('Share canceled'), { name: 'AbortError' });
    const s = new WebShare({ canShare: () => true, share: async () => Promise.reject(abort) });
    expect(await s.shareImage(img())).toBe('cancelled');
  });

  it('download: an <a download> with the file name, clicked and removed', async () => {
    const clicked: { href: string; download: string }[] = [];
    const body = { appendChild: vi.fn(), children: [] as unknown[] };
    const doc = {
      body,
      createElement: () => {
        const a = { href: '', download: '', rel: '', style: {} as Record<string, string>, click: () => clicked.push({ href: a.href, download: a.download }), remove: vi.fn() };
        return a;
      },
    } as unknown as Document;
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:photo-1');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.useFakeTimers();
    expect(await new WebShare(undefined, doc).download(img())).toBe('downloaded');
    expect(clicked).toEqual([{ href: 'blob:photo-1', download: 'nova-colony-new-hope-day-3.jpg' }]);
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith('blob:photo-1');
    vi.useRealTimers();
    create.mockRestore();
    revoke.mockRestore();
  });

  it('the test / fallback services offer nothing', async () => {
    const s = createMockServices().share!;
    expect(s.canShareFiles()).toBe(false);
    expect(await s.shareImage(img())).toBe('unavailable');
    expect(await new NoopShare().download()).toBe('unavailable');
  });
});

describe('photo analytics', () => {
  it('photo_taken (preset, size, tier) and photo_shared (method), nothing about the picture', () => {
    const services = createMockServices();
    const tracked: [string, Record<string, unknown> | undefined][] = [];
    services.analytics.track = (e, p) => void tracked.push([e, p]);
    const game = new Game({ seed: 3, services });
    game.start();
    const off = installAnalyticsHooks(game);
    game.bus.emit('photo:taken', { preset: 'golden', width: 1011, height: 2232 });
    game.bus.emit('photo:shared', { method: 'native' });
    off();
    expect(tracked.find(([e]) => e === 'photo_taken')?.[1]).toEqual({ preset: 'golden', width: 1011, height: 2232, tier: game.state.colony.tier });
    expect(tracked.find(([e]) => e === 'photo_shared')?.[1]).toEqual({ method: 'native' });
  });
});
