import thumbMusic from '../assets/images/thumb_music_session_1792776982151.jpg';
import thumbEducational from '../assets/images/thumb_educational_science_1792776982678.jpg';
import thumbPodcast from '../assets/images/thumb_podcast_lecture_1792776984218.jpg';
import thumbSystems from '../assets/images/thumb_systems_lecture_1792776984438.jpg';
import thumbLiveOrbital from '../assets/images/thumb_live_orbital_telemetry_1793158997775.jpg';
import {
  CategoryPreset,
  ChannelRule,
  SimulatedVideo,
} from '../types/extension';
import {
  DEFAULT_PRESETS,
  DEFAULT_SETTINGS,
  EXTENSION_VERSION,
  INITIAL_CHANNEL_RULES,
} from './sampleDefaults';

export {
  DEFAULT_PRESETS,
  DEFAULT_SETTINGS,
  EXTENSION_VERSION,
  INITIAL_CHANNEL_RULES,
};

export function normalizeHandle(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/^https?:\/\/(www\.)?youtube\.com\//i, '')
    .replace(/^@+/, '')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .toLowerCase();
  return cleaned ? `@${cleaned}` : '@channel';
}

export function resolveRuleSpeed(
  rule: ChannelRule | undefined,
  presets: CategoryPreset[],
  defaultSpeed: number
): number {
  const fallback = Math.min(4.0, Math.max(0.25, Number(defaultSpeed) || 1.0));
  if (!rule) return fallback;
  if (rule.presetId === 'custom') {
    return Math.min(4.0, Math.max(0.25, Number(rule.customSpeed) || fallback));
  }
  const foundPreset = presets.find((p) => p.id === rule.presetId);
  if (foundPreset) {
    return Math.min(4.0, Math.max(0.25, Number(foundPreset.speed) || fallback));
  }
  return Math.min(4.0, Math.max(0.25, Number(rule.customSpeed) || fallback));
}

export const SIMULATED_VIDEOS: SimulatedVideo[] = [
  {
    id: 'v_velvet_01',
    title: 'Late Night Analog Synth Quartet — Live Studio Tape Session',
    channelName: 'Velvet Room Sessions',
    handle: '@velvetroomsessions',
    channelId: 'UC8velvetRoomMusic01',
    subscribers: '412K subscribers',
    publishedLabel: '3 days ago',
    viewsLabel: '184K views',
    durationSec: 465,
    thumbnailUrl: thumbMusic,
    suggestedCategory: 'music',
    summary: 'Full-band studio performance mixed to 2-inch analog tape.',
  },
  {
    id: 'v_orbital_02',
    title: 'Why Low-Thrust Ion Trajectories Spiral Instead of Hohmann Transfer',
    channelName: 'Orbital Mechanics Lab',
    handle: '@orbitalmechanics',
    channelId: 'UC4orbitalLabEdu02',
    subscribers: '890K subscribers',
    publishedLabel: '1 week ago',
    viewsLabel: '642K views',
    durationSec: 1980,
    thumbnailUrl: thumbEducational,
    suggestedCategory: 'educational',
    summary: 'Visual derivation of continuous-thrust orbital raising and delta-v budgets.',
  },
  {
    id: 'v_longform_03',
    title: 'Designing Fault-Tolerant Distributed Storage Engines (Episode 142)',
    channelName: 'The Longform Archive',
    handle: '@longformarchive',
    channelId: 'UC9longformPod03',
    subscribers: '310K subscribers',
    publishedLabel: '5 days ago',
    viewsLabel: '98K views',
    durationSec: 5420,
    thumbnailUrl: thumbPodcast,
    suggestedCategory: 'podcast',
    summary: 'Two-hour engineering conversation on consensus, replication, and deterministic testing.',
  },
  {
    id: 'v_systems_04',
    title: 'Zero-Copy Ring Buffers & Lock-Free Queues in Modern Kernels',
    channelName: 'Systems Craft',
    handle: '@systemscraft',
    channelId: 'UC2systemsCraft04',
    subscribers: '525K subscribers',
    publishedLabel: '2 weeks ago',
    viewsLabel: '315K views',
    durationSec: 1410,
    thumbnailUrl: thumbSystems,
    suggestedCategory: 'educational',
    summary: 'Deep dive into cache-line alignment, memory barriers, and io_uring submission rings.',
  },
  {
    id: 'v_orbital_live_05',
    title: 'LIVE: Lunar Relay Insertion Burn & Deep-Space Telemetry Stream',
    channelName: 'Orbital Mechanics Lab',
    handle: '@orbitalmechanics',
    channelId: 'UC4orbitalLabEdu02',
    subscribers: '890K subscribers',
    publishedLabel: 'Streaming live',
    viewsLabel: '4.8K watching',
    durationSec: 7200,
    thumbnailUrl: thumbLiveOrbital,
    suggestedCategory: 'educational',
    summary: 'Real-time orbital telemetry broadcast with sliding DVR buffer.',
    isLiveStream: true,
    initialLiveEdgeSec: 3600,
  },
];
