# Tappd Mobile SDK (React Native)

Customer Data Platform SDK for React Native applications (iOS and Android). Track user behavior, sessions, screen views, and custom events with automatic session management and anonymous user tracking.

## Features

✅ **Automatic Session Management** - Time-based sessions with configurable timeout  
✅ **Anonymous User Tracking** - Track users before identification, automatically merge data  
✅ **Auto Screen Tracking** - Automatic screen view tracking with React Navigation support  
✅ **Manual Event Tracking** - Track custom events throughout your application  
✅ **App Lifecycle Tracking** - Automatic foreground/background event tracking  
✅ **Deep Link Tracking** - Automatic deep link and UTM parameter tracking  
✅ **Comprehensive Device Info** - Platform, OS version, and device information  
✅ **Screen Duration Tracking** - Track time spent on screens  
✅ **Push Notification Support** - Register push tokens and check subscription status  

## Installation

```bash
npm install @tappd/react-native-sdk @react-native-async-storage/async-storage react-native-webview
```

`react-native-webview` is required to render custom HTML in-app message blocks (JS + CSS execute in a real browser context). On iOS run `pod install` after installing.

For push notifications, you'll also need:
```bash
npm install @react-native-firebase/messaging
# or
npm install react-native-push-notification
```

### iOS Setup

```bash
cd ios && pod install
```

### Android Setup

No additional setup required. The SDK uses React Native's built-in APIs.

## Quick Start

### 1. Get Your App ID

1. Log into your Tappd dashboard
2. Navigate to Settings > Apps
3. Copy the App ID for your mobile app

### 2. Initialize the SDK

```javascript
import TappdSDK from '@tappd/react-native-sdk';

const tappd = new TappdSDK({
  appId: 'YOUR_APP_ID',
  apiUrl: 'https://sdk.tappd.io/api/v1/sdk', // Optional
  autoTrack: true, // Auto-track app lifecycle events (default: true)
  sessionTimeout: 30, // Session timeout in minutes (default: 30)
  enableAutoScreenTracking: true, // Auto-track screen changes (default: true)
  enableInAppMessages: true, // Enable in-app messages (default: true)
  messagePollingInterval: 60, // Poll interval in seconds when active (default: 60)
  inactivityThreshold: 300, // Stop polling after 5 minutes of inactivity (default: 300 seconds)
  debug: false // Enable debug logging (default: false)
});
```

### 3. Identify Users

```javascript
// When user logs in or signs up
await tappd.identify('user_123', {
  name: 'John Doe',
  email: 'john@example.com',
  phone: '+1234567890',
  external_id: 'ext_123',
  // Custom attributes
  age: 28,
  plan: 'premium',
  company: 'Acme Corp'
});
```

### 4. Track Custom Events

We recommend using standard event names for consistency:

```javascript
// Ecommerce events
await tappd.track('ecommerce.product_viewed', {
  productId: 'prod_123',
  productName: 'Pro Plan',
  price: 99.99
});

await tappd.track('ecommerce.add_to_cart', {
  productId: 'prod_123',
  quantity: 1,
  price: 99.99,
  currency: 'USD'
});

await tappd.track('ecommerce.purchase', {
  orderId: 'ord_123',
  total: 99.99,
  currency: 'USD',
  items: [...]
});

// App interaction events
await tappd.track('app.interaction.button_click', {
  buttonId: 'signup_button',
  location: 'onboarding_screen'
});

// User events
await tappd.track('user.signup', {
  method: 'email',
  source: 'onboarding'
});
```

### 5. Track Screen Views

```javascript
// Manual screen tracking
await tappd.trackScreen('HomeScreen', {
  category: 'main',
  section: 'dashboard'
});

// Or integrate with React Navigation
import { useFocusEffect } from '@react-navigation/native';

function HomeScreen() {
  useFocusEffect(
    React.useCallback(() => {
      tappd.trackScreen('HomeScreen');
    }, [])
  );
  
  return <View>...</View>;
}
```

## Configuration

### TappdConfig Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `appId` | string | **Required** | Your App ID from the dashboard |
| `apiUrl` | string | `https://sdk.tappd.io/api/v1/sdk` | Custom API URL |
| `autoTrack` | boolean | `true` | Auto-track app lifecycle events |
| `sessionTimeout` | number | `30` | Session timeout in minutes |
| `enableAutoScreenTracking` | boolean | `true` | Auto-track screen changes |
| `debug` | boolean | `false` | Enable debug logging |

