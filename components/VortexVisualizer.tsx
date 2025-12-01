import React, { useEffect, useState, useRef, useMemo } from 'react';
import { TabItem, TabGroup } from '../types';
import { Globe, Settings, ChevronUp, RotateCcw, Copy, Check } from 'lucide-react';

interface VortexVisualizerProps {
  tabs: TabItem[];
  organizedGroups: TabGroup[] | null;
  onAssemblyComplete: () => void;
  isDarkMode: boolean;
}

// Particle represents a single tab in 3D space
interface ParticleData {
  id: string;
  // Orbit Parameters (The "Ideal" Tornado Position)
  orbitAngle: number;
  orbitHeight: number;
  orbitRadiusNoise: number;
  orbitSpeedOffset: number;
  
  // Current Physics State (Actual Position)
  x: number;
  y: number;
  z: number;
  
  // Rotation State
  rotX: number;
  rotY: number;
  rotZ: number;
  rotSpeedX: number;
  rotSpeedY: number;
  rotSpeedZ: number;
  
  // Data
  title: string;
  domain: string;
  url: string;

  // Entry Animation State
  entryProgress: number; // 0 to 1
  entrySpeed: number;
  
  // Assembly State
  targetX?: number;
  targetY?: number;
}

// Developer Config Type
interface VisualizerConfig {
  baseSpeed: number;
  tornadoX: number;
  radiusMultiplier: number;
  verticalSpread: number;
  wobbleStrength: number;
}

const DEFAULT_CONFIG: VisualizerConfig = {
  baseSpeed: 0.01,
  tornadoX: -120,
  radiusMultiplier: 1.3,
  verticalSpread: 1000,
  wobbleStrength: 0.2
};

