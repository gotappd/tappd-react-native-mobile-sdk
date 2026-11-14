/**
 * Geofence helpers. The SDK fetches which geofences to watch (getGeofences) and reports
 * crossings (reportGeofenceEvent); the app, or a location library it already uses, does
 * the actual region monitoring on the device.
 */

export type GeofenceTrigger = 'enter' | 'exit' | 'dwell';

export interface TappdGeofence {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  /** Metres. */
  radius: number;
  /** Which crossings to report; reports for others are ignored by Tappd. */
  triggers: { enter: boolean; exit: boolean; dwell: boolean };
  /** For dwell: how long someone must stay inside before reporting. */
  dwellSeconds: number;
  /** Distance from the position you passed, when you passed one. */
  distanceMeters?: number;
}

export interface TappdGeofenceList {
  geofences: TappdGeofence[];
  /** Phones can only watch a few regions (iOS: 20 per app); the list never exceeds this. */
  maxRegions: number;
  /** Fetch again after moving this far from where you fetched; null without a position. */
  resyncAfterMeters: number | null;
}

export interface LatLng {
  latitude: number;
  longitude: number;
}

/** Great-circle distance in metres. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** True when the device has moved far enough from the last fetch to need a new list. */
export function shouldRefreshGeofences(fetchedAt: LatLng | null, current: LatLng, resyncAfterMeters: number | null): boolean {
  if (!fetchedAt) return true;
  if (resyncAfterMeters == null) return false;
  return distanceMeters(fetchedAt, current) >= resyncAfterMeters;
}
