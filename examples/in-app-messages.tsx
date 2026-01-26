/**
 * Example: In-App Messages with Tappd Mobile SDK
 * 
 * This example shows how to integrate in-app message rendering in a React Native app
 */

import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import TappdSDK from '@tappd/react-native-sdk';
import { MessageRenderer } from '@tappd/react-native-sdk/src/renderers/MessageRenderer';
import type { InAppMessage } from '@tappd/react-native-sdk/src/types/inAppMessage';

// Initialize SDK with in-app messages enabled
const tappd = new TappdSDK({
  appId: 'YOUR_APP_ID',
  apiUrl: 'https://sdk.gotappd.com/api/v1/sdk',
  autoTrack: true,
  sessionTimeout: 30,
  enableAutoScreenTracking: true,
  debug: true,
  enableInAppMessages: true, // Enable in-app messages
  autoDisplayMessages: true, // Automatically display messages
  messagePollingInterval: 30, // Poll every 30 seconds
});

// Example: App Component with In-App Message Rendering
export function AppWithInAppMessages() {
  const [currentMessage, setCurrentMessage] = useState<InAppMessage | null>(null);

  useEffect(() => {
    // Set callback for rendering messages
    tappd.setMessageRenderCallback((message: InAppMessage) => {
      setCurrentMessage(message);
    });

    // Optionally fetch messages manually
    // tappd.displayPendingMessages();

    return () => {
      // Cleanup
      tappd.setMessageRenderCallback(() => {});
    };
  }, []);

  const handleDismiss = async (messageId: string) => {
    await tappd.dismissMessage(messageId);
    setCurrentMessage(null);
  };

  const handleButtonClick = async (messageId: string, link: string, text: string) => {
    // Track button click (handled by SDK)
    // You can also handle navigation here
    console.log('Button clicked:', { messageId, link, text });
    
    // Dismiss message after button click
    await handleDismiss(messageId);
  };

  return (
    <View style={styles.container}>
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

// Example: Login Screen with Message Display
export function LoginScreen() {
  const [currentMessage, setCurrentMessage] = useState<InAppMessage | null>(null);

  useEffect(() => {
    tappd.setMessageRenderCallback((message: InAppMessage) => {
      setCurrentMessage(message);
    });
  }, []);

  const handleLogin = async (email: string, password: string) => {
    try {
      // Your login logic here
      const userId = 'user_123'; // Get from your auth system
      
      // Identify user after login
      await tappd.identify({
        external_id: userId,
        email: email,
        name: 'John Doe' // Get from your user data
      });

      // Track login event
      await tappd.track('user.login', {
        method: 'email'
      });

      // Messages will be automatically fetched and displayed
      // Or fetch manually:
      // await tappd.displayPendingMessages();
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  const handleDismiss = async (messageId: string) => {
    await tappd.dismissMessage(messageId);
    setCurrentMessage(null);
  };

  return (
    <View style={styles.container}>
      {/* Your login form */}
      
      {/* Render in-app message */}
      {currentMessage && (
        <MessageRenderer
          message={currentMessage}
          onDismiss={handleDismiss}
        />
      )}
    </View>
  );
}

// Example: Manual Message Fetching
export function ManualMessageExample() {
  const [messages, setMessages] = useState<InAppMessage[]>([]);
  const [currentMessage, setCurrentMessage] = useState<InAppMessage | null>(null);

  const fetchMessages = async () => {
    try {
      const fetchedMessages = await tappd.getInAppMessages();
      setMessages(fetchedMessages);
      console.log('Fetched messages:', fetchedMessages);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const displayMessage = async (message: InAppMessage) => {
    try {
      await tappd.displayInAppMessage(message);
      setCurrentMessage(message);
    } catch (error) {
      console.error('Error displaying message:', error);
    }
  };

  const handleDismiss = async (messageId: string) => {
    await tappd.dismissMessage(messageId);
    setCurrentMessage(null);
  };

  return (
    <View style={styles.container}>
      {/* Button to fetch messages */}
      {/* <Button title="Fetch Messages" onPress={fetchMessages} /> */}
      
      {/* Display fetched messages */}
      {messages.map((message) => (
        <View key={message._id}>
          {/* <Button 
            title={`Display: ${message.config.messageType}`}
            onPress={() => displayMessage(message)}
          /> */}
        </View>
      ))}

      {/* Render current message */}
      {currentMessage && (
        <MessageRenderer
          message={currentMessage}
          onDismiss={handleDismiss}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

