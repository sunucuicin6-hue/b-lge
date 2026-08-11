// ChatScreen.tsx — Bir sohbetin mesaj balonları + alt yazma çubuğu.
// Metin mesajı MessageService, fotoğraf/ses mesajı MediaMessageService üzerinden
// (İnternet/Bluetooth farkı UI'a sızmadan, NetworkRouter'ın seçtiği kanaldan) gönderilir.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { launchImageLibrary } from 'react-native-image-picker';
import DocumentPicker from 'react-native-document-picker';
import { toByteArray } from 'base64-js';
import RNFS from 'react-native-fs';
import { useApp } from '../context/AppContext';
import { ChatMessage } from '../data/models';

const DELIVERY_ICON: Record<ChatMessage['deliveryState'], string> = {
  sending: '🕓',
  sent: '✓',
  delivered: '✓✓',
  failed: '⚠️',
};

export default function ChatScreen({ route, navigation }: any) {
  const { threadId, title, isGroup } = route.params;
  const { services, currentUser } = useApp();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    navigation.setOptions({ title });
  }, [navigation, title]);

  const loadMessages = useCallback(async () => {
    if (!services) return;
    const list = await services.messageService.listMessages(threadId, 200);
    setMessages(list);
  }, [services, threadId]);

  useFocusEffect(
    useCallback(() => {
      loadMessages();
    }, [loadMessages])
  );

  useEffect(() => {
    if (!services) return;
    services.messageService.onMessage((msg) => {
      if (msg.threadId === threadId) loadMessages();
    });
    services.mediaService.onMessage((msg) => {
      if (msg.threadId === threadId) loadMessages();
    });
  }, [services, threadId, loadMessages]);

  async function handleSendText() {
    if (!services || !draft.trim()) return;
    const text = draft.trim();
    setDraft('');
    setSending(true);
    try {
      await services.messageService.sendText(threadId, text, !!isGroup);
      await loadMessages();
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } finally {
      setSending(false);
    }
  }

  function handleAttach() {
    Alert.alert('Ekle', 'Ne göndermek istersin?', [
      { text: 'Fotoğraf', onPress: handlePickPhoto },
      { text: 'Ses dosyası', onPress: handlePickAudio },
      { text: 'Vazgeç', style: 'cancel' },
    ]);
  }

  async function handlePickPhoto() {
    const result = await launchImageLibrary({ mediaType: 'photo', includeBase64: true, quality: 0.9 });
    if (result.didCancel || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (!asset.base64) {
      Alert.alert('Hata', 'Fotoğraf okunamadı, tekrar dene.');
      return;
    }
    const fileBytes = toByteArray(asset.base64);
    await sendPickedMedia(fileBytes, {
      mimeType: asset.type || 'image/jpeg',
      fileName: asset.fileName || `photo-${Date.now()}.jpg`,
      totalBytes: fileBytes.length,
      checksum: `${fileBytes.length}`, // basit yer tutucu; gerçek üretimde CRC32/SHA-1 kullanılmalı
    }, asset.uri);
  }

  async function handlePickAudio() {
    try {
      const result = await DocumentPicker.pick({ type: [DocumentPicker.types.audio], copyTo: 'cachesDirectory' });
      const file = result[0];
      const readPath = (file.fileCopyUri || file.uri).replace('file://', '');
      const base64 = await RNFS.readFile(readPath, 'base64');
      const fileBytes = toByteArray(base64);
      await sendPickedMedia(fileBytes, {
        mimeType: file.type || 'audio/mpeg',
        fileName: file.name || `audio-${Date.now()}.m4a`,
        totalBytes: fileBytes.length,
        checksum: `${fileBytes.length}`,
      }, file.fileCopyUri || file.uri);
    } catch (err: any) {
      if (DocumentPicker.isCancel?.(err)) return;
      Alert.alert('Hata', 'Ses dosyası okunamadı, tekrar dene.');
    }
  }

  async function sendPickedMedia(
    fileBytes: Uint8Array,
    meta: { mimeType: string; fileName: string; totalBytes: number; checksum: string },
    localPreviewPath?: string
  ) {
    if (!services) return;
    setSending(true);
    try {
      await services.mediaService.sendMedia({
        fileBytes,
        receiverId: threadId,
        isGroup: !!isGroup,
        meta,
        localPreviewPath,
      });
      await loadMessages();
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } catch {
      Alert.alert('Hata', 'Gönderilemedi, tekrar dene.');
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }) => {
          const mine = item.senderId === currentUser?.id;
          return (
            <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
              {item.contentType === 'image' && item.mediaLocalPath && (
                <Image source={{ uri: item.mediaLocalPath }} style={styles.image} resizeMode="cover" />
              )}
              {item.contentType === 'audio' && (
                <Text style={styles.bubbleText}>🎵 Ses mesajı</Text>
              )}
              {item.contentType === 'text' && <Text style={styles.bubbleText}>{item.text}</Text>}
              {item.contentType === 'sticker' && <Text style={styles.bubbleText}>🖼️ {item.stickerId}</Text>}
              {item.transferProgressPercent != null && item.transferProgressPercent < 100 && (
                <Text style={styles.progressText}>%{item.transferProgressPercent} gönderiliyor...</Text>
              )}
              <View style={styles.bubbleFooter}>
                <Text style={styles.bubbleTime}>
                  {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
                {mine && <Text style={styles.bubbleTick}>{DELIVERY_ICON[item.deliveryState]}</Text>}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Henüz mesaj yok. İlk mesajı sen gönder 👋</Text>
          </View>
        }
      />

      <View style={styles.inputBar}>
        <TouchableOpacity style={styles.attachButton} onPress={handleAttach} disabled={sending}>
          <Text style={styles.attachButtonText}>📎</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Mesaj yaz..."
          placeholderTextColor="#9aa"
          multiline
        />
        <TouchableOpacity style={styles.sendButton} onPress={handleSendText} disabled={sending || !draft.trim()}>
          <Text style={styles.sendButtonText}>➤</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b141a' },
  list: { padding: 12, flexGrow: 1 },
  bubble: { maxWidth: '80%', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8 },
  bubbleMine: { backgroundColor: '#005c4b', alignSelf: 'flex-end' },
  bubbleTheirs: { backgroundColor: '#1f2c34', alignSelf: 'flex-start' },
  bubbleText: { color: '#e9edef', fontSize: 15 },
  image: { width: 220, height: 220, borderRadius: 8, marginBottom: 4 },
  progressText: { color: '#8696a0', fontSize: 11, marginTop: 4 },
  bubbleFooter: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4, gap: 4 },
  bubbleTime: { color: '#8696a0', fontSize: 11 },
  bubbleTick: { color: '#8696a0', fontSize: 11 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 8,
    borderTopColor: '#1f2c34',
    borderTopWidth: 1,
    backgroundColor: '#0b141a',
  },
  attachButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  attachButtonText: { fontSize: 22 },
  input: {
    flex: 1,
    backgroundColor: '#1f2c34',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#e9edef',
    maxHeight: 120,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#25d366',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  sendButtonText: { color: '#0b141a', fontSize: 18, fontWeight: '700' },
  empty: { alignItems: 'center', marginTop: 60 },
  emptyText: { color: '#8696a0', fontSize: 13 },
});
