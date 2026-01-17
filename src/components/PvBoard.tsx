import React, { useMemo } from 'react';
import { Chess } from 'chess.js';
import Chessground from 'react-chessground';
import 'react-chessground/dist/styles/chessground.css';

interface PvBoardProps {
    pv?: string;
    currentFen: string;
    side: 'white' | 'black';
}

export const PvBoard: React.FC<PvBoardProps> = ({ pv, currentFen, side }) => {
    const pvFen = useMemo(() => {
        if (!pv || !currentFen) return currentFen || "start";
        try {
            const game = new Chess(currentFen === "start" ? undefined : currentFen);
            const moves = pv.split(/\s+/).filter(Boolean);
            for (const move of moves) {
                if (move === "0000") continue;
                if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)) {
                    break;
                }
                const from = move.slice(0, 2);
                const to = move.slice(2, 4);
                const promotion = move.length > 4 ? move.slice(4) : undefined;
                const applied = game.move({ from, to, promotion });
                if (!applied) break;
            }
            return game.fen();
        } catch (e) {
            return currentFen;
        }
    }, [pv, currentFen]);

    return (
        <div className="h-full aspect-square bg-gray-800 rounded border border-gray-600 flex items-center justify-center overflow-hidden">
            <div className="w-full h-full pointer-events-none">
                <Chessground
                    fen={pvFen === "start" ? undefined : pvFen}
                    orientation={side}
                    viewOnly={true}
                    width="100%"
                    height="100%"
                    config={{
                        viewOnly: true,
                        coordinates: false,
                        movable: { color: undefined }
                    }}
                />
            </div>
        </div>
    );
};