## Push Notifications

### Register Push Token

Register a device's push token to enable push notifications:

```javascript
import messaging from '@react-native-firebase/messaging';

// Get FCM token
const token = await messaging().getToken();

// Register with Tappd SDK
await tappd.registerPushToken(token, 'android'); // or 'ios'
```

### Check Subscription Status

Check if a user has subscribed to push notifications:

```javascript
const status = await tappd.checkPushSubscription();

console.log('Subscribed:', status.subscribed);
console.log('Status:', status.status); // 'subscribed', 'opted_in', or 'unsubscribed'
console.log('Device Count:', status.deviceCount);
```

### React Native Firebase Integration Example

```javascript
import messaging from '@react-native-firebase/messaging';
import { Platform } from 'react-native';
import TappdSDK from '@tappd/react-native-sdk';

const tappd = new TappdSDK({ appId: 'YOUR_APP_ID' });

// Request permission
const authStatus = await messaging().requestPermission();
const enabled =
  authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
  authStatus === messaging.AuthorizationStatus.PROVISIONAL;

if (enabled) {
  // Get token
  const token = await messaging().getToken();
  
  // Register with Tappd
  await tappd.registerPushToken(token, Platform.OS === 'ios' ? 'ios' : 'android');
  
  // Check subscription status
  const status = await tappd.checkPushSubscription();
  console.log('Push subscription:', status);
}

// Listen for token refresh
messaging().onTokenRefresh(async (token) => {
  await tappd.registerPushToken(token, Platform.OS === 'ios' ? 'ios' : 'android');
});

// In-app message (IAM) test / sync — either wire manually (below) or use one call:
// tappd.registerFirebaseMessagingForInAppMessages(messaging());

// Data payload includes tappd_message_type (iam_test | iam_sync), iamId, tappd_iam_sync.
// Foreground: sync silently — do not show an extra local notification for these.
messaging().onMessage(async (remoteMessage) => {
  await tappd.handleForegroundPushForInAppMessages(remoteMessage);
});

messaging().onNotificationOpenedApp(async (remoteMessage) => {
  await tappd.handleNotificationOpenForInAppMessages(remoteMessage);
});

// Cold start: user tapped a notification while the app was fully quit
messaging()
  .getInitialNotification()
  .then((remoteMessage) => tappd.handleInitialNotificationForInAppMessages(remoteMessage));
```

Equivalent one-liner (recommended so you do not miss `getInitialNotification`):

```javascript
const unsubscribe = tappd.registerFirebaseMessagingForInAppMessages(messaging());
// optional: unsubscribe() on app teardown
```

**Important**

- Pass **`messaging()`** (with parentheses). Passing `messaging` without calling it throws a clear error from the SDK.
- **Android, app in foreground:** FCM does **not** show a banner/tray notification automatically. If you used to have your own `onMessage` that called Notifee / another library, keep that — either wire manually (IAM handler + your code) or pass the second argument:

```javascript
tappd.registerFirebaseMessagingForInAppMessages(messaging(), {
  onForegroundMessage: async (msg) => {
    // Your existing logic, e.g. Notifee.displayNotification(...)
  },
});
```

If you **only** registered the Tappd helper and removed all other foreground handling, it can look like “no push” while the app is open even though the message was delivered to JS.

### In-app message sync pushes (test from dashboard)

When you use **Send test push** on an in-app message in the Tappd dashboard, the API sends an FCM message whose **data** includes `tappd_message_type`, `iamId`, and `tappd_iam_sync`. Wire **all** of the handlers above (including `getInitialNotification`) so that:

- **App already open (foreground):** `handleForegroundPushForInAppMessages` runs from `onMessage` and syncs/shows the IAM.
- **App in background:** Firebase usually **does not** call `onMessage` when the payload includes both `notification` and `data` (the tray notification is shown instead). IAM sync runs when the user **taps** the notification (`onNotificationOpenedApp`), not when the notification merely appears.
- **App quit → user taps notification:** use `getInitialNotification` + `handleInitialNotificationForInAppMessages`.

If the push is “received” (tray) but nothing syncs until you open the app from the icon, that is expected on Android until the user taps the notification or you rely on IAM polling.

See also `packages/shared/PUSH_IAM.md` for the full payload contract.

## API Reference

