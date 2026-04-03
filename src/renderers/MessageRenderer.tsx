/**
 * Message Renderer for In-App Messages (React Native)
 */

import React, { useState, useEffect, type ReactNode } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
  ScrollView,
  ImageBackground,
} from 'react-native';
import { BlockRendererComponent as BlockRenderer } from './BlockRenderer';
import type {
  InAppMessage,
  InAppMessageConfig,
  InAppMessageType,
  MessageContainerSettings,
} from '../types/inAppMessage';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * Match dashboard + web SDK: show close unless explicitly disabled on root or containerSettings.
 */
function shouldShowCloseButton(config: InAppMessageConfig): boolean {
  if (config.showCloseButton === false || config.closeButton === false) {
    return false;
  }
  if (config.containerSettings?.showCloseButton === false) {
    return false;
  }
  return true;
}

/**
 * Resolve layout type when messageType is missing or stale vs containerSettings.displayType.
 */
function getEffectiveMessageType(config: InAppMessageConfig): InAppMessageType {
  const raw = config.messageType ?? config.containerSettings?.displayType ?? 'popup';
  if (String(raw).toLowerCase() === 'fullscreen') {
    return 'full_screen';
  }
  return raw as InAppMessageType;
}

export interface MessageRendererProps {
  message: InAppMessage;
  onDismiss: (messageId: string) => void;
  /** Include optional `action` for button blocks (close, track_event, update_profile, link). */
  onButtonClick?: (messageId: string, link: string, text: string, action?: any) => void;
  onFormSubmit?: (messageId: string, formData: Record<string, any>, submitAction?: any) => void | Promise<void>;
  onNavigatePage?: (messageId: string, pageIndex: number) => void;
  currentPageIndex?: number;
}

function blockHandlers(
  message: InAppMessage,
  onButtonClick?: MessageRendererProps['onButtonClick'],
  onFormSubmit?: MessageRendererProps['onFormSubmit']
) {
  return {
    onButtonClick: (link: string, text: string, action?: any) =>
      onButtonClick?.(message._id, link, text, action),
    onFormSubmit: (formData: Record<string, any>, submitAction?: any) =>
      onFormSubmit?.(message._id, formData, submitAction),
  };
}

/**
 * Get blocks from message config (pages-first, legacy root blocks as fallback when page has none).
 */
function getBlocks(config: InAppMessageConfig, pageIndex: number = 0): any[] {
  if (config.pages && config.pages.length > 0) {
    const targetPage = config.pages[pageIndex] || config.pages[0];
    const pageBlocks = targetPage.blocks || [];
    if (pageBlocks.length > 0) {
      return pageBlocks;
    }
    const legacy = config.blocks || [];
    if (legacy.length > 0) {
      return legacy;
    }
    return [];
  }
  return config.blocks || [];
}

/**
 * Get current page index
 */
function getCurrentPageIndex(config: InAppMessageConfig, props: MessageRendererProps): number {
  if (props.currentPageIndex !== undefined) {
    return props.currentPageIndex;
  }
  return 0;
}

/** Container sizing from dashboard `containerSettings` (popup/modal). */
function resolvePopupContainerStyle(config: InAppMessageConfig): Record<string, unknown> {
  const cs = config.containerSettings;
  if (!cs) return {};
  const s: Record<string, unknown> = {};
  if (cs.widthMode === 'full') {
    s.width = '100%';
    s.maxWidth = SCREEN_WIDTH;
  } else if (cs.customWidth) {
    s.width = cs.customWidth;
  }
  if (cs.padding !== undefined) s.padding = cs.padding;
  if (cs.margin !== undefined) s.margin = cs.margin;
  if (cs.maxWidth != null && cs.maxWidthUnit) {
    const u = cs.maxWidthUnit;
    s.maxWidth = u === '%' ? `${cs.maxWidth}%` : Number(cs.maxWidth);
  }
  return s;
}

/** Match web SDK `applyContainerStyles` background color + opacity. */
function resolveContainerBgColor(cs?: MessageContainerSettings): string | undefined {
  if (!cs?.backgroundColor) return undefined;
  const opacity = cs.backgroundOpacity;
  if (opacity !== undefined && opacity < 100) {
    const hex = cs.backgroundColor.replace('#', '');
    if (hex.length >= 6) {
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      return `rgba(${r},${g},${b},${opacity / 100})`;
    }
  }
  return cs.backgroundColor;
}

