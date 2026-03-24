import { useMemo, useState } from 'react'
import {
    Activity, CreditCard, TrendingUp, TrendingDown, AlertTriangle,
    CheckCircle, Target, ShieldAlert, Calendar, Layers,
    DollarSign, BarChart2, FileText, Zap, ArrowUpRight, ArrowDownRight, X, Info
} from 'lucide-react'
import ScoreGauge from './ScoreGauge'

/* ── helpers ─────────────────────────────────────────── */
const formatINR = (val) => {
    if (!val) return '₹0';
    if (typeof val === 'string' && val.startsWith('₹')) return val;
    const num = parseInt(String(val).replace(/[^0-9]/g, ''));
    if (isNaN(num)) return val;
    return '₹' + num.toLocaleString('en-IN');
};

const parseDateHelper = (dStr) => {
    if (!dStr || typeof dStr !== 'string') return null;
    const parts = dStr.trim().split('-');
    if (parts.length === 3) {
        // DD-MM-YYYY
        return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    }
    if (parts.length === 2) {
        // MM-YYYY — treat as 1st of that month
        return new Date(parseInt(parts[1]), parseInt(parts[0]) - 1, 1);
    }
    return null;
};

const parseINR = (val) => {
    if (!val) return 0;
    return parseInt(String(val).replace(/[^0-9]/g, '')) || 0;
};

const RiskBadge = ({ level }) => {
    const cfg = level?.toLowerCase?.().includes('very good') || level?.toLowerCase?.().includes('low')
        ? { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)', color: '#10b981', icon: CheckCircle, label: 'Very Good' }
        : level?.toLowerCase?.().includes('average') || level?.toLowerCase?.().includes('high')
            ? { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)', color: '#f87171', icon: AlertTriangle, label: 'Average' }
            : { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', color: '#f59e0b', icon: ShieldAlert, label: 'Good' };
    const Icon = cfg.icon;
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            padding: '0.3rem 0.8rem', borderRadius: '100px',
            background: cfg.bg, border: `1px solid ${cfg.border}`,
            color: cfg.color, fontSize: '0.8rem', fontWeight: '700'
        }}>
            <Icon size={13} /> {cfg.label}
        </span>
    );
};

