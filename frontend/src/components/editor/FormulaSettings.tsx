import { toolsUrl } from '../../lib/toolLinks';

interface FormulaSettingsProps {
    profileId: string;
    onProfileChange: (profileId: string) => void;
    targetWeight: number;
    onTargetWeightChange: (grams: number) => void;
    targetPh: number | null;
    onTargetPhChange: (ph: number | null) => void;
}

/** Product type, batch size and target pH. */
export default function FormulaSettings({ profileId, onProfileChange, targetWeight, onTargetWeightChange, targetPh, onTargetPhChange }: FormulaSettingsProps) {
    return (
        <div className="flex items-center gap-4 md:gap-8 w-full bg-transparent overflow-x-auto pb-2 -mt-1" data-tour="settings">

            {/* Profile Selector */}
            <div className="flex items-center gap-2 whitespace-nowrap shrink-0">
                <label htmlFor="profile-select" className="text-sm text-gray-600 font-medium">Profile:</label>
                <select
                    id="profile-select"
                    value={profileId}
                    onChange={(e) => onProfileChange(e.target.value)}
                    className="border border-[#c1d1b9] rounded px-2 py-1 text-sm bg-white outline-none focus:ring-1 focus:ring-[#2c4c3b] shadow-sm text-gray-700 w-48"
                >
                    <option value="" disabled>Select product type...</option>
                    <optgroup label="Emulsions">
                        <option value="ow_lotion">O/W Lotion or Cream</option>
                        <option value="wo_cream">W/O Rich Cream or Salve</option>
                    </optgroup>
                    <optgroup label="Anhydrous (Waterless)">
                        <option value="body_butter">Body Butter or Balm</option>
                        <option value="facial_oil">Facial or Body Oil</option>
                    </optgroup>
                    <optgroup label="Aqueous & Gels">
                        <option value="toner_mist">Toner or Face Mist</option>
                        <option value="water_serum">Water-based Serum or Gel</option>
                    </optgroup>
                    <optgroup label="Surfactants (Wash-off)">
                        <option value="body_wash">Body Wash or Gel Cleanser</option>
                        <option value="shampoo">Shampoo</option>
                    </optgroup>
                </select>
            </div>

            {/* Target Weight */}
            <div className="flex items-center gap-2 whitespace-nowrap shrink-0">
                <label className="text-sm text-gray-600 font-medium">Target Weight:</label>
                <div className="relative flex items-center">
                    <input
                        type="number"
                        min="1"
                        step="any"
                        value={targetWeight || ''}
                        onChange={(e) => onTargetWeightChange(parseFloat(e.target.value) || 0)}
                        className="w-24 border border-[#c1d1b9] rounded px-2 py-1 pr-6 text-sm bg-white outline-none focus:ring-1 focus:ring-[#2c4c3b] shadow-sm"
                        placeholder="100"
                    />
                    <span className="absolute right-2 text-xs text-gray-500 pointer-events-none">g</span>
                </div>
            </div>

            {/* Target pH */}
            <div className="flex items-center gap-2 whitespace-nowrap shrink-0">
                <label className="text-sm text-gray-600 font-medium">Target pH:</label>
                <input
                    type="number"
                    step="0.1"
                    min="2"
                    max="12"
                    value={targetPh ?? ''}
                    onChange={(e) => onTargetPhChange(e.target.value === '' ? null : parseFloat(e.target.value))}
                    className="w-20 border border-[#c1d1b9] rounded px-2 py-1 text-sm bg-white outline-none focus:ring-1 focus:ring-[#2c4c3b] shadow-sm"
                    placeholder="5.5"
                />
                <a
                    href={toolsUrl('ph', { batch: targetWeight, target: targetPh })}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-bold text-[#2c4c3b] hover:underline"
                    title="Work out how much acid or base to add"
                >
                    Adjust pH
                </a>
            </div>
        </div>
    );
}