function resolveContainerBorderStyle(cs?: MessageContainerSettings): Record<string, unknown> {
  if (!cs || cs.borderWidth === undefined || cs.borderStyle === 'none') return {};
  return {
    borderWidth: cs.borderWidth,
    borderColor: cs.borderColor || '#000000',
    borderStyle:
      cs.borderStyle === 'dashed' ? 'dashed' : cs.borderStyle === 'dotted' ? 'dotted' : 'solid',
  };
}

/** Split row blocks with pin top/bottom out of the scroll column (dashboard preview uses absolute pin). */
function partitionBlocksByRowPin(blocks: any[]) {
  const sorted = [...blocks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const flow: any[] = [];
  const pinnedTop: any[] = [];
  const pinnedBottom: any[] = [];
  for (const b of sorted) {
    const pin = b.type === 'row' ? b.config?.row?.pin || 'none' : 'none';
    if (pin === 'top') pinnedTop.push(b);
    else if (pin === 'bottom') pinnedBottom.push(b);
    else flow.push(b);
  }
  return { flow, pinnedTop, pinnedBottom };
}

/** Dashboard / API may send margins as numbers or strings (e.g. "16", "16px"). RN needs numbers for positioning. */
function rowInsetPx(value: unknown, fallback: number): number {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  if (typeof value === 'string') {
    const n = parseFloat(value.replace(/px/gi, '').trim());
    return Number.isNaN(n) ? fallback : n;
  }
  return fallback;
}

/** Outer shell for pinned row stack (matches RowBlockRenderer.vue pinStyle). */
function pinnedStackOuterStyle(blocks: any[], edge: 'top' | 'bottom') {
  if (!blocks?.length) return {};
  const rows = blocks.map((b) => b?.config?.row).filter(Boolean);
  const first = rows[0];
  const mar = rowInsetPx(first?.margin, 0);
  const left = rowInsetPx(first?.marginLeft, mar);
  const right = rowInsetPx(first?.marginRight, mar);
  const edgeInset =
    edge === 'top'
      ? Math.max(...rows.map((r) => rowInsetPx(r?.marginTop, mar)))
      : Math.max(...rows.map((r) => rowInsetPx(r?.marginBottom, mar)));
  const base: any = {
    position: 'absolute' as const,
    left,
    right,
    zIndex: 50,
  };
  if (edge === 'top') base.top = edgeInset;
  else base.bottom = edgeInset;
  return base;
}

function pinnedEdgeInsetPx(blocks: any[], edge: 'top' | 'bottom'): number {
  if (!blocks?.length) return 0;
  const rows = blocks.map((b) => b?.config?.row).filter(Boolean);
  if (!rows.length) return 0;
  const mar = rowInsetPx(rows[0]?.margin, 0);
  return edge === 'top'
    ? Math.max(...rows.map((r) => rowInsetPx(r?.marginTop, mar)))
    : Math.max(...rows.map((r) => rowInsetPx(r?.marginBottom, mar)));
}

interface PartitionedScrollBodyProps {
  blocks: any[];
  message: InAppMessage;
  scrollStyle: any;
  onButtonClick?: MessageRendererProps['onButtonClick'];
  onFormSubmit?: MessageRendererProps['onFormSubmit'];
}

function PartitionedScrollBody({
  blocks,
  message,
  scrollStyle,
  onButtonClick,
  onFormSubmit,
}: PartitionedScrollBodyProps) {
  const { flow, pinnedTop, pinnedBottom } = partitionBlocksByRowPin(blocks);
  const [topInset, setTopInset] = useState(0);
  const [bottomInset, setBottomInset] = useState(0);
  const h = blockHandlers(message, onButtonClick, onFormSubmit);
  const topEdgePx = pinnedEdgeInsetPx(pinnedTop, 'top');
  const bottomEdgePx = pinnedEdgeInsetPx(pinnedBottom, 'bottom');

  return (
    <View style={{ position: 'relative', flex: 1, minHeight: 80 }}>
      {pinnedTop.length > 0 && (
        <View
          style={pinnedStackOuterStyle(pinnedTop, 'top')}
          onLayout={(e) => setTopInset(e.nativeEvent.layout.height)}
        >
          {pinnedTop.map((block) => (
            <BlockRenderer
              key={block.id}
              block={block}
              rowPinContext="inPinnedStack"
              {...h}
            />
          ))}
        </View>
      )}
      <ScrollView
        style={scrollStyle}
        contentContainerStyle={{
          paddingTop: topInset + topEdgePx,
          paddingBottom: bottomInset + bottomEdgePx,
        }}
      >
        {flow.map((block) => (
          <BlockRenderer key={block.id} block={block} {...h} />
        ))}
      </ScrollView>
      {pinnedBottom.length > 0 && (
        <View
          style={pinnedStackOuterStyle(pinnedBottom, 'bottom')}
          onLayout={(e) => setBottomInset(e.nativeEvent.layout.height)}
        >
          {pinnedBottom.map((block) => (
            <BlockRenderer
              key={block.id}
              block={block}
              rowPinContext="inPinnedStack"
              {...h}
            />
          ))}
        </View>
      )}
    </View>
  );
}

interface ModalCardSurfaceProps {
  config: InAppMessageConfig;
  fadeAnim: Animated.Value;
  scaleAnim: Animated.Value;
  /** e.g. styles.popupContainer vs styles.modalContainer */
  containerStyle: object;
  children: ReactNode;
}

/** Dashboard `containerSettings.backgroundImage` + colors/borders (web `applyContainerStyles`). */
function ModalCardSurface({ config, fadeAnim, scaleAnim, containerStyle, children }: ModalCardSurfaceProps) {
  const cs = config.containerSettings;
  const useBg =
    !!String(cs?.backgroundImage || '').trim() && cs?.backgroundImageEnabled !== false;
  const solidBg = resolveContainerBgColor(cs) ?? '#FFFFFF';
  const border = resolveContainerBorderStyle(cs);
  const br = cs?.borderRadius ?? 8;

  const animatedCard = [
    containerStyle,
    {
      opacity: fadeAnim,
      transform: [{ scale: scaleAnim }],
      borderRadius: br,
      overflow: 'hidden' as const,
      ...resolvePopupContainerStyle(config),
      ...border,
    },
  ];

  if (useBg) {
    return (
      <Animated.View style={[animatedCard, { backgroundColor: 'transparent' }]}>
        <ImageBackground
          source={{ uri: cs!.backgroundImage! }}
          style={{ width: '100%' }}
          resizeMode="cover"
          imageStyle={{ borderRadius: br }}
        >
          <View style={{ flexGrow: 1 }}>{children}</View>
        </ImageBackground>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[animatedCard, { backgroundColor: solidBg }]}>{children}</Animated.View>
  );
}

/**
 * Banner Renderer Component
 */
export function BannerRenderer({ message, onDismiss, onButtonClick, onFormSubmit }: MessageRendererProps) {
  const config = message.config;
  const position = config.position || 'top';
  const blocks = getBlocks(config);
  const { flow, pinnedTop, pinnedBottom } = partitionBlocksByRowPin(blocks);
  const cs = config.containerSettings;
  const useBg =
    !!String(cs?.backgroundImage || '').trim() && cs?.backgroundImageEnabled !== false;
  const solidBg = resolveContainerBgColor(cs) ?? config.backgroundColor ?? '#FFFFFF';
  const [fadeAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, []);

  const containerStyle: any = {
    position: 'absolute',
    left: 0,
    right: 0,
    width: '100%',
    zIndex: 9999,
    padding: 12,
    borderBottomWidth: position === 'top' ? 1 : 0,
    borderTopWidth: position === 'bottom' ? 1 : 0,
    borderColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
    ...resolveContainerBorderStyle(cs),
  };

  if (position === 'top') {
    containerStyle.top = 0;
  } else if (position === 'bottom') {
    containerStyle.bottom = 0;
  } else {
    containerStyle.top = SCREEN_HEIGHT / 2;
    containerStyle.transform = [{ translateY: -100 }];
  }

  const h = blockHandlers(message, onButtonClick, onFormSubmit);

  const inner = (
    <>
      {pinnedTop.length > 0 && (
        <View style={{ width: '100%', marginBottom: 8 }}>
          {pinnedTop.map((block) => (
            <BlockRenderer key={block.id} block={block} rowPinContext="inPinnedStack" {...h} />
          ))}
        </View>
      )}
      <View style={styles.bannerContent}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bannerScroll}>
          {flow.map((block) => (
            <BlockRenderer key={block.id} block={block} {...h} />
          ))}
        </ScrollView>
        {config.dismissible !== false && (
          <TouchableOpacity
            style={styles.dismissButton}
            onPress={() => onDismiss(message._id)}
          >
            <Text style={styles.dismissButtonText}>×</Text>
          </TouchableOpacity>
        )}
      </View>
      {pinnedBottom.length > 0 && (
        <View style={{ width: '100%', marginTop: 8 }}>
          {pinnedBottom.map((block) => (
            <BlockRenderer key={block.id} block={block} rowPinContext="inPinnedStack" {...h} />
          ))}
        </View>
      )}
    </>
  );

  if (useBg) {
    return (
      <Animated.View style={[containerStyle, { opacity: fadeAnim, backgroundColor: 'transparent' }]}>
        <ImageBackground
          source={{ uri: cs!.backgroundImage! }}
          style={{ width: '100%' }}
          resizeMode="cover"
        >
          {inner}
        </ImageBackground>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[containerStyle, { opacity: fadeAnim, backgroundColor: solidBg }]}>
      {inner}
    </Animated.View>
  );
}