const StatBox = ({ label, value, color, icon: Icon, accent }) => (
    <div style={{
        padding: '1.25rem 1.5rem', borderRadius: '1.25rem',
        background: accent ? `${color}10` : 'var(--nav-bg)',
        border: `1px solid ${accent ? color + '25' : 'var(--border-color)'}`,
        display: 'flex', flexDirection: 'column', gap: '0.4rem',
        boxShadow: accent ? `0 8px 20px -10px ${color}30` : 'none',
        transition: 'all 0.3s ease'
    }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-dim)', fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {Icon && <Icon size={13} color={color || 'var(--accent-color)'} />}
            {label}
        </div>
        <div style={{ fontSize: '2rem', fontWeight: '950', color: color || 'var(--text-main)', letterSpacing: '-0.03em', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}>{value}</div>
    </div>
);

const SectionTitle = ({ icon: Icon, title, subtitle, color = 'var(--accent-color)' }) => (
    <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.3rem' }}>
            <div style={{ padding: '0.5rem', borderRadius: '0.75rem', background: `${color}15`, border: `1px solid ${color}25` }}>
                <Icon size={18} color={color} />
            </div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--text-main)', letterSpacing: '-0.01em' }}>{title}</h3>
        </div>
        {subtitle && <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem', paddingLeft: '3rem' }}>{subtitle}</p>}
    </div>
);

const LoanModal = ({ loan, onClose }) => {
    if (!loan) return null;
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <button className="modal-close" onClick={onClose}><X size={18} /></button>
                
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.75rem', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <div style={{ padding: '0.4rem', borderRadius: '0.6rem', background: 'var(--accent-glow)', border: '1px solid var(--accent-color)', flexShrink: 0 }}>
                            <CreditCard size={18} color="var(--accent-color)" />
                        </div>
                        <div>
                            <h2 style={{ fontSize: '1.1rem', fontWeight: '900', color: 'var(--text-main)', margin: 0, lineHeight: 1.2 }}>{loan.lender_name || 'Loan Detail'}</h2>
                            <p style={{ color: 'var(--text-dim)', fontSize: '0.75rem', margin: 0 }}>{loan.loan_type}</p>
                        </div>
                    </div>
                    {loan.loan_start_date && (
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '0.65rem', fontWeight: '800', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Opened On</div>
                            <div style={{ fontSize: '0.85rem', fontWeight: '800', color: 'var(--accent-color)' }}>{loan.loan_start_date}</div>
                        </div>
                    )}
                </div>

                <div className="detail-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem 1rem', padding: '0.75rem', background: 'var(--panel-sub-bg)', borderRadius: '0.75rem', border: '1px solid var(--border-color)' }}>
                    <div className="detail-item" style={{ borderBottom: 'none', padding: 0 }}>
                        <span className="detail-label" style={{ fontSize: '0.65rem', marginBottom: '0.1rem' }}>Status</span>
                        <span className={`detail-value ${loan.status?.toLowerCase().includes('closed') ? 'risk-low' : 'risk-medium'}`} style={{ textTransform: 'uppercase', fontSize: '0.82rem' }}>
                            {loan.status || 'Active'}
                        </span>
                    </div>
                    <div className="detail-item" style={{ borderBottom: 'none', padding: 0 }}>
                        <span className="detail-label" style={{ fontSize: '0.65rem', marginBottom: '0.1rem' }}>Account No</span>
                        <span className="detail-value" style={{ fontSize: '0.82rem' }}>{loan.account_no || '—'}</span>
                    </div>
                    <div className="detail-item" style={{ borderBottom: 'none', padding: 0 }}>
                        <span className="detail-label" style={{ fontSize: '0.65rem', marginBottom: '0.1rem' }}>Sanctioned</span>
                        <span className="detail-value" style={{ fontSize: '0.85rem' }}>{formatINR(loan.loan_amount)}</span>
                    </div>
                    {loan.outstanding_balance !== undefined && (
                        <div className="detail-item" style={{ borderBottom: 'none', padding: 0 }}>
                            <span className="detail-label" style={{ fontSize: '0.65rem', marginBottom: '0.1rem' }}>Outstanding</span>
                            <span className="detail-value" style={{ color: 'var(--warning-color)', fontSize: '0.85rem' }}>{formatINR(loan.outstanding_balance)}</span>
                        </div>
                    )}
                </div>
                <div className="detail-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginTop: '0.5rem', padding: '0 0.75rem' }}>
                    {loan.emi && (
                        <div className="detail-item" style={{ borderBottom: 'none', padding: 0 }}>
                            <span className="detail-label" style={{ fontSize: '0.65rem' }}>Monthly EMI</span>
                            <span className="detail-value" style={{ color: 'var(--accent-color)', fontSize: '0.85rem' }}>{formatINR(loan.emi)}</span>
                        </div>
                    )}
                    {loan.loan_start_date && (
                        <div className="detail-item" style={{ borderBottom: 'none', padding: 0 }}>
                            <span className="detail-label" style={{ fontSize: '0.65rem' }}>Loan Started On</span>
                            <span className="detail-value" style={{ fontSize: '0.85rem' }}>{loan.loan_start_date}</span>
                        </div>
                    )}
                    {loan.date_closed && (
                        <div className="detail-item" style={{ borderBottom: 'none', padding: 0 }}>
                            <span className="detail-label" style={{ fontSize: '0.65rem' }}>Closed On</span>
                            <span className="detail-value" style={{ color: 'var(--success-color)', fontSize: '0.85rem' }}>{loan.date_closed}</span>
                        </div>
                    )}
                </div>

                {loan.payment_history && loan.payment_history.length > 0 && (
                    <div style={{ marginTop: '1.25rem' }}>
                        <h4 style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <Activity size={12} color="var(--accent-color)" />
                            Payment Behavior History
                        </h4>
                        <div style={{ 
                            display: 'grid', 
                            gridTemplateColumns: 'repeat(auto-fill, minmax(65px, 1fr))', 
                            gap: '0.5rem',
                            maxHeight: '160px',
                            overflowY: 'auto',
                            padding: '0.5rem',
                            background: 'var(--panel-sub-bg)',
                            borderRadius: '0.75rem',
                            border: '1px solid var(--border-color)'
                        }}>
                            {loan.payment_history.map((h, i) => {
                                const isBad = h.dpd > 0 || !['STD', '0', '000', 'ACT'].includes(String(h.status).toUpperCase());
                                return (
                                    <div key={i} style={{ 
                                        padding: '0.4rem 0.3rem', 
                                        borderRadius: '0.5rem', 
                                        background: isBad ? 'rgba(239, 68, 68, 0.1)' : 'var(--nav-bg)',
                                        border: `1px solid ${isBad ? 'rgba(239, 68, 68, 0.2)' : 'var(--border-color)'}`,
                                        textAlign: 'center',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '0.15rem'
                                    }}>
                                        <div style={{ fontSize: '0.65rem', fontWeight: '800', color: 'var(--text-dim)' }}>{h.month_year}</div>
                                        <div style={{ 
                                            fontSize: '0.85rem', 
                                            fontWeight: '900', 
                                            color: isBad ? '#f87171' : '#10b981' 
                                        }}>
                                            {h.status}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                <div style={{ marginTop: '1.25rem', padding: '0.75rem', background: 'var(--nav-bg)', borderRadius: '0.75rem', border: '1px solid var(--border-color)', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                    <Info size={14} color="var(--accent-color)" style={{ marginTop: '2px', flexShrink: 0 }} />
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', margin: 0, lineHeight: '1.3' }}>
                        This data is extracted directly from the customer's CIBIL report. Accuracy depends on the clarity of the source PDF.
                    </p>
                </div>
            </div>
        </div>
    );
};

/* ── main component ───────────────────────────────────── */
export default function DeepAnalysis({ data }) {
    const [selectedLoan, setSelectedLoan] = useState(null);

    const summary = data?.summary || {};
    const getName = () => summary.name || data?.name || '';
    const getDob = () => summary.dob || data?.dob || '';
    const getCity = () => summary.city || data?.city || '';
    const getState = () => summary.state || data?.state || '';
    const getMobile = () => summary.mobile || data?.mobile || '';
    const getDateReported = () => summary.date_reported || data?.date_reported || '';

    const activeLoans = data?.active_loan_details || [];
    const closedLoans = data?.closed_loan_details || [];
    const enquiries = data?.enquiry_list || [];
    const payments = data?.payment_history || [];
    const riskLevel = data?.risk_level || 'Good';
    const score = parseInt(summary.cibil_score) || 0;

    // ── computed insights ──
    const totalOutstanding = useMemo(() =>
        activeLoans.reduce((sum, l) => sum + parseINR(l.outstanding_balance), 0)
        , [activeLoans]);

    const totalOriginal = useMemo(() =>
        activeLoans.reduce((sum, l) => sum + parseINR(l.loan_amount), 0)
        , [activeLoans]);

    const repaidRatio = totalOriginal > 0
        ? Math.round(((totalOriginal - totalOutstanding) / totalOriginal) * 100)
        : 0;

    const monthlyEMI = useMemo(() =>
        activeLoans.reduce((sum, l) => sum + parseINR(l.emi), 0)
        , [activeLoans]);

    const badPayments = useMemo(() => {
        if (!Array.isArray(payments)) return [];
        return payments.filter(p => {
            const status = String(p?.status || '').toUpperCase();
            return status && !['STD', 'STANDARD', 'OK', ''].some(ok => status.includes(ok));
        });
    }, [payments]);

    const onTimeRate = payments.length > 0
        ? Math.round(((payments.length - badPayments.length) / payments.length) * 100)
        : 100;

    const enquiries30 = useMemo(() => {
        const reportDate = parseDateHelper(summary.date_reported) || new Date();
        const thirtyDaysAgo = new Date(reportDate);
        thirtyDaysAgo.setDate(reportDate.getDate() - 30);
        
        if (!Array.isArray(enquiries)) return parseInt(summary.enquiries_30d) || 0;
        
        const computed = enquiries.filter(e => {
            const d = parseDateHelper(e?.date);
            return d && d >= thirtyDaysAgo && d <= reportDate;
        }).length;

        // Prefer computed count; fall back to LLM value if nothing matched
        return computed > 0 ? computed : (parseInt(summary.enquiries_30d) || 0);
    }, [enquiries, summary.date_reported, summary.enquiries_30d]);

    const lenderGroups = useMemo(() => {
        const map = {};
        if (Array.isArray(enquiries)) {
            enquiries.forEach(e => {
                const lender = e?.lender || 'Unknown Lender';
                map[lender] = (map[lender] || 0) + 1;
            });
        }
        return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
    }, [enquiries]);

    const aiRecommendations = useMemo(() => {
        const recs = [];
        if (score < 700) recs.push({ icon: TrendingUp, color: '#f59e0b', text: 'On-time EMI payments for 6+ months recommended to improve customer score above 700.' });
        if (score >= 700) recs.push({ icon: CheckCircle, color: '#10b981', text: 'Maintain current repayment discipline to keep customer score above 700.' });
        if (activeLoans.length > 3) recs.push({ icon: AlertTriangle, color: '#f87171', text: `Customer has ${activeLoans.length} active loans — high debt load may limit new credit approval.` });
        if (enquiries30 > 2) recs.push({ icon: ShieldAlert, color: '#f87171', text: `${enquiries30} loan enquiries in 30 days — signals credit hunger.` });
        if (monthlyEMI > 0) recs.push({ icon: DollarSign, color: '#818cf8', text: `Monthly EMI commitment: ${formatINR(monthlyEMI)}. Recommended to keep below 40% of income.` });
        if (closedLoans.length > 0) recs.push({ icon: TrendingUp, color: '#10b981', text: `${closedLoans.length} successfully closed loan(s) demonstrate positive credit history.` });
        if (badPayments.length > 0) recs.push({ icon: AlertTriangle, color: '#f87171', text: `${badPayments.length} overdue/late payment(s) detected. Impacting credit quality.` });
        if (onTimeRate === 100 && payments.length > 0) recs.push({ icon: Zap, color: '#10b981', text: 'Perfect payment track record! Consistent repayment discipline observed.' });
        return recs;
    }, [score, activeLoans, enquiries30, monthlyEMI, closedLoans, badPayments, onTimeRate, payments]);

    const cardStyle = {
        background: 'var(--secondary-bg)',
        border: '1px solid var(--border-color)',
        borderRadius: '1.5rem',
        padding: '1.75rem',
        marginBottom: '1.5rem',
        boxShadow: 'var(--shadow-md)'
    };

    return (
        <div className="fade-in">
            {/* ── HERO HEADER ── */}
            <div style={{ marginBottom: '2rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                <div>
                    <h2 className="text-gradient" style={{ fontSize: '2.1rem', fontWeight: '900', marginBottom: '0.35rem', letterSpacing: '-0.02em' }}>Deep Credit Intelligence</h2>
                    <p style={{ color: 'var(--text-dim)', fontSize: '0.98rem', opacity: 0.9 }}>
                        Comprehensive underwriting analysis of every dimension of customer profile
                    </p>
                </div>
                <RiskBadge level={riskLevel} />
            </div>

            {/* ── CUSTOMER INFORMATION ── */}
            <div style={{ 
                ...cardStyle, 
                padding: '1.5rem 1.75rem', 
                marginBottom: '1.5rem', 
                background: 'var(--panel-sub-bg)', 
                border: '1px solid var(--border-color)',
                boxShadow: 'none'
            }}>
                <SectionTitle icon={FileText} title="Customer Information" subtitle="Analysis predicated on the following extracted identity markers" color="var(--accent-color)" />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1.5rem' }}>
                    <div>
                        <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: '800', color: 'var(--text-dim)', marginBottom: '0.4rem', letterSpacing: '0.1em' }}>Full Name</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--text-main)' }}>{getName() || 'N/A'}</div>
                    </div>
                    <div>
                        <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: '800', color: 'var(--text-dim)', marginBottom: '0.4rem', letterSpacing: '0.1em' }}>Date of Birth</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--text-main)' }}>{getDob() || 'N/A'}</div>
                    </div>
                    <div>
                        <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: '800', color: 'var(--text-dim)', marginBottom: '0.4rem', letterSpacing: '0.1em' }}>Mobile Number</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--text-main)' }}>{getMobile() || 'N/A'}</div>
                    </div>
                    <div>
                        <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: '800', color: 'var(--text-dim)', marginBottom: '0.4rem', letterSpacing: '0.1em' }}>Customer City</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--text-main)' }}>{getCity() || 'N/A'}</div>
                    </div>
                    <div>
                        <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: '800', color: 'var(--text-dim)', marginBottom: '0.4rem', letterSpacing: '0.1em' }}>Customer State</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--text-main)' }}>{getState() || 'N/A'}</div>
                    </div>
                </div>
            </div>

            {/* ── SCORE + TOP STATS ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                {/* Score Gauge */}
                <div style={{ 
                    ...cardStyle, 
                    marginBottom: 0, 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    background: 'var(--accent-glow)', 
                    border: '1px solid var(--accent-color)',
                    borderColor: 'rgba(59, 130, 246, 0.2)' 
                }}>
                    <ScoreGauge score={summary.cibil_score} />
                </div>

                {/* Key Numbers Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '1rem' }}>
                    <StatBox label="Active Loans" value={activeLoans.length} icon={CreditCard} color="#818cf8" accent />
                    <StatBox label="Closed Loans" value={closedLoans.length} icon={CheckCircle} color="#10b981" accent />
                    <StatBox label="Outstanding" value={formatINR(totalOutstanding || summary.outstanding_amount)} icon={DollarSign} color="#f59e0b" accent />
                    <StatBox label="Monthly EMI" value={monthlyEMI > 0 ? formatINR(monthlyEMI) : 'N/A'} icon={Calendar} color="#60a5fa" accent />
                    <StatBox label="Enquiries (30D)" value={enquiries30} icon={Activity} color={enquiries30 > 2 ? '#f87171' : '#10b981'} accent />
                    <StatBox label="On-Time Rate" value={`${onTimeRate}%`} icon={Target} color={onTimeRate >= 90 ? '#10b981' : '#f59e0b'} accent />
                </div>
            </div>

            {/* ── ACTIVE LOAN DEEP DIVE ── */}
            {activeLoans.length > 0 && (
                <div style={cardStyle}>
                    <SectionTitle icon={Layers} title="Active Loan Breakdown" subtitle="Full details of every open credit account" color="#818cf8" />
                    <div style={{ overflowX: 'auto' }}>
                        <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    {['Lender', 'Type', 'Loan Amount', 'Outstanding', 'Overdue', 'EMI', 'Since', 'Status'].map(h => (
                                        <th key={h} className="data-table-th" style={{ padding: '0.9rem 1rem', textAlign: 'left', fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid var(--border-color)' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {activeLoans.map((l, i) => (
                                    <tr key={i} 
                                        className="clickable-row"
                                        onClick={() => setSelectedLoan(l)}
                                        style={{ transition: 'background 0.2s' }}
                                    >
                                        <td style={{ padding: '0.9rem 1rem', fontWeight: '700', color: 'var(--text-main)', borderBottom: '1px solid var(--panel-sub-bg)', fontSize: '0.9rem' }}>{l.lender_name || '—'}</td>
                                        <td style={{ padding: '0.9rem 1rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--panel-sub-bg)', fontSize: '0.88rem' }}>{l.loan_type || '—'}</td>
                                        <td style={{ padding: '0.9rem 1rem', color: 'var(--text-main)', borderBottom: '1px solid var(--panel-sub-bg)', fontWeight: '600', fontSize: '0.88rem' }}>{formatINR(l.loan_amount)}</td>
                                        <td style={{ padding: '0.9rem 1rem', color: '#f59e0b', borderBottom: '1px solid var(--panel-sub-bg)', fontWeight: '700', fontSize: '0.88rem' }}>{formatINR(l.outstanding_balance)}</td>
                                        <td style={{ padding: '0.9rem 1rem', color: (l.overdue_amount && l.overdue_amount !== '₹0') ? '#f87171' : 'var(--text-dim)', borderBottom: '1px solid var(--panel-sub-bg)', fontWeight: '800', fontSize: '0.88rem' }}>{l.overdue_amount || '₹0'}</td>
                                        <td style={{ padding: '0.9rem 1rem', color: '#60a5fa', borderBottom: '1px solid var(--panel-sub-bg)', fontWeight: '700', fontSize: '0.88rem' }}>{formatINR(l.emi)}</td>
                                        <td style={{ padding: '0.9rem 1rem', color: 'var(--text-dim)', borderBottom: '1px solid var(--panel-sub-bg)', fontSize: '0.85rem' }}>{l.loan_start_date || '—'}</td>
                                        <td style={{ padding: '0.9rem 1rem', borderBottom: '1px solid var(--panel-sub-bg)' }}>
                                            {l.has_late_payments ? (
                                                <span style={{ padding: '0.2rem 0.65rem', borderRadius: '100px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171', fontSize: '0.75rem', fontWeight: '700' }}>
                                                    Overdue
                                                </span>
                                            ) : (
                                                <span style={{ padding: '0.2rem 0.65rem', borderRadius: '100px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: '#10b981', fontSize: '0.75rem', fontWeight: '700' }}>
                                                    {l.status || 'Active'}
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Repayment Progress */}
                    {totalOriginal > 0 && (
                        <div style={{ marginTop: '1.5rem', padding: '1rem 1.25rem', background: 'var(--panel-sub-bg)', borderRadius: '1rem', border: '1px solid var(--border-color)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
                                <span style={{ fontSize: '0.82rem', fontWeight: '700', color: 'var(--text-muted)' }}>Overall Repayment Progress</span>
                                <span style={{ fontSize: '0.82rem', fontWeight: '800', color: '#10b981' }}>{repaidRatio}% Paid</span>
                            </div>
                            <div style={{ height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                                <div style={{ width: `${repaidRatio}%`, height: '100%', borderRadius: '4px', background: 'linear-gradient(90deg, #4f46e5, #10b981)', transition: 'width 1s ease' }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.4rem', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                                <span>Paid: {formatINR(totalOriginal - totalOutstanding)}</span>
                                <span>Remaining: {formatINR(totalOutstanding)}</span>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── CLOSED LOANS ── */}
            {closedLoans.length > 0 && (
                <div style={cardStyle}>
                    <SectionTitle icon={CheckCircle} title="Closed Account History" subtitle={`${closedLoans.length} successfully repaid credit account(s)`} color="#10b981" />
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
                        {closedLoans.map((l, i) => {
                            const isDelayed = l.has_late_payments === true;
                            const statusColor = isDelayed ? '#ef4444' : '#10b981';
                            const bgColor = isDelayed ? 'rgba(239, 68, 68, 0.06)' : 'rgba(16, 185, 129, 0.06)';
                            const borderColor = isDelayed ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)';

                            return (
                                <div key={i} 
                                    className="clickable-card"
                                    onClick={() => setSelectedLoan(l)}
                                    style={{ 
                                        padding: '1.25rem 1.5rem', 
                                        borderRadius: '1.25rem', 
                                        background: bgColor, 
                                        border: `1px solid ${borderColor}`,
                                        position: 'relative',
                                        overflow: 'hidden'
                                    }}
                                >
                                    <div style={{ fontWeight: '800', color: 'var(--text-main)', marginBottom: '0.25rem', fontSize: '1rem' }}>{l.lender_name || '—'}</div>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '0.75rem' }}>{l.loan_type} · {formatINR(l.loan_amount)}</div>
                                    <div style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'space-between',
                                        padding: '0.5rem 0.75rem',
                                        background: 'rgba(255,255,255,0.03)',
                                        borderRadius: '0.75rem',
                                        border: '1px solid var(--border-color)'
                                    }}>
                                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>A/C Number</span>
                                        <span style={{ fontSize: '0.82rem', color: 'var(--text-main)', fontWeight: '700' }}>{l.account_no || '—'}</span>
                                    </div>
                                    {/* DPD Indicator Dot */}
                                    <div style={{ 
                                        position: 'absolute', 
                                        top: '1.25rem', 
                                        right: '1.25rem', 
                                        width: '10px', 
                                        height: '10px', 
                                        borderRadius: '50%', 
                                        background: statusColor,
                                        boxShadow: `0 0 10px ${statusColor}60`
                                    }} />
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── PAYMENT BEHAVIOUR ── */}
            {payments.length > 0 && (
                <div style={cardStyle}>
                    <SectionTitle icon={BarChart2} title="Payment Behaviour Analysis" subtitle={`${payments.length} payment records analysed · ${onTimeRate}% on-time rate`} color="#60a5fa" />
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '0.5rem', maxHeight: '220px', overflowY: 'auto' }}>
                        {payments.map((p, i) => {
                            const isGood = !p.status || ['STD', 'standard', 'OK'].some(ok => p.status.toUpperCase().includes(ok.toUpperCase()));
                            return (
                                <div key={i} style={{
                                    padding: '0.5rem 0.75rem', borderRadius: '0.75rem',
                                    background: isGood ? 'rgba(16,185,129,0.07)' : 'rgba(239,68,68,0.1)',
                                    border: `1px solid ${isGood ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.25)'}`,
                                    fontSize: '0.78rem'
                                }}>
                                    <div style={{ color: 'var(--text-dim)', fontWeight: '600', marginBottom: '0.2rem' }}>{p.lender?.slice(0, 15) || '—'}</div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginBottom: '0.2rem' }}>{p.month_year}</div>
                                    <div style={{ fontWeight: '800', color: isGood ? '#10b981' : '#f87171', fontSize: '0.75rem' }}>{p.status || 'STD'}</div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── ENQUIRY INTELLIGENCE ── */}
            {enquiries.length > 0 && (
                <div style={cardStyle}>
                    <SectionTitle icon={Activity} title="Enquiry & Application Intelligence" subtitle={`${enquiries.length} total enquiries · ${enquiries30} in last 30 days`} color="#f59e0b" />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                        {/* Lender frequency */}
                        <div>
                            <p style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.75rem' }}>Top Lenders by Enquiry Volume</p>
                            {lenderGroups.map(([lender, count], i) => (
                                <div key={i} style={{ marginBottom: '0.6rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                                        <span style={{ fontSize: '0.85rem', color: 'var(--text-main)', fontWeight: '600' }}>{lender?.slice(0, 22) || '—'}</span>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontWeight: '700' }}>{count}x</span>
                                    </div>
                                    <div style={{ height: '5px', borderRadius: '3px', background: 'rgba(255,255,255,0.05)' }}>
                                        <div style={{ width: `${Math.min(100, (count / enquiries.length) * 100 * 2.5)}%`, height: '100%', borderRadius: '3px', background: 'linear-gradient(90deg, #4f46e5, #7c3aed)' }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                        {/* Recent enquiries */}
                        <div>
                            <p style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.75rem' }}>Recent Enquiries</p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '180px', overflowY: 'auto' }}>
                                {enquiries.slice(0, 8).map((e, i) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', borderRadius: '0.75rem', background: 'var(--panel-sub-bg)', border: '1px solid var(--border-color)' }}>
                                        <div>
                                            <div style={{ fontSize: '0.82rem', fontWeight: '700', color: 'var(--text-main)' }}>{e.lender?.slice(0, 18) || '—'}</div>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{e.purpose || 'Loan Enquiry'}</div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{e.date}</div>
                                            <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#60a5fa' }}>{formatINR(e.amount)}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── AI RECOMMENDATIONS ── */}
            <div style={{ ...cardStyle, background: 'rgba(79,70,229,0.04)', border: '1px solid rgba(79,70,229,0.15)' }}>
                <SectionTitle icon={Zap} title="AI-Powered Recommendations" subtitle="Personalised actions to improve your credit health" color="#818cf8" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {aiRecommendations.map((r, i) => {
                        const Icon = r.icon;
                        return (
                            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.9rem', padding: '0.85rem 1.1rem', borderRadius: '1rem', background: `${r.color}08`, border: `1px solid ${r.color}20` }}>
                                <div style={{ marginTop: '1px', flexShrink: 0 }}>
                                    <Icon size={16} color={r.color} />
                                </div>
                                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: '1.5', margin: 0 }}>
                                    {r.text}
                                </p>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── CREDIT HEALTH SCORECARD ── */}
            <div style={cardStyle}>
                <SectionTitle icon={FileText} title="Credit Health Scorecard" subtitle="Factor-by-factor breakdown of what affects your score" color="#a78bfa" />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
                    {[
                        { label: 'Credit Score', score: score > 750 ? 95 : score > 700 ? 70 : score > 650 ? 45 : 20, color: score > 750 ? '#10b981' : score > 700 ? '#f59e0b' : '#f87171' },
                        { label: 'Payment History', score: onTimeRate, color: onTimeRate >= 95 ? '#10b981' : onTimeRate >= 80 ? '#f59e0b' : '#f87171' },
                        { label: 'Credit Utilisation', score: repaidRatio, color: repaidRatio >= 60 ? '#10b981' : repaidRatio >= 30 ? '#f59e0b' : '#f87171' },
                        { label: 'Enquiry Load', score: enquiries30 === 0 ? 100 : enquiries30 <= 2 ? 70 : enquiries30 <= 4 ? 40 : 10, color: enquiries30 <= 2 ? '#10b981' : enquiries30 <= 4 ? '#f59e0b' : '#f87171' },
                        { label: 'Credit Mix', score: Math.min(100, (activeLoans.length + closedLoans.length) * 20), color: '#818cf8' },
                        { label: 'Account Age', score: closedLoans.length > 0 ? 75 : activeLoans.length > 0 ? 60 : 30, color: '#60a5fa' },
                    ].map(({ label, score: s, color }) => (
                        <div key={label} style={{ padding: '1rem 1.25rem', borderRadius: '1rem', background: 'var(--panel-sub-bg)', border: '1px solid var(--border-color)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
                                <span style={{ fontSize: '0.82rem', fontWeight: '700', color: 'var(--text-muted)' }}>{label}</span>
                                <span style={{ fontSize: '0.85rem', fontWeight: '800', color }}>{s}%</span>
                            </div>
                            <div style={{ height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.05)' }}>
                                <div style={{ width: `${s}%`, height: '100%', borderRadius: '3px', background: color, boxShadow: `0 0 8px ${color}60`, transition: 'width 1s ease' }} />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Loan Detail Modal */}
            <LoanModal loan={selectedLoan} onClose={() => setSelectedLoan(null)} />
        </div>
    );
}
