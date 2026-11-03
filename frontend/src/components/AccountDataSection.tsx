import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { deleteMyAccount, downloadTextFile, emailMatches, exportMyData, leaveAfterDeletion } from '../lib/accountData';

/** "Your data" part of the settings: download a copy, or delete the account. */
export default function AccountDataSection() {
    const { user } = useAuth();
    const [isExporting, setIsExporting] = useState(false);
    const [exportError, setExportError] = useState<string | null>(null);
    const [isConfirming, setIsConfirming] = useState(false);
    const [typedEmail, setTypedEmail] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    if (!user) return null;

    const handleExport = async () => {
        setIsExporting(true);
        setExportError(null);
        try {
            const { filename, json } = await exportMyData();
            downloadTextFile(filename, json);
        } catch (error) {
            console.error('Data export failed:', error);
            setExportError('Could not prepare your data. Please try again in a moment.');
        } finally {
            setIsExporting(false);
        }
    };

    const handleDelete = async () => {
        setIsDeleting(true);
        setDeleteError(null);
        try {
            await deleteMyAccount();
            leaveAfterDeletion();
        } catch (error) {
            console.error('Account deletion failed:', error);
            setDeleteError('We could not delete your account, and nothing was removed. Please try again, or email us and we will do it for you.');
            setIsDeleting(false);
        }
    };

    const cancelDelete = () => {
        setIsConfirming(false);
        setTypedEmail('');
        setDeleteError(null);
    };

    return (
        <div>
            <h4 className="font-semibold text-[#1f382a] border-b border-gray-100 pb-2 mb-3">Your data</h4>

            <p className="text-xs text-gray-500 mb-2">Download everything we hold about you (formulas, stash, batches, community posts, ratings and profile) as one JSON file.</p>
            <button
                type="button"
                onClick={handleExport}
                disabled={isExporting}
                className="px-4 py-2 text-sm font-medium border border-[#c1d1b9] rounded-lg bg-white text-[#2c4c3b] hover:bg-[#e9eee7] transition-colors disabled:opacity-50"
            >
                {isExporting ? 'Preparing...' : 'Download my data'}
            </button>
            {exportError && <p role="alert" className="text-xs text-red-600 mt-2">{exportError}</p>}

            <div className="mt-5 border border-red-200 bg-red-50/50 rounded-lg p-4">
                <h5 className="text-sm font-bold text-red-700">Delete my account</h5>
                {!isConfirming ? (
                    <>
                        <p className="text-xs text-gray-600 mt-1 mb-3">Permanently deletes your login and all your data, including formulas, stash, batches and everything you posted to the community. This cannot be undone.</p>
                        <button
                            type="button"
                            onClick={() => setIsConfirming(true)}
                            className="px-4 py-2 text-sm font-medium border border-red-300 rounded-lg bg-white text-red-700 hover:bg-red-50 transition-colors"
                        >
                            Delete my account...
                        </button>
                    </>
                ) : (
                    <div className="mt-2 space-y-3">
                        <p className="text-xs text-gray-700">
                            This will permanently delete the account <strong>{user.email}</strong> and everything in it. Consider downloading your data first.
                        </p>
                        <label className="block text-xs font-medium text-gray-700">
                            Type your email address to confirm
                            <input
                                type="email"
                                value={typedEmail}
                                onChange={(e) => setTypedEmail(e.target.value)}
                                autoComplete="off"
                                placeholder={user.email ?? ''}
                                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-red-500 outline-none"
                            />
                        </label>
                        {deleteError && <p role="alert" className="text-xs text-red-600">{deleteError}</p>}
                        <div className="flex gap-2 justify-end">
                            <button type="button" onClick={cancelDelete} disabled={isDeleting} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50">
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleDelete}
                                disabled={!emailMatches(typedEmail, user.email) || isDeleting}
                                className="px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {isDeleting ? 'Deleting...' : 'Delete everything'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
