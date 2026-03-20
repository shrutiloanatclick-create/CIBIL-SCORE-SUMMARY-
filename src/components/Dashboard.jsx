import { RefreshCcw, Download, FileSpreadsheet, Zap } from 'lucide-react'
import { useState } from 'react'
import axios from 'axios'
import CreditSummary from './CreditSummary'
import DeepAnalysis from './DeepAnalysis'
import AIChat from './AIChat'

export default function Dashboard({ data, extractedText, onReset }) {
    console.log("DEBUG: Dashboard mounting with data:", data);
    const [currentStep, setCurrentStep] = useState(1);

    if (!data || !data.summary) {
        return (
            <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center' }}>
                <h2 style={{ color: 'var(--danger-color)' }}>Invalid Report Data</h2>
                <p style={{ color: 'var(--text-dim)', marginBottom: '1.5rem' }}>
                    The report data received from the server is missing required components.
                </p>
                <button className="btn-primary" onClick={onReset}>Try Again</button>
            </div>
        );
    }

    const getRiskClass = (level) => {
        if (!level) return 'risk-medium';
        const l = level.toLowerCase();
        if (l.includes('very good') || l.includes('low')) return 'risk-low';
        if (l.includes('average') || l.includes('high')) return 'risk-high';
        return 'risk-medium';
    }

    const getBackendUrl = () => {
        const hostname = window.location.hostname;
        return `http://${hostname}:8000`;
    };

    const handleExportPDF = async () => {
        try {
            const response = await axios.post(`${getBackendUrl()}/api/export/pdf`, data, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'cibil_summary.pdf');
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (err) {
            alert("Failed to export PDF. Check if backend is running.");
        }
    }

    const handleExportExcel = async () => {
        try {
            const response = await axios.post(`${getBackendUrl()}/api/export/excel`, data, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'cibil_summary.xlsx');
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (err) {
            alert("Failed to export Excel. Check if backend is running.");
        }
    }

    const steps = [
        { step: 1, label: 'Summary' },
        { step: 2, label: 'Deep Analysis', icon: Zap },
    ];

    return (
        <div className="glass-panel fade-in" style={{ padding: '0', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
            {/* Compact Nav Bar */}
            <div style={{
                padding: '1rem 2rem',
                borderBottom: '1px solid var(--border-color)',
                background: 'var(--nav-bg)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '1rem'
            }}>
                {/* Stepper */}
                <div className="stepper" style={{ padding: '0.4rem 0.75rem', gap: '0.5rem' }}>
                    {steps.map(({ step, label, icon: Icon }, idx) => (
                        <div key={step} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {idx > 0 && <div style={{ width: '28px', height: '1px', background: 'var(--border-color)' }} />}
                            <div
                                className={`step-item ${currentStep === step ? 'active' : ''}`}
                                onClick={() => currentStep >= step ? setCurrentStep(step) : null}
                                style={{
                                    cursor: currentStep >= step ? 'pointer' : 'default',
                                    padding: '0.35rem 0.9rem',
                                    fontSize: '0.88rem',
                                    ...(step === 3 && currentStep === 3 ? {
                                        background: 'rgba(129,140,248,0.15)',
                                        boxShadow: 'inset 0 0 0 1px rgba(129,140,248,0.25)',
                                    } : {})
                                }}
                            >
                                <div className="step-number" style={{
                                    width: '24px', height: '24px', fontSize: '0.75rem',
                                    ...(step === 2 && step <= currentStep ? { background: 'linear-gradient(135deg,#818cf8,#a78bfa)' } : {})
                                }}>
                                    {Icon ? <Icon size={12} /> : step}
                                </div>
                                {label}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Action Buttons - Compact */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                    <button className="btn-new" onClick={onReset} style={{ fontSize: '0.85rem', padding: '0.5rem 1.25rem' }}>
                        <RefreshCcw size={14} /> New Analysis
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="dashboard-section" style={{ padding: '2rem', minHeight: '60vh' }}>
                {currentStep === 1 && (
                    <CreditSummary
                        data={data}
                        riskLevel={data.risk_level}
                        getRiskClass={getRiskClass}
                        onNext={() => setCurrentStep(2)}
                    />
                )}
                {currentStep === 2 && (
                    <DeepAnalysis data={data} />
                )}
            </div>

            {/* Footer Actions */}
            <div className="dashboard-footer">
                <p style={{ marginRight: 'auto', fontSize: '0.8rem', color: 'var(--text-dim)', fontWeight: '500' }}>
                    Export your detailed analysis for offline review
                </p>
                <button className="btn-secondary" onClick={handleExportPDF} style={{ padding: '0.6rem 1.25rem', fontSize: '0.88rem' }}>
                    <Download size={16} /> Export as PDF
                </button>
                <button className="btn-secondary" onClick={handleExportExcel} style={{ padding: '0.6rem 1.25rem', fontSize: '0.88rem' }}>
                    <FileSpreadsheet size={16} /> Export as Excel
                </button>
            </div>

            {/* AI Chat Assistant */}
            <AIChat extractedText={extractedText} />
        </div>
    )
}
