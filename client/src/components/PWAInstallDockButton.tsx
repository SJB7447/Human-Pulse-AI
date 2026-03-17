import { Download } from "lucide-react";
import { usePWA } from "@/hooks/usePWA";
import { useToast } from "@/hooks/use-toast";

export function PWAInstallDockButton() {
  const { isInstallable, isInstalled, isIOS, install } = usePWA();
  const { toast } = useToast();

  if (isInstalled || !isInstallable) return null;

  const handleInstall = async () => {
    if (isIOS) {
      toast({
        title: "앱으로 설치하기",
        description: "Safari 하단 공유 버튼을 누른 뒤 '홈 화면에 추가'를 선택하세요.",
      });
      return;
    }

    const accepted = await install();
    if (accepted) {
      toast({
        title: "설치 완료!",
        description: "HueBrief가 홈 화면에 추가됐어요.",
      });
    }
  };

  return (
    <button
      type="button"
      onClick={handleInstall}
      className="fixed bottom-24 right-6 z-[1095] inline-flex h-12 items-center gap-2 rounded-full px-4 text-sm font-semibold text-white shadow-xl transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2"
      style={{
        background: "linear-gradient(135deg, #00abaf 0%, #3f65ef 100%)",
        boxShadow: "0 10px 24px rgba(27, 188, 168, 0.28)",
      }}
      aria-label="HueBrief 설치"
    >
      <Download className="h-4 w-4" />
      설치
    </button>
  );
}
