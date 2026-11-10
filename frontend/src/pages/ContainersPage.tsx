import React, { useState, useEffect, useMemo } from 'react';
import { addContainer, changeContainer, deleteContainer, fetchContainers as fetchContainerRows } from '../lib/libraryApi';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import CustomModal from '../components/CustomModal';
import StudioLayout from '../components/StudioLayout';

type ContainerItem = {
    id: string;
    user_id: string;
    name: string;
    container_type: string;
    material: string | null;
    volume_ml: number | null;
    quantity: number;
    price_per_unit: number;
    supplier_name: string | null;
    image_url: string | null;
    notes: string | null;
    low_stock_threshold?: number;
};

interface ContainerFormData {
    name: string;
    container_type: string;
    material: string;
    volume_ml: number;
    quantity: number;
    price_per_unit: number;
    supplier_name: string;
    image_url: string;
    notes: string;
    low_stock_threshold: number;
}

const CONTAINER_TYPES = ['Bottle', 'Jar', 'Tube', 'Closure / Pump', 'Tin', 'Box / Outer', 'Other'];

const ContainerIcon = ({ type }: { type: string }) => {
    const svgProps = {
        viewBox: "0 0 600 320",
        className: "w-full h-full object-contain p-4", // p-4 adds the "safe zone" padding
        fill: "none",
        xmlns: "http://www.w3.org/2000/svg"
    };

    const strokeColor = "#1f382a";
    const fillColor = "#f8faf9";

    switch (type) {
        case 'Bottle':
            return (
                <svg {...svgProps}>
                    {/* Bottle Body */}
                    <path d="M260 140 V260 C260 271 269 280 280 280 H320 C331 280 340 271 340 260 V140 C340 120 320 110 320 100 V80 H280 V100 C280 110 260 120 260 140 Z" fill={fillColor} stroke={strokeColor} strokeWidth="8" strokeLinejoin="round" />
                    {/* Cap */}
                    <rect x="275" y="50" width="50" height="30" rx="6" fill={fillColor} stroke={strokeColor} strokeWidth="8" strokeLinejoin="round" />
                    {/* Minimal Label */}
                    <rect x="280" y="160" width="40" height="60" rx="4" stroke={strokeColor} strokeWidth="6" />
                </svg>
            );
        case 'Jar':
            return (
                <svg {...svgProps}>
                    {/* Jar Body */}
                    <path d="M230 180 V250 C230 266.5 243.5 280 260 280 H340 C356.5 280 370 266.5 370 250 V180 Z" fill={fillColor} stroke={strokeColor} strokeWidth="8" strokeLinejoin="round" />
                    {/* Lid */}
                    <rect x="220" y="130" width="160" height="50" rx="8" fill={fillColor} stroke={strokeColor} strokeWidth="8" strokeLinejoin="round" />
                    {/* Minimal Label */}
                    <rect x="265" y="205" width="70" height="40" rx="4" stroke={strokeColor} strokeWidth="6" />
                </svg>
            );
        case 'Tube':
            return (
                <svg {...svgProps}>
                    {/* Tube Body */}
                    <path d="M250 80 L270 230 C270 240 280 245 300 245 C320 245 330 240 330 230 L350 80 Z" fill={fillColor} stroke={strokeColor} strokeWidth="8" strokeLinejoin="round" />
                    {/* Top Crimp */}
                    <rect x="245" y="50" width="110" height="30" rx="4" fill={fillColor} stroke={strokeColor} strokeWidth="8" strokeLinejoin="round" />
                    <line x1="265" y1="65" x2="335" y2="65" stroke={strokeColor} strokeWidth="6" strokeLinecap="round" />
                    {/* Cap */}
                    <rect x="280" y="245" width="40" height="30" rx="6" fill={fillColor} stroke={strokeColor} strokeWidth="8" strokeLinejoin="round" />
                </svg>
            );
        case 'Tin':
            return (
                <svg {...svgProps}>
                    {/* Tin Base */}
                    <path
                        d="M210 200 V235 C210 255 250 268 300 268 C350 268 390 255 390 235 V200 Z"
                        fill={fillColor}
                        stroke={strokeColor}
                        strokeWidth="8"
                        strokeLinejoin="round"
                    />
                    {/* Screw / Rib Details */}
                    <path d="M210 212 C210 227 250 240 300 240 C350 240 390 227 390 212" stroke={strokeColor} strokeWidth="6" strokeLinecap="round" />
                    <path d="M210 224 C210 239 250 252 300 252 C350 252 390 239 390 224" stroke={strokeColor} strokeWidth="6" strokeLinecap="round" />
                    {/* Tin Lid */}
                    <ellipse cx="300" cy="180" rx="90" ry="32" fill={fillColor} stroke={strokeColor} strokeWidth="8" />
                    <ellipse cx="300" cy="178" rx="72" ry="22" stroke={strokeColor} strokeWidth="5" strokeDasharray="6 6" />
                </svg>
            );

        case 'Closure / Pump':
        case 'Pump':
            return (
                <svg {...svgProps}>
                    {/* Bottle Base Contour */}
                    <path
                        d="M260 170 V255 C260 268 270 276 282 276 H318 C330 276 340 268 340 255 V170 C340 148 322 138 322 128 V124 H278 V128 C278 138 260 148 260 170 Z"
                        fill={fillColor}
                        stroke={strokeColor}
                        strokeWidth="8"
                        strokeLinejoin="round"
                    />
                    {/* Dip Tube */}
                    <line x1="300" y1="124" x2="300" y2="258" stroke={strokeColor} strokeWidth="5" strokeDasharray="6 6" />
                    {/* Pump Collar */}
                    <rect x="272" y="102" width="56" height="22" rx="4" fill={fillColor} stroke={strokeColor} strokeWidth="8" strokeLinejoin="round" />
                    {/* Pump Stem */}
                    <rect x="293" y="74" width="14" height="28" fill={fillColor} stroke={strokeColor} strokeWidth="6" />
                    {/* Pump Head & Spout */}
                    <path
                        d="M320 74 H288 C280 74 274 68 274 60 C274 52 280 46 288 46 H308 C318 46 322 50 326 58 L338 68 Z"
                        fill={fillColor}
                        stroke={strokeColor}
                        strokeWidth="8"
                        strokeLinejoin="round"
                    />
                </svg>
            );
        default:
            // Generic Box fallback for 'Other', 'Closure', 'Box'
            return (
                <svg {...svgProps}>
                    <rect x="240" y="100" width="120" height="160" rx="8" fill={fillColor} stroke={strokeColor} strokeWidth="8" strokeLinejoin="round" />
                    <path d="M240 140 H360" stroke={strokeColor} strokeWidth="6" />
                </svg>
            );
    }
};

