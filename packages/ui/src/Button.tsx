import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: ReactNode;
}

const variantClassNames: Record<ButtonVariant, string> = {
  primary: 'bg-slate-900 text-white hover:bg-slate-700',
  secondary: 'bg-slate-100 text-slate-900 hover:bg-slate-200',
  ghost: 'bg-transparent text-slate-900 hover:bg-slate-100',
};

/**
 * Baseline button component for docsgraph's shared UI kit. Intentionally
 * minimal — this exists to prove the workspace wiring (build/lint/test)
 * works end to end, not as a finished design system.
 */
export function Button({ variant = 'primary', className, children, ...rest }: ButtonProps) {
  const classes = ['rounded-md px-3 py-1.5 text-sm font-medium transition-colors']
    .concat(variantClassNames[variant])
    .concat(className ?? [])
    .join(' ');

  return (
    <button type="button" className={classes} {...rest}>
      {children}
    </button>
  );
}
