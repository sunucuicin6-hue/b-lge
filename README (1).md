# Gerçek Bluetooth BLE Mesh — Native Modül Kurulumu (Android)

`react-native-ble-plx` sadece **Central** rolünü (tarama + bağlanma + yazma) destekler.
BLE mesh'te her cihazın aynı anda **Peripheral** (kendini duyurma + gelen bağlantı/yazma
isteklerini kabul etme, yani bir "GATT sunucusu" olma) rolünde de olması gerekir — bu
rolü react-native-ble-plx YAPAMAZ. Bu klasördeki Kotlin dosyaları o eksik rolü
tamamlayan native bir Android modülüdür.

**Bunu native koda hiç dokunmadan da atlayabilirsin** — bu modül kurulmazsa uygulama
otomatik olarak sadece Wi-Fi/Hotspot kanalını (`LocalNetworkTransport`) kullanır, hiçbir
şey çökmez (bkz. `AppContext.tsx` içindeki `buildMeshTransport` fallback mantığı).

## Adımlar

1. `npx react-native@0.75.4 init WhatsMesh` ile boş proje oluşturduysan, paket adın
   varsayılan olarak `com.whatsmesh` OLMAYABİLİR (genelde `com.anonymous.whatsmesh` gibi
   bir şey olur). Gerçek paket adını şurada gör:
   `android/app/src/main/java/<PAKET_YOLU>/MainApplication.kt`

2. Bu klasördeki iki dosyayı (`BleGattServerModule.kt`, `BleGattServerPackage.kt`)
   projenin şu yoluna kopyala (klasörü kendin oluştur):
   ```
   android/app/src/main/java/<SENİN_PAKET_YOLUN>/ble/
   ```
   Dosyaların en üstündeki `package com.whatsmesh.ble` satırını kendi paket yoluna göre
   değiştir (örn. `package com.anonymous.whatsmesh.ble`).

3. `MainApplication.kt` içinde paket listesine ekle:
   ```kotlin
   import com.anonymous.whatsmesh.ble.BleGattServerPackage // <- kendi paket yoluna göre değiştir

   override fun getPackages(): List<ReactPackage> =
       PackageList(this).packages.apply {
           add(BleGattServerPackage())
       }
   ```

4. `android/app/src/main/AndroidManifest.xml` içine şu izinleri ekle (`<application>`
   etiketinden ÖNCE, `<manifest>` içine):
   ```xml
   <uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />
   <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />
   <uses-permission android:name="android.permission.BLUETOOTH_SCAN" android:usesPermissionFlags="neverForLocation" />
   <uses-permission android:name="android.permission.BLUETOOTH_ADVERTISE" />
   <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
   <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
   <uses-feature android:name="android.hardware.bluetooth_le" android:required="true" />
   ```

5. Projeyi yeniden derle: `npx react-native run-android` (JS tarafı `RealBleBridge.ts`
   artık `NativeModules.BleGattServer`'ı bulacak).

## Test etmeden önce bil

- **BLE emülatörde ÇALIŞMAZ.** İki GERÇEK Android telefon gerekiyor.
- İki telefonda da Bluetooth AÇIK ve konum servisleri açık olmalı (Android 11 ve altı
  BLE taraması için konum iznini şart koşuyor — bu Android'in kendi kısıtlaması, bizim
  kodumuzla ilgisi yok).
- Uygulama ilk açılışta izin isteyecek (`ensureAndroidPermissions` — `RealBleBridge.ts`
  içinde), izin verilmezse Bluetooth Mesh kanalı sessizce devre dışı kalır (Wi-Fi kanalı
  yine çalışmaya devam eder).
- Ben (Claude) bu native kodu gerçek bir Android cihazda test EDEMEDİM — bu ortamda
  fiziksel BLE donanımı yok. Kod standart Android BLE API'lerini (BluetoothGattServer,
  BluetoothLeAdvertiser) doğru şekilde kullanıyor ama derleme/çalışma zamanı hatası
  çıkarsa (özellikle Gradle/Kotlin sürüm uyumsuzlukları) bana hata mesajını yapıştır,
  birlikte düzeltiriz.

## iOS

Bu modül SADECE Android için yazıldı (konuşmamızda hep Android/APK üzerinden gittiğimiz
için önceliklendirdim). iOS'ta Peripheral rolü için eşdeğer bir Swift modülü
(`CBPeripheralManager` kullanarak) yazılması gerekir — istersen onu da ayrıca ekleyelim.
