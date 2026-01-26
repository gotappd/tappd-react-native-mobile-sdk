/**
 * Block Renderer for In-App Messages (React Native)
 */

import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Linking, useWindowDimensions } from 'react-native';
import RenderHTML from 'react-native-render-html';
import type { Block } from '../types/inAppMessage';

interface BlockRendererProps {
  block: Block;
  onButtonClick?: (link: string, text: string) => void;
}

/**
 * Render an image block
 */
export function ImageBlock({ block }: { block: Block }) {
  const config = block.config.image;
  if (!config || !config.url) {
    return null;
  }

  const alignmentStyle = config.alignment === 'center' 
    ? styles.centerAligned 
    : config.alignment === 'right'
    ? styles.rightAligned
    : styles.leftAligned;

  return (
    <View style={[styles.blockContainer, alignmentStyle]}>
      <Image
        source={{ uri: config.url }}
        style={[
          styles.image,
          config.width ? { width: parseFloat(config.width) } : undefined,
          config.height ? { height: parseFloat(config.height) } : undefined,
        ]}
        resizeMode="contain"
      />
    </View>
  );
}

/**
 * Render a text block
 */
export function TextBlock({ block }: { block: Block }) {
  const config = block.config.text;
  if (!config || !config.content) {
    return null;
  }

  const alignmentStyle = config.alignment === 'center'
    ? styles.centerAligned
    : config.alignment === 'right'
    ? styles.rightAligned
    : styles.leftAligned;

  const fontSize = config.fontSize
    ? parseFontSize(config.fontSize)
    : 14;

  const textStyle: any = {
    fontSize,
    fontWeight: config.fontWeight === 'bold' ? 'bold' : 'normal',
  };

  if (config.color) {
    textStyle.color = config.color;
  }

  return (
    <View style={[styles.blockContainer, alignmentStyle]}>
      <Text style={[styles.text, textStyle]}>{config.content}</Text>
    </View>
  );
}

/**
 * Render a button block
 */
export function ButtonBlock({ block, onButtonClick }: BlockRendererProps) {
  const config = block.config.button;
  if (!config || !config.text) {
    return null;
  }

  const alignmentStyle = config.alignment === 'center'
    ? styles.centerAligned
    : config.alignment === 'right'
    ? styles.rightAligned
    : styles.leftAligned;

  const buttonStyle: any = {
    backgroundColor: config.backgroundColor || '#007AFF',
  };

  const textStyle: any = {
    color: config.textColor || '#FFFFFF',
  };

  const handlePress = () => {
    if (onButtonClick) {
      onButtonClick(config.link || '#', config.text);
    } else {
      // Default behavior
      if (config.link && config.link !== '#') {
        Linking.openURL(config.link);
      }
    }
  };

  return (
    <View style={[styles.blockContainer, alignmentStyle]}>
      <TouchableOpacity
        style={[styles.button, buttonStyle]}
        onPress={handlePress}
        activeOpacity={0.8}
      >
        <Text style={[styles.buttonText, textStyle]}>{config.text}</Text>
      </TouchableOpacity>
    </View>
  );
}

/**
 * Render an HTML block (simplified - in production use react-native-render-html)
 */
export function HtmlBlock({ block }: { block: Block }) {
  const config = block.config.html;
  if (!config || !config.content) {
    return null;
  }

  const { width } = useWindowDimensions();

  return (
    <View style={styles.blockContainer}>
      <RenderHTML
        contentWidth={width}
        source={{ html: config.content }}
      />
    </View>
  );
}

/**
 * Render a block based on its type
 */
export function BlockRendererComponent({ block, onButtonClick }: BlockRendererProps) {
  switch (block.type) {
    case 'image':
      return <ImageBlock block={block} />;
    case 'text':
      return <TextBlock block={block} />;
    case 'button':
      return <ButtonBlock block={block} onButtonClick={onButtonClick} />;
    case 'html':
      return <HtmlBlock block={block} />;
    default:
      return null;
  }
}

/**
 * Parse font size string to number
 */
function parseFontSize(fontSize: string): number {
  const sizeMap: Record<string, number> = {
    'sm': 12,
    'base': 14,
    'lg': 16,
    'xl': 18,
    '2xl': 20,
    '3xl': 24,
  };

  if (sizeMap[fontSize]) {
    return sizeMap[fontSize];
  }

  // Try to parse as number
  const parsed = parseFloat(fontSize);
  if (!isNaN(parsed)) {
    return parsed;
  }

  return 14; // Default
}

const styles = StyleSheet.create({
  blockContainer: {
    marginVertical: 4,
  },
  leftAligned: {
    alignItems: 'flex-start',
  },
  centerAligned: {
    alignItems: 'center',
  },
  rightAligned: {
    alignItems: 'flex-end',
  },
  image: {
    maxWidth: '100%',
    height: 200,
  },
  text: {
    fontSize: 14,
    lineHeight: 20,
  },
  button: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 4,
    minWidth: 100,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
});

