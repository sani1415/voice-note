import React, { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import Recorder from './components/Recorder';
import Auth from './components/Auth';
import { Note, TranscriptParagraph, RecordingStatus } from './types';
import { Calendar, Clock, Edit3, BookOpen, LogOut, User } from 'lucide-react';
import { supabase } from './supabaseClient';

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
  const [user, setUser] = useState<any>(null);
  const [userId, setUserId] = useState<string | null>(null); // user_id from public.users table
  const [loading, setLoading] = useState(true);

  // Check authentication state and get user
  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    const resolveUserId = async (authUserId: string) => {
      try {
        // Try to get existing user row
        const { data: userData, error } = await supabase
          .from('users')
          .select('id')
          .eq('auth_user_id', authUserId)
          .single();

        if (userData) {
          setUserId(userData.id);
          return;
        }

        if (error) {
          console.warn('users table lookup failed:', error.message);
          // Try to create the row
          const { data: newUser, error: createError } = await supabase
            .from('users')
            .insert({ auth_user_id: authUserId })
            .select()
            .single();

          if (newUser && !createError) {
            setUserId(newUser.id);
            return;
          }
          if (createError) {
            console.warn('users table insert failed:', createError.message);
          }
        }

        // Fallback: use auth user ID directly so the app isn't stuck
        console.warn('Falling back to auth user ID as userId');
        setUserId(authUserId);
      } catch (err) {
        console.error('Error resolving user ID, using fallback:', err);
        setUserId(authUserId);
      }
    };

    // Use getSession (reads localStorage, no network call) for initial check
    const initAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          console.error('Error checking session:', error);
          setLoading(false);
          return;
        }
        if (session?.user) {
          setUser(session.user);
          await resolveUserId(session.user.id);
        }
      } catch (err) {
        console.error('Unexpected error during auth check:', err);
      } finally {
        setLoading(false);
      }
    };

    initAuth();

    // Listen for auth changes (including token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth event:', event);

      if (session?.user) {
        setUser(session.user);
        await resolveUserId(session.user.id);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setUserId(null);
        setNotes([]);
        setCurrentNoteId(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load notes from authenticated notes table
  useEffect(() => {
    if (!supabase || !userId) return;

    const loadNotes = async () => {
      try {
        const { data, error } = await supabase
          .from('notes')
          .select('*')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false });

        if (error) {
          console.error('Error loading notes from Supabase', error);
          return;
        }

        if (data) {
          const mapped: Note[] = data.map((row: any) => ({
            id: row.id,
            title: row.title ?? '',
            paragraphs: Array.isArray(row.paragraphs) ? row.paragraphs : [],
            createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
            updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
          }));
          setNotes(mapped);
          if (mapped.length > 0) {
            setCurrentNoteId(mapped[0].id);
          }
        }
      } catch (err) {
        console.error('Unexpected error loading notes from Supabase', err);
      }
    };

    loadNotes();
  }, [userId]);

  const persistNoteToCloud = async (note: Note) => {
    if (!supabase || !userId) return;
    
    try {
      await supabase.from('notes').upsert({
        id: note.id,
        user_id: userId,
        title: note.title,
        paragraphs: note.paragraphs,
        created_at: new Date(note.createdAt).toISOString(),
        updated_at: new Date(note.updatedAt).toISOString(),
      });
    } catch (err) {
      console.error('Failed to sync note to Supabase', err);
    }
  };

  const deleteNoteFromCloud = async (id: string) => {
    if (!supabase || !userId) return;
    
    try {
      await supabase.from('notes').delete().eq('id', id).eq('user_id', userId);
    } catch (err) {
      console.error('Failed to delete note from Supabase', err);
    }
  };

  const handleAuthSuccess = () => {
    // Auth component will trigger auth state change, which will reload notes
  };

  const handleLogout = async () => {
    if (!supabase) return;
    
    // Show confirmation dialog
    if (!confirm('আপনি কি সত্যিই লগআউট করতে চান?')) {
      return;
    }
    
    try {
      await supabase.auth.signOut();
      // Explicitly clear state to prevent race conditions
      setUser(null);
      setUserId(null);
      setNotes([]);
      setCurrentNoteId(null);
    } catch (err) {
      console.error('Logout error:', err);
      alert('লগআউটে সমস্যা হয়েছে। দয়া করে পুনরায় চেষ্টা করুন।');
    }
  };

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
    persistNoteToCloud(newNote);
  };

  const handleDeleteNote = (id: string) => {
    if (!confirm("আপনি কি নিশ্চিতভাবে এই নোটটি মুছে ফেলতে চান?")) return;
    const filtered = notes.filter((n) => n.id !== id);
    setNotes(filtered);
    if (currentNoteId === id) {
      setCurrentNoteId(filtered.length > 0 ? filtered[0].id : null);
    }
    deleteNoteFromCloud(id);
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
    reader.onload = async (e) => {
      try {
        const importedNotes = JSON.parse(e.target?.result as string);
        if (Array.isArray(importedNotes)) {
          // Import notes and sync to Supabase
          for (const note of importedNotes) {
            const importedNote: Note = {
              ...note,
              id: note.id || crypto.randomUUID(),
            };
            await persistNoteToCloud(importedNote);
          }
          
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
      setNotes(prev => [newNote, ...prev]);
      setCurrentNoteId(newId);
      persistNoteToCloud(newNote);
    } else {
      setNotes((prev) => {
        const updated = prev.map((n) => {
          if (n.id === currentNoteId) {
            const newParagraph: TranscriptParagraph = {
              id: crypto.randomUUID(),
              text,
              timestamp: Date.now(),
            };
            const nextNote: Note = {
              ...n,
              paragraphs: [...n.paragraphs, newParagraph],
              updatedAt: Date.now(),
            };
            persistNoteToCloud(nextNote);
            return nextNote;
          }
          return n;
        });
        return updated;
      });
    }
    setStatus('idle');
  }, [currentNoteId]);

  const updateTitle = (newTitle: string) => {
    setNotes((prev) =>
      prev.map((n) => {
        if (n.id === currentNoteId) {
          const updated: Note = {
            ...n,
            title: newTitle,
            updatedAt: Date.now(),
          };
          persistNoteToCloud(updated);
          return updated;
        }
        return n;
      })
    );
  };

  const updateParagraph = useCallback((pId: string, newText: string) => {
    setNotes((prev) =>
      prev.map((n) => {
        if (n.id === currentNoteId) {
          const updated: Note = {
            ...n,
            updatedAt: Date.now(),
            paragraphs: n.paragraphs.map((p) =>
              p.id === pId ? { ...p, text: newText } : p
            ),
          };
          persistNoteToCloud(updated);
          return updated;
        }
        return n;
      })
    );
  }, [currentNoteId]);

  // Show loading or auth screen
  if (loading) {
    return (
      <div className="flex h-screen bg-slate-50 items-center justify-center">
        <div className="text-slate-400">লোড হচ্ছে...</div>
      </div>
    );
  }

  if (!supabase) {
    return (
      <div className="flex h-screen bg-slate-50 items-center justify-center p-4">
        <div className="text-center max-w-md">
          <h2 className="text-2xl font-bold text-slate-800 mb-4">Supabase কনফিগার করা হয়নি</h2>
          <p className="text-slate-600">
            দয়া করে `.env.local` ফাইলে `VITE_SUPABASE_URL` এবং `VITE_SUPABASE_ANON_KEY` সেট করুন।
          </p>
        </div>
      </div>
    );
  }

  if (!user || !userId) {
    return <Auth onAuthSuccess={handleAuthSuccess} />;
  }

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
        {/* User info and logout button */}
        <div className="absolute top-4 right-4 z-20 flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg shadow-sm border border-slate-200 text-sm text-slate-600">
            <User size={16} />
            <span className="truncate max-w-[200px]">{user.email}</span>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-all text-sm font-medium"
            title="লগআউট"
          >
            <LogOut size={16} />
            <span>লগআউট</span>
          </button>
        </div>

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
