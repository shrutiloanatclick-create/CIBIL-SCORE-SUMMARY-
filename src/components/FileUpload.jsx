import { useState, useRef, useEffect } from 'react'
import { UploadCloud, FileText, Loader2, ShieldCheck } from 'lucide-react'
import axios from 'axios'

const getBackendUrl = () => {
    const hostname = window.location.hostname;
    const port = '8000';
    return `http://${hostname}:${port}`;
};

const API_URL = `${getBackendUrl()}/api/upload`;

export default function FileUpload({ onSuccess, isLoading, setIsLoading, setError }) {
    const [dragActive, setDragActive] = useState(false)
    const [file, setFile] = useState(null)
    const [serverStatus, setServerStatus] = useState('checking')
    const inputRef = useRef(null)

    const checkServer = async () => {
        try {
            await axios.get(getBackendUrl() + '/')
            setServerStatus('online')
        } catch (err) {
            setServerStatus('offline')
        }
    }

    useEffect(() => {
        checkServer()
        const interval = setInterval(checkServer, 5000)
        return () => clearInterval(interval)
    }, [])

    const handleDrag = (e) => {
        e.preventDefault()
        e.stopPropagation()
        setDragActive(e.type === 'dragenter' || e.type === 'dragover')
    }

    const handleDrop = (e) => {
        e.preventDefault()
        e.stopPropagation()
        setDragActive(false)
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileSelected(e.dataTransfer.files[0])
        }
    }

    const handleChange = (e) => {
        e.preventDefault()
        if (e.target.files && e.target.files[0]) {
            handleFileSelected(e.target.files[0])
        }
    }

    const handleFileSelected = (selectedFile) => {
        setError(null)
        if (selectedFile.type !== 'application/pdf') {
            setError('Please upload a valid PDF file.')
            return
        }
        setFile(selectedFile)
    }

    const onUpload = async () => {
        if (!file) return
        setIsLoading(true)
        setError(null)

        const formData = new FormData()
        formData.append('file', file)

        try {
            console.log("DEBUG: Starting upload to", API_URL);
            const response = await axios.post(API_URL, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                timeout: 120000, // 2 minutes for large AI analysis
            })
            console.log("DEBUG: Upload success! Data:", response.data);
            if (!response.data || typeof response.data !== 'object') {
                throw new Error("Invalid data received from server");
            }
            onSuccess(response.data)
        } catch (err) {
            console.error("DEBUG: Upload error full object:", err);
            if (err.response) {
                console.error("DEBUG: Error response data:", err.response.data);
                console.error("DEBUG: Error response status:", err.response.status);
            } else if (err.request) {
                console.error("DEBUG: No response received. Request:", err.request);
            } else {
                console.error("DEBUG: Error setting up request:", err.message);
            }
            const msg = err.code === 'ECONNABORTED'
                ? 'Analysis is taking longer than expected. Please try again or check your internet.'
                : (err.response?.data?.detail || `Analysis failed. Make sure the backend is running at ${getBackendUrl()}`);
            setError(msg)
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="glass-panel fade-in glow-card" style={{ maxWidth: '700px', margin: '0 auto', textAlign: 'center', padding: '1.5rem 2rem' }}>
            <div style={{ marginBottom: '1.5rem' }}>
                <div style={{
                    display: 'inline-flex',
                    padding: '0.75rem',
                    background: 'rgba(79, 70, 229, 0.1)',
                    borderRadius: '1.5rem',
                    marginBottom: '1rem',
                    border: '1px solid rgba(79, 70, 229, 0.2)',
                    boxShadow: '0 0 20px rgba(79, 70, 229, 0.1)'
                }}>
                    <ShieldCheck size={32} className="text-gradient" style={{ color: 'var(--accent-color)' }} />
                </div>
                <h2 style={{ fontSize: '1.8rem', fontWeight: '900', marginBottom: '0.5rem', letterSpacing: '-0.02em' }} className="text-gradient">
                    Professional Portfolio Analysis
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '1rem', fontWeight: '500', maxWidth: '400px', margin: '0 auto' }}>
                    Upload Customer CIBIL PDF for deep-dive underwriting analysis.
                </p>

                {/* Status Indicator */}
                <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'center' }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.35rem 0.8rem',
                        background: serverStatus === 'online' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                        borderRadius: '100px',
                        border: `1px solid ${serverStatus === 'online' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        color: serverStatus === 'online' ? '#10b981' : '#f87171'
                    }}>
                        <div style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: serverStatus === 'online' ? '#10b981' : '#ef4444',
                            boxShadow: `0 0 8px ${serverStatus === 'online' ? '#10b981' : '#ef4444'}`,
                            animation: serverStatus === 'online' ? 'pulse 2s infinite' : 'none'
                        }}></div>
                        {serverStatus === 'online' ? 'SYSTEM READY' : 'RECONNECTING...'}
                    </div>
                </div>
            </div>

            <div
                className={`upload-area ${dragActive ? 'drag-active' : ''}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => inputRef.current.click()}
                style={{ marginBottom: '1.5rem', padding: '2rem' }}
            >
                <input
                    ref={inputRef}
                    type="file"
                    accept=".pdf"
                    onChange={handleChange}
                    style={{ display: 'none' }}
                />

                <div style={{ position: 'relative', zIndex: 1 }}>
                    {file ? (
                        <div className="fade-in">
                            <div style={{
                                background: 'rgba(255, 255, 255, 0.03)',
                                padding: '1rem',
                                borderRadius: '1rem',
                                display: 'inline-block',
                                border: '1px solid rgba(255, 255, 255, 0.05)',
                                marginBottom: '1rem'
                            }}>
                                <FileText size={32} color="var(--accent-color)" />
                            </div>
                            <p style={{ fontWeight: '800', fontSize: '1.1rem', color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                                {file.name}
                            </p>
                            <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                                {(file.size / 1024 / 1024).toFixed(2)} MB
                            </p>
                        </div>
                    ) : (
                        <div>
                            <UploadCloud size={40} className="upload-icon" style={{ marginBottom: '0.75rem' }} />
                            <p style={{ fontSize: '1.2rem', fontWeight: '800', marginBottom: '0.25rem', color: 'var(--text-main)' }}>
                                Drag & Drop Report
                            </p>
                            <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>
                                or click to browse
                            </p>
                        </div>
                    )}
                </div>
            </div>

            <button
                className="btn-primary"
                onClick={onUpload}
                disabled={!file || isLoading}
                style={{ width: '100%', justifyContent: 'center', height: '3.2rem', fontSize: '1.05rem' }}
            >
                {isLoading ? (
                    <>
                        <Loader2 className="spinner" size={20} />
                        Analyzing Report...
                    </>
                ) : (
                    'Generate Insights'
                )}
            </button>

            <div style={{
                marginTop: '1.5rem',
                padding: '0.75rem',
                background: 'rgba(255, 255, 255, 0.02)',
                borderRadius: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                border: '1px solid rgba(255, 255, 255, 0.04)'
            }}>
                <ShieldCheck size={16} color="#10b981" />
                <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontWeight: '500', margin: 0 }}>
                    <span style={{ color: 'var(--text-main)', fontWeight: '700' }}>Privacy:</span> Encrypted processing, no data storage.
                </p>
            </div>
        </div>
    )
}
