export const EMOTION_THEME = {
    joy: 'yellow-400',     // 기쁨 (희망)
    sadness: 'blue-500',   // 슬픔 (우울)
    anger: 'red-500',      // 분노 (강렬)
    fear: 'purple-600',    // 공포 (신비/공포)
    calm: 'gray-400',      // 평온 (중립)
} as const;

export type EmotionThemeKey = keyof typeof EMOTION_THEME;

export default EMOTION_THEME;
