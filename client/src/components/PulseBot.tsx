import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, X, Send, Sparkles, Heart, ArrowRight } from 'lucide-react';
import { GeminiService } from '@/services/gemini';
import { getSupabase } from '@/services/supabaseClient';
import { useLocation } from 'wouter';

interface ChatMessage {
  id: string;
  type: 'bot' | 'user';
  text: string;
  recommendation?: string;
  timestamp: Date;
}

const PROACTIVE_MESSAGES = [
  "기사 내용이 너무 어둡나요? 환기가 필요하면 말씀해주세요.",
  "오늘 하루는 어떠셨나요? 감정을 나눠보세요.",
  "잠깐 쉬어가는 건 어떨까요? 마음의 여유를 가져보세요.",
  "균형 잡힌 뉴스 소비가 중요해요. 다른 감정의 기사도 읽어보세요.",
];

const BOT_RESPONSES = [
  "감정을 나눠주셔서 감사해요. 당신의 이야기를 듣고 있어요.",
  "오늘 하루도 수고하셨어요. 편안한 시간 보내세요.",
  "다양한 감정을 경험하는 것은 자연스러운 일이에요.",
  "힘든 일이 있으시다면 언제든 말씀해주세요.",
  "좋은 생각이에요! 긍정적인 에너지가 느껴져요.",
];

export function PulseBot() {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      type: 'bot',
      text: '안녕하세요! 저는 색채 심리 상담사 Pulse Bot이에요. 오늘 기분이 어떠세요? 어울리는 색(뉴스)을 처방해드릴게요.',
      timestamp: new Date(),
    },
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isOpen && Math.random() > 0.7) {
        setShowNotification(true);
        setTimeout(() => setShowNotification(false), 5000);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]); // Scroll when typing starts too

  const handleSaveLog = async (text: string, sender: 'user' | 'bot') => {
    try {
      const supabase = getSupabase();
      const { data: { session } } = await supabase.auth.getSession();

      await supabase.from('chat_logs').insert({
        user_id: session?.user?.id || null, // Create log even if not logged in
        message: text,
        sender: sender,
        emotion_context: 'general', // Could be dynamic based on page context
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      console.error("Failed to save chat log:", e);
    }
  };

  const handleSend = async () => {
    if (!message.trim()) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      text: message,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setMessage('');

    // Save User Message
    handleSaveLog(message, 'user');
    setIsTyping(true); // Start typing animation

    try {
      const responseCtx = await GeminiService.chatWithBot(message);

      const botResponse: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'bot',
        text: responseCtx.text,
        recommendation: responseCtx.recommendation,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, botResponse]);

      // Save Bot Response
      handleSaveLog(responseCtx.text, 'bot');

    } catch (error) {
      console.error("Chat Error:", error);
    } finally {
      setIsTyping(false); // Stop typing animation
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[100]" data-testid="pulse-bot-container">
      <AnimatePresence>
        {showNotification && !isOpen && (
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
              {PROACTIVE_MESSAGES[Math.floor(Math.random() * PROACTIVE_MESSAGES.length)]}
            </p>
            <button
              onClick={() => setShowNotification(false)}
              className="absolute top-1 right-1 p-1 text-gray-400"
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
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-16 right-0 w-80 md:w-96 mb-2 rounded-2xl overflow-hidden"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.98)',
              backdropFilter: 'blur(24px)',
              boxShadow: '0 8px 40px rgba(0, 0, 0, 0.15)',
              border: '1px solid rgba(0, 0, 0, 0.05)',
            }}
            data-testid="pulse-bot-chat"
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
                  <h3 className="font-semibold text-white text-sm">Pulse Bot</h3>
                  <p className="text-xs text-white/80">색채 심리 상담사</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-full bg-white/20"
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

                      {/* Recommendation Button */}
                      {msg.recommendation && (
                        <motion.button
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="mt-3 w-full flex items-center justify-between p-2 rounded-xl bg-gray-50 hover:bg-gray-100 border border-gray-100 transition-colors group"
                          onClick={() => {
                            setIsOpen(false);
                            setLocation(`/emotion/${msg.recommendation}`);
                          }}
                        >
                          <span className="text-xs font-medium text-gray-600">
                            추천 뉴스: <span className="text-blue-600 font-bold capitalize">{msg.recommendation}</span>
                          </span>
                          <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                            <ArrowRight className="w-3 h-3 text-blue-500" />
                          </div>
                        </motion.button>
                      )}
                    </div>
                  </motion.div>
                ))}

                {/* Typing Indicator */}
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

            <div className="p-3 border-t border-gray-100 bg-white">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="요즘 기분이 어때요?"
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm text-gray-800 placeholder-gray-400 bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  data-testid="input-chat-message"
                />
                <button
                  onClick={handleSend}
                  className="p-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white"
                  data-testid="button-send-message"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => {
          setIsOpen(!isOpen);
          setShowNotification(false);
        }}
        className="w-14 h-14 rounded-full flex items-center justify-center shadow-xl relative hover-elevate active-elevate-2"
        style={{
          background: isOpen
            ? 'linear-gradient(135deg, #f4606b 0%, #3f65ef 100%)'
            : 'linear-gradient(135deg, #ffd150 0%, #f4606b 50%, #3f65ef 100%)',
          boxShadow: '0 4px 20px rgba(244, 96, 107, 0.4)',
        }}
        data-testid="button-pulse-bot"
      >
        {isOpen ? (
          <X className="w-6 h-6 text-white" />
        ) : (
          <Heart className="w-6 h-6 text-white" />
        )}

        {showNotification && !isOpen && (
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
        )}
      </button>
    </div>
  );
}
