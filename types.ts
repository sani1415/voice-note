export interface TranscriptParagraph {
  id: string;
  text: string;
  timestamp: number;
}

export interface Folder {
  id: string;
  name: string;
  created_at?: string;
}

export interface Note {
  id: string;
  title: string;
  paragraphs: TranscriptParagraph[];
  updatedAt: number;
  createdAt: number;
  folder_id?: string | null;
}

export type RecordingStatus = 'idle' | 'recording' | 'paused' | 'transcribing';

export type RecordingMode = 'standard' | 'live';

export interface LiveSessionCallbacks {
  onTranscript: (text: string, isFinal: boolean) => void;
  onError: (error: Error) => void;
  onConnectionChange: (connected: boolean) => void;
}
