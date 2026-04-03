/**
 * Block Renderer for In-App Messages (React Native)
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Linking,
  useWindowDimensions,
  TextInput,
  ScrollView,
} from 'react-native';
import RenderHTML from 'react-native-render-html';
import type { Block, InputField, SpacingConfig } from '../types/inAppMessage';

export interface BlockRendererProps {
  block: Block;
  onButtonClick?: (link: string, text: string, action?: any) => void;
  onFormSubmit?: (formData: Record<string, any>, submitAction?: any) => void;
  /**
   * When row blocks are pinned (top/bottom), they are rendered outside the scroll area.
   * `inPinnedStack`: margins are zeroed on the row flex to match dashboard preview (outer shell handles offset).
   */
  rowPinContext?: 'default' | 'inPinnedStack';
}

function spacingStyle(s?: SpacingConfig): object {
  if (!s) return {};
  const o: Record<string, number | undefined> = {};
  if (s.padding !== undefined) o.padding = s.padding;
  if (s.paddingTop !== undefined) o.paddingTop = s.paddingTop;
  if (s.paddingRight !== undefined) o.paddingRight = s.paddingRight;
  if (s.paddingBottom !== undefined) o.paddingBottom = s.paddingBottom;
  if (s.paddingLeft !== undefined) o.paddingLeft = s.paddingLeft;
  if (s.margin !== undefined) o.margin = s.margin;
  if (s.marginTop !== undefined) o.marginTop = s.marginTop;
  if (s.marginRight !== undefined) o.marginRight = s.marginRight;
  if (s.marginBottom !== undefined) o.marginBottom = s.marginBottom;
  if (s.marginLeft !== undefined) o.marginLeft = s.marginLeft;
  return o;
}

export function ImageBlock({ block }: { block: Block }) {
  const config = block.config.image;
  if (!config || !config.url) {
    return null;
  }

  const alignmentStyle =
    config.alignment === 'center'
      ? styles.centerAligned
      : config.alignment === 'right'
        ? styles.rightAligned
        : styles.leftAligned;

  return (
    <View style={[styles.blockContainer, alignmentStyle, spacingStyle(config)]}>
      <Image
        source={{ uri: config.url }}
        style={[
          styles.image,
          config.width ? { width: parseFloat(String(config.width)) || 200 } : undefined,
          config.height ? { height: parseFloat(String(config.height)) || 100 } : undefined,
        ]}
        resizeMode="contain"
      />
    </View>
  );
}

export function TextBlock({ block }: { block: Block }) {
  const config = block.config.text;
  if (!config || !config.content) {
    return null;
  }

  const alignmentStyle =
    config.alignment === 'center'
      ? styles.centerAligned
      : config.alignment === 'right'
        ? styles.rightAligned
        : styles.leftAligned;

  const fontSize = config.fontSize ? parseFontSize(config.fontSize) : 14;

  const textStyle: any = {
    fontSize,
    fontWeight: config.fontWeight === 'bold' ? 'bold' : 'normal',
  };

  if (config.color) {
    textStyle.color = config.color;
  }

  return (
    <View style={[styles.blockContainer, alignmentStyle, spacingStyle(config)]}>
      <Text style={[styles.text, textStyle]}>{config.content}</Text>
    </View>
  );
}

export function ButtonBlock({ block, onButtonClick }: BlockRendererProps) {
  const config = block.config.button;
  if (!config || !config.text) {
    return null;
  }

  const alignmentStyle =
    config.alignment === 'center'
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
    const link = config.link || '#';
    if (onButtonClick) {
      onButtonClick(link, config.text || '', config.action);
      return;
    }
    if (config.link && config.link !== '#') {
      Linking.openURL(config.link);
    }
  };

  return (
    <View style={[styles.blockContainer, alignmentStyle, spacingStyle(config)]}>
      <TouchableOpacity style={[styles.button, buttonStyle]} onPress={handlePress} activeOpacity={0.8}>
        <Text style={[styles.buttonText, textStyle]}>{config.text}</Text>
      </TouchableOpacity>
    </View>
  );
}

export function HtmlBlock({ block }: { block: Block }) {
  const config = block.config.html;
  if (!config || !config.content) {
    return null;
  }

  const { width } = useWindowDimensions();

  return (
    <View style={[styles.blockContainer, spacingStyle(config)]}>
      <RenderHTML contentWidth={width - 48} source={{ html: config.content }} />
    </View>
  );
}

