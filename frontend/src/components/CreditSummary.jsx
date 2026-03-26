import { useState, useMemo } from 'react'
import { Activity, CreditCard, Clock, ShieldAlert, AlertTriangle, ChevronDown, ChevronRight, Briefcase, Home, Coins, Landmark, Calendar, Zap, ShieldCheck } from 'lucide-react'
import ScoreGauge from './ScoreGauge'

export default function CreditSummary({ data, riskLevel, getRiskClass, onNext }) {
    console.log("DEBUG: CreditSummary mounting with data:", data);
    const [selectedLoan, setSelectedLoan] = useState(null);
    const summary = data?.summary || {};
    const activeLoanDetails = data?.active_loan_details || [];
    const closedLoanDetails = data?.closed_loan_details || [];
    const enquiryList = data?.enquiry_list || [];
    const [activeCategory, setActiveCategory] = useState(null);
    const [showBreakdown, setShowBreakdown] = useState(false);
    const [showClosedBreakdown, setShowClosedBreakdown] = useState(false);
    const [showScoreDetail, setShowScoreDetail] = useState(false);
    const [showOutstandingDetail, setShowOutstandingDetail] = useState(false);
    const [showRiskReasons, setShowRiskReasons] = useState(false);
    const [showScoreAnalysis, setShowScoreAnalysis] = useState(false);
    const [activeEnquiryView, setActiveEnquiryView] = useState(null); // '30' or '90' or null

    // Resilience helpers to find data in common alternative locations
    const getName = () => summary.name || data?.name || '';
    const getDob = () => summary.dob || data?.dob || '';
    const getCity = () => summary.city || data?.city || '';
    const getState = () => summary.state || data?.state || '';
    const getMobile = () => summary.mobile || data?.mobile || '';
    const getCompany = () => summary.company || data?.company || '';
    const getAddress = () => summary.address || data?.address || '';
    const getDateReported = () => summary.date_reported || data?.date_reported || '';

    // Calculate category counts from active_loan_details
    const categoryBreakdown = useMemo(() => {
        const loans = data?.active_loan_details || [];
        const counts = {
            'Personal Loan': { count: 0, items: [], icon: Briefcase },
            'Credit Card': { count: 0, items: [], icon: CreditCard },
            'Home Loan': { count: 0, items: [], icon: Home },
            'Gold Loan': { count: 0, items: [], icon: Coins },
            'Consumer Loan': { count: 0, items: [], icon: Landmark }
        };

        if (Array.isArray(loans)) {
            loans.forEach(loan => {
                const type = String(loan.loan_type || '').toLowerCase();
                if (type.includes('personal') || type.includes('consumer')) {
                    counts['Personal Loan'].count++;
                    counts['Personal Loan'].items.push(loan);
                } else if (type.includes('credit card') || type.includes('card')) {
                    counts['Credit Card'].count++;
                    counts['Credit Card'].items.push(loan);
                } else if (type.includes('home') || type.includes('housing') || type.includes('mortgage')) {
                    counts['Home Loan'].count++;
                    counts['Home Loan'].items.push(loan);
                } else if (type.includes('gold')) {
                    counts['Gold Loan'].count++;
                    counts['Gold Loan'].items.push(loan);
                } else {
                    counts['Consumer Loan'].count++;
                    counts['Consumer Loan'].items.push(loan);
                }
            });
        }
        return counts;
    }, [data?.active_loan_details]);

    // Compute total outstanding by summing active_loan_details — the single source of truth
    // This ensures the card and the breakdown detail always show the same number.
    const computedTotalOutstanding = useMemo(() => {
        const loans = data?.active_loan_details || [];
        if (!Array.isArray(loans) || loans.length === 0) return null;
        const total = loans.reduce((sum, loan) => {
            // Decimal-safe parsing: allow . and -
            const valStr = String(loan.outstanding_balance || '0').replace(/[^0-9.]/g, '');
            const v = Math.round(parseFloat(valStr) || 0);
            return sum + v;
        }, 0);
        return total > 0 ? '₹' + total.toLocaleString('en-IN') : null;
    }, [data?.active_loan_details]);

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

    const dateReported = summary.date_reported || data?.date_reported || '';

    const enquiryCounts = useMemo(() => {
        const list = data?.enquiry_list || [];
        const reportDate = parseDateHelper(dateReported) || new Date();

        const thirtyDaysAgo = new Date(reportDate);
        thirtyDaysAgo.setDate(reportDate.getDate() - 30);
        const ninetyDaysAgo = new Date(reportDate);
        ninetyDaysAgo.setDate(reportDate.getDate() - 90);

        let c30 = 0;
        let c90 = 0;

        if (Array.isArray(list)) {
            list.forEach(enq => {
                const d = parseDateHelper(enq?.date);
                if (d && !isNaN(d.getTime())) {
                    if (d >= thirtyDaysAgo && d <= reportDate) c30++;
                    if (d >= ninetyDaysAgo && d <= reportDate) c90++;
                }
            });
        }

        // Prefer computed values from enquiry_list over LLM-extracted summary fields
        // (same pattern as outstanding_amount fix — computed data is more reliable)
        const llm30 = summary.enquiries_30d !== undefined ? parseInt(summary.enquiries_30d) : null;
        const llm90 = summary.enquiries_90d !== undefined ? parseInt(summary.enquiries_90d) : null;
        return {
            thirty: (c30 > 0) ? c30 : (llm30 !== null ? llm30 : 0),
            ninety: (c90 > 0) ? c90 : (llm90 !== null ? llm90 : 0),
            actualCount30: c30,
            actualCount90: c90
        };
    }, [data?.enquiry_list, summary.enquiries_30d, summary.enquiries_90d, dateReported]);

    const sortedEnquiries = useMemo(() => {
        const list = data?.enquiry_list || [];
        return [...list].sort((a, b) => {
            const parseDateSort = (dStr) => {
                if (!dStr || typeof dStr !== 'string') return 0;
                const parts = dStr.split('-');
                if (parts.length < 3) return 0;
                return parseInt(parts[2] + parts[1] + parts[0]);
            };
            return parseDateSort(b.date) - parseDateSort(a.date);
        });
    }, [data?.enquiry_list]);

    const filteredEnquiries = useMemo(() => {
        if (!activeEnquiryView) return sortedEnquiries;

        const reportDate = parseDateHelper(dateReported) || new Date();
        const days = parseInt(activeEnquiryView);
        const cutoff = new Date(reportDate);
        cutoff.setDate(reportDate.getDate() - days);

        return sortedEnquiries.filter(enq => {
            const d = parseDateHelper(enq.date);
            return d && d >= cutoff && d <= reportDate;
        });
    }, [sortedEnquiries, activeEnquiryView, dateReported]);

    const closedLoans = data?.closed_loan_details || [];

    // Helper to toggle views correctly
    const toggleView = (setter, currentVal) => {
        setShowBreakdown(false);
        setShowClosedBreakdown(false);
        setShowScoreDetail(false);
        setShowOutstandingDetail(false);
        setShowRiskReasons(false);
        setShowScoreAnalysis(false);
        setActiveEnquiryView(null);
        setter(!currentVal);
    };

    return (
        <div className="fade-in" style={{ maxWidth: '1200px', margin: '0 auto' }}>
            {/* Header Section */}
            <div className="glass-panel" style={{ 
                marginBottom: '1rem', 
                padding: '1.25rem 2rem', 
                background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.1) 0%, rgba(167, 139, 250, 0.1) 100%)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                position: 'relative',
                overflow: 'hidden'
            }}>
                <div style={{ position: 'relative', zIndex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', marginBottom: '0.75rem' }}>
                        <div style={{ padding: '0.75rem', borderRadius: '1.25rem', background: 'var(--accent-glow)', border: '1px solid var(--accent-color)' }}>
                            <Activity size={28} color="var(--accent-color)" />
                        </div>
                        <div>
                            <h1 style={{ fontSize: '2.2rem', fontWeight: '900', color: 'var(--text-main)', margin: 0, letterSpacing: '-0.02em' }}>
                                Customer <span className="text-gradient">Portfolio Analysis</span>
                            </h1>
                            <p style={{ color: 'var(--text-dim)', fontSize: '1rem', fontWeight: '500', margin: 0 }}>B2B Underwriting Analysis powered by Loan At Click AI</p>
                        </div>
                    </div>
                </div>

                <div className="glass-panel" style={{ padding: '1.5rem 2rem', background: 'var(--panel-sub-bg)', border: '1px solid var(--border-color)', borderRadius: '1.5rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem 2rem' }}>
                        <div>
                            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: '800', color: 'var(--text-dim)', marginBottom: '0.4rem', letterSpacing: '0.1em' }}>Customer Name</div>
                            <div style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--text-main)' }}>{getName() || 'N/A'}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: '800', color: 'var(--text-dim)', marginBottom: '0.4rem', letterSpacing: '0.1em' }}>Date of Birth</div>
                            <div style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--text-main)' }}>{getDob() || 'N/A'}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: '800', color: 'var(--text-dim)', marginBottom: '0.4rem', letterSpacing: '0.1em' }}>Customer Contact</div>
                            <div style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--text-main)' }}>{getMobile() || 'N/A'}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: '800', color: 'var(--text-dim)', marginBottom: '0.4rem', letterSpacing: '0.1em' }}>Customer City</div>
                            <div style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--text-main)' }}>{getCity() || 'N/A'}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: '800', color: 'var(--text-dim)', marginBottom: '0.4rem', letterSpacing: '0.1em' }}>Customer State</div>
                            <div style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--text-main)' }}>{getState() || 'N/A'}</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Metric Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="metric-card" style={{ 
                    cursor: 'pointer', 
                    transition: 'transform 0.2s', 
                    position: 'relative', 
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    padding: '1rem'
                }} onClick={() => toggleView(setShowScoreDetail, showScoreDetail)}>
                    <div style={{ position: 'absolute', top: '1rem', right: '1rem' }}>
                        <ChevronDown size={18} style={{ opacity: 0.3, transform: showScoreDetail ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s' }} />
                    </div>
                    <ScoreGauge score={parseInt(summary.cibil_score) || 0} />
                </div>

                <div className="metric-card" style={{ cursor: 'pointer', transition: 'transform 0.2s' }} onClick={() => toggleView(setShowOutstandingDetail, showOutstandingDetail)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
                        <div style={{ padding: '0.85rem', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '1rem', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                            <CreditCard size={24} color="#f59e0b" />
                        </div>
                        <ChevronDown size={20} style={{ opacity: 0.3, transform: showOutstandingDetail ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s' }} />
                    </div>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Active Exposure</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                        {/* Always use computed total as the single source of truth to match the breakdown exactly */}
                        <span style={{ fontSize: '2rem', fontWeight: '900', color: 'var(--text-main)' }}>{computedTotalOutstanding || '₹0'}</span>
                    </div>
                </div>

                <div className="metric-card" style={{ cursor: 'pointer', transition: 'transform 0.2s' }} onClick={() => {
                    const newState = !showBreakdown;
                    setShowBreakdown(newState);
                    setShowClosedBreakdown(newState);
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
                        <div style={{ padding: '0.85rem', background: 'rgba(167, 139, 250, 0.1)', borderRadius: '1rem', border: '1px solid rgba(167, 139, 250, 0.2)' }}>
                            <Landmark size={24} color="#a78bfa" />
                        </div>
                        <ChevronDown size={20} style={{ opacity: 0.3, transform: showBreakdown ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s' }} />
                    </div>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Account Portfolio</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                        {/* Always use the actual count from the detail lists for 100% accuracy */}
                        <span style={{ fontSize: '2rem', fontWeight: '900', color: 'var(--text-main)' }}>{activeLoanDetails.length + closedLoanDetails.length}</span>
                        <span style={{ color: 'var(--text-dim)', fontWeight: '600', fontSize: '0.9rem' }}>Total accounts</span>
                    </div>
                </div>

                <div className="metric-card" style={{ cursor: 'pointer', transition: 'transform 0.2s' }} onClick={() => toggleView(setShowRiskReasons, showRiskReasons)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
                        <div style={{ padding: '0.85rem', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '1rem', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                            <ShieldAlert size={24} color="#10b981" />
                        </div>
                        <ChevronDown size={20} style={{ opacity: 0.3, transform: showRiskReasons ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s' }} />
                    </div>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Risk Assessment</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                        <span className={getRiskClass(riskLevel)} style={{ fontSize: '1.5rem', fontWeight: '900', textTransform: 'uppercase' }}>{riskLevel}</span>
                    </div>
                </div>

                <div className="metric-card" style={{ background: 'linear-gradient(135deg, rgba(248,113,113,0.1) 0%, rgba(251,191,36,0.1) 100%)', border: '1px solid rgba(248,113,113,0.2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
                        <div style={{ padding: '0.85rem', background: 'rgba(239, 68, 68, 0.15)', borderRadius: '1rem' }}>
                            <AlertTriangle size={24} color="#f87171" />
                        </div>
                    </div>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>Total Enquiries</div>
                    <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-end' }}>
                        <div>
                            <div style={{ fontSize: '2.1rem', fontWeight: '900', color: 'var(--text-main)', lineHeight: '1' }}>{enquiryList.length > 0 ? enquiryList.length : (summary.total_enquiries || 0)}</div>
                            <div style={{ fontSize: '0.65rem', fontWeight: '800', color: 'var(--text-dim)', textTransform: 'uppercase', marginTop: '0.3rem' }}>Lifetime</div>
                        </div>
                        <div style={{ width: '1px', height: '30px', background: 'var(--border-color)', margin: '0 0.2rem 0.2rem' }} />
                        <div style={{ cursor: 'pointer' }} onClick={() => setActiveEnquiryView('30')}>
                            <div style={{ fontSize: '1.4rem', fontWeight: '900', color: '#f87171', lineHeight: '1' }}>{enquiryCounts.thirty}</div>
                            <div style={{ fontSize: '0.65rem', fontWeight: '800', color: 'var(--text-dim)', textTransform: 'uppercase', marginTop: '0.3rem' }}>30 Days</div>
                        </div>
                        <div style={{ cursor: 'pointer' }} onClick={() => setActiveEnquiryView('90')}>
                            <div style={{ fontSize: '1.4rem', fontWeight: '900', color: '#fbbf24', lineHeight: '1' }}>{enquiryCounts.ninety}</div>
                            <div style={{ fontSize: '0.65rem', fontWeight: '800', color: 'var(--text-dim)', textTransform: 'uppercase', marginTop: '0.3rem' }}>90 Days</div>
                        </div>
                    </div>
                </div>

                <div className="metric-card" style={{ cursor: 'pointer', transition: 'transform 0.2s' }} onClick={() => toggleView(setShowClosedBreakdown, showClosedBreakdown)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
                        <div style={{ padding: '0.85rem', background: 'rgba(96, 165, 250, 0.1)', borderRadius: '1rem', border: '1px solid rgba(96, 165, 250, 0.2)' }}>
                            <Clock size={24} color="#60a5fa" />
                        </div>
                        <ChevronDown size={20} style={{ opacity: 0.3, transform: showClosedBreakdown ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s' }} />
                    </div>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Closed Accounts</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                        <span style={{ fontSize: '2rem', fontWeight: '900', color: 'var(--text-main)' }}>{closedLoanDetails.length}</span>
                        <span style={{ color: 'var(--text-dim)', fontWeight: '600', fontSize: '0.9rem' }}>Historical depth</span>
                    </div>
                </div>
            </div>

            {showScoreDetail && (
                <div className="glass-panel fade-in" style={{
                    marginBottom: '1rem',
                    padding: '1.5rem',
                    background: 'rgba(129, 140, 248, 0.05)',
                    border: '1px solid rgba(129, 140, 248, 0.2)',
                    animation: 'slideDown 0.3s ease-out'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
                        <div>
                            <h3 style={{ fontSize: '1.4rem', fontWeight: '700', color: '#818cf8', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <Activity size={24} />
                                Technical Score Breakdown
                            </h3>
                            <p style={{ color: 'var(--text-muted)', fontSize: '1rem', marginTop: '0.5rem' }}>Underwriting analysis of customer credit profile</p>
                        </div>
                        <button className="btn-secondary" onClick={() => setShowScoreDetail(false)}>Close Analysis</button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
                        <div className="glass-panel" style={{ padding: '1.5rem', background: 'var(--panel-sub-bg)' }}>
                            <h4 style={{ fontSize: '0.85rem', color: 'var(--text-dim)', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1.25rem' }}>Score Insights</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div style={{ padding: '0.75rem 1rem', background: 'var(--panel-sub-bg)', border: '1px solid var(--border-color)', borderRadius: '0.75rem', marginBottom: '1rem' }}>
                                    <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.4rem', textTransform: 'uppercase', fontWeight: '800' }}>Score Range Positioning</p>
                                    <div style={{ height: '6px', width: '100%', background: 'linear-gradient(90deg, #ef4444 0%, #fbbf24 50%, #10b981 100%)', borderRadius: '3px', marginBottom: '0.4rem' }}></div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: 'var(--text-dim)', fontWeight: '700' }}>
                                        <span>300</span>
                                        <span>900</span>
                                    </div>
                                </div>
                                {Array.isArray(data.credit_score_analysis) ? data.credit_score_analysis.map((item, idx) => (
                                    <div key={idx} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#818cf8', marginTop: '6px', flexShrink: 0 }} />
                                        <p style={{ margin: 0, fontSize: '0.95rem', lineHeight: '1.5', color: 'var(--text-main)' }}>{item}</p>
                                    </div>
                                )) : (                                    <p style={{ fontSize: '0.82rem', fontWeight: '500', color: 'var(--text-main)', lineHeight: '1.4', margin: 0 }}>
                                        {riskLevel.toLowerCase().includes('very good') || riskLevel.toLowerCase().includes('low') ? 'Excellent credit discipline. High eligibility for premium offers.' :
                                            riskLevel.toLowerCase().includes('average') || riskLevel.toLowerCase().includes('high') ? 'Potential stress. Focus on reducing balances and timely payments.' :
                                                'Moderate standing. Consistent payments will improve your profile.'}
                                    </p>
                                )}
                            </div>
                        </div>
                        <div className="glass-panel" style={{ padding: '1.75rem', background: 'linear-gradient(135deg, rgba(129,140,248,0.1) 0%, rgba(79,70,229,0.1) 100%)', border: '1px solid rgba(129,140,248,0.2)' }}>
                            <ShieldCheck size={32} color="#818cf8" style={{ marginBottom: '1.25rem' }} />
                            <h4 style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--text-main)', marginBottom: '0.75rem' }}>Expert Recommendation</h4>
                            <p style={{ margin: 0, fontSize: '0.98rem', lineHeight: '1.6', color: 'var(--text-muted)' }}>
                                Your CIBIL score of <b style={{ color: 'var(--text-main)' }}>{summary.cibil_score}</b> is currently in the <b style={{ color: getRiskClass(riskLevel) === 'risk-low' ? '#10b981' : (getRiskClass(riskLevel) === 'risk-high' ? '#ef4444' : '#f59e0b') }}>{riskLevel}</b> range. 
                                {getRiskClass(riskLevel) === 'risk-low' 
                                    ? " Maintaining this status requires consistent on-time payments and keeping your credit utilization below 30%."
                                    : " Aim to reduce your credit utilization and ensure no delays in payments to transition towards a lower risk category."}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {showOutstandingDetail && (
                <div className="glass-panel fade-in" style={{
                    marginBottom: '1rem',
                    padding: '1.25rem 1.75rem',
                    background: 'rgba(16, 185, 129, 0.04)',
                    border: '1px solid rgba(16, 185, 129, 0.12)',
                    animation: 'slideDown 0.3s ease-out'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--success-color)', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                            <Coins size={18} />
                            Outstanding Breakdown
                        </h3>
                        <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', margin: 0 }}>
                            Total: <span style={{ color: 'var(--text-main)', fontWeight: '800' }}>{computedTotalOutstanding || summary.outstanding_amount}</span>
                        </p>
                    </div>

                    {/* Category rows — each is a clickable button */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        {Object.entries(categoryBreakdown).map(([cat, info]) => {
                            const isExpanded = activeCategory === cat;
                            const catOutstanding = Array.isArray(info.items) ? info.items.reduce((s, l) => {
                                const valStr = String(l.outstanding_balance || '0').replace(/[^0-9.]/g, '');
                                const v = Math.round(parseFloat(valStr) || 0);
                                return s + v;
                            }, 0) : 0;
                            const catOutStr = catOutstanding > 0 ? '₹' + catOutstanding.toLocaleString('en-IN') : null;

                            return (
                                <div key={cat}>
                                    <button
                                        onClick={() => setActiveCategory(isExpanded ? null : cat)}
                                        style={{
                                            width: '100%',
                                            display: 'flex',
                                            alignItems: 'center',
                                            padding: '0.9rem 1.25rem',
                                            borderRadius: isExpanded ? '1rem 1rem 0 0' : '1rem',
                                            border: isExpanded
                                                ? '1px solid rgba(16,185,129,0.35)'
                                                : '1px solid var(--border-color)',
                                            background: isExpanded
                                                ? 'rgba(16,185,129,0.1)'
                                                : 'var(--nav-bg)',
                                            cursor: info.count > 0 ? 'pointer' : 'default',
                                            transition: 'all 0.3s ease',
                                            gap: '1rem',
                                            textAlign: 'left',
                                        }}
                                    >
                                        {/* Icon */}
                                        <div style={{ padding: '0.5rem', borderRadius: '0.6rem', background: info.count > 0 ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.04)', flexShrink: 0 }}>
                                            <info.icon size={16} color={info.count > 0 ? 'var(--success-color)' : 'var(--text-dim)'} />
                                        </div>

                                        {/* Category name */}
                                        <span style={{ flex: 1, fontWeight: '700', fontSize: '0.95rem', color: info.count > 0 ? 'var(--text-main)' : 'var(--text-dim)' }}>
                                            {cat}
                                        </span>

                                        {/* Count badge */}
                                        <span style={{
                                            padding: '0.2rem 0.65rem', borderRadius: '100px', fontSize: '0.8rem', fontWeight: '800',
                                            background: info.count > 0 ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.05)',
                                            border: info.count > 0 ? '1px solid rgba(16,185,129,0.25)' : '1px solid rgba(255,255,255,0.06)',
                                            color: info.count > 0 ? 'var(--success-color)' : 'var(--text-dim)'
                                        }}>
                                            {info.count > 0 ? `${info.count} account${info.count > 1 ? 's' : ''}` : 'None'}
                                        </span>

                                        {/* Outstanding for category */}
                                        {catOutStr && (
                                            <span style={{ fontSize: '0.9rem', fontWeight: '800', color: '#f59e0b', minWidth: '90px', textAlign: 'right' }}>{catOutStr}</span>
                                        )}

                                        {/* Expand chevron */}
                                        {info.count > 0 && (
                                            <ChevronDown size={16} color='var(--text-dim)'
                                                style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s ease', flexShrink: 0 }}
                                            />
                                        )}
                                    </button>

                                    {/* Inline detail panel */}
                                    {isExpanded && info.items.length > 0 && (
                                        <div className="fade-in" style={{
                                            borderRadius: '0 0 1rem 1rem',
                                            border: '1px solid rgba(16,185,129,0.25)',
                                            borderTop: 'none',
                                            background: 'rgba(0,0,0,0.15)',
                                            overflow: 'hidden'
                                        }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                <thead>
                                                    <tr style={{ background: 'var(--panel-sub-bg)' }}>
                                                        {['Lender', 'Amount', 'Balance', 'Overdue', 'EMI', 'Opened'].map(h => (
                                                            <th key={h} style={{ padding: '0.6rem 1rem', textAlign: 'left', fontSize: '0.62rem', color: 'var(--text-dim)', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{h}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {info.items.map((loan, i) => (
                                                        <tr
                                                            key={loan.account_no || i}
                                                            className="clickable-row"
                                                            onClick={() => setSelectedLoan(loan)}
                                                            style={{ transition: 'background 0.15s' }}
                                                        >
                                                            <td style={{ padding: '0.6rem 1rem', fontWeight: '800', color: 'var(--text-main)', borderBottom: '1px solid var(--panel-sub-bg)', fontSize: '0.82rem' }}>{loan.lender_name || '—'}</td>
                                                            <td style={{ padding: '0.6rem 1rem', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--panel-sub-bg)', fontSize: '0.8rem' }}>{loan.loan_amount || '—'}</td>
                                                            <td style={{ padding: '0.6rem 1rem', fontWeight: '700', color: '#f59e0b', borderBottom: '1px solid var(--panel-sub-bg)', fontSize: '0.8rem' }}>{loan.outstanding_balance || '—'}</td>
                                                            <td style={{ padding: '0.6rem 1rem', fontWeight: '800', color: (loan.overdue_amount && loan.overdue_amount !== '₹0') ? '#ef4444' : 'var(--text-dim)', borderBottom: '1px solid var(--panel-sub-bg)', fontSize: '0.8rem' }}>{loan.overdue_amount || '₹0'}</td>
                                                            <td style={{ padding: '0.6rem 1rem', fontWeight: '700', color: '#60a5fa', borderBottom: '1px solid var(--panel-sub-bg)', fontSize: '0.8rem' }}>{loan.emi || '—'}</td>
                                                            <td style={{ padding: '0.6rem 1rem', color: 'var(--text-dim)', borderBottom: '1px solid var(--panel-sub-bg)', fontSize: '0.75rem' }}>{loan.loan_start_date || '—'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* OUTSTANDING BREAKDOWN SECTION */}
            {showOutstandingDetail && (
                <div className="glass-panel fade-in" style={{
                    marginBottom: '1rem',
                    padding: '1.5rem',
                    background: 'rgba(245, 158, 11, 0.05)',
                    border: '1px solid rgba(245, 158, 11, 0.2)',
                    animation: 'slideDown 0.3s ease-out'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
                        <div>
                            <h3 style={{ fontSize: '1.4rem', fontWeight: '700', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <CreditCard size={24} />
                                Outstanding Balance Breakdown
                            </h3>
                            <p style={{ color: 'var(--text-muted)', fontSize: '1rem', marginTop: '0.5rem' }}>Detailed view of your current financial liabilities</p>
                        </div>
                        <button className="btn-secondary" onClick={() => setShowOutstandingDetail(false)}>Close Details</button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
                        {Object.entries(categoryBreakdown).map(([cat, info], idx) => {
                            const catOutstandingTotal = info.items.reduce((s, l) => {
                                const valStr = String(l.outstanding_balance || '0').replace(/[^0-9.]/g, '');
                                const v = Math.round(parseFloat(valStr) || 0);
                                return s + v;
                            }, 0);
                            
                            if (info.count === 0) return null;

                            return (
                                <div key={idx} className="glass-panel" style={{ padding: '1.5rem', background: 'var(--panel-sub-bg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>{cat}</div>
                                        <div style={{ fontSize: '1.3rem', fontWeight: '900', color: 'var(--text-main)' }}>₹{catOutstandingTotal.toLocaleString('en-IN')}</div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: '700' }}>{info.count} Accounts</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* LOAN DRILL DOWN SECTION */}
            {showBreakdown && (
                <div className="glass-panel fade-in" style={{
                    marginBottom: '1rem',
                    padding: '1.5rem',
                    background: 'rgba(167, 139, 250, 0.05)',
                    border: '1px solid rgba(167, 139, 250, 0.2)',
                    animation: 'slideDown 0.3s ease-out'
                }}>
                    <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h3 style={{ fontSize: '1.4rem', fontWeight: '700', color: '#A78BFA', display: 'flex', alignItems: 'center', gap: '1rem', margin: 0 }}>
                                <Landmark size={24} />
                                Active Portfolio Details
                            </h3>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.4rem' }}>
                                Showing <span style={{ color: 'var(--text-main)', fontWeight: '800' }}>{activeLoanDetails.length}</span> active accounts across {Object.values(categoryBreakdown).filter(v => v.count > 0).length} categories.
                            </p>
                        </div>
                        <button className="btn-secondary" onClick={() => {
                            setShowBreakdown(false);
                            setShowClosedBreakdown(false);
                        }}>Close Portfolio</button>
                    </div>

                    {/* Unified Active Table - Always show for 100% transparency */}
                    {activeLoanDetails.length > 0 ? (
                        <>
                            <div className="data-table-container">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Lender</th>
                                            <th>Account Type</th>
                                            <th>Sanctioned</th>
                                            <th>Current Bal</th>
                                            <th>Monthly EMI</th>
                                            <th>Opened</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {activeLoanDetails.map((loan, i) => (
                                            <tr 
                                                key={i}
                                                className="clickable-row"
                                                onClick={() => setSelectedLoan(loan)}
                                            >
                                                <td style={{ fontWeight: '700' }}>{loan.lender_name || '—'}</td>
                                                <td style={{ color: 'var(--text-dim)' }}>{loan.loan_type || '—'}</td>
                                                <td style={{ fontWeight: '600' }}>{loan.loan_amount || '—'}</td>
                                                <td style={{ color: 'var(--accent-color)', fontWeight: '800' }}>{loan.outstanding_balance || '—'}</td>
                                                <td style={{ color: '#60a5fa', fontWeight: '700' }}>{loan.emi || '—'}</td>
                                                <td style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>{loan.loan_start_date || '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                            No active accounts found in the primary listing.
                        </div>
                    )}
                </div>
            )}

            {/* CLOSED LOAN DETAIL SECTION */}
            {showClosedBreakdown && (
                <div className="glass-panel fade-in" style={{
                    marginBottom: '1rem',
                    padding: '1.5rem',
                    background: 'rgba(96, 165, 250, 0.05)',
                    border: '1px solid rgba(96, 165, 250, 0.2)',
                    animation: 'slideDown 0.3s ease-out'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                        <div>
                            <h3 style={{ fontSize: '1.4rem', fontWeight: '700', color: '#60A5FA', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <Clock size={24} />
                                Historical Account Details
                            </h3>
                            <p style={{ color: 'var(--text-muted)', fontSize: '1rem', marginTop: '0.5rem' }}>Complete record of your previously closed liabilities</p>
                        </div>
                        <button className="btn-secondary" onClick={() => setShowClosedBreakdown(false)}>Close Details</button>
                    </div>

                    {closedLoans.length > 0 ? (
                        <div className="data-table-container">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Lender</th>
                                        <th>Loan Type</th>
                                        <th>Amount</th>
                                        <th>Date Opened</th>
                                        <th>Date Closed</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {closedLoans.map((loan, index) => (
                                        <tr key={index} className="clickable-row" onClick={() => setSelectedLoan(loan)}>
                                            <td style={{ fontWeight: '700', color: 'var(--text-main)' }}>{loan.lender_name || '—'}</td>
                                            <td style={{ color: 'var(--text-muted)' }}>{loan.loan_type || '—'}</td>
                                            <td style={{ fontWeight: '800' }}>{loan.loan_amount || '—'}</td>
                                            <td style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>{loan.loan_start_date || '—'}</td>
                                            <td style={{ fontWeight: '700', color: '#60A5FA' }}>{loan.date_closed || '—'}</td>
                                            <td>
                                                <span style={{ padding: '0.2rem 0.6rem', borderRadius: '100px', fontSize: '0.7rem', background: 'rgba(96,165,250,0.1)', color: '#60A5FA', fontWeight: '800', border: '1px solid rgba(96,165,250,0.2)' }}>CLOSED</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                            No historical records found for this user.
                        </div>
                    )}
                </div>
            )}

            {/* RISK REASONS DETAIL SECTION */}
            {showRiskReasons && (
                <div className="glass-panel fade-in" style={{
                    marginBottom: '1rem',
                    padding: '1.25rem 1.5rem',
                    background: 'rgba(16, 185, 129, 0.05)',
                    border: '1px solid rgba(16, 185, 129, 0.12)',
                    animation: 'slideDown 0.3s ease-out'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--success-color)', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                            <ShieldAlert size={18} />
                            Risk Analysis Logic
                        </h3>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
                        {data.risk_reasons && data.risk_reasons.length > 0 ? (
                            data.risk_reasons.map((reason, idx) => (
                                <div key={idx} style={{ 
                                    padding: '0.6rem 1rem', 
                                    background: 'var(--panel-sub-bg)', 
                                    border: '1px solid var(--border-color)', 
                                    borderRadius: '0.75rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.75rem'
                                }}>
                                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--success-color)', flexShrink: 0 }} />
                                    <p style={{ fontSize: '0.85rem', color: 'var(--text-main)', fontWeight: '600', margin: 0 }}>{reason}</p>
                                </div>
                            ))
                        ) : (
                            <div style={{ padding: '1rem', textAlign: 'center', gridColumn: 'span 2', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                                No adverse factors. Meets criteria for {riskLevel}.
                            </div>
                        )}
                    </div>

                    {/* NEW: Delinquency Details Section */}
                    {data.delinquency_details && data.delinquency_details.length > 0 && (
                        <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)' }}>
                            <h4 style={{ fontSize: '0.9rem', color: 'var(--danger-color)', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <AlertTriangle size={16} />
                                Specific Delinquency Events (DPD {'>'} 0)
                            </h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {data.delinquency_details.map((event, idx) => (
                                    <div key={idx} style={{ 
                                        padding: '0.85rem 1.25rem', 
                                        background: 'rgba(239, 68, 68, 0.05)', 
                                        border: '1px solid rgba(239, 68, 68, 0.15)', 
                                        borderRadius: '0.75rem',
                                        fontSize: '0.88rem',
                                        color: '#fca5a5',
                                        fontWeight: '500',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}>
                                        <span>{event}</span>
                                        <span style={{ fontSize: '0.75rem', background: 'rgba(239, 68, 68, 0.2)', padding: '2px 8px', borderRadius: '4px', fontWeight: '800' }}>ACTION REQUIRED</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}


            {activeEnquiryView && (
                <div className="glass-panel fade-in" style={{
                    marginBottom: '1rem',
                    padding: '1.25rem 1.75rem',
                    background: activeEnquiryView === '30' ? 'rgba(248, 113, 113, 0.05)' : 'rgba(251, 191, 36, 0.05)',
                    border: `1px solid ${activeEnquiryView === '30' ? 'rgba(248, 113, 113, 0.12)' : 'rgba(251, 191, 36, 0.12)'}`,
                    animation: 'slideDown 0.3s ease-out'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: '800', color: activeEnquiryView === '30' ? '#F87171' : '#FBBF24', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                            <Calendar size={18} />
                            {activeEnquiryView}-Day Enquiries
                        </h3>
                    </div>

                    {filteredEnquiries.length > 0 ? (
                        <div className="data-table-container" style={{ maxHeight: '250px', overflowY: 'auto' }}>
                            <table className="data-table" style={{ fontSize: '0.85rem' }}>
                                <thead>
                                    <tr>
                                        <th>Lender</th>
                                        <th>Date</th>
                                        <th>Purpose</th>
                                        <th>Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredEnquiries.map((enq, index) => (
                                        <tr key={index}>
                                            <td style={{ fontWeight: '800' }}>{enq.lender}</td>
                                            <td style={{ fontWeight: '700', color: 'var(--text-main)' }}>{enq.date}</td>
                                            <td style={{ color: 'var(--text-muted)' }}>{enq.purpose}</td>
                                            <td style={{ fontWeight: '700' }}>{enq.amount}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '1.5rem', background: 'rgba(0,0,0,0.1)', borderRadius: '0.75rem' }}>
                            <p style={{ color: 'var(--text-dim)', fontSize: '0.82rem', margin: 0 }}>
                                {activeEnquiryView === '30' ? enquiryCounts.thirty : enquiryCounts.ninety} enquiry(s) found but individual details missing.
                            </p>
                        </div>
                    )}
                </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1.5rem', marginBottom: '2rem' }}>
                <button className="btn-primary" onClick={onNext} style={{ padding: '0.75rem 2.5rem', fontSize: '1rem', borderRadius: '1rem' }}>
                    View Deep Analysis
                    <Zap size={20} />
                </button>
            </div>
            {/* Loan Detail Modal */}
            {selectedLoan && (
                <div className="modal-overlay" onClick={() => setSelectedLoan(null)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                        <button className="modal-close" onClick={() => setSelectedLoan(null)}><Activity size={18} /></button>
                        
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.75rem', gap: '1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                <div style={{ padding: '0.4rem', borderRadius: '0.6rem', background: 'var(--accent-glow)', border: '1px solid var(--accent-color)', flexShrink: 0 }}>
                                    <CreditCard size={18} color="var(--accent-color)" />
                                </div>
                                <div>
                                    <h2 style={{ fontSize: '1.1rem', fontWeight: '900', color: 'var(--text-main)', margin: 0, lineHeight: 1.2 }}>{selectedLoan.lender_name || 'Loan Detail'}</h2>
                                    <p style={{ color: 'var(--text-dim)', fontSize: '0.75rem', margin: 0 }}>{selectedLoan.loan_type}</p>
                                </div>
                            </div>
                            {selectedLoan.loan_start_date && (
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '0.65rem', fontWeight: '800', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Opened On</div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: '800', color: 'var(--accent-color)' }}>{selectedLoan.loan_start_date}</div>
                                </div>
                            )}
                        </div>

                        <div className="detail-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem 1rem', padding: '0.75rem', background: 'var(--panel-sub-bg)', borderRadius: '0.75rem', border: '1px solid var(--border-color)' }}>
                            <div className="detail-item" style={{ borderBottom: 'none', padding: 0, flexDirection: 'column', alignItems: 'flex-start' }}>
                                <span className="detail-label" style={{ fontSize: '0.65rem', marginBottom: '0.1rem' }}>Status</span>
                                <span className={`detail-value ${selectedLoan.status?.toLowerCase().includes('closed') ? 'risk-low' : 'risk-medium'}`} style={{ textTransform: 'uppercase', fontSize: '0.82rem' }}>
                                    {selectedLoan.status || 'Active'}
                                </span>
                            </div>
                            <div className="detail-item" style={{ borderBottom: 'none', padding: 0, flexDirection: 'column', alignItems: 'flex-start' }}>
                                <span className="detail-label" style={{ fontSize: '0.65rem', marginBottom: '0.1rem' }}>Account No</span>
                                <span className="detail-value" style={{ fontSize: '0.82rem' }}>{selectedLoan.account_no || '—'}</span>
                            </div>
                            <div className="detail-item" style={{ borderBottom: 'none', padding: 0, flexDirection: 'column', alignItems: 'flex-start' }}>
                                <span className="detail-label" style={{ fontSize: '0.65rem', marginBottom: '0.1rem' }}>Sanctioned</span>
                                <span className="detail-value" style={{ fontSize: '0.85rem' }}>{selectedLoan.loan_amount}</span>
                            </div>
                            <div className="detail-item" style={{ borderBottom: 'none', padding: 0, flexDirection: 'column', alignItems: 'flex-start' }}>
                                <span className="detail-label" style={{ fontSize: '0.65rem', marginBottom: '0.1rem' }}>Outstanding</span>
                                <span className="detail-value" style={{ color: 'var(--warning-color)', fontSize: '0.85rem' }}>{selectedLoan.outstanding_balance || '₹0'}</span>
                            </div>
                        </div>

                        {selectedLoan.payment_history && selectedLoan.payment_history.length > 0 && (
                            <div style={{ marginTop: '1rem' }}>
                                <h4 style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <Activity size={14} color="var(--accent-color)" />
                                    Payment Behavior History
                                </h4>
                                <div style={{ 
                                    display: 'grid', 
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(65px, 1fr))', 
                                    gap: '0.5rem',
                                    maxHeight: '150px',
                                    overflowY: 'auto',
                                    padding: '0.5rem',
                                    background: 'var(--panel-sub-bg)',
                                    borderRadius: '0.75rem',
                                    border: '1px solid var(--border-color)'
                                }}>
                                    {selectedLoan.payment_history.map((h, i) => {
                                        const isBad = h.dpd > 0 || !['STD', '0', '000', 'ACT'].includes(String(h.status).toUpperCase());
                                        return (
                                            <div key={i} style={{ 
                                                padding: '0.4rem 0.2rem', 
                                                borderRadius: '0.5rem', 
                                                background: isBad ? 'rgba(239, 68, 68, 0.1)' : 'var(--nav-bg)',
                                                border: `1px solid ${isBad ? 'rgba(239, 68, 68, 0.2)' : 'var(--border-color)'}`,
                                                textAlign: 'center'
                                            }}>
                                                <div style={{ fontSize: '0.6rem', fontWeight: '700', color: 'var(--text-dim)' }}>{h.month_year}</div>
                                                <div style={{ fontSize: '0.75rem', fontWeight: '900', color: isBad ? '#f87171' : '#10b981' }}>{h.status}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        <div style={{ marginTop: '2rem', padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '1rem', border: '1px solid var(--border-color)' }}>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', margin: 0, lineHeight: '1.4' }}>
                                Detailed behavior tracking allows underwriters to assess repayment consistency over the last 24-36 months.
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
