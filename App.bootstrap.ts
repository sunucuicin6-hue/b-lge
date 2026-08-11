// App.bootstrap.ts — Tüm modüllerin birbirine bağlandığı kompozisyon kökü.
// React Native giriş dosyanızda (App.tsx / index.js) bu fonksiyonu bir kez çağırıp
// dönen servisleri bir Context/Provider ile ekrana dağıtmanız yeterlidir.

import { NetworkRouter } from './network/NetworkRouter';
import { InternetTransport } from './network/InternetTransport';
import { ITransport } from './network/ITransport';
import { InMemoryLocalStore, LocalStore } from './data/localStore';
import { FriendService } from './services/FriendService';
import { GroupService } from './services/GroupService';
import { StickerService } from './services/StickerService';
import { MediaMessageService } from './services/MediaMessageService';
import { MessageService } from './services/MessageService';
import { UserProfile } from './data/models';
import { MediaMeta } from './media/ChunkManager';

export interface WhatsMeshServices {
  router: NetworkRouter;
  friendService: FriendService;
  groupService: GroupService;
  stickerService: StickerService;
  mediaService: MediaMessageService;
  messageService: MessageService;
  store: LocalStore;
}

/**
 * @param currentUser        Giriş yapmış kullanıcının profili
 * @param mesh                İnternetsiz kanal(lar). Genelde CompositeMeshTransport
 *                            (RealBleBridge + LocalNetworkTransport birleşimi) verilir;
 *                            hiçbiri kurulmadıysa NoopBleBridge tabanlı BluetoothMeshTransport
 *                            verilebilir (mesh her zaman "kullanılamaz" görünür).
 * @param writeMergedFileToDisk  Birleştirilen medya baytlarını dosya sistemine yazıp yerel dosya yolunu döndüren fonksiyon (RNFS ile)
 * @param store               Kalıcı depolama implementasyonu. Verilmezse InMemoryLocalStore kullanılır
 *                            (SADECE test/geliştirme için — uygulama kapanınca veri kaybolur).
 *                            Gerçek uygulamada AsyncLocalStore (bkz. data/asyncLocalStore.ts) verilmelidir.
 */
export async function bootstrapWhatsMesh(
  currentUser: UserProfile,
  mesh: ITransport,
  writeMergedFileToDisk: (messageId: string, fileBytes: Uint8Array, meta?: MediaMeta) => Promise<string>,
  store: LocalStore = new InMemoryLocalStore()
): Promise<WhatsMeshServices> {
  await store.saveProfile(currentUser);

  const internet = new InternetTransport(currentUser.id);
  const router = new NetworkRouter(currentUser.id, internet, mesh);

  await router.start();

  router.onModeChange((mode) => {
    // UI'da "İnternet üzerinden" / "Bluetooth Mesh üzerinden" rozetini güncellemek için kullanılabilir.
    console.log(`[WhatsMesh] Aktif kanal değişti -> ${mode}`);
  });

  const friendService = new FriendService(currentUser, router, store);
  const groupService = new GroupService(currentUser, router, store);
  const stickerService = new StickerService(currentUser.id, router);
  const mediaService = new MediaMessageService(currentUser.id, router, store, writeMergedFileToDisk);
  const messageService = new MessageService(currentUser, router, store);

  return { router, friendService, groupService, stickerService, mediaService, messageService, store };
}
