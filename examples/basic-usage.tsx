/**
 * Example: Basic Tappd Mobile SDK Usage
 * 
 * This example shows how to integrate Tappd SDK in a React Native app
 */

import React, { useEffect } from 'react';
import { View, Button, Text } from 'react-native';
import TappdSDK from '@tappd/react-native-sdk';
import { useFocusEffect } from '@react-navigation/native';

// Initialize SDK (do this once, typically in App.tsx or a config file)
const tappd = new TappdSDK({
  appId: 'YOUR_APP_ID',
  apiUrl: 'https://sdk.gotappd.com/api/v1/sdk',
  autoTrack: true,
  sessionTimeout: 30,
  enableAutoScreenTracking: true,
  debug: true // Enable in development
});

// Example: Home Screen with screen tracking
export function HomeScreen() {
  // Track screen when it comes into focus
  useFocusEffect(
    React.useCallback(() => {
      tappd.trackScreen('HomeScreen');
    }, [])
  );

  const handleButtonClick = async () => {
    // Track button click
    await tappd.track('app.interaction.button_click', {
      buttonId: 'get_started',
      location: 'home_screen'
    });
  };

  return (
    <View>
      <Text>Home Screen</Text>
      <Button title="Get Started" onPress={handleButtonClick} />
    </View>
  );
}

// Example: Login Screen
export function LoginScreen() {
  useFocusEffect(
    React.useCallback(() => {
      tappd.trackScreen('LoginScreen');
    }, [])
  );

  const handleLogin = async (email: string, password: string) => {
    try {
      // Your login logic here
      const userId = 'user_123'; // Get from your auth system
      
      // Identify user after login
      await tappd.identify(userId, {
        email: email,
        name: 'John Doe' // Get from your user data
      });

      // Track login event
      await tappd.track('user.login', {
        method: 'email'
      });
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  return (
    <View>
      <Text>Login Screen</Text>
      {/* Your login form */}
    </View>
  );
}

// Example: Product Detail Screen
export function ProductDetailScreen({ productId }: { productId: string }) {
  useFocusEffect(
    React.useCallback(() => {
      tappd.trackScreen('ProductDetailScreen', {
        productId: productId
      });

      // Track product viewed
      tappd.track('ecommerce.product_viewed', {
        productId: productId,
        productName: 'iPhone 15',
        price: 999,
        category: 'Electronics'
      });
    }, [productId])
  );

  const handleAddToCart = async () => {
    await tappd.track('ecommerce.add_to_cart', {
      productId: productId,
      quantity: 1,
      price: 999,
      currency: 'USD'
    });
  };

  return (
    <View>
      <Text>Product Detail</Text>
      <Button title="Add to Cart" onPress={handleAddToCart} />
    </View>
  );
}

// Example: App.tsx - Initialize and cleanup
export function App() {
  useEffect(() => {
    // SDK is already initialized above
    
    // Cleanup on app unmount
    return () => {
      tappd.cleanup();
    };
  }, []);

  return (
    // Your app navigation
    <View>
      <Text>App</Text>
    </View>
  );
}

