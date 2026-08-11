// AppContext.tsx — Uygulamanın kimlik doğrulama durumunu ve bootstrapWhatsMesh
// tarafından üretilen servisleri tüm ekranlara dağıtan React Context.

import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import RNFS from 'react-native-fs';
import { fromByteArray } from 'base64-js';
import { bootstrapWhatsMesh, WhatsMeshServices } from '../App.bootstrap';
import { ITransport } from '../network/ITransport';
import { NoopBleBridge } from '../network/NoopBleBridge';
import { BluetoothMeshTransport } from '../network/BluetoothMeshTransport';
import { RealBleBridge } from '../network/ble/RealBleBridge';
import { LocalNetworkTransport } from '../network/LocalNetworkTransport';
import { CompositeMeshTransport } from '../network/CompositeMeshTransport';
import { AsyncLocalStore } from '../data/asyncLocalStore';
import { UserProfile } from '../data/models';
import { loadSession, saveSession, clearSession, generateId, generatePlaceholderPublicKey } from '../data/session';
import { MediaMeta } from '../media/ChunkManager';

const RELAY_API_BASE = process.env.RELAY_API_BASE || 'https://b-lge-1.onrender.com';

interface AppContextValue {
  loading: boolean;
  currentUser: UserProfile | null;
  services: WhatsMeshServices | null;
  networkMode: 'internet' | 'bluetooth' | 'offline';
  register: (username: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

// Birleştirilen medya baytlarını cihazın belge klasörüne yazar ve `file://` yolunu döndürür.
// Gelen dosya adı meta'dan alınır; yoksa messageId kullanılır.
async function writeMergedFileToDisk(messageId: string, fileBytes: Uint8Array, meta?: MediaMeta): Promise<string> {
  const fileName = meta?.fileName || messageId;
  const path = `${RNFS.DocumentDirectoryPath}/${messageId}-${fileName}`;
  await RNFS.writeFile(path, fromByteArray(fileBytes), 'base64');
  return `file://${path}`;
}

/**
 * Kullanılabilir tüm "offline" (internetsiz) kanalları tek bir CompositeMeshTransport'ta
 * birleştirir: gerçek Bluetooth BLE mesh (native modül kuruluysa) + Wi-Fi/Hotspot yerel ağ.
 * Native BLE modülü henüz kurulmadıysa (android-native/ble-gatt-server/README.md adımları
 * yapılmadıysa) o kanal sessizce devre dışı kalır, Wi-Fi kanalı yine çalışır.
 */
function buildMeshTransport(profile: UserProfile): ITransport {
  const channels: ITransport[] = [];

  try {
    channels.push(new BluetoothMeshTransport(new RealBleBridge(), profile.id));
  } catch (err) {
    console.warn('[WhatsMesh] Gerçek BLE bridge kurulamadı, Bluetooth Mesh kanalı devre dışı:', err);
    channels.push(new BluetoothMeshTransport(new NoopBleBridge(), profile.id));
  }

  try {
    channels.push(new LocalNetworkTransport(profile.id, profile.username));
  } catch (err) {
    console.warn('[WhatsMesh] Yerel ağ (Wi-Fi) kanalı kurulamadı:', err);
  }

  return new CompositeMeshTransport(channels);
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [services, setServices] = useState<WhatsMeshServices | null>(null);
  const [networkMode, setNetworkMode] = useState<'internet' | 'bluetooth' | 'offline'>('offline');
  const bootstrapping = useRef(false);

  async function startServicesFor(profile: UserProfile) {
    if (bootstrapping.current) return;
    bootstrapping.current = true;
    const store = new AsyncLocalStore();
    const mesh = buildMeshTransport(profile);
    const svc = await bootstrapWhatsMesh(profile, mesh, writeMergedFileToDisk, store);
    svc.router.onModeChange((mode) => setNetworkMode(mode));
    setNetworkMode(svc.router.getMode());
    setServices(svc);
    bootstrapping.current = false;
  }

  useEffect(() => {
    (async () => {
      const existing = await loadSession();
      if (existing) {
        setCurrentUser(existing);
        await startServicesFor(existing);
      }
      setLoading(false);
    })();
  }, []);

  async function register(username: string, displayName?: string) {
    const clean = username.trim().replace(/^@/, '');
    if (!clean) throw new Error('Kullanıcı adı boş olamaz');

    const profile: UserProfile = {
      id: generateId(),
      username: clean,
      displayName: displayName?.trim() || clean,
      publicKey: generatePlaceholderPublicKey(),
    };

    // Sunucuya kaydol (internet varsa). İnternet yoksa da devam edilir —
    // kullanıcı yalnızca Bluetooth mesh üzerinden görünür/kullanılabilir olur,
    // internet geldiğinde tekrar denenmelidir.
    try {
      const res = await fetch(`${RELAY_API_BASE}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Sunucuya kayıt başarısız');
      }
    } catch (err) {
      // İnternet yoksa veya sunucu geçici olarak kapalıysa yine de yerel
      // olarak devam ederiz; kullanıcı adı çakışması gibi gerçek hataları
      // (409) yeniden fırlatıyoruz ki kullanıcı farklı bir ad seçsin.
      if (err instanceof Error && err.message.includes('kullanımda')) throw err;
    }

    await saveSession(profile);
    setCurrentUser(profile);
    await startServicesFor(profile);
  }

  async function logout() {
    await services?.router.stop();
    await clearSession();
    setServices(null);
    setCurrentUser(null);
    setNetworkMode('offline');
  }

  return (
    <AppContext.Provider value={{ loading, currentUser, services, networkMode, register, logout }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp, AppProvider içinde kullanılmalıdır');
  return ctx;
}
