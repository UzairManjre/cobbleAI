import React from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({
  children,
  className = '',
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled = false,
  leftIcon,
  rightIcon,
  type = 'button',
  ...props
}, ref) => {
  const baseStyles = 'inline-flex items-center justify-center font-display font-medium tracking-[-0.01em] rounded-full cursor-pointer transition-[background-color,border-color,color,transform] duration-200 ease-[var(--ease-out-expo)] active:scale-[0.98] disabled:opacity-45 disabled:cursor-not-allowed disabled:active:scale-100 select-none';

  const variantStyles = {
    // Same pills as the gradient pages (glass.ts pillDark / pillLine), clay for destructive
    primary: 'bg-[#0e3445] text-white hover:bg-[#2a6f87]',
    secondary: 'bg-[#1b566b] text-white hover:bg-[#0e3445]',
    outline: 'bg-white text-[#0e3445] border border-[#c3d8e0] hover:border-[#2a6f87]',
    danger: 'bg-[#f6eeea] text-[#8f5646] hover:bg-[#efe2dc]',
    ghost: 'bg-transparent text-ink-3 hover:text-[#0e3445] hover:bg-[#f1f5f7]',
  };

  const sizeStyles = {
    sm: 'h-8 px-3.5 text-xs gap-1.5',
    md: 'h-10 px-5 text-sm gap-2',
    lg: 'h-12 px-7 text-base gap-2.5',
  };

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
      ) : (
        leftIcon && <span className="shrink-0">{leftIcon}</span>
      )}
      {/* Icons passed as children sit beside the text (Tailwind makes svg a block element) */}
      <span className="inline-flex items-center gap-[inherit]">{children}</span>
      {!isLoading && rightIcon && <span className="shrink-0">{rightIcon}</span>}
    </button>
  );
});

Button.displayName = 'Button';
