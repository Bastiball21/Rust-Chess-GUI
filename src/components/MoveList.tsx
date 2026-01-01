import React from 'react';

interface MoveListProps {
    moves: string[];
}

export const MoveList: React.FC<MoveListProps> = ({ moves }) => {
    return (
        <div className="h-full bg-gray-800 text-gray-300 font-mono text-sm overflow-y-auto p-2 border-l border-gray-700">
             <table className="w-full text-left">
                <tbody>
                    {Array.from({ length: Math.ceil(moves.length / 2) }).map((_, i) => (
                        <tr key={i} className={i % 2 === 0 ? "bg-gray-800" : "bg-gray-750"}>
                            <td className="w-8 text-gray-500 text-right pr-2">{i + 1}.</td>
                            <td className="w-20 pl-2 hover:bg-gray-700 cursor-pointer">{moves[i * 2]}</td>
                            <td className="w-20 pl-2 hover:bg-gray-700 cursor-pointer">{moves[i * 2 + 1]}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};
