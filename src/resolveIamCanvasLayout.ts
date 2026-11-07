/**
 * IAM canvas layout — keep in sync with packages/shared/src/resolveIamCanvasLayout.js
 */

import { mergeIamPageSurfaceSettings } from './mergeIamPageSurfaceSettings';
import {
  IAM_BANNER_OUTER_PADDING_PX,
  IAM_DEFAULT_OVERLAY_OPACITY,
  IAM_DEFAULT_VIEWPORT_PADDING_PX,
  IAM_FULLSCREEN_SCROLL_PADDING_PX,
} from './constants/iamLayoutDefaults';

export const IAM_NOTIFICATION_VIEWPORT_PADDING_PX = 12;
export const IAM_NOTIFICATION_CARD_PADDING_PX = 16;
export const IAM_MODAL_SHELL_MAX_WIDTH_PERCENT = 90;
export const IAM_MODAL_DEFAULT_BORDER_RADIUS_PX = 8;
export const IAM_CLOSE_BUTTON_INSET_PX = 8;

function pageSettings(config: any, pageIndex = 0) {
  return config?.pages?.[pageIndex]?.settings;
}

function rgbaFromHex(color: string, opacityPct: number): string {
  const hex = String(color).replace('#', '');
  if (hex.length < 6) return color;
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacityPct / 100})`;
}

export function resolveIamOverlayOpacity(config: any): number {
  return config?.overlayOpacity ?? IAM_DEFAULT_OVERLAY_OPACITY;
}

export function resolveIamViewportPaddingPx(config: any): number {
  const pad = config?.containerSettings?.viewportPadding;
  return pad === undefined ? IAM_DEFAULT_VIEWPORT_PADDING_PX : pad;
}

export function resolveIamScrollPaddingPx(): number {
  return IAM_FULLSCREEN_SCROLL_PADDING_PX;
}

export function shouldShowIamCloseButton(config: any): boolean {
  if (config?.showCloseButton === false || config?.closeButton === false) return false;
  if (config?.containerSettings?.showCloseButton === false) return false;
  return true;
}

export function resolveIamCloseButtonStyle(config: any) {
  const cs = config?.containerSettings || {};
  const raw = cs.closeButtonStyle || {};
  const size =
    typeof raw.size === 'number' && Number.isFinite(raw.size)
      ? Math.min(Math.max(raw.size, 20), 64)
      : 28;
  const position = cs.closeButtonPosition || config?.closeButtonPosition || 'top-right';
  const pos = String(position);
  const inset = IAM_CLOSE_BUTTON_INSET_PX;
  const layout: Record<string, number> = {};
  if (pos.includes('top')) layout.top = inset;
  if (pos.includes('bottom')) layout.bottom = inset;
  if (pos.includes('left')) layout.left = inset;
  if (pos.includes('right')) layout.right = inset;
  return { size, color: raw.color || '#111111', position, layout };
}

export function resolveContainerBgColorNative(surface: any): string | undefined {
  if (!surface?.backgroundColor) return undefined;
  const opacity = surface.backgroundOpacity;
  if (opacity !== undefined && opacity < 100) {
    return rgbaFromHex(surface.backgroundColor, opacity);
  }
  return surface.backgroundColor;
}

export function resolveIamModalContainerStyleNative(
  config: any,
  pageIndex = 0,
  screenWidth?: number
): Record<string, unknown> {
  const containerSettings = config?.containerSettings || {};
  const surface = mergeIamPageSurfaceSettings(containerSettings, pageSettings(config, pageIndex));
  const s: Record<string, unknown> = {};
  const widthMode = containerSettings.widthMode || 'custom';

  if (widthMode === 'full') {
    s.width = '100%';
    s.maxWidth = '100%';
  } else if (containerSettings.customWidth) {
    s.width = containerSettings.customWidth;
  } else {
    s.width = `${IAM_MODAL_SHELL_MAX_WIDTH_PERCENT}%`;
    if (screenWidth) s.maxWidth = screenWidth * (IAM_MODAL_SHELL_MAX_WIDTH_PERCENT / 100);
  }

  if (containerSettings.maxWidth != null && containerSettings.maxWidthUnit && widthMode !== 'full') {
    const u = containerSettings.maxWidthUnit;
    s.maxWidth = u === '%' ? `${containerSettings.maxWidth}%` : Number(containerSettings.maxWidth);
  }

  if (containerSettings.padding !== undefined) s.padding = containerSettings.padding;
  if (containerSettings.margin !== undefined) s.margin = containerSettings.margin;
  s.borderRadius = containerSettings.borderRadius ?? IAM_MODAL_DEFAULT_BORDER_RADIUS_PX;
  s.backgroundColor = resolveContainerBgColorNative(surface) ?? '#FFFFFF';
  return s;
}

export function resolveIamFullscreenContainerStyleNative(
  config: any,
  pageIndex = 0
): Record<string, unknown> {
  const containerSettings = config?.containerSettings || {};
  return {
    flex: 1,
    width: '100%',
    height: '100%',
    padding: containerSettings.padding ?? 0,
    margin: containerSettings.margin,
    borderRadius: 0,
    backgroundColor: resolveContainerBgColorNative(
      mergeIamPageSurfaceSettings(containerSettings, pageSettings(config, pageIndex))
    ) ?? '#FFFFFF',
  };
}

export function resolveIamNotificationContainerStyleNative(
  config: any,
  pageIndex = 0,
  screenWidth?: number,
  screenHeight?: number
): Record<string, unknown> {
  const containerSettings = config?.containerSettings || {};
  const base = resolveIamModalContainerStyleNative(config, pageIndex, screenWidth);
  if (containerSettings.padding === undefined) {
    base.padding = IAM_NOTIFICATION_CARD_PADDING_PX;
  }
  base.maxWidth = screenWidth ? screenWidth * 0.92 : '92%';
  base.maxHeight = screenHeight ? screenHeight * 0.72 : '72%';
  return base;
}

export function resolveIamNotificationViewportPaddingPx(): number {
  return IAM_NOTIFICATION_VIEWPORT_PADDING_PX;
}

export function resolveIamBannerOuterPaddingPx(): number {
  return IAM_BANNER_OUTER_PADDING_PX;
}
