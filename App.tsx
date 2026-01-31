import React, { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import Recorder from './components/Recorder';
import Auth from './components/Auth';
import { Note, TranscriptParagraph, RecordingStatus } from './types';
import { Calendar, Clock, Edit3, BookOpen, LogOut, User, Menu, X } from 'lucide-react';
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
        className="w-full text-base md:text-lg lg:text-xl text-slate-700 leading-relaxed bg-transparent border-none focus:ring-2 focus:ring-indigo-100 rounded-lg p-2 -ml-2 transition-all resize-none outline-none overflow-hidden hover:bg-slate-50/50"
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
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesLoadedOnce, setNotesLoadedOnce] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Check authentication state and get user
  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    const resolveUserId = async (authUserId: string): Promise<void> => {
      try {
        // Notes table uses public.users.id, not auth_user_id — only set userId when we have it
        // so loadNotes() never runs with the wrong id (which would return no notes and race).
        const queryPromise = supabase
          .from('users')
          .select('id')
          .eq('auth_user_id', authUserId)
          .single();

        const timeout = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Query timeout')), 3000)
        );

        try {
          const { data: userData, error } = await Promise.race([queryPromise, timeout]) as any;

          if (userData?.id) {
            setUserId(userData.id);
            return;
          }

          if (error && !error.message?.includes('timeout') && !error.message?.includes('No rows')) {
            console.warn('users table lookup failed:', error.message);
            // Try to create the row
            try {
              const createPromise = supabase
                .from('users')
                .insert({ auth_user_id: authUserId })
                .select()
                .single();

              const createTimeout = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Create timeout')), 3000)
              );

              const { data: newUser, error: createError } = await Promise.race([createPromise, createTimeout]) as any;

              if (newUser?.id && !createError) {
                setUserId(newUser.id);
                return;
              }
            } catch (createErr) {
              console.warn('Error creating user row:', createErr);
            }
          }
          // No row or create failed: fallback so app doesn't stay stuck
          setUserId(authUserId);
        } catch (timeoutErr) {
          console.warn('User ID resolution timed out, using auth user ID');
          setUserId(authUserId);
        }
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
          // Set loading to false immediately, resolve userId in background
          setLoading(false);
          // Resolve userId asynchronously without blocking
          resolveUserId(session.user.id).catch(err => {
            console.error('Error resolving userId:', err);
          });
        } else {
          setLoading(false);
        }
      } catch (err) {
        console.error('Unexpected error during auth check:', err);
        setLoading(false);
      }
    };

    initAuth();

    // Listen for auth changes (including token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth event:', event);

      if (session?.user) {
        setUser(session.user);
        // Resolve userId in background, don't block
        resolveUserId(session.user.id).catch(err => {
          console.error('Error resolving userId in auth state change:', err);
        });
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setUserId(null);
        setNotes([]);
        setCurrentNoteId(null);
        setNotesLoading(false);
        setNotesLoadedOnce(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load notes from authenticated notes table
  useEffect(() => {
    if (!supabase || !userId) return;

    const loadNotes = async () => {
      setNotesLoading(true);
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
      } finally {
        setNotesLoading(false);
        setNotesLoadedOnce(true);
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

  const handleLogout = () => {
    if (!supabase) return;
    
    if (!confirm('আপনি কি সত্যিই লগআউট করতে চান?')) {
      return;
    }
    
    // Clear UI immediately so the click handler returns quickly (avoids "handler took Xms" violation)
    setUser(null);
    setUserId(null);
    setNotes([]);
    setCurrentNoteId(null);
    setNotesLoading(false);
    // Revoke session on server in the background; don't block the click handler
    supabase.auth.signOut().catch((err) => {
      console.error('Logout error:', err);
    });
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

  if (!user) {
    return <Auth onAuthSuccess={handleAuthSuccess} />;
  }
  // Wait for public.users id so loadNotes() uses the correct user_id (not auth UUID)
  if (!userId) {
    return (
      <div className="flex h-screen bg-slate-50 items-center justify-center">
        <div className="text-slate-400">লোড হচ্ছে...</div>
      </div>
    );
  }
  // Same full-screen loading until notes are ready — avoids position jump (one screen, not two)
  if (notesLoading || !notesLoadedOnce) {
    return (
      <div className="flex h-screen bg-slate-50 items-center justify-center">
        <div className="text-slate-400">লোড হচ্ছে...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden font-['Inter','Noto_Sans_Bengali']">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed md:static inset-y-0 left-0 z-50 md:z-auto
        transform transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <Sidebar
          notes={notes}
          currentNoteId={currentNoteId}
          onSelectNote={(id) => {
            setCurrentNoteId(id);
            setSidebarOpen(false); // Close sidebar on mobile when note is selected
          }}
          onNewNote={handleNewNote}
          onDeleteNote={handleDeleteNote}
          onExport={handleExportNotes}
          onImport={handleImportNotes}
        />
      </div>

      <main className="flex-1 flex flex-col relative min-w-0">
        {/* Mobile menu button and user controls */}
        <div className="absolute top-2 right-2 md:top-4 md:right-4 z-20 flex items-center gap-2 md:gap-3">
          {/* Mobile menu button */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="md:hidden p-2 bg-white rounded-lg shadow-sm border border-slate-200 text-slate-600 hover:bg-slate-50"
            aria-label="Toggle menu"
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          {/* User info - hidden on mobile, show on tablet+ */}
          <div className="hidden sm:flex items-center gap-2 px-2 md:px-3 py-1.5 bg-white rounded-lg shadow-sm border border-slate-200 text-xs md:text-sm text-slate-600">
            <User size={14} className="md:w-4 md:h-4" />
            <span className="truncate max-w-[120px] md:max-w-[200px]">{user.email}</span>
          </div>
          
          {/* Logout button */}
          <button
            onClick={handleLogout}
            className="flex items-center gap-1 md:gap-2 px-2 md:px-3 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-all text-xs md:text-sm font-medium"
            title="লগআউট"
          >
            <LogOut size={14} className="md:w-4 md:h-4" />
            <span className="hidden sm:inline">লগআউট</span>
          </button>
        </div>

        {currentNote ? (
          <>
            <div className="p-4 md:p-8 pb-2 md:pb-4 pt-12 md:pt-8 flex items-start justify-between">
              <div className="flex-1 max-w-4xl mx-auto w-full">
                <input
                  type="text"
                  value={currentNote.title}
                  onChange={(e) => updateTitle(e.target.value)}
                  className="w-full text-xl md:text-3xl font-bold bg-transparent border-none focus:outline-none focus:ring-0 text-slate-800"
                  placeholder="নোটের শিরোনাম"
                />
                <div className="flex flex-wrap items-center gap-2 md:gap-4 mt-2 text-xs md:text-sm text-slate-400">
                  <span className="flex items-center gap-1">
                    <Calendar size={12} className="md:w-3.5 md:h-3.5" />
                    {new Date(currentNote.createdAt).toLocaleDateString()}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock size={12} className="md:w-3.5 md:h-3.5" />
                    <span className="hidden sm:inline">শেষ আপডেট: </span>
                    {new Date(currentNote.updatedAt).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 md:px-8 py-2 md:py-4 scroll-smooth pb-24 md:pb-4">
              <div className="max-w-4xl mx-auto w-full min-h-[60vh] md:min-h-[70vh] bg-white shadow-sm rounded-2xl md:rounded-3xl p-4 md:p-8 lg:p-12 mb-4 md:mb-20 border border-slate-100">
                {currentNote.paragraphs.length === 0 ? (
                  <div className="h-full min-h-[40vh] md:min-h-[50vh] flex flex-col items-center justify-center text-slate-300 opacity-60 px-4">
                    <Edit3 size={48} className="md:w-16 md:h-16" strokeWidth={1} />
                    <p className="mt-4 text-sm md:text-lg text-center">নিচে থাকা বাটন চেপে কথা বলা শুরু করুন অথবা সরাসরি টাইপ করুন।</p>
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

            <div className="fixed md:absolute bottom-4 md:bottom-8 left-1/2 -translate-x-1/2 w-full max-w-xl px-4 z-10">
              <Recorder
                status={status}
                setStatus={setStatus}
                onTranscriptionComplete={handleTranscriptionComplete}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 px-4 pt-12 md:pt-0">
            <BookOpen size={60} className="md:w-20 md:h-20" strokeWidth={1} />
            <h2 className="text-xl md:text-2xl font-bold mt-4 text-slate-600 text-center">আপনার স্বরলিপি লাইব্রেরী খালি</h2>
            <p className="mt-2 mb-6 text-sm md:text-base text-center">নতুন একটি নোট তৈরি করে শুরু করুন</p>
            <button
              onClick={handleNewNote}
              className="px-6 md:px-8 py-2.5 md:py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all text-sm md:text-base"
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
