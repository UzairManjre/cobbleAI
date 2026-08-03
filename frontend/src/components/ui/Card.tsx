import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'raised' | 'hoverable' | 'glass';
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(({
  children,
  className = '',
  variant = 'default',
  ...props
}, ref) => {
  const variantStyles = {
    default: 'bg-[#0A0A0A] border border-[#1A1A1A]',
    raised: 'bg-[#111111] border border-[#1A1A1A]',
    hoverable: 'bg-[#0A0A0A] border border-[#1A1A1A] hover:border-[#333333] hover:-translate-y-0.5 transition-all cursor-pointer',
    glass: 'bg-[#0A0A0A]/90 backdrop-blur-xl border border-[#1A1A1A]',
  };

  return (
    <div
      ref={ref}
      className={`rounded-2xl ${variantStyles[variant]} ${className}`}
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
  <h3 className={`text-lg font-medium text-white tracking-tight ${className}`} {...props} />
);

export const CardDescription = ({ className = '', ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p className={`text-xs text-[#888888] mt-1 font-normal leading-relaxed ${className}`} {...props} />
);

export const CardContent = ({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`p-6 pt-3 ${className}`} {...props} />
);

export const CardFooter = ({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`p-6 pt-3 border-t border-[#1A1A1A] flex items-center justify-between ${className}`} {...props} />
);
