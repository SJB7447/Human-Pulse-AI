import { motion } from 'framer-motion';

interface TypewriterTextProps {
    text: string;
    speed?: number;
    className?: string;
    onComplete?: () => void;
}

export function TypewriterText({ text, speed = 0.03, className = "", onComplete }: TypewriterTextProps) {
    // Container variants to control the staggering of children
    const container = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: speed,
                delayChildren: 0.1, // Slight initial delay
            },
        },
    };

    // Child variants for each character
    const child = {
        hidden: { opacity: 0, y: 5 },
        visible: {
            opacity: 1,
            y: 0,
        },
    };

    return (
        <motion.div
            className={className}
            variants={container}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            onAnimationComplete={onComplete}
            style={{ whiteSpace: 'pre-wrap' }} // Respect newlines and spacing
        >
            {Array.from(text).map((char, index) => (
                <motion.span
                    key={index}
                    variants={child}
                    style={{ display: 'inline-block' }} // Needed for transform animations
                >
                    {char === ' ' ? '\u00A0' : char}
                </motion.span>
            ))}
        </motion.div>
    );
}