/**
 * Popup Renderer Component
 */
export function PopupRenderer({ message, onDismiss, onButtonClick, onFormSubmit, onNavigatePage, currentPageIndex }: MessageRendererProps) {
  const config = message.config;
  const pageIndex = currentPageIndex !== undefined ? currentPageIndex : 0;
  const blocks = getBlocks(config, pageIndex);
  const overlay = config.overlay !== false;
  const overlayOpacity = config.overlayOpacity || 0.5;
  const [fadeAnim] = useState(new Animated.Value(0));
  const [scaleAnim] = useState(new Animated.Value(0.9));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();
  }, [pageIndex]); // Re-animate on page change

  const handleOverlayPress = () => {
    if (config.dismissible !== false) {
      onDismiss(message._id);
    }
  };

  return (
    <Modal
      transparent
      visible
      animationType="none"
      onRequestClose={() => {
        if (config.dismissible !== false) {
          onDismiss(message._id);
        }
      }}
    >
      <TouchableOpacity
        activeOpacity={1}
        style={[
          styles.overlay,
          { backgroundColor: overlay ? `rgba(0, 0, 0, ${overlayOpacity})` : 'transparent' },
          config.containerSettings?.viewportPadding != null
            ? { padding: config.containerSettings.viewportPadding }
            : null,
        ]}
        onPress={handleOverlayPress}
      >
        <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
          <ModalCardSurface
            config={config}
            fadeAnim={fadeAnim}
            scaleAnim={scaleAnim}
            containerStyle={[
              styles.popupContainer,
              { maxWidth: SCREEN_WIDTH * 0.9 },
            ]}
          >
            {shouldShowCloseButton(config) && (
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => onDismiss(message._id)}
              >
                <Text style={styles.closeButtonText}>×</Text>
              </TouchableOpacity>
            )}
            <PartitionedScrollBody
              blocks={blocks}
              message={message}
              scrollStyle={styles.popupContent}
              onButtonClick={onButtonClick}
              onFormSubmit={onFormSubmit}
            />
            {config.pages && config.pages.length > 1 && config.showNavigationButtons !== false && (() => {
              const pagesLength = config.pages.length;
              const lastPageIndex = pagesLength - 1;
              return (
                <View style={styles.modalNavigation}>
                  <TouchableOpacity
                    style={[styles.navButton, pageIndex === 0 && styles.navButtonDisabled]}
                    disabled={pageIndex === 0}
                    onPress={() => {
                      if (pageIndex > 0 && onNavigatePage) {
                        onNavigatePage(message._id, pageIndex - 1);
                      }
                    }}
                  >
                    <Text style={[styles.navButtonText, pageIndex === 0 && styles.navButtonTextDisabled]}>← Previous</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.navButton, pageIndex >= lastPageIndex && styles.navButtonDisabled]}
                    disabled={pageIndex >= lastPageIndex}
                    onPress={() => {
                      if (pageIndex < lastPageIndex && onNavigatePage) {
                        onNavigatePage(message._id, pageIndex + 1);
                      }
                    }}
                  >
                    <Text style={[styles.navButtonText, pageIndex >= lastPageIndex && styles.navButtonTextDisabled]}>Next →</Text>
                  </TouchableOpacity>
                </View>
              );
            })()}
          </ModalCardSurface>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

