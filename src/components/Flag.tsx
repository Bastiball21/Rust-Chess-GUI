import React from 'react';

interface FlagProps {
    code?: string;
    country_code?: string; // Support both prop names for compatibility
}

export const Flag: React.FC<FlagProps> = ({ code, country_code }) => {
    const finalCode = code || country_code;

    if (!finalCode) return null;

    return (
        <span className="bg-gray-700 text-gray-200 font-mono text-xs px-1.5 py-0.5 rounded border border-gray-600 select-none inline-block min-w-[24px] text-center">
            {finalCode.toUpperCase()}
        </span>
    );
};
