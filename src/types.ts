export type DeviceType = 'serial' | 'router';

export interface SMSMessage {
  id: string;
  sender: string;
  content: string;
  timestamp: Date;
  isRead: boolean;
  type: 'incoming' | 'outgoing';
}

export interface DeviceStatus {
  connected: boolean;
  signalStrength?: number; // 0-5
  operator?: string;
  type: DeviceType;
  portName?: string;
  gatewayIp?: string;
}

export interface SMART_INFO {
  isOTP: boolean;
  otpCode?: string;
  senderType: 'bank' | 'personal' | 'service' | 'spam' | 'unknown';
  summary: string;
}
