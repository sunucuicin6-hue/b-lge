// CreateGroupScreen.tsx — Arkadaş listesinden çoklu seçim yaparak yeni grup kurma.

import React, { useCallback, useState } from 'react';
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
import { UserProfile } from '../data/models';

export default function CreateGroupScreen({ navigation }: any) {
  const { services } = useApp();
  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupName, setGroupName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFriends = useCallback(async () => {
    if (!services) return;
    const list = await services.friendService.listFriends();
    setFriends(list);
  }, [services]);

  useFocusEffect(
    useCallback(() => {
      loadFriends();
    }, [loadFriends])
  );

  function toggle(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function handleCreate() {
    if (!services) return;
    if (groupName.trim().length < 2) {
      setError('Grup adı en az 2 karakter olmalı');
      return;
    }
    if (selected.size === 0) {
      setError('En az bir arkadaş seç');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const group = await services.groupService.createGroup(groupName.trim(), [...selected]);

      // GroupService grubu oluşturur ama sohbet listesinde görünmesi için bir
      // ChatThread kaydı açmak gerekiyor — burada elle ekliyoruz.
      await services.store.upsertThread({
        id: group.id,
        kind: 'group',
        title: group.name,
        unreadCount: 0,
      });

      navigation.replace('Chat', { threadId: group.id, title: group.name, isGroup: true });
    } catch {
      setError('Grup oluşturulamadı, tekrar dene');
    } finally {
      setCreating(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Yeni grup</Text>

      <TextInput
        style={styles.input}
        value={groupName}
        onChangeText={setGroupName}
        placeholder="Grup adı"
        placeholderTextColor="#9aa"
      />

      <Text style={styles.sectionTitle}>Üye seç ({selected.size} seçili)</Text>

      <FlatList
        data={friends}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.emptyText}>Henüz arkadaşın yok. Önce arkadaş ekle.</Text>}
        renderItem={({ item }) => {
          const isSelected = selected.has(item.id);
          return (
            <TouchableOpacity style={styles.friendRow} onPress={() => toggle(item.id)}>
              <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                {isSelected && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.friendName}>{item.displayName || item.username}</Text>
            </TouchableOpacity>
          );
        }}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity style={[styles.button, creating && styles.buttonDisabled]} onPress={handleCreate} disabled={creating}>
        {creating ? <ActivityIndicator color="#0b141a" /> : <Text style={styles.buttonText}>Grubu oluştur</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b141a', paddingTop: 50, paddingHorizontal: 16 },
  title: { color: '#e9edef', fontSize: 22, fontWeight: '700', marginBottom: 16 },
  input: { backgroundColor: '#1f2c34', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: '#e9edef', marginBottom: 16 },
  sectionTitle: { color: '#8696a0', fontSize: 13, marginBottom: 8 },
  friendRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomColor: '#1f2c34', borderBottomWidth: 1 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#8696a0', marginRight: 12, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: '#25d366', borderColor: '#25d366' },
  checkmark: { color: '#0b141a', fontWeight: '700', fontSize: 13 },
  friendName: { color: '#e9edef', fontSize: 15 },
  emptyText: { color: '#8696a0', fontSize: 13, marginTop: 12 },
  error: { color: '#ff6b6b', marginTop: 10, fontSize: 13 },
  button: { backgroundColor: '#25d366', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginVertical: 16 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#0b141a', fontWeight: '700', fontSize: 16 },
});
