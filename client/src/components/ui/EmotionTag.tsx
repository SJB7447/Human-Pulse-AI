import { motion } from 'framer-motion';
import { EMOTION_CONFIG, EmotionType } from '@/lib/store';
import { Tag } from 'lucide-react';

interface EmotionTagProps {
    emotion: EmotionType;
    className?: string;
    onClick?: () => void;
    showIcon?: boolean;
}

export function EmotionTag({ emotion, className = "", onClick, showIcon = true }: EmotionTagProps) {
    const config = EMOTION_CONFIG.find(e => e.type === emotion);
    const color = config?.color || '#888';
    const label = config?.labelKo || emotion;

    return (
        <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onClick}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${className}`}
            style={{
                backgroundColor: `${color}20`,
                color: color,
                border: `1px solid ${color}40`
            }}
        >
            {showIcon && <Tag className="w-3 h-3" />}
            {label}
        </motion.button>
    );
}
