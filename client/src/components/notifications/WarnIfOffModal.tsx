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
            수정 요청 알림을 끄면 기사 반려나 보완 요청을 늦게 확인할 수 있어요. 정말 끌지 한 번 더 확인해 주세요.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>유지할게요</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>끄기</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