const ContainersPage = () => {
    const { user } = useAuth();
    const { currency } = useSettings();

    const [containers, setContainers] = useState<ContainerItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState<ContainerFormData>({
        name: '', container_type: 'Bottle', material: '', volume_ml: 0,
        quantity: 0, price_per_unit: 0, supplier_name: '', image_url: '', notes: '', low_stock_threshold: 5
    });

    const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', targetId: '' });

    useEffect(() => {
        if (!user) return;
        let live = true;
        fetchContainerRows()
            .then(rows => { if (live) setContainers(rows); })
            .catch(error => console.error('Error fetching containers:', error))
            .finally(() => { if (live) setIsLoading(false); });
        return () => { live = false; };
    }, [user]);

    // Load again after a change (the first load is the effect above)
    const fetchContainers = async () => {
        if (!user) return;
        try {
            setIsLoading(true);
            setContainers(await fetchContainerRows());
        } catch (error) {
            console.error('Error fetching containers:', error);
        } finally {
            setIsLoading(false);
        }
    };


    const openAddModal = () => {
        setEditingId(null);
        setFormData({
            name: '', container_type: 'Bottle', material: '', volume_ml: 0,
            quantity: 0, price_per_unit: 0, supplier_name: '', image_url: '', notes: '', low_stock_threshold: 5
        });
        setIsModalOpen(true);
    };

    const openEditModal = (item: ContainerItem) => {
        setEditingId(item.id);
        setFormData({
            name: item.name,
            container_type: item.container_type,
            material: item.material || '',
            volume_ml: item.volume_ml || 0,
            quantity: item.quantity,
            price_per_unit: item.price_per_unit,
            supplier_name: item.supplier_name || '',
            image_url: item.image_url || '',
            notes: item.notes || '',
            low_stock_threshold: item.low_stock_threshold || 5
        });
        setIsModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        const payload = {
            name: formData.name,
            container_type: formData.container_type,
            material: formData.material || null,
            volume_ml: formData.volume_ml > 0 ? formData.volume_ml : null,
            quantity: formData.quantity,
            price_per_unit: formData.price_per_unit,
            supplier_name: formData.supplier_name || null,
            image_url: formData.image_url || null,
            notes: formData.notes || null,
            low_stock_threshold: formData.low_stock_threshold
        };

        try {
            if (editingId) {
                await changeContainer(editingId, payload);
            } else {
                await addContainer(payload);
            }
            setIsModalOpen(false);
            fetchContainers();
        } catch (error) {
            console.error('Error saving container:', error);
        }
    };

    const requestDelete = (id: string, name: string) => {
        setConfirmModal({
            isOpen: true,
            title: 'Delete Container',
            message: `Are you sure you want to remove "${name}" from your inventory?`,
            targetId: id
        });
    };

    const executeDelete = async () => {
        try {
            await deleteContainer(confirmModal.targetId);
            setContainers(prev => prev.filter(c => c.id !== confirmModal.targetId));
            setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
            console.error('Error deleting container:', error);
        }
    };

    // Group containers practically by type for rendering
    const groupedContainers = useMemo(() => {
        return containers.reduce((acc, container) => {
            const type = container.container_type;
            if (!acc[type]) acc[type] = [];
            acc[type].push(container);
            return acc;
        }, {} as Record<string, ContainerItem[]>);
    }, [containers]);

    const totalInventoryValue = containers.reduce((sum, item) => sum + (item.quantity * item.price_per_unit), 0);

    return (
        <StudioLayout active="containers" title="Containers">
            {/* Main Content */}
            <main className="flex-1 p-10 overflow-y-auto">
                <header className="flex justify-between items-end mb-10">
                    <div>
                        <h1 className="text-3xl font-bold text-[#1f382a] mb-2">Packaging Inventory</h1>
                        <div className="bg-white px-4 py-1.5 rounded-lg border border-[#c1d1b9] shadow-sm inline-flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-500">Total Asset Value:</span>
                            <span className="text-md font-bold text-[#2c4c3b]">{currency}{totalInventoryValue.toFixed(2)}</span>
                        </div>
                    </div>
                    <button
                        onClick={openAddModal}
                        className="py-3 px-6 rounded-full shadow-sm text-sm font-bold text-white bg-[#2c4c3b] hover:bg-[#1f382a] transition-colors"
                    >
                        + Add Container
                    </button>
                </header>

                {isLoading ? (
                    <div className="text-center text-gray-500 mt-20">Loading inventory...</div>
                ) : containers.length === 0 ? (
                    <div className="text-center text-gray-500 mt-20 italic">No containers in your inventory yet. Add one to get started.</div>
                ) : (
                    <div className="space-y-12">
                        {CONTAINER_TYPES.map(type => {
                            const group = groupedContainers[type];
                            if (!group || group.length === 0) return null;

                            return (
                                <section key={type}>
                                    <h2 className="text-xl font-bold text-[#1f382a] mb-4 border-b border-[#c1d1b9] pb-2 flex items-center gap-2">
                                        {type}s <span className="text-sm font-normal text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">{group.length}</span>
                                    </h2>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                        {group.map(item => (
                                            <div key={item.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col group hover:border-[#2c4c3b] transition-all">
                                                {/* Image Area */}
                                                <div className="h-40 bg-gray-50 border-b border-gray-100 flex items-center justify-center overflow-hidden relative">
                                                    {item.image_url ? (
                                                        <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <ContainerIcon type={item.container_type} />
                                                    )}
                                                    {/* Quick Actions Hover Overlay */}
                                                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button onClick={() => openEditModal(item)} className="p-1.5 bg-white text-[#2c4c3b] rounded shadow hover:bg-gray-50">
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                                        </button>
                                                        <button onClick={() => requestDelete(item.id, item.name)} className="p-1.5 bg-white text-red-500 rounded shadow hover:bg-red-50">
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Details Area */}
                                                <div className="p-4 flex-1 flex flex-col">
                                                    <h3 className="font-bold text-[#1f382a] line-clamp-1" title={item.name}>{item.name}</h3>
                                                    <p className="text-xs text-gray-500 mt-1 mb-3 line-clamp-1">
                                                        {item.material || 'Unknown Material'} {item.volume_ml ? `• ${item.volume_ml} ml` : ''}
                                                    </p>

                                                    <div className="mt-auto pt-3 border-t border-gray-100 flex justify-between items-end">
                                                        <div>
                                                            <div className="text-xs text-gray-500 mb-0.5">Stock</div>
                                                            <div className={`font-bold ${item.quantity < 50 ? 'text-orange-600' : 'text-gray-900'}`}>
                                                                {item.quantity.toLocaleString()} units
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-xs text-gray-500 mb-0.5">Unit Cost</div>
                                                            <div className="font-semibold text-gray-900">{currency}{item.price_per_unit.toFixed(2)}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            );
                        })}
                    </div>
                )}
            </main>

            {/* Form Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1f382a]/40 backdrop-blur-sm overflow-y-auto">
                    <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-[#c1d1b9] my-8">
                        <div className="bg-[#e9eee7] px-6 py-4 border-b border-[#c1d1b9] flex justify-between items-center sticky top-0 rounded-t-2xl z-10">
                            <h3 className="text-xl font-bold text-[#1f382a]">{editingId ? 'Edit Container' : 'Add Container'}</h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-500 hover:text-gray-800 text-2xl font-bold leading-none">&times;</button>
                        </div>

                        <form onSubmit={handleSave} className="p-6 space-y-5">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Container Name / Title*</label>
                                    <input type="text" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#2c4c3b] outline-none" placeholder="e.g. Amber Glass Dropper Bottle" />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Type*</label>
                                    <select value={formData.container_type} onChange={e => setFormData({ ...formData, container_type: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#2c4c3b] outline-none">
                                        {CONTAINER_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Material</label>
                                    <input type="text" value={formData.material} onChange={e => setFormData({ ...formData, material: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#2c4c3b] outline-none" placeholder="e.g. Glass, PET, Aluminum" />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Volume Capacity (ml)</label>
                                    <input type="number" min="0" step="1" value={formData.volume_ml === 0 ? '' : formData.volume_ml} onChange={e => setFormData({ ...formData, volume_ml: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#2c4c3b] outline-none" placeholder="30" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Supplier / Vendor</label>
                                    <input type="text" value={formData.supplier_name} onChange={e => setFormData({ ...formData, supplier_name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#2c4c3b] outline-none" placeholder="e.g. Berlin Packaging" />
                                </div>

                                <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl col-span-2 grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-900 mb-1">Quantity in Stock*</label>
                                        <input type="number" min="0" required value={formData.quantity === 0 ? '' : formData.quantity} onChange={e => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#2c4c3b] outline-none bg-white" placeholder="250" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Low Stock Alert At</label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={formData.low_stock_threshold}
                                            onChange={e => setFormData({ ...formData, low_stock_threshold: parseInt(e.target.value) || 0 })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#2c4c3b] outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-900 mb-1">Cost per Unit ({currency})*</label>
                                        <input type="number" min="0" step="0.01" required value={formData.price_per_unit === 0 ? '' : formData.price_per_unit} onChange={e => setFormData({ ...formData, price_per_unit: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#2c4c3b] outline-none bg-white" placeholder="0.45" />
                                    </div>
                                </div>

                                <div className="col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Reference Image URL</label>
                                    <input type="url" value={formData.image_url} onChange={e => setFormData({ ...formData, image_url: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#2c4c3b] outline-none text-sm font-mono text-gray-500" placeholder="https://example.com/bottle.jpg" />
                                </div>
                            </div>

                            <div className="pt-4 flex justify-end gap-3 border-t border-gray-100">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-50 rounded-lg font-medium transition-colors border border-transparent">Cancel</button>
                                <button type="submit" className="px-6 py-2 bg-[#2c4c3b] text-white rounded-lg font-medium hover:bg-[#1f382a] shadow-sm transition-colors">Save Container</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <CustomModal isOpen={confirmModal.isOpen} type="confirm" title={confirmModal.title} message={confirmModal.message} onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))} onConfirm={executeDelete} />
        </StudioLayout>
    );
};

export default ContainersPage;