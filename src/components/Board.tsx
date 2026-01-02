import React, { useState, useEffect, useRef } from 'react';
import Chessground from 'react-chessground';
import 'react-chessground/dist/styles/chessground.css';

interface BoardProps {
    fen: string;
    lastMove?: string[];
    orientation?: 'white' | 'black';
    config?: any;
}

export const Board: React.FC<BoardProps> = ({ fen, lastMove, orientation = 'white' }) => {
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

    return (
        <div ref={containerRef} className="w-full h-full flex justify-center items-center bg-gray-800" style={{ overflow: 'hidden' }}>
            {size > 0 && (
                <div style={{ height: size, width: size }}>
                    <Chessground
                        fen={fen}
                        orientation={orientation}
                        turnColor="white"
                        animation={{ enabled: true }}
                        movable={{
                            free: false,
                            color: undefined,
                            dests: new Map(), // View only for now
                        }}
                        lastMove={lastMove as any}
                        width="100%"
                        height="100%"
                    />
                </div>
            )}
        </div>
    );
};
