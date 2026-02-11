export const EMOTION_THEME = {
    vibrance: 'yellow-400',
    immersion: 'red-500',
    clarity: 'blue-500',
    gravity: 'purple-600',
    serenity: 'gray-400',
    spectrum: 'emerald-500',
} as const;

export type EmotionThemeKey = keyof typeof EMOTION_THEME;

export default EMOTION_THEME;