function FieldEditor({
  field,
  value,
  onChange,
}: {
  field: InputField;
  value: string;
  onChange: (v: string) => void;
}) {
  if (field.type === 'textarea') {
    return (
      <TextInput
        style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
        multiline
        placeholder={field.placeholder}
        value={value}
        onChangeText={onChange}
      />
    );
  }
  if (field.type === 'select' && field.options && field.options.length > 0) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
        {field.options.map((opt) => (
          <TouchableOpacity
            key={opt}
            style={[
              styles.selectChip,
              value === opt && styles.selectChipActive,
            ]}
            onPress={() => onChange(opt)}
          >
            <Text style={value === opt ? styles.selectChipTextActive : styles.selectChipText}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  }
  const keyboardType =
    field.type === 'email'
      ? 'email-address'
      : field.type === 'number'
        ? 'numeric'
        : field.type === 'tel'
          ? 'phone-pad'
          : 'default';

  return (
    <TextInput
      style={styles.input}
      placeholder={field.placeholder}
      value={value}
      onChangeText={onChange}
      keyboardType={keyboardType as any}
    />
  );
}

function InputFieldBlock({ block }: { block: Block }) {
  const field = block.config.input;
  if (!field) return null;
  const [val, setVal] = useState(field.defaultValue || '');
  return (
    <View style={[styles.formField, spacingStyle(field as any)]}>
      <Text style={styles.label}>{field.label}</Text>
      <FieldEditor field={field} value={val} onChange={setVal} />
    </View>
  );
}

function FormBlock({ block, onFormSubmit }: BlockRendererProps) {
  const cfg = block.config.form;
  if (!cfg || !cfg.fields?.length) return null;

  const initial = useMemo(() => {
    const m: Record<string, string> = {};
    cfg.fields.forEach((f) => {
      m[f.name] = f.defaultValue || '';
    });
    return m;
  }, [cfg]);

  const [values, setValues] = useState<Record<string, string>>(initial);

  const setField = (name: string, v: string) => {
    setValues((prev) => ({ ...prev, [name]: v }));
  };

  const submit = () => {
    if (onFormSubmit) {
      onFormSubmit(values, cfg.submitAction);
    }
  };

  return (
    <View style={[styles.formWrap, spacingStyle({ padding: 8 })]}>
      {cfg.fields.map((field) => (
        <View key={field.id} style={styles.formField}>
          <Text style={styles.label}>{field.label}</Text>
          <FieldEditor
            field={field}
            value={values[field.name] ?? ''}
            onChange={(v) => setField(field.name, v)}
          />
        </View>
      ))}
      <TouchableOpacity style={styles.formSubmit} onPress={submit}>
        <Text style={styles.formSubmitText}>{cfg.submitButtonText || 'Submit'}</Text>
      </TouchableOpacity>
    </View>
  );
}

function RowBlock({ block, onButtonClick, onFormSubmit, rowPinContext = 'default' }: BlockRendererProps) {
  const row = block.config.row;
  if (!row || !row.cells?.length) return null;

  const gap = row.gap ?? 8;
  const mar = row.margin ?? 0;
  const inStack = rowPinContext === 'inPinnedStack';
  const marginTop = inStack ? 0 : row.marginTop ?? mar;
  const marginRight = inStack ? 0 : row.marginRight ?? mar;
  const marginBottom = inStack ? 0 : row.marginBottom ?? mar;
  const marginLeft = inStack ? 0 : row.marginLeft ?? mar;

  const rowStyle: any = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    width: '100%' as const,
    gap,
    backgroundColor: row.backgroundColor,
    borderWidth: row.borderWidth && row.borderStyle !== 'none' ? row.borderWidth : 0,
    borderColor: row.borderColor || '#ccc',
    borderStyle:
      row.borderStyle === 'dashed' ? 'dashed' : row.borderStyle === 'dotted' ? 'dotted' : 'solid',
    borderRadius: row.borderRadius,
    ...spacingStyle({
      padding: row.padding,
      paddingTop: row.paddingTop,
      paddingRight: row.paddingRight,
      paddingBottom: row.paddingBottom,
      paddingLeft: row.paddingLeft,
      margin: inStack ? 0 : row.margin,
      marginTop,
      marginRight,
      marginBottom,
      marginLeft,
    }),
  };

  return (
    <View style={rowStyle}>
      {row.cells.map((columnBlocks, colIdx) => (
        <View key={colIdx} style={{ flex: 1, minWidth: 0 }}>
          {[...columnBlocks]
            .sort((a, b) => a.order - b.order)
            .map((nested) => (
              <BlockRendererComponent
                key={nested.id}
                block={nested}
                onButtonClick={onButtonClick}
                onFormSubmit={onFormSubmit}
              />
            ))}
        </View>
      ))}
    </View>
  );
}

export function BlockRendererComponent({
  block,
  onButtonClick,
  onFormSubmit,
  rowPinContext = 'default',
}: BlockRendererProps) {
  switch (block.type) {
    case 'image':
      return <ImageBlock block={block} />;
    case 'text':
      return <TextBlock block={block} />;
    case 'button':
      return <ButtonBlock block={block} onButtonClick={onButtonClick} />;
    case 'html':
      return <HtmlBlock block={block} />;
    case 'row':
      return (
        <RowBlock
          block={block}
          onButtonClick={onButtonClick}
          onFormSubmit={onFormSubmit}
          rowPinContext={rowPinContext}
        />
      );
    case 'form':
      return <FormBlock block={block} onButtonClick={onButtonClick} onFormSubmit={onFormSubmit} />;
    case 'input':
      return <InputFieldBlock block={block} />;
    default:
      return null;
  }
}

function parseFontSize(fontSize: string): number {
  const sizeMap: Record<string, number> = {
    sm: 12,
    base: 14,
    lg: 16,
    xl: 18,
    '2xl': 20,
    '3xl': 24,
  };

  if (sizeMap[fontSize]) {
    return sizeMap[fontSize];
  }

  const parsed = parseFloat(fontSize);
  if (!isNaN(parsed)) {
    return parsed;
  }

  return 14;
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
  },
  text: {
    fontSize: 14,
    color: '#333',
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 4,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  formWrap: {
    width: '100%',
  },
  formField: {
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    marginBottom: 4,
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    padding: 10,
    fontSize: 14,
  },
  formSubmit: {
    marginTop: 8,
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  formSubmitText: {
    color: '#fff',
    fontWeight: '600',
  },
  selectChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ccc',
    marginRight: 8,
  },
  selectChipActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  selectChipText: {
    color: '#333',
  },
  selectChipTextActive: {
    color: '#fff',
  },
});
