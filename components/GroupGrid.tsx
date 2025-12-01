import React, { useState } from 'react';
import { TabGroup, TabItem } from '../types';
import { motion } from 'framer-motion';
import { Globe } from 'lucide-react';

interface GroupGridProps {
  groups: TabGroup[];
  delay?: number;
  isDarkMode: boolean;
}

const TabItemLink = ({ tab, isDarkMode }: { tab: TabItem, isDarkMode: boolean }) => {
  const [hasError, setHasError] = useState(false);

  return (
    <a 
      href={tab.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center group p-3 rounded-xl transition-all duration-200 cursor-default ${
          isDarkMode 
          ? 'hover:bg-white/10' 
          : 'hover:bg-black/5'
      }`}
    >
      <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center mr-4 border overflow-hidden transition-colors ${
          isDarkMode 
          ? 'bg-zinc-800 text-zinc-400 border-white/5' 
          : 'bg-white text-zinc-500 border-black/5 shadow-sm'
      }`}>
        {!hasError ? (
            <img 
                src={`https://www.google.com/s2/favicons?domain=${tab.domain}&sz=64`}
                alt=""
                className="w-5 h-5 opacity-90 rounded-sm"
                onError={() => setHasError(true)}
            />
        ) : (
            <Globe size={16} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-[15px] font-medium truncate leading-snug ${isDarkMode ? 'text-zinc-200' : 'text-zinc-800'}`}>
          {tab.title}
        </div>
        <div className={`text-[13px] truncate leading-snug opacity-60 ${isDarkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>
          {tab.url}
        </div>
      </div>
    </a>
  );
};

interface SubGroupProps {
  group: TabGroup;
  depth?: number;
  isDarkMode: boolean;
}

const SubGroupNode: React.FC<SubGroupProps> = ({ group, depth = 0, isDarkMode }) => {
  if (group.tabs.length === 0 && (!group.subgroups || group.subgroups.length === 0)) return null;

  // Visual styling based on depth and theme
  // We use subtle borders for hierarchy without adding heavy backgrounds
  const textClass = isDarkMode ? 'text-zinc-400' : 'text-zinc-500';

  // Modified depth styles to remove borders and indentation as requested
  const depthStyles = {
    0: '', 
    1: 'mt-4', 
    2: 'mt-3', 
    3: 'mt-2 opacity-80', 
  };
  
  const currentDepthStyle = depthStyles[depth as keyof typeof depthStyles] || depthStyles[3];

  return (
    <div className={`flex flex-col ${depth > 0 ? currentDepthStyle : ''}`}>
      {/* Group Header */}
      {depth > 0 && (
        <div className="flex items-center gap-2 mb-2 px-3">
           <span className="text-sm opacity-80">{group.emoji}</span>
           <span className={`font-semibold ${textClass} ${depth === 1 ? 'text-sm uppercase tracking-wider' : 'text-xs'}`}>
             {group.groupName}
           </span>
        </div>
      )}

      {/* Tabs in this group */}
      {group.tabs.length > 0 && (
        <ul className="space-y-0.5 mb-2">
          {group.tabs.map((tab) => (
            <li key={tab.id}>
              <TabItemLink tab={tab} isDarkMode={isDarkMode} />
            </li>
          ))}
        </ul>
      )}

      {/* Recursive Subgroups */}
      {group.subgroups && group.subgroups.length > 0 && (
        <div className="space-y-1">
          {group.subgroups.map((sub) => (
            <SubGroupNode key={sub.groupName} group={sub} depth={depth + 1} isDarkMode={isDarkMode} />
          ))}
        </div>
      )}
    </div>
  );
};

export const GroupGrid: React.FC<GroupGridProps> = ({ groups, delay = 0, isDarkMode }) => {
  if (!groups || groups.length === 0) return null;

  // Extremely subtle header backgrounds to match the glass vibe
  const getColorClasses = (color: string) => {
    const map: Record<string, { bg: string, text: string }> = {
      blue:   { bg: isDarkMode ? 'bg-blue-500/10' : 'bg-blue-500/5',   text: isDarkMode ? 'text-blue-400' : 'text-blue-600' },
      green:  { bg: isDarkMode ? 'bg-green-500/10' : 'bg-green-500/5',  text: isDarkMode ? 'text-green-400' : 'text-green-600' },
      indigo: { bg: isDarkMode ? 'bg-indigo-500/10' : 'bg-indigo-500/5', text: isDarkMode ? 'text-indigo-400' : 'text-indigo-600' },
      orange: { bg: isDarkMode ? 'bg-orange-500/10' : 'bg-orange-500/5', text: isDarkMode ? 'text-orange-400' : 'text-orange-600' },
      pink:   { bg: isDarkMode ? 'bg-pink-500/10' : 'bg-pink-500/5',   text: isDarkMode ? 'text-pink-400' : 'text-pink-600' },
      purple: { bg: isDarkMode ? 'bg-purple-500/10' : 'bg-purple-500/5', text: isDarkMode ? 'text-purple-400' : 'text-purple-600' },
      red:    { bg: isDarkMode ? 'bg-red-500/10' : 'bg-red-500/5',    text: isDarkMode ? 'text-red-400' : 'text-red-600' },
      teal:   { bg: isDarkMode ? 'bg-teal-500/10' : 'bg-teal-500/5',   text: isDarkMode ? 'text-teal-400' : 'text-teal-600' },
    };
    return map[color] || map['blue'];
  };

  const countTabsInGroup = (g: TabGroup): number => {
    let count = g.tabs.length;
    if (g.subgroups) {
      g.subgroups.forEach(sub => count += countTabsInGroup(sub));
    }
    return count;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-20 relative z-10">
      {groups.map((group, index) => {
        const theme = getColorClasses(group.color);
        const totalTabs = countTabsInGroup(group);
        
        return (
          <motion.div
            key={group.groupName}
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ 
                duration: 0.6, 
                delay: delay + (index * 0.05),
                ease: [0.2, 0.8, 0.2, 1] 
            }}
            className="flex flex-col group relative"
          >
            <div className={`
              h-full flex flex-col
              rounded-2xl backdrop-blur-xl
              border shadow-sm
              overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1
              ${isDarkMode 
                ? 'bg-zinc-900/60 border-white/5 shadow-black/20' 
                : 'bg-white/60 border-black/5 shadow-black/5'}
            `}>
              {/* Header */}
              <div className={`px-5 py-4 border-b flex justify-between items-center transition-colors ${theme.bg} ${isDarkMode ? 'border-white/5' : 'border-black/5'}`}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl drop-shadow-sm filter">{group.emoji}</span>
                  <h3 className={`font-semibold text-lg ${theme.text} tracking-tight`}>{group.groupName}</h3>
                </div>
                <div className={`backdrop-blur-md rounded-full px-2.5 py-1 min-w-[24px] text-center border ${
                    isDarkMode 
                    ? 'bg-black/20 text-white/60 border-white/5' 
                    : 'bg-white/40 text-black/50 border-black/5'
                }`}>
                  <span className="text-xs font-semibold">
                    {totalTabs}
                  </span>
                </div>
              </div>

              {/* Recursive List */}
              <div className="flex-1 p-2 overflow-y-auto max-h-[500px] min-h-[140px]">
                 <SubGroupNode group={group} depth={0} isDarkMode={isDarkMode} />
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};
