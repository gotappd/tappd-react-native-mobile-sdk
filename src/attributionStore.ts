/**
 * React Native attribution touch store (AsyncStorage).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export type AttributionChannel = 'email' | 'push' | 'in_app_message' | 'card';
export type AttributionTouchType = 'click' | 'impression';

export interface AttributionTouchRecord {
  clientTouchId: string;
  messageId?: string;
  deliveryLogId?: string;
  journeyId?: string;
  enrollmentId?: string;
  stepId?: string;
  channel: AttributionChannel;
  touchType: AttributionTouchType;
  timestamp: string;
  isMachine?: boolean;
  isTest?: boolean;
  source?: string;
  sessionId?: string;
}

const TOUCHES_KEY = '_tappd_attribution_touches';
const QUEUE_KEY = '_tappd_attribution_queue';
const MAX_TOUCHES = 100;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function pruneTouches(touches: AttributionTouchRecord[]): AttributionTouchRecord[] {
  const cutoff = Date.now() - MAX_AGE_MS;
  return touches
    .filter((t) => {
      const ts = new Date(t.timestamp).getTime();
      return Number.isFinite(ts) && ts >= cutoff;
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, MAX_TOUCHES);
}

export async function loadAttributionTouches(): Promise<AttributionTouchRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(TOUCHES_KEY);
    const touches = raw ? JSON.parse(raw) : [];
    return pruneTouches(Array.isArray(touches) ? touches : []);
  } catch {
    return [];
  }
}

export async function saveAttributionTouches(touches: AttributionTouchRecord[]): Promise<void> {
  try {
    await AsyncStorage.setItem(TOUCHES_KEY, JSON.stringify(pruneTouches(touches)));
  } catch {
    // ignore
  }
}

export async function recordLocalTouch(
  partial: Omit<AttributionTouchRecord, 'clientTouchId' | 'timestamp'> & {
    clientTouchId?: string;
    timestamp?: string | Date;
  }
): Promise<AttributionTouchRecord> {
  const timestamp = partial.timestamp
    ? new Date(partial.timestamp).toISOString()
    : new Date().toISOString();
  const clientTouchId = partial.clientTouchId
    || `${partial.channel}:${partial.messageId || partial.deliveryLogId || 'unknown'}:${partial.touchType}:${timestamp}`;

  const touch: AttributionTouchRecord = {
    ...partial,
    clientTouchId,
    timestamp,
  };

  const existing = await loadAttributionTouches();
  const withoutDup = existing.filter((t) => t.clientTouchId !== touch.clientTouchId);
  withoutDup.unshift(touch);
  await saveAttributionTouches(withoutDup);
  await enqueueOffline({ type: 'touch', touch });
  return touch;
}

export async function getTouchesForConversion(): Promise<AttributionTouchRecord[]> {
  return loadAttributionTouches();
}

interface QueueItem {
  type: 'touch' | 'merge';
  touch?: AttributionTouchRecord;
  payload?: Record<string, unknown>;
  createdAt: string;
}

async function loadQueue(): Promise<QueueItem[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const queue = raw ? JSON.parse(raw) : [];
    return Array.isArray(queue) ? queue : [];
  } catch {
    return [];
  }
}

async function saveQueue(queue: QueueItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-200)));
  } catch {
    // ignore
  }
}

export async function enqueueOffline(item: Omit<QueueItem, 'createdAt'>): Promise<void> {
  const queue = await loadQueue();
  queue.push({ ...item, createdAt: new Date().toISOString() });
  await saveQueue(queue);
}

export type SyncPoster = (path: string, body: Record<string, unknown>) => Promise<any>;

export async function flushAttributionSync(
  post: SyncPoster,
  context: { anonymousId?: string | null; userId?: string | null; externalId?: string | null }
): Promise<void> {
  const touches = await loadAttributionTouches();
  if (touches.length) {
    try {
      await post('/attribution/touches', {
        touches,
        anonymousId: context.anonymousId,
        userId: context.userId || undefined,
        external_id: context.externalId || undefined,
      });
    } catch {
      return;
    }
  }

  const queue = await loadQueue();
  if (!queue.length) return;

  const remaining: QueueItem[] = [];
  for (const item of queue) {
    try {
      if (item.type === 'touch' && item.touch) {
        await post('/attribution/touches', {
          touches: [item.touch],
          anonymousId: context.anonymousId,
          userId: context.userId || undefined,
          external_id: context.externalId || undefined,
        });
      } else if (item.type === 'merge' && item.payload) {
        await post('/attribution/identify-merge', {
          ...item.payload,
          anonymousId: context.anonymousId,
          userId: context.userId || undefined,
          external_id: context.externalId || undefined,
        });
      }
    } catch {
      remaining.push(item);
    }
  }
  await saveQueue(remaining);
}

export async function syncIdentifyMerge(
  post: SyncPoster,
  context: { anonymousId: string | null; userId?: string | null; externalId?: string | null; customerId?: string }
): Promise<void> {
  const payload = {
    anonymousId: context.anonymousId,
    userId: context.userId || undefined,
    external_id: context.externalId || undefined,
    customerId: context.customerId,
  };
  try {
    await post('/attribution/identify-merge', payload);
  } catch {
    await enqueueOffline({ type: 'merge', payload });
  }
}
