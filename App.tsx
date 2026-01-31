import React, { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import Recorder from './components/Recorder';
import Auth from './components/Auth';
import UpdateDialog from './components/UpdateDialog';
import { Note, TranscriptParagraph, RecordingStatus, Folder } from './types';
import { Calendar, Clock, Edit3, BookOpen, LogOut, User, List, FileText, Undo2, Copy } from 'lucide-react';
import { supabase } from './supabaseClient';
import {
  checkForUpdate,
  applyUpdate,
  notifyAppReady,
  hasUpdateConfig,
  type UpdateCheckResult,
} from './services/updateService';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileTab, setMobileTab] = useState<'notes' | 'note'>('notes');
  const [canUndo, setCanUndo] = useState(false);
  const undoSnapshotRef = useRef<{ noteId: string; title: string; paragraphs: TranscriptParagraph[] } | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const selectionRangeRef = useRef<{ start: number; end: number } | null>(null);
  const bodyTextAtRecordRef = useRef<string>('');
  const bodyTextareaMobileRef = useRef<HTMLTextAreaElement | null>(null);
  const bodyTextareaDesktopRef = useRef<HTMLTextAreaElement | null>(null);
  const lastSelectionRef = useRef<{ start: number; end: number; value: string } | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
  const [replacingSelection, setReplacingSelection] = useState(false);
  const [replacingSelectionRange, setReplacingSelectionRange] = useState<{ start: number; end: number } | null>(null);
  const [replacingSelectionBody, setReplacingSelectionBody] = useState('');
  const overlayMobileRef = useRef<HTMLDivElement | null>(null);
  const overlayDesktopRef = useRef<HTMLDivElement | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState<UpdateCheckResult | null>(null);
  const [updateUpdating, setUpdateUpdating] = useState(false);

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
            folder_id: row.folder_id ?? null,
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

    const loadFolders = async () => {
      if (!supabase || !userId) return;
      try {
        const { data: folderData, error } = await supabase
          .from('folders')
          .select('id, name, created_at')
          .order('name');
        if (error) {
          // 404 = folders table doesn't exist yet (run supabase-schema.sql migration)
          if (error.code === 'PGRST116' || error.message?.includes('404')) {
            setFolders([]);
            return;
          }
          throw error;
        }
        setFolders((folderData as Folder[]) ?? []);
      } catch (err) {
        console.warn('Folders not available (run folders migration in Supabase if you need them):', err);
        setFolders([]);
      }
    };

    loadNotes();
    loadFolders();
  }, [userId]);

  const persistNoteToCloud = async (note: Note) => {
    if (!supabase || !userId) return;
    
    try {
      await supabase.from('notes').upsert({
        id: note.id,
        user_id: userId,
        folder_id: note.folder_id ?? null,
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
    setFolders([]);
    setSelectedFolderId(null);
    setSelectionMode(false);
    setSelectedNoteIds(new Set());
    // Revoke session on server in the background; don't block the click handler
    supabase.auth.signOut().catch((err) => {
      console.error('Logout error:', err);
    });
  };

  const currentNote = notes.find((n) => n.id === currentNoteId);

  const bodyText = currentNote
    ? currentNote.paragraphs.map((p) => p.text).join(' ').trim()
    : '';
  const noteWordCount = currentNote
    ? bodyText.split(/\s+/).filter(Boolean).length
    : 0;
  const noteCharCount = currentNote
    ? currentNote.paragraphs.map((p) => p.text).join('').length
    : 0;

  const [copyFeedback, setCopyFeedback] = useState(false);
  const handleCopyNoteBody = useCallback(() => {
    if (!currentNote) return;
    const text = currentNote.paragraphs.map((p) => p.text).join('\n\n');
    if (text) {
      navigator.clipboard.writeText(text).then(() => {
        setCopyFeedback(true);
        setTimeout(() => setCopyFeedback(false), 1500);
      });
    }
  }, [currentNote]);

  const notesForList = selectedFolderId == null
    ? notes
    : notes.filter((n) => n.folder_id === selectedFolderId);

  const handleNewNote = () => {
    const newNote: Note = {
      id: crypto.randomUUID(),
      title: 'নতুন নোট - ' + new Date().toLocaleTimeString(),
      paragraphs: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      folder_id: selectedFolderId,
    };
    setNotes([newNote, ...notes]);
    setCurrentNoteId(newNote.id);
    setMobileTab('note');
    persistNoteToCloud(newNote);
  };

  const handleCreateFolder = async () => {
    const name = prompt('ফোল্ডারের নাম লিখুন');
    if (!name?.trim() || !supabase || !userId) return;
    try {
      const { data, error } = await supabase
        .from('folders')
        .insert({ user_id: userId, name: name.trim() })
        .select()
        .single();
      if (!error && data) {
        setFolders((prev) => [...prev, data as Folder]);
        setSelectedFolderId(data.id);
      }
    } catch (err) {
      console.error('Failed to create folder', err);
    }
  };

  const handleMoveNoteToFolder = useCallback((noteId: string, folderId: string | null) => {
    setNotes((prev) =>
      prev.map((n) => {
        if (n.id !== noteId) return n;
        const updated: Note = { ...n, folder_id: folderId, updatedAt: Date.now() };
        persistNoteToCloud(updated);
        return updated;
      })
    );
  }, []);

  const handleDeleteNote = (id: string) => {
    if (!confirm("আপনি কি নিশ্চিতভাবে এই নোটটি মুছে ফেলতে চান?")) return;
    const filtered = notes.filter((n) => n.id !== id);
    setNotes(filtered);
    if (currentNoteId === id) {
      setCurrentNoteId(filtered.length > 0 ? filtered[0].id : null);
    }
    setSelectedNoteIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    deleteNoteFromCloud(id);
  };

  const handleToggleSelectionMode = () => {
    setSelectionMode((s) => !s);
    setSelectedNoteIds(new Set());
  };

  const handleToggleSelectNote = (id: string) => {
    setSelectedNoteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteSelected = () => {
    if (selectedNoteIds.size === 0) return;
    if (!confirm(`নির্বাচিত ${selectedNoteIds.size}টি নোট মুছে ফেলবেন?`)) return;
    const ids = Array.from(selectedNoteIds);
    setNotes((prev) => {
      const filtered = prev.filter((n) => !selectedNoteIds.has(n.id));
      return filtered;
    });
    if (currentNoteId && selectedNoteIds.has(currentNoteId)) {
      const remaining = notes.filter((n) => !selectedNoteIds.has(n.id));
      setCurrentNoteId(remaining.length > 0 ? remaining[0].id : null);
    }
    setSelectedNoteIds(new Set());
    setSelectionMode(false);
    ids.forEach((id) => deleteNoteFromCloud(id));
  };

  const handleDeleteFolder = async (folderId: string) => {
    const notesInFolder = notes.filter((n) => n.folder_id === folderId).length;
    const message = notesInFolder > 0
      ? `এই ফোল্ডারটি এবং ভিতরের ${notesInFolder}টি নোট সব মুছে যাবে। চালিয়ে যেতে চান?`
      : 'এই ফোল্ডারটি মুছে ফেলবেন?';
    if (!confirm(message)) return;
    if (!supabase || !userId) return;
    try {
      await supabase.from('folders').delete().eq('id', folderId).eq('user_id', userId);
      setFolders((prev) => prev.filter((f) => f.id !== folderId));
      if (selectedFolderId === folderId) setSelectedFolderId(null);
      const deletedNoteIds = new Set(notes.filter((n) => n.folder_id === folderId).map((n) => n.id));
      setNotes((prev) => prev.filter((n) => n.folder_id !== folderId));
      if (currentNoteId && deletedNoteIds.has(currentNoteId)) {
        const remaining = notes.filter((n) => n.folder_id !== folderId);
        setCurrentNoteId(remaining.length > 0 ? remaining[0].id : null);
      }
      setSelectedNoteIds((prev) => {
        const next = new Set(prev);
        deletedNoteIds.forEach((id) => next.delete(id));
        return next;
      });
    } catch (err) {
      console.error('Failed to delete folder', err);
      alert('ফোল্ডার মুছতে সমস্যা হয়েছে।');
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

  const saveUndoSnapshot = useCallback(() => {
    const note = notes.find((n) => n.id === currentNoteId);
    if (note) {
      undoSnapshotRef.current = {
        noteId: note.id,
        title: note.title,
        paragraphs: note.paragraphs.map((p) => ({ ...p })),
      };
      setCanUndo(true);
    }
  }, [notes, currentNoteId]);

  const handleUndo = useCallback(() => {
    const snap = undoSnapshotRef.current;
    if (!snap) return;
    setNotes((prev) =>
      prev.map((n) => {
        if (n.id === snap.noteId) {
          const restored: Note = {
            ...n,
            title: snap.title,
            paragraphs: snap.paragraphs.map((p) => ({ ...p })),
            updatedAt: Date.now(),
          };
          persistNoteToCloud(restored);
          return restored;
        }
        return n;
      })
    );
    undoSnapshotRef.current = null;
    setCanUndo(false);
  }, []);

  const updateTitle = (newTitle: string) => {
    saveUndoSnapshot();
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

  // Clear undo and selection replace when switching to another note
  useEffect(() => {
    setCanUndo(false);
    undoSnapshotRef.current = null;
    selectionRangeRef.current = null;
  }, [currentNoteId]);

  useEffect(() => {
    if (status === 'idle') {
      setReplacingSelection(false);
      setReplacingSelectionRange(null);
      setReplacingSelectionBody('');
    }
  }, [status]);

  useEffect(() => {
    if (!replacingSelection || !replacingSelectionRange) return;
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    const textarea = isMobile ? bodyTextareaMobileRef.current : bodyTextareaDesktopRef.current;
    const overlay = isMobile ? overlayMobileRef.current : overlayDesktopRef.current;
    if (textarea && overlay) {
      overlay.scrollTop = textarea.scrollTop;
      overlay.scrollLeft = textarea.scrollLeft;
    }
  }, [replacingSelection, replacingSelectionRange]);

  const syncOverlayScroll = useCallback((e: React.UIEvent<HTMLTextAreaElement>, isMobile: boolean) => {
    const overlay = isMobile ? overlayMobileRef.current : overlayDesktopRef.current;
    if (overlay && e.target instanceof HTMLTextAreaElement) {
      overlay.scrollTop = e.target.scrollTop;
      overlay.scrollLeft = e.target.scrollLeft;
    }
  }, []);

  // Notify Live Update plugin that app is ready (avoids rollback)
  useEffect(() => {
    if (!loading && user && userId) notifyAppReady();
  }, [loading, user, userId]);

  // Check for in-app update (OTA) when app is ready and manifest URL is set
  useEffect(() => {
    if (!userId || !hasUpdateConfig()) return;
    let cancelled = false;
    checkForUpdate().then((result) => {
      if (!cancelled && result.available) setUpdateAvailable(result);
    });
    return () => { cancelled = true; };
  }, [userId]);

  const handleUpdateConfirm = useCallback(async () => {
    if (!updateAvailable || !updateAvailable.available || updateUpdating) return;
    setUpdateUpdating(true);
    try {
      await applyUpdate(updateAvailable.version, updateAvailable.url);
    } catch {
      setUpdateUpdating(false);
    }
  }, [updateAvailable, updateUpdating]);

  /** Single body text: join/split by double newline; updates current note paragraphs */
  const updateNoteBody = useCallback((bodyText: string) => {
    saveUndoSnapshot();
    const blocks = bodyText.split(/\n\n+/).filter((s) => s.trim() !== '').map((s) => s.trim());
    if (blocks.length === 0) {
      setNotes((prev) =>
        prev.map((n) => {
          if (n.id !== currentNoteId) return n;
          const updated: Note = { ...n, paragraphs: [], updatedAt: Date.now() };
          persistNoteToCloud(updated);
          return updated;
        })
      );
      return;
    }
    setNotes((prev) =>
      prev.map((n) => {
        if (n.id !== currentNoteId) return n;
        const existing = n.paragraphs;
        const newParagraphs: TranscriptParagraph[] = blocks.map((text, i) => {
          if (i < existing.length) return { ...existing[i], text };
          return { id: crypto.randomUUID(), text, timestamp: Date.now() };
        });
        const updated: Note = { ...n, paragraphs: newParagraphs, updatedAt: Date.now() };
        persistNoteToCloud(updated);
        return updated;
      })
    );
  }, [currentNoteId, saveUndoSnapshot]);

  const captureSelection = useCallback((e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    lastSelectionRef.current = { start: target.selectionStart, end: target.selectionEnd, value: target.value };
  }, []);

  const handleRecordingStart = useCallback(() => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    const el = isMobile ? bodyTextareaMobileRef.current : bodyTextareaDesktopRef.current;
    const currentBody = currentNoteId && notes.find((n) => n.id === currentNoteId)
      ? notes.find((n) => n.id === currentNoteId)!.paragraphs.map((p) => p.text).join('\n\n')
      : '';
    if (el && el.selectionStart !== el.selectionEnd) {
      const range = { start: el.selectionStart, end: el.selectionEnd };
      selectionRangeRef.current = range;
      bodyTextAtRecordRef.current = el.value;
      setReplacingSelectionRange(range);
      setReplacingSelectionBody(el.value);
      setReplacingSelection(true);
      return;
    }
    if (lastSelectionRef.current && lastSelectionRef.current.start !== lastSelectionRef.current.end && lastSelectionRef.current.value === currentBody) {
      const range = { start: lastSelectionRef.current.start, end: lastSelectionRef.current.end };
      selectionRangeRef.current = range;
      bodyTextAtRecordRef.current = lastSelectionRef.current.value;
      setReplacingSelectionRange(range);
      setReplacingSelectionBody(lastSelectionRef.current.value);
      setReplacingSelection(true);
      return;
    }
    selectionRangeRef.current = null;
    setReplacingSelection(false);
    setReplacingSelectionRange(null);
    setReplacingSelectionBody('');
  }, [currentNoteId, notes]);

  const handleTranscriptionComplete = useCallback((text: string) => {
    setReplacingSelection(false);
    setReplacingSelectionRange(null);
    setReplacingSelectionBody('');
    const selection = selectionRangeRef.current;
    selectionRangeRef.current = null;

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
      setStatus('idle');
      return;
    }

    if (selection && bodyTextAtRecordRef.current !== undefined) {
      const body = bodyTextAtRecordRef.current;
      const newBody = body.slice(0, selection.start) + text + body.slice(selection.end);
      updateNoteBody(newBody);
      bodyTextAtRecordRef.current = '';
      setStatus('idle');
      return;
    }

    setNotes((prev) => {
      const updated = prev.map((n) => {
        if (n.id !== currentNoteId) return n;
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
      });
      return updated;
    });
    setStatus('idle');
  }, [currentNoteId, updateNoteBody]);

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

  const handleSelectNote = (id: string) => {
    setCurrentNoteId(id);
    setSidebarOpen(false);
    setMobileTab('note'); // Switch to Current note tab on mobile
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden font-['Inter','Noto_Sans_Bengali']">
      {/* Desktop: sidebar (hidden on mobile; mobile uses tabs instead) */}
      <div className="hidden md:block md:flex-shrink-0">
        <Sidebar
          notes={notesForList}
          currentNoteId={currentNoteId}
          onSelectNote={handleSelectNote}
          onNewNote={handleNewNote}
          onDeleteNote={handleDeleteNote}
          onExport={handleExportNotes}
          onImport={handleImportNotes}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          folders={folders}
          selectedFolderId={selectedFolderId}
          onSelectFolder={setSelectedFolderId}
          onCreateFolder={handleCreateFolder}
          onDeleteFolder={handleDeleteFolder}
          selectionMode={selectionMode}
          selectedNoteIds={selectedNoteIds}
          onToggleSelectionMode={handleToggleSelectionMode}
          onToggleSelectNote={handleToggleSelectNote}
          onDeleteSelected={handleDeleteSelected}
          variant="sidebar"
        />
      </div>

      <main className="flex-1 flex flex-col relative min-w-0 overflow-hidden">
        {/* Top bar: user info + logout (desktop); on mobile shown above tab content when needed) */}
        <div className="absolute top-2 right-2 md:top-4 md:right-4 z-20 flex items-center gap-2 md:gap-3">
          <div className="hidden sm:flex items-center gap-2 px-2 md:px-3 py-1.5 bg-white rounded-lg shadow-sm border border-slate-200 text-xs md:text-sm text-slate-600">
            <User size={14} className="md:w-4 md:h-4" />
            <span className="truncate max-w-[120px] md:max-w-[200px]">{user.email}</span>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1 md:gap-2 px-2 md:px-3 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-all text-xs md:text-sm font-medium"
            title="লগআউট"
          >
            <LogOut size={14} className="md:w-4 md:h-4" />
            <span className="hidden sm:inline">লগআউট</span>
          </button>
        </div>

        {/* Mobile: tab content (Notes list or Current note) */}
        <div className="flex-1 flex flex-col min-h-0 md:min-h-0">
          {/* Mobile tab bar */}
          <div className="md:hidden flex border-b border-slate-200 bg-white shrink-0">
            <button
              type="button"
              onClick={() => setMobileTab('notes')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
                mobileTab === 'notes'
                  ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <List size={18} />
              নোট তালিকা
            </button>
            <button
              type="button"
              onClick={() => setMobileTab('note')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
                mobileTab === 'note'
                  ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <FileText size={18} />
              বর্তমান নোট
            </button>
          </div>

          {/* Mobile: show Notes list or Current note based on tab */}
          <div className="md:hidden flex-1 min-h-0 overflow-hidden flex flex-col">
            {mobileTab === 'notes' ? (
              <Sidebar
                notes={notesForList}
                currentNoteId={currentNoteId}
                onSelectNote={handleSelectNote}
                onNewNote={handleNewNote}
                onDeleteNote={handleDeleteNote}
                onExport={handleExportNotes}
                onImport={handleImportNotes}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                folders={folders}
                selectedFolderId={selectedFolderId}
                onSelectFolder={setSelectedFolderId}
                onCreateFolder={handleCreateFolder}
                onDeleteFolder={handleDeleteFolder}
                selectionMode={selectionMode}
                selectedNoteIds={selectedNoteIds}
                onToggleSelectionMode={handleToggleSelectionMode}
                onToggleSelectNote={handleToggleSelectNote}
                onDeleteSelected={handleDeleteSelected}
                variant="full"
              />
            ) : (
              <div className="flex-1 flex flex-col min-h-0 overflow-auto">
                {currentNote ? (
                  <>
                    <div className="p-4 pb-2 pt-4 flex flex-col">
                      <input
                        type="text"
                        value={currentNote.title}
                        onChange={(e) => updateTitle(e.target.value)}
                        className="w-full text-xl font-bold bg-transparent border-none focus:outline-none focus:ring-0 text-slate-800"
                        placeholder="নোটের শিরোনাম"
                      />
                      <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-slate-400">
                        <span>{new Date(currentNote.createdAt).toLocaleDateString()}</span>
                        <span>{new Date(currentNote.updatedAt).toLocaleTimeString()}</span>
                        <span className="text-slate-300">{noteWordCount} শব্দ · {noteCharCount} অক্ষর</span>
                        <button
                          type="button"
                          onClick={handleCopyNoteBody}
                          className="flex items-center gap-1 text-indigo-600 hover:text-indigo-700 font-medium"
                          title="নোটের লেখা কপি করুন"
                        >
                          <Copy size={14} />
                          {copyFeedback ? 'কপি হয়েছে' : 'কপি'}
                        </button>
                        {folders.length > 0 && (
                          <select
                            value={currentNote.folder_id ?? ''}
                            onChange={(e) => handleMoveNoteToFolder(currentNote.id, e.target.value || null)}
                            className="text-slate-500 bg-slate-50 border border-slate-200 rounded px-2 py-1"
                            title="ফোল্ডারে সরান"
                          >
                            <option value="">ফোল্ডার নেই</option>
                            {folders.map((f) => (
                              <option key={f.id} value={f.id}>{f.name}</option>
                            ))}
                          </select>
                        )}
                        {canUndo && (
                          <button
                            type="button"
                            onClick={handleUndo}
                            className="flex items-center gap-1 text-indigo-600 hover:text-indigo-700 font-medium"
                          >
                            <Undo2 size={14} />
                            পূর্বাবস্থা
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto px-4 py-2">
                      <div className="max-w-4xl mx-auto min-h-[40vh] bg-white rounded-2xl p-4 border border-slate-100">
                        <div className="relative">
                          <textarea
                            ref={bodyTextareaMobileRef}
                            data-body-textarea="true"
                            value={currentNote.paragraphs.map((p) => p.text).join('\n\n')}
                            onChange={(e) => updateNoteBody(e.target.value)}
                            onSelect={captureSelection}
                            onScroll={(e) => syncOverlayScroll(e, true)}
                            placeholder="এখানে লিখুন বা নিচে মাইক চেপে কথা বলুন। নির্বাচিত টেক্সট থাকলে রেকর্ড করলে সেটা প্রতিস্থাপন হবে।"
                            className="w-full min-h-[30vh] text-base text-slate-700 leading-relaxed bg-transparent border-none focus:ring-0 outline-none resize-none p-0 font-['Inter','Noto_Sans_Bengali']"
                            style={{ fontFamily: 'inherit' }}
                          />
                          {replacingSelection && replacingSelectionRange && (
                            <div
                              ref={overlayMobileRef}
                              className="absolute inset-0 overflow-auto pointer-events-none whitespace-pre-wrap text-base text-slate-700 leading-relaxed p-0 font-['Inter','Noto_Sans_Bengali'] bg-white"
                              style={{ fontFamily: 'inherit' }}
                              aria-hidden
                            >
                              {replacingSelectionBody.slice(0, replacingSelectionRange.start)}
                              <span className="bg-amber-200/70 rounded-sm">{replacingSelectionBody.slice(replacingSelectionRange.start, replacingSelectionRange.end)}</span>
                              {replacingSelectionBody.slice(replacingSelectionRange.end)}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="p-4 pt-2 pb-6 flex flex-col items-center gap-3">
                      <button
                        type="button"
                        onClick={handleNewNote}
                        className="text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1.5"
                      >
                        <FileText size={16} />
                        নতুন নোট
                      </button>
                      {(status === 'recording' || status === 'paused') && replacingSelection && (
                        <p className="text-sm text-indigo-600 font-medium" role="status">
                          নির্বাচিত অংশ প্রতিস্থাপন হবে
                        </p>
                      )}
                      <Recorder
                        status={status}
                        setStatus={setStatus}
                        onTranscriptionComplete={handleTranscriptionComplete}
                        onRecordingStart={handleRecordingStart}
                      />
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-400 px-4 py-8">
                    <FileText size={48} className="text-slate-300" />
                    <p className="mt-4 text-slate-600 text-center">নোট তালিকা থেকে একটি নোট নির্বাচন করুন</p>
                    <button
                      type="button"
                      onClick={() => setMobileTab('notes')}
                      className="mt-4 text-indigo-600 font-medium text-sm"
                    >
                      নোট তালিকায় যান
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Desktop: main content (unchanged) */}
          <div className="hidden md:flex md:flex-1 md:flex-col md:min-h-0">
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
                  <span className="text-slate-300">{noteWordCount} শব্দ · {noteCharCount} অক্ষর</span>
                  <button
                    type="button"
                    onClick={handleCopyNoteBody}
                    className="flex items-center gap-1 text-indigo-600 hover:text-indigo-700 font-medium"
                    title="নোটের লেখা কপি করুন"
                  >
                    <Copy size={14} className="md:w-3.5 md:h-3.5" />
                    {copyFeedback ? 'কপি হয়েছে' : 'কপি'}
                  </button>
                  {folders.length > 0 && (
                    <select
                      value={currentNote.folder_id ?? ''}
                      onChange={(e) => handleMoveNoteToFolder(currentNote.id, e.target.value || null)}
                      className="text-slate-500 text-xs md:text-sm bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5"
                      title="ফোল্ডারে সরান"
                    >
                      <option value="">ফোল্ডার নেই</option>
                      {folders.map((f) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  )}
                  {canUndo && (
                    <button
                      type="button"
                      onClick={handleUndo}
                      className="flex items-center gap-1 text-indigo-600 hover:text-indigo-700 font-medium"
                    >
                      <Undo2 size={14} className="md:w-3.5 md:h-3.5" />
                      পূর্বাবস্থা
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 md:px-8 py-2 md:py-4 scroll-smooth pb-24 md:pb-4">
              <div className="max-w-4xl mx-auto w-full min-h-[60vh] md:min-h-[70vh] bg-white shadow-sm rounded-2xl md:rounded-3xl p-4 md:p-8 lg:p-12 mb-4 md:mb-20 border border-slate-100">
                <div className="relative">
                  <textarea
                    ref={bodyTextareaDesktopRef}
                    data-body-textarea="true"
                    value={currentNote.paragraphs.map((p) => p.text).join('\n\n')}
                    onChange={(e) => updateNoteBody(e.target.value)}
                    onSelect={captureSelection}
                    onScroll={(e) => syncOverlayScroll(e, false)}
                    placeholder="এখানে লিখুন বা নিচে মাইক চেপে কথা বলুন। টেক্সট সিলেক্ট করে রেকর্ড করলে সিলেক্টেড অংশ প্রতিস্থাপন হবে।"
                    className="w-full min-h-[50vh] text-base md:text-lg lg:text-xl text-slate-700 leading-relaxed bg-transparent border-none focus:ring-0 outline-none resize-none p-0 font-['Inter','Noto_Sans_Bengali']"
                    style={{ fontFamily: 'inherit' }}
                  />
                  {replacingSelection && replacingSelectionRange && (
                    <div
                      ref={overlayDesktopRef}
                      className="absolute inset-0 overflow-auto pointer-events-none whitespace-pre-wrap text-base md:text-lg lg:text-xl text-slate-700 leading-relaxed p-0 font-['Inter','Noto_Sans_Bengali'] bg-white"
                      style={{ fontFamily: 'inherit' }}
                      aria-hidden
                    >
                      {replacingSelectionBody.slice(0, replacingSelectionRange.start)}
                      <span className="bg-amber-200/70 rounded-sm">{replacingSelectionBody.slice(replacingSelectionRange.start, replacingSelectionRange.end)}</span>
                      {replacingSelectionBody.slice(replacingSelectionRange.end)}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="fixed md:absolute bottom-4 md:bottom-8 left-1/2 -translate-x-1/2 w-full max-w-xl px-4 z-10 flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={handleNewNote}
                className="text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1.5"
              >
                <FileText size={16} />
                নতুন নোট
              </button>
              {(status === 'recording' || status === 'paused') && replacingSelection && (
                <p className="text-sm text-indigo-600 font-medium" role="status">
                  নির্বাচিত অংশ প্রতিস্থাপন হবে
                </p>
              )}
              <Recorder
                status={status}
                setStatus={setStatus}
                onTranscriptionComplete={handleTranscriptionComplete}
                onRecordingStart={handleRecordingStart}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 px-4 pt-12 md:pt-0">
            <BookOpen size={60} className="md:w-20 md:h-20" strokeWidth={1} />
            <h2 className="text-xl md:text-2xl font-bold mt-4 text-slate-600 text-center">আপনার স্বরলিপি লাইব্রেরী খালি</h2>
            <p className="mt-2 text-sm md:text-base text-center">নতুন একটি নোট তৈরি করে শুরু করুন</p>
            <p className="mt-3 text-sm text-indigo-600/90 text-center max-w-sm">
              নিচে <strong>মাইক</strong> বাটন চাপে কথা বলুন — আপনার প্রথম ভয়েস নোট অটো লিখে দেওয়া হবে।
            </p>
            <button
              onClick={handleNewNote}
              className="mt-6 px-6 md:px-8 py-2.5 md:py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all text-sm md:text-base"
            >
              নতুন নোট শুরু করুন
            </button>
          </div>
        )}
          </div>
        </div>
      </main>
      {updateAvailable?.available && (
        <UpdateDialog
          update={updateAvailable}
          onUpdate={handleUpdateConfirm}
          onLater={() => setUpdateAvailable(null)}
          updating={updateUpdating}
        />
      )}
    </div>
  );
};

export default App;
