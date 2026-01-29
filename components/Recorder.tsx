
import React, { useState, useRef, useEffect } from 'react';
import { RecordingStatus } from '../types';
import { Mic, Pause, Play, Square, Loader2 } from 'lucide-react';

interface RecorderProps {
  onTranscriptionComplete: (text: string) => void;
  status: RecordingStatus;
  setStatus: (status: RecordingStatus) => void;
}

const Recorder: React.FC<RecorderProps> = ({ onTranscriptionComplete, status, setStatus }) => {
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [timer, setTimer] = useState(0);
  const timerInterval = useRef<number | null>(null);

  useEffect(() => {
    if (status === 'recording') {
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

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const mimeType = recorder.mimeType || 'audio/webm';
      
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        setStatus('transcribing');
        const audioBlob = new Blob(chunks, { type: mimeType });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = (reader.result as string).split(',')[1];
          try {
            const { transcribeAudio } = await import('../services/geminiService');
            // Passing the actual mimeType recorded by the browser
            const result = await transcribeAudio(base64Audio, mimeType);
            onTranscriptionComplete(result);
          } catch (err) {
            console.error(err);
            alert("Error transcribing audio.");
            setStatus('idle');
          }
        };
        setTimer(0);
      };

      recorder.start();
      setMediaRecorder(recorder);
      setStatus('recording');
    } catch (err) {
      console.error("Failed to start recording:", err);
      alert("Microphone access denied or error occurred.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && (status === 'recording' || status === 'paused')) {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
  };

  const pauseRecording = () => {
    if (mediaRecorder && status === 'recording') {
      mediaRecorder.pause();
      setStatus('paused');
    }
  };

  const resumeRecording = () => {
    if (mediaRecorder && status === 'paused') {
      mediaRecorder.resume();
      setStatus('recording');
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col items-center gap-4 p-6 bg-white rounded-2xl shadow-sm border border-slate-100 w-full">
      <div className="text-4xl font-mono font-bold text-slate-700">
        {formatTime(timer)}
      </div>

      <div className="flex items-center gap-4">
        {status === 'idle' && (
          <button
            onClick={startRecording}
            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 transition-all font-medium"
          >
            <Mic size={20} />
            নতুন রেকর্ড শুরু করুন
          </button>
        )}

        {(status === 'recording' || status === 'paused') && (
          <>
            {status === 'recording' ? (
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
            
            <button
              onClick={stopRecording}
              className="p-4 bg-red-100 text-red-600 rounded-full hover:bg-red-200 transition-all"
              title="Stop and Transcribe"
            >
              <Square size={24} />
            </button>
          </>
        )}

        {status === 'transcribing' && (
          <div className="flex items-center gap-2 px-6 py-3 bg-slate-100 text-slate-500 rounded-full font-medium">
            <Loader2 className="animate-spin" size={20} />
            ট্রান্সক্রিপশন হচ্ছে...
          </div>
        )}
      </div>
    </div>
  );
};

export default Recorder;
