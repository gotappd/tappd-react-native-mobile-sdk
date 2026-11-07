/**
 * Message Renderer for In-App Messages (React Native)
 */

import React, { useState, useEffect, useMemo, type ReactNode } from 'react';
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
  PanResponder,
} from 'react-native';
import { BlockRendererComponent as BlockRenderer, isSoleFullHtmlDocumentBlock } from './BlockRenderer';
import type {
  InAppMessage,
  InAppMessageConfig,
  InAppMessageType,
  InAppMessagePage,
  MessageContainerSettings,
} from '../types/inAppMessage';
import { mergeIamPageSurfaceSettings } from '../mergeIamPageSurfaceSettings';
import {
  IAM_ANIMATION_ENTER_DURATION_MS,
  IAM_MODAL_SCALE_ENTER_START,
} from '../constants/iamLayoutDefaults';
import {
  resolveIamBannerOuterPaddingPx,
  resolveIamCloseButtonStyle,
  resolveIamFullscreenContainerStyleNative,
  resolveIamModalContainerStyleNative,
  resolveIamNotificationContainerStyleNative,
  IAM_NOTIFICATION_CARD_PADDING_PX,
  resolveIamNotificationViewportPaddingPx,
  resolveIamOverlayOpacity,
  resolveIamScrollPaddingPx,
  resolveIamViewportPaddingPx,
  shouldShowIamCloseButton,
} from '../resolveIamCanvasLayout';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/** Stretch modal host to overlay width so containerSettings.widthMode resolves correctly. */
function modalShellHostStyle(soleFullHtml: boolean) {
  if (soleFullHtml) return { flex: 1, width: '100%' as const };
  return { alignSelf: 'stretch' as const, width: '100%' as const };
}

function IamCloseButton({
  config,
  onPress,
}: {
  config: InAppMessageConfig;
  onPress: () => void;
}) {
  if (!shouldShowIamCloseButton(config)) return null;
  const { size, color, layout } = resolveIamCloseButtonStyle(config);
  const fontSize = Math.floor(size * 0.85);
  return (
    <TouchableOpacity
      style={[styles.closeButtonBase, { width: size, height: size, ...layout }]}
      onPress={onPress}
    >
      <Text style={{ fontSize, color, lineHeight: fontSize }}>×</Text>
    </TouchableOpacity>
  );
}

/**
 * Resolve layout type — match dashboard preview + web SDK:
 * `containerSettings.displayType` wins over root `messageType`.
 */
function getEffectiveMessageType(config: InAppMessageConfig): InAppMessageType {
  const raw = config.containerSettings?.displayType ?? config.messageType ?? 'modal';
  const lower = String(raw).toLowerCase();
  if (lower === 'fullscreen' || lower === 'full_screen') {
    return 'full_screen';
  }
  return raw as InAppMessageType;
}

/**
 * Fade + scale enter for modal/popup. Guarantees the card is visible even if
 * the animation fails to start (e.g. remount / useNativeDriver edge cases).
 */
function runModalEnterAnimation(
  fadeAnim: Animated.Value,
  scaleAnim: Animated.Value
): void {
  fadeAnim.setValue(0);
  scaleAnim.setValue(IAM_MODAL_SCALE_ENTER_START);
  Animated.parallel([
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: IAM_ANIMATION_ENTER_DURATION_MS,
      useNativeDriver: true,
    }),
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 8,
      tension: 40,
      useNativeDriver: true,
    }),
  ]).start(({ finished }) => {
    if (!finished) {
      fadeAnim.setValue(1);
      scaleAnim.setValue(1);
    }
  });
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

/** Same merge as dashboard + web SDK (see packages/shared mergeIamPageSurfaceSettings). */
function mergePageSurfaceSettings(
  cs: MessageContainerSettings | undefined,
  pageSettings?: InAppMessagePage['settings']
): MessageContainerSettings {
  return mergeIamPageSurfaceSettings(cs ?? undefined, pageSettings ?? undefined) as MessageContainerSettings;
}

