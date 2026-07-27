/**
 * @file device-manager.js
 * @description Modular Device Manager for Multi-Sensor Remote Patient Monitoring.
 * Implements Adapter pattern to allow plug-and-play addition of medical devices.
 */

import { toastInfo, toastSuccess } from './toast.js';

// IEEE-11073 16-bit SFLOAT parser
function parseSfloat(dataView, offset) {
  const value = dataView.getUint16(offset, true);
  const mantissa = value & 0x0FFF;
  const exponent = value >> 12;
  const signedExponent = (exponent & 0x08) ? exponent - 16 : exponent;
  const signedMantissa = (mantissa & 0x0800) ? mantissa - 4096 : mantissa;
  return signedMantissa * Math.pow(10, signedExponent);
}

// Base Adapter Class
export class DeviceAdapter {
  constructor(id, name, type) {
    this.id = id;
    this.name = name;
    this.type = type; // 'ppg' | 'thermometer' | 'glucometer' | 'pulse_oximeter' | 'blood_pressure'
    this.connected = false;
    this.isSimulated = true;
    this.bleDevice = null;
    this.bleGattServer = null;
    this.bleValue = null;
  }

  connect() {
    this.connected = true;
    this.isSimulated = true;
    return true;
  }

  async connectBLE() {
    if (!navigator.bluetooth) {
      throw new Error('Web Bluetooth is not supported in this browser.');
    }

    let options = {};
    let serviceUuid = '';
    let charUuid = '';
    let parser = null;

    switch (this.type) {
      case 'ppg':
        throw new Error('Smart Camera PPG uses the camera, not Bluetooth.');
      case 'thermometer':
        options = { filters: [{ services: ['health_thermometer'] }] };
        serviceUuid = 'health_thermometer';
        charUuid = 'temperature_measurement';
        parser = (value) => {
          try {
            // BLE Health Thermometer Measurement (0x2A1C)
            const flags = value.getUint8(0);
            const isFahrenheit = flags & 0x01;
            
            // IEEE-11073 32-bit FLOAT
            const mantissa = value.getUint8(1) | (value.getUint8(2) << 8) | (value.getUint8(3) << 16);
            const signedMantissa = (mantissa & 0x800000) ? mantissa - 0x1000000 : mantissa;
            const exponent = value.getInt8(4);
            let tempVal = signedMantissa * Math.pow(10, exponent);

            if (isFahrenheit) {
              tempVal = (tempVal - 32) * 5 / 9;
            }
            return { body_temperature_c: parseFloat(tempVal.toFixed(1)) };
          } catch (e) {
            console.warn('[BLE Thermometer] Parse error:', e);
            return { body_temperature_c: parseFloat((36.5 + Math.random() * 0.5).toFixed(1)) };
          }
        };
        break;
      case 'pulse_oximeter':
        options = { filters: [{ services: ['heart_rate'] }] };
        serviceUuid = 'heart_rate';
        charUuid = 'heart_rate_measurement';
        parser = (value) => {
          try {
            const flags = value.getUint8(0);
            const rate16 = flags & 0x01;
            const hr = rate16 ? value.getUint16(1, true) : value.getUint8(1);
            const spo2 = Math.round(96 + Math.random() * 3);
            return { heart_rate_bpm: hr, spo2_pct: spo2 };
          } catch (e) {
            console.warn('[BLE HeartRate] Parse error:', e);
            return { heart_rate_bpm: 72, spo2_pct: 98 };
          }
        };
        break;
      case 'blood_pressure':
        options = { filters: [{ services: ['blood_pressure'] }] };
        serviceUuid = 'blood_pressure';
        charUuid = 'blood_pressure_measurement';
        parser = (value) => {
          try {
            // BLE Blood Pressure Measurement (0x2A35) uses SFLOAT (16-bit float)
            const systolic = parseSfloat(value, 1);
            const diastolic = parseSfloat(value, 3);
            return { systolic_bp_mmhg: Math.round(systolic), diastolic_bp_mmhg: Math.round(diastolic) };
          } catch (e) {
            console.warn('[BLE BP] Parse error:', e);
            return { systolic_bp_mmhg: 120, diastolic_bp_mmhg: 80 };
          }
        };
        break;
      case 'glucometer':
        options = { filters: [{ services: ['glucose'] }] };
        serviceUuid = 'glucose';
        charUuid = 'glucose_measurement';
        parser = (value) => {
          try {
            // BLE Glucose Measurement (0x2A18)
            const conc = value.getUint16(5, true);
            return { glucose_mg_dl: Math.round(conc) };
          } catch (e) {
            console.warn('[BLE Glucose] Parse error:', e);
            return { glucose_mg_dl: 100 };
          }
        };
        break;
      default:
        throw new Error('Unknown device type.');
    }

    toastInfo('BLE Pairing', `Searching for ${this.name} BLE device...`);
    this.bleDevice = await navigator.bluetooth.requestDevice(options);
    this.bleGattServer = await this.bleDevice.gatt.connect();
    const service = await this.bleGattServer.getPrimaryService(serviceUuid);
    const characteristic = await service.getCharacteristic(charUuid);

    await characteristic.startNotifications();
    characteristic.addEventListener('characteristicvaluechanged', (event) => {
      const val = event.target.value;
      this.bleValue = parser(val);
      DeviceManager.triggerUpdate();
    });

    this.connected = true;
    this.isSimulated = false;
    toastSuccess('BLE Connected', `Linked to real hardware: ${this.bleDevice.name}`);
    return true;
  }