// --- Helper Component for Smooth Sliders ---
// Decouples UI updates from heavy React state updates
const ConfigSlider = ({ 
  label, 
  value, 
  onChange, 
  onImmediateChange,
  min, 
  max, 
  step, 
  unit,
  isDarkMode
}: {
  label: string;
  value: number;
  onChange: (val: number) => void;
  onImmediateChange: (val: number) => void;
  min: number;
  max: number;
  step: number;
  unit?: string;
  isDarkMode: boolean;
}) => {
  const [localVal, setLocalVal] = useState(value);
  const timeoutRef = useRef<number | null>(null);

  // Sync if parent value changes externally (e.g. Reset button)
  useEffect(() => {
    setLocalVal(value);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = parseFloat(e.target.value);
    setLocalVal(newVal); // Instant UI update
    onImmediateChange(newVal); // Instant Physics update (via Ref)

    // Debounce the heavy React state update
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      onChange(newVal);
    }, 200); // Increased debounce to 200ms to be safe
  };

  return (
    <div 
      className="space-y-2 select-none relative z-50" 
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className={`flex justify-between text-[11px] font-medium tracking-wide ${isDarkMode ? 'text-zinc-300' : 'text-zinc-600'}`}>
        <span>{label}</span>
        <span className={`font-mono ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>
          {localVal.toFixed(step < 0.1 ? 2 : 1)}{unit || ''}
        </span>
      </div>
      <input 
        type="range" 
        min={min} max={max} step={step}
        value={localVal}
        onChange={handleChange}
        // touch-action-none prevents scrolling while dragging on touch devices
        className={`w-full h-2 rounded-lg appearance-none cursor-pointer transition-colors touch-none ${isDarkMode ? 'bg-zinc-700 hover:bg-zinc-600' : 'bg-zinc-200 hover:bg-zinc-300'}`}
        style={{ touchAction: 'none' }}
      />
    </div>
  );
};

export const VortexVisualizer: React.FC<VortexVisualizerProps> = ({ 
  tabs, 
  organizedGroups, 
  onAssemblyComplete,
  isDarkMode
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number | null>(null);
  
  // Developer Controls State
  const [showDevTools, setShowDevTools] = useState(false);
  const [copied, setCopied] = useState(false);
  
  // Initialize config
  const [config, setConfig] = useState<VisualizerConfig>(() => {
    try {
      const saved = localStorage.getItem('vortex_config');
      if (saved) return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
    } catch (e) {
      console.warn("Failed to load vortex config", e);
    }
    return DEFAULT_CONFIG;
  });

  // Save to localStorage whenever React state settles
  useEffect(() => {
    localStorage.setItem('vortex_config', JSON.stringify(config));
  }, [config]);

  // Ref for animation loop to access latest config INSTANTLY without waiting for re-renders
  const configRef = useRef(config);
  
  // Keep ref in sync when state eventually updates
  useEffect(() => { configRef.current = config; }, [config]);

  // Update specific field in ref immediately
  const updateConfigRef = (key: keyof VisualizerConfig, val: number) => {
    configRef.current = { ...configRef.current, [key]: val };
  };

  // --- REFACTOR: Use Refs for Physics State instead of React State ---
  // This bypasses React Re-renders for 60fps performance
  const particlesRef = useRef<ParticleData[]>([]);
  const elementsRef = useRef<(HTMLDivElement | null)[]>([]);

  // Physics Global State (Refs for performance/inertia)
  const physics = useRef({
    userOffset: 0,   // -0.5 to 0.5
  });
  
  const [phase, setPhase] = useState<'suction' | 'storm' | 'assemble'>('suction');
  // We keep a state for the initial render list, but updates happen via Direct DOM
  const [renderList, setRenderList] = useState<ParticleData[]>([]);

  // Helper to copy config
  const handleCopyConfig = () => {
      navigator.clipboard.writeText(JSON.stringify(config, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
  };

  // 1. Initialize Particles (Run Once)
  useEffect(() => {
    // Limit visible particles for performance optimization
    // 120 is a safe limit for DOM-based 3D on average machines
    const displayTabs = tabs.length > 120 ? tabs.slice(0, 120) : tabs;
    
    const initialParticles: ParticleData[] = displayTabs.map((tab, i) => {
      const h = -1000 + Math.random() * 2000; 
      
      return {
        id: tab.id,
        orbitAngle: Math.random() * Math.PI * 2,
        orbitHeight: h,
        orbitRadiusNoise: Math.random() * 100,
        orbitSpeedOffset: 0.8 + Math.random() * 0.4,
        
        x: (Math.random() - 0.5) * 100,
        y: 1200 + Math.random() * 400,
        z: (Math.random() - 0.5) * 100,
        
        rotX: Math.random() * 360,
        rotY: Math.random() * 360,
        rotZ: Math.random() * 360,
        rotSpeedX: (Math.random() - 0.5) * 8,
        rotSpeedY: (Math.random() - 0.5) * 8,
        rotSpeedZ: (Math.random() - 0.5) * 8,

        title: tab.title,
        domain: tab.domain,
        url: tab.url,

        entryProgress: 0,
        entrySpeed: 0.01 + Math.random() * 0.04
      };
    });

    particlesRef.current = initialParticles;
    setRenderList(initialParticles); // Triggers the initial DOM render

    // Scroll Interaction
    const handleWheel = (e: WheelEvent) => {
      const direction = Math.sign(e.deltaY);
      
      // Step by exactly 0.1
      // Down (1) -> Increase offset -> Speed Up, Shrink
      // Up (-1) -> Decrease offset -> Slow Down, Expand
      let newVal = physics.current.userOffset + (direction * 0.1);
      
      // Strict Clamp -0.5 to 0.5
      // Floating point math fix
      newVal = Math.round(newVal * 10) / 10;
      
      if (newVal > 0.5) newVal = 0.5;
      if (newVal < -0.5) newVal = -0.5;
      
      physics.current.userOffset = newVal;
    };

    window.addEventListener('wheel', handleWheel, { passive: true });

    return () => {
      window.removeEventListener('wheel', handleWheel);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [tabs]);

  // 2. Phase Management
  useEffect(() => {
    const stormTimer = setTimeout(() => setPhase('storm'), 2500);

    if (organizedGroups) {
      const assembleTimer = setTimeout(() => {
        setPhase('assemble');
        setTimeout(onAssemblyComplete, 3000);
      }, 2500);
      return () => clearTimeout(assembleTimer);
    }
    return () => clearTimeout(stormTimer);
  }, [organizedGroups, onAssemblyComplete]);

  // Update styles of existing particles when theme changes
  useEffect(() => {
    // Force re-apply styles for light/dark mode
    elementsRef.current.forEach(el => {
        if (!el) return;
        el.style.backgroundColor = isDarkMode ? 'rgba(24, 24, 27, 0.85)' : 'rgba(255, 255, 255, 0.85)';
        el.style.color = isDarkMode ? '#f4f4f5' : '#18181b';
        el.style.borderColor = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';
        
        // Update globe icon color via querySelector since it's inside the inner HTML
        const iconDiv = el.querySelector('.icon-container') as HTMLElement;
        if (iconDiv) {
            iconDiv.style.backgroundColor = isDarkMode ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.05)';
            iconDiv.style.borderColor = isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)';
        }
    });
  }, [isDarkMode]);

  // 3. High Performance Animation Loop (Direct DOM)
  useEffect(() => {
    const animate = () => {
      const cfg = configRef.current;
      const userOffset = physics.current.userOffset;

      // Base is 1.0
      // Offset +0.5 => Speed 1.5, Zoom 0.5
      // Offset -0.5 => Speed 0.5, Zoom 1.5
      const effectiveSpeedMod = 1.0 + userOffset;
      const effectiveZoomMod = 1.0 - userOffset;

      // Elastic Decay of User Offset (Return to 0)
      if (Math.abs(physics.current.userOffset) > 0.01) {
          physics.current.userOffset = physics.current.userOffset * 0.98;
      } else {
          physics.current.userOffset = 0;
      }

      // Loop through mutable data array
      for (let i = 0; i < particlesRef.current.length; i++) {
        const p = particlesRef.current[i];
        const el = elementsRef.current[i];
        
        if (!el) continue;

        let nextX, nextY, nextZ;

        // --- PHYSICS CALCULATION ---
        
        p.orbitAngle += cfg.baseSpeed * p.orbitSpeedOffset * effectiveSpeedMod;

        const spreadOffset = cfg.verticalSpread / 2;
        const heightFactor = (p.orbitHeight + spreadOffset) / cfg.verticalSpread; 
        
        const baseRadius = 200 + (Math.pow(Math.abs(1 - heightFactor), 2) * 600); 
        const radius = (baseRadius + p.orbitRadiusNoise) * effectiveZoomMod * cfg.radiusMultiplier;

        const orbitX = cfg.tornadoX + Math.cos(p.orbitAngle) * radius;
        const orbitZ = Math.sin(p.orbitAngle) * radius + (Math.sin(p.orbitHeight * 0.01) * 50 * cfg.wobbleStrength);
        const orbitY = p.orbitHeight;

        if (phase === 'suction' || phase === 'storm') {
          if (p.entryProgress < 1) {
            p.entryProgress += p.entrySpeed;
            if (p.entryProgress > 1) p.entryProgress = 1;
            const ease = 1 - Math.pow(1 - p.entryProgress, 3);
            nextX = orbitX * ease; 
            nextZ = orbitZ * ease; 
            nextY = 1500 * (1 - ease) + orbitY * ease; 
          } else {
            nextX = orbitX;
            nextY = orbitY;
            nextZ = orbitZ;
          }

          const verticalSpeed = 2 * effectiveSpeedMod * cfg.baseSpeed * 10;
          p.orbitHeight -= verticalSpeed; 
          
          const bottomLimit = -cfg.verticalSpread / 2 - 200;
          const topLimit = cfg.verticalSpread / 2 + 200;

          if (p.orbitHeight < bottomLimit) {
               p.orbitHeight = topLimit;
               p.orbitRadiusNoise = Math.random() * 100;
          }

          const tumbleSpeed = effectiveSpeedMod * cfg.wobbleStrength;
          p.rotX += p.rotSpeedX * tumbleSpeed;
          p.rotY += p.rotSpeedY * tumbleSpeed;
          p.rotZ += p.rotSpeedZ * tumbleSpeed;

        } else {
          // == ASSEMBLY PHASE ==
          if (organizedGroups && p.targetX === undefined) {
              let groupIndex = -1;
              let indexInGroup = 0;
              
              const topGroupIndex = organizedGroups.findIndex(g => {
                  const hasId = (grp: TabGroup): boolean => {
                      return grp.tabs.some(t => t.id === p.id) || (grp.subgroups || []).some(hasId);
                  };
                  return hasId(g);
              });

              if (topGroupIndex !== -1) {
                  groupIndex = topGroupIndex;
                   indexInGroup = p.id.charCodeAt(0) % 8; 
              } else {
                  groupIndex = organizedGroups.length; 
              }

              const colWidth = 320;
              const totalW = organizedGroups.length * colWidth;
              const startX = -totalW / 2 + colWidth / 2;
              
              p.targetX = startX + (groupIndex * colWidth);
              p.targetY = -200 + (indexInGroup * 60) + (Math.random() * 30); 
          }

          const targetX = p.targetX || 0;
          const targetY = p.targetY || 0;
          const targetZ = 0;

          const lerpFactor = 0.08;
          nextX = p.x + (targetX - p.x) * lerpFactor;
          nextY = p.y + (targetY - p.y) * lerpFactor;
          nextZ = p.z + (targetZ - p.z) * lerpFactor;

          p.rotX = p.rotX * 0.9; 
          p.rotY = p.rotY * 0.9;
          p.rotZ = p.rotZ * 0.9;
        }

        // Update Physics State
        p.x = nextX;
        p.y = nextY;
        p.z = nextZ;

        // --- DIRECT DOM UPDATE ---
        
        // Z-Index Sorting Optimization
        // Map depth to a safe integer range. 
        // p.z ranges from approx -2000 to +2000
        const zIndex = Math.floor(p.z + 3000);
        
        // Opacity Logic
        // Fade out very close items to prevent camera clipping flicker
        // Fade out very far items
        let opacity = 1;
        if (p.z > 800) opacity = Math.max(0, 1 - (p.z - 800) / 300);
        else if (p.z < -2000) opacity = Math.max(0, 1 - (Math.abs(p.z) - 2000) / 1000);
        
        if (opacity < 0.01) {
            el.style.display = 'none';
        } else {
            if (el.style.display === 'none') el.style.display = 'flex';
            el.style.opacity = opacity.toFixed(2);
            el.style.zIndex = zIndex.toString();
            
            // Motion Stretch
            const effectiveSpeed = (1.0 + userOffset);
            const speedStretch = Math.max(1, (effectiveSpeed * cfg.baseSpeed * 20));
            const scaleY = effectiveSpeed > 1.2 ? (1/speedStretch).toFixed(3) : '1';

            el.style.transform = `translate3d(${nextX.toFixed(1)}px, ${nextY.toFixed(1)}px, ${nextZ.toFixed(1)}px) rotateX(${p.rotX.toFixed(0)}deg) rotateY(${p.rotY.toFixed(0)}deg) rotateZ(${p.rotZ.toFixed(0)}deg) scale(1, ${scaleY})`;
        }
      }

      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [phase, organizedGroups]);

  // Memoize the particle elements so changing the config (state) doesn't cause a re-render of 120+ divs
  const particleElements = useMemo(() => {
    return renderList.map((p, i) => (
      <div
        key={p.id}
        ref={(el) => { elementsRef.current[i] = el; }}
        className="absolute top-1/2 left-1/2 flex items-center gap-3 p-3 rounded-xl border shadow-xl pointer-events-auto transition-colors duration-500"
        style={{
          width: '240px',
          height: '64px',
          backgroundColor: isDarkMode ? 'rgba(24, 24, 27, 0.85)' : 'rgba(255, 255, 255, 0.85)',
          color: isDarkMode ? '#f4f4f5' : '#18181b',
          borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
          willChange: 'transform, opacity',
          backfaceVisibility: 'hidden',
          contain: 'layout paint style',
          display: 'none',
        }}
      >
        <div 
            className="icon-container w-9 h-9 shrink-0 rounded-lg flex items-center justify-center border transition-colors duration-500"
            style={{
                backgroundColor: isDarkMode ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.05)',
                borderColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
            }}
        >
          <img 
            src={`https://www.google.com/s2/favicons?domain=${p.domain}&sz=64`}
            alt=""
            className="w-5 h-5 rounded-sm opacity-90"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <Globe size={16} className="text-zinc-500 absolute -z-10" />
        </div>
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="text-xs font-bold truncate">
            {p.title}
          </div>
          <div className={`text-[10px] truncate font-mono ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>
            {p.domain}
          </div>
        </div>
      </div>
    ));
  }, [renderList, isDarkMode]); // Re-render logic when dark mode changes

  return (
    <div 
      className="fixed inset-0 z-0 flex items-center justify-center overflow-hidden pointer-events-none transition-colors duration-500" 
      ref={containerRef}
      style={{ backgroundColor: isDarkMode ? '#000000' : '#f5f5f7' }}
    >
       {/* Ambient Depth Background */}
      <div 
        className="absolute inset-0 z-10 pointer-events-none opacity-50 transition-colors duration-500"
        style={{
             background: isDarkMode 
             ? 'radial-gradient(circle at center, #1a1a1a 0%, #000 100%)' 
             : 'radial-gradient(circle at center, #ffffff 0%, #e5e5ea 100%)'
        }}
      ></div>

      <div 
        className="relative w-full h-full"
        style={{ 
            perspective: '1000px', 
            transformStyle: 'preserve-3d',
            backfaceVisibility: 'hidden',
        }}
      >
        {particleElements}
      </div>

      {/* --- Developer Controls (MOVED TO BOTTOM OF DOM for Overlay) --- */}
      <div 
        className="absolute top-4 right-4 z-[9999] flex flex-col items-end font-sans pointer-events-auto select-none"
        onMouseDown={(e) => e.stopPropagation()} // Stop propagation to scene
        onPointerDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onDragStart={(e) => e.preventDefault()} // Prevent "Forbidden" cursor (dragging whole div)
      >
        <button 
          onClick={() => setShowDevTools(!showDevTools)}
          className={`backdrop-blur-md p-2 rounded-lg transition-colors border shadow-lg cursor-pointer ${
            isDarkMode 
            ? 'bg-zinc-800/80 text-white hover:bg-zinc-700 border-white/10' 
            : 'bg-white/80 text-zinc-700 hover:bg-white border-black/5'
          }`}
        >
          {showDevTools ? <ChevronUp size={20} /> : <Settings size={20} />}
        </button>
        
        {showDevTools && (
          <div className={`mt-2 w-72 backdrop-blur-xl border rounded-xl p-4 shadow-2xl text-xs space-y-5 cursor-default transition-colors ${
             isDarkMode 
             ? 'bg-zinc-900/95 border-white/10' 
             : 'bg-white/95 border-black/5'
          }`}>
            <div className={`flex justify-between items-center mb-2 pb-2 border-b ${isDarkMode ? 'border-white/5' : 'border-black/5'}`}>
               <h4 className={`font-bold uppercase tracking-wider ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>Controls</h4>
               <div className="flex gap-2">
                    <button 
                        onClick={handleCopyConfig}
                        className={`p-1.5 rounded transition-all cursor-pointer ${
                            copied 
                            ? 'bg-green-500/20 text-green-500' 
                            : isDarkMode 
                                ? 'hover:bg-white/10 text-zinc-400 hover:text-white'
                                : 'hover:bg-black/5 text-zinc-500 hover:text-black'
                        }`}
                        title="Copy"
                    >
                        {copied ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                    <button 
                        onClick={() => setConfig(DEFAULT_CONFIG)}
                        className={`p-1.5 rounded transition-colors cursor-pointer ${
                            isDarkMode 
                            ? 'hover:bg-white/10 text-zinc-400 hover:text-white' 
                            : 'hover:bg-black/5 text-zinc-500 hover:text-black'
                        }`}
                        title="Reset"
                    >
                        <RotateCcw size={14} />
                    </button>
               </div>
            </div>
            
            {/* Range Input Helpers */}
            <ConfigSlider 
              label="Speed" 
              value={config.baseSpeed} 
              onImmediateChange={(v) => updateConfigRef('baseSpeed', v)}
              onChange={(v) => setConfig(p => ({...p, baseSpeed: v}))}
              min={0.01} max={0.5} step={0.01} 
              isDarkMode={isDarkMode}
            />
            
            <ConfigSlider 
              label="Position X" 
              value={config.tornadoX} 
              onImmediateChange={(v) => updateConfigRef('tornadoX', v)}
              onChange={(v) => setConfig(p => ({...p, tornadoX: v}))}
              min={-500} max={500} step={10} unit="px"
              isDarkMode={isDarkMode}
            />
            
            <ConfigSlider 
              label="Radius" 
              value={config.radiusMultiplier} 
              onImmediateChange={(v) => updateConfigRef('radiusMultiplier', v)}
              onChange={(v) => setConfig(p => ({...p, radiusMultiplier: v}))}
              min={0.5} max={3.0} step={0.1} unit="x"
              isDarkMode={isDarkMode}
            />
            
            <ConfigSlider 
              label="Wobble" 
              value={config.wobbleStrength} 
              onImmediateChange={(v) => updateConfigRef('wobbleStrength', v)}
              onChange={(v) => setConfig(p => ({...p, wobbleStrength: v}))}
              min={0} max={2.0} step={0.1} 
              isDarkMode={isDarkMode}
            />
            
             <ConfigSlider 
              label="Height" 
              value={config.verticalSpread} 
              onImmediateChange={(v) => updateConfigRef('verticalSpread', v)}
              onChange={(v) => setConfig(p => ({...p, verticalSpread: v}))}
              min={500} max={3000} step={50} unit="px"
              isDarkMode={isDarkMode}
            />
          </div>
        )}
      </div>
    </div>
  );
};