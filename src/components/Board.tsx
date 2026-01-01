import React from 'react';
import Chessground from 'react-chessground';
import 'react-chessground/dist/styles/chessground.css';

interface BoardProps {
    fen: string;
    lastMove?: string[];
    orientation?: 'white' | 'black';
}

export const Board: React.FC<BoardProps> = ({ fen, lastMove, orientation = 'white' }) => {
    return (
        <div className="w-full h-full flex justify-center items-center bg-gray-800">
            <div style={{ height: '100%', width: '100%', aspectRatio: '1/1' }}>
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
        </div>
    );
};
