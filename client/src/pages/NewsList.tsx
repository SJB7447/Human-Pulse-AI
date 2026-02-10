import React, { useEffect, useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { supabase } from '../services/supabaseClient';
import { motion } from 'framer-motion';
import { EMOTION_CONFIG } from '@/lib/store';

interface Article {
    id: number;
    title: string;
    summary: string;
    thumbnail_url: string;
    created_at: string;
    category: string;
}

const emotionColors = {
    vibrance: 'border-yellow-400/50 text-yellow-100 bg-yellow-900/20',
    immersion: 'border-red-500/50 text-red-100 bg-red-900/20',
    serenity: 'border-green-400/50 text-green-100 bg-green-900/20',
    clarity: 'border-blue-500/50 text-blue-100 bg-blue-900/20',
    gravity: 'border-gray-400/50 text-gray-100 bg-gray-800/40',
    spectrum: 'border-teal-400/50 text-teal-100 bg-teal-900/20',
};

export default function NewsList() {
    const params = useParams();
    const category = params.category;
    const [, setLocation] = useLocation();
    const [articles, setArticles] = useState<Article[]>([]);
    const [loading, setLoading] = useState(true);
    const [debugMsg, setDebugMsg] = useState(''); // 화면에 에러 띄우기용

    useEffect(() => {
        const fetchArticles = async () => {
            setLoading(true);
            setDebugMsg('');

            try {
                // 1. 카테고리 소문자 변환 (DB는 소문자로 저장됨)
                const targetCategory = category ? category.toLowerCase() : 'vibrance';
                console.log(`📡 [요청 시작] 감정: ${targetCategory}`);

                // 2. Supabase 쿼리 실행
                const { data, error } = await supabase
                    .from('news_items')
                    .select('*')
                    .eq('emotion', targetCategory)
                    .order('created_at', { ascending: false });

                // 3. 결과 처리
                if (error) {
                    console.error('❌ [Supabase 에러]', error);
                    setDebugMsg(`데이터 불러오기 실패: ${error.message}`);
                } else {
                    console.log(`✅ [성공] 받아온 데이터 개수: ${data?.length}`);
                    // Map news_items fields to Article interface
                    const mappedData = (data || []).map((item: any) => ({
                        id: item.id,
                        title: item.title,
                        summary: item.summary,
                        thumbnail_url: item.image, // Map image to thumbnail_url
                        created_at: item.created_at,
                        category: item.category,
                    }));
                    setArticles(mappedData);
                    if (data?.length === 0) setDebugMsg('데이터는 불러왔으나 결과가 0개입니다. (DB 데이터를 확인하세요)');
                }
            } catch (err: any) {
                console.error('❌ [치명적 오류]', err);
                setDebugMsg(`시스템 오류: ${err.message}`);
            } finally {
                setLoading(false);
            }
        };

        fetchArticles();
    }, [category]);

    const themeClass = emotionColors[(category?.toLowerCase() || 'vibrance') as keyof typeof emotionColors] || emotionColors.vibrance;

    return (
        <div className="w-full min-h-screen bg-black text-white p-8 pt-24 overflow-y-auto">
            <button
                onClick={() => setLocation('/')}
                className="fixed top-8 left-8 z-50 px-5 py-2 rounded-full border border-white/30 backdrop-blur-md hover:bg-white/10 transition"
            >
                ← Back
            </button>

            <h1 className="text-5xl font-serif capitalize mb-2">{category}</h1>
            <p className="text-white/60 mb-8">Real Data Connection</p>

            {/* 상태 메시지 (에러/로딩) */}
            <div className="mb-8">
                {loading && <div className="text-xl animate-pulse text-yellow-300">📡 서버와 통신 중...</div>}
                {debugMsg && <div className="p-4 bg-red-900/50 border border-red-500 rounded text-red-200">{debugMsg}</div>}
            </div>

            {/* 기사 리스트 */}
            {!loading && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-20">
                    {articles.map((article) => {
                        // Determine the glow color based on the current category (since list is filtered) or fallback
                        const currentConfig = EMOTION_CONFIG.find(e => e.type === (category?.toLowerCase() || 'vibrance')) || EMOTION_CONFIG[0];
                        const glowColor = currentConfig?.color || '#ffffff';

                        return (
                            <motion.div
                                key={article.id}
                                initial={{ opacity: 0, y: 50 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, margin: "-50px" }}
                                transition={{ duration: 0.5, ease: "easeOut" }}
                                whileHover={{
                                    y: -8,
                                    boxShadow: `0 15px 30px -5px ${glowColor}80`, // Adding transparency
                                    borderColor: glowColor
                                }}
                                className={`p-6 rounded-2xl border backdrop-blur-lg cursor-pointer ${themeClass}`}
                                style={{ transformOrigin: "center" }}
                            >
                                <div className="w-full h-48 bg-gray-800 rounded-lg mb-4 overflow-hidden relative">
                                    {article.thumbnail_url ? (
                                        <img src={article.thumbnail_url} alt="썸네일" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="absolute inset-0 flex items-center justify-center text-white/20">No Image</div>
                                    )}
                                </div>
                                <h2 className="text-2xl font-serif font-bold mb-2">{article.title}</h2>
                                <p className="opacity-70 text-sm line-clamp-2">{article.summary || "요약 내용 없음"}</p>
                                <div className="mt-4 text-xs opacity-40 text-right">
                                    {new Date(article.created_at).toLocaleDateString()}
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}