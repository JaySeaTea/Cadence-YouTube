import {
  CategoryPreset,
  ChannelRule,
  ExtensionSettings,
} from '../types/extension';

export const EXTENSION_VERSION = '1.4.0';

export const DEFAULT_SETTINGS: ExtensionSettings = {
  enabled: true,
  perChannelSpeedEnabled: true,
  autoRememberManualSpeed: false,
  defaultSpeed: 1.0,
  stopAfterVideoEnds: true,
  showInPageControlBar: true,
  showSpeedToast: true,
  convertShortsToWatch: true,
  settingsSchemaVersion: 3,
};

export const DEFAULT_PRESETS: CategoryPreset[] = [
  {
    id: 'music',
    label: 'Music & Performance',
    description: 'Preserves natural pitch, rhythm, and studio mix timing.',
    speed: 1.0,
  },
  {
    id: 'educational',
    label: 'Educational & Explainer',
    description: 'Brisk comprehension pace for tutorials, science, and essays.',
    speed: 1.5,
  },
  {
    id: 'podcast',
    label: 'Podcast & Lecture',
    description: 'High-efficiency cadence for long-form conversations and seminars.',
    speed: 2.0,
  },
];

export const INITIAL_CHANNEL_RULES: ChannelRule[] = [
  {
    id: 'rule-velvet-room',
    channelName: 'Velvet Room Sessions',
    handle: '@velvetroomsessions',
    channelId: 'UC8velvetRoomMusic01',
    presetId: 'music',
    customSpeed: 1.0,
    updatedAt: '2026-10-23',
  },
  {
    id: 'rule-orbital-lab',
    channelName: 'Orbital Mechanics Lab',
    handle: '@orbitalmechanics',
    channelId: 'UC4orbitalLabEdu02',
    presetId: 'educational',
    customSpeed: 1.5,
    updatedAt: '2026-10-23',
  },
  {
    id: 'rule-longform-archive',
    channelName: 'The Longform Archive',
    handle: '@longformarchive',
    channelId: 'UC9longformPod03',
    presetId: 'podcast',
    customSpeed: 2.0,
    updatedAt: '2026-10-23',
  },
  {
    id: 'rule-systems-craft',
    channelName: 'Systems Craft',
    handle: '@systemscraft',
    channelId: 'UC2systemsCraft04',
    presetId: 'educational',
    customSpeed: 1.5,
    updatedAt: '2026-10-23',
  },
];
