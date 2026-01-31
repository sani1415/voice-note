import React from 'react';
import type { UpdateCheckResult } from '../services/updateService';

type Props = {
  update: Extract<UpdateCheckResult, { available: true }>;
  onUpdate: () => void;
  onLater: () => void;
  updating: boolean;
};

const UpdateDialog: React.FC<Props> = ({ update, onUpdate, onLater, updating }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="update-dialog-title">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h2 id="update-dialog-title" className="text-lg font-bold text-slate-800">
          আপডেট উপলব্ধ
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          অ্যাপের নতুন সংস্করণ ({update.version}) উপলব্ধ। আপডেট করলে অ্যাপ পুনরায় ইনস্টল ছাড়াই আপডেট হবে।
        </p>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onLater}
            disabled={updating}
            className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            পরে
          </button>
          <button
            type="button"
            onClick={onUpdate}
            disabled={updating}
            className="flex-1 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {updating ? 'আপডেট হচ্ছে...' : 'আপডেট করুন'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UpdateDialog;
