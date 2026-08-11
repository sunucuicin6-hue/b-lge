# WhatsMesh — Hibrit (İnternet + Bluetooth Mesh) Mesajlaşma Uygulaması

WhatsApp benzeri, **internet varken buluttaki Render/Relay sunucusu**, internet yokken **Bluetooth Mesh (TTL flooding)**
üzerinden çalışan; internetli cihazların internetsiz cihazlar için otomatik **Proxy Gateway** görevi gördüğü bir
mesajlaşma sistemi.

## 1. Klasör Yapısı

```
whatsmesh/
├── backend/                     # Render'a deploy edilecek Relay/Signaling sunucusu
│   └── src/
│       ├── server.js            # Express + Socket.IO relay
│       ├── db.js                # SQLite veri katmanı (users, friends, groups, messages)
│       └── schema.sql           # Veritabanı şeması
└── mobile/                      # React Native (TypeScript) istemci
    └── src/
        ├── types/packet.ts      # Ortak paket formatı (İnternet + Bluetooth için AYNI şema)
        ├── network/
        │   ├── NetworkRouter.ts         # Kanal seçimi + kesintisiz geçiş (İnternet <-> BT Mesh)
        │   ├── InternetTransport.ts     # Socket.IO ile Render sunucusuna bağlanan taşıyıcı
        │   ├── BluetoothMeshTransport.ts# BLE tarama/yayın + TTL flood mesh
        │   └── GatewayBridge.ts         # İnternetli cihazın "İnternet Köprüsü" görevi
        ├── media/
        │   └── ChunkManager.ts   # Fotoğraf/ses dosyalarını chunk'lama + birleştirme + progress
        ├── data/
        │   ├── models.ts         # User, Friend, Group, Message veri modelleri
        │   └── localStore.ts     # Cihaz içi kalıcı depolama (WatermelonDB/SQLite arayüzü)
        └── services/
            ├── FriendService.ts  # Arkadaşlık isteği/onay (online + offline)
            ├── GroupService.ts   # Grup oluşturma, üye yönetimi, grup mesaj fan-out
            └── StickerService.ts # Sticker ID mantığı

```

## 2. Genel Akış (Multi-Bearer Routing)

```
                        ┌─────────────────────────┐
                        │      NetworkRouter       │  <-- uygulamanın TEK giriş noktası
                        │  (mode: INTERNET | MESH) │
                        └────────────┬─────────────┘
             internet var             │            internet yok / zayıf
        ┌────────────────────────────┘            └───────────────────────────┐
        ▼                                                                     ▼
┌───────────────────┐                                              ┌────────────────────────┐
│ InternetTransport  │ --(Socket.IO)-->  Render Relay Sunucusu      │ BluetoothMeshTransport  │
│  (WebSocket)       │ <----------------  (backend/)                │ (BLE scan/advertise)    │
└───────────────────┘                                              └────────────────────────┘
                                                                                │
                                                            TTL flood ile komşulara sıçrar,
                                                            içlerinden biri internete çıkarsa
                                                            GatewayBridge devreye girer ve
                                                            paketi Relay sunucusuna da iletir.
```

Her iki taşıyıcı da **aynı `MeshPacket` şemasını** kullanır; böylece bir mesaj yolculuğunun ortasında
İnternet ⇄ Bluetooth arasında geçiş yapsa bile alıcı tarafta hiçbir fark oluşmaz (`packetType`,
`messageId`, `chunkIndex/totalChunks` alanları taşıyıcıdan bağımsızdır).

## 3. Neden bu mimari?

- **Router mantığı taşıyıcılardan bağımsız**: `NetworkRouter`, `ITransport` arayüzünü uygulayan
  herhangi bir taşıyıcıyla çalışır. Yarın bir "LoRa" veya "Wi-Fi Direct" taşıyıcısı eklemek
  sadece yeni bir sınıf yazmak demektir.
- **TTL flood + seen-cache**: Bluetooth mesh'te sonsuz döngüyü önlemek için her cihaz gördüğü
  `messageId`'leri kısa süreli bir LRU cache'te tutar, TTL 0'a inince paket düşürülür.
- **Chunking BLE MTU'suna göre**: BLE karakteristik yazma sınırı (genelde 20-512 byte) nedeniyle
  chunk boyutu yapılandırılabilir tutulmuştur (varsayılan 500 byte, Base64 overhead'i dahil).
- **Backend "relay", "orkestratör" değil**: Sunucu mesaj içeriğini yorumlamaz, sadece
  `receiverId`/`groupId`'ye göre bağlı soketlere iletir ve offline kullanıcılar için mesajı
  kuyruğa alır (push/pending). Bu da uçtan uca şifreleme ile uyumlu kalmasını sağlar.

Devamı için her modüldeki dosya başı yorumlarına bakınız.
