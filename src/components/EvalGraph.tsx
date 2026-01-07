import React from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

interface EvalGraphProps {
    data: { moveNumber: number; score: number }[];
}

export const EvalGraph: React.FC<EvalGraphProps> = ({ data }) => {
    // Determine domain for Y-axis to keep graph centered/scaled
    const scores = data.map(d => d.score);
    const minScore = Math.min(...scores, -200); // Default min -2.00
    const maxScore = Math.max(...scores, 200);  // Default max +2.00
    const domain = [minScore, maxScore];

    return (
        <div className="w-full h-full bg-gray-900/50 rounded overflow-hidden relative">
            {data.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-xs uppercase font-bold">
                    No Data
                </div>
            )}
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                    <defs>
                        <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#60a5fa" stopOpacity={0}/>
                        </linearGradient>
                    </defs>
                    <XAxis dataKey="moveNumber" hide />
                    <YAxis domain={domain} hide />
                    <Tooltip
                        contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', fontSize: '12px' }}
                        itemStyle={{ color: '#9ca3af' }}
                        formatter={(val: number) => [(val / 100).toFixed(2), "Score"]}
                        labelFormatter={(label) => `Move ${label}`}
                    />
                    <ReferenceLine y={0} stroke="#4b5563" strokeDasharray="3 3" />
                    <Area
                        type="monotone"
                        dataKey="score"
                        stroke="#60a5fa"
                        fillOpacity={1}
                        fill="url(#colorScore)"
                        strokeWidth={2}
                        isAnimationActive={false}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
};
