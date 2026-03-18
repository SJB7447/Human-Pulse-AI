import { Switch } from '@/components/ui/switch';

type ToggleRowProps = {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  badge?: string;
  onCheckedChange: (checked: boolean) => void;
};

export function ToggleRow({
  title,
  description,
  checked,
  disabled = false,
  badge,
  onCheckedChange,
}: ToggleRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-gray-100 bg-white px-4 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          {badge ? (
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold tracking-[0.12em] text-gray-600">
              {badge}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-xs leading-5 text-gray-600">{description}</p>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  );
}
