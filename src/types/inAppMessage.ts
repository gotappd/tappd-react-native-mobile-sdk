/**
 * In-app message types — aligned with dashboard and `@tappd/web-sdk` (duplicate for RN package independence).
 */

import type { CountdownSettings } from '../iamCountdown';
import type { ImageShape } from '../iamImageShape';

export type InAppMessageType =
  | 'banner'
  | 'popup'
  | 'modal'
  | 'full_screen'
  | 'fullscreen'
  | 'notification';

export type BannerPosition = 'top' | 'bottom' | 'center';

export type AnimationType = 'slide' | 'fade' | 'none';

export type NotificationAnimationDirection = 'up' | 'down' | 'left' | 'right';

export type Alignment = 'left' | 'center' | 'right' | 'full' | 'justify';

export type BlockType = 'image' | 'text' | 'button' | 'html' | 'row' | 'form' | 'input' | 'spacer' | 'countdown';

export interface SpacingConfig {
  padding?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  margin?: number;
  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;
}

export interface ImageBlockConfig extends SpacingConfig {
  url: string;
  alt?: string;
  /** Opens in the browser on tap. Doesn't count as a click on the message. */
  link?: string;
  width?: string;
  height?: string;
  alignment?: Alignment;
  /** Corner style; unset keeps square corners. */
  shape?: ImageShape;
  borderWidth?: number;
  borderColor?: string;
}

export interface TextBlockConfig extends SpacingConfig {
  content: string;
  alignment?: Alignment;
  fontSize?: string;
  fontWeight?: 'normal' | 'bold';
  color?: string;
}

export type ButtonActionType = 'none' | 'close' | 'track_event' | 'update_profile' | 'link';

export interface ButtonAction {
  type: ButtonActionType;
  eventName?: string;
  eventProperties?: Record<string, any>;
  profileAttributes?: Record<string, string>;
  link?: string;
}

export interface ButtonBlockConfig extends SpacingConfig {
  text: string;
  link?: string;
  textColor?: string;
  backgroundColor?: string;
  /** CSS width (e.g. 'auto', '200px', '100%'). 'auto' is treated as unset in RN. */
  width?: string;
  linkBehavior?: 'deeplink' | 'in_app' | 'browser';
  alignment?: Alignment;
  action?: ButtonAction;
}

export interface HtmlBlockConfig extends SpacingConfig {
  content: string;
}

export interface SpacerBlockConfig extends SpacingConfig {
  height?: number;
  backgroundColor?: string;
  showDivider?: boolean;
}

export interface CountdownBlockConfig extends SpacingConfig, CountdownSettings {
  variant?: 'boxes' | 'plain';
  size?: 'sm' | 'md' | 'lg';
  alignment?: 'left' | 'center' | 'right';
  showLabels?: boolean;
  digitColor?: string;
  labelColor?: string;
  boxColor?: string;
  /** What shows at zero: a message (default), the timer at zero, or nothing. */
  expiredBehavior?: 'text' | 'zero' | 'hide';
  expiredText?: string;
}

export interface RowBlockConfig {
  columns: number;
  cells: Block[][];
  pin?: 'none' | 'top' | 'bottom';
  backgroundColor?: string;
  borderWidth?: number;
  borderStyle?: 'none' | 'solid' | 'dashed' | 'dotted';
  borderColor?: string;
  borderRadius?: number;
  padding?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  margin?: number;
  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;
  gap?: number;
}

export type InputType =
  | 'text'
  | 'email'
  | 'tel'
  | 'number'
  | 'date'
  | 'textarea'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'checkbox_group'
  | 'multiselect';

export interface InputField extends SpacingConfig {
  id: string;
  label: string;
  name: string;
  type: InputType;
  placeholder?: string;
  required?: boolean;
  defaultValue?: string;
  options?: string[];
  pii?: boolean;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
  };
}

