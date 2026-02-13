import React, { useState, useEffect, useRef } from 'react';
import Chessground from 'react-chessground';
import 'react-chessground/dist/styles/chessground.css';

interface BoardProps {
    fen: string;
    lastMove?: string[];
    orientation?: 'white' | 'black';
    config?: any;
    shapes?: any[];
    whiteName?: string;
    blackName?: string;
    whiteLogo?: string;
    blackLogo?: string;
}

export const Board: React.FC<BoardProps> = ({
    fen,
    lastMove,
    orientation = 'white',
    config = {},
    shapes = [],
    whiteName = "White",
    blackName = "Black",
    whiteLogo,
    blackLogo
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState(0);

    useEffect(() => {
        if (!containerRef.current) return;
        const resizeObserver = new ResizeObserver((entries) => {
            window.requestAnimationFrame(() => {
                if (!Array.isArray(entries) || !entries.length) return;
                const { width, height } = entries[0].contentRect;
                setSize(Math.min(width, height));
            });
        });
        resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    const finalConfig = {
        ...config,
        movable: {
            free: false,
            color: undefined,
            dests: new Map(),
            ...(config.movable || {})
        },
        drawable: {
            shapes: shapes,
            ...(config.drawable || {})
        }
    };

    // Determine Top/Bottom player based on orientation
    const topName = orientation === 'white' ? blackName : whiteName;
    const topLogo = orientation === 'white' ? blackLogo : whiteLogo;
    const bottomName = orientation === 'white' ? whiteName : blackName;
    const bottomLogo = orientation === 'white' ? whiteLogo : blackLogo;

    const PlayerLabel = ({ name, logo }: { name: string, logo?: string }) => (
        <div className="flex items-center gap-2 bg-gray-900/80 backdrop-blur-sm px-3 py-1.5 rounded-md shadow-lg border border-white/10">
            {logo ? (
                <img src={logo} alt={name} className="w-5 h-5 object-contain" />
            ) : (
                <div className="w-5 h-5 bg-gray-600 rounded-full flex items-center justify-center text-[10px] text-white font-bold">
                    {name[0]}
                </div>
            )}
            <span className="text-gray-100 font-bold text-sm shadow-black drop-shadow-md">{name}</span>
        </div>
    );

    return (
        <div ref={containerRef} className="relative w-full h-full flex justify-center items-center bg-[#262421]" style={{ overflow: 'hidden' }}>
            {size > 0 && (
                <div style={{ height: size, width: size }}>
                    <Chessground
                        fen={fen}
                        orientation={orientation}
                        turnColor="white"
                        animation={{ enabled: true }}
                        lastMove={lastMove as any}
                        width="100%"
                        height="100%"
                        config={finalConfig}
                    />
                </div>
            )}

            {/* Player Name Overlays */}
            <div className="absolute top-3 left-3 pointer-events-none z-10">
                <PlayerLabel name={topName} logo={topLogo} />
            </div>
            <div className="absolute bottom-3 left-3 pointer-events-none z-10">
                <PlayerLabel name={bottomName} logo={bottomLogo} />
            </div>
        </div>
    );
};
