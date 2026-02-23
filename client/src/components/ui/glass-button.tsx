import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface GlassButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
}

export const GlassButton = forwardRef<HTMLButtonElement, GlassButtonProps>(
  ({ className, variant = 'default', size = 'md', children, ...props }, ref) => {
    const baseStyles = `
      inline-flex items-center justify-center gap-2
      font-medium transition-all duration-300
      backdrop-blur-xl border
      focus:outline-none focus:ring-2 focus:ring-white/30 focus:ring-offset-2 focus:ring-offset-transparent
      disabled:opacity-50 disabled:cursor-not-allowed
    `;

    const variants = {
      default: `
        bg-white/15 hover:bg-white/25
        border-white/20 hover:border-white/30
        text-gray-800
        shadow-lg shadow-black/5
      `,
      primary: `
        bg-gray-900/80 hover:bg-gray-900/90
        border-gray-800/50
        text-white
        shadow-lg shadow-black/20
      `,
      outline: `
        bg-transparent hover:bg-white/10
        border-gray-400/30 hover:border-gray-400/50
        text-gray-700
      `,
    };

    const sizes = {
      sm: 'px-3 py-1.5 text-sm rounded-lg',
      md: 'px-4 py-2 text-sm rounded-lg',
      lg: 'px-6 py-3 text-base rounded-xl',
    };

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {children}
      </button>
    );
  }
);

GlassButton.displayName = 'GlassButton';
