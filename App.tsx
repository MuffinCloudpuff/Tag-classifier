import React, { useState, useRef } from 'react';
import { TabItem, TabGroup } from './types';
import { GROUP_COLORS } from './constants';
import { organizeTabsWithGemini } from './services/geminiService';
import { TabList } from './components/TabList';
import { GroupGrid } from './components/GroupGrid';
import { VortexVisualizer } from './components/VortexVisualizer'; // Import new visualizer
import { Sparkles, Layers, ArrowRight, Copy, Check, Download, AlignLeft, ListTree, Network, Trash2, Sun, Moon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// --- State Machine Type Definition ---
// 'idle' = Initial state, showing input and list
// 'exploding' = UI is shattering/disappearing
// 'processing' = Vortex is spinning, waiting for API
// 'assembling' = API returned, vortex is forming columns
// 'results' = Final grid shown
type AppState = 'idle' | 'exploding' | 'processing' | 'assembling' | 'results';

// Helper function to recursively map API response to TabGroups
const mapResponseToGroups = (
  rawGroups: any[], 
  allTabs: TabItem[], 
  baseColorIndex: number = 0
): TabGroup[] => {
  return rawGroups.map((g, index) => {
    // Find direct tabs
    const groupTabs = (g.tabIds || [])
      .map((id: string) => allTabs.find(t => t.id === id))
      .filter((t: TabItem | undefined): t is TabItem => t !== undefined);
    
    // Recursive call for subgroups
    const subgroups = g.subgroups 
      ? mapResponseToGroups(g.subgroups, allTabs, baseColorIndex + index) 
      : [];

    return {
      groupName: g.groupName,
      emoji: g.emoji,
      tabs: groupTabs,
      subgroups: subgroups,
      color: GROUP_COLORS[(baseColorIndex + index) % GROUP_COLORS.length]
    };
  }).filter(g => g.tabs.length > 0 || (g.subgroups && g.subgroups.length > 0));
};

// Helper function to generate recursive HTML for bookmarks
const renderGroupToHtml = (group: TabGroup, date: number, indent: string = "    "): string => {
    let html = `${indent}<DT><H3 ADD_DATE="${date}" LAST_MODIFIED="${date}">${group.emoji} ${group.groupName}</H3>\n`;
    html += `${indent}<DL><p>\n`;
    
    // 1. Direct Tabs
    group.tabs.forEach(tab => {
        html += `${indent}    <DT><A HREF="${tab.url}" ADD_DATE="${date}">${tab.title}</A>\n`;
    });

    // 2. Subgroups
    if (group.subgroups) {
        group.subgroups.forEach(sub => {
            html += renderGroupToHtml(sub, date, indent + "    ");
        });
    }

    html += `${indent}</DL><p>\n`;
    return html;
};

const App: React.FC = () => {
  const [tabs, setTabs] = useState<TabItem[]>([]);
  const [inputText, setInputText] = useState('');
  
  // Theme State
  const [isDarkMode, setIsDarkMode] = useState(true);

  // New State Machine Logic
  const [appState, setAppState] = useState<AppState>('idle');
  
  const [organizedGroups, setOrganizedGroups] = useState<TabGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [depth, setDepth] = useState<number>(2); 
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClear = () => {
    setTabs([]);
    setOrganizedGroups(null);
    setInputText('');
    setError(null);
    setAppState('idle');
  };

  const handleRemoveTab = (id: string) => {
    setTabs(prev => prev.filter(t => t.id !== id));
  };

  const parseAndAddInput = () => {
    if (!inputText.trim()) return;

    const lines = inputText.split('\n');
    const newTabs: TabItem[] = [];
    
    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;

      let title = "未命名页面";
      let url = trimmed;

      if (trimmed.includes(' - http')) {
        const parts = trimmed.split(' - http');
        title = parts[0];
        url = 'http' + parts[1];
      } else if (trimmed.startsWith('http')) {
        url = trimmed;
        try {
            const u = new URL(trimmed);
            title = u.hostname;
        } catch {
            title = "外部链接";
        }
      }

      if (url.length > 3) {
        try {
            const domain = new URL(url).hostname.replace('www.', '');
            newTabs.push({
                id: crypto.randomUUID(),
                title: title.substring(0, 60),
                url,
                domain
            });
        } catch {
            // Invalid URL
        }
      }
    });

    setTabs(prev => {
        const existing = new Set(prev.map(t => t.url));
        const unique = newTabs.filter(t => !existing.has(t.url));
        return [...prev, ...unique];
    });
    setInputText('');
    setOrganizedGroups(null);
    setAppState('idle');
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setError(null);
    
    try {
        const readers = Array.from(files).map(file => {
            return new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target?.result as string);
                reader.onerror = reject;
                reader.readAsText(file as Blob);
            });
        });

        const contents = await Promise.all(readers);
        const parser = new DOMParser();
        const newTabs: TabItem[] = [];
        
        const currentUrls = new Set(tabs.map(t => t.url));
        const batchUrls = new Set<string>();

        contents.forEach(content => {
            const doc = parser.parseFromString(content, 'text/html');
            const links = Array.from(doc.querySelectorAll('a'));

            links.forEach(link => {
                const url = link.href;
                if (!url.startsWith('http')) return;
                
                if (currentUrls.has(url) || batchUrls.has(url)) return;

                let title = link.textContent || url;
                let domain = '未知域名';
                try {
                    const u = new URL(url);
                    domain = u.hostname.replace('www.', '');
                } catch {}

                newTabs.push({
                    id: crypto.randomUUID(),
                    title: title.substring(0, 60),
                    url,
                    domain
                });
                batchUrls.add(url);
            });
        });

        if (newTabs.length > 0) {
            setTabs(prev => [...prev, ...newTabs]);
            setOrganizedGroups(null);
            setAppState('idle');
        } else {
            setError("未在文件中找到新的链接，或所有链接已存在。");
        }

    } catch (err) {
        console.error(err);
        setError("读取或解析文件失败，请确保格式正确。");
    }

    if (fileInputRef.current) {
        fileInputRef.current.value = '';
    }
  };

  const handleOrganize = async () => {
    if (tabs.length === 0) return;
    
    // 1. Trigger Explosion Animation
    setAppState('exploding');
    setError(null);

    // 2. Wait for explosion to finish, then start processing (Vortex)
    setTimeout(async () => {
        setAppState('processing');
        
        try {
            // 3. Call API
            const response = await organizeTabsWithGemini(tabs, depth);
            const newGroups = mapResponseToGroups(response.groups, tabs);
            setOrganizedGroups(newGroups);
            
            // 4. Trigger Assembly Animation
            setAppState('assembling');
            
            // Note: transition to 'results' is handled by the visualizer callback

        } catch (err: any) {
            setError(err.message || "整理失败，请重试");
            setAppState('idle'); // Revert on error
        }
    }, 800); // 800ms match the exit animation duration
  };

  const handleAssemblyComplete = () => {
      setAppState('results');
  };

  const generateBookmarksHtml = (groups: TabGroup[]) => {
    const date = Math.floor(Date.now() / 1000);
    let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>\n`;

    html += `    <DT><H3 ADD_DATE="${date}" LAST_MODIFIED="${date}">AI 整理的收藏夹</H3>\n`;
    html += `    <DL><p>\n`;

    groups.forEach(group => {
        html += renderGroupToHtml(group, date, "        ");
    });

    html += `    </DL><p>\n`;
    html += `</DL><p>`;
    return html;
  };

  const handleExport = () => {
    if (!organizedGroups) return;
    const htmlContent = generateBookmarksHtml(organizedGroups);
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'smart_bookmarks_organized.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyEdgePath = () => {
    navigator.clipboard.writeText('edge://favorites');
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2500);
  };

  // --- Animation Variants for Shatter Effect ---
  const containerVariants = {
    idle: { opacity: 1, scale: 1, filter: "blur(0px)" },
    exploding: { 
        opacity: 0, 
        scale: 1.1, 
        filter: "blur(20px)",
        transition: { duration: 0.8, ease: "easeInOut" } 
    },
    results: { 
        opacity: 1, 
        scale: 1, 
        filter: "blur(0px)",
        transition: { duration: 1, ease: "easeOut" } // Slow re-entry
    }
  };

  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  return (
    <div className={`min-h-screen pb-20 font-sans overflow-x-hidden relative transition-colors duration-500 ${isDarkMode ? 'bg-black text-zinc-100 selection:bg-[#002FA7]/50' : 'bg-[#f5f5f7] text-zinc-900 selection:bg-blue-200'}`}>
      
      {/* Dynamic Background Gradients */}
      {isDarkMode ? (
        <>
            <div className="fixed top-[-10%] left-[-10%] w-[600px] h-[600px] bg-[#002FA7]/20 rounded-full blur-[120px] pointer-events-none opacity-50"></div>
            <div className="fixed bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-[#001f70]/20 rounded-full blur-[120px] pointer-events-none opacity-40"></div>
        </>
      ) : (
        <>
            <div className="fixed top-[-10%] left-[-10%] w-[600px] h-[600px] bg-blue-400/20 rounded-full blur-[120px] pointer-events-none opacity-40"></div>
            <div className="fixed bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-purple-400/20 rounded-full blur-[120px] pointer-events-none opacity-30"></div>
        </>
      )}

      {/* VORTEX VISUALIZER (Background Layer) */}
      <AnimatePresence>
        {(appState === 'processing' || appState === 'assembling') && (
            <VortexVisualizer 
                tabs={tabs} 
                organizedGroups={organizedGroups}
                onAssemblyComplete={handleAssemblyComplete}
                isDarkMode={isDarkMode}
            />
        )}
      </AnimatePresence>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 relative z-10">
        
        {/* Theme Toggle Button */}
        <div className="absolute top-6 right-6 z-50">
            <button
                onClick={toggleTheme}
                className={`p-2.5 rounded-full backdrop-blur-md transition-all duration-300 shadow-lg ${
                    isDarkMode 
                    ? 'bg-white/10 text-zinc-200 hover:bg-white/20 shadow-white/5 border border-white/10' 
                    : 'bg-white/80 text-zinc-700 hover:bg-white shadow-black/5 border border-black/5'
                }`}
            >
                {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
        </div>

        {/* SHATTER CONTAINER: Header & Input */}
        <motion.div
            variants={containerVariants}
            initial="idle"
            animate={appState === 'processing' || appState === 'assembling' || appState === 'exploding' ? 'exploding' : appState === 'results' ? 'results' : 'idle'}
        >
            {/* Header Section */}
            <div className="flex flex-col items-center justify-center text-center mb-16 space-y-6">
            <motion.div 
                className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full backdrop-blur-md text-xs font-medium mb-2 shadow-lg transition-colors duration-300 ${
                    isDarkMode 
                    ? 'bg-white/5 border border-white/10 text-zinc-300 shadow-black/20' 
                    : 'bg-white/60 border border-black/5 text-zinc-600 shadow-black/5'
                }`}
            >
                <Sparkles size={12} className="text-[#2c5bf5]" />
                <span>AI 驱动的智能多级标签整理</span>
            </motion.div>
            
            <h1 className={`text-5xl md:text-7xl font-bold tracking-tight pb-2 drop-shadow-sm transition-colors duration-300 ${isDarkMode ? 'bg-gradient-to-b from-white via-white to-white/50 bg-clip-text text-transparent' : 'text-zinc-900'}`}>
                让收藏夹井井有条
            </h1>
            
            <p className={`text-lg md:text-xl max-w-2xl font-light leading-relaxed transition-colors duration-300 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                批量导入收藏夹文件，AI 自动构建二级、三级分类目录。<br className="hidden md:block"/>
                告别混乱，找回专注。
            </p>
            </div>

            {/* Main Input Card */}
            <div className="max-w-3xl mx-auto space-y-6 relative">
            <div className="relative group rounded-3xl overflow-hidden">
                <div className={`absolute -inset-[1px] bg-gradient-to-br transition-opacity duration-300 ${isDarkMode ? 'from-white/10 to-transparent opacity-50' : 'from-black/5 to-transparent opacity-30'} rounded-3xl pointer-events-none z-20`}></div>
                
                <div className={`relative backdrop-blur-3xl rounded-3xl border transition-colors duration-300 shadow-2xl ${
                    isDarkMode 
                    ? 'bg-[#0a0a0a]/60 border-white/5 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.5)]' 
                    : 'bg-white/60 border-white/40 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.1)]'
                }`}>
                
                {/* Toolbar */}
                <div className={`p-4 sm:p-5 border-b flex flex-col sm:flex-row items-stretch sm:items-center gap-4 transition-colors duration-300 ${
                    isDarkMode ? 'border-white/5 bg-black/10' : 'border-black/5 bg-white/40'
                }`}>
                    <input 
                        type="file" 
                        ref={fileInputRef}
                        onChange={handleFileUpload} 
                        accept=".html"
                        multiple 
                        className="hidden" 
                    />
                    
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="flex-1 flex items-center justify-center gap-2.5 px-4 py-3.5 rounded-2xl
                                bg-[#002FA7]
                                backdrop-blur-xl border border-white/10
                                text-white font-semibold tracking-wide
                                shadow-[0_8px_30px_rgba(0,47,167,0.3)]
                                hover:shadow-[0_12px_40px_rgba(0,47,167,0.5)]
                                hover:bg-[#0038ca] hover:-translate-y-0.5
                                active:scale-[0.98] active:translate-y-0
                                transition-all duration-300 group/btn relative overflow-hidden"
                    >
                    <div className="absolute inset-0 bg-gradient-to-t from-transparent to-white/20 opacity-0 group-hover/btn:opacity-100 transition-opacity" />
                    <div className="relative flex items-center gap-2">
                        <Layers size={18} className="drop-shadow-sm" />
                        <span className="drop-shadow-sm">批量导入 HTML</span>
                    </div>
                    </button>
                    
                    <button 
                        onClick={copyEdgePath}
                        className={`flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-2xl
                                backdrop-blur-xl border 
                                font-medium 
                                shadow-lg 
                                hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-0
                                transition-all duration-300 min-w-[200px] ${
                                    isDarkMode 
                                    ? 'bg-white/5 hover:bg-white/10 border-white/10 text-zinc-300 hover:text-white shadow-black/20 hover:shadow-black/40' 
                                    : 'bg-white/40 hover:bg-white/60 border-white/30 text-zinc-600 hover:text-zinc-900 shadow-black/5 hover:shadow-black/10'
                                }`}
                    >
                    {copySuccess ? (
                        <>
                            <Check size={18} className="text-green-500" />
                            <span className="text-green-600">已复制链接</span>
                        </>
                    ) : (
                        <>
                            <Copy size={18} />
                            <span>复制 Edge 导出路径</span>
                        </>
                    )}
                    </button>
                </div>

                {/* Text Area */}
                <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="或者直接在此粘贴网址 (URL)，AI 将自动合并处理..."
                    className={`w-full bg-transparent p-5 sm:p-6 min-h-[100px] max-h-[200px] focus:outline-none resize-none text-[15px] font-light tracking-wide leading-relaxed transition-colors duration-300 ${
                        isDarkMode ? 'text-white placeholder-zinc-500/70' : 'text-zinc-900 placeholder-zinc-400'
                    }`}
                />
                
                {/* Depth Selection */}
                <div className={`px-4 py-3 border-t flex flex-col sm:flex-row justify-between items-center gap-4 transition-colors duration-300 ${
                    isDarkMode ? 'bg-black/20 border-white/5' : 'bg-white/30 border-black/5'
                }`}>
                    <div className="flex items-center gap-3">
                        <span className={`text-xs font-medium uppercase tracking-wider transition-colors ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>分类层级</span>
                        <div className={`flex rounded-lg p-0.5 border transition-colors ${isDarkMode ? 'bg-white/5 border-white/5' : 'bg-black/5 border-black/5'}`}>
                            {[1, 2, 3].map((d) => (
                                <button 
                                    key={d}
                                    onClick={() => setDepth(d)}
                                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                                        depth === d 
                                        ? 'bg-[#002FA7] text-white shadow-sm' 
                                        : isDarkMode 
                                            ? 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5' 
                                            : 'text-zinc-500 hover:text-zinc-800 hover:bg-black/5'
                                    }`}
                                >
                                    {d === 1 && <AlignLeft size={14} className="inline mr-1.5 mb-0.5" />}
                                    {d === 2 && <ListTree size={14} className="inline mr-1.5 mb-0.5" />}
                                    {d === 3 && <Network size={14} className="inline mr-1.5 mb-0.5" />}
                                    {d === 1 ? '一级' : d === 2 ? '二级' : '三级'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {inputText.trim() && (
                        <button 
                        onClick={parseAndAddInput}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all ml-auto ${
                            isDarkMode 
                            ? 'bg-white/10 text-white hover:bg-white/20' 
                            : 'bg-black/10 text-zinc-900 hover:bg-black/20'
                        }`}
                        >
                        添加链接 <ArrowRight size={12} />
                        </button>
                    )}
                </div>
                </div>
            </div>

            <div className="flex justify-center gap-6 mt-6">
                {tabs.length > 0 && (
                <button 
                    onClick={handleClear}
                    className="text-xs text-zinc-500 hover:text-red-400 transition-colors flex items-center gap-1.5"
                >
                    <Trash2 size={12} />
                    清空列表
                </button>
                )}
            </div>
            </div>
        </motion.div>

        {/* Error Message */}
        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              className="max-w-md mx-auto mt-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 backdrop-blur-md text-red-400 text-sm text-center shadow-lg relative z-50"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content Area */}
        <div className="mt-16 min-h-[400px]">
          {/* Note: Vortex is rendered in background. We just show Grid or List here. */}
          
          {appState === 'results' && organizedGroups ? (
            <GroupGrid groups={organizedGroups} delay={0.2} isDarkMode={isDarkMode} />
          ) : (
             /* Only show tab list if we are idle or just starting to explode */
             (appState === 'idle' || appState === 'exploding') && (
                <motion.div 
                    variants={containerVariants}
                    initial="idle"
                    animate={appState === 'exploding' ? 'exploding' : 'idle'}
                    className="flex justify-center"
                >
                    <div className="w-full max-w-2xl">
                        <TabList tabs={tabs} onRemoveTab={handleRemoveTab} isDarkMode={isDarkMode} />
                    </div>
                </motion.div>
             )
          )}
        </div>

        {/* Bottom Floating Action Buttons */}
        <AnimatePresence>
          {appState === 'idle' && tabs.length > 0 && (
            <motion.div 
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="fixed bottom-10 left-0 right-0 flex justify-center z-40 pointer-events-none"
            >
              <button
                onClick={handleOrganize}
                className="pointer-events-auto shadow-[0_0_40px_-10px_rgba(0,47,167,0.6)] flex items-center gap-3 px-8 py-4 bg-[#002FA7] text-white rounded-full font-semibold text-lg transition-all transform hover:scale-105 hover:bg-[#0038ca] active:scale-95 tracking-tight"
              >
                <Sparkles size={20} className="text-white fill-white/20" />
                开始 AI 分类 ({depth}级)
              </button>
            </motion.div>
          )}

           {appState === 'results' && organizedGroups && organizedGroups.length > 0 && (
            <motion.div 
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="fixed bottom-10 left-0 right-0 flex justify-center z-40 pointer-events-none"
            >
              <button
                onClick={handleExport}
                className="pointer-events-auto shadow-[0_0_40px_-10px_rgba(16,185,129,0.4)] flex items-center gap-3 px-8 py-4 bg-emerald-600/90 text-white rounded-full font-semibold text-lg transition-all transform hover:scale-105 hover:bg-emerald-500 backdrop-blur-md active:scale-95 tracking-tight border border-white/10"
              >
                <Download size={20} className="text-white" />
                导出整理后的收藏夹
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default App;