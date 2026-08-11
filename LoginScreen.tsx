// LoginScreen.tsx — Kullanıcı adı seçme / giriş ekranı.
// Parola YOKTUR (backend'de de yok). "@kullanici_adi" seçilir, cihazda saklanır.

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useApp } from '../context/AppContext';

export default function LoginScreen() {
  const { register } = useApp();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (username.trim().length < 3) {
      setError('Kullanıcı adı en az 3 karakter olmalı');
      return;
    }
    setSubmitting(true);
    try {
      await register(username, displayName);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir şeyler ters gitti');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.logo}>WhatsMesh</Text>
      <Text style={styles.subtitle}>İnternet yokken de mesajlaşın</Text>

      <View style={styles.form}>
        <Text style={styles.label}>Kullanıcı adı</Text>
        <View style={styles.usernameRow}>
          <Text style={styles.at}>@</Text>
          <TextInput
            style={styles.usernameInput}
            value={username}
            onChangeText={setUsername}
            placeholder="kullanici_adi"
            autoCapitalize="none"
            autoCorrect={false}
            placeholderTextColor="#9aa"
          />
        </View>

        <Text style={styles.label}>Görünen ad (opsiyonel)</Text>
        <TextInput
          style={styles.input}
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Görünen adınız"
          placeholderTextColor="#9aa"
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={[styles.button, submitting && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Devam et</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b141a', justifyContent: 'center', padding: 24 },
  logo: { fontSize: 34, fontWeight: '700', color: '#25d366', textAlign: 'center' },
  subtitle: { color: '#8696a0', textAlign: 'center', marginTop: 8, marginBottom: 40 },
  form: { backgroundColor: '#111b21', borderRadius: 16, padding: 20 },
  label: { color: '#8696a0', marginBottom: 6, marginTop: 12, fontSize: 13 },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1f2c34',
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  at: { color: '#8696a0', fontSize: 16 },
  usernameInput: { flex: 1, color: '#e9edef', fontSize: 16, paddingVertical: 12, paddingLeft: 4 },
  input: { backgroundColor: '#1f2c34', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, color: '#e9edef', fontSize: 16 },
  error: { color: '#ff6b6b', marginTop: 12, fontSize: 13 },
  button: { backgroundColor: '#25d366', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 24 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#0b141a', fontWeight: '700', fontSize: 16 },
});