### Core Methods

#### `identify(userId, attributes?)`

Identify or update a customer. Automatically merges anonymous data if user was previously anonymous.

```javascript
await tappd.identify('user_123', {
  name: 'John Doe',
  email: 'john@example.com',
  // Custom attributes
  age: 28,
  plan: 'premium'
});
```

**Returns:** `Promise<void>`

---

#### `track(eventName, properties?)`

Track a custom event. We recommend using standard event names (see [Standard Events](#standard-events)).

```javascript
// Using standard event names
await tappd.track('ecommerce.add_to_cart', {
  productId: 'prod_123',
  quantity: 1,
  price: 99.99,
  currency: 'USD'
});

// Or custom event names
await tappd.track('custom_event', {
  customProperty: 'value'
});
```

**Returns:** `Promise<void>`

---

#### `trackScreen(screenName, properties?)`

Track a screen view (equivalent to page view in web).

```javascript
await tappd.trackScreen('ProductDetailScreen', {
  productId: 'prod_123',
  category: 'electronics'
});
```

**Returns:** `Promise<void>`

---

#### `setExternalId(externalId)`

Set the external ID for the current user.

```javascript
await tappd.setExternalId('ext_user_123');
```

**Returns:** `Promise<void>`

---

#### `setUserAttributes(attributes)`

Update user attributes.

```javascript
await tappd.setUserAttributes({
  plan: 'enterprise',
  lastLogin: new Date()
});
```

**Returns:** `Promise<void>`

---

#### `setCustomAttributes(attributes)`

Set custom user attributes.

```javascript
await tappd.setCustomAttributes({
  preferences: { theme: 'dark', language: 'en' }
});
```

**Returns:** `Promise<void>`

---

### Utility Methods

#### `getSessionId()`

Get the current session ID.

```javascript
const sessionId = tappd.getSessionId();
console.log('Session ID:', sessionId);
```

**Returns:** `string | null`

---

#### `getAnonymousId()`

Get the anonymous ID (persists across sessions).

```javascript
const anonymousId = tappd.getAnonymousId();
console.log('Anonymous ID:', anonymousId);
```

**Returns:** `string | null`

---

#### `reset()`

Reset the SDK state (clear user data, useful for logout).

```javascript
tappd.reset();
```

**Returns:** `void`

---

#### `cleanup()`

Cleanup SDK (call when app is closing).

```javascript
// In your App component or app lifecycle handler
tappd.cleanup();
```

**Returns:** `void`

---

#### `registerPushToken(token, platform)`

Register a push token for push notifications.

```javascript
await tappd.registerPushToken('fcm_token_here', 'android'); // or 'ios'
```

**Parameters:**
- `token` (string): The FCM push token
- `platform` ('android' | 'ios'): The device platform

**Returns:** `Promise<void>`

**Note:** User must be identified first using `identify()`.

---

#### `checkPushSubscription()`

Check the push subscription status for the current user.

```javascript
const status = await tappd.checkPushSubscription();
console.log('Subscribed:', status.subscribed);
console.log('Status:', status.status);
console.log('Device Count:', status.deviceCount);
```

**Returns:** `Promise<{ subscribed: boolean; status: string; deviceCount: number }>`

**Note:** User must be identified first using `identify()`.

---

#### `trackPushOpen(remoteMessage)`

Track a push notification open (call from your notification handler with the FCM message object).

**Returns:** `Promise<void>`

---

#### `handleForegroundPushForInAppMessages(remoteMessage)`

Handle IAM test/sync pushes while the app is in the **foreground** (`messaging().onMessage`). Syncs IAMs without requiring a visible notification.

**Returns:** `Promise<void>`

---

#### `handleNotificationOpenForInAppMessages(remoteMessage)`

Handle when the user **opens** a notification that carries IAM sync data (`onNotificationOpenedApp`).

**Returns:** `Promise<void>`

---

#### `handleInitialNotificationForInAppMessages(remoteMessage)`

Pass the result of `messaging().getInitialNotification()` (or `null`) so IAM sync runs when the app was opened from a **quit** state by tapping a push.

**Returns:** `Promise<void>`

---

#### `registerFirebaseMessagingForInAppMessages(messaging, options?)`

Registers `onMessage`, `onNotificationOpenedApp`, and `getInitialNotification` for IAM sync. Pass **`messaging()`** (the return value of the default export).

Optional **`options.onForegroundMessage`**: invoked after IAM handling for every foreground message — use to show a local notification (e.g. Notifee) on Android when the app is open.

**Returns:** `() => void` — call the returned function to unsubscribe foreground/background-open listeners.

---

## Session Management

### How Sessions Work

The SDK uses **time-based sessions**:
- Session starts when SDK initializes or app comes to foreground
- Session expires after 30 minutes of inactivity (configurable)
- New session starts automatically when app comes to foreground after timeout

### Session Lifecycle

1. **Session Start**: Automatically when SDK initializes or app comes to foreground
2. **Activity Update**: Every time an event is tracked
3. **Session End**: On app background or after timeout

---

## Anonymous User Tracking

### How Anonymous Tracking Works

1. **First Launch**: SDK generates an `anonymousId` and stores it in AsyncStorage
2. **Anonymous Tracking**: All events, screens, and sessions are tracked with `anonymousId`
3. **Identification**: When `identify()` is called, all anonymous data is automatically merged
4. **Data Persistence**: Anonymous ID persists across app sessions until identification

### Example Flow

```javascript
// User opens app (anonymous)
// SDK generates anonymousId and tracks app.opened, screens, events

// Later, user logs in
await tappd.identify('user_123', {
  email: 'john@example.com',
  name: 'John Doe'
});

// All previous anonymous data is now associated with user_123
```

---

## Screen View Tracking

### Automatic Tracking

Screen views can be tracked automatically when integrated with React Navigation:

```javascript
import { NavigationContainer } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';

function MyScreen() {
  useFocusEffect(
    React.useCallback(() => {
      tappd.trackScreen('MyScreen');
    }, [])
  );
  
  return <View>...</View>;
}
```

### Manual Tracking

```javascript
// Track screen manually
await tappd.trackScreen('ProductDetailScreen', {
  productId: 'prod_123'
});
```

---

## App Lifecycle Tracking

The SDK automatically tracks app lifecycle events:

- **`app.opened`** - When app is opened (first launch or after background)
- **`app.foreground`** - When app comes to foreground
- **`app.background`** - When app goes to background
- **`app.closed`** - When app is closed (via cleanup method)

These events are tracked automatically if `autoTrack: true` (default).

---

## Deep Link Tracking

The SDK automatically tracks deep links:

```javascript
// If app is opened via: myapp://product/123?utm_source=email&utm_campaign=summer
// SDK automatically tracks:
{
  eventName: 'deep_link.opened',
  url: 'myapp://product/123?utm_source=email&utm_campaign=summer',
  path: '/product/123',
  utm: {
    source: 'email',
    campaign: 'summer'
  }
}
```

---

## Device Information

The SDK automatically collects device information:

```javascript
{
  platform: "ios" | "android",
  version: "17.0" | "13",
  // Additional device info available with react-native-device-info
}
```

**Note:** For comprehensive device info (device ID, model, brand, etc.), install `react-native-device-info` and extend the `getDeviceInfo()` method.

---

## Standard Events

We've pre-defined standard event names for common use cases:

### App Events

| Event Name | Description | Properties |
|------------|-------------|------------|
| `app.opened` | App was opened | isFirstLaunch |
| `app.foreground` | App came to foreground | - |
| `app.background` | App went to background | - |
| `app.closed` | App was closed | sessionDuration |

### Screen Events

| Event Name | Description | Properties |
|------------|-------------|------------|
| `screen.viewed` | User viewed a screen | screenName, duration |

### Ecommerce Events

| Event Name | Description | Required Properties |
|------------|-------------|---------------------|
| `ecommerce.product_viewed` | User viewed a product | productId |
| `ecommerce.add_to_cart` | User added to cart | productId |
| `ecommerce.remove_from_cart` | User removed from cart | productId |
| `ecommerce.checkout_started` | User started checkout | - |
| `ecommerce.checkout_step_completed` | User completed checkout step | step |
| `ecommerce.purchase` | User completed purchase | orderId, total, currency |

### User Events

| Event Name | Description | Properties |
|------------|-------------|------------|
| `user.signup` | User signed up | method, source |
| `user.login` | User logged in | method |
| `user.logout` | User logged out | - |

---

## React Navigation Integration

### Example with React Navigation

```javascript
import { NavigationContainer } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import TappdSDK from '@tappd/react-native-sdk';

// Initialize SDK
const tappd = new TappdSDK({
  appId: 'YOUR_APP_ID',
  enableAutoScreenTracking: true
});

// In your screen component
function HomeScreen() {
  useFocusEffect(
    React.useCallback(() => {
      // Track screen when it comes into focus
      tappd.trackScreen('HomeScreen');
    }, [])
  );
  
  return <View>...</View>;
}
```

---

## Examples

### Example 1: E-commerce Purchase

```javascript
// Track product viewed
await tappd.track('ecommerce.product_viewed', {
  productId: 'prod_123',
  productName: 'iPhone 15',
  price: 999,
  category: 'Electronics'
});

// Track add to cart
await tappd.track('ecommerce.add_to_cart', {
  productId: 'prod_123',
  quantity: 1,
  price: 999,
  currency: 'USD'
});

// Track purchase
await tappd.track('ecommerce.purchase', {
  orderId: 'order_456',
  total: 999,
  currency: 'USD',
  items: [{ productId: 'prod_123', name: 'iPhone 15', price: 999, quantity: 1 }]
});
```

### Example 2: User Journey

```javascript
// User opens app (anonymous)
// SDK automatically tracks app.opened

// User signs up
await tappd.identify('user_123', {
  email: 'john@example.com',
  name: 'John Doe'
});

// All previous anonymous data is now linked to user_123

// Track signup event
await tappd.track('user.signup', {
  source: 'onboarding',
  plan: 'free'
});

// User upgrades
await tappd.track('upgrade', {
  from: 'free',
  to: 'pro',
  amount: 99
});

// Update user attributes
await tappd.setUserAttributes({
  plan: 'pro',
  upgradedAt: new Date()
});
```

---

## Debugging

Enable debug logging to see SDK activity:

```javascript
const tappd = new TappdSDK({
  appId: 'YOUR_APP_ID',
  debug: true // Enable debug logging
});

// Check console for SDK logs
// [Tappd SDK] Initialized with App ID: a1b2c3d4...
// [Tappd SDK] Customer identified: user_123
// [Tappd SDK] Event tracked: button_click
```

---

## API Endpoints

The SDK uses these API endpoints on `https://sdk.tappd.io/api/v1/sdk` (automatically configured):

```
POST /identify                    # Identify user
POST /track                       # Track event
POST /screen                      # Track screen view
POST /session/start               # Start session
POST /session/heartbeat           # Session heartbeat
GET  /in-app-messages             # Get pending messages
POST /in-app-messages/:id/delivered  # Mark message delivered
POST /in-app-messages/:id/dismiss    # Dismiss message
GET  /banners                     # Get eligible banners
POST /banners/:id/display          # Track banner display
POST /banners/:id/click           # Track banner click
POST /banners/:id/dismiss         # Track banner dismiss
```

For detailed endpoint documentation, see [API_ENDPOINTS.md](../API_ENDPOINTS.md)

---

## Data Privacy

- All data is sent securely via HTTPS
- Anonymous IDs are stored in AsyncStorage
- Session IDs are stored in memory (cleared when app closes)
- No sensitive data is stored in the SDK
- Comply with GDPR, CCPA, and other privacy regulations

---

## Troubleshooting

### SDK not tracking events

1. Check App ID is correct
2. Enable debug mode: `debug: true`
3. Check console for errors
4. Verify API endpoint is accessible

### Anonymous data not merging

1. Ensure `identify()` is called with the same `userId`
2. Check that `anonymousId` is passed during identification
3. Verify anonymous tracking happened before identification

### Session not starting

1. Check console for errors
2. Verify session initialization completed
3. Look for network errors

---

---

## In-App Messages

The SDK supports IAM from the dashboard (including row/form/input blocks and multi-page messages). Pending messages are fetched on each poll (the SDK does not skip the network just because cached messages exist), so **test IAM typically appears within the polling interval** for an identified user.

### Configuration

```javascript
const tappd = new TappdSDK({
  appId: 'YOUR_APP_ID',
  enableInAppMessages: true, // Enable in-app message rendering (default: true)
  autoDisplayMessages: true, // Automatically display pending messages (default: true)
  messagePollingInterval: 60, // Seconds between polls when active (default: 60)
  minMessagePollingIntervalSeconds: 15, // Minimum poll interval (default: 15)
  messageFetchDedupeMs: 2000, // Dedupe rapid repeat fetches (default: 2000; 0 = always fetch)
  inactivityThreshold: 300, // Stop polling after 300 seconds (5 minutes) of inactivity (default: 300)
});
```

Use `await tappd.syncInAppMessages()` for a forced refresh. Use `tappd.processInAppButtonInteraction(...)` and `tappd.submitInAppForm(...)` from your `MessageRenderer` handlers for button actions and form submit.

### Smart Polling Strategy

1. **Fetch after init** - Pending messages load when the SDK is ready and auto-display is on
2. **Poll when active** - Default interval 60s (minimum 15s) in foreground
3. **Stop when inactive / backgrounded** - Per `inactivityThreshold` and AppState
4. **Dedupe window** - Prevents burst duplicate GETs; new IAM still arrive on the next poll

**Activity Detection:**
- Tracks user interactions: screen views, events, app state changes
- Uses AppState API to detect when app is foregrounded/backgrounded
- Automatically stops polling when app is backgrounded or user is inactive

### React Native Integration

To render messages in your React Native app, you need to set up a render callback:

```tsx
import TappdSDK, {
  MessageRenderer,
  type InAppMessage,
} from '@tappd/react-native-sdk';

const tappd = new TappdSDK({
  appId: 'YOUR_APP_ID',
  enableInAppMessages: true,
  autoDisplayMessages: true
});

function App() {
  const [currentMessage, setCurrentMessage] = useState<InAppMessage | null>(null);

  useEffect(() => {
    // Set callback for rendering messages
    tappd.setMessageRenderCallback((message: InAppMessage) => {
      setCurrentMessage(message);
    });
  }, []);

  const handleDismiss = async (messageId: string) => {
    await tappd.dismissMessage(messageId);
    setCurrentMessage(null);
  };

  const handleButtonClick = async (messageId: string, link: string, text: string) => {
    // Handle button click (e.g., navigation)
    console.log('Button clicked:', link);
    await handleDismiss(messageId);
  };

  return (
    <View>
      {/* Your app content */}
      
      {/* Render in-app message */}
      {currentMessage && (
        <MessageRenderer
          message={currentMessage}
          onDismiss={handleDismiss}
          onButtonClick={handleButtonClick}
        />
      )}
    </View>
  );
}
```

### Automatic Display

When `autoDisplayMessages` is enabled, the SDK will:
1. **Fetch on launch** - Immediately fetch messages when SDK initializes
2. **Load from cache** - Display cached messages instantly (if available)
3. **Poll when active** - Update messages every 5 minutes (configurable) when app is in foreground and user is active
4. **Stop when inactive** - Stop polling after 5 minutes (configurable) of inactivity
5. **Stop when backgrounded** - Stop polling immediately when app goes to background
6. **Resume on foreground** - Fetch immediately when app comes to foreground
7. Evaluate trigger conditions
8. Call the render callback for messages that are ready to be shown
9. Track message views and interactions

### Manual Control

```javascript
// Fetch pending messages
const messages = await tappd.getInAppMessages();

// Display a specific message
await tappd.displayInAppMessage(message);

// Display all pending messages
await tappd.displayPendingMessages();

// Dismiss a message
await tappd.dismissMessage(messageId);
```

### Message Types

The SDK supports three message types:

1. **Banner** - Fixed position at top or bottom of screen (uses absolute positioning)
2. **Popup** - Centered modal with overlay (smaller size)
3. **Modal** - Centered modal with overlay (larger size)

### Message Blocks

Messages can contain multiple blocks:
- **Image** - Display images with alignment options
- **Text** - Text content with styling (font size, weight, color, alignment)
- **Button** - Clickable buttons with links and custom styling
- **HTML** - Custom HTML rendered in a `WebView`, so authored `<script>` and `<style>`/CSS execute exactly like the web dashboard preview (requires the `react-native-webview` peer dependency)

### Event Tracking

The SDK automatically tracks message events:
- `message.viewed` - When a message is displayed
- `message.clicked` - When a button in the message is clicked
- `message.dismissed` - When a message is dismissed

### Example

See `examples/in-app-messages.tsx` for a complete example.

---

## License

MIT

---

## Support

For issues and questions:
- GitHub Issues: https://github.com/gotappd/tappd-react-native-mobile-sdk/issues
- Documentation: https://docs.tappd.io/mobile-sdk/introduction
- Email: support@tappd.io
