
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import Recorder from './components/Recorder';
import { Note, TranscriptParagraph, RecordingStatus } from './types';
import { Save, Calendar, Clock, Edit3, BookOpen } from 'lucide-react';

// Move EditableParagraph outside to prevent re-mounting on every render
const EditableParagraph: React.FC<{
  p: TranscriptParagraph;
  onUpdate: (id: string, text: string) => void;
}> = ({ p, onUpdate }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  };

  useEffect(() => {
    adjustHeight();
  }, [p.text]);

  return (
    <div className="relative group w-full">
      <textarea
        ref={textareaRef}
        value={p.text}
        onChange={(e) => onUpdate(p.id, e.target.value)}
        onInput={adjustHeight}
        rows={1}
        className="w-full text-lg md:text-xl text-slate-700 leading-relaxed bg-transparent border-none focus:ring-2 focus:ring-indigo-100 rounded-lg p-2 -ml-2 transition-all resize-none outline-none overflow-hidden hover:bg-slate-50/50"
        placeholder="এখানে কিছু লিখুন..."
      />
      <div className="flex justify-end">
        <span className="text-[10px] text-slate-300 font-mono select-none">
          {new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null);
  const [status, setStatus] = useState<RecordingStatus>('idle');

  // Load notes from local storage
  useEffect(() => {
    const savedNotes = localStorage.getItem('swarolipi_notes');
    if (savedNotes) {
      try {
        const parsed = JSON.parse(savedNotes);
        setNotes(parsed);
        if (parsed.length > 0) {
          setCurrentNoteId(parsed[0].id);
        }
      } catch (e) {
        console.error("Failed to parse saved notes", e);
      }
    }
  }, []);

  // Save notes to local storage whenever notes state changes
  useEffect(() => {
    localStorage.setItem('swarolipi_notes', JSON.stringify(notes));
  }, [notes]);

  const currentNote = notes.find((n) => n.id === currentNoteId);

  const handleNewNote = () => {
    const newNote: Note = {
      id: crypto.randomUUID(),
      title: 'নতুন নোট - ' + new Date().toLocaleTimeString(),
      paragraphs: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setNotes([newNote, ...notes]);
    setCurrentNoteId(newNote.id);
  };

  const handleDeleteNote = (id: string) => {
    if (!confirm("আপনি কি নিশ্চিতভাবে এই নোটটি মুছে ফেলতে চান?")) return;
    const filtered = notes.filter((n) => n.id !== id);
    setNotes(filtered);
    if (currentNoteId === id) {
      setCurrentNoteId(filtered.length > 0 ? filtered[0].id : null);
    }
  };

  const handleExportNotes = () => {
    const dataStr = JSON.stringify(notes, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `swarolipi_backup_${new Date().toISOString().slice(0,10)}.json`;
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const handleImportNotes = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importedNotes = JSON.parse(e.target?.result as string);
        if (Array.isArray(importedNotes)) {
          setNotes(prev => {
            const combined = [...importedNotes, ...prev];
            const unique = combined.filter((v, i, a) => a.findIndex(t => (t.id === v.id)) === i);
            return unique;
          });
          alert("সফলভাবে নোটগুলো ইমপোর্ট করা হয়েছে!");
        }
      } catch (err) {
        alert("ভুল ফাইল ফরম্যাট! দয়া করে সঠিক JSON ব্যাকআপ ফাইল সিলেক্ট করুন।");
      }
    };
    reader.readAsText(file);
  };

  const handleTranscriptionComplete = useCallback((text: string) => {
    if (!currentNoteId) {
      const newId = crypto.randomUUID();
      const newParagraph: TranscriptParagraph = {
        id: crypto.randomUUID(),
        text,
        timestamp: Date.now(),
      };
      const newNote: Note = {
        id: newId,
        title: text.slice(0, 30) + (text.length > 30 ? '...' : ''),
        paragraphs: [newParagraph],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setNotes([newNote, ...notes]);
      setCurrentNoteId(newId);
    } else {
      setNotes((prev) =>
        prev.map((n) => {
          if (n.id === currentNoteId) {
            const newParagraph: TranscriptParagraph = {
              id: crypto.randomUUID(),
              text,
              timestamp: Date.now(),
            };
            return {
              ...n,
              paragraphs: [...n.paragraphs, newParagraph],
              updatedAt: Date.now(),
            };
          }
          return n;
        })
      );
    }
    setStatus('idle');
  }, [currentNoteId, notes]);

  const updateTitle = (newTitle: string) => {
    setNotes((prev) =>
      prev.map((n) => (n.id === currentNoteId ? { ...n, title: newTitle, updatedAt: Date.now() } : n))
    );
  };

  const updateParagraph = useCallback((pId: string, newText: string) => {
    setNotes((prev) =>
      prev.map((n) => {
        if (n.id === currentNoteId) {
          return {
            ...n,
            updatedAt: Date.now(),
            paragraphs: n.paragraphs.map((p) => 
              p.id === pId ? { ...p, text: newText } : p
            )
          };
        }
        return n;
      })
    );
  }, [currentNoteId]);

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden font-['Inter','Noto_Sans_Bengali']">
      <Sidebar
        notes={notes}
        currentNoteId={currentNoteId}
        onSelectNote={setCurrentNoteId}
        onNewNote={handleNewNote}
        onDeleteNote={handleDeleteNote}
        onExport={handleExportNotes}
        onImport={handleImportNotes}
      />

      <main className="flex-1 flex flex-col relative">
        {currentNote ? (
          <>
            <div className="p-8 pb-4 flex items-start justify-between">
              <div className="flex-1 max-w-4xl mx-auto w-full">
                <input
                  type="text"
                  value={currentNote.title}
                  onChange={(e) => updateTitle(e.target.value)}
                  className="w-full text-3xl font-bold bg-transparent border-none focus:outline-none focus:ring-0 text-slate-800"
                  placeholder="নোটের শিরোনাম"
                />
                <div className="flex items-center gap-4 mt-2 text-sm text-slate-400">
                  <span className="flex items-center gap-1">
                    <Calendar size={14} />
                    {new Date(currentNote.createdAt).toLocaleDateString()}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock size={14} />
                    শেষ আপডেট: {new Date(currentNote.updatedAt).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-8 py-4 scroll-smooth">
              <div className="max-w-4xl mx-auto w-full min-h-[70vh] bg-white shadow-sm rounded-3xl p-8 md:p-12 mb-20 border border-slate-100">
                {currentNote.paragraphs.length === 0 ? (
                  <div className="h-full min-h-[50vh] flex flex-col items-center justify-center text-slate-300 opacity-60">
                    <Edit3 size={64} strokeWidth={1} />
                    <p className="mt-4 text-lg">নিচে থাকা বাটন চেপে কথা বলা শুরু করুন অথবা সরাসরি টাইপ করুন।</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {currentNote.paragraphs.map((p, index) => (
                      <React.Fragment key={p.id}>
                        <EditableParagraph 
                          p={p} 
                          onUpdate={updateParagraph}
                        />
                        {index < currentNote.paragraphs.length - 1 && (
                          <div className="my-2 border-b border-slate-50 w-full opacity-50" />
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-full max-w-xl px-4 z-10">
              <Recorder
                status={status}
                setStatus={setStatus}
                onTranscriptionComplete={handleTranscriptionComplete}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            <BookOpen size={80} strokeWidth={1} />
            <h2 className="text-2xl font-bold mt-4 text-slate-600">আপনার স্বরলিপি লাইব্রেরী খালি</h2>
            <p className="mt-2 mb-6">নতুন একটি নোট তৈরি করে শুরু করুন</p>
            <button
              onClick={handleNewNote}
              className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all"
            >
              নতুন নোট শুরু করুন
            </button>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
