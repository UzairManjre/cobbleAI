import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'raised' | 'hoverable' | 'glass';
}

/** A white panel on the White Smoke canvas: one hairline, no shadow. */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(({
  children,
  className = '',
  variant = 'default',
  ...props
}, ref) => {
  const variantStyles = {
    default: 'bg-surface border border-line',
    raised: 'bg-sunken border border-line',
    hoverable: 'group bg-surface border border-line hover:border-ink transition-colors duration-200 cursor-pointer',
    glass: 'bg-surface border border-line',
  };

  // Clickable cards are reachable and operable from the keyboard
  const interactive = props.onClick && variant === 'hoverable'
    ? {
        role: 'button',
        tabIndex: 0,
        onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.currentTarget as HTMLDivElement).click(); }
        },
      }
    : {};

  return (
    <div
      ref={ref}
      className={`rounded-2xl ${variantStyles[variant]} ${className}`}
      {...interactive}
      {...props}
    >
      {children}
    </div>
  );
});

Card.displayName = 'Card';

export const CardHeader = ({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`p-6 pb-3 ${className}`} {...props} />
);

export const CardTitle = ({ className = '', ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h3 className={`font-display text-lg font-medium text-ink tracking-tight ${className}`} {...props} />
);

export const CardDescription = ({ className = '', ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p className={`text-sm text-ink-3 mt-1 leading-relaxed ${className}`} {...props} />
);

export const CardContent = ({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`p-6 pt-3 ${className}`} {...props} />
);

export const CardFooter = ({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`p-6 pt-3 border-t border-line flex items-center justify-between ${className}`} {...props} />
);
