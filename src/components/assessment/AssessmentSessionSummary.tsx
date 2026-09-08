import { Card } from '@/components/common/Card';
import { isDisabilityCondition } from '@/utils/assessmentLogic';
import type { ClinicalAssessment, FollowUpAssessment } from '@/types/assessment';
import { Calendar, TrendingUp, TrendingDown, Minus, Activity } from 'lucide-react';

interface Props {
    condition: string;
    clinical: ClinicalAssessment | null;
    followUps: FollowUpAssessment[];
}

// Shared by AssessmentView (full page) and BeneficiaryProfile (inline preview)
// so the two stay visually and logically in sync.
export function AssessmentSessionSummary({ condition, clinical, followUps }: Props) {
    const outcomes: { label: string; baseline: string | number | null; current: string | number | null; improved: boolean | null }[] = [];
    const latest = followUps[followUps.length - 1];

    if (clinical && latest) {
        if (condition === 'Neuro Muscular Painful Condition') {
            const baseVas = clinical.vas_pre;
            const currVas = latest.vas_post;
            outcomes.push(
                { label: 'ROM', baseline: clinical.rom_aaos, current: latest.rom, improved: null },
                { label: 'Strength', baseline: clinical.strength_mmt, current: latest.strength, improved: null },
                { label: 'VAS Score', baseline: baseVas, current: currVas, improved: baseVas != null && currVas != null ? currVas < baseVas : null },
            );
        }
        if (condition === 'Neurological Condition') {
            outcomes.push(
                { label: 'Strength', baseline: clinical.neuro_strength, current: latest.neuro_strength, improved: null },
                { label: 'Balance', baseline: clinical.neuro_balance, current: latest.balance, improved: null },
                { label: 'Coordination', baseline: clinical.coordination_severity, current: latest.coordination_severity, improved: null },
            );
        }
        if (condition === 'Pulmonary Condition') {
            outcomes.push(
                { label: 'Dyspnea (mMRC)', baseline: clinical.dyspnea_mrmc, current: latest.dyspnea_mrmc, improved: null },
            );
        }
        if (isDisabilityCondition(condition)) {
            outcomes.push(
                { label: 'Walking / Wheelchair', baseline: clinical.fim_walking_wheelchair, current: latest.fim_walking_wheelchair, improved: null },
                { label: 'Stairs', baseline: clinical.fim_stairs, current: latest.fim_stairs, improved: null },
                { label: 'Community Access', baseline: clinical.fim_community_access, current: latest.fim_community_access, improved: null },
                { label: 'Bed / Chair / Wheelchair Transfer', baseline: clinical.fim_bed_chair_transfer, current: latest.fim_bed_chair_transfer, improved: null },
                { label: 'Toilet Transfer', baseline: clinical.fim_toilet_transfer, current: latest.fim_toilet_transfer, improved: null },
                { label: 'Tub / Shower Transfer', baseline: clinical.fim_tub_shower_transfer, current: latest.fim_tub_shower_transfer, improved: null },
            );
        }
        if (condition === 'Amputation') {
            outcomes.push(
                { label: 'AMP Level', baseline: clinical.amp_level, current: latest.amp_level, improved: null },
            );
        }
        if (condition === 'Early Intervention Assessment') {
            outcomes.push(
                { label: 'Service Level', baseline: clinical.ei_service_level, current: latest.ei_service_level, improved: null },
                { label: 'Outcome', baseline: '—', current: latest.ei_outcome, improved: null },
            );
        }
    }

    return (
        <div className="space-y-6">
            {/* ── Session History (Clinical Baseline + Follow-Ups) ── */}
            <Card>
                <div className="flex items-center gap-2 mb-5 pb-3 border-b border-gray-100">
                    <Calendar size={18} className="text-primary" />
                    <h3 className="font-semibold text-text-main">Session History</h3>
                    <span className="ml-auto text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                        {(clinical ? 1 : 0) + followUps.length} session{(clinical ? 1 : 0) + followUps.length !== 1 ? 's' : ''}
                    </span>
                </div>

                {!clinical && followUps.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-8">No sessions recorded yet.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-100">
                                    <th className="text-left py-2 px-3 font-bold text-[10px] uppercase text-gray-400 tracking-wider">#</th>
                                    <th className="text-left py-2 px-3 font-bold text-[10px] uppercase text-gray-400 tracking-wider">Type</th>
                                    <th className="text-left py-2 px-3 font-bold text-[10px] uppercase text-gray-400 tracking-wider">Date</th>
                                    {condition === 'Neuro Muscular Painful Condition' && (
                                        <>
                                            <th className="text-left py-2 px-3 font-bold text-[10px] uppercase text-gray-400 tracking-wider">ROM</th>
                                            <th className="text-left py-2 px-3 font-bold text-[10px] uppercase text-gray-400 tracking-wider">Strength</th>
                                            <th className="text-left py-2 px-3 font-bold text-[10px] uppercase text-gray-400 tracking-wider">VAS Pre</th>
                                            <th className="text-left py-2 px-3 font-bold text-[10px] uppercase text-gray-400 tracking-wider">VAS Post</th>
                                        </>
                                    )}
                                    {condition === 'Neurological Condition' && (
                                        <>
                                            <th className="text-left py-2 px-3 font-bold text-[10px] uppercase text-gray-400 tracking-wider">Strength</th>
                                            <th className="text-left py-2 px-3 font-bold text-[10px] uppercase text-gray-400 tracking-wider">Balance</th>
                                            <th className="text-left py-2 px-3 font-bold text-[10px] uppercase text-gray-400 tracking-wider">Coord. Test</th>
                                            <th className="text-left py-2 px-3 font-bold text-[10px] uppercase text-gray-400 tracking-wider">Severity</th>
                                        </>
                                    )}
                                    {condition === 'Pulmonary Condition' && (
                                        <th className="text-left py-2 px-3 font-bold text-[10px] uppercase text-gray-400 tracking-wider">Dyspnea (mMRC)</th>
                                    )}
                                    {isDisabilityCondition(condition) && (
                                        <>
                                            <th className="text-left py-2 px-3 font-bold text-[10px] uppercase text-gray-400 tracking-wider">Walk/W'chair</th>
                                            <th className="text-left py-2 px-3 font-bold text-[10px] uppercase text-gray-400 tracking-wider">Stairs</th>
                                            <th className="text-left py-2 px-3 font-bold text-[10px] uppercase text-gray-400 tracking-wider">Community</th>
                                            <th className="text-left py-2 px-3 font-bold text-[10px] uppercase text-gray-400 tracking-wider">Bed/Chair Xfer</th>
                                            <th className="text-left py-2 px-3 font-bold text-[10px] uppercase text-gray-400 tracking-wider">Toilet Xfer</th>
                                            <th className="text-left py-2 px-3 font-bold text-[10px] uppercase text-gray-400 tracking-wider">Tub/Shower Xfer</th>
                                        </>
                                    )}
                                    {condition === 'Amputation' && (
                                        <th className="text-left py-2 px-3 font-bold text-[10px] uppercase text-gray-400 tracking-wider">AMP Level</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody>
                                {/* Clinical Assessment as Baseline (Session 0) */}
                                {clinical && (
                                    <tr className="border-b border-gray-50 bg-blue-50/40">
                                        <td className="py-3 px-3 font-bold">0</td>
                                        <td className="py-3 px-3">
                                            <span className="text-xs font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Baseline</span>
                                        </td>
                                        <td className="py-3 px-3">
                                            {clinical.created_at ? new Date(clinical.created_at).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                                        </td>
                                        {condition === 'Neuro Muscular Painful Condition' && (
                                            <>
                                                <td className="py-3 px-3">{clinical.rom_aaos || '—'}</td>
                                                <td className="py-3 px-3">{clinical.strength_mmt || '—'}</td>
                                                <td className="py-3 px-3">{clinical.vas_pre ?? '—'}</td>
                                                <td className="py-3 px-3">{clinical.vas_post ?? '—'}</td>
                                            </>
                                        )}
                                        {condition === 'Neurological Condition' && (
                                            <>
                                                <td className="py-3 px-3">{clinical.neuro_strength || '—'}</td>
                                                <td className="py-3 px-3">{clinical.neuro_balance || '—'}</td>
                                                <td className="py-3 px-3">{clinical.coordination_test || '—'}</td>
                                                <td className="py-3 px-3">{clinical.coordination_severity || '—'}</td>
                                            </>
                                        )}
                                        {condition === 'Pulmonary Condition' && (
                                            <td className="py-3 px-3">{clinical.dyspnea_mrmc || '—'}</td>
                                        )}
                                        {isDisabilityCondition(condition) && (
                                            <>
                                                <td className="py-3 px-3">{clinical.fim_walking_wheelchair || '—'}</td>
                                                <td className="py-3 px-3">{clinical.fim_stairs || '—'}</td>
                                                <td className="py-3 px-3">{clinical.fim_community_access || '—'}</td>
                                                <td className="py-3 px-3">{clinical.fim_bed_chair_transfer || '—'}</td>
                                                <td className="py-3 px-3">{clinical.fim_toilet_transfer || '—'}</td>
                                                <td className="py-3 px-3">{clinical.fim_tub_shower_transfer || '—'}</td>
                                            </>
                                        )}
                                        {condition === 'Amputation' && (
                                            <td className="py-3 px-3">{clinical.amp_level || '—'}</td>
                                        )}
                                    </tr>
                                )}

                                {/* Follow-Up Sessions */}
                                {followUps.map(row => (
                                    <tr key={row.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                                        <td className="py-3 px-3 font-bold">{row.session_number}</td>
                                        <td className="py-3 px-3">
                                            <span className="text-xs font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded">Follow-Up</span>
                                        </td>
                                        <td className="py-3 px-3">
                                            {new Date(row.visit_date).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}
                                        </td>
                                        {condition === 'Neuro Muscular Painful Condition' && (
                                            <>
                                                <td className="py-3 px-3">{row.rom || '—'}</td>
                                                <td className="py-3 px-3">{row.strength || '—'}</td>
                                                <td className="py-3 px-3">{row.vas_current ?? '—'}</td>
                                                <td className="py-3 px-3">{row.vas_post ?? '—'}</td>
                                            </>
                                        )}
                                        {condition === 'Neurological Condition' && (
                                            <>
                                                <td className="py-3 px-3">{row.neuro_strength || '—'}</td>
                                                <td className="py-3 px-3">{row.balance || '—'}</td>
                                                <td className="py-3 px-3">{row.coordination_test || '—'}</td>
                                                <td className="py-3 px-3">{row.coordination_severity || '—'}</td>
                                            </>
                                        )}
                                        {condition === 'Pulmonary Condition' && (
                                            <td className="py-3 px-3">{row.dyspnea_mrmc || '—'}</td>
                                        )}
                                        {isDisabilityCondition(condition) && (
                                            <>
                                                <td className="py-3 px-3">{row.fim_walking_wheelchair || '—'}</td>
                                                <td className="py-3 px-3">{row.fim_stairs || '—'}</td>
                                                <td className="py-3 px-3">{row.fim_community_access || '—'}</td>
                                                <td className="py-3 px-3">{row.fim_bed_chair_transfer || '—'}</td>
                                                <td className="py-3 px-3">{row.fim_toilet_transfer || '—'}</td>
                                                <td className="py-3 px-3">{row.fim_tub_shower_transfer || '—'}</td>
                                            </>
                                        )}
                                        {condition === 'Amputation' && (
                                            <td className="py-3 px-3">{row.amp_level || '—'}</td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            {/* ── Outcome Summary ── */}
            {clinical && followUps.length > 0 && outcomes.length > 0 && (
                <Card>
                    <div className="flex items-center gap-2 mb-5 pb-3 border-b border-gray-100">
                        <TrendingUp size={18} className="text-primary" />
                        <h3 className="font-semibold text-text-main">Outcome Summary</h3>
                        <span className="ml-auto text-xs text-text-muted">
                            Baseline (Clinical) vs Session {latest.session_number} (Latest Follow-Up)
                        </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {outcomes.map((o, idx) => {
                            const changed = String(o.baseline) !== String(o.current);
                            return (
                                <div key={idx} className={`p-4 rounded-lg border ${o.improved === true ? 'bg-green-50 border-green-200' : o.improved === false ? 'bg-red-50 border-red-200' : changed ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
                                    <p className="text-[10px] font-bold uppercase text-gray-400 tracking-widest mb-2">{o.label}</p>
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="text-center">
                                            <p className="text-[10px] text-gray-400 uppercase">Baseline</p>
                                            <p className="text-sm font-bold text-text-main">{o.baseline ?? '—'}</p>
                                        </div>
                                        <div className="flex items-center">
                                            {o.improved === true && <TrendingDown size={18} className="text-green-600" />}
                                            {o.improved === false && <TrendingUp size={18} className="text-red-600" />}
                                            {o.improved === null && changed && <Activity size={18} className="text-blue-600" />}
                                            {o.improved === null && !changed && <Minus size={18} className="text-gray-400" />}
                                        </div>
                                        <div className="text-center">
                                            <p className="text-[10px] text-gray-400 uppercase">Current</p>
                                            <p className="text-sm font-bold text-text-main">{o.current ?? '—'}</p>
                                        </div>
                                    </div>
                                    {o.improved === true && <p className="text-xs text-green-600 font-medium mt-2 text-center">Improved</p>}
                                    {o.improved === false && <p className="text-xs text-red-600 font-medium mt-2 text-center">Worsened</p>}
                                    {changed && o.improved === null && <p className="text-xs text-blue-600 font-medium mt-2 text-center">Changed</p>}
                                    {!changed && <p className="text-xs text-gray-400 font-medium mt-2 text-center">No Change</p>}
                                </div>
                            );
                        })}
                    </div>

                    {/* Total Sessions Summary */}
                    <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-6 text-sm">
                        <div>
                            <span className="text-gray-400 text-xs uppercase font-bold">Total Sessions:</span>
                            <span className="ml-2 font-bold text-text-main">{followUps.length + 1}</span>
                        </div>
                        <div>
                            <span className="text-gray-400 text-xs uppercase font-bold">First Assessment:</span>
                            <span className="ml-2 font-bold text-text-main">
                                {clinical.created_at ? new Date(clinical.created_at).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                            </span>
                        </div>
                        <div>
                            <span className="text-gray-400 text-xs uppercase font-bold">Latest Follow-Up:</span>
                            <span className="ml-2 font-bold text-text-main">
                                {new Date(latest.visit_date).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}
                            </span>
                        </div>
                    </div>
                </Card>
            )}
        </div>
    );
}
