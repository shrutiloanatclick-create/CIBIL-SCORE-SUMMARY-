import { useState, useEffect } from 'react'
import { ShieldCheck } from 'lucide-react'
import FileUpload from './components/FileUpload'
import Dashboard from './components/Dashboard'
import logo from './assets/logo.jpg'

function App() {
    const [reportData, setReportData] = useState(null)
    const [extractedText, setExtractedText] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState(null)
    const [isDark, setIsDark] = useState(true)

    useEffect(() => {
        const root = document.documentElement;
        if (isDark) {
            root.classList.add('theme-dark');
            root.classList.remove('theme-light');
            document.body.style.backgroundColor = '#020617';
        } else {
            root.classList.add('theme-light');
            root.classList.remove('theme-dark');
            document.body.style.backgroundColor = '#f1f5f9';
        }
    }, [isDark]);

    const handleUploadSuccess = (data) => {
        console.log("DEBUG: App received report data:", data);
        if (!data || typeof data !== 'object') {
            console.error("CRITICAL: Received invalid data structure:", data);
            setError("The server returned an invalid report format. Please try again.");
            return;
        }
        setReportData(data)
        setExtractedText(data.extracted_text || '')
        console.log("DEBUG: reportData state updated successfully.");
    }

    const handleReset = () => {
        setReportData(null)
        setExtractedText('')
        setError(null)
    }

    return (
        <div className={`app-container ${isDark ? 'theme-dark' : 'theme-light'}`}>
            <header className="header">
                <div className="nav-container">
                    <div className="nav-left">
                        <div className="logo-main-container">
                            <img 
                                src={logo} 
                                alt="Loan At Click Analyst" 
                                className="logo-catchy"
                            />
                        </div>
                    </div>
                    
                    <div className="nav-right">
                        <button
                            onClick={() => setIsDark(!isDark)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.55rem 1.2rem',
                                borderRadius: '100px',
                                border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(15,23,42,0.1)',
                                background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.8)',
                                color: isDark ? '#f8fafc' : '#0f172a',
                                cursor: 'pointer',
                                fontSize: '0.85rem',
                                fontWeight: '700',
                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                boxShadow: isDark ? 'none' : '0 4px 12px rgba(15,23,42,0.08)'
                            }}
                        >
                            <span style={{ fontSize: '1rem' }}>{isDark ? '☀️' : '🌙'}</span>
                            {isDark ? 'Light' : 'Dark Mode'}
                        </button>
                    </div>
                </div>
            </header>

            <main>
                {error && (
                    <div className="glass-panel" style={{ borderColor: 'var(--danger-color)', marginBottom: '1.5rem', textAlign: 'center', padding: '1.25rem 2rem' }}>
                        <p style={{ color: 'var(--danger-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                            <ShieldCheck size={18} />
                            {error}
                        </p>
                        <button className="btn-secondary" style={{ marginTop: '0.75rem' }} onClick={() => setError(null)}>Dismiss</button>
                    </div>
                )}

                {!reportData ? (
                    <FileUpload
                        onSuccess={handleUploadSuccess}
                        isLoading={isLoading}
                        setIsLoading={setIsLoading}
                        setError={setError}
                    />
                ) : (
                    <Dashboard data={reportData} extractedText={extractedText} onReset={handleReset} />
                )}
            </main>
        </div>
    )
}

export default App
