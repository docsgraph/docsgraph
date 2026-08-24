import type { HTMLAttributes } from 'react';

export interface DocumentListItemProps extends HTMLAttributes<HTMLButtonElement> {
  title: string;
  id: string;
}

/**
 * Shared document list item component consumed by web and desktop targets.
 */
export function DocumentListItem({ title, id, className, onClick, ...rest }: DocumentListItemProps) {
  const classes = [
    'w-full text-left px-3 py-2 bg-slate-800/40 border border-slate-700/60 hover:bg-slate-800/80 rounded-lg text-sm text-slate-300 flex justify-between items-center transition-all'
  ]
    .concat(className ?? [])
    .join(' ');

  return (
    <button type="button" id={id} className={classes} onClick={onClick} {...rest}>
      <span>{title}</span>
      <span className="text-xs text-slate-500 font-mono">Open →</span>
    </button>
  );
}