/**
 * Modal Renderer Component (similar to popup but larger)
 */
export function ModalRenderer({ message, onDismiss, onButtonClick, onFormSubmit, onNavigatePage, currentPageIndex }: MessageRendererProps) {
  const config = message.config;
  const pageIndex = currentPageIndex !== undefined ? currentPageIndex : 0;
  const blocks = getBlocks(config, pageIndex);
  const overlay = config.overlay !== false;
  const overlayOpacity = config.overlayOpacity || 0.5;
  const [fadeAnim] = useState(new Animated.Value(0));
  const [scaleAnim] = useState(new Animated.Value(0.9));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleOverlayPress = () => {
    if (config.dismissible !== false) {
      onDismiss(message._id);
    }
  };

  return (
    <Modal
      transparent
      visible
      animationType="none"
      onRequestClose={() => {
        if (config.dismissible !== false) {
          onDismiss(message._id);
        }
      }}
    >
      <TouchableOpacity
        activeOpacity={1}
        style={[
          styles.overlay,
          { backgroundColor: overlay ? `rgba(0, 0, 0, ${overlayOpacity})` : 'transparent' },
          config.containerSettings?.viewportPadding != null
            ? { padding: config.containerSettings.viewportPadding }
            : null,
        ]}
        onPress={handleOverlayPress}
      >
        <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
          <ModalCardSurface
            config={config}
            fadeAnim={fadeAnim}
            scaleAnim={scaleAnim}
            containerStyle={[
              styles.modalContainer,
              { maxWidth: SCREEN_WIDTH * 0.85, maxHeight: SCREEN_HEIGHT * 0.8 },
            ]}
          >
            {shouldShowCloseButton(config) && (
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => onDismiss(message._id)}
              >
                <Text style={styles.closeButtonText}>×</Text>
              </TouchableOpacity>
            )}
            <PartitionedScrollBody
              blocks={blocks}
              message={message}
              scrollStyle={styles.modalContent}
              onButtonClick={onButtonClick}
              onFormSubmit={onFormSubmit}
            />
            {config.pages && config.pages.length > 1 && config.showNavigationButtons !== false && (() => {
              const pagesLength = config.pages.length;
              const lastPageIndex = pagesLength - 1;
              return (
                <View style={styles.modalNavigation}>
                  <TouchableOpacity
                    style={[styles.navButton, pageIndex === 0 && styles.navButtonDisabled]}
                    disabled={pageIndex === 0}
                    onPress={() => {
                      if (pageIndex > 0 && onNavigatePage) {
                        onNavigatePage(message._id, pageIndex - 1);
                      }
                    }}
                  >
                    <Text style={[styles.navButtonText, pageIndex === 0 && styles.navButtonTextDisabled]}>← Previous</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.navButton, pageIndex >= lastPageIndex && styles.navButtonDisabled]}
                    disabled={pageIndex >= lastPageIndex}
                    onPress={() => {
                      if (pageIndex < lastPageIndex && onNavigatePage) {
                        onNavigatePage(message._id, pageIndex + 1);
                      }
                    }}
                  >
                    <Text style={[styles.navButtonText, pageIndex >= lastPageIndex && styles.navButtonTextDisabled]}>Next →</Text>
                  </TouchableOpacity>
                </View>
              );
            })()}
          </ModalCardSurface>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

