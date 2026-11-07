/**
 * Block Renderer for In-App Messages (React Native)
 */

import React, { useEffect, useState, useMemo, useCallback, type ComponentType } from 'react';
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
  Modal,
  Pressable,
  type DimensionValue,
} from 'react-native';
import RenderHTML from 'react-native-render-html';
import type { Block, InputField, SpacingConfig, FormBlockConfig } from '../types/inAppMessage';
import { countdownParts, countdownSpokenText, resolveCountdownEnd } from '../iamCountdown';
import { fitImageCorners, imageShapeCorners, imageShapeIsSquareCrop } from '../iamImageShape';

/**
 * Resolve react-native-webview without a top-level named ESM import.
 * Metro often leaves `import { WebView }` as undefined for CJS packages,
 * which surfaces as "Cannot read property ... of undefined" at render time.
 */
function resolveWebView(): ComponentType<any> | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('react-native-webview');
    const Comp = mod?.default ?? mod?.WebView ?? null;
    return typeof Comp === 'function' || (Comp && typeof Comp === 'object') ? Comp : null;
  } catch {
    return null;
  }
}

const WebViewComponent = resolveWebView();

const SELECT_CHIP_MAX = 8;

function fieldIsPii(f: InputField): boolean {
  if (f.pii) return true;
  return f.type === 'email' || f.type === 'tel';
}

function formNeedsConsent(cfg: FormBlockConfig): boolean {
  if (!cfg.consentFieldId) return false;
  return (cfg.fields || []).some(fieldIsPii);
}

export interface BlockRendererProps {
  block: Block;
  onButtonClick?: (link: string, text: string, action?: any) => void;
  onFormSubmit?: (formData: Record<string, any>, submitAction?: any) => void;
  /**
   * When row blocks are pinned (top/bottom), they are rendered outside the scroll area.
   * `inPinnedStack`: margins are zeroed on the row flex to match dashboard preview (outer shell handles offset).
   */
  rowPinContext?: 'default' | 'inPinnedStack';
  /**
   * Full HTML documents in the dashboard mockup pin to the device screen.
   * When true, the WebView fills its parent (or the window) instead of auto-sizing to content height.
   */
  htmlFillViewport?: boolean;
}

/** API / dashboard may send spacing as numbers or strings ("16", "16px"). */
function spacingPx(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/px/gi, '').trim());
    return Number.isNaN(n) ? undefined : n;
  }
  return undefined;
}

function spacingStyle(s?: SpacingConfig): object {
  if (!s) return {};
  const o: Record<string, number> = {};
  const put = (key: keyof SpacingConfig, out: string) => {
    const n = spacingPx(s[key]);
    if (n !== undefined) o[out] = n;
  };
  put('padding', 'padding');
  put('paddingTop', 'paddingTop');
  put('paddingRight', 'paddingRight');
  put('paddingBottom', 'paddingBottom');
  put('paddingLeft', 'paddingLeft');
  put('margin', 'margin');
  put('marginTop', 'marginTop');
  put('marginRight', 'marginRight');
  put('marginBottom', 'marginBottom');
  put('marginLeft', 'marginLeft');
  return o;
}

function rnWidth(value: unknown): number | string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const raw = String(value).trim();
  if (!raw) return undefined;
  if (raw.toLowerCase() === 'auto') return undefined;
  if (raw.endsWith('%')) return raw;
  const n = parseFloat(raw.replace(/px/gi, '').trim());
  return Number.isNaN(n) ? undefined : n;
}

function alignItemsFor(alignment: string | undefined) {
  if (alignment === 'center') return 'center' as const;
  if (alignment === 'right') return 'flex-end' as const;
  if (alignment === 'full') return 'stretch' as const;
  return 'flex-start' as const;
}