function useIamPageSwipePanResponder(
  messageId: string,
  config: InAppMessageConfig,
  pageIndex: number,
  onNavigatePage?: (id: string, idx: number) => void
) {
  return useMemo(() => {
    const n = config.pages?.length ?? 0;
    if (n <= 1 || !onNavigatePage) {
      return PanResponder.create({
        onStartShouldSetPanResponder: () => false,
      });
    }
    const last = n - 1;
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.2,
      onPanResponderTerminationRequest: () => true,
      onPanResponderRelease: (_e, g) => {
        if (Math.abs(g.dx) < 48) return;
        if (g.dx < 0 && pageIndex < last) {
          onNavigatePage(messageId, pageIndex + 1);
        } else if (g.dx > 0 && pageIndex > 0) {
          onNavigatePage(messageId, pageIndex - 1);
        }
      },
    });
  }, [messageId, config.pages, pageIndex, onNavigatePage]);
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
  /**
   * When true (or when the page is a sole full HTML document), skip ScrollView
   * and fill the parent edge-to-edge — matches dashboard mockup fullscreen HTML.
   */
  edgeToEdgeHtml?: boolean;
  /**
   * Toast/modal cards size to their blocks (preview parity). Avoids flex:1 collapse
   * when the parent has no explicit height.
   */
  contentSized?: boolean;
  maxScrollHeight?: number;
}

