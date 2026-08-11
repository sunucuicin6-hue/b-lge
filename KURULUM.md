# WhatsMesh Mobile — Kurulum

## 1. Boş React Native projesi oluştur

```
npx react-native@0.75.4 init WhatsMesh
cd WhatsMesh
```

## 2. Bu `mobile/src` klasörünü kopyala

Bu zipteki `mobile/src` klasörünün TÜM içeriğini, az önce oluşturduğun
`WhatsMesh` projesinin köküne (yani `WhatsMesh/src/`) kopyala.

Kendi projenin kökündeki `App.tsx` dosyasını SİL, yerine `src/App.tsx`'i
kullanacağız — kök `index.js` dosyasını şöyle güncelle:

```js
import { AppRegistry } from 'react-native';
import App from './src/App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
```

## 3. Bağımlılıkları kur

```
npm install
```

(Bu depodaki `package.json` gerekli tüm paketleri — socket.io-client,
react-navigation, async-storage, netinfo, ble-plx, fs — zaten listeliyor.)

iOS için ayrıca:
```
cd ios && pod install && cd ..
```

### Android izinleri (fotoğraf/ses seçme + Bluetooth Mesh için)

`android/app/src/main/AndroidManifest.xml` içine (uygulama Android 13+
hedefliyorsa) şunları ekle:

```xml
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
<uses-permission android:name="android.permission.READ_MEDIA_AUDIO" />
<!-- Android 12 ve altı için: -->
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />

<!-- Bluetooth Mesh için (detaylı adımlar: android-native/ble-gatt-server/README.md) -->
<uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" android:usesPermissionFlags="neverForLocation" />
<uses-permission android:name="android.permission.BLUETOOTH_ADVERTISE" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
```

### Bluetooth Mesh — native modül kurulumu (ZORUNLU, atlanabilir)

Gerçek Bluetooth BLE mesh için ayrıca bir native Android modülü kurman gerekiyor
(react-native-ble-plx bunu tek başına yapamıyor). Adım adım kılavuz:
**`android-native/ble-gatt-server/README.md`**

Bu adımları atlarsan uygulama ÇÖKMEZ — otomatik olarak sadece aşağıdaki Wi-Fi
kanalını kullanır.

### Wi-Fi/Hotspot yerel ağ kanalı (native kurulum gerektirmez)

`LocalNetworkTransport.ts`, internet olmadan da (bir telefon Hotspot açsın, diğeri
bağlansın, ya da ikisi aynı Wi-Fi ağında olsun) çalışan alternatif bir kanaldır —
sadece `npm install` ile gelen JS kütüphaneleriyle (react-native-udp,
react-native-tcp-socket) çalışır, ekstra native kurulum GEREKMEZ.

**Nasıl test edilir:**
1. Telefon A'da Hotspot'u aç.
2. Telefon B, bu Hotspot'a bağlansın.
3. Her iki telefonda da uygulamayı aç, ikisinin de interneti YOK ama aynı yerel
   ağdalar. Sohbet listesinde üst kısımdaki rozet "🔵 Bluetooth Mesh" yazacak
   (Wi-Fi kanalı da aynı rozeti kullanıyor, bkz. aşağıdaki not) — mesaj gönder,
   karşı tarafa ulaşmalı.

## 4. Android çalıştır

```
npx react-native run-android
```

## 5. Şu an ÇALIŞAN özellikler

- Kullanıcı adıyla giriş/kayıt (parolasız)
- Render sunucusundan (`https://b-lge-1.onrender.com`) kullanıcı arama
- Arkadaşlık isteği gönderme/kabul etme (internet üzerinden)
- Sohbet listesi + metin mesajlaşma (internet üzerinden, Render relay ile)
- Mesaj durumu (gönderiliyor/gönderildi/iletildi/başarısız)
- Uygulama kapatılıp açıldığında veriler kaybolmaz (AsyncStorage ile kalıcı depolama)
- **Grup kurma** — arkadaş listesinden çoklu seçim yaparak grup açma, grup sohbeti
- **Fotoğraf gönderme** — galeriden seçilen fotoğraf chunk'lanıp gönderilir, karşı tarafta görüntülenir
- **Ses dosyası gönderme** — cihazdaki bir ses dosyası seçilip gönderilir (canlı kayıt DEĞİL, var olan dosya seçimi)
- **Gerçek Bluetooth BLE mesh** (native modül kurulduysa, bkz. yukarısı) — iki telefon
  birbirinin BLE menzilinde ise internetsiz mesajlaşabilir
- **Wi-Fi/Hotspot yerel ağ mesajlaşması** — native kurulum gerektirmeden, aynı yerel
  ağdaki iki telefon internetsiz mesajlaşabilir (BLE'den daha güvenilir bir alternatif)

## 6. Şu an ÇALIŞMAYAN / eksik özellikler

- **Bluetooth Mesh gerçek cihazda test edilmedi** — kod standart Android BLE
  API'lerini doğru kullanıyor ama ben (Claude) fiziksel BLE donanımı olan bir
  ortamda test edemedim. İki gerçek Android telefonla senin test etmen gerekiyor;
  bir hata çıkarsa loglarıyla birlikte söyle, düzeltelim.
- **iOS'ta Bluetooth Peripheral rolü yok** — native modül sadece Android için
  yazıldı. iOS'ta eşdeğer bir Swift (`CBPeripheralManager`) modülü gerekir.
- **Kanal rozeti Wi-Fi ile BLE'yi ayırt etmiyor** — `CompositeMeshTransport` ikisini
  tek bir "Bluetooth Mesh" kanalı gibi gösteriyor (basitlik için); hangisinin gerçekte
  kullanıldığını UI'da ayrı göstermek istersen ek bir küçük değişiklik gerekir.
- **Canlı ses kaydı** — şu an sadece cihazda var olan bir ses dosyasını
  seçip gönderebiliyorsun; mikrofonla kayıt (WhatsApp'taki basılı tut,
  konuş, bırak akışı) için `react-native-audio-recorder-player` gibi
  ek bir kütüphane entegre edilmeli.
- **Ses/görsel oynatma kontrolleri** — gelen ses mesajı şu an sadece
  "🎵 Ses mesajı" olarak görünüyor, oynatma butonu yok. Fotoğraflar
  görüntüleniyor ama tam ekran açma/zoom yok.
- **Sticker seçici UI'ı** — `StickerService.ts` hazır ama emoji/sticker
  seçme paneli henüz yok.
- **Gerçek E2E şifreleme** — `publicKey` alanı şu an sahte (placeholder)
  bir string; gerçek bir anahtar çifti üretimi/şifreleme henüz yok. Bluetooth
  Mesh ve Wi-Fi kanallarında da mesajlar DÜZ METİN gidiyor.
- **Medya bütünlük kontrolü (checksum)** — şu an sadece dosya boyutu
  placeholder olarak kullanılıyor; gerçek CRC32/SHA-1 hesaplanmıyor.

Bunlardan hangisini önce istersen onu ekleyelim.
