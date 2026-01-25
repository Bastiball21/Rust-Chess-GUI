import React, { useRef, useEffect } from "react";

interface MoveListProps {
  moves: string[];
}

export const MoveList: React.FC<MoveListProps> = ({ moves }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom whenever moves change
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [moves]);

  return (
    <div
      ref={scrollRef}
      className="h-full w-full overflow-y-auto bg-gray-900 rounded border border-gray-700 p-3 text-sm font-mono"
    >
      <div className="grid grid-cols-[36px_minmax(0,1fr)_minmax(0,1fr)] gap-x-3 gap-y-2">
        {Array.from({ length: Math.ceil(moves.length / 2) }).map((_, i) => (
          <React.Fragment key={i}>
            <div className="text-gray-500 text-right">{i + 1}.</div>
            <div
              className={`px-2 py-1 rounded ${
                i * 2 === moves.length - 1 ? "bg-yellow-500/20 text-yellow-200" : "text-gray-200"
              }`}
            >
              {moves[i * 2]}
            </div>
            <div
              className={`px-2 py-1 rounded ${
                i * 2 + 1 === moves.length - 1 ? "bg-yellow-500/20 text-yellow-200" : "text-gray-200"
              }`}
            >
              {moves[i * 2 + 1] || ""}
            </div>
          </React.Fragment>
        ))}
      </div>
      {/* Invisible element to scroll to */}
      <div ref={endRef} />
    </div>
  );
};