function PartitionedScrollBody({
  blocks,
  message,
  scrollStyle,
  onButtonClick,
  onFormSubmit,
  edgeToEdgeHtml = false,
  contentSized = false,
  maxScrollHeight,
}: PartitionedScrollBodyProps) {
  const { flow, pinnedTop, pinnedBottom } = partitionBlocksByRowPin(blocks);
  const [topInset, setTopInset] = useState(0);
  const [bottomInset, setBottomInset] = useState(0);
  const h = blockHandlers(message, onButtonClick, onFormSubmit);
  const topEdgePx = pinnedEdgeInsetPx(pinnedTop, 'top');
  const bottomEdgePx = pinnedEdgeInsetPx(pinnedBottom, 'bottom');

  // Mirror HtmlBlockRenderer.vue: a lone full HTML document fills the device
  // screen — no padded ScrollView wrapping a content-sized WebView.
  const soleFullHtml =
    edgeToEdgeHtml ||
    (pinnedTop.length === 0 &&
      pinnedBottom.length === 0 &&
      isSoleFullHtmlDocumentBlock(flow));

  if (soleFullHtml && flow.length === 1) {
    return (
      <View style={{ flex: 1, width: '100%', minHeight: SCREEN_HEIGHT }}>
        <BlockRenderer key={flow[0].id} block={flow[0]} htmlFillViewport {...h} />
      </View>
    );
  }

  const shellStyle = contentSized
    ? { position: 'relative' as const, width: '100%' as const }
    : { position: 'relative' as const, flex: 1, minHeight: 80 };

  const scrollViewStyle = contentSized
    ? [
        { width: '100%' as const },
        maxScrollHeight != null ? { maxHeight: maxScrollHeight } : null,
        scrollStyle,
      ]
    : scrollStyle;

  return (
    <View style={shellStyle}>
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
        style={scrollViewStyle}
        nestedScrollEnabled
        contentContainerStyle={{
          paddingTop: topInset + topEdgePx,
          paddingBottom: bottomInset + bottomEdgePx,
          ...(contentSized ? { flexGrow: 0 } : null),
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
  children: ReactNode;
  pageIndex?: number;
  /** Sole full-HTML page: edge-to-edge like the dashboard device mockup. */
  edgeToEdge?: boolean;
}

/** Dashboard preview container surface — config-driven, no hardcoded shell sizing. */
function ModalCardSurface({
  config,
  fadeAnim,
  scaleAnim,
  children,
  pageIndex = 0,
  edgeToEdge = false,
}: ModalCardSurfaceProps) {
  const cs = config.containerSettings;
  const merged = mergePageSurfaceSettings(cs, config.pages?.[pageIndex]?.settings);
  const useBg =
    !!String(merged?.backgroundImage || '').trim() && merged?.backgroundImageEnabled !== false;
  const resolved = resolveIamModalContainerStyleNative(config, pageIndex, SCREEN_WIDTH);
  const solidBg = (resolved.backgroundColor as string) ?? resolveContainerBgColor(merged) ?? '#FFFFFF';
  const border = edgeToEdge ? {} : resolveContainerBorderStyle(cs);
  const br = edgeToEdge ? 0 : (resolved.borderRadius as number);

  const animatedCard = [
    edgeToEdge ? null : resolved,
    {
      opacity: fadeAnim,
      transform: [{ scale: scaleAnim }],
      borderRadius: br,
      overflow: 'hidden' as const,
      flexDirection: 'column' as const,
      maxHeight: edgeToEdge ? SCREEN_HEIGHT : SCREEN_HEIGHT * 0.9,
      ...border,
    },
    edgeToEdge
      ? {
          flex: 1,
          width: '100%' as const,
          height: SCREEN_HEIGHT,
          maxWidth: SCREEN_WIDTH,
          maxHeight: SCREEN_HEIGHT,
          padding: 0,
          margin: 0,
        }
      : null,
  ];

  if (useBg) {
    return (
      <Animated.View style={[animatedCard, { backgroundColor: 'transparent' }]}>
        <ImageBackground
          source={{ uri: merged.backgroundImage! }}
          style={{ width: '100%', ...(edgeToEdge ? { flex: 1, height: '100%' } : {}) }}
          resizeMode="cover"
          imageStyle={{ borderRadius: br }}
        >
          <View style={{ flexGrow: 1, flex: edgeToEdge ? 1 : undefined }}>{children}</View>
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
export function BannerRenderer({
  message,
  onDismiss,
  onButtonClick,
  onFormSubmit,
  onNavigatePage,
  currentPageIndex,
}: MessageRendererProps) {
  const config = message.config;
  const position = config.position || 'top';
  const pageIndex = currentPageIndex !== undefined ? currentPageIndex : 0;
  const blocks = getBlocks(config, pageIndex);
  const { flow, pinnedTop, pinnedBottom } = partitionBlocksByRowPin(blocks);
  const cs = config.containerSettings;
  const merged = mergePageSurfaceSettings(cs, config.pages?.[pageIndex]?.settings);
  const useBg =
    !!String(merged?.backgroundImage || '').trim() && merged?.backgroundImageEnabled !== false;
  const solidBg = resolveContainerBgColor(merged) ?? config.backgroundColor ?? '#FFFFFF';
  const [fadeAnim] = useState(new Animated.Value(0));
  const pan = useIamPageSwipePanResponder(message._id, config, pageIndex, onNavigatePage);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: IAM_ANIMATION_ENTER_DURATION_MS,
      useNativeDriver: true,
    }).start();
  }, [pageIndex]);

  const containerStyle: any = {
    position: 'absolute',
    left: 0,
    right: 0,
    width: '100%',
    zIndex: 9999,
    padding: resolveIamBannerOuterPaddingPx(),
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
      {config.pages && config.pages.length > 1 && config.showNavigationButtons !== false && (
        <View style={styles.bannerPageNavigation}>
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
            style={[
              styles.navButton,
              pageIndex >= (config.pages?.length ?? 1) - 1 && styles.navButtonDisabled,
            ]}
            disabled={pageIndex >= (config.pages?.length ?? 1) - 1}
            onPress={() => {
              const last = (config.pages?.length ?? 1) - 1;
              if (pageIndex < last && onNavigatePage) {
                onNavigatePage(message._id, pageIndex + 1);
              }
            }}
          >
            <Text
              style={[
                styles.navButtonText,
                pageIndex >= (config.pages?.length ?? 1) - 1 && styles.navButtonTextDisabled,
              ]}
            >
              Next →
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  );

  if (useBg) {
    return (
      <Animated.View
        {...pan.panHandlers}
        style={[containerStyle, { opacity: fadeAnim, backgroundColor: 'transparent' }]}
      >
        <ImageBackground
          source={{ uri: merged.backgroundImage! }}
          style={{ width: '100%' }}
          resizeMode="cover"
        >
          {inner}
        </ImageBackground>
      </Animated.View>
    );
  }

  return (
    <Animated.View {...pan.panHandlers} style={[containerStyle, { opacity: fadeAnim, backgroundColor: solidBg }]}>
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
  const soleFullHtml = isSoleFullHtmlDocumentBlock(blocks);
  const overlay = config.overlay !== false;
  const overlayOpacity = resolveIamOverlayOpacity(config);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [scaleAnim] = useState(new Animated.Value(IAM_MODAL_SCALE_ENTER_START));

  useEffect(() => {
    runModalEnterAnimation(fadeAnim, scaleAnim);
  }, [pageIndex]); // Re-animate on page change

  const handleOverlayPress = () => {
    if (config.dismissible !== false) {
      onDismiss(message._id);
    }
  };

  const viewportPad = soleFullHtml ? 0 : resolveIamViewportPaddingPx(config);
  const scrollPad = resolveIamScrollPaddingPx();

  const pan = useIamPageSwipePanResponder(message._id, config, pageIndex, onNavigatePage);

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
          { padding: viewportPad },
          soleFullHtml ? { padding: 0 } : null,
        ]}
        onPress={handleOverlayPress}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
          style={modalShellHostStyle(soleFullHtml)}
        >
          <View
            {...pan.panHandlers}
            collapsable={false}
            style={modalShellHostStyle(soleFullHtml)}
          >
          <ModalCardSurface
            config={config}
            pageIndex={pageIndex}
            fadeAnim={fadeAnim}
            scaleAnim={scaleAnim}
            edgeToEdge={soleFullHtml}
          >
            <IamCloseButton config={config} onPress={() => onDismiss(message._id)} />
            <PartitionedScrollBody
              blocks={blocks}
              message={message}
              contentSized={!soleFullHtml}
              maxScrollHeight={soleFullHtml ? undefined : SCREEN_HEIGHT * 0.72}
              scrollStyle={soleFullHtml ? { flex: 1, padding: 0 } : { padding: scrollPad }}
              onButtonClick={onButtonClick}
              onFormSubmit={onFormSubmit}
              edgeToEdgeHtml={soleFullHtml}
            />
            {!soleFullHtml && config.pages && config.pages.length > 1 && config.showNavigationButtons !== false && (() => {
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
          </View>
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
  const soleFullHtml = isSoleFullHtmlDocumentBlock(blocks);
  const overlay = config.overlay !== false;
  const overlayOpacity = resolveIamOverlayOpacity(config);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [scaleAnim] = useState(new Animated.Value(IAM_MODAL_SCALE_ENTER_START));

  useEffect(() => {
    runModalEnterAnimation(fadeAnim, scaleAnim);
  }, [pageIndex]);

  const handleOverlayPress = () => {
    if (config.dismissible !== false) {
      onDismiss(message._id);
    }
  };

  const viewportPad = soleFullHtml ? 0 : resolveIamViewportPaddingPx(config);
  const scrollPad = resolveIamScrollPaddingPx();

  const pan = useIamPageSwipePanResponder(message._id, config, pageIndex, onNavigatePage);

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
          { padding: viewportPad },
        ]}
        onPress={handleOverlayPress}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
          style={modalShellHostStyle(soleFullHtml)}
        >
          <View
            {...pan.panHandlers}
            collapsable={false}
            style={modalShellHostStyle(soleFullHtml)}
          >
          <ModalCardSurface
            config={config}
            pageIndex={pageIndex}
            fadeAnim={fadeAnim}
            scaleAnim={scaleAnim}
            edgeToEdge={soleFullHtml}
          >
            <IamCloseButton config={config} onPress={() => onDismiss(message._id)} />
            <PartitionedScrollBody
              blocks={blocks}
              message={message}
              contentSized={!soleFullHtml}
              maxScrollHeight={soleFullHtml ? undefined : SCREEN_HEIGHT * 0.72}
              scrollStyle={soleFullHtml ? { flex: 1, padding: 0 } : { padding: scrollPad }}
              onButtonClick={onButtonClick}
              onFormSubmit={onFormSubmit}
              edgeToEdgeHtml={soleFullHtml}
            />
            {!soleFullHtml && config.pages && config.pages.length > 1 && config.showNavigationButtons !== false && (() => {
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
          </View>
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
  const soleFullHtml = isSoleFullHtmlDocumentBlock(blocks);
  const cs = config.containerSettings;
  const merged = mergePageSurfaceSettings(cs, config.pages?.[pageIndex]?.settings);
  const useBg =
    !!String(merged?.backgroundImage || '').trim() && merged?.backgroundImageEnabled !== false;
  const shellStyle = resolveIamFullscreenContainerStyleNative(config, pageIndex);
  const scrollPad = resolveIamScrollPaddingPx();
  const pan = useIamPageSwipePanResponder(message._id, config, pageIndex, onNavigatePage);

  const inner = (
    <View
      {...pan.panHandlers}
      style={[
        styles.fullScreenContainer,
        shellStyle,
        useBg ? { backgroundColor: 'transparent' } : null,
      ]}
    >
      <IamCloseButton config={config} onPress={() => onDismiss(message._id)} />

      {!soleFullHtml && config.pages && config.pages.length > 1 && config.showNavigationButtons !== false && (() => {
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
        scrollStyle={
          soleFullHtml ? { flex: 1, padding: 0 } : { flex: 1, padding: scrollPad }
        }
        onButtonClick={onButtonClick}
        onFormSubmit={onFormSubmit}
        edgeToEdgeHtml={soleFullHtml}
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
          source={{ uri: merged.backgroundImage! }}
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
 * Notification Renderer — toast-style at screen edge (matches dashboard preview + web SDK).
 * Uses a transparent Modal so the toast overlays the full screen even when MessageRenderer
 * is mounted inside a nested/clipped View.
 */
export function NotificationRenderer({
  message,
  onDismiss,
  onButtonClick,
  onFormSubmit,
  onNavigatePage,
  currentPageIndex,
}: MessageRendererProps) {
  const config = message.config;
  const pageIndex = currentPageIndex !== undefined ? currentPageIndex : 0;
  const blocks = getBlocks(config, pageIndex);
  const cs = config.containerSettings;
  const position =
    (cs?.notificationPosition || config.notificationPosition || 'top') as
      | 'top'
      | 'bottom'
      | 'left'
      | 'right';
  const animationDirection =
    (cs?.notificationAnimation || config.notificationAnimation || 'down') as
      | 'up'
      | 'down'
      | 'left'
      | 'right';
  const [slideAnim] = useState(new Animated.Value(0));
  const cardStyle = resolveIamNotificationContainerStyleNative(
    config,
    pageIndex,
    SCREEN_WIDTH,
    SCREEN_HEIGHT
  );
  const edgePad = resolveIamNotificationViewportPaddingPx();

  useEffect(() => {
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
    }).start(({ finished }) => {
      if (!finished) slideAnim.setValue(0);
    });
  }, [pageIndex]);

  const isHorizontal = position === 'left' || position === 'right';
  const rootAlign: any = {
    flex: 1,
    padding: edgePad,
    justifyContent:
      position === 'top'
        ? 'flex-start'
        : position === 'bottom'
          ? 'flex-end'
          : 'center',
    alignItems:
      position === 'left'
        ? 'flex-start'
        : position === 'right'
          ? 'flex-end'
          : 'center',
  };

  const cardPad = typeof cardStyle.padding === 'number' ? cardStyle.padding : IAM_NOTIFICATION_CARD_PADDING_PX;
  const notificationCardStyle: any = {
    ...cardStyle,
    width: isHorizontal ? '80%' : cardStyle.width,
    flexDirection: 'column' as const,
    overflow: 'hidden' as const,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  };

  const slideTransform =
    animationDirection === 'left' || animationDirection === 'right'
      ? [{ translateX: slideAnim }]
      : [{ translateY: slideAnim }];

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
      <View style={rootAlign} pointerEvents="box-none">
        <Animated.View style={[notificationCardStyle, { transform: slideTransform }]}>
          <IamCloseButton config={config} onPress={() => onDismiss(message._id)} />
          <PartitionedScrollBody
            blocks={blocks}
            message={message}
            contentSized
            maxScrollHeight={SCREEN_HEIGHT * 0.72 - cardPad * 2}
            scrollStyle={{ padding: resolveIamScrollPaddingPx() }}
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
                  <Text style={[styles.navButtonText, pageIndex === 0 && styles.navButtonTextDisabled]}>
                    ← Previous
                  </Text>
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
                  <Text
                    style={[
                      styles.navButtonText,
                      pageIndex >= lastPageIndex && styles.navButtonTextDisabled,
                    ]}
                  >
                    Next →
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })()}
        </Animated.View>
      </View>
    </Modal>
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
          onNavigatePage={onNavigatePage}
          currentPageIndex={currentPageIndex}
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
          onNavigatePage={onNavigatePage}
          currentPageIndex={currentPageIndex}
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
  closeButtonBase: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  fullScreenContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#FFFFFF',
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
  bannerPageNavigation: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginTop: 8,
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
  modalNavigation: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
});

