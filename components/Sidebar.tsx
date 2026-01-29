
import React, { useRef } from 'react';
import { Note } from '../types';
import { Plus, MessageSquare, Trash2, BookOpen, Download, Upload, Database } from 'lucide-react';

interface SidebarProps {
  notes: Note[];
  currentNoteId: string | null;
  onSelectNote: (id: string) => void;
  onNewNote: () => void;
  onDeleteNote: (id: string) => void;
  onExport: () => void;
  onImport: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  notes, 
  currentNoteId, 
  onSelectNote, 
  onNewNote, 
  onDeleteNote,
  onExport,
  onImport
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="w-80 h-full bg-slate-50 border-r border-slate-200 flex flex-col">
      <div className="p-6">
        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2 mb-6">
          <BookOpen className="text-indigo-600" />
          স্বরলিপি AI
        </h1>
        <button
          onClick={onNewNote}
          className="w-full flex items-center justify-center gap-2 bg-white border-2 border-dashed border-slate-300 text-slate-600 p-3 rounded-xl hover:border-indigo-400 hover:text-indigo-600 transition-all font-medium"
        >
          <Plus size={18} />
          নতুন নোট তৈরি করুন
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 space-y-2 pb-6">
        <h2 className="px-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">লাইব্রেরী</h2>
        {notes.length === 0 ? (
          <p className="px-2 text-sm text-slate-400 italic">কোন নোট নেই</p>
        ) : (
          notes.sort((a,b) => b.updatedAt - a.updatedAt).map((note) => (
            <div
              key={note.id}
              className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all ${
                currentNoteId === note.id ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'hover:bg-white text-slate-600'
              }`}
              onClick={() => onSelectNote(note.id)}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <MessageSquare size={18} className={currentNoteId === note.id ? 'text-indigo-500' : 'text-slate-400'} />
                <span className="truncate font-medium">{note.title || 'শিরোনামহীন নোট'}</span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteNote(note.id);
                }}
                className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-600 transition-all"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="p-4 border-t border-slate-200 bg-slate-100/50">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-2">
          <Database size={12} />
          স্টোরেজ ও ব্যাকআপ
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onExport}
            className="flex items-center justify-center gap-2 text-xs bg-white border border-slate-200 p-2 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 transition-all text-slate-600 font-medium shadow-sm"
          >
            <Download size={14} />
            ব্যাকআপ
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center gap-2 text-xs bg-white border border-slate-200 p-2 rounded-lg hover:bg-emerald-50 hover:text-emerald-600 transition-all text-slate-600 font-medium shadow-sm"
          >
            <Upload size={14} />
            ইমপোর্ট
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={onImport}
            accept=".json"
            className="hidden"
          />
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
