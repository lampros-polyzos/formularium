import React from 'react';

interface CustomModalProps {
    isOpen: boolean;
    type: 'error' | 'success' | 'confirm' | 'info';
    title: string;
    message: string;
    onClose: () => void;
    onConfirm?: () => void;
}

const CustomModal: React.FC<CustomModalProps> = ({ isOpen, type, title, message, onClose, onConfirm }) => {
    if (!isOpen) return null;

    const getTitleColor = () => {
        switch (type) {
            case 'error': return 'text-red-600';
            case 'success': return 'text-[#2c4c3b]';
            case 'confirm': return 'text-amber-600';
            default: return 'text-[#1f382a]';
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 transform transition-all">
                <h3 className={`text-lg font-bold mb-2 ${getTitleColor()}`}>
                    {title}
                </h3>
                <p className="text-gray-600 text-sm mb-6">{message}</p>

                <div className="flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                        {type === 'confirm' ? 'Cancel' : 'Close'}
                    </button>

                    {type === 'confirm' && onConfirm && (
                        <button
                            onClick={onConfirm}
                            className="px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
                        >
                            Delete
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CustomModal;