import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Sparkles, Heart, ArrowRight } from 'lucide-react';
import { GeminiService } from '@/services/gemini';
import { getSupabase } from '@/services/supabaseClient';
import { useLocation } from 'wouter';
import { EMOTION_CONFIG } from '@/lib/store';

interface ChatMessage {
  id: string;
  type: 'bot' | 'user';
  text: string;
  recommendation?: string;
  quickRecommendations?: string[];
  warning?: string;
  timestamp: Date;
}

const PROACTIVE_MESSAGES: Record<'ko' | 'en', string[]> = {
  ko: [
    '오늘의 감정 뉴스 선택이 어려우신가요?',
    '지금 기분을 말해주시면 맞는 감정 흐름을 추천해드릴게요.',
    '마음이 복잡할 땐 감정을 먼저 이름 붙여보는 게 도움이 됩니다.',
    '한 가지 감정에 오래 머물렀다면, 균형을 위해 다른 관점도 살펴볼까요?',
  ],
  en: [
    'Need help choosing today’s emotion-based news?',
    'Tell me how you feel, and I will suggest a fitting emotional flow.',
    'When your mind feels crowded, naming the emotion helps first.',
    'If you stayed in one emotion too long, want to explore a balancing view?',
  ],
};

const CHAT_POLICY: Record<'ko' | 'en', { notice: string; retention: string; request: string }> = {
  ko: {
    notice: '개인정보 안내: 채팅 내용은 서비스 품질 개선을 위해 저장될 수 있습니다.',
    retention: '보관 기간: 데모 모드 기준 최대 30일',
    request: '삭제 요청은 마이페이지 > 설정 > 개인정보 메뉴에서 진행할 수 있습니다.',
  },
  en: {
    notice: 'Privacy notice: Chat logs may be stored to improve service quality.',
    retention: 'Retention: Up to 30 days in demo mode',
    request: 'Deletion request: My Page > Settings > Privacy',
  },
};

function detectPreferredLanguage(): 'ko' | 'en' {
  if (typeof window === 'undefined') return 'ko';
  const lang = String(window.navigator.language || '').toLowerCase();
  return lang.startsWith('ko') ? 'ko' : 'en';
}

function detectMessageLanguage(input: string): 'ko' | 'en' {
  const text = String(input || '');
  const koMatches = text.match(/[가-힣]/g) || [];
  const enMatches = text.match(/[a-z]/gi) || [];
  if (koMatches.length >= 2 && koMatches.length >= enMatches.length) return 'ko';
  if (enMatches.length > koMatches.length) return 'en';
  return 'ko';
}

