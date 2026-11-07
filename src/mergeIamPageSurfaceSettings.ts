/**
 * Merge per-page IAM `settings` over `containerSettings` for surface background.
 * Page keys override container when defined (not undefined).
 *
 * Keep in sync with packages/shared/src/mergeIamPageSurfaceSettings.js (published SDK has no @tappd/shared dep).
 */
export function mergeIamPageSurfaceSettings(
  containerSettings: Record<string, any> | null | undefined,
  pageSettings: Record<string, any> | null | undefined
): Record<string, any> {
  const out = { ...(containerSettings || {}) };
  if (!pageSettings || typeof pageSettings !== 'object') return out;
  if (pageSettings.backgroundColor !== undefined) out.backgroundColor = pageSettings.backgroundColor;
  if (pageSettings.backgroundOpacity !== undefined) out.backgroundOpacity = pageSettings.backgroundOpacity;
  if (pageSettings.backgroundImage !== undefined) out.backgroundImage = pageSettings.backgroundImage;
  if (pageSettings.backgroundImageEnabled !== undefined) {
    out.backgroundImageEnabled = pageSettings.backgroundImageEnabled;
  }
  return out;
}
