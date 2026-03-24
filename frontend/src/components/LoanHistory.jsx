import React from 'react';
import { Briefcase, CreditCard, Home, Coins, Landmark } from 'lucide-react';

const LoanTable = ({ title, icon: Icon, data, columns, type }) => {
    if (!data || data.length === 0) return null;

    return (
        <div className="glass-panel fade-in" style={{ padding: '2rem', marginBottom: '2.5rem', background: 'rgba(255, 255, 255, 0.01)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ padding: '0.75rem', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '1rem' }}>
                    <Icon size={24} color="var(--accent-color)" />
                </div>
                <h3 style={{ fontSize: '1.5rem', fontWeight: '700' }}>{title}</h3>
            </div>

            <div className="data-table-container">
                <table className="data-table">
                    <thead>
                        <tr>
                            {columns.map((col, i) => <th key={i}>{col}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((item, index) => (
                            <tr key={index}>
                                {type === 'card' ? (
                                    <>
                                        <td style={{ fontWeight: '600' }}>{item.issuer}</td>
                                        <td style={{ color: 'var(--accent-color)', fontWeight: '600' }}>{item.limit}</td>
                                        <td>
                                            <span style={{
                                                padding: '0.2rem 0.6rem',
                                                borderRadius: '100px',
                                                fontSize: '0.75rem',
                                                background: item.status?.toLowerCase().includes('active') ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                                                color: item.status?.toLowerCase().includes('active') ? 'var(--success-color)' : 'var(--text-muted)',
                                                fontWeight: '600',
                                                border: '1px solid rgba(255, 255, 255, 0.05)'
                                            }}>
                                                {item.status}
                                            </span>
                                        </td>
                                        <td>{item.date}</td>
                                    </>
                                ) : (
                                    <>
                                        <td style={{ fontWeight: '600' }}>{item.lender}</td>
                                        <td style={{ color: 'var(--accent-color)', fontWeight: '600' }}>{item.amount || item.limit}</td>
                                        <td>
                                            <span style={{
                                                padding: '0.2rem 0.6rem',
                                                borderRadius: '100px',
                                                fontSize: '0.75rem',
                                                background: item.status?.toLowerCase().includes('active') ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                                                color: item.status?.toLowerCase().includes('active') ? 'var(--success-color)' : 'var(--text-muted)',
                                                fontWeight: '600',
                                                border: '1px solid rgba(255, 255, 255, 0.05)'
                                            }}>
                                                {item.status}
                                            </span>
                                        </td>
                                        <td>{item.date}</td>
                                    </>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default function LoanHistory({ history, onNext }) {
    if (!history) return null;

    const sections = [
        { title: 'Personal Loans', icon: Briefcase, data: history.personal_loans, columns: ['Lender', 'Amount', 'Status', 'Start Date'], type: 'loan' },
        { title: 'Credit Cards', icon: CreditCard, data: history.credit_cards, columns: ['Issuer', 'Limit', 'Status', 'Open Date'], type: 'card' },
        { title: 'Home Loans', icon: Home, data: history.home_loans, columns: ['Lender', 'Amount', 'Status', 'Start Date'], type: 'loan' },
        { title: 'Gold Loans', icon: Coins, data: history.gold_loans, columns: ['Lender', 'Amount', 'Status', 'Start Date'], type: 'loan' },
        { title: 'Overdrafts', icon: Landmark, data: history.overdrafts, columns: ['Lender', 'Limit', 'Status', 'Start Date'], type: 'loan' }
    ];

    const hasData = sections.some(s => s.data && s.data.length > 0);

    return (
        <div className="fade-in">
            <div className="section-header" style={{ marginBottom: '3rem' }}>
                <h2 style={{ fontSize: '2rem', fontWeight: '800' }}>Loan Categorization</h2>
                <p style={{ color: 'var(--text-muted)' }}>Historical breakdown of all accounts grouped by credit type</p>
            </div>

            {hasData ? (
                sections.map((sec, i) => (
                    <LoanTable key={i} {...sec} />
                ))
            ) : (
                <div className="glass-panel" style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
                    No categorized loan history identified.
                </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '3rem' }}>
                <button className="btn-primary" onClick={onNext} style={{ padding: '1rem 3.5rem' }}>
                    ➡ Go to Payment Track
                </button>
            </div>
        </div>
    );
}
