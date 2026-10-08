/**
 * Platform service interfaces. Web/dev builds use mock implementations; iOS/Android builds use
 * Capacitor plugin adapters (see src/platform/*). The Game only talks to these interfaces.
 */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export type AdResult = 'rewarded' | 'skipped' | 'unavailable';

export interface AdService {
  /** Preload/check readiness for a rewarded placement. */
  isReady(placement: string): boolean;
  /** Show a rewarded video. Resolves when closed. */
  showRewarded(placement: string): Promise<AdResult>;
}

export interface StoreProduct {
  id: string;
  /** Localized price string from the store, e.g. "$4.99" / "4,99 €". */
  price: string;
  priceMicros?: number;
  currency?: string;
  available: boolean;
}

export interface PurchaseResult {
  ok: boolean;
  productId: string;
  /** Store transaction id (for server-side receipt validation hooks). */
  transactionId?: string;
  error?: string;
  cancelled?: boolean;
}

export interface IapService {
  init(productIds: { id: string; type: 'consumable' | 'non_consumable' | 'subscription' }[]): Promise<void>;
  products(): StoreProduct[];
  purchase(productId: string): Promise<PurchaseResult>;
  /** Restore non-consumables & subscriptions; returns owned product ids. */
  restore(): Promise<string[]>;
  /** Active subscription expiry (epoch ms) if known. */
  subscriptionExpiry?(productId: string): Promise<number | null>;
}

export interface AnalyticsService {
  setConsent(enabled: boolean): void;
  track(event: string, props?: Record<string, string | number | boolean>): void;
  /** Flush queued events (called on pause). */
  flush(): Promise<void>;
}

export interface HapticsService {
  tap(): void;
  success(): void;
  warning(): void;
  heavy(): void;
}

export interface CloudSaveService {
  available(): boolean;
  upload(data: string): Promise<boolean>;
  download(): Promise<string | null>;
}

/** OS permission for local notifications as the game sees it ('unavailable': web, or the plugin failed). */
export type NotifyPermission = 'granted' | 'denied' | 'prompt' | 'unavailable';

/** What a tapped notification asks the game to do. */
export interface NotifyTap {
  kind?: import('./notifyPlan').NotifyKind;
  /** Panel to open ('daily' for the gift reminder, 'expeditions' for a squad that is back). */
  panel?: import('./notifyPlan').NotifyPanel;
}

/**
 * Local notifications (src/platform/notifications.ts). Implementations never throw and never show the OS prompt
 * except from `request()`.
 */
export interface NotificationsService {
  /** True on iOS / Android; false on the web (everything is a no-op there). */
  readonly available: boolean;
  check(): Promise<NotifyPermission>;
  /** Ask the OS (shows its prompt while it still asks). */
  request(): Promise<NotifyPermission>;
  /** Cancel every pending colony notification, then schedule `list` (only with permission). True when done. */
  replace(list: readonly import('./notifyPlan').PlannedNotification[]): Promise<boolean>;
  /** Cancel pending colony notifications and clear delivered ones from the notification shade. */
  clear(): Promise<void>;
  /** A delivered notification was tapped. Returns an unsubscribe. */
  onTap(cb: (tap: NotifyTap) => void): () => void;
}

/**
 * Game Center / Google Play Games achievements (src/platform/achievements.ts). `id` is an AchievementDef id
 * (`ach_*`); reporting an unlock twice is harmless. Implementations never throw.
 */
export interface AchievementsService {
  readonly name: string;
  report(id: string): void;
}

/** A finished picture to hand to the share sheet (Photo Mode). */
export interface ShareImage {
  blob: Blob;
  /** "nova-colony-new-hope-day-42.jpg" */
  fileName: string;
  title: string;
  text: string;
  /** Android chooser title. */
  dialogTitle?: string;
}

/**
 * shared: the sheet closed with a target picked (the web only knows "not cancelled") · cancelled: the player closed
 * it · downloaded: saved through a download link (web) · unavailable: this platform cannot do it · failed: it broke.
 */
export type ShareResult = 'shared' | 'cancelled' | 'downloaded' | 'unavailable' | 'failed';

/**
 * Sharing a picture (src/platform/share.ts): the native share sheet on iOS / Android (@capacitor/share, the file
 * written to the app's cache with @capacitor/filesystem), the Web Share API or a download link on the web.
 * Implementations never throw.
 */
export interface ShareService {
  /** The OS share sheet (iOS / Android). */
  readonly native: boolean;
  /** Can `shareImage` open a share sheet for an image file here? (Synchronous: the web must call share in the tap.) */
  canShareFiles(): boolean;
  /** Open the share sheet with the picture. On the web call it straight from the tap (user activation). */
  shareImage(img: ShareImage): Promise<ShareResult>;
  /** Save the picture through a download (web only; 'unavailable' elsewhere). */
  download(img: ShareImage): Promise<ShareResult>;
}

export interface PlatformServices {
  platform: 'web' | 'ios' | 'android';
  store: KeyValueStore;
  ads: AdService;
  iap: IapService;
  analytics: AnalyticsService;
  haptics: HapticsService;
  cloud: CloudSaveService;
  /** Local notifications (optional: mocks and older call sites leave it out = no notifications). */
  notifications?: NotificationsService;
  /** Game Center / Play Games achievements (optional: mocks leave it out = nothing is reported). */
  achievements?: AchievementsService;
  /** Share sheet / download for Photo Mode (optional: without it the preview offers no Share or Download). */
  share?: ShareService;
}
