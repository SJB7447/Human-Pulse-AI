import type { EmotionType } from '@/lib/store';

export type PeripheralNudgeEventName =
  | 'peripheral_nudge_triggered'
  | 'peripheral_nudge_shown'
  | 'peripheral_nudge_click'
  | 'peripheral_nudge_suppressed'
  | 'huebot_nudge_opened';

export const PERIPHERAL_NUDGE_Z_INDEX = 1050;

export function getDwellThresholdSeconds(emotion: EmotionType): number {
  void emotion;
  return 60;
}

export function getPeripheralRecommendations(current: EmotionType): EmotionType[] {
  const base: EmotionType[] = ['spectrum', 'clarity', 'serenity', 'vibrance', 'immersion', 'gravity'];
  const filtered = base.filter((emotion) => emotion !== current);
  return filtered.slice(0, 3);
}

export function emitPeripheralNudgeEvent(
  event: PeripheralNudgeEventName,
  payload: Record<string, unknown>,
): void {
  if (typeof window === 'undefined') return;
  const detail = {
    event,
    payload,
    at: new Date().toISOString(),
  };
  window.dispatchEvent(new CustomEvent('huebrief:peripheral-nudge', { detail }));
  if (import.meta.env.DEV) {
    console.info('[PeripheralNudge]', detail);
  }
}
