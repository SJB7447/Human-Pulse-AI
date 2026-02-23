import { motion } from 'framer-motion';
import { EMOTION_THEME } from '@/constants/emotionTheme';
import { EmotionType } from '@/lib/store';

interface LivingPulseProps {
    emotion: EmotionType;
    className?: string;
}

export function LivingPulse({ emotion, className = '' }: LivingPulseProps) {
    // Use the color from the theme
    // Default to gray-400 if emotion is not found (though types should prevent this)
    const colorKey = EMOTION_THEME[emotion] || 'gray-400';

    // Construct Tailwind classes dynamically as requested
    // Note: Ensure these classes are safelisted or used elsewhere to be picked up by Tailwind JIT
    const bgColorClass = `bg-${colorKey}`;
    const shadowColorClass = `shadow-${colorKey}`;

    return (
        <div className={`relative flex items-center justify-center ${className}`}>
            {/* Core Pulse (Inner) */}
            <motion.div
                className={`absolute w-full h-full rounded-full ${bgColorClass} opacity-75`}
                animate={{
                    scale: [1, 1.2, 1],
                    opacity: [0.7, 1, 0.7],
                }}
                transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut",
                }}
            />

            {/* Ripple Effect 1 */}
            <motion.div
                className={`absolute w-full h-full rounded-full ${bgColorClass} ${shadowColorClass}`}
                initial={{ scale: 1, opacity: 0.5 }}
                animate={{
                    scale: 2,
                    opacity: 0,
                }}
                transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeOut",
                    delay: 0,
                }}
            />

            {/* Ripple Effect 2 (Delayed) */}
            <motion.div
                className={`absolute w-full h-full rounded-full ${bgColorClass} ${shadowColorClass}`}
                initial={{ scale: 1, opacity: 0.5 }}
                animate={{
                    scale: 2,
                    opacity: 0,
                }}
                transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeOut",
                    delay: 1,
                }}
            />

            {/* Center Anchor (Optional, can be removed if specific icon/content is placed on top) */}
            {/* <div className={`w-full h-full rounded-full ${bgColorClass} animate-pulse`} /> */}
        </div>
    );
}
