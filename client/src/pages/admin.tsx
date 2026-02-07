// client/src/pages/admin.tsx
import React, { useEffect, useState } from 'react';
import { DBService } from '@/services/DBService';
import { useLocation } from "wouter";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Users, FileText, CheckCircle, Clock, ArrowLeft, Download, RefreshCw } from 'lucide-react';

export default function AdminPage() {
  const [articles, setArticles] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [, setLocation] = useLocation();

  const fetchData = async () => {
    try {
      setLoading(true);
      const [articlesData, statsData] = await Promise.all([
        DBService.getAdminDashboardData(),
        DBService.getAdminStats()
      ]);
      setArticles(articlesData || []);
      setStats(statsData);
    } catch (error) {
      console.error(error);
      alert("데이터를 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDeploy = async (genId: number, currentText: string) => {
    if (!confirm("이 내용을 배포(Deployed) 상태로 변경하시겠습니까?")) return;
    try {
      await DBService.updateGeneratedContent(genId, currentText, 'deployed');
      alert("배포되었습니다!");
      fetchData(); // 새로고침
    } catch (e) {
      alert("배포 실패");
    }
  };

  // --- External News Fetching ---
  const [crawling, setCrawling] = useState(false);
  const handleManualUpdateConfirmed = async () => {
    setCrawling(true);
    try {
      const res = await fetch("/api/admin/news/fetch", { method: "POST" });
      const result = await res.json();

      if (res.ok) {
        alert(`완료!\n- 저장됨: ${result.stats.saved}건\n- 중복패스: ${result.stats.skipped}건\n- 실패: ${result.stats.failed}건`);
        fetchData(); // Refresh list
      } else {
        alert("업데이트 중 오류가 발생했습니다: " + result.error);
      }
    } catch (e) {
      console.error(e);
      alert("서버 연결 실패");
    } finally {
      setCrawling(false);
    }
  };

  // --- Export Functions ---
  const exportToExcel = () => {
    const dataToExport = articles.map(item => ({
      ID: item.id,
      Emotion: item.emotions?.label,
      Title: item.title,
      Author: item.profiles?.email,
      Date: new Date(item.created_at).toLocaleDateString(),
      Generated_Content: item.generated_contents?.[0]?.generated_text || 'N/A',
      Status: item.generated_contents?.[0]?.deploy_status || 'pending'
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "AdminData");
    XLSX.writeFile(wb, "human-pulse-admin-data.xlsx");
  };

  const exportToPDF = () => {
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text("Human Pulse AI - Admin Report", 14, 22);
    doc.setFontSize(11);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 30);

    const tableData = articles.map(item => [
      item.id,
      item.emotions?.label || '-',
      item.title,
      item.profiles?.email || 'Unknown',
      item.generated_contents?.[0]?.deploy_status || 'pending'
    ]);

    autoTable(doc, {
      head: [['ID', 'Emotion', 'Title', 'Author', 'Status']],
      body: tableData,
      startY: 40,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [66, 66, 66] }
    });

    doc.save("human-pulse-admin-report.pdf");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-lg font-semibold text-gray-600 animate-pulse">
          데이터 분석 중...
        </div>
      </div>
    );
  }

  // --- Chart Data Preparation ---
  // Sentiment Distribution (for Pie Chart)
  const sentimentData = stats?.emotionStats?.map((s: any) => ({
    name: s.emotion.charAt(0).toUpperCase() + s.emotion.slice(1),
    value: s.count,
    color: getEmotionColor(s.emotion)
  })) || [];

  // Recent Activity (Mock data structure for Bar Chart if not fully available, 
  // currently mapping top articles views just as an example visualization)
  const topArticles = stats?.topArticles?.map((a: any) => ({
    name: a.title.length > 10 ? a.title.substring(0, 10) + '...' : a.title,
    views: a.views || 0,
    saves: a.saves || 0
  })) || [];

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
        <div>
          <button
            onClick={() => setLocation("/")}
            className="flex items-center text-gray-500 hover:text-gray-800 transition-colors mb-2 group"
          >
            <ArrowLeft className="w-5 h-5 mr-1 group-hover:-translate-x-1 transition-transform" />
            <span className="font-medium">Back to Home</span>
          </button>
          <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">Admin Dashboard</h1>
          <p className="text-gray-500 mt-2">Human Pulse AI 콘텐츠 관리 및 통계</p>
        </div>
        <div className="flex space-x-3 mt-4 md:mt-0">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                disabled={crawling}
                className={`flex items-center px-4 py-2 rounded-lg shadow-sm transition text-sm font-medium text-white ${crawling ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'
                  }`}
              >
                {crawling ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    뉴스 수집 중...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    최신 뉴스 즉시 수집
                  </>
                )}
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>뉴스 수집 시작</AlertDialogTitle>
                <AlertDialogDescription>
                  지금 즉시 최신 뉴스를 가져오시겠습니까? (약 10~20초 소요)
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>취소</AlertDialogCancel>
                <AlertDialogAction onClick={handleManualUpdateConfirmed}>확인</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <button
            onClick={exportToExcel}
            className="flex items-center bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow-sm transition text-sm font-medium"
          >
            <Download className="w-4 h-4 mr-2" />
            Excel
          </button>
          <button
            onClick={exportToPDF}
            className="flex items-center bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg shadow-sm transition text-sm font-medium"
          >
            <Download className="w-4 h-4 mr-2" />
            PDF
          </button>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Views"
          value={stats?.stats?.totalViews?.toLocaleString() || '0'}
          icon={<Users className="w-6 h-6 text-blue-600" />}
          bgColor="bg-blue-50"
        />
        <StatCard
          title="Articles Published"
          value={stats?.stats?.articlesPublished?.toLocaleString() || '0'}
          icon={<FileText className="w-6 h-6 text-indigo-600" />}
          bgColor="bg-indigo-50"
        />
        <StatCard
          title="Content Deployed"
          // Calculate deployed count from articles list as an approximation or use real stats if added
          value={articles.filter(a => a.generated_contents?.[0]?.deploy_status === 'deployed').length.toString()}
          icon={<CheckCircle className="w-6 h-6 text-green-600" />}
          bgColor="bg-green-50"
        />
        <StatCard
          title="Pending Review"
          value={articles.filter(a => a.generated_contents?.[0]?.deploy_status !== 'deployed').length.toString()}
          icon={<Clock className="w-6 h-6 text-yellow-600" />}
          bgColor="bg-yellow-50"
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Sentiment Distribution */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-800 mb-6">Sentiment Distribution</h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sentimentData}
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={120}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {sentimentData.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip />
                <Legend verticalAlign="bottom" height={36} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Articles Performance */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-800 mb-6">Top Articles Performance</h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topArticles} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={100} style={{ fontSize: '12px' }} />
                <RechartsTooltip />
                <Legend />
                <Bar dataKey="views" fill="#8884d8" radius={[0, 4, 4, 0]} name="Views" />
                <Bar dataKey="saves" fill="#82ca9d" radius={[0, 4, 4, 0]} name="Saves" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Content Management Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-800">Content Management</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50/50">
              <tr>
                <th className="py-4 px-6 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="py-4 px-6 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Emotion</th>
                <th className="py-4 px-6 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Content Info</th>
                <th className="py-4 px-6 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Generated Content</th>
                <th className="py-4 px-6 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {articles.map((item) => {
                const genContent = item.generated_contents?.[0];
                const isDeployed = genContent?.deploy_status === 'deployed';

                return (
                  <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="py-4 px-6">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${isDeployed
                        ? 'bg-green-100 text-green-800'
                        : 'bg-yellow-100 text-yellow-800'
                        }`}>
                        {isDeployed ? 'Deployed' : 'Pending'}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <span
                        className="px-2 py-1 rounded-md text-xs font-bold text-white shadow-sm"
                        style={{ backgroundColor: getEmotionColor(item.emotions?.label || 'default') }}
                      >
                        {item.emotions?.label?.toUpperCase() || '-'}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex flex-col">
                        <span className="font-semibold text-gray-900 line-clamp-1">{item.title}</span>
                        <span className="text-xs text-gray-400 mt-1">{item.profiles?.email}</span>
                        <span className="text-xs text-gray-300">{new Date(item.created_at).toLocaleDateString()}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      {genContent ? (
                        <div className="max-w-xs relative group cursor-pointer">
                          <p className="text-sm text-gray-600 line-clamp-2">{genContent.generated_text}</p>
                          {/* Hover tooltip for full text could be added here */}
                        </div>
                      ) : (
                        <span className="text-gray-400 text-sm italic">No content generated</span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-center">
                      {genContent && !isDeployed && (
                        <button
                          onClick={() => handleDeploy(genContent.id, genContent.generated_text)}
                          className="w-full bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-indigo-700 transition shadow-sm hover:shadow-md"
                        >
                          Approve Deploy
                        </button>
                      )}
                      {isDeployed && (
                        <span className="text-xs text-gray-400 font-medium">Completed</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// --- Helper Components & Functions ---

function StatCard({ title, value, icon, bgColor }: any) {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center space-x-4 transition-transform hover:-translate-y-1">
      <div className={`p-3 rounded-xl ${bgColor}`}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

function getEmotionColor(emotion: string): string {
  const colors: Record<string, string> = {
    joy: '#FFD700',      // Gold/Yellow
    anger: '#FF4D4D',    // Red
    sadness: '#4D96FF',  // Blue
    fear: '#8E44AD',     // Purple
    calm: '#2ECC71',     // Green
    default: '#95A5A6'
  };
  return colors[emotion?.toLowerCase()] || colors.default;
}