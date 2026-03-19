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
            수정 요청 알림을 끄면 기사 반려나 보완 요청을 바로 확인하지 못할 수 있습니다.
            정말로 끄려는 경우에만 진행해 주세요.
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
