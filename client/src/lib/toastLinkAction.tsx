import { ToastAction } from '@/components/ui/toast';

type ToastLinkActionOptions = {
  href: string;
  label: string;
};

export function createToastLinkAction({ href, label }: ToastLinkActionOptions) {
  const target = String(href || '').trim();
  if (!target) return undefined;

  return (
    <ToastAction
      altText={label}
      onClick={() => {
        if (typeof window === 'undefined') return;
        window.location.href = target;
      }}
    >
      {label}
    </ToastAction>
  );
}
