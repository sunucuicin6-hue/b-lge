// RootNavigator.tsx — Ekranlar arası geçiş (React Navigation Stack).
// Giriş yapılmamışsa LoginScreen, yapılmışsa ChatList/AddFriend/Chat akışı gösterilir.

import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useApp } from '../context/AppContext';
import LoginScreen from '../screens/LoginScreen';
import ChatListScreen from '../screens/ChatListScreen';
import AddFriendScreen from '../screens/AddFriendScreen';
import ChatScreen from '../screens/ChatScreen';
import CreateGroupScreen from '../screens/CreateGroupScreen';

const Stack = createNativeStackNavigator();

const navTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: '#0b141a', card: '#0b141a', text: '#e9edef', border: '#1f2c34' },
};

export default function RootNavigator() {
  const { loading, currentUser } = useApp();

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#25d366" size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator>
        {!currentUser ? (
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        ) : (
          <>
            <Stack.Screen name="ChatList" component={ChatListScreen} options={{ headerShown: false }} />
            <Stack.Screen name="AddFriend" component={AddFriendScreen} options={{ headerShown: false }} />
            <Stack.Screen
              name="CreateGroup"
              component={CreateGroupScreen}
              options={{ headerStyle: { backgroundColor: '#111b21' }, headerTintColor: '#e9edef', title: '' }}
            />
            <Stack.Screen
              name="Chat"
              component={ChatScreen}
              options={{ headerStyle: { backgroundColor: '#111b21' }, headerTintColor: '#e9edef' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b141a' },
});
