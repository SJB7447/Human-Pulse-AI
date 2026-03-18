import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type WarnIfOffModalProps = {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function WarnIfOffModal({ open, onConfirm, onCancel }: WarnIfOffModalProps) {
  return (
    <AlertDialog open={open} onOpenChange={(nextOpen) => !nextOpen && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>수정 요청 알림을 끄시겠어요?</AlertDialogTitle>
          <AlertDialogDescription>
            마감을 놓칠 수 있어요. 계속할까요?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>유지할게요</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>계속 끄기</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
