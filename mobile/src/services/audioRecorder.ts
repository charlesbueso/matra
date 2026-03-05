// ============================================================
// MATRA — Audio Recording Service
// ============================================================

import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';

export interface RecordingResult {
  uri: string;
  duration: number;   // seconds
  fileSize: number;   // bytes
}

const RECORDING_OPTIONS: Audio.RecordingOptions = {
  isMeteringEnabled: true,
  android: {
    extension: '.m4a',
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 128000,
  },
  ios: {
    extension: '.m4a',
    outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
    audioQuality: Audio.IOSAudioQuality.HIGH,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 128000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 128000,
  },
};

class AudioRecorderService {
  private recording: Audio.Recording | null = null;
  private meteringCallback: ((level: number) => void) | null = null;
  private meteringInterval: ReturnType<typeof setInterval> | null = null;

  async requestPermissions(): Promise<boolean> {
    const { status } = await Audio.requestPermissionsAsync();
    return status === 'granted';
  }

  async start(onMetering?: (level: number) => void): Promise<void> {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const { recording } = await Audio.Recording.createAsync(
      RECORDING_OPTIONS,
      undefined,
      100 // metering update every 100ms
    );

    this.recording = recording;
    this.meteringCallback = onMetering || null;

    if (onMetering) {
      this.meteringInterval = setInterval(async () => {
        if (!this.recording) return;
        try {
          const status = await this.recording.getStatusAsync();
          if (status.isRecording && status.metering !== undefined) {
            // Normalize metering from dB (-160..0) to 0..1
            const normalized = Math.max(0, (status.metering + 60) / 60);
            onMetering(Math.min(1, normalized));
          }
        } catch {
          // Recording may have been stopped
        }
      }, 100);
    }
  }

  async stop(): Promise<RecordingResult | null> {
    if (!this.recording) return null;

    if (this.meteringInterval) {
      clearInterval(this.meteringInterval);
      this.meteringInterval = null;
    }

    try {
      await this.recording.stopAndUnloadAsync();
      const uri = this.recording.getURI();
      const status = await this.recording.getStatusAsync();
      this.recording = null;

      if (!uri) return null;

      const fileInfo = await FileSystem.getInfoAsync(uri);
      const fileSize = (fileInfo as any).size || 0;

      return {
        uri,
        duration: Math.round((status.durationMillis || 0) / 1000),
        fileSize,
      };
    } catch (err) {
      this.recording = null;
      throw err;
    }
  }

  async cancel(): Promise<void> {
    if (!this.recording) return;

    if (this.meteringInterval) {
      clearInterval(this.meteringInterval);
      this.meteringInterval = null;
    }

    try {
      await this.recording.stopAndUnloadAsync();
      const uri = this.recording.getURI();
      this.recording = null;

      // Delete the temp file
      if (uri) {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      }
    } catch {
      this.recording = null;
    }
  }

  isRecording(): boolean {
    return this.recording !== null;
  }
}

export const audioRecorder = new AudioRecorderService();