export interface FormBlockConfig extends SpacingConfig {
  fields: InputField[];
  submitButtonText?: string;
  submitButtonTextColor?: string;
  submitButtonBackgroundColor?: string;
  submitButtonAlignment?: Exclude<Alignment, 'justify'>;
  submitButtonWidth?: string;
  submitAction?: {
    type: 'track_event' | 'update_profile' | 'both';
    eventName?: string;
    eventProperties?: Record<string, string>;
    profileAttributes?: Record<string, string>;
    mappedEventPropertiesOnly?: boolean;
    mappedProfileOnly?: boolean;
  };
  alignment?: Alignment;
  privacyNoticeHtml?: string;
  consentFieldId?: string;
}

export interface BlockConfig {
  image?: ImageBlockConfig;
  text?: TextBlockConfig;
  button?: ButtonBlockConfig;
  html?: HtmlBlockConfig;
  row?: RowBlockConfig;
  form?: FormBlockConfig;
  input?: InputField;
  spacer?: SpacerBlockConfig;
  countdown?: CountdownBlockConfig;
}

export interface Block {
  id: string;
  type: BlockType;
  order: number;
  config: BlockConfig;
}

export interface InAppMessagePage {
  id: string;
  name: string;
  blocks: Block[];
  settings?: {
    backgroundColor?: string;
    backgroundOpacity?: number;
    backgroundImage?: string;
    backgroundImageEnabled?: boolean;
    maxWidth?: string;
    borderRadius?: string;
    [key: string]: any;
  };
}

export interface MessageContainerSettings {
  displayType?: InAppMessageType;
  widthMode?: 'full' | 'custom';
  customWidth?: string;
  maxWidth?: string;
  maxWidthUnit?: 'px' | 'em' | '%';
  padding?: number;
  margin?: number;
  viewportPadding?: number;
  backgroundColor?: string;
  backgroundOpacity?: number;
  backgroundImage?: string;
  backgroundImageEnabled?: boolean;
  borderWidth?: number;
  borderStyle?: 'solid' | 'dashed' | 'dotted' | 'none';
  borderColor?: string;
  borderRadius?: number;
  showCloseButton?: boolean;
  closeButtonPosition?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  closeButtonStyle?: {
    size?: number;
    color?: string;
    icon?: string;
  };
  notificationAnimation?: NotificationAnimationDirection;
  notificationPosition?: 'top' | 'bottom' | 'left' | 'right';
}

export interface ContentSettings {
  defaultFontFamily?: string;
  customFonts?: string[];
  contentAlignment?: 'left' | 'center' | 'right';
  defaultFontSize?: string;
  defaultLineHeight?: string;
  defaultTextColor?: string;
}

export interface TriggerConfig {
  type: 'delay' | 'event' | 'page_visit' | 'immediate';
  delay?: {
    value: number;
    unit: 'seconds' | 'minutes' | 'hours';
  };
  eventName?: string;
  pagePath?: string;
  conditions?: any;
}

export interface ExpirationConfig {
  type: 'duration' | 'event' | 'never';
  duration?: {
    value: number;
    unit: 'minutes' | 'hours' | 'days';
  };
  eventName?: string;
  conditions?: any;
}

export interface InAppMessageConfig {
  messageType?: InAppMessageType;
  blocks?: Block[];
  pages?: InAppMessagePage[];
  position?: BannerPosition;
  animation?: AnimationType;
  backgroundColor?: string;
  dismissible?: boolean;
  closeButton?: boolean;
  showCloseButton?: boolean;
  showNavigationButtons?: boolean;
  overlay?: boolean;
  overlayOpacity?: number;
  notificationAnimation?: NotificationAnimationDirection;
  notificationPosition?: 'top' | 'bottom' | 'left' | 'right';
  containerSettings?: MessageContainerSettings;
  contentSettings?: ContentSettings;
  triggerConfig?: TriggerConfig;
  expirationConfig?: ExpirationConfig;
  version?: string;
}

export interface InAppMessage {
  _id: string;
  workspaceId: string;
  journeyId: string;
  enrollmentId: string;
  stepId: string;
  customerId: string;
  config: InAppMessageConfig;
  triggerConfig?: TriggerConfig;
  expirationConfig?: ExpirationConfig;
  status: 'pending' | 'delivered' | 'expired' | 'dismissed';
  triggeredAt?: Date | string;
  expiresAt?: Date | string;
  deliveredAt?: Date | string;
  dismissedAt?: Date | string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  journeyRecurring?: boolean;
}
