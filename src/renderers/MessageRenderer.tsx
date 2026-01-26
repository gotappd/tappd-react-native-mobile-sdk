/**
 * Message Renderer for In-App Messages (React Native)
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
  ScrollView,
} from 'react-native';
import { BlockRendererComponent as BlockRenderer } from './BlockRenderer';
import type { InAppMessage, InAppMessageConfig } from '../types/inAppMessage';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface MessageRendererProps {
  message: InAppMessage;
  onDismiss: (messageId: string) => void;
  onButtonClick?: (messageId: string, link: string, text: string) => void;
  onNavigatePage?: (messageId: string, pageIndex: number) => void;
  currentPageIndex?: number;
}

/**
 * Get blocks from message config
 */
function getBlocks(config: InAppMessageConfig, pageIndex: number = 0): any[] {
  // Support both legacy blocks and new pages structure
  if (config.pages && config.pages.length > 0) {
    // Use specified page's blocks or first page
    const targetPage = config.pages[pageIndex] || config.pages[0];
    return targetPage.blocks || [];
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

/**
 * Banner Renderer Component
 */
export function BannerRenderer({ message, onDismiss, onButtonClick }: MessageRendererProps) {
  const config = message.config;
  const position = config.position || 'top';
  const blocks = getBlocks(config);
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
    backgroundColor: config.backgroundColor || '#FFFFFF',
    padding: 12,
    borderBottomWidth: position === 'top' ? 1 : 0,
    borderTopWidth: position === 'bottom' ? 1 : 0,
    borderColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  };

  if (position === 'top') {
    containerStyle.top = 0;
  } else if (position === 'bottom') {
    containerStyle.bottom = 0;
  } else {
    containerStyle.top = SCREEN_HEIGHT / 2;
    containerStyle.transform = [{ translateY: -100 }];
  }

  return (
    <Animated.View style={[containerStyle, { opacity: fadeAnim }]}>
      <View style={styles.bannerContent}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bannerScroll}>
          {blocks.map((block) => (
            <BlockRenderer
              key={block.id}
              block={block}
              onButtonClick={(link, text) => {
                if (onButtonClick) {
                  onButtonClick(message._id, link, text);
                }
              }}
            />
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
    </Animated.View>
  );
}

/**
 * Popup Renderer Component
 */
export function PopupRenderer({ message, onDismiss, onButtonClick, onNavigatePage, currentPageIndex }: MessageRendererProps) {
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
        ]}
        onPress={handleOverlayPress}
      >
        <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
          <Animated.View
            style={[
              styles.popupContainer,
              {
                opacity: fadeAnim,
                transform: [{ scale: scaleAnim }],
                backgroundColor: '#FFFFFF',
                maxWidth: SCREEN_WIDTH * 0.9,
                borderRadius: 8,
              },
            ]}
          >
            {((config.showCloseButton !== false && config.closeButton !== false) && (config.showCloseButton !== undefined || config.closeButton !== undefined)) && (
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => onDismiss(message._id)}
              >
                <Text style={styles.closeButtonText}>×</Text>
              </TouchableOpacity>
            )}
            <ScrollView style={styles.popupContent}>
              {blocks.map((block) => (
                <BlockRenderer
                  key={block.id}
                  block={block}
                  onButtonClick={(link, text) => {
                    if (onButtonClick) {
                      onButtonClick(message._id, link, text);
                    }
                  }}
                />
              ))}
            </ScrollView>
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
          </Animated.View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

/**
 * Modal Renderer Component (similar to popup but larger)
 */
export function ModalRenderer({ message, onDismiss, onButtonClick, onNavigatePage, currentPageIndex }: MessageRendererProps) {
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
        ]}
        onPress={handleOverlayPress}
      >
        <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
          <Animated.View
            style={[
              styles.modalContainer,
              {
                opacity: fadeAnim,
                transform: [{ scale: scaleAnim }],
                backgroundColor: '#FFFFFF',
                maxWidth: SCREEN_WIDTH * 0.85,
                maxHeight: SCREEN_HEIGHT * 0.8,
                borderRadius: 8,
              },
            ]}
          >
            {((config.showCloseButton !== false && config.closeButton !== false) && (config.showCloseButton !== undefined || config.closeButton !== undefined)) && (
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => onDismiss(message._id)}
              >
                <Text style={styles.closeButtonText}>×</Text>
              </TouchableOpacity>
            )}
            <ScrollView style={styles.modalContent}>
              {blocks.map((block) => (
                <BlockRenderer
                  key={block.id}
                  block={block}
                  onButtonClick={(link, text) => {
                    if (onButtonClick) {
                      onButtonClick(message._id, link, text);
                    }
                  }}
                />
              ))}
            </ScrollView>
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
          </Animated.View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

