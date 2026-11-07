/**
 * In-app message display priority — inlined for published RN SDK
 * (no @tappd/shared dependency). Keep in sync with
 * packages/shared/src/iamDisplayPriority.js.
 */

export const IAM_DISPLAY_PRIORITY_VALUES = ['low', 'normal', 'high', 'critical'] as const;

export type IamDisplayPriority = (typeof IAM_DISPLAY_PRIORITY_VALUES)[number];

/** Higher number = shown first when multiple IAMs are eligible. */
export const IAM_DISPLAY_PRIORITIES: Record<IamDisplayPriority, number> = {
  low: 0,
  normal: 10,
  high: 20,
  critical: 30,
};

export function normalizeIamDisplayPriority(raw: unknown): IamDisplayPriority {
  if (raw == null || raw === '') return 'normal';
  const s = String(raw).toLowerCase().trim();
  if (Object.prototype.hasOwnProperty.call(IAM_DISPLAY_PRIORITIES, s)) {
    return s as IamDisplayPriority;
  }
  return 'normal';
}

export function iamDisplayPriorityRank(raw: unknown): number {
  return IAM_DISPLAY_PRIORITIES[normalizeIamDisplayPriority(raw)];
}

export function sortInAppMessagesByPriority<T extends { displayPriority?: string; createdAt?: Date | string | number }>(
  messages: T[],
): T[] {
  if (!Array.isArray(messages) || messages.length < 2) {
    return Array.isArray(messages) ? messages.slice() : [];
  }
  return messages.slice().sort((a, b) => {
    const rankDiff =
      iamDisplayPriorityRank(b?.displayPriority) - iamDisplayPriorityRank(a?.displayPriority);
    if (rankDiff !== 0) return rankDiff;
    const aTime = a?.createdAt != null ? new Date(a.createdAt).getTime() : 0;
    const bTime = b?.createdAt != null ? new Date(b.createdAt).getTime() : 0;
    return aTime - bTime;
  });
}
