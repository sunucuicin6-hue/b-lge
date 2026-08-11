// ChatListScreen.tsx — Sohbet listesi (WhatsApp'ın ana ekranı gibi).
// Var olan thread'leri (son mesaja göre sıralı) gösterir; gelen bildirim
// paketleri (FriendService/MessageService) geldiğinde otomatik yenilenir.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useApp } from '../context/AppContext';
import { ChatThread } from '../data/models';

const MODE_LABEL: Record<string, string> = {
  internet: '🌐 İnternet',
  bluetooth: '🔵 Bluetooth Mesh',
  offline: '⚪ Bağlantı yok',
};

export default function ChatListScreen({ navigation }: any) {
  const { services, currentUser, networkMode, logout } = useApp();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadThreads = useCallback(async () => {
    if (!services) return;
    const list = await services.messageService.listThreads();
    setThreads(list.sort((a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0)));
  }, [services]);

  useFocusEffect(
    useCallback(() => {
      loadThreads();
    }, [loadThreads])
  );

  useEffect(() => {
    if (!services) return;
    services.messageService.onMessage(() => {
      loadThreads();
    });
    services.mediaService.onMessage(() => {
      loadThreads();
    });
  }, [services, loadThreads]);

  async function onRefresh() {
    setRefreshing(true);
    await loadThreads();
    setRefreshing(false);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>WhatsMesh</Text>
          <Text style={styles.badge}>{MODE_LABEL[networkMode]}</Text>
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacity style={styles.iconButton} onPress={() => navigation.navigate('CreateGroup')}>
            <Text style={styles.iconText}>👥</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton} onPress={() => navigation.navigate('AddFriend')}>
            <Text style={styles.iconText}>➕</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton} onPress={logout}>
            <Text style={styles.iconText}>🚪</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={threads}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#25d366" />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Henüz sohbetin yok.</Text>
            <Text style={styles.emptySubtext}>Sağ üstten arkadaş ekleyerek başla.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => navigation.navigate('Chat', { threadId: item.id, title: item.title, isGroup: item.kind === 'group' })}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.title.slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>{item.title}</Text>
              <Text style={styles.rowPreview} numberOfLines={1}>
                {item.lastMessagePreview ?? 'Henüz mesaj yok'}
              </Text>
            </View>
            {item.unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{item.unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b141a' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
  },
  title: { color: '#e9edef', fontSize: 24, fontWeight: '700' },
  badge: { color: '#8696a0', fontSize: 12, marginTop: 4 },
  headerButtons: { flexDirection: 'row', gap: 8 },
  iconButton: { padding: 8, marginLeft: 4 },
  iconText: { fontSize: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomColor: '#1f2c34',
    borderBottomWidth: 1,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#25d366',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: { color: '#0b141a', fontWeight: '700', fontSize: 18 },
  rowBody: { flex: 1 },
  rowTitle: { color: '#e9edef', fontSize: 16, fontWeight: '600' },
  rowPreview: { color: '#8696a0', fontSize: 13, marginTop: 2 },
  unreadBadge: { backgroundColor: '#25d366', borderRadius: 12, minWidth: 24, height: 24, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  unreadText: { color: '#0b141a', fontWeight: '700', fontSize: 12 },
  empty: { alignItems: 'center', marginTop: 80, paddingHorizontal: 24 },
  emptyText: { color: '#e9edef', fontSize: 16, fontWeight: '600' },
  emptySubtext: { color: '#8696a0', fontSize: 13, marginTop: 6, textAlign: 'center' },
});