export function ImageBlock({ block }: { block: Block }) {
  const config = block.config.image;
  const [aspectRatio, setAspectRatio] = useState<number | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [natural, setNatural] = useState<{ width: number; height: number } | 'unknown' | null>(null);

  const url = typeof config?.url === 'string' ? config.url.trim() : '';
  // An aligned image with no set width has nothing to size it, and a native image then gets no width at all.
  const needsNaturalSize = Boolean(url) && config?.alignment !== 'full' && rnWidth(config?.width) === undefined;

  useEffect(() => {
    if (!needsNaturalSize) return undefined;
    let active = true;
    Image.getSize(
      url,
      (width, height) => {
        if (active) setNatural(width && height ? { width, height } : 'unknown');
      },
      () => {
        if (active) setNatural('unknown');
      },
    );
    return () => {
      active = false;
    };
  }, [needsNaturalSize, url]);

  if (!config || !url) {
    return null;
  }

  if (failed) {
    return (
      <View style={[styles.blockContainer, styles.imageFailed, spacingStyle(config)]}>
        <Text style={styles.imageFailedText}>Image unavailable</Text>
      </View>
    );
  }

  const alignment = config.alignment || 'left';
  const isFull = alignment === 'full';
  const widthStyle = rnWidth(config.width);
  const heightStyle = rnWidth(config.height);
  const squareCrop = imageShapeIsSquareCrop(config.shape);
  const shapeCorners = imageShapeCorners(config.shape);
  // Native views don't reliably shrink oversized radii the way CSS does, so fit them to the image.
  const corners = shapeCorners && imageSize ? fitImageCorners(shapeCorners, imageSize.width, imageSize.height) : shapeCorners;
  const imageBorderWidth = Number(config.borderWidth) > 0 ? Number(config.borderWidth) : 0;
  const naturalRatio = squareCrop ? 1 : aspectRatio;

  const link = typeof config.link === 'string' ? config.link.trim() : '';
  const image = (
      <Image
        source={{ uri: url }}
        style={[
          styles.image,
          isFull && widthStyle === undefined ? { width: '100%' } : undefined,
          widthStyle !== undefined ? { width: widthStyle as DimensionValue } : undefined,
          needsNaturalSize && natural === 'unknown' ? { width: '100%' as DimensionValue } : undefined,
          needsNaturalSize && natural && natural !== 'unknown'
            ? { width: natural.width, aspectRatio: natural.width / natural.height }
            : undefined,
          heightStyle !== undefined ? { height: heightStyle as DimensionValue } : undefined,
          heightStyle === undefined && naturalRatio !== undefined ? { aspectRatio: naturalRatio } : undefined,
          corners
            ? {
                borderTopLeftRadius: corners.topLeft,
                borderTopRightRadius: corners.topRight,
                borderBottomRightRadius: corners.bottomRight,
                borderBottomLeftRadius: corners.bottomLeft,
                overflow: 'hidden' as const,
              }
            : undefined,
          imageBorderWidth ? { borderWidth: imageBorderWidth, borderColor: config.borderColor || '#e5e7eb' } : undefined,
        ]}
        resizeMode={isFull || squareCrop ? 'cover' : 'contain'}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setImageSize((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
        }}
        onLoad={(e) => {
          const src = e.nativeEvent?.source;
          const w = src?.width;
          const h = src?.height;
          if (w && h && heightStyle === undefined) {
            setAspectRatio(w / h);
          }
        }}
        onError={() => setFailed(true)}
      />
  );

  return (
    <View
      style={[
        styles.blockContainer,
        isFull ? { width: '100%' } : undefined,
        { alignItems: alignItemsFor(alignment) },
        spacingStyle(config),
      ]}
    >
      {/^https?:\/\//i.test(link) ? (
        <TouchableOpacity
          accessibilityRole="link"
          activeOpacity={0.8}
          style={isFull ? { width: '100%' } : undefined}
          onPress={() => {
            Linking.openURL(link).catch(() => {});
          }}
        >
          {image}
        </TouchableOpacity>
      ) : (
        image
      )}
    </View>
  );
}

export function TextBlock({ block }: { block: Block }) {
  const config = block.config.text;
  if (!config || !config.content) {
    return null;
  }

  const alignment = config.alignment || 'left';

  const fontSize = config.fontSize ? parseFontSize(config.fontSize) : 14;

  const textStyle: any = {
    fontSize,
    fontWeight: config.fontWeight === 'bold' ? 'bold' : 'normal',
    textAlign: alignment === 'full' ? 'left' : alignment,
  };

  if (config.color) {
    textStyle.color = config.color;
  }

  return (
    <View style={[styles.blockContainer, { alignItems: alignItemsFor(alignment) }, spacingStyle(config)]}>
      <Text style={[styles.text, textStyle]}>{config.content}</Text>
    </View>
  );
}

