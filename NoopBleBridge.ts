// NoopBleBridge.ts — NativeBleBridge arayüzünün "hiçbir şey yapmayan" implementasyonu.
//
// Gerçek Bluetooth Mesh özelliği (BLE advertise/scan/GATT yazma) için gerçek bir
// native köprü gerekir — bu tipik olarak `react-native-ble-plx` (veya benzeri)
// paketiyle yazılır ve platforma özgü izinler (Android: BLUETOOTH_SCAN/CONNECT,
// konum izni; iOS: NSBluetoothAlwaysUsageDescription) gerektirir.
//
// UI ekranlarını (login/sohbet listesi/mesajlaşma) ve İnternet üzerinden
// çalışan akışı test edebilmek için, gerçek BLE donanım entegrasyonu
// tamamlanana kadar bu no-op köprü kullanılır: Bluetooth Mesh kanalı hep
// "kullanılamaz" görünür, router otomatik olarak sadece İnternet moduna geçer.
// Bu, mevcut mimariyi (NetworkRouter'ın kanal seçim mantığı) DEĞİŞTİRMEZ —
// sadece gerçek donanım köprüsü gelene kadar yerini tutar.

import { NativeBleBridge } from './BluetoothMeshTransport';

export class NoopBleBridge implements NativeBleBridge {
  async startAdvertising(): Promise<void> {
    // kasıtlı olarak boş — gerçek BLE entegrasyonu eklenene kadar
  }
  async stopAdvertising(): Promise<void> {}
  async startScanning(): Promise<void> {}
  async stopScanning(): Promise<void> {}
  async connectAndWrite(): Promise<void> {}
  onCharacteristicWrite(): void {}
  getConnectedNeighborIds(): string[] {
    return [];
  }
}
