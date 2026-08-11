// App.tsx — Uygulamanın React giriş noktası.
// react-native init ile oluşturduğun projenin kök App.tsx dosyasının içeriğini
// TAMAMEN bununla değiştir (ya da bu dosyayı import edip render et).

import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from './context/AppContext';
import RootNavigator from './navigation/RootNavigator';

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor="#0b141a" />
      <AppProvider>
        <RootNavigator />
      </AppProvider>
    </SafeAreaProvider>
  );
}