export function ButtonBlock({ block, onButtonClick }: BlockRendererProps) {
  const config = block.config.button;
  if (!config || !config.text) {
    return null;
  }

  const buttonStyle: any = {
    backgroundColor: config.backgroundColor || '#007AFF',
  };

  const textStyle: any = {
    color: config.textColor || '#FFFFFF',
  };

  const a = config.alignment || 'left';
  const width = a === 'full' ? '100%' : rnWidth(config.width);
  if (width !== undefined) {
    buttonStyle.width = width;
  }

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
    <View style={[styles.blockContainer, { alignItems: alignItemsFor(a) }, spacingStyle(config)]}>
      <TouchableOpacity style={[styles.button, buttonStyle]} onPress={handlePress} activeOpacity={0.8}>
        <Text style={[styles.buttonText, textStyle]}>{config.text}</Text>
      </TouchableOpacity>
    </View>
  );
}

/**
 * A full HTML document manages its own <html>/<body> and often relies on
 * viewport-filling CSS (100vh, position:fixed). A plain fragment should size
 * to its own content instead. Mirrors HtmlBlockRenderer.vue.
 */
export function isFullHtmlDocument(content: string): boolean {
  return /<!doctype\s+html|<html[\s>]/i.test(content || '');
}

/** True when the page's only flow content is a full HTML document (mockup edge-to-edge case). */
export function isSoleFullHtmlDocumentBlock(blocks: Block[] | any[] | undefined | null): boolean {
  if (!blocks || blocks.length !== 1) return false;
  const b = blocks[0];
  if (!b || b.type !== 'html') return false;
  return isFullHtmlDocument(b.config?.html?.content || '');
}

/**
 * Build the document handed to the WebView. Full documents pass through;
 * loose fragments get wrapped in a minimal responsive doc with base styles so
 * isolation, responsive images, and links opening externally all apply — same
 * wrapping the dashboard preview iframe uses.
 */
