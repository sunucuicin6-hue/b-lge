// RealBleBridge.ts — NativeBleBridge arayüzünün GERÇEK donanım implementasyonu (Android).
//
// Rol dağılımı:
//   - Peripheral (advertise + GATT server + gelen yazmaları dinleme) -> native Kotlin
//     modülü `BleGattServer` (bkz. android-native/ble-gatt-server/).
//   - Central (tarama + bağlanma + karşı tarafa yazma) -> react-native-ble-plx (JS).
//
// react-native-ble-plx SADECE Central rolünü destekler; Peripheral (advertise+GATT
// server) rolü yoktur — bu yüzden o kısım native koda delege edilir.

import { NativeModules, NativeEventEmitter, Platform, PermissionsAndroid } from 'react-native';
import { BleManager, Device } from 'react-native-ble-plx';
import { NativeBleBridge } from './BluetoothMeshTransport';

const { BleGattServer } = NativeModules;

async function ensureAndroidPermissions(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const apiLevel = Platform.Version as number;

  const permissions: string[] = [];
  if (apiLevel >= 31) {
    // Android 12+ (API 31+): ayrı BLE izinleri
    permissions.push(
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
    );
  } else {
    // Android 11 ve altı: BLE taraması için konum izni zorunlu
    permissions.push(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
  }

  const results = await PermissionsAndroid.requestMultiple(permissions as any);
  const allGranted = Object.values(results).every((r) => r === PermissionsAndroid.RESULTS.GRANTED);
  if (!allGranted) {
    throw new Error('Bluetooth izinleri verilmedi — Bluetooth Mesh çalışmayacak');
  }
}

export class RealBleBridge implements NativeBleBridge {
  private centralManager = new BleManager();
  private eventEmitter = BleGattServer ? new NativeEventEmitter(BleGattServer) : null;
  private connectedDevices = new Map<string, Device>();
  private characteristicUuid = '';
  private writeHandler: ((base64Data: string) => void) | null = null;

  async startAdvertising(serviceUuid: string): Promise<void> {
    await ensureAndroidPermissions();
    if (!BleGattServer) {
      throw new Error(
        'BleGattServer native modülü bulunamadı. android-native/ble-gatt-server/README.md ' +
          "içindeki kurulum adımlarını uyguladığından ve 'npx react-native run-android' ile " +
          'yeniden derlediğinden emin ol.'
      );
    }
    this.characteristicUuid = serviceUuid.replace(/0000$/, '0001'); // MESH_CHARACTERISTIC_UUID ile eşleşir
    if (this.eventEmitter && this.writeHandler) {
      this.eventEmitter.addListener('BleGattServerWrite', this.writeHandler);
    }
    await BleGattServer.startAdvertising(serviceUuid, this.characteristicUuid);
  }

  async stopAdvertising(): Promise<void> {
    if (BleGattServer) await BleGattServer.stopAdvertising();
  }

  async startScanning(serviceUuid: string, onDeviceFound: (deviceId: string) => void): Promise<void> {
    await ensureAndroidPermissions();
    this.centralManager.startDeviceScan([serviceUuid], { allowDuplicates: false }, async (error, device) => {
      if (error || !device) return;
      if (this.connectedDevices.has(device.id)) return;

      try {
        const connected = await device.connect();
        await connected.discoverAllServicesAndCharacteristics();
        this.connectedDevices.set(device.id, connected);
        onDeviceFound(device.id);

        connected.onDisconnected(() => {
          this.connectedDevices.delete(device.id);
        });
      } catch {
        // Bağlantı başarısız oldu (menzil dışına çıktı vb.) — sessizce geç, bir sonraki
        // tarama turunda tekrar denenecek.
      }
    });
  }

  async stopScanning(): Promise<void> {
    this.centralManager.stopDeviceScan();
  }

  async connectAndWrite(deviceId: string, characteristicUuid: string, base64Data: string): Promise<void> {
    const device = this.connectedDevices.get(deviceId);
    if (!device) throw new Error(`Bilinmeyen/bağlı olmayan cihaz: ${deviceId}`);

    const services = await device.services();
    for (const service of services) {
      const characteristics = await service.characteristics();
      const target = characteristics.find((c) => c.uuid.toLowerCase() === characteristicUuid.toLowerCase());
      if (target) {
        // ble-plx write metodu değeri doğrudan base64 string olarak kabul eder.
        await device.writeCharacteristicWithoutResponseForService(service.uuid, target.uuid, base64Data);
        return;
      }
    }
    throw new Error('Hedef karakteristik bulunamadı');
  }

  onCharacteristicWrite(handler: (base64Data: string) => void): void {
    this.writeHandler = handler;
    if (this.eventEmitter) {
      this.eventEmitter.addListener('BleGattServerWrite', handler);
    }
  }

  getConnectedNeighborIds(): string[] {
    return [...this.connectedDevices.keys()];
  }
}
