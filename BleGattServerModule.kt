package com.whatsmesh.ble

// BleGattServerModule.kt — WhatsMesh'in Bluetooth "Peripheral" (yayıncı + GATT sunucusu)
// rolünü üstlenen native Android modülü.
//
// NEDEN GEREKLİ: react-native-ble-plx SADECE "Central" rolünü (tarama + bağlanma + yazma)
// destekler; "Peripheral" rolünü (kendini duyurma + gelen bağlantı/yazma isteklerini kabul
// etme) DESTEKLEMEZ. BLE mesh'te her cihazın aynı anda hem Central hem Peripheral olması
// gerektiği için (yoksa iki cihaz asla birbirine "yazamaz"), bu rolü platforma özgü native
// kodla (bu dosya) implemente ediyoruz. Central rolü hâlâ JS tarafında react-native-ble-plx
// ile yapılıyor (bkz. mobile/src/network/ble/RealBleBridge.ts).
//
// KURULUM: Bu dosyayı ve BleGattServerPackage.kt'yi, `npx react-native init` ile
// oluşturduğun projenin `android/app/src/main/java/com/whatsmesh/ble/` klasörüne kopyala
// (paket adın farklıysa klasör yolunu ve `package` satırını ona göre değiştir), sonra
// MainApplication.kt içinde `BleGattServerPackage()`'ı paket listesine ekle.
// Ayrıntılı adımlar: android-native/ble-gatt-server/README.md

import android.bluetooth.*
import android.bluetooth.le.*
import android.content.Context
import android.os.ParcelUuid
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.UUID

class BleGattServerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val bluetoothManager: BluetoothManager by lazy {
        reactApplicationContext.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
    }
    private var gattServer: BluetoothGattServer? = null
    private var advertiser: BluetoothLeAdvertiser? = null
    private var advertiseCallback: AdvertiseCallback? = null

    override fun getName() = "BleGattServer"

    private fun emit(eventName: String, data: Any?) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, data)
    }

    /**
     * GATT sunucusunu açar (bir yazılabilir karakteristik ile), sonra bu servisi
     * BLE reklamı (advertise) olarak yayınlamaya başlar. Diğer WhatsMesh cihazları
     * bizi tararken bu serviceUuid'yi görüp bize bağlanabilir.
     */
    @ReactMethod
    fun startAdvertising(serviceUuidStr: String, characteristicUuidStr: String, promise: Promise) {
        try {
            val serviceUuid = UUID.fromString(serviceUuidStr)
            val charUuid = UUID.fromString(characteristicUuidStr)
            val adapter = bluetoothManager.adapter
                ?: return promise.reject("NO_ADAPTER", "Bu cihazda Bluetooth adaptörü yok")

            if (!adapter.isEnabled) {
                return promise.reject("BT_DISABLED", "Bluetooth kapalı, önce kullanıcıdan açmasını iste")
            }

            openGattServer(serviceUuid, charUuid)
            startBleAdvertise(adapter, serviceUuid)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ADVERTISE_ERROR", e.message, e)
        }
    }

    private fun openGattServer(serviceUuid: UUID, charUuid: UUID) {
        val callback = object : BluetoothGattServerCallback() {
            override fun onCharacteristicWriteRequest(
                device: BluetoothDevice?,
                requestId: Int,
                characteristic: BluetoothGattCharacteristic?,
                preparedWrite: Boolean,
                responseNeeded: Boolean,
                offset: Int,
                value: ByteArray?
            ) {
                if (characteristic?.uuid == charUuid && value != null) {
                    // Gelen ham baytları base64'e çevirip JS tarafına yolla — JS zaten
                    // base64 bekliyor (bkz. ChunkManager.ts / BluetoothMeshTransport.ts).
                    val base64 = android.util.Base64.encodeToString(value, android.util.Base64.NO_WRAP)
                    emit("BleGattServerWrite", base64)
                }
                if (responseNeeded) {
                    gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, value)
                }
            }

            override fun onConnectionStateChange(device: BluetoothDevice?, status: Int, newState: Int) {
                // İstenirse burada bağlı cihaz sayısı takip edilip JS'e event olarak
                // yollanabilir. Şu an Central rolü (react-native-ble-plx) kendi
                // bağlantılarını ayrıca takip ettiği için burada ek işlem YAPILMIYOR.
            }
        }

        gattServer = bluetoothManager.openGattServer(reactApplicationContext, callback)
        val service = BluetoothGattService(serviceUuid, BluetoothGattService.SERVICE_TYPE_PRIMARY)
        val characteristic = BluetoothGattCharacteristic(
            charUuid,
            BluetoothGattCharacteristic.PROPERTY_WRITE or BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE,
            BluetoothGattCharacteristic.PERMISSION_WRITE
        )
        service.addCharacteristic(characteristic)
        gattServer?.addService(service)
    }

    private fun startBleAdvertise(adapter: BluetoothAdapter, serviceUuid: UUID) {
        advertiser = adapter.bluetoothLeAdvertiser
            ?: throw IllegalStateException("Bu cihaz BLE advertising (peripheral rolü) desteklemiyor")

        val settings = AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
            .setConnectable(true)
            .build()

        val data = AdvertiseData.Builder()
            .setIncludeDeviceName(false) // isim yerine sadece service UUID yeterli, paket boyutunu küçük tutar
            .addServiceUuid(ParcelUuid(serviceUuid))
            .build()

        advertiseCallback = object : AdvertiseCallback() {
            override fun onStartFailure(errorCode: Int) {
                emit("BleGattServerError", "Advertise başlatılamadı, kod: $errorCode")
            }
        }
        advertiser?.startAdvertising(settings, data, advertiseCallback)
    }

    @ReactMethod
    fun stopAdvertising(promise: Promise) {
        try {
            advertiseCallback?.let { advertiser?.stopAdvertising(it) }
            gattServer?.close()
            gattServer = null
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STOP_ERROR", e.message, e)
        }
    }

    // React Native NativeEventEmitter'ın Android'de zorunlu tuttuğu no-op metodlar.
    @ReactMethod
    fun addListener(eventName: String) {}
    @ReactMethod
    fun removeListeners(count: Int) {}
}