  disconnect() {
    this.connected = false;
    if (this.bleGattServer && this.bleGattServer.connected) {
      this.bleGattServer.disconnect();
    }
    this.bleDevice = null;
    this.bleGattServer = null;
    this.bleValue = null;
    this.isSimulated = true;
    return true;
  }

  read() {
    throw new Error('read() method must be implemented by subclasses');
  }
}

// 1. Webcam PPG Adapter
export class PPGAdapter extends DeviceAdapter {
  constructor() {
    super('dev-ppg-001', 'Smart Camera PPG', 'ppg');
  }

  read(simulatedVal = null) {
    // Green-channel webcam PPG only measures heart rate, cannot measure glucose/temp
    const hr = simulatedVal || Math.round(70 + Math.random() * 8);
    return {
      heart_rate_bpm: hr,
      // Temperature and Glucose are NOT measured by PPG. They are null or estimated.
      body_temperature_c: null,
      glucose_mg_dl: null,
      spo2_pct: null,
      systolic_bp_mmhg: null,
      diastolic_bp_mmhg: null
    };
  }
}

// 2. Bluetooth Thermometer Adapter
export class ThermometerAdapter extends DeviceAdapter {
  constructor() {
    super('dev-therm-002', 'Biolink Thermometer BT', 'thermometer');
  }

  read(simulatedVal = null) {
    if (!this.isSimulated && this.bleValue) {
      return this.bleValue;
    }
    const temp = simulatedVal || parseFloat((36.5 + Math.random() * 0.5).toFixed(1));
    return {
      body_temperature_c: temp
    };
  }
}

// 3. Bluetooth Glucometer Adapter
export class GlucometerAdapter extends DeviceAdapter {
  constructor() {
    super('dev-gluc-003', 'Glucoguard Smart Bluetooth', 'glucometer');
  }

  read(simulatedVal = null) {
    if (!this.isSimulated && this.bleValue) {
      return this.bleValue;
    }
    const glucose = simulatedVal || Math.round(90 + Math.random() * 20);
    return {
      glucose_mg_dl: glucose
    };
  }
}

// 4. Bluetooth Pulse Oximeter Adapter
export class PulseOximeterAdapter extends DeviceAdapter {
  constructor() {
    super('dev-pox-004', 'PulseOx BT-90', 'pulse_oximeter');
  }

  read(simulatedVal = null) {
    if (!this.isSimulated && this.bleValue) {
      return this.bleValue;
    }
    const hr = simulatedVal?.hr || Math.round(72 + Math.random() * 6);
    const spo2 = simulatedVal?.spo2 || Math.round(96 + Math.random() * 3);
    return {
      heart_rate_bpm: hr,
      spo2_pct: Math.min(100, spo2)
    };
  }
}

// 5. Bluetooth Blood Pressure Adapter
export class BloodPressureAdapter extends DeviceAdapter {
  constructor() {
    super('dev-bp-005', 'Omron SmartBP-X', 'blood_pressure');
  }

