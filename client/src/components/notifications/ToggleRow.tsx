import type { LucideIcon } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

type ToggleRowProps = {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  badge?: string;
  icon?: LucideIcon;
  onCheckedChange: (checked: boolean) => void;
};

export function ToggleRow({
  title,
  description,
  checked,
  disabled = false,
  badge,
  icon: Icon,
  onCheckedChange,
}: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-[#E7EAF2] bg-white px-4 py-3.5 shadow-[0_8px_20px_rgba(43,51,69,0.04)]">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {Icon ? (
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EEF1FF] text-[#4F46FF]">
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          {badge ? (
            <span className="inline-flex items-center rounded-full bg-[#FDECEC] px-2 py-0.5 text-[10px] font-semibold tracking-[0.12em] text-[#D14A5B]">
              {badge}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-xs leading-5 text-gray-600">{description}</p>
      </div>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  );
}