function buildHtmlDocument(content: string): string {
  if (isFullHtmlDocument(content)) return content;
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<base target="_blank">
<style>
  html, body { margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1f2937; }
  img { max-width: 100%; height: auto; }
</style>
</head>
<body>${content}</body>
</html>`;
}

/**
 * Injected after load: report the rendered content height back to RN so the
 * WebView (which has no intrinsic height) can size to its content, and keep it
 * in sync as fonts/images/scripts settle.
 */
const HTML_AUTO_HEIGHT_JS = `
(function () {
  function post() {
    var h = Math.max(
      document.documentElement ? document.documentElement.scrollHeight : 0,
      document.body ? document.body.scrollHeight : 0
    );
    if (window.ReactNativeWebView && h > 0) {
      window.ReactNativeWebView.postMessage(String(h));
    }
  }
  post();
  window.addEventListener('load', post);
  if (typeof ResizeObserver !== 'undefined' && document.body) {
    new ResizeObserver(post).observe(document.body);
  } else {
    setTimeout(post, 300);
    setTimeout(post, 1000);
  }
})();
true;
`;

/**
 * Renders authored custom HTML in a real browser context (WebView), so JS and
 * CSS execute exactly like the dashboard/web SDK iframe.
 *
 * Full documents mirror HtmlBlockRenderer.vue: pin to the available viewport
 * (device screen in mockup / parent or window on device). Fragments auto-height.
 */
export function HtmlBlock({
  block,
  htmlFillViewport = false,
}: {
  block: Block;
  htmlFillViewport?: boolean;
}) {
  const config = block.config.html;
  const { width, height: windowHeight } = useWindowDimensions();

  const isFullDoc = !!config?.content && isFullHtmlDocument(config.content);
  // Match mockup: full documents fill the screen; never content-auto-height.
  const fillViewport = htmlFillViewport || isFullDoc;

  const [measuredHeight, setMeasuredHeight] = useState(40);
  const [layoutHeight, setLayoutHeight] = useState(0);

  const onMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      if (fillViewport) return;
      const measured = parseFloat(event.nativeEvent.data);
      if (!Number.isNaN(measured) && measured > 0) {
        setMeasuredHeight((prev) => (Math.abs(prev - measured) > 1 ? measured : prev));
      }
    },
    [fillViewport]
  );

  if (!config || !config.content) {
    return null;
  }

  if (!WebViewComponent) {
    if (__DEV__) {
      console.warn(
        '[Tappd SDK] react-native-webview is required to render HTML blocks with JS/CSS. Falling back to simplified HTML rendering.'
      );
    }
    return (
      <View
        style={[
          fillViewport ? styles.htmlFillContainer : styles.blockContainer,
          fillViewport ? undefined : spacingStyle(config),
          fillViewport ? { flex: 1, minHeight: windowHeight } : undefined,
        ]}
      >
        <RenderHTML contentWidth={width - (fillViewport ? 0 : 48)} source={{ html: config.content }} />
      </View>
    );
  }

  const webViewHeight = fillViewport
    ? layoutHeight > 0
      ? layoutHeight
      : windowHeight
    : measuredHeight;

  return (
    <View
      style={[
        fillViewport ? styles.htmlFillContainer : styles.blockContainer,
        fillViewport ? undefined : spacingStyle(config),
        fillViewport ? { flex: 1, alignSelf: 'stretch', minHeight: windowHeight } : undefined,
      ]}
      onLayout={
        fillViewport
          ? (e) => {
              const h = e.nativeEvent.layout.height;
              if (h > 0 && Math.abs(h - layoutHeight) > 1) {
                setLayoutHeight(h);
              }
            }
          : undefined
      }
    >
      <WebViewComponent
        style={{
          width: '100%',
          height: webViewHeight,
          flex: fillViewport ? 1 : undefined,
          backgroundColor: 'transparent',
        }}
        originWhitelist={['*']}
        source={{ html: buildHtmlDocument(config.content) }}
        injectedJavaScript={fillViewport ? undefined : HTML_AUTO_HEIGHT_JS}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled
        showsVerticalScrollIndicator={false}
        automaticallyAdjustContentInsets={false}
        setBuiltInZoomControls={false}
        // Full-doc CSS (100vh / fixed) needs a real viewport; match mockup screen fill.
        scalesPageToFit={false}
      />
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
  if (field.type === 'checkbox') {
    const checked = value === 'true';
    return (
      <TouchableOpacity
        style={styles.checkboxRow}
        onPress={() => onChange(checked ? 'false' : 'true')}
        activeOpacity={0.8}
      >
        <View style={[styles.checkboxBox, checked && styles.checkboxBoxOn]} />
        {field.label ? <Text style={styles.checkboxLabel}>{field.label}</Text> : null}
      </TouchableOpacity>
    );
  }

  if (field.type === 'radio' && field.options && field.options.length > 0) {
    return (
      <View style={{ marginTop: 4 }}>
        {field.options.map((opt) => (
          <TouchableOpacity
            key={opt}
            style={styles.radioRow}
            onPress={() => onChange(opt)}
          >
            <View style={[styles.radioOuter, value === opt && styles.radioOuterOn]}>
              {value === opt ? <View style={styles.radioInner} /> : null}
            </View>
            <Text style={styles.radioLabel}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  }

  if (
    (field.type === 'checkbox_group' || field.type === 'multiselect') &&
    field.options &&
    field.options.length > 0
  ) {
    const selected = new Set(
      (value || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    );
    const toggle = (opt: string) => {
      const next = new Set(selected);
      if (next.has(opt)) next.delete(opt);
      else next.add(opt);
      onChange([...next].join(','));
    };
    return (
      <View style={{ marginTop: 4 }}>
        {field.options.map((opt) => {
          const on = selected.has(opt);
          return (
            <TouchableOpacity key={opt} style={styles.checkboxRow} onPress={() => toggle(opt)}>
              <View style={[styles.checkboxBox, on && styles.checkboxBoxOn]} />
              <Text style={styles.checkboxLabel}>{opt}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }

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
    if (field.options.length <= SELECT_CHIP_MAX) {
      return (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
          {field.options.map((opt) => (
            <TouchableOpacity
              key={opt}
              style={[styles.selectChip, value === opt && styles.selectChipActive]}
              onPress={() => onChange(opt)}
            >
              <Text style={value === opt ? styles.selectChipTextActive : styles.selectChipText}>{opt}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      );
    }
    return <SelectModalField field={field} value={value} onChange={onChange} />;
  }

  if (field.type === 'date') {
    return (
      <View>
        <TextInput
          style={styles.input}
          placeholder={field.placeholder || 'YYYY-MM-DD'}
          value={value}
          onChangeText={onChange}
          keyboardType="numbers-and-punctuation"
        />
        <TouchableOpacity
          style={styles.dateLink}
          onPress={() => onChange(new Date().toISOString().slice(0, 10))}
        >
          <Text style={styles.dateLinkText}>Use today</Text>
        </TouchableOpacity>
      </View>
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

function SelectModalField({
  field,
  value,
  onChange,
}: {
  field: InputField;
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const opts = field.options || [];
  return (
    <>
      <Pressable style={styles.selectTrigger} onPress={() => setOpen(true)}>
        <Text style={styles.selectTriggerText} numberOfLines={1}>
          {value || field.placeholder || 'Choose…'}
        </Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <ScrollView style={{ maxHeight: 320 }}>
              {opts.map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={styles.modalOption}
                  onPress={() => {
                    onChange(opt);
                    setOpen(false);
                  }}
                >
                  <Text style={opt === value ? styles.modalOptionActive : styles.modalOptionText}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function InputFieldBlock({ block }: { block: Block }) {
  const field = block.config.input;
  if (!field) return null;
  const [val, setVal] = useState(field.defaultValue || '');
  return (
    <View style={[styles.formField, spacingStyle(field as any)]}>
      {field.type !== 'checkbox' ? <Text style={styles.label}>{field.label}</Text> : null}
      <FieldEditor field={field} value={val} onChange={setVal} />
    </View>
  );
}

function FormBlock({ block, onFormSubmit }: BlockRendererProps) {
  const cfg = block.config.form;
  const { width } = useWindowDimensions();

  const initial = useMemo(() => {
    const m: Record<string, string> = {};
    if (cfg?.fields) {
      cfg.fields.forEach((f) => {
        m[f.name] = f.defaultValue || '';
      });
    }
    return m;
  }, [cfg]);

  const [values, setValues] = useState<Record<string, string>>(initial);

  if (!cfg || !cfg.fields?.length) return null;

  const setField = (name: string, v: string) => {
    setValues((prev) => ({ ...prev, [name]: v }));
  };

  const submit = () => {
    if (formNeedsConsent(cfg)) {
      const consent = cfg.fields!.find((f) => f.id === cfg.consentFieldId);
      if (consent && consent.type === 'checkbox' && values[consent.name] !== 'true') {
        return;
      }
    }
    if (onFormSubmit) {
      onFormSubmit(values, cfg.submitAction);
    }
  };

  const sp = spacingStyle(cfg) as Record<string, number | undefined>;
  const mar = sp.margin ?? 0;
  const inner = Object.fromEntries(Object.entries(sp).filter(([k]) => !k.startsWith('margin')));

  const submitAlign = cfg.submitButtonAlignment || cfg.alignment || 'left';
  const submitWrapStyle: any = { alignItems: alignItemsFor(submitAlign) };
  const submitBtnStyle: any = {
    ...styles.formSubmit,
    backgroundColor: cfg.submitButtonBackgroundColor || styles.formSubmit.backgroundColor,
  };
  const submitTextStyle: any = {
    ...styles.formSubmitText,
    color: cfg.submitButtonTextColor || styles.formSubmitText.color,
  };

  const submitWidth = submitAlign === 'full' ? '100%' : rnWidth(cfg.submitButtonWidth);
  if (submitWidth !== undefined) {
    submitBtnStyle.width = submitWidth;
  }

  return (
    // width:100% + margin would overflow, so margin becomes padding on an outer wrapper (same look, no background).
    <View style={{ width: '100%', paddingTop: sp.marginTop ?? mar, paddingRight: sp.marginRight ?? mar, paddingBottom: sp.marginBottom ?? mar, paddingLeft: sp.marginLeft ?? mar }}>
    {/* RN: per-side props beat the shorthand, so default padding 8 yields to any explicit padding/side */}
    <View style={[styles.formWrap, { padding: 8 }, inner]}>
      {cfg.privacyNoticeHtml ? (
        <View style={styles.privacyNotice}>
          <RenderHTML contentWidth={width - 48} source={{ html: cfg.privacyNoticeHtml }} />
        </View>
      ) : null}
      {cfg.fields.map((field) => (
        <View key={field.id} style={styles.formField}>
          {field.type !== 'checkbox' ? <Text style={styles.label}>{field.label}</Text> : null}
          <FieldEditor
            field={field}
            value={values[field.name] ?? ''}
            onChange={(v) => setField(field.name, v)}
          />
        </View>
      ))}
      <View style={submitWrapStyle}>
        <TouchableOpacity style={submitBtnStyle} onPress={submit} activeOpacity={0.85}>
          <Text style={submitTextStyle}>{cfg.submitButtonText || 'Submit'}</Text>
        </TouchableOpacity>
      </View>
    </View>
    </View>
  );
}

const COUNTDOWN_SIZES = {
  sm: { digit: 18, label: 9, pad: 6, min: 38, gap: 4 },
  md: { digit: 26, label: 10, pad: 8, min: 52, gap: 6 },
  lg: { digit: 36, label: 11, pad: 10, min: 68, gap: 8 },
};

/** Time always comes from the clock, so the timer stays right after the app has been in the background. */
function CountdownBlock({ block }: { block: Block }) {
  const cfg = block.config.countdown;
  const [endsAt] = useState(() => (cfg ? resolveCountdownEnd(cfg, block.id) : null));
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (endsAt === null || Date.now() >= endsAt) return undefined;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= endsAt) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [endsAt]);

  if (!cfg || endsAt === null) return null;

  const remaining = endsAt - now;
  const behavior = cfg.expiredBehavior || 'text';
  const alignItems = cfg.alignment === 'left' ? 'flex-start' : cfg.alignment === 'right' ? 'flex-end' : 'center';
  const digitColor = cfg.digitColor || '#111827';

  if (remaining <= 0 && behavior === 'hide') return null;
  if (remaining <= 0 && behavior !== 'zero') {
    return (
      <View style={[styles.countdown, { alignItems }, spacingStyle(cfg)]}>
        <Text style={[styles.countdownExpired, { color: digitColor }]}>{cfg.expiredText || 'This offer has ended'}</Text>
      </View>
    );
  }

  const size = COUNTDOWN_SIZES[cfg.size || 'md'] || COUNTDOWN_SIZES.md;
  const plain = cfg.variant === 'plain';
  const parts = countdownParts(remaining, cfg);
  const digitStyle = {
    fontSize: size.digit,
    lineHeight: Math.round(size.digit * 1.15),
    color: digitColor,
    fontVariant: ['tabular-nums' as const],
  };

  return (
    <View style={[styles.countdown, { alignItems }, spacingStyle(cfg)]}>
      <View
        style={[styles.countdownRow, { gap: size.gap }]}
        accessible
        accessibilityRole="timer"
        accessibilityLabel={countdownSpokenText(parts)}
      >
        {parts.map((part, index) => (
          <React.Fragment key={part.unit}>
            {plain && index > 0 ? <Text style={[styles.countdownDigit, digitStyle]}>:</Text> : null}
            <View
              style={[
                styles.countdownUnit,
                plain
                  ? undefined
                  : { minWidth: size.min, padding: size.pad, borderRadius: 10, backgroundColor: cfg.boxColor || '#f3f4f6' },
              ]}
            >
              <Text style={[styles.countdownDigit, digitStyle]}>{part.value}</Text>
              {cfg.showLabels !== false ? (
                <Text style={{ marginTop: 2, fontSize: size.label, color: cfg.labelColor || '#6b7280' }}>{part.label}</Text>
              ) : null}
            </View>
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

function SpacerBlock({ block }: { block: Block }) {
  const cfg = block.config.spacer;
  const h = cfg?.height ?? 16;
  return (
    <View
      style={[
        styles.spacer,
        {
          minHeight: cfg?.showDivider ? Math.max(h, 8) : h,
          backgroundColor: cfg?.backgroundColor,
        },
        spacingStyle(cfg as SpacingConfig),
      ]}
    >
      {cfg?.showDivider ? <View style={styles.spacerLine} /> : null}
    </View>
  );
}

function RowBlock({ block, onButtonClick, onFormSubmit, rowPinContext = 'default' }: BlockRendererProps) {
  const row = block.config.row;
  if (!row || !row.cells?.length) return null;

  const gap = spacingPx(row.gap) ?? 8;
  const mar = spacingPx(row.margin) ?? 0;
  const inStack = rowPinContext === 'inPinnedStack';
  const marginTop = inStack ? 0 : spacingPx(row.marginTop) ?? mar;
  const marginRight = inStack ? 0 : spacingPx(row.marginRight) ?? mar;
  const marginBottom = inStack ? 0 : spacingPx(row.marginBottom) ?? mar;
  const marginLeft = inStack ? 0 : spacingPx(row.marginLeft) ?? mar;

  const rowStyle: any = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    width: '100%' as const,
    gap,
    backgroundColor: row.backgroundColor,
    borderWidth: (() => {
      const bw = spacingPx(row.borderWidth);
      return bw && row.borderStyle !== 'none' ? bw : 0;
    })(),
    borderColor: row.borderColor || '#ccc',
    borderStyle:
      row.borderStyle === 'dashed' ? 'dashed' : row.borderStyle === 'dotted' ? 'dotted' : 'solid',
    borderRadius: spacingPx(row.borderRadius),
    ...spacingStyle({
      padding: row.padding,
      paddingTop: row.paddingTop,
      paddingRight: row.paddingRight,
      paddingBottom: row.paddingBottom,
      paddingLeft: row.paddingLeft,
      margin: inStack ? 0 : spacingPx(row.margin),
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
  htmlFillViewport = false,
}: BlockRendererProps) {
  switch (block.type) {
    case 'image':
      return <ImageBlock block={block} />;
    case 'text':
      return <TextBlock block={block} />;
    case 'button':
      return <ButtonBlock block={block} onButtonClick={onButtonClick} />;
    case 'html':
      return <HtmlBlock block={block} htmlFillViewport={htmlFillViewport} />;
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
    case 'spacer':
      return <SpacerBlock block={block} />;
    case 'countdown':
      return <CountdownBlock block={block} />;
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
  htmlFillContainer: {
    marginVertical: 0,
    width: '100%',
  },
  image: {
    maxWidth: '100%',
  },
  imageFailed: {
    width: '100%',
    minHeight: 80,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  countdown: {
    width: '100%',
  },
  countdownRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  countdownUnit: {
    alignItems: 'center',
  },
  countdownDigit: {
    fontWeight: '700',
  },
  countdownExpired: {
    fontSize: 14,
    fontWeight: '600',
  },
  imageFailedText: {
    fontSize: 12,
    color: '#6b7280',
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
  selectTrigger: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    padding: 12,
    backgroundColor: '#fff',
  },
  selectTriggerText: {
    fontSize: 14,
    color: '#333',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  modalOption: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5e5',
  },
  modalOptionText: {
    fontSize: 16,
    color: '#333',
  },
  modalOptionActive: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
  privacyNotice: {
    marginBottom: 8,
  },
  spacer: {
    width: '100%',
    justifyContent: 'center',
  },
  spacerLine: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(0,0,0,0.12)',
    width: '100%',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: '#999',
    borderRadius: 4,
  },
  checkboxBoxOn: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  checkboxLabel: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#999',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterOn: {
    borderColor: '#007AFF',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#007AFF',
  },
  radioLabel: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  dateLink: {
    marginTop: 6,
  },
  dateLinkText: {
    fontSize: 13,
    color: '#007AFF',
  },
});
