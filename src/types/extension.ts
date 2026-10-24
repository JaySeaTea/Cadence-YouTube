export type CategoryPresetId = 'music' | 'educational' | 'podcast' | 'custom';

export interface CategoryPreset {
  id: Exclude<CategoryPresetId, 'custom'>;
  label: string;
  description: string;
  speed: number;
}

export interface ChannelRule {
  id: string;
  channelName: string;
  handle: string;
  channelId?: string;
  presetId: CategoryPresetId;
  customSpeed: number;
  updatedAt: string;
}

export interface ExtensionSettings {
  enabled: boolean;
  perChannelSpeedEnabled: boolean;
  autoRememberManualSpeed: boolean;
  defaultSpeed: number;
  stopAfterVideoEnds: boolean;
  showInPageControlBar: boolean;
  showSpeedToast: boolean;
}

export type PlaylistContextMode =
  | 'watch_later'
  | 'creator_playlist'
  | 'standalone'
  | 'live_stream';

export interface SimulatedVideo {
  id: string;
  title: string;
  channelName: string;
  handle: string;
  channelId: string;
  subscribers: string;
  publishedLabel: string;
  viewsLabel: string;
  durationSec: number;
  thumbnailUrl: string;
  suggestedCategory: Exclude<CategoryPresetId, 'custom'>;
  summary: string;
}

export interface ExtensionEventLog {
  id: string;
  timestamp: string;
  action: string;
  detail: string;
}

export type ActiveTab = 'simulator' | 'rules' | 'code' | 'install';
