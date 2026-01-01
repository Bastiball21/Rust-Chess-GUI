import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

interface EvalPoint {
    moveNumber: number;
    score: number; // centipawns
}

interface EvalGraphProps {
    data: EvalPoint[];
}

export const EvalGraph: React.FC<EvalGraphProps> = ({ data }) => {
    return (
        <div className="w-full h-48 bg-gray-900 border-t border-gray-700">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                    <XAxis dataKey="moveNumber" hide />
                    <YAxis domain={[-300, 300]} hide />
                    <ReferenceLine y={0} stroke="#666" />
                    <Tooltip
                        contentStyle={{ backgroundColor: '#1f2937', border: 'none' }}
                        itemStyle={{ color: '#e5e7eb' }}
                    />
                    <Line
                        type="monotone"
                        dataKey="score"
                        stroke="#fbbf24"
                        strokeWidth={2}
                        dot={false}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
};
