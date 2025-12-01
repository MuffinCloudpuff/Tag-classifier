import React from 'react';
import { TabItem } from '../types';
import { X, Globe } from 'lucide-react';

interface TabListProps {
  tabs: TabItem[];
  onRemoveTab: (id: string) => void;
  isDarkMode: boolean;
}

export const TabList: React.FC<TabListProps> = ({ tabs, onRemoveTab, isDarkMode }) => {
  if (tabs.length === 0) return null;

  return (
    <div className="mt-8 w-full">
      <h3 className={`text-xs font-medium uppercase tracking-wider mb-4 px-2 ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>
        待整理清单 ({tabs.length})
      </h3>
      <div className={`backdrop-blur-xl rounded-2xl border overflow-hidden shadow-sm transition-colors duration-300 ${
          isDarkMode 
          ? 'bg-zinc-900/60 border-white/5' 
          : 'bg-white/60 border-black/5'
      }`}>
        <div className="p-2 space-y-1">
          {tabs.map((tab) => (
            <div 
              key={tab.id}
              className={`flex items-center group p-3 rounded-xl transition-colors duration-200 cursor-default ${
                  isDarkMode 
                  ? 'hover:bg-white/10' 
                  : 'hover:bg-black/5'
              }`}
            >
              <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center mr-4 border ${
                  isDarkMode 
                  ? 'bg-zinc-800 text-zinc-400 border-white/5' 
                  : 'bg-white text-zinc-500 border-black/5 shadow-sm'
              }`}>
                <Globe size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-[15px] font-medium truncate leading-snug ${isDarkMode ? 'text-zinc-200' : 'text-zinc-800'}`}>
                  {tab.title || tab.url}
                </div>
                <div className={`text-[13px] truncate leading-snug ${isDarkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>
                  {tab.url}
                </div>
              </div>
              <button 
                onClick={() => onRemoveTab(tab.id)}
                className={`opacity-0 group-hover:opacity-100 p-2 rounded-full transition-all ${
                    isDarkMode 
                    ? 'text-zinc-500 hover:text-red-400 hover:bg-red-500/10' 
                    : 'text-zinc-400 hover:text-red-600 hover:bg-red-500/10'
                }`}
                aria-label="移除标签"
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};