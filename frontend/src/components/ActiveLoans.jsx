export default function ActiveLoans({ loans, onNext }) {
    return (
        <div className="fade-in">
            <div className="section-header" style={{ marginBottom: '2.5rem' }}>
                <h2 style={{ fontSize: '1.75rem', fontWeight: '800' }}>Active Obligations</h2>
                <p style={{ color: 'var(--text-muted)' }}>Detailed breakdown of all currently active liabilities</p>
            </div>

            <div className="glass-panel" style={{ padding: '2rem', background: 'rgba(255, 255, 255, 0.01)', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <p style={{ fontSize: '1.1rem', fontWeight: '500' }}>
                        Total Active Accounts: <span style={{ color: 'var(--accent-color)', fontWeight: '700' }}>{loans?.length || 0}</span>
                    </p>
                </div>

                {loans && loans.length > 0 ? (
                    <div className="data-table-container">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Lender</th>
                                    <th>Account Type</th>
                                    <th>Principal</th>
                                    <th>Outstanding</th>
                                    <th>EMI</th>
                                    <th>Since</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loans.map((loan, index) => (
                                    <tr key={index}>
                                        <td style={{ fontWeight: '600' }}>{loan.lender_name}</td>
                                        <td>{loan.loan_type}</td>
                                        <td>{loan.loan_amount}</td>
                                        <td style={{ color: 'var(--accent-color)', fontWeight: '600' }}>{loan.outstanding_balance}</td>
                                        <td>{loan.emi}</td>
                                        <td>{loan.loan_start_date}</td>
                                        <td>
                                            <span style={{
                                                padding: '0.25rem 0.75rem',
                                                borderRadius: '100px',
                                                fontSize: '0.75rem',
                                                background: loan.status?.toLowerCase().includes('active') ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                                                color: loan.status?.toLowerCase().includes('active') ? 'var(--success-color)' : 'var(--text-muted)',
                                                fontWeight: '600',
                                                border: `1px solid ${loan.status?.toLowerCase().includes('active') ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.1)'}`
                                            }}>
                                                {loan.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                        No active obligations found in this report.
                    </div>
                )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '4rem' }}>
                <button className="btn-primary" onClick={onNext} style={{ padding: '1rem 3.5rem' }}>
                    ➡ Go to Loan History
                </button>
            </div>
        </div>
    )
}
