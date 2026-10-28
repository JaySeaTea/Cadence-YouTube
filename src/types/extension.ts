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
  settingsSchemaVersion?: number;
}

export type PlaylistContextMode =
  | 'youtube_home'
  | 'watch_later'
  | 'creator_playlist'
  | 'standalone';

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
  isLiveStream?: boolean;
  initialLiveEdgeSec?: number;
}

export interface ExtensionEventLog {
  id: string;
  timestamp: string;
  action: string;
  detail: string;
}

export type ActiveTab = 'simulator' | 'rules' | 'code' | 'install';
