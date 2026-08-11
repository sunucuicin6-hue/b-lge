// AddFriendScreen.tsx — "@kullanici_adi" ile arkadaş arama/ekleme ve gelen
// istekleri onaylama ekranı.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useApp } from '../context/AppContext';
import { FriendRequest, UserProfile } from '../data/models';

export default function AddFriendScreen({ navigation }: any) {
  const { services, currentUser } = useApp();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadIncoming = useCallback(async () => {
    if (!services || !currentUser) return;
    const list = await services.store.listIncomingFriendRequests(currentUser.id);
    setIncoming(list);
  }, [services, currentUser]);

  useFocusEffect(
    useCallback(() => {
      loadIncoming();
    }, [loadIncoming])
  );

  async function handleSearch() {
    if (!services || query.trim().length < 2) return;
    setSearching(true);
    setError(null);
    try {
      const users = await services.friendService.searchUsersOnline(query.trim());
      setResults(users);
    } catch {
      setError('Arama başarısız (internet bağlantını kontrol et)');
    } finally {
      setSearching(false);
    }
  }

  async function handleAdd(user: UserProfile) {
    if (!services) return;
    try {
      await services.friendService.sendFriendRequestOnline(user.username);
      setSentTo((prev) => new Set(prev).add(user.id));
    } catch {
      setError('İstek gönderilemedi');
    }
  }

  async function handleAccept(request: FriendRequest) {
    if (!services) return;
    await services.friendService.acceptFriendRequest(request);
    await loadIncoming();
    navigation.goBack();
  }

  async function handleReject(request: FriendRequest) {
    if (!services) return;
    await services.friendService.rejectFriendRequest(request.id);
    await loadIncoming();
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Arkadaş ekle</Text>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Kullanıcı adı ara..."
          placeholderTextColor="#9aa"
          autoCapitalize="none"
          onSubmitEditing={handleSearch}
        />
        <TouchableOpacity style={styles.searchButton} onPress={handleSearch}>
          {searching ? <ActivityIndicator color="#0b141a" /> : <Text style={styles.searchButtonText}>Ara</Text>}
        </TouchableOpacity>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        style={{ marginTop: 12 }}
        renderItem={({ item }) => (
          <View style={styles.resultRow}>
            <Text style={styles.resultName}>@{item.username}</Text>
            <TouchableOpacity
              style={[styles.addButton, sentTo.has(item.id) && styles.addButtonDisabled]}
              onPress={() => handleAdd(item)}
              disabled={sentTo.has(item.id)}
            >
              <Text style={styles.addButtonText}>{sentTo.has(item.id) ? 'İstek gönderildi' : 'Ekle'}</Text>
            </TouchableOpacity>
          </View>
        )}
      />

      {incoming.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Gelen istekler</Text>
          <FlatList
            data={incoming}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.resultRow}>
                <Text style={styles.resultName}>{item.fromUserId}</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity style={styles.addButton} onPress={() => handleAccept(item)}>
                    <Text style={styles.addButtonText}>Kabul et</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.rejectButton} onPress={() => handleReject(item)}>
                    <Text style={styles.rejectButtonText}>Reddet</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b141a', paddingTop: 50, paddingHorizontal: 16 },
  title: { color: '#e9edef', fontSize: 22, fontWeight: '700', marginBottom: 16 },
  searchRow: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, backgroundColor: '#1f2c34', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: '#e9edef' },
  searchButton: { backgroundColor: '#25d366', borderRadius: 10, paddingHorizontal: 18, justifyContent: 'center' },
  searchButtonText: { color: '#0b141a', fontWeight: '700' },
  error: { color: '#ff6b6b', marginTop: 10, fontSize: 13 },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomColor: '#1f2c34',
    borderBottomWidth: 1,
  },
  resultName: { color: '#e9edef', fontSize: 15 },
  addButton: { backgroundColor: '#25d366', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  addButtonDisabled: { backgroundColor: '#2a3942' },
  addButtonText: { color: '#0b141a', fontWeight: '700', fontSize: 13 },
  rejectButton: { backgroundColor: '#2a3942', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  rejectButtonText: { color: '#e9edef', fontWeight: '600', fontSize: 13 },
  sectionTitle: { color: '#8696a0', fontSize: 13, marginTop: 20, marginBottom: 4 },
});