/**
 * Full Screen Renderer Component
 */
export function FullScreenRenderer({ message, onDismiss, onButtonClick, onFormSubmit, onNavigatePage, currentPageIndex }: MessageRendererProps) {
  const config = message.config;
  const pageIndex = currentPageIndex !== undefined ? currentPageIndex : 0;
  const blocks = getBlocks(config, pageIndex);
  const cs = config.containerSettings;
  const useBg =
    !!String(cs?.backgroundImage || '').trim() && cs?.backgroundImageEnabled !== false;
  const solidBg = resolveContainerBgColor(cs) ?? '#FFFFFF';

  const inner = (
    <View style={[styles.fullScreenContainer, useBg ? { backgroundColor: 'transparent' } : { backgroundColor: solidBg }]}>
      {shouldShowCloseButton(config) && (
        <TouchableOpacity
          style={styles.fullScreenCloseButton}
          onPress={() => onDismiss(message._id)}
        >
          <Text style={styles.fullScreenCloseButtonText}>×</Text>
        </TouchableOpacity>
      )}

      {config.pages && config.pages.length > 1 && config.showNavigationButtons !== false && (() => {
        const pagesLength = config.pages.length;
        const lastPageIndex = pagesLength - 1;
        return (
          <View style={styles.fullScreenNavigation}>
            <TouchableOpacity
              style={[styles.navButton, pageIndex === 0 && styles.navButtonDisabled]}
              disabled={pageIndex === 0}
              onPress={() => {
                if (pageIndex > 0 && onNavigatePage) {
                  onNavigatePage(message._id, pageIndex - 1);
                }
              }}
            >
              <Text style={[styles.navButtonText, pageIndex === 0 && styles.navButtonTextDisabled]}>← Previous</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.navButton, pageIndex >= lastPageIndex && styles.navButtonDisabled]}
              disabled={pageIndex >= lastPageIndex}
              onPress={() => {
                if (pageIndex < lastPageIndex && onNavigatePage) {
                  onNavigatePage(message._id, pageIndex + 1);
                }
              }}
            >
              <Text style={[styles.navButtonText, pageIndex >= lastPageIndex && styles.navButtonTextDisabled]}>Next →</Text>
            </TouchableOpacity>
          </View>
        );
      })()}

      <PartitionedScrollBody
        blocks={blocks}
        message={message}
        scrollStyle={[styles.fullScreenContent, { flex: 1 }]}
        onButtonClick={onButtonClick}
        onFormSubmit={onFormSubmit}
      />
    </View>
  );

  return (
    <Modal
      transparent={false}
      visible
      animationType="fade"
      onRequestClose={() => {
        if (config.dismissible !== false) {
          onDismiss(message._id);
        }
      }}
    >
      {useBg ? (
        <ImageBackground
          source={{ uri: cs!.backgroundImage! }}
          style={{ flex: 1, width: '100%', minHeight: SCREEN_HEIGHT }}
          resizeMode="cover"
        >
          {inner}
        </ImageBackground>
      ) : (
        inner
      )}
    </Modal>
  );
}

