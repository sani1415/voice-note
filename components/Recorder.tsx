import React, { useState, useRef, useEffect } from "react";
import { RecordingStatus, RecordingMode } from "../types";
import { Mic, Pause, Play, Square, Loader2, Radio, Zap } from "lucide-react";
import LiveTranscriptionView from "./LiveTranscriptionView";

interface RecorderProps {
  onTranscriptionComplete: (text: string) => void;
  onRecordingStart?: () => void;
  status: RecordingStatus;
  setStatus: (status: RecordingStatus) => void;
}

const Recorder: React.FC<RecorderProps> = ({
  onTranscriptionComplete,
  onRecordingStart,
  status,
  setStatus,
}) => {
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(
    null
  );
  const [timer, setTimer] = useState(0);
  const [mode, setMode] = useState<RecordingMode>("standard");
  const [liveText, setLiveText] = useState("");
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const timerInterval = useRef<number | null>(null);

  useEffect(() => {
    if (status === "recording") {
      timerInterval.current = window.setInterval(() => {
        setTimer((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerInterval.current) clearInterval(timerInterval.current);
    }
    return () => {
      if (timerInterval.current) clearInterval(timerInterval.current);
    };
  }, [status]);

  const startStandardRecording = async () => {
    onRecordingStart?.();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const mimeType = recorder.mimeType || "audio/webm";

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        setStatus("transcribing");
        const audioBlob = new Blob(chunks, { type: mimeType });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = (reader.result as string).split(",")[1];
          try {
            const { transcribeAudio } = await import(
              "../services/geminiService"
            );
            const result = await transcribeAudio(base64Audio, mimeType);
            onTranscriptionComplete(result);
          } catch (err) {
            console.error(err);
            alert("Error transcribing audio.");
            setStatus("idle");
          }
        };
        setTimer(0);
      };

      recorder.start();
      setMediaRecorder(recorder);
      setStatus("recording");
    } catch (err) {
      console.error("Failed to start recording:", err);
      alert("Microphone access denied or error occurred.");
    }
  };

  const startLiveRecording = async () => {
    onRecordingStart?.();
    setLiveText("");

    try {
      const { startLiveSession } = await import(
        "../services/geminiLiveService"
      );

      await startLiveSession({
        onTranscript: (text, isFinal) => {
          setLiveText(text);
          if (isFinal) {
            console.log("Final transcript received");
          }
        },
        onError: (error) => {
          console.error("Live session error:", error);
          alert(`লাইভ ট্রান্সক্রিপশন ত্রুটি: ${error.message}`);
          stopLiveRecording();
        },
        onConnectionChange: (connected) => {
          setIsLiveConnected(connected);
          if (!connected && status === "recording") {
            setStatus("idle");
            setTimer(0);
          }
        },
      });

      setStatus("recording");
    } catch (err) {
      console.error("Failed to start live recording:", err);
      alert("লাইভ সেশন শুরু করতে ব্যর্থ। মাইক্রোফোন অ্যাক্সেস চেক করুন।");
      setStatus("idle");
    }
  };

  const stopLiveRecording = async () => {
    try {
      const { stopLiveSession } = await import("../services/geminiLiveService");
      stopLiveSession();
    } catch (err) {
      console.error("Error stopping live session:", err);
    }

    if (liveText.trim()) {
      onTranscriptionComplete(liveText.trim());
    }

    setLiveText("");
    setIsLiveConnected(false);
    setStatus("idle");
    setTimer(0);
  };

  const startRecording = () => {
    if (mode === "live") {
      startLiveRecording();
    } else {
      startStandardRecording();
    }
  };

  const stopRecording = () => {
    if (mode === "live") {
      stopLiveRecording();
    } else {
      if (mediaRecorder && (status === "recording" || status === "paused")) {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach((track) => track.stop());
      }
    }
  };

  const pauseRecording = () => {
    if (mode === "standard" && mediaRecorder && status === "recording") {
      mediaRecorder.pause();
      setStatus("paused");
    }
  };

  const resumeRecording = () => {
    if (mode === "standard" && mediaRecorder && status === "paused") {
      mediaRecorder.resume();
      setStatus("recording");
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  const canSwitchMode = status === "idle";

  return (
    <div className="flex flex-col items-center gap-4 p-6 bg-white rounded-2xl shadow-sm border border-slate-100 w-full">
      {/* Mode Toggle */}
      <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-full">
        <button
          onClick={() => canSwitchMode && setMode("standard")}
          disabled={!canSwitchMode}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all ${
            mode === "standard"
              ? "bg-white text-indigo-600 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          } ${!canSwitchMode ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <Mic size={16} />
          স্ট্যান্ডার্ড
        </button>
        <button
          onClick={() => canSwitchMode && setMode("live")}
          disabled={!canSwitchMode}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all ${
            mode === "live"
              ? "bg-white text-green-600 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          } ${!canSwitchMode ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <Zap size={16} />
          লাইভ
        </button>
      </div>

      {/* Timer */}
      <div className="text-4xl font-mono font-bold text-slate-700">
        {formatTime(timer)}
      </div>

      {/* Live Transcription Display */}
      {mode === "live" && (status === "recording" || liveText) && (
        <LiveTranscriptionView
          text={liveText}
          isConnected={isLiveConnected}
          isRecording={status === "recording"}
        />
      )}

      {/* Control Buttons */}
      <div className="flex items-center gap-4">
        {status === "idle" && (
          <button
            onClick={startRecording}
            className={`flex items-center gap-2 px-6 py-3 text-white rounded-full transition-all font-medium ${
              mode === "live"
                ? "bg-green-600 hover:bg-green-700"
                : "bg-indigo-600 hover:bg-indigo-700"
            }`}
          >
            {mode === "live" ? <Radio size={20} /> : <Mic size={20} />}
            {mode === "live" ? "লাইভ রেকর্ড শুরু করুন" : "নতুন রেকর্ড শুরু করুন"}
          </button>
        )}

        {(status === "recording" || status === "paused") && (
          <>
            {mode === "standard" && (
              <>
                {status === "recording" ? (
                  <button
                    onClick={pauseRecording}
                    className="p-4 bg-amber-100 text-amber-600 rounded-full hover:bg-amber-200 transition-all"
                    title="Pause"
                  >
                    <Pause size={24} />
                  </button>
                ) : (
                  <button
                    onClick={resumeRecording}
                    className="p-4 bg-green-100 text-green-600 rounded-full hover:bg-green-200 transition-all"
                    title="Resume"
                  >
                    <Play size={24} />
                  </button>
                )}
              </>
            )}

            <button
              onClick={stopRecording}
              className="p-4 bg-red-100 text-red-600 rounded-full hover:bg-red-200 transition-all"
              title={mode === "live" ? "Stop Live" : "Stop and Transcribe"}
            >
              <Square size={24} />
            </button>
          </>
        )}

        {status === "transcribing" && (
          <div className="flex items-center gap-2 px-6 py-3 bg-slate-100 text-slate-500 rounded-full font-medium">
            <Loader2 className="animate-spin" size={20} />
            ট্রান্সক্রিপশন হচ্ছে...
          </div>
        )}
      </div>

      {/* Mode Description */}
      {status === "idle" && (
        <p className="text-xs text-slate-400 text-center max-w-xs">
          {mode === "live"
            ? "লাইভ মোডে কথা বলার সাথে সাথে টেক্সট দেখতে পাবেন (ইন্টারনেট প্রয়োজন)"
            : "স্ট্যান্ডার্ড মোডে রেকর্ড শেষে ট্রান্সক্রিপশন হবে"}
        </p>
      )}
    </div>
  );
};

export default Recorder;
