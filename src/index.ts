/**
 * Tappd Mobile SDK (React Native)
 * Customer Data Platform SDK for iOS and Android applications
 */

import { AppState, AppStateStatus, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DeviceInfo from 'react-native-device-info';

export interface TappdConfig {
  appId: string; // Required: App ID from dashboard
  apiUrl?: string; // Optional: Custom API URL
  autoTrack?: boolean; // Auto-track screen views (default: true)
  sessionTimeout?: number; // Session timeout in minutes (default: 30)
  enableAutoScreenTracking?: boolean; // Auto-track screen changes (default: true)
  debug?: boolean; // Enable debug logging
  enableInAppMessages?: boolean; // Enable/disable in-app message rendering (default: true)
  autoDisplayMessages?: boolean; // Automatically display pending messages (default: true)
  messagePollingInterval?: number; // Interval for polling new messages in seconds when active (default: 60)
  /** Minimum seconds between poll ticks (default: 15). */
  minMessagePollingIntervalSeconds?: number;
  inactivityThreshold?: number; // Inactivity threshold in seconds before stopping polling (default: 300 = 5 minutes)
  /** Skip duplicate IAM API calls within this window in ms when not forceRefresh (default: 2000). Set 0 to always fetch. */
  messageFetchDedupeMs?: number;
}

export interface CustomerAttributes {
  external_id: string; // Required: Your internal user identifier
  name?: string;
  email?: string;
  phone?: string;
  [key: string]: any;
}

export interface EventProperties {
  [key: string]: any;
}

interface Session {
  sessionId: string;
  startedAt: number;
  lastActivityAt: number;
}

interface ScreenTracker {
  screenName: string;
  startTime: number;
}

export class TappdSDK {
  private appId: string;
  private apiUrl: string;
  private autoTrack: boolean;
  private sessionTimeout: number;
  private enableAutoScreenTracking: boolean;
  private debug: boolean;
  private enableInAppMessages: boolean;
  private autoDisplayMessages: boolean;
  private messagePollingInterval: number;
  private minMessagePollingIntervalSeconds: number;
  private messageFetchDedupeMs: number;

  private currentUserId: string | null = null;
  private anonymousId: string | null = null;
  private session: Session | null = null;
  private screenTracker: ScreenTracker | null = null;
  private appStateSubscription: any = null;
  private linkingSubscription: any = null;
  private displayedMessages: Set<string> = new Set();
  private messagePollingTimer: any = null;
  private activityTimer: any = null;
  private lastActivityTime: number = Date.now();
  private isUserActive: boolean = true;
  private inactivityThreshold: number;
  private messageCache: Map<string, any> = new Map();
  private cacheKey = '_tappd_message_cache';
  private lastFetchTime: number = 0;
  // No hardcoded cache expiry - each message has its own expiresAt from journey configuration
  private shownMessages: Set<string> = new Set();
  private shownMessagesLoaded: boolean = false;
  private shownMessagesKey = '_tappd_shown_messages';
  private recentEvents: Map<string, number> = new Map(); // eventName -> timestamp (for event triggers)
  private eventTriggeredMessages: Map<string, Set<string>> = new Map(); // eventName -> Set of messageIds waiting for this event
  private messageRenderCallback: ((message: any) => void) | null = null;
  /** Braze-style: notified after each successful IAM fetch from the API. */
  private inAppMessageListeners: Array<(event: { messages: any[] }) => void> = [];
  /** Host sets this to hide the currently visible IAM UI when dismissCurrentInAppMessage() is called. */
  private dismissCurrentInAppMessageHandler: (() => void) | null = null;
  private bannerCache: Map<string, any> = new Map(); // selector -> banners cache

  constructor(config: TappdConfig) {
    this.appId = config.appId;
    this.apiUrl = config.apiUrl || 'https://sdk.gotappd.com/api/v1/sdk';
    this.autoTrack = config.autoTrack !== false;
    this.sessionTimeout = config.sessionTimeout || 30;
    this.enableAutoScreenTracking = config.enableAutoScreenTracking !== false;
    this.debug = config.debug || false;
    this.enableInAppMessages = config.enableInAppMessages !== false;
    this.autoDisplayMessages = config.autoDisplayMessages !== false;
    this.messagePollingInterval = config.messagePollingInterval ?? 60;
    this.minMessagePollingIntervalSeconds = Math.max(5, config.minMessagePollingIntervalSeconds ?? 15);
    this.messageFetchDedupeMs =
      config.messageFetchDedupeMs !== undefined ? Math.max(0, config.messageFetchDedupeMs) : 2000;
    this.inactivityThreshold = (config.inactivityThreshold || 300) * 1000; // Convert to milliseconds, default: 5 minutes

    if (!this.appId) {
      throw new Error('App ID is required');
    }

    // Initialize asynchronously
    this.initialize();
  }

  /**
   * Initialize SDK (async)
   */
  private async initialize() {
    try {
      // Get or create anonymous ID
      this.anonymousId = await this.getOrCreateAnonymousId();

      // Start new session
      this.startNewSession();

      // Setup app state listeners
      this.setupAppStateTracking();

      // Setup deep link tracking
      this.setupDeepLinkTracking();

      // Track app opened
      if (this.autoTrack) {
        await this.track('app.opened', {
          isFirstLaunch: await this.isFirstLaunch()
        });
      }

      // Initialize in-app messages if enabled
      if (this.enableInAppMessages) {
        this.initializeInAppMessages();
      }

      this.log('[Tappd SDK] Initialized with App ID:', this.appId.substring(0, 15) + '...');
    } catch (error) {
      this.log('[Tappd SDK] Initialization error:', error);
    }
  }

  /**
   * Get or create anonymous ID (stored in AsyncStorage)
   */
  private async getOrCreateAnonymousId(): Promise<string> {
    const key = '_tappd_anonymous_id';
    try {
      let anonymousId = await AsyncStorage.getItem(key);
      
      if (!anonymousId) {
        anonymousId = 'anon_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
        await AsyncStorage.setItem(key, anonymousId);
      }

      return anonymousId;
    } catch (error) {
      // Fallback if AsyncStorage fails
      this.log('[Tappd SDK] AsyncStorage error, using in-memory ID:', error);
      return 'anon_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    }
  }

  /**
   * Check if this is first launch
   */
  private async isFirstLaunch(): Promise<boolean> {
    try {
      const key = '_tappd_first_launch';
      const value = await AsyncStorage.getItem(key);
      
      if (value === null) {
        await AsyncStorage.setItem(key, 'false');
        return true;
      }
      
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Start a new session
   */
  private startNewSession() {
    const sessionId = 'sess_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    
    this.session = {
      sessionId,
      startedAt: Date.now(),
      lastActivityAt: Date.now()
    };

    this.log('[Tappd SDK] New session started:', sessionId.substring(0, 15));
  }

  /**
   * Check if session has expired and start a new one if needed
   */
  private checkAndRefreshSession() {
    if (!this.session) {
      this.startNewSession();
      return;
    }

    const elapsed = Date.now() - this.session.lastActivityAt;
    const timeoutMs = this.sessionTimeout * 60 * 1000;

    if (elapsed > timeoutMs) {
      this.log('[Tappd SDK] Session expired, starting new session');
      this.startNewSession();
    }
  }

  /**
   * Update session activity
   */
  private updateSessionActivity() {
    if (this.session) {
      this.session.lastActivityAt = Date.now();
    }
  }

  /**
   * Setup app state tracking (foreground/background)
   */
  private setupAppStateTracking() {
    // Track current app state
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        // App came to foreground
        this.checkAndRefreshSession();
        this.updateSessionActivity();
        
        // Update activity for message polling
        this.updateActivity();
        
        if (this.autoTrack) {
          await this.track('app.foreground', {});
        }
      } else if (nextAppState === 'background' || nextAppState === 'inactive') {
        // App went to background - stop polling
        this.log('[Tappd SDK] App backgrounded - stopping polling');
        this.stopMessagePolling();
        
        if (this.autoTrack) {
          await this.track('app.background', {});
        }
        
        // End current screen tracking
        if (this.screenTracker) {
          const duration = Math.floor((Date.now() - this.screenTracker.startTime) / 1000);
          await this.track('screen.viewed', {
            screenName: this.screenTracker.screenName,
            duration
          });
          this.screenTracker = null;
        }
      }
    };

    // Subscribe to app state changes
    this.appStateSubscription = AppState.addEventListener('change', handleAppStateChange);
  }

  /**
   * Setup deep link tracking
   */
  private setupDeepLinkTracking() {
    // Get initial URL if app was opened via deep link
    Linking.getInitialURL().then((url) => {
      if (url) {
        this.handleDeepLink(url);
      }
    });

    // Listen for deep links while app is running
    this.linkingSubscription = Linking.addEventListener('url', (event: { url: string }) => {
      this.handleDeepLink(event.url);
    });
  }

  /**
   * Handle deep link
   */
  private async handleDeepLink(url: string): Promise<void> {
    try {
      const urlObj = new URL(url);
      const utm: Record<string, string> = {};
      
      // Extract UTM parameters
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(param => {
        const value = urlObj.searchParams.get(param);
        if (value) {
          utm[param.replace('utm_', '')] = value;
        }
      });

      await this.track('deep_link.opened', {
        url,
        path: urlObj.pathname,
        utm: Object.keys(utm).length > 0 ? utm : undefined
      });
    } catch (error) {
      this.log('[Tappd SDK] Deep link error:', error);
    }
  }

  /**
   * Get basic device information for event tracking
   */
  private getDeviceInfo() {
    return {
      platform: Platform.OS,
      version: Platform.Version,
    };
  }

  /**
   * Get rich device information for push registration
   */
  private async getFullDeviceInfo() {
    try {
      const [carrier] = await Promise.all([
        DeviceInfo.getCarrier().catch(() => undefined),
      ]);

      return {
        deviceId: await this.getOrCreateDeviceId(),
        platform: Platform.OS,
        osName: DeviceInfo.getSystemName(),
        osVersion: String(DeviceInfo.getSystemVersion()),
        deviceModel: DeviceInfo.getModel(),
        deviceBrand: DeviceInfo.getBrand(),
        deviceName: await DeviceInfo.getDeviceName().catch(() => undefined),
        carrier: carrier,
      };
    } catch (error) {
      this.log('[Tappd SDK] getFullDeviceInfo error:', error);
      // Fallback to minimal info
      return {
        deviceId: await this.getOrCreateDeviceId(),
        platform: Platform.OS,
        osName: undefined,
        osVersion: String(Platform.Version),
        deviceModel: undefined,
        deviceBrand: undefined,
        deviceName: undefined,
        carrier: undefined,
      };
    }
  }

  /**
   * Identify a user
   * Requires external_id in attributes - SDK will generate internal userId automatically
   */
  async identify(attributes: CustomerAttributes): Promise<void> {
    try {
      if (!attributes?.external_id) {
        throw new Error('external_id is required in attributes');
      }

      // Store external_id for future use
      await this.setExternalId(attributes.external_id);

      // Generate internal userId (use external_id as base)
      // API will create/find customer by external_id and return/create userId
      const internalUserId = `usr_${attributes.external_id}`;
      this.currentUserId = internalUserId;

      // Capture timezone (use provided timezone or detect current)
      const timezone = attributes?.timezone || this.getCurrentTimezone();
      if (timezone) {
        await this.setStoredTimezone(timezone);
      }

      const response = await this.post('/identify', {
        external_id: attributes.external_id,
        name: attributes?.name,
        email: attributes?.email,
        phone: attributes?.phone,
        timezone: timezone || undefined,
        anonymousId: this.anonymousId, // Include anonymous ID for merging
        attributes: this.extractCustomAttributes(attributes)
      });

      // Store the returned userId if API generates one
      if (response?.data?.userId) {
        this.currentUserId = response.data.userId;
      }

      this.log('[Tappd SDK] Customer identified:', attributes.external_id);
      
      // After identification, fetch messages immediately
      if (this.enableInAppMessages && this.autoDisplayMessages) {
        setTimeout(() => {
          this.displayPendingMessages(true).catch(() => {});
        }, 500);
      }
      
      return response;
    } catch (error) {
      this.log('[Tappd SDK] Identify error:', error);
      throw error;
    }
  }

  /**
   * Store external ID in AsyncStorage
   */
  private async setExternalId(externalId: string): Promise<void> {
    try {
      await AsyncStorage.setItem('_tappd_external_id', externalId);
    } catch (error) {
      this.log('[Tappd SDK] Failed to store external_id:', error);
    }
  }

  /**
   * Get stored external ID
   */
  private async getExternalId(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem('_tappd_external_id');
    } catch {
      return null;
    }
  }

  /**
   * Update user attributes
   */
  async setUserAttributes(attributes: Partial<CustomerAttributes>): Promise<void> {
    if (!this.currentUserId) {
      throw new Error('User must be identified first. Call identify() first.');
    }
    
    // Get existing external_id from storage or require it
    const existingExternalId = await this.getExternalId();
    if (!existingExternalId && !attributes.external_id) {
      throw new Error('external_id is required. User must be identified first.');
    }
    
    return this.identify({
      external_id: attributes.external_id || existingExternalId!,
      ...attributes
    } as CustomerAttributes);
  }

  /**
   * Set custom attributes only (doesn't require external_id)
   */
  async setCustomAttributes(attributes: Record<string, any>): Promise<void> {
    if (!this.currentUserId) {
      throw new Error('User must be identified first. Call identify() first.');
    }
    
    const existingExternalId = await this.getExternalId();
    if (!existingExternalId) {
      throw new Error('User must be identified first. Call identify() first.');
    }
    
    return this.identify({
      external_id: existingExternalId,
      ...attributes
    } as CustomerAttributes);
  }

  /**
   * Track an event with automatic session management
   */
  async track(eventName: string, properties?: EventProperties): Promise<void> {
    try {
      // Check if session expired
      this.checkAndRefreshSession();

      if (!this.session) {
        this.startNewSession();
      }

      // Update session activity
      this.updateSessionActivity();
      
      // Update activity for message polling
      this.updateActivity();

      const deviceInfo = this.getDeviceInfo();
      const userId = this.currentUserId || this.anonymousId;
      
      // If identified, also send external_id for lookup
      const externalId = await this.getExternalId();

      // Calculate session duration
      const sessionDuration = this.session ? Math.floor((Date.now() - this.session.startedAt) / 1000) : 0;

      // Check if timezone has changed (only if user is identified)
      const timezoneChanged = this.currentUserId ? await this.checkTimezoneChange() : null;

      const response = await this.post('/track', {
        eventName,
        properties: properties || {},
        sessionId: this.session?.sessionId,
        sessionStartTime: this.session?.startedAt,
        sessionDuration,
        userId,
        external_id: externalId,  // Include external_id if available
        timezone: timezoneChanged || undefined,  // Send timezone if it changed
        ...deviceInfo
      });

      // Store event for trigger evaluation
      this.recentEvents.set(eventName, Date.now());
      
      // Clean old events (older than 1 hour)
      this.cleanOldEvents();
      
      // Handle personalized in-app messages returned from trackEvent
      if (response?.data?.inAppMessages && Array.isArray(response.data.inAppMessages)) {
        this.log(`[Tappd SDK] Received ${response.data.inAppMessages.length} personalized message(s) from event tracking`);
        
        // Add messages to cache
        for (const msg of response.data.inAppMessages) {
          if (msg._id) {
            this.messageCache.set(msg._id, msg);
          }
        }
        
        // Save cache
        await this.saveMessageCache();
        
        // Display personalized messages immediately
        for (const message of response.data.inAppMessages) {
          await this.displayInAppMessage(message);
        }
      } else {
        // Check if any pending messages are waiting for this event (fallback)
        this.checkEventTriggers(eventName).catch((error) => {
          this.log('[Tappd SDK] Error checking event triggers:', error);
        });
      }

      this.log('[Tappd SDK] Event tracked:', eventName);
      
      return response;
    } catch (error) {
      this.log('[Tappd SDK] Track error:', error);
      // Don't throw - tracking failures shouldn't break the app
    }
  }

  /**
   * Track push notification opened event
   * Helper to be called from Firebase messaging handlers
   */
  async trackPushOpen(remoteMessage: any): Promise<void> {
    try {
      if (!remoteMessage) {
        return;
      }

      // Firebase messageId may live in different fields depending on platform
      const notificationId =
        remoteMessage.messageId ||
        remoteMessage.message_id ||
        remoteMessage.data?.messageId ||
        remoteMessage.data?.message_id;

      const data = remoteMessage.data || {};

      const properties: EventProperties = {
        notificationId,
        title: remoteMessage.notification?.title,
        body: remoteMessage.notification?.body,
        tappd_workspace_id: data.tappd_workspace_id,
        tappd_journey_id: data.tappd_journey_id,
        tappd_enrollment_id: data.tappd_enrollment_id,
        tappd_step_id: data.tappd_step_id,
        tappd_customer_id: data.tappd_customer_id,
        tappd_message_type: data.tappd_message_type || 'push',
        platform: Platform.OS,
      };

      await this.track('push_notification.opened', properties);
    } catch (error) {
      this.log('[Tappd SDK] trackPushOpen error:', error);
    }
  }

  /**
   * Returns true if FCM/APNs `data` payload is an IAM sync/test push from Tappd
   * (`tappd_message_type` / `tappd_iam_sync`). Data values are often strings.
   */
  private isIamSyncPushData(data: Record<string, unknown> | undefined | null): boolean {
    if (!data || typeof data !== 'object') {
      return false;
    }
    const t = data.tappd_message_type;
    if (t === 'iam_test' || t === 'iam_sync') {
      return true;
    }
    const sync = data.tappd_iam_sync;
    if (sync === '1' || sync === 1 || sync === true) {
      return true;
    }
    return false;
  }

  /**
   * Call from Firebase `onMessage` when the app is in the **foreground**.
   * For IAM test/sync pushes, syncs messages without showing an OS notification (you should not display a local notification for these).
   */
  async handleForegroundPushForInAppMessages(remoteMessage: any): Promise<void> {
    try {
      if (!this.enableInAppMessages) {
        return;
      }
      const data = remoteMessage?.data;
      if (!this.isIamSyncPushData(data)) {
        return;
      }
      await this.syncInAppMessages();
      const rawId = data?.iamId ?? data?.iam_id;
      const iamId = typeof rawId === 'string' ? rawId : rawId != null ? String(rawId) : '';
      if (iamId) {
        await this.triggerInAppMessageById(iamId, true);
      }
    } catch (error) {
      this.log('[Tappd SDK] handleForegroundPushForInAppMessages error:', error);
    }
  }

  /**
   * Call when the user **opens** a notification (background / quit state).
   * Tracks the open, then syncs and optionally shows the IAM for `iamId`.
   */
  async handleNotificationOpenForInAppMessages(remoteMessage: any): Promise<void> {
    try {
      if (!this.enableInAppMessages) {
        return;
      }
      const data = remoteMessage?.data;
      const rawId = data?.iamId ?? data?.iam_id;
      const iamId = typeof rawId === 'string' ? rawId : rawId != null ? String(rawId) : '';
      if (!this.isIamSyncPushData(data) && !iamId) {
        return;
      }
      await this.trackPushOpen(remoteMessage);
      await this.syncInAppMessages();
      if (iamId) {
        await this.triggerInAppMessageById(iamId, true);
      }
    } catch (error) {
      this.log('[Tappd SDK] handleNotificationOpenForInAppMessages error:', error);
    }
  }

  /**
   * Track screen view (equivalent to page view in web)
   */
  async trackScreen(screenName: string, properties?: EventProperties): Promise<void> {
    try {
      // End previous screen tracking if exists
      if (this.screenTracker) {
        const duration = Math.floor((Date.now() - this.screenTracker.startTime) / 1000);
        await this.track('screen.viewed', {
          screenName: this.screenTracker.screenName,
          duration,
          ...properties
        });
      }

      // Check if session expired
      this.checkAndRefreshSession();

      if (!this.session) {
        this.startNewSession();
      }

      // Update session activity
      this.updateSessionActivity();
      
      // Update activity for message polling
      this.updateActivity();
      
      // Fetch messages on screen change (smart refresh)
      if (this.enableInAppMessages && this.autoDisplayMessages) {
        setTimeout(() => {
          this.displayPendingMessages(true).catch(() => {});
        }, 100);
      }

      // Start new screen tracking
      this.screenTracker = {
        screenName,
        startTime: Date.now()
      };

      const userId = this.currentUserId || this.anonymousId;
      
      // If identified, also send external_id for lookup
      const externalId = await this.getExternalId();
      
      const sessionDuration = this.session ? Math.floor((Date.now() - this.session.startedAt) / 1000) : 0;

      // Check if timezone has changed (only if user is identified)
      const timezoneChanged = this.currentUserId ? await this.checkTimezoneChange() : null;

      const response = await this.post('/screen', {
        screenName,
        sessionId: this.session?.sessionId,
        sessionStartTime: this.session?.startedAt,
        sessionDuration,
        userId,
        external_id: externalId,  // Include external_id if available
        timezone: timezoneChanged || undefined,  // Send timezone if it changed
        ...properties
      });

      this.log('[Tappd SDK] Screen tracked:', screenName);
      
      return response;
    } catch (error) {
      this.log('[Tappd SDK] Track screen error:', error);
    }
  }

  /**
   * Get session ID
   */
  getSessionId(): string | null {
    return this.session?.sessionId || null;
  }

  /**
   * Get anonymous ID
   */
  getAnonymousId(): string | null {
    return this.anonymousId;
  }

  /**
   * Reset SDK (clear user data)
   */
  async reset(): Promise<void> {
    this.currentUserId = null;
    this.anonymousId = null;
    this.screenTracker = null;
    this.startNewSession();
    
    // Stop polling
    this.stopMessagePolling();
    
    // Clear activity timer
    if (this.activityTimer) {
      clearInterval(this.activityTimer);
      this.activityTimer = null;
    }
    
    // Clear cache
    this.messageCache.clear();
    this.recentEvents.clear();
    this.eventTriggeredMessages.clear();
    await AsyncStorage.multiRemove(['_tappd_anonymous_id', '_tappd_external_id', this.cacheKey]).catch(() => {});
    
    this.log('[Tappd SDK] Reset');
  }

  /**
   * Cleanup (call when app is closing)
   */
  cleanup(): void {
    // Remove listeners
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
    }
    
    if (this.linkingSubscription) {
      this.linkingSubscription.remove();
    }

    // Stop polling
    this.stopMessagePolling();
    
    // Clear activity timer
    if (this.activityTimer) {
      clearInterval(this.activityTimer);
      this.activityTimer = null;
    }

    // Track app closed
    if (this.autoTrack && this.session) {
      const sessionDuration = Math.floor((Date.now() - this.session.startedAt) / 1000);
      this.track('app.closed', {
        sessionDuration
      }).catch(() => {});
    }

    // End current screen tracking
    if (this.screenTracker) {
      const duration = Math.floor((Date.now() - this.screenTracker.startTime) / 1000);
      this.track('screen.viewed', {
        screenName: this.screenTracker.screenName,
        duration
      }).catch(() => {});
    }
  }

  /**
   * Get current timezone
   */
  private getCurrentTimezone(): string {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch (error) {
      this.log('[Tappd SDK] Error getting timezone:', error);
      return '';
    }
  }

  /**
   * Get stored timezone from AsyncStorage
   */
  private async getStoredTimezone(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem('_tappd_timezone');
    } catch {
      return null;
    }
  }

  /**
   * Store timezone in AsyncStorage
   */
  private async setStoredTimezone(timezone: string): Promise<void> {
    try {
      await AsyncStorage.setItem('_tappd_timezone', timezone);
    } catch (error) {
      this.log('[Tappd SDK] Failed to store timezone:', error);
    }
  }

  /**
   * Check if timezone has changed and return current timezone if changed
   */
  private async checkTimezoneChange(): Promise<string | null> {
    const currentTimezone = this.getCurrentTimezone();
    if (!currentTimezone) {
      return null;
    }

    const storedTimezone = await this.getStoredTimezone();
    if (storedTimezone !== currentTimezone) {
      await this.setStoredTimezone(currentTimezone);
      return currentTimezone;
    }

    return null;
  }

  /**
   * Extract custom attributes (exclude standard fields)
   */
  private extractCustomAttributes(attributes: CustomerAttributes): Record<string, any> {
    const { external_id, name, email, phone, timezone, ...custom } = attributes;
    return custom;
  }

  /**
   * Make POST request
   */
  private async post(endpoint: string, data: any): Promise<any> {
    try {
      // Add appId to the payload
      const payload = {
        ...data,
        appId: this.appId
      };

      const response = await fetch(`${this.apiUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Request failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      this.log('Request error:', error);
      throw error;
    }
  }

  /**
   * Register push token for push notifications
   */
  async registerPushToken(token: string, platform: 'android' | 'ios'): Promise<void> {
    try {
      if (!token || !platform) {
        throw new Error('Push token and platform are required');
      }

      const userId = this.currentUserId || this.anonymousId;
      const externalId = await this.getExternalId();
      const deviceInfo = await this.getFullDeviceInfo();

      if (!userId) {
        throw new Error('User must be identified first');
      }

      const response = await this.post('/register-device', {
        userId,
        external_id: externalId,  // Include external_id if available
        pushToken: token,
        platform,
        deviceId: deviceInfo.deviceId,
        deviceModel: deviceInfo.deviceModel,
        deviceBrand: deviceInfo.deviceBrand,
        deviceName: deviceInfo.deviceName,
        osName: deviceInfo.osName,
        osVersion: deviceInfo.osVersion,
        carrier: deviceInfo.carrier,
        metadata: {
          sdk: 'tappd-mobile-sdk',
          sdkVersion: '1.0.0',
        },
      });

      this.log('[Tappd SDK] Push token registered:', token.substring(0, 20) + '...');
      return response;
    } catch (error) {
      this.log('[Tappd SDK] Register push token error:', error);
      throw error;
    }
  }

  /**
   * Check push subscription status
   */
  async checkPushSubscription(): Promise<{ subscribed: boolean; status: string; deviceCount: number }> {
    try {
      const userId = this.currentUserId || this.anonymousId;
      const externalId = await this.getExternalId();

      if (!userId) {
        throw new Error('User must be identified first');
      }

      const response = await this.get('/push-subscription-status', {
        userId,
        external_id: externalId,  // Include external_id if available
      });

      if (response.success && response.data) {
        return {
          subscribed: response.data.subscribed,
          status: response.data.status,
          deviceCount: response.data.deviceCount,
        };
      }

      throw new Error('Failed to get push subscription status');
    } catch (error) {
      this.log('[Tappd SDK] Check push subscription error:', error);
      throw error;
    }
  }

  /**
   * Get or create device ID (stored in AsyncStorage)
   */
  private async getOrCreateDeviceId(): Promise<string> {
    const key = '_tappd_device_id';
    try {
      let deviceId = await AsyncStorage.getItem(key);
      
      if (!deviceId) {
        deviceId = 'device_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
        await AsyncStorage.setItem(key, deviceId);
      }

      return deviceId;
    } catch (error) {
      // Fallback if AsyncStorage fails
      this.log('[Tappd SDK] AsyncStorage error, using in-memory device ID:', error);
      return 'device_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    }
  }

  /**
   * Make GET request
   */
  private async get(endpoint: string, params?: Record<string, any>): Promise<any> {
    try {
      const queryString = params ? '?' + new URLSearchParams(params).toString() : '';
      const url = `${this.apiUrl}${endpoint}${queryString}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-App-Id': this.appId,
        },
      });

      if (!response.ok) {
        throw new Error(`Request failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      this.log('Request error:', error);
      throw error;
    }
  }

  /**
   * Log debug messages
   */
  private log(...args: any[]): void {
    if (this.debug) {
      console.log('[Tappd SDK]', ...args);
    }
  }

  /**
   * Set callback for rendering messages (called by app)
   */
  setMessageRenderCallback(callback: (message: any) => void): void {
    this.messageRenderCallback = callback;
  }

  /**
   * Subscribe to in-app message list updates after each successful API fetch (Braze-style `inAppMessageReceived`).
   * @returns Unsubscribe function
   */
  subscribeToInAppMessages(listener: (event: { messages: any[] }) => void): () => void {
    this.inAppMessageListeners.push(listener);
    return () => {
      const i = this.inAppMessageListeners.indexOf(listener);
      if (i >= 0) {
        this.inAppMessageListeners.splice(i, 1);
      }
    };
  }

  /**
   * Host registers how to hide the currently visible IAM UI (e.g. unmount modal). Called by dismissCurrentInAppMessage().
   */
  setDismissCurrentInAppMessageHandler(handler: (() => void) | null): void {
    this.dismissCurrentInAppMessageHandler = handler;
  }

  /**
   * Ask the host to hide the current in-app message UI (Braze `hideCurrentInAppMessage` parity). No analytics side effects.
   */
  dismissCurrentInAppMessage(): void {
    if (this.dismissCurrentInAppMessageHandler) {
      this.dismissCurrentInAppMessageHandler();
    }
  }

  private emitInAppMessagesReceived(messages: any[]): void {
    if (this.inAppMessageListeners.length === 0) {
      return;
    }
    const event = { messages };
    for (const listener of [...this.inAppMessageListeners]) {
      try {
        listener(event);
      } catch (e) {
        this.log('[Tappd SDK] inAppMessage listener error:', e);
      }
    }
  }

  /**
   * Initialize in-app messages with smart polling
   */
  private async initializeInAppMessages(): Promise<void> {
    // Load persistent set of messages that have already been shown
    await this.loadShownMessages();

    // Load cached messages immediately
    await this.loadMessageCache();

    // Start polling if auto-display is enabled
    if (this.autoDisplayMessages) {
      // Always fetch on launch (immediate)
      setTimeout(() => {
        this.displayPendingMessages(true).catch((error) => {
          this.log('[Tappd SDK] Error fetching messages on launch:', error);
        });
      }, 1000);

      // Set up smart polling (only when active)
      this.setupSmartPolling();
      
      // Set up activity detection (using AppState)
      this.setupActivityDetection();
    }
  }

  /**
   * Setup smart polling - only polls when user is active
   */
  private setupSmartPolling(): void {
    // Start polling if user is active
    if (this.isUserActive) {
      this.startMessagePolling();
    }
  }

  /**
   * Start message polling (only when user is active)
   */
  private startMessagePolling(): void {
    // Clear existing timer
    if (this.messagePollingTimer) {
      clearInterval(this.messagePollingTimer);
    }

    // Only poll if user is active
    if (!this.isUserActive) {
      this.log('[Tappd SDK] Polling stopped - user inactive');
      return;
    }

    const intervalSec = Math.max(this.messagePollingInterval, this.minMessagePollingIntervalSeconds);
    this.log('[Tappd SDK] Starting message polling (interval: ' + intervalSec + 's)');

    this.messagePollingTimer = setInterval(() => {
      // Check if user is still active before polling
      if (this.isUserActive) {
        this.displayPendingMessages(false).catch((error) => {
          this.log('[Tappd SDK] Error polling messages:', error);
        });
      } else {
        // Stop polling if user became inactive
        this.stopMessagePolling();
      }
    }, intervalSec * 1000);
  }

  /**
   * Stop message polling
   */
  private stopMessagePolling(): void {
    if (this.messagePollingTimer) {
      clearInterval(this.messagePollingTimer);
      this.messagePollingTimer = null;
      this.log('[Tappd SDK] Message polling stopped');
    }
  }

  /**
   * Force-fetch pending IAM from the API and display any new ones.
   */
  async syncInAppMessages(): Promise<void> {
    return this.displayPendingMessages(true);
  }

  /**
   * Setup activity detection using AppState
   * Tracks app state changes and stops/starts polling accordingly
   */
  private setupActivityDetection(): void {
    // Check for inactivity periodically
    this.activityTimer = setInterval(() => {
      const timeSinceActivity = Date.now() - this.lastActivityTime;
      
      if (timeSinceActivity >= this.inactivityThreshold && this.isUserActive) {
        // User has been inactive for threshold time
        this.isUserActive = false;
        this.log('[Tappd SDK] User inactive for ' + Math.floor(timeSinceActivity / 1000) + 's - stopping polling');
        this.stopMessagePolling();
      }
    }, 60000); // Check every minute

    // Update activity on app state changes (already tracked in setupAppStateTracking)
    // We'll enhance the existing handler
    const originalHandler = this.setupAppStateTracking.bind(this);
    // The AppState handler will be enhanced to update lastActivityTime
  }

  /**
   * Update activity time (called on user interactions)
   */
  private updateActivity(): void {
    const wasInactive = !this.isUserActive;
    this.lastActivityTime = Date.now();
    
    // If user was inactive, resume polling
    if (wasInactive) {
      this.isUserActive = true;
      this.log('[Tappd SDK] User became active - resuming polling');
      
      // Fetch immediately when user returns
      this.displayPendingMessages(true).catch((error) => {
        this.log('[Tappd SDK] Error fetching messages on activity:', error);
      });
      
      // Resume polling
      this.startMessagePolling();
    }
  }

  /**
   * Load cached messages from AsyncStorage
   */
  /**
   * Load set of message IDs that have already been shown (from AsyncStorage)
   * This prevents the same IAM from being re-displayed across app launches,
   * even if the backend still marks it as pending.
   */
  private async loadShownMessages(): Promise<void> {
    if (this.shownMessagesLoaded) {
      return;
    }

    try {
      const stored = await AsyncStorage.getItem(this.shownMessagesKey);
      if (stored) {
        const ids: string[] = JSON.parse(stored);
        ids.forEach((id) => {
          if (id && typeof id === 'string') {
            this.shownMessages.add(id);
          }
        });
      }
      this.shownMessagesLoaded = true;
      this.log('[Tappd SDK] Loaded shown messages:', this.shownMessages.size);
    } catch (error) {
      this.log('[Tappd SDK] Failed to load shown messages from AsyncStorage:', error);
      this.shownMessagesLoaded = true; // Avoid retry loops in this session
    }
  }

  /**
   * Persist the set of message IDs that have been shown
   */
  private async saveShownMessages(): Promise<void> {
    try {
      const ids = Array.from(this.shownMessages.values());
      await AsyncStorage.setItem(this.shownMessagesKey, JSON.stringify(ids));
    } catch (error) {
      this.log('[Tappd SDK] Failed to save shown messages to AsyncStorage:', error);
    }
  }

  /**
   * Load messages from AsyncStorage cache
   * Filters out expired messages based on each message's expiresAt
   */
  private async loadMessageCache(): Promise<void> {
    try {
      const cached = await AsyncStorage.getItem(this.cacheKey);
      if (cached) {
        const data = JSON.parse(cached);
        const now = new Date();
        
        // Filter out expired messages based on their individual expiresAt
        const validMessages = (data.messages || []).filter(([messageId, message]: [string, any]) => {
          if (!message.expiresAt) {
            return true; // No expiry, keep message
          }
          const expiresAt = new Date(message.expiresAt);
          return expiresAt > now; // Keep if not expired
        });
        
        if (validMessages.length > 0) {
          this.messageCache = new Map(validMessages);
          this.lastFetchTime = data.timestamp;
          
          const expiredCount = (data.messages || []).length - validMessages.length;
          this.log('[Tappd SDK] Loaded ' + this.messageCache.size + ' valid cached messages' + (expiredCount > 0 ? ` (filtered ${expiredCount} expired)` : ''));
          
          // Save filtered cache back to AsyncStorage
          await this.saveMessageCache();
          
          // Display cached messages immediately (if auto-display enabled)
          if (this.autoDisplayMessages) {
            this.displayPendingMessages(false).catch(() => {});
          }
        } else {
          // No valid messages, clear cache
          if ((data.messages || []).length > 0) {
            this.log('[Tappd SDK] All cached messages expired, clearing cache');
          }
          await AsyncStorage.removeItem(this.cacheKey);
          this.messageCache.clear();
        }
      }
    } catch (e) {
      this.log('Failed to load message cache:', e);
    }
  }

  /**
   * Save messages to AsyncStorage cache
   */
  private async saveMessageCache(): Promise<void> {
    try {
      const data = {
        messages: Array.from(this.messageCache.entries()),
        timestamp: Date.now(),
      };
      await AsyncStorage.setItem(this.cacheKey, JSON.stringify(data));
    } catch (e) {
      this.log('Failed to save message cache:', e);
    }
  }

  /**
   * Get pending in-app messages (with caching)
   * Filters out expired messages based on each message's expiresAt
   */
  async getInAppMessages(forceRefresh = false): Promise<any[]> {
    // Filter expired messages from cache
    const now = new Date();
    const validCachedMessages = Array.from(this.messageCache.values()).filter((msg: any) => {
      if (!msg.expiresAt) {
        return true; // No expiry, keep message
      }
      const expiresAt = new Date(msg.expiresAt);
      return expiresAt > now; // Keep if not expired
    });
    
    // Remove expired messages from cache
    if (validCachedMessages.length < this.messageCache.size) {
      const expiredCount = this.messageCache.size - validCachedMessages.length;
      this.messageCache.clear();
      validCachedMessages.forEach((msg: any) => {
        this.messageCache.set(msg._id, msg);
      });
      if (expiredCount > 0) {
        this.log(`[Tappd SDK] Removed ${expiredCount} expired message(s) from cache`);
        await this.saveMessageCache();
      }
    }
    
    if (
      !forceRefresh &&
      this.messageFetchDedupeMs > 0 &&
      this.lastFetchTime > 0 &&
      Date.now() - this.lastFetchTime < this.messageFetchDedupeMs
    ) {
      this.log('[Tappd SDK] Using cached messages (fetch dedupe window)');
      return validCachedMessages;
    }

    // Fetch from API
    try {
      const userId = this.currentUserId || this.anonymousId;
      const externalId = await this.getExternalId();
      
      // Build query parameters
      const params: Record<string, string> = {};
      if (userId) params.userId = userId;
      if (externalId) params.externalId = externalId;

      const queryString = Object.keys(params).length > 0
        ? '?' + new URLSearchParams(params).toString()
        : '';
      const url = `${this.apiUrl}/in-app-messages${queryString}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-App-Id': this.appId,
        },
      });

      if (!response.ok) {
        throw new Error(`Request failed: ${response.statusText}`);
      }

      const result = await response.json();
      const messages = result.data?.messages || [];
      
      // Filter out expired messages (API should already filter, but double-check)
      const now = new Date();
      const validMessages = messages.filter((msg: any) => {
        if (!msg.expiresAt) {
          return true; // No expiry, keep message
        }
        const expiresAt = new Date(msg.expiresAt);
        return expiresAt > now; // Keep if not expired
      });

      // Update cache with valid messages only
      // Keep existing non-expired messages that weren't in this fetch
      const fetchedMessageIds = new Set(validMessages.map((msg: any) => msg._id));
      const existingValidMessages = Array.from(this.messageCache.values()).filter((msg: any) => {
        // Keep if not in fetched messages and not expired
        if (fetchedMessageIds.has(msg._id)) {
          return false; // Will be replaced by fetched version
        }
        if (!msg.expiresAt) {
          return true;
        }
        const expiresAt = new Date(msg.expiresAt);
        return expiresAt > now;
      });
      
      this.messageCache.clear();
      // Add existing valid messages
      existingValidMessages.forEach((msg: any) => {
        this.messageCache.set(msg._id, msg);
      });
      // Add/update fetched messages
      validMessages.forEach((msg: any) => {
        this.messageCache.set(msg._id, msg);
        
        // Register event-triggered messages to wait for events
        const triggerConfig = msg.triggerConfig || msg.config?.triggerConfig;
        if (triggerConfig?.type === 'event' && triggerConfig.eventName) {
          // Check if event already occurred
          if (!this.hasEventOccurred(triggerConfig.eventName)) {
            this.registerEventTrigger(triggerConfig.eventName, msg._id);
          }
        }
      });
      this.lastFetchTime = Date.now();
      await this.saveMessageCache();

      this.log('[Tappd SDK] Fetched ' + validMessages.length + ' valid message(s) from API');
      this.emitInAppMessagesReceived(validMessages);
      return validMessages;
    } catch (error) {
      // Fallback to stale cache if API fails (filter expired messages)
      if (this.messageCache.size > 0) {
        const now = new Date();
        const validCachedMessages = Array.from(this.messageCache.values()).filter((msg: any) => {
          if (!msg.expiresAt) {
            return true; // No expiry, keep message
          }
          const expiresAt = new Date(msg.expiresAt);
          return expiresAt > now; // Keep if not expired
        });
        
        if (validCachedMessages.length > 0) {
          this.log('[Tappd SDK] API failed, using stale cache (filtered expired messages)');
          return validCachedMessages;
        }
      }
      this.log('[Tappd SDK] Get in-app messages error:', error);
      throw error;
    }
  }

  /**
   * Display a single in-app message
   */
  async displayInAppMessage(message: any): Promise<void> {
    try {
      // Ensure we have loaded the set of already-shown messages
      await this.loadShownMessages();

      // Check if message has expired
      if (this.checkMessageExpiration(message)) {
        this.log('[Tappd SDK] Message expired, skipping:', message._id);
        return;
      }

      // Check if message is already displayed
      if (this.displayedMessages.has(message._id)) {
        this.log('[Tappd SDK] Message already displayed:', message._id);
        return;
      }

      // Evaluate trigger (pass message for event trigger registration)
      const triggerConfig = message.triggerConfig || message.config?.triggerConfig;
      
      // For immediate triggers, check if message has been shown before
      // Only show again if journey is recurring
      if (triggerConfig?.type === 'immediate' && this.shownMessages.has(message._id)) {
        const isRecurring = message.journeyRecurring === true;
        if (!isRecurring) {
          this.log('[Tappd SDK] Message already shown and journey is not recurring, skipping:', message._id);
          return;
        }
      }
      
      if (!this.evaluateTrigger(triggerConfig, message)) {
        this.log('[Tappd SDK] Trigger condition not met for message:', message._id);
        return;
      }

      // Call render callback if set
      if (this.messageRenderCallback) {
        this.messageRenderCallback(message);
      } else {
        this.log('[Tappd SDK] No message render callback set. Use setMessageRenderCallback() to render messages.');
      }

      // Mark as displayed for this session
      this.displayedMessages.add(message._id);

      // Persist that this message has been shown so it is never re-displayed,
      // even if the app is closed and reopened within its expiration window.
      this.shownMessages.add(message._id);
      this.saveShownMessages().catch((error) => {
        this.log('[Tappd SDK] Error saving shown messages:', error);
      });

      // Track viewed event
      await this.trackMessageEvent(message._id, 'viewed', {});

      // Mark as delivered in API
      await this.markMessageDelivered(message._id);

      this.log('[Tappd SDK] Message displayed:', message._id);
    } catch (error) {
      this.log('[Tappd SDK] Display message error:', error);
    }
  }

  /**
   * Trigger a specific in-app message by ID (e.g. from push payload).
   * Uses the existing getInAppMessages + displayInAppMessage pipeline so
   * triggers, expiration, and tracking behavior stay consistent.
   */
  async triggerInAppMessageById(messageId: string, forceRefresh = true): Promise<void> {
    try {
      const messages = await this.getInAppMessages(forceRefresh);
      const want = String(messageId);
      const target = messages.find((msg: any) => {
        if (!msg) return false;
        const id = msg._id != null ? String(msg._id) : '';
        const alt = msg.id != null ? String(msg.id) : '';
        return id === want || alt === want;
      });
      if (!target) {
        this.log('[Tappd SDK] triggerInAppMessageById: no message found for id:', messageId);
        return;
      }
      await this.displayInAppMessage(target);
    } catch (error) {
      this.log('[Tappd SDK] triggerInAppMessageById error:', error);
    }
  }

  /**
   * Display all pending messages
   */
  async displayPendingMessages(forceRefresh = false): Promise<void> {
    if (!this.enableInAppMessages) {
      return;
    }

    try {
      const messages = await this.getInAppMessages(forceRefresh);
      
      // Filter out already displayed messages
      const newMessages = messages.filter(
        (msg) => !this.displayedMessages.has(msg._id)
      );

      // Display messages one by one
      for (const message of newMessages) {
        await this.displayInAppMessage(message);
      }
    } catch (error) {
      this.log('[Tappd SDK] Display pending messages error:', error);
    }
  }

  /**
   * Dismiss an in-app message
   */
  async dismissMessage(messageId: string): Promise<void> {
    try {
      // Remove from displayed set
      this.displayedMessages.delete(messageId);

      // Track dismissed event (including close source)
      await this.trackMessageEvent(messageId, 'dismissed', {
        closeSource: 'programmatic',
      });

      // Track close action
      await this.trackMessageEvent(messageId, 'closed', {
        closeSource: 'dismiss',
      });

      // Mark as dismissed in API
      await this.markMessageDismissed(messageId);

      // Also remove from local cache so it is not considered pending again
      if (this.messageCache.has(messageId)) {
        this.messageCache.delete(messageId);
        this.saveMessageCache().catch((error) => {
          this.log('[Tappd SDK] Failed to update message cache after dismissal:', error);
        });
      }

      this.log('[Tappd SDK] Message dismissed:', messageId);
    } catch (error) {
      this.log('[Tappd SDK] Dismiss message error:', error);
    }
  }

  /**
   * Close IAM (alias for dismissMessage with tracking)
   */
  async closeIAM(messageId?: string): Promise<void> {
    let targetMessageId = messageId;
    
    // If no messageId provided, find currently displayed message
    if (!targetMessageId) {
      // Find the first displayed message (typically only one is displayed at a time)
      const displayedIds = Array.from(this.displayedMessages);
      if (displayedIds.length > 0) {
        targetMessageId = displayedIds[0];
      } else {
        this.log('[Tappd SDK] No message to close');
        return;
      }
    }

    // Track close action before dismissing
    await this.trackMessageEvent(targetMessageId, 'closed', {
      closeSource: 'closeIAM_method',
    });

    await this.dismissMessage(targetMessageId);
  }

  /**
   * Navigate to next page (placeholder - needs message render callback support)
   */
  async nextPage(messageId?: string): Promise<void> {
    this.log('[Tappd SDK] nextPage() - Page navigation requires message render callback support');
    // Note: Full implementation would require tracking current message and page index
    // This would need to be handled in the message render callback
  }

  /**
   * Navigate to previous page (placeholder - needs message render callback support)
   */
  async previousPage(messageId?: string): Promise<void> {
    this.log('[Tappd SDK] previousPage() - Page navigation requires message render callback support');
    // Note: Full implementation would require tracking current message and page index
    // This would need to be handled in the message render callback
  }

  /**
   * Track message event
   */
  async trackMessageEvent(messageId: string, eventType: string, metadata: Record<string, any>): Promise<void> {
    try {
      await this.track(`message.${eventType}`, {
        messageId,
        ...metadata,
      });
    } catch (error) {
      this.log('[Tappd SDK] Track message event error:', error);
    }
  }

  /**
   * Mark message as delivered
   */
  private async markMessageDelivered(messageId: string): Promise<void> {
    try {
      const response = await fetch(`${this.apiUrl}/in-app-messages/${messageId}/delivered`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-App-Id': this.appId,
        },
      });

      if (!response.ok) {
        throw new Error(`Request failed: ${response.statusText}`);
      }

      // On successful delivery, remove from local cache so it is not re-used
      if (this.messageCache.has(messageId)) {
        this.messageCache.delete(messageId);
        this.saveMessageCache().catch((error) => {
          this.log('[Tappd SDK] Failed to update message cache after delivery:', error);
        });
      }
    } catch (error) {
      this.log('[Tappd SDK] Mark message delivered error:', error);
    }
  }

  /**
   * Mark message as dismissed
   */
  private async markMessageDismissed(messageId: string): Promise<void> {
    try {
      const response = await fetch(`${this.apiUrl}/in-app-messages/${messageId}/dismiss`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-App-Id': this.appId,
        },
      });

      if (!response.ok) {
        throw new Error(`Request failed: ${response.statusText}`);
      }
    } catch (error) {
      this.log('[Tappd SDK] Mark message dismissed error:', error);
    }
  }

  /**
   * Evaluate trigger conditions
   */
  private evaluateTrigger(triggerConfig: any, message?: any): boolean {
    if (!triggerConfig || triggerConfig.type === 'immediate') {
      return true;
    }

    if (triggerConfig.type === 'delay') {
      // Delay triggers are handled server-side (triggeredAt)
      return true;
    }

    if (triggerConfig.type === 'event') {
      // Check if the event has occurred recently (within last hour)
      if (!triggerConfig.eventName) {
        return false;
      }
      
      const hasEventOccurred = this.hasEventOccurred(triggerConfig.eventName, 3600000); // 1 hour window
      
      if (!hasEventOccurred) {
        // Event hasn't occurred yet - register this message to wait for the event
        if (message && message._id) {
          this.registerEventTrigger(triggerConfig.eventName, message._id);
        }
        return false; // Don't display yet
      }
      
      return true; // Event occurred, display message
    }

    return true;
  }

  /**
   * Check if message has expired
   */
  private checkMessageExpiration(message: any): boolean {
    if (!message.expiresAt) {
      return false;
    }

    const expiresAt = new Date(message.expiresAt);
    const now = new Date();

    return now > expiresAt;
  }

  /**
   * Check if an event has occurred recently
   */
  private hasEventOccurred(eventName: string, withinMs: number = 3600000): boolean {
    const timestamp = this.recentEvents.get(eventName);
    if (!timestamp) {
      return false;
    }
    return (Date.now() - timestamp) < withinMs;
  }

  /**
   * Clean old events from recent events map (older than 1 hour)
   */
  private cleanOldEvents(): void {
    const oneHourAgo = Date.now() - 3600000;
    for (const [eventName, timestamp] of this.recentEvents.entries()) {
      if (timestamp < oneHourAgo) {
        this.recentEvents.delete(eventName);
      }
    }
  }

  /**
   * Register a message to wait for a specific event
   */
  private registerEventTrigger(eventName: string, messageId: string): void {
    if (!this.eventTriggeredMessages.has(eventName)) {
      this.eventTriggeredMessages.set(eventName, new Set());
    }
    this.eventTriggeredMessages.get(eventName)!.add(messageId);
    this.log('[Tappd SDK] Message ' + messageId + ' registered to wait for event: ' + eventName);
  }

  /**
   * Check if any pending messages are waiting for a tracked event
   */
  private async checkEventTriggers(eventName: string): Promise<void> {
    const waitingMessageIds = this.eventTriggeredMessages.get(eventName);
    if (!waitingMessageIds || waitingMessageIds.size === 0) {
      return; // No messages waiting for this event
    }

    this.log('[Tappd SDK] Event ' + eventName + ' occurred, checking ' + waitingMessageIds.size + ' waiting messages');

    // Get messages from cache
    const messagesToDisplay: any[] = [];
    for (const messageId of waitingMessageIds) {
      const message = this.messageCache.get(messageId);
      if (message && !this.displayedMessages.has(messageId)) {
        // Verify trigger still matches
        const triggerConfig = message.triggerConfig || message.config?.triggerConfig;
        if (triggerConfig?.type === 'event' && triggerConfig.eventName === eventName) {
          messagesToDisplay.push(message);
        }
      }
    }

    // Display messages that were waiting for this event
    for (const message of messagesToDisplay) {
      await this.displayInAppMessage(message);
    }

    // Remove displayed messages from waiting list
    for (const messageId of waitingMessageIds) {
      if (this.displayedMessages.has(messageId)) {
        waitingMessageIds.delete(messageId);
      }
    }

    // Clean up empty event entries
    if (waitingMessageIds.size === 0) {
      this.eventTriggeredMessages.delete(eventName);
    }
  }

  /**
   * Banner API
   */
  public banners = {
    /**
     * Manually track banner display
     * @param bannerId - Banner ID
     * @param variantId - Variant ID
     * @param selector - Placement selector
     * @returns Promise<string> - Display ID for use with click/dismiss
     */
    display: async (bannerId: string, variantId: string, selector: string): Promise<string> => {
      return await this.trackBannerDisplay(bannerId, variantId, selector);
    },

    /**
     * Manually track banner click
     */
    click: async (bannerId: string, displayId: string): Promise<void> => {
      await this.trackBannerClick(bannerId, displayId);
    },

    /**
     * Manually track banner dismiss
     */
    dismiss: async (bannerId: string, displayId: string): Promise<void> => {
      await this.trackBannerDismiss(bannerId, displayId);
    },
  };

  /**
   * Get banners for a selector
   * @param selector - Placement identifier (screen name, component name, etc.)
   * @param options - Optional configuration
   * @returns Promise<Banner[]> - Array of banner data
   */
  async getBanners(selector: string, options: { forceRefresh?: boolean } = {}): Promise<any[]> {
    try {
      // Check cache if not forcing refresh
      if (!options.forceRefresh && this.bannerCache.has(selector)) {
        const cached = this.bannerCache.get(selector);
        const cacheAge = Date.now() - cached.timestamp;
        if (cacheAge < 5 * 60 * 1000) { // 5 minutes cache
          this.log('[Tappd SDK] Using cached banners for:', selector);
          return cached.banners;
        }
      }

      // Fetch banners from API
      const banners = await this.fetchBannersFromAPI(selector);

      // Update cache
      this.bannerCache.set(selector, {
        banners,
        timestamp: Date.now(),
      });

      return banners;
    } catch (error) {
      this.log('[Tappd SDK] Get banners error:', error);
      throw error;
    }
  }

  /**
   * Fetch banners from API
   */
  private async fetchBannersFromAPI(selector: string): Promise<any[]> {
    const userId = this.currentUserId || this.anonymousId;
    const externalId = await this.getExternalId();

    const params: Record<string, string> = { selector };
    if (userId) params.userId = userId;
    if (externalId) params.externalId = externalId;

    const queryString = new URLSearchParams(params).toString();
    const url = `${this.apiUrl}/banners?${queryString}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-App-Id': this.appId,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch banners: ${response.statusText}`);
    }

    const result = await response.json();
    return result.data?.banners || [];
  }

  /**
   * Track banner display
   */
  private async trackBannerDisplay(bannerId: string, variantId: string, selector: string): Promise<string> {
    try {
      const userId = this.currentUserId || this.anonymousId;
      const externalId = await this.getExternalId();

      const response = await this.post(`/banners/${bannerId}/display`, {
        variantId,
        selector,
        userId,
        externalId,
      });

      return response.data?.displayId || '';
    } catch (error) {
      this.log('[Tappd SDK] Track banner display error:', error);
      return '';
    }
  }

  /**
   * Track banner click
   */
  private async trackBannerClick(bannerId: string, displayId: string): Promise<void> {
    try {
      await this.post(`/banners/${bannerId}/click`, {
        displayId,
      });
    } catch (error) {
      this.log('[Tappd SDK] Track banner click error:', error);
    }
  }

  /**
   * Track banner dismiss
   */
  private async trackBannerDismiss(bannerId: string, displayId: string): Promise<void> {
    try {
      await this.post(`/banners/${bannerId}/dismiss`, {
        displayId,
      });
    } catch (error) {
      this.log('[Tappd SDK] Track banner dismiss error:', error);
    }
  }

  /**
   * Handle IAM form submit (call from MessageRenderer `onFormSubmit` or custom UI).
   */
  async submitInAppForm(
    messageId: string,
    formData: Record<string, any>,
    submitAction?: any
  ): Promise<void> {
    await this.trackMessageEvent(messageId, 'form_submitted', {
      fieldKeys: Object.keys(formData || {}),
    });
    await this.captureFormData(messageId, formData, submitAction);
  }

  /**
   * Process IAM button `action` (call from `onButtonClick` when action is present).
   */
  async processInAppButtonInteraction(
    messageId: string,
    link: string,
    text: string,
    action?: any
  ): Promise<void> {
    await this.trackMessageEvent(messageId, 'clicked', {
      buttonText: text,
      buttonLink: link,
      actionType: action?.type,
    });

    if (!action || action.type === 'none') {
      if (link && link !== '#') {
        const canOpen = await Linking.canOpenURL(link);
        if (canOpen) await Linking.openURL(link);
      }
      return;
    }

    if (action.type === 'close') {
      await this.dismissMessage(messageId);
      return;
    }
    if (action.type === 'track_event') {
      await this.handleBridgeAction(messageId, 'track_event', {
        eventName: action.eventName,
        eventProperties: action.eventProperties,
      });
      return;
    }
    if (action.type === 'update_profile') {
      await this.handleBridgeAction(messageId, 'update_profile', {
        profileAttributes: action.profileAttributes,
      });
      return;
    }
    if (action.type === 'link') {
      const target = action.link || link;
      if (target && target !== '#') {
        const canOpen = await Linking.canOpenURL(target);
        if (canOpen) await Linking.openURL(target);
      }
    }
  }

  private async handleBridgeAction(
    messageId: string,
    actionType: string,
    actionData: any,
    formData?: Record<string, any>
  ): Promise<void> {
    try {
      const userId = this.currentUserId || this.anonymousId;
      const externalId = await this.getExternalId();

      const response = await fetch(`${this.apiUrl}/bridge/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-App-Id': this.appId,
        },
        body: JSON.stringify({
          messageId,
          actionType,
          actionData,
          formData,
          userId,
          external_id: externalId || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`Request failed: ${response.statusText}`);
      }
    } catch (error) {
      this.log('[Tappd SDK] Bridge action error:', error);
    }
  }

  private async captureFormData(
    messageId: string,
    formData: Record<string, any>,
    submitAction?: any
  ): Promise<void> {
    try {
      const userId = this.currentUserId || this.anonymousId;
      const externalId = await this.getExternalId();

      const response = await fetch(`${this.apiUrl}/bridge/capture`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-App-Id': this.appId,
        },
        body: JSON.stringify({
          messageId,
          formData,
          submitAction,
          userId,
          external_id: externalId || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`Request failed: ${response.statusText}`);
      }
    } catch (error) {
      this.log('[Tappd SDK] Form capture error:', error);
    }
  }
}

export {
  MessageRenderer,
  BannerRenderer,
  PopupRenderer,
  ModalRenderer,
  FullScreenRenderer,
  NotificationRenderer,
} from './renderers/MessageRenderer';
export type { MessageRendererProps } from './renderers/MessageRenderer';
export type { InAppMessage, InAppMessageConfig } from './types/inAppMessage';

export default TappdSDK;