export function HueBot() {
  const [isOpen, setIsOpen] = useState(false);
  const [uiLanguage] = useState<'ko' | 'en'>(() => detectPreferredLanguage());
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      type: 'bot',
      text: uiLanguage === 'ko'
        ? '안녕하세요, 저는 Hue Bot이에요. 지금 감정을 알려주시면 어울리는 뉴스 흐름을 함께 찾아드릴게요.'
        : "Hi, I'm Hue Bot. Share how you feel, and I'll guide you to fitting news lanes.",
      timestamp: new Date(),
    },
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const [isPeripheralNudgeVisible, setIsPeripheralNudgeVisible] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatPanelRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const chatToggleRef = useRef<HTMLButtonElement>(null);
  const [, setLocation] = useLocation();
  const [clientId, setClientId] = useState<string>('hue-bot-anon');
  const [cooldownUntil, setCooldownUntil] = useState<number>(0);
  const [cooldownSeconds, setCooldownSeconds] = useState<number>(0);
  const [responseStyle, setResponseStyle] = useState<'short' | 'deep'>('short');

  const getEmotionVisual = (emotion: string) => {
    const normalized = String(emotion || '').trim().toLowerCase();
    const config = EMOTION_CONFIG.find((entry) => entry.type === normalized);
    return {
      key: normalized,
      label: config?.labelKo || normalized.toUpperCase(),
      color: config?.color || '#00abaf',
    };
  };

  useEffect(() => {
    const onPeripheralNudgeEvent = (event: Event) => {
      const custom = event as CustomEvent<{
        event?: string;
        payload?: {
          fromEmotion?: string;
          recommendations?: string[];
        };
      }>;
      const evt = String(custom?.detail?.event || '');
      if (evt === 'peripheral_nudge_shown') {
        setIsPeripheralNudgeVisible(true);
        setShowNotification(false);
        return;
      }

      if (evt === 'peripheral_nudge_suppressed' || evt === 'peripheral_nudge_click' || evt === 'huebot_nudge_opened') {
        setIsPeripheralNudgeVisible(false);
      }

      if (evt !== 'huebot_nudge_opened') return;

      const fromEmotion = String(custom?.detail?.payload?.fromEmotion || '').trim();
      const recommendations = Array.isArray(custom?.detail?.payload?.recommendations)
        ? custom.detail.payload?.recommendations || []
        : [];
      const firstRecommendation = String(recommendations?.[0] || '').trim().toLowerCase();

      const botText = fromEmotion
        ? `지금 ${fromEmotion.toUpperCase()} 카테고리에 오래 머무르셨어요.\n균형을 위해 다른 감정 뉴스도 함께 볼까요?`
        : '지금 뉴스 소비 흐름을 기준으로 다른 감정 뉴스도 함께 추천해드릴게요.';

      setIsOpen(true);
      setShowNotification(false);
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-nudge`,
          type: 'bot',
          text: botText,
          recommendation: firstRecommendation || undefined,
          quickRecommendations: recommendations.slice(0, 3).map((v) => String(v || '').trim().toLowerCase()).filter(Boolean),
          timestamp: new Date(),
        },
      ]);
    };

    window.addEventListener('huebrief:peripheral-nudge', onPeripheralNudgeEvent as EventListener);
    return () => window.removeEventListener('huebrief:peripheral-nudge', onPeripheralNudgeEvent as EventListener);
  }, []);

  useEffect(() => {
    const key = 'hue_bot_client_id';
    const existing = localStorage.getItem(key);
    if (existing) {
      setClientId(existing);
      return;
    }
    const generated = `hue-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(key, generated);
    setClientId(generated);
  }, []);

  useEffect(() => {
    if (cooldownUntil <= Date.now()) {
      setCooldownSeconds(0);
      return;
    }
    const timer = setInterval(() => {
      const remain = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
      setCooldownSeconds(remain);
      if (remain <= 0) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownUntil]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isOpen && !isPeripheralNudgeVisible && Math.random() > 0.7) {
        setShowNotification(true);
        setTimeout(() => setShowNotification(false), 5000);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [isOpen, isPeripheralNudgeVisible]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  useEffect(() => {
    if (!isOpen) return;
    chatInputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsOpen(false);
        chatToggleRef.current?.focus();
        return;
      }

      if (event.key !== 'Tab') return;
      const panel = chatPanelRef.current;
      if (!panel) return;
      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  const handleSaveLog = async (text: string, sender: 'user' | 'bot') => {
    try {
      const supabase = getSupabase();
      const { data: { session } } = await supabase.auth.getSession();

      await supabase.from('chat_logs').insert({
        user_id: session?.user?.id || null,
        message: text,
        sender,
        emotion_context: 'general',
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      console.error('Failed to save chat log:', e);
    }
  };

  const handleSend = async () => {
    if (!message.trim()) return;
    if (cooldownUntil > Date.now()) {
      const cooldownLanguage = detectMessageLanguage(message);
      const botCooldownMessage: ChatMessage = {
        id: `${Date.now()}-cooldown`,
        type: 'bot',
        text: cooldownLanguage === 'ko'
          ? `잠시만요. ${Math.max(1, cooldownSeconds)}초 후 다시 시도해 주세요.`
          : `Please wait. Try again in ${Math.max(1, cooldownSeconds)} seconds.`,
        warning: cooldownLanguage === 'ko'
          ? '감정 안전을 위한 15분 규칙이 적용 중입니다.'
          : '15-minute emotional safety rule is active.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, botCooldownMessage]);
      return;
    }

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      text: message,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setMessage('');
    handleSaveLog(message, 'user');
    setIsTyping(true);

    try {
      const responseCtx = await GeminiService.chatWithBot(message, clientId, responseStyle);
      const responseLanguage = responseCtx.language || detectMessageLanguage(message);
      const shouldShowDiagnostic = Boolean(responseCtx.fallbackUsed || responseCtx.cooldownActive);
      const extraLines = [
        shouldShowDiagnostic && responseCtx.rationale
          ? (responseLanguage === 'ko' ? `추천 근거: ${responseCtx.rationale}` : `Reason: ${responseCtx.rationale}`)
          : '',
        responseCtx.biasWarning
          ? (responseLanguage === 'ko' ? `주의: ${responseCtx.biasWarning}` : `Caution: ${responseCtx.biasWarning}`)
          : '',
        shouldShowDiagnostic && responseCtx.neutralPrompt
          ? (responseLanguage === 'ko' ? `균형 질문: ${responseCtx.neutralPrompt}` : `Balance check: ${responseCtx.neutralPrompt}`)
          : '',
        responseCtx.fallbackUsed && responseCtx.followUp ? responseCtx.followUp : '',
      ].filter(Boolean);
      const mergedText = extraLines.length > 0
        ? `${responseCtx.text}\n\n${extraLines.join('\n\n')}`
        : responseCtx.text;
      const botResponse: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'bot',
        text: mergedText,
        recommendation: responseCtx.recommendation,
        quickRecommendations: Array.isArray(responseCtx.quickRecommendations)
          ? responseCtx.quickRecommendations
          : (responseCtx.recommendation ? [responseCtx.recommendation] : undefined),
        warning: responseCtx.cooldownActive
          ? (responseLanguage === 'ko' ? '15분 규칙 적용 중입니다.' : '15-minute rule is active.')
          : responseCtx.biasWarning,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, botResponse]);
      if (responseCtx.cooldownActive && (responseCtx.cooldownRemainingSeconds || 0) > 0) {
        const until = Date.now() + (responseCtx.cooldownRemainingSeconds || 0) * 1000;
        setCooldownUntil(until);
        setCooldownSeconds(responseCtx.cooldownRemainingSeconds || 0);
      }
      handleSaveLog(responseCtx.text, 'bot');
    } catch (error) {
      console.error('Chat Error:', error);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[1100]" data-testid="hue-bot-container">
      <AnimatePresence>
        {showNotification && !isOpen && !isPeripheralNudgeVisible && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            className="absolute bottom-16 right-0 w-64 p-3 rounded-xl mb-2"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(16px)',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
              border: '1px solid rgba(0, 0, 0, 0.05)',
            }}
          >
            <p className="text-sm text-gray-700">
              {PROACTIVE_MESSAGES[uiLanguage][Math.floor(Math.random() * PROACTIVE_MESSAGES[uiLanguage].length)]}
            </p>
            <button
              onClick={() => setShowNotification(false)}
              className="absolute top-1 right-1 p-1 text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 rounded"
              aria-label="Hue Bot 알림 닫기"
              data-testid="button-close-notification"
            >
              <X className="w-3 h-3" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={chatPanelRef}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-16 right-0 w-80 md:w-96 mb-2 rounded-2xl overflow-hidden"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.98)',
              backdropFilter: 'blur(24px)',
              boxShadow: '0 8px 40px rgba(0, 0, 0, 0.15)',
            }}
            id="hue-bot-chat-panel"
            data-testid="hue-bot-chat"
            role="dialog"
            aria-label="Hue Bot 채팅 패널"
            aria-modal="false"
          >
            <div
              className="p-4 flex items-center justify-between"
              style={{
                background: 'linear-gradient(135deg, #ffd150 0%, #f4606b 50%, #3f65ef 100%)',
              }}
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-white text-sm">Hue Bot</h3>
                  <p className="text-xs text-white/80">{uiLanguage === 'ko' ? '감정 기반 뉴스 도우미' : 'Emotion-aware news companion'}</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-full bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
                aria-label="Hue Bot 채팅 닫기"
                data-testid="button-close-chat"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            <div className="h-72 p-4 overflow-y-auto bg-gray-50/50">
              <div className="space-y-3">
                {messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] p-3 rounded-2xl ${msg.type === 'user'
                        ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-br-md'
                        : 'bg-white text-gray-700 rounded-bl-md shadow-sm'
                        }`}
                    >
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                      {msg.warning && (
                        <p className="mt-2 text-xs text-amber-600">{msg.warning}</p>
                      )}

                      {Array.isArray(msg.quickRecommendations) && msg.quickRecommendations.length > 0 ? (
                        <div className="mt-3 space-y-2">
                          <p className="text-[11px] text-gray-500">{uiLanguage === 'ko' ? '추천 감정 빠르게 이동' : 'Quick emotion jumps'}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {msg.quickRecommendations.map((emotion) => (
                              (() => {
                                const visual = getEmotionVisual(emotion);
                                return (
                                  <button
                                    key={`${msg.id}-${emotion}`}
                                    type="button"
                                    className="h-7 px-2.5 rounded-full text-[11px] text-gray-700 hover:brightness-95 transition"
                                    style={{
                                      backgroundColor: `${visual.color}1f`,
                                    }}
                                    onClick={() => {
                                      window.dispatchEvent(new CustomEvent('huebrief:navigate-emotion', {
                                        detail: { emotion },
                                      }));
                                      setIsOpen(false);
                                      setLocation(`/emotion/${emotion}`);
                                    }}
                                  >
                                    <span className="inline-flex items-center gap-1">
                                      <span
                                        className="inline-block h-1.5 w-1.5 rounded-full"
                                        style={{ backgroundColor: visual.color }}
                                        aria-hidden="true"
                                      />
                                      {visual.label}
                                    </span>
                                  </button>
                                );
                              })()
                            ))}
                          </div>
                        </div>
                      ) : msg.recommendation ? (
                        <motion.button
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="mt-3 w-full flex items-center justify-between p-2 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors group"
                          onClick={() => {
                            window.dispatchEvent(new CustomEvent('huebrief:navigate-emotion', {
                              detail: { emotion: msg.recommendation },
                            }));
                            setIsOpen(false);
                            setLocation(`/emotion/${msg.recommendation}`);
                          }}
                        >
                          <span className="text-xs font-medium text-gray-600">
                            {uiLanguage === 'ko' ? '추천 감정:' : 'Recommended:'} <span className="text-blue-600 font-bold capitalize">{msg.recommendation}</span>
                          </span>
                          <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                            <ArrowRight className="w-3 h-3 text-blue-500" />
                          </div>
                        </motion.button>
                      ) : null}
                    </div>
                  </motion.div>
                ))}

                {isTyping && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-start"
                  >
                    <div className="bg-white p-4 rounded-2xl rounded-bl-md shadow-sm">
                      <div className="flex gap-1">
                        <motion.div
                          className="w-1.5 h-1.5 bg-gray-400 rounded-full"
                          animate={{ y: [0, -5, 0] }}
                          transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
                        />
                        <motion.div
                          className="w-1.5 h-1.5 bg-gray-400 rounded-full"
                          animate={{ y: [0, -5, 0] }}
                          transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
                        />
                        <motion.div
                          className="w-1.5 h-1.5 bg-gray-400 rounded-full"
                          animate={{ y: [0, -5, 0] }}
                          transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
                        />
                      </div>
                    </div>
                  </motion.div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>

            <div className="p-3 bg-white">
              {cooldownSeconds > 0 && (
                <div className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  {uiLanguage === 'ko'
                    ? `15분 규칙 적용 중: ${cooldownSeconds}초 남음`
                    : `15-minute rule active: ${cooldownSeconds}s remaining`}
                </div>
              )}
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[11px] text-gray-500">{uiLanguage === 'ko' ? '답변 스타일' : 'Reply style'}</p>
                <div className="inline-flex rounded-xl bg-gray-100 p-1 gap-1">
                  <button
                    type="button"
                    onClick={() => setResponseStyle('short')}
                    className={`h-7 px-3 text-[11px] rounded-lg transition-all ${responseStyle === 'short' ? 'bg-gradient-to-r from-sky-500 to-indigo-500 text-white shadow-sm' : 'bg-transparent text-gray-500 hover:text-gray-700'}`}
                  >
                    {uiLanguage === 'ko' ? '짧게' : 'Short'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setResponseStyle('deep')}
                    className={`h-7 px-3 text-[11px] rounded-lg transition-all ${responseStyle === 'deep' ? 'bg-gradient-to-r from-sky-500 to-indigo-500 text-white shadow-sm' : 'bg-transparent text-gray-500 hover:text-gray-700'}`}
                  >
                    {uiLanguage === 'ko' ? '깊게' : 'Deep'}
                  </button>
                </div>
              </div>
              <p className="mb-2 text-[10px] text-gray-500">
                {responseStyle === 'short'
                  ? (uiLanguage === 'ko' ? '짧고 빠른 답변 모드' : 'Concise and quick replies')
                  : (uiLanguage === 'ko' ? '공감과 맥락을 더 담는 답변 모드' : 'More reflective, context-rich replies')}
              </p>
              <div className="flex gap-2">
                <input
                  ref={chatInputRef}
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={uiLanguage === 'ko' ? '지금 기분을 알려주세요.' : 'Tell me how you feel right now.'}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm text-gray-800 placeholder-gray-400 bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  aria-label="채팅 메시지 입력"
                  data-testid="input-chat-message"
                />
                <button
                  onClick={handleSend}
                  disabled={cooldownSeconds > 0}
                  className="p-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2"
                  aria-label="채팅 메시지 전송"
                  data-testid="button-send-message"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              <div className="mt-2 rounded-lg bg-gray-50 px-2.5 py-2">
                <p className="text-[11px] text-gray-600 leading-relaxed">{CHAT_POLICY[uiLanguage].notice}</p>
                <p className="text-[11px] text-gray-500 leading-relaxed mt-0.5">{CHAT_POLICY[uiLanguage].retention}</p>
                <p className="text-[11px] text-gray-500 leading-relaxed mt-0.5">{CHAT_POLICY[uiLanguage].request}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        ref={chatToggleRef}
        onClick={() => {
          setIsOpen(!isOpen);
          setShowNotification(false);
        }}
        className="w-14 h-14 rounded-full flex items-center justify-center shadow-xl relative hover-elevate active-elevate-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2"
        style={{
          background: isOpen
            ? 'linear-gradient(135deg, #f4606b 0%, #3f65ef 100%)'
            : 'linear-gradient(135deg, #ffd150 0%, #f4606b 50%, #3f65ef 100%)',
          boxShadow: '0 4px 20px rgba(244, 96, 107, 0.4)',
        }}
        data-testid="button-hue-bot"
        aria-label={isOpen ? 'Hue Bot 닫기' : 'Hue Bot 열기'}
        aria-expanded={isOpen}
        aria-controls="hue-bot-chat-panel"
      >
        {isOpen ? (
          <X className="w-6 h-6 text-white" />
        ) : (
          <Heart className="w-6 h-6 text-white" />
        )}

        {showNotification && !isOpen && !isPeripheralNudgeVisible && (
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
        )}
      </button>
    </div>
  );
}