/**
 * Notification Renderer Component
 */
export function NotificationRenderer({ message, onDismiss, onButtonClick, onFormSubmit }: MessageRendererProps) {
  const config = message.config;
  const blocks = getBlocks(config);
  const position = config.notificationPosition || 'top';
  const animationDirection = config.notificationAnimation || 'down';
  const [slideAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    // Initial position based on animation direction
    let initialValue = 0;
    if (animationDirection === 'up') initialValue = SCREEN_HEIGHT;
    else if (animationDirection === 'down') initialValue = -SCREEN_HEIGHT;
    else if (animationDirection === 'left') initialValue = SCREEN_WIDTH;
    else if (animationDirection === 'right') initialValue = -SCREEN_WIDTH;

    slideAnim.setValue(initialValue);

    Animated.spring(slideAnim, {
      toValue: 0,
      friction: 8,
      tension: 40,
      useNativeDriver: true,
    }).start();
  }, []);

  // Find image and text blocks
  const imageBlock = blocks.find(b => b.type === 'image');
  const textBlocks = blocks.filter(b => b.type === 'text' || b.type === 'html');

  const containerStyle: any = {
    position: 'absolute',
    left: position === 'left' ? 0 : position === 'right' ? undefined : SCREEN_WIDTH / 2 - 200,
    right: position === 'right' ? 0 : undefined,
    width: position === 'left' || position === 'right' ? '80%' : '90%',
    maxWidth: 400,
    zIndex: 9999,
    backgroundColor: config.backgroundColor || '#FFFFFF',
    padding: 16,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  };

  const transform: any[] = [];
  if (position === 'top' || position === 'bottom') {
    containerStyle[position] = position === 'top' ? 20 : undefined;
    if (position === 'bottom') {
      containerStyle.bottom = 20;
    }
    transform.push({ translateX: -200 }); // Center horizontally
    if (animationDirection === 'up' || animationDirection === 'down') {
      transform.push({ translateY: slideAnim });
    }
  } else {
    containerStyle[position] = 20;
    transform.push({ translateY: -100 }); // Center vertically
    if (animationDirection === 'left' || animationDirection === 'right') {
      transform.push({ translateX: slideAnim });
    }
  }

  return (
    <Animated.View style={[containerStyle, { transform }]}>
      {imageBlock && (
        <View style={{ flexShrink: 0 }}>
          <BlockRenderer block={imageBlock} {...blockHandlers(message, onButtonClick, onFormSubmit)} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        {textBlocks.map((block) => (
          <BlockRenderer
            key={block.id}
            block={block}
            {...blockHandlers(message, onButtonClick, onFormSubmit)}
          />
        ))}
      </View>
      {!imageBlock && textBlocks.length === 0 && blocks.length > 0 && (
        <View style={{ flex: 1 }}>
          {blocks.map((block) => (
            <BlockRenderer
              key={block.id}
              block={block}
              {...blockHandlers(message, onButtonClick, onFormSubmit)}
            />
          ))}
        </View>
      )}
      {shouldShowCloseButton(config) && (
        <TouchableOpacity
          style={styles.notificationCloseButton}
          onPress={() => onDismiss(message._id)}
        >
          <Text style={styles.notificationCloseButtonText}>×</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

/**
 * Render a message based on its type.
 * For multi-page IAM, keep `currentPageIndex` in app state and pass `onNavigatePage` to update it.
 */
export function MessageRenderer({
  message,
  onDismiss,
  onButtonClick,
  onFormSubmit,
  onNavigatePage,
  currentPageIndex,
}: MessageRendererProps) {
  const config = message.config;
  const messageType = getEffectiveMessageType(config);

  switch (messageType) {
    case 'banner':
      return (
        <BannerRenderer
          message={message}
          onDismiss={onDismiss}
          onButtonClick={onButtonClick}
          onFormSubmit={onFormSubmit}
        />
      );
    case 'popup':
      return (
        <ModalRenderer
          message={message}
          onDismiss={onDismiss}
          onButtonClick={onButtonClick}
          onFormSubmit={onFormSubmit}
          onNavigatePage={onNavigatePage}
          currentPageIndex={currentPageIndex}
        />
      );
    case 'modal':
      return (
        <ModalRenderer
          message={message}
          onDismiss={onDismiss}
          onButtonClick={onButtonClick}
          onFormSubmit={onFormSubmit}
          onNavigatePage={onNavigatePage}
          currentPageIndex={currentPageIndex}
        />
      );
    case 'full_screen':
      return (
        <FullScreenRenderer
          message={message}
          onDismiss={onDismiss}
          onButtonClick={onButtonClick}
          onFormSubmit={onFormSubmit}
          onNavigatePage={onNavigatePage}
          currentPageIndex={currentPageIndex}
        />
      );
    case 'notification':
      return (
        <NotificationRenderer
          message={message}
          onDismiss={onDismiss}
          onButtonClick={onButtonClick}
          onFormSubmit={onFormSubmit}
        />
      );
    default:
      return (
        <ModalRenderer
          message={message}
          onDismiss={onDismiss}
          onButtonClick={onButtonClick}
          onFormSubmit={onFormSubmit}
          onNavigatePage={onNavigatePage}
          currentPageIndex={currentPageIndex}
        />
      );
  }
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bannerScroll: {
    flex: 1,
  },
  dismissButton: {
    padding: 4,
    marginLeft: 8,
  },
  dismissButtonText: {
    fontSize: 24,
    color: '#666',
    lineHeight: 24,
  },
  popupContainer: {
    padding: 20,
    width: '90%',
    maxWidth: 500,
  },
  popupContent: {
    marginTop: 8,
  },
  modalContainer: {
    padding: 24,
    width: '85%',
    maxWidth: 600,
  },
  modalContent: {
    marginTop: 8,
  },
  closeButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  closeButtonText: {
    fontSize: 28,
    color: '#666',
    lineHeight: 28,
  },
  fullScreenContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#FFFFFF',
  },
  fullScreenCloseButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  fullScreenCloseButtonText: {
    fontSize: 32,
    color: '#666',
    lineHeight: 32,
  },
  fullScreenContent: {
    flex: 1,
    padding: 32,
  },
  fullScreenNavigation: {
    position: 'absolute',
    bottom: 20,
    left: '50%',
    transform: [{ translateX: -100 }],
    flexDirection: 'row',
    gap: 10,
    zIndex: 10,
  },
  navButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#007AFF',
    borderRadius: 4,
  },
  navButtonDisabled: {
    backgroundColor: '#CCCCCC',
    opacity: 0.5,
  },
  navButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  navButtonTextDisabled: {
    color: '#666666',
  },
  notificationCloseButton: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  notificationCloseButtonText: {
    fontSize: 20,
    color: '#666',
    lineHeight: 20,
  },
  modalNavigation: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
});