/**
 * Full Screen Renderer Component
 */
export function FullScreenRenderer({ message, onDismiss, onButtonClick, onNavigatePage, currentPageIndex }: MessageRendererProps) {
  const config = message.config;
  const pageIndex = currentPageIndex !== undefined ? currentPageIndex : 0;
  const blocks = getBlocks(config, pageIndex);

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
      <View style={styles.fullScreenContainer}>
        {((config.showCloseButton !== false && config.closeButton !== false) && (config.showCloseButton !== undefined || config.closeButton !== undefined)) && (
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

        <ScrollView style={styles.fullScreenContent}>
          {blocks.map((block) => (
            <BlockRenderer
              key={block.id}
              block={block}
              onButtonClick={(link, text) => {
                if (onButtonClick) {
                  onButtonClick(message._id, link, text);
                }
              }}
            />
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

/**
 * Notification Renderer Component
 */
export function NotificationRenderer({ message, onDismiss, onButtonClick }: MessageRendererProps) {
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
          <BlockRenderer
            block={imageBlock}
            onButtonClick={(link, text) => {
              if (onButtonClick) {
                onButtonClick(message._id, link, text);
              }
            }}
          />
        </View>
      )}
      <View style={{ flex: 1 }}>
        {textBlocks.map((block) => (
          <BlockRenderer
            key={block.id}
            block={block}
            onButtonClick={(link, text) => {
              if (onButtonClick) {
                onButtonClick(message._id, link, text);
              }
            }}
          />
        ))}
      </View>
      {((config.showCloseButton !== false && config.closeButton !== false) && (config.showCloseButton !== undefined || config.closeButton !== undefined)) && (
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
 * Render a message based on its type
 */
export function MessageRenderer({ message, onDismiss, onButtonClick, onNavigatePage, currentPageIndex }: MessageRendererProps) {
  const config = message.config;
  const messageType = config.messageType || 'popup';

  switch (messageType) {
    case 'banner':
      return <BannerRenderer message={message} onDismiss={onDismiss} onButtonClick={onButtonClick} />;
    case 'popup':
      // Map popup to modal behavior
      return <ModalRenderer message={message} onDismiss={onDismiss} onButtonClick={onButtonClick} onNavigatePage={onNavigatePage} currentPageIndex={currentPageIndex} />;
    case 'modal':
      return <ModalRenderer message={message} onDismiss={onDismiss} onButtonClick={onButtonClick} onNavigatePage={onNavigatePage} currentPageIndex={currentPageIndex} />;
    case 'full_screen':
      return <FullScreenRenderer message={message} onDismiss={onDismiss} onButtonClick={onButtonClick} onNavigatePage={onNavigatePage} currentPageIndex={currentPageIndex} />;
    case 'notification':
      return <NotificationRenderer message={message} onDismiss={onDismiss} onButtonClick={onButtonClick} />;
    default:
      return <ModalRenderer message={message} onDismiss={onDismiss} onButtonClick={onButtonClick} onNavigatePage={onNavigatePage} currentPageIndex={currentPageIndex} />;
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

