
export interface TranscriptParagraph {
  id: string;
  text: string;
  timestamp: number;
}

export interface Note {
  id: string;
  title: string;
  paragraphs: TranscriptParagraph[];
  updatedAt: number;
  createdAt: number;
}

export type RecordingStatus = 'idle' | 'recording' | 'paused' | 'transcribing';
