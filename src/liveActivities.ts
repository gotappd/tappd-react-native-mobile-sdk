/**
 * iOS Live Activities. The native part (ios/TappdLiveActivities*.swift, a draft until it is
 * built on a Mac) watches ActivityKit for tokens and emits them here; this module sends them
 * to Tappd. Your server then starts, updates and ends activities through the Tappd API.
 */

export type LiveActivityTokenKind = 'push_to_start' | 'update';

export interface LiveActivityTokenEvent {
  kind: LiveActivityTokenKind;
  /** Your ActivityAttributes type name, e.g. "DeliveryAttributes". */
  activityType: string;
  /** Hex APNs token. */
  token: string;
  /** update tokens: your key for the activity (from the attributes) and ActivityKit's id. */
  activityKey?: string;
  activityId?: string;
  /** 'sandbox' for builds run from Xcode. */
  environment?: 'production' | 'sandbox';
}

export interface LiveActivityEndedEvent {
  token?: string;
  activityId?: string;
  activityKey?: string;
}

/** Native events (see ios/TappdLiveActivitiesModule.swift). */
export const LIVE_ACTIVITY_EVENTS = {
  token: 'TappdLiveActivityToken',
  ended: 'TappdLiveActivityEnded',
} as const;

/** Keeps the latest token per (kind, type, activity) so a retry after identify sends each once. */
export function pendingKey(e: LiveActivityTokenEvent): string {
  return [e.kind, e.activityType, e.activityKey || '', e.activityId || ''].join('|');
}
