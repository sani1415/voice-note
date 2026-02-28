import React from "react";
import { Radio } from "lucide-react";

interface LiveTranscriptionViewProps {
  text: string;
  isConnected: boolean;
  isRecording: boolean;
}

const LiveTranscriptionView: React.FC<LiveTranscriptionViewProps> = ({
  text,
  isConnected,
  isRecording,
}) => {
  return (
    <div className="w-full bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 border-b border-slate-200">
        <div className="flex items-center gap-2">
          {isRecording && isConnected ? (
            <>
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
              </span>
              <span className="text-sm font-medium text-green-700">
                লাইভ ট্রান্সক্রিপশন
              </span>
            </>
          ) : isConnected ? (
            <>
              <Radio size={14} className="text-amber-500" />
              <span className="text-sm font-medium text-amber-600">
                সংযুক্ত - কথা বলুন
              </span>
            </>
          ) : (
            <>
              <Radio size={14} className="text-slate-400" />
              <span className="text-sm font-medium text-slate-500">
                সংযোগ বিচ্ছিন্ন
              </span>
            </>
          )}
        </div>
      </div>

      <div className="p-4 min-h-[120px] max-h-[200px] overflow-y-auto">
        {text ? (
          <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">
            {text}
            {isRecording && (
              <span className="inline-block w-0.5 h-5 bg-indigo-500 ml-0.5 animate-pulse align-middle" />
            )}
          </p>
        ) : (
          <p className="text-slate-400 italic">
            {isRecording
              ? "শুনছি..."
              : "রেকর্ডিং শুরু করলে এখানে টেক্সট দেখাবে"}
          </p>
        )}
      </div>
    </div>
  );
};

export default LiveTranscriptionView;