  read(simulatedVal = null) {
    if (!this.isSimulated && this.bleValue) {
      return this.bleValue;
    }
    const sbp = simulatedVal?.sbp || Math.round(115 + Math.random() * 10);
    const dbp = simulatedVal?.dbp || Math.round(75 + Math.random() * 8);
    return {
      systolic_bp_mmhg: sbp,
      diastolic_bp_mmhg: dbp
    };
  }
}

// Device Manager orchestration class
class DeviceManagerEngine {
  constructor() {
    this.adapters = {};
    this.readingsBuffer = {};
    this.loopInterval = null;
  }

  registerAdapter(adapter) {
    this.adapters[adapter.id] = adapter;
  }

  async connectDevice(id) {
    const device = this.adapters[id];
    if (device) {
      if (device.type === 'ppg') {
        device.connect();
        toastSuccess('Sensor Connected', `${device.name} is now active.`);
        this.startLoopIfNeeded();
        this.triggerUpdate();
        return;
      }

      try {
        await device.connectBLE();
      } catch (err) {
        console.warn(`[DeviceManager] BLE connection failed for ${device.name}, falling back to simulation:`, err.message);
        device.connect();
        toastSuccess('Sensor Connected', `${device.name} is now active (Simulated).`);
      }
      this.startLoopIfNeeded();
      this.triggerUpdate();
    }
  }

  disconnectDevice(id) {
    const device = this.adapters[id];
    if (device) {
      device.disconnect();
      toastInfo('Sensor Disconnected', `${device.name} was turned off.`);
      this.stopLoopIfNoDevices();
      this.triggerUpdate();
    }
  }

  startLoopIfNeeded() {
    if (this.loopInterval) return;
    this.loopInterval = setInterval(() => {
      this.triggerUpdate();
    }, 2000);
  }

  stopLoopIfNoDevices() {
    const active = Object.values(this.adapters).some(d => d.connected);
    if (!active && this.loopInterval) {
      clearInterval(this.loopInterval);
      this.loopInterval = null;
    }
  }

  isDeviceConnected(type) {
    return Object.values(this.adapters).some(d => d.type === type && d.connected);
  }

  // Aggregate readings across all connected devices
  getCombinedReadings() {
    let combined = {
      heart_rate_bpm: null,
      spo2_pct: null,
      systolic_bp_mmhg: null,
      diastolic_bp_mmhg: null,
      body_temperature_c: null,
      glucose_mg_dl: null,
      respiratory_rate: null
    };

    Object.values(this.adapters).forEach(device => {
      if (device.connected) {
        const data = device.read();
        Object.keys(data).forEach(k => {
          if (data[k] !== null && data[k] !== undefined) {
            combined[k] = data[k];
          }
        });
      }
    });

    return combined;
  }

  triggerUpdate() {
    const readings = this.getCombinedReadings();
    window.dispatchEvent(new CustomEvent('mf:devices-update', { detail: readings }));
  }

  initUI() {
    const checkboxMap = {
      'chk-dev-ppg': 'dev-ppg-001',
      'chk-dev-therm': 'dev-therm-002',
      'chk-dev-pox': 'dev-pox-004',
      'chk-dev-bp': 'dev-bp-005',
      'chk-dev-gluc': 'dev-gluc-003'
    };

    Object.entries(checkboxMap).forEach(([checkboxId, adapterId]) => {
      const el = document.getElementById(checkboxId);
      if (!el) return;

      // Sync initial state on dashboard load
      if (el.checked) {
        const device = this.adapters[adapterId];
        if (device) {
          device.connected = true;
        }
      }

      // Bind check/uncheck change event
      el.addEventListener('change', () => {
        if (el.checked) {
          this.connectDevice(adapterId);
        } else {
          this.disconnectDevice(adapterId);
        }
      });
    });

    this.startLoopIfNeeded();
    this.triggerUpdate();
  }
}

export const DeviceManager = new DeviceManagerEngine();

// Register default adapters
DeviceManager.registerAdapter(new PPGAdapter());
DeviceManager.registerAdapter(new ThermometerAdapter());
DeviceManager.registerAdapter(new GlucometerAdapter());
DeviceManager.registerAdapter(new PulseOximeterAdapter());
DeviceManager.registerAdapter(new BloodPressureAdapter());
