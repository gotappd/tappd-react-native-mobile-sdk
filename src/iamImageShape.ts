/**
 * Image shapes for in-app messages. Every shape is built from corner radii because that is what
 * both the web and React Native can draw; CSS clip-path has no React Native equivalent.
 * Same file in `@tappd/web-sdk`, the React Native SDK and the dashboard: keep them in sync.
 */

export type ImageShape = 'square' | 'rounded' | 'soft' | 'pill' | 'circle' | 'arch' | 'leaf';

export interface ImageCorners {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
}

/** Larger than any image, so the corner is limited only by the image's own size. */
const FULL = 9999;

const SHAPE_CORNERS: Record<ImageShape, ImageCorners> = {
  square: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
  rounded: { topLeft: 12, topRight: 12, bottomRight: 12, bottomLeft: 12 },
  soft: { topLeft: 28, topRight: 28, bottomRight: 28, bottomLeft: 28 },
  pill: { topLeft: FULL, topRight: FULL, bottomRight: FULL, bottomLeft: FULL },
  circle: { topLeft: FULL, topRight: FULL, bottomRight: FULL, bottomLeft: FULL },
  arch: { topLeft: FULL, topRight: FULL, bottomRight: 0, bottomLeft: 0 },
  leaf: { topLeft: 48, topRight: 0, bottomRight: 48, bottomLeft: 0 },
};

/** Corner radii for a saved shape, or null when unset or unknown so older messages stay as they were. */
export function imageShapeCorners(shape: unknown): ImageCorners | null {
  if (typeof shape !== 'string' || !Object.prototype.hasOwnProperty.call(SHAPE_CORNERS, shape)) return null;
  return SHAPE_CORNERS[shape as ImageShape];
}

/** A circle needs a square image, so it is cropped to fill one. */
export function imageShapeIsSquareCrop(shape: unknown): boolean {
  return shape === 'circle';
}

/** Radii that fit a measured image, scaled down the way CSS does for overlapping corners. */
export function fitImageCorners(corners: ImageCorners, width: number, height: number): ImageCorners {
  if (!(width > 0) || !(height > 0)) return corners;
  const scale = Math.min(
    1,
    width / Math.max(corners.topLeft + corners.topRight, 1),
    width / Math.max(corners.bottomLeft + corners.bottomRight, 1),
    height / Math.max(corners.topLeft + corners.bottomLeft, 1),
    height / Math.max(corners.topRight + corners.bottomRight, 1),
  );
  return {
    topLeft: corners.topLeft * scale,
    topRight: corners.topRight * scale,
    bottomRight: corners.bottomRight * scale,
    bottomLeft: corners.bottomLeft * scale,
  };
}
