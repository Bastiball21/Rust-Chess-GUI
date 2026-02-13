import React, { useEffect, useState, useRef } from 'react';

interface ClockProps {
  timeMs: number;
  isActive: boolean;
  side: 'white' | 'black';
}

export const Clock: React.FC<ClockProps> = ({ timeMs, isActive, side }) => {
  const [displayTime, setDisplayTime] = useState(timeMs);
  const lastUpdateRef = useRef<number>(Date.now());

  // Sync with backend updates
  useEffect(() => {
    setDisplayTime(timeMs);
    lastUpdateRef.current = Date.now();
  }, [timeMs]);

  // Local ticking effect
  useEffect(() => {
    if (!isActive || displayTime <= 0) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const delta = now - lastUpdateRef.current;
      setDisplayTime((prev) => Math.max(0, prev - delta));
      lastUpdateRef.current = now;
    }, 50); // Tick faster for smoother ms display if needed

    return () => clearInterval(interval);
  }, [isActive, displayTime]);

  // TCEC-style Formatting: HH:MM:SS or MM:SS
  const formatTime = (ms: number) => {
    if (ms <= 0) return "00:00:00";

    const totalSeconds = Math.ceil(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    // Optional: Show decimals if very low on time (common in engine chess)
    // TCEC usually keeps standard HH:MM:SS until the very end
    if (ms < 10000) {
        // Show tenths for last 10 seconds
        const tenths = Math.floor((ms % 1000) / 100);
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${tenths}`;
    }

    const hStr = hours > 0 ? `${hours}:` : "";
    const mStr = minutes.toString().padStart(2, '0');
    const sStr = seconds.toString().padStart(2, '0');

    return `${hStr}${mStr}:${sStr}`;
  };

  const isLowTime = displayTime < 10000; // 10 seconds warning

  return (
    <div
      className={`
        flex items-center justify-between px-4 py-2 rounded font-mono font-bold text-lg tracking-wider border
        transition-all duration-200
        ${isActive
          ? 'bg-[#1e1e1e] border-blue-500/50 text-gray-100 shadow-[0_0_10px_rgba(59,130,246,0.1)]'
          : 'bg-[#181818] border-[#333] text-gray-600'
        }
      `}
    >
      {/* Indicator Dot (TCEC style often uses small colored bars) */}
      <div className={`w-2 h-2 rounded-sm ${
        side === 'white'
          ? (isActive ? 'bg-gray-200' : 'bg-gray-600')
          : (isActive ? 'bg-gray-400' : 'bg-gray-800')
      }`} />

      {/* Time Display */}
      <span className={`
        ${isActive ? 'text-gray-100' : 'text-gray-500'}
        ${isLowTime && isActive ? 'text-red-400' : ''}
      `}>
        {formatTime(displayTime)}
      </span>
    </div>
  );
};
