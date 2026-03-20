import React, { useEffect, useState } from 'react';

const ScoreGauge = ({ score }) => {
    const [offset, setOffset] = useState(0);
    const min = 300;
    const max = 900;
    
    // Calculate percentage (0 to 1)
    const normalizedScore = Math.max(min, Math.min(max, score));
    const percentage = (normalizedScore - min) / (max - min);
    
    // SVG params for a semi-circle gauge
    const radius = 80;
    const strokeWidth = 14;
    const center = 100;
    const circumference = Math.PI * radius; // Full arc length for semi-circle
    
    useEffect(() => {
        // Simple animation delay for visual satisfaction
        const timer = setTimeout(() => {
            setOffset(circumference * (1 - percentage));
        }, 100);
        return () => clearTimeout(timer);
    }, [percentage, circumference]);

    const getScoreColor = (val) => {
        if (val < 550) return '#ef4444'; // Red
        if (val < 650) return '#f59e0b'; // Amber
        if (val < 750) return '#fbbf24'; // Yellow
        if (val < 800) return '#a7f3d0'; // Light Green
        return '#10b981'; // Green
    };

    const getScoreLabel = (val) => {
        if (val < 550) return 'POOR';
        if (val < 650) return 'FAIR';
        if (val < 750) return 'GOOD';
        if (val < 800) return 'VERY GOOD';
        return 'EXCELLENT';
    };

    const currentColor = getScoreColor(normalizedScore);

    return (
        <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            width: '100%', 
            padding: '1.25rem 0',
            position: 'relative'
        }}>
            {/* Header Text */}
            <div style={{ 
                fontSize: '0.8rem', 
                fontWeight: '800', 
                color: 'var(--text-dim)', 
                textTransform: 'uppercase', 
                letterSpacing: '0.15em',
                marginBottom: '1rem',
                opacity: 0.8
            }}>
                CIBIL Score
            </div>

            <div style={{ position: 'relative', height: '120px', width: '200px', display: 'flex', justifyContent: 'center' }}>
                <svg width="200" height="120" viewBox="0 0 200 120">
                    {/* Background Arc */}
                    <path
                        d={`M ${center - radius} ${center} A ${radius} ${radius} 0 0 1 ${center + radius} ${center}`}
                        fill="none"
                        stroke="rgba(255,255,255,0.05)"
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                    />
                    {/* Progress Arc */}
                    <path
                        d={`M ${center - radius} ${center} A ${radius} ${radius} 0 0 1 ${center + radius} ${center}`}
                        fill="none"
                        stroke={currentColor}
                        strokeWidth={strokeWidth}
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        strokeLinecap="round"
                        style={{ 
                            transition: 'stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.5s ease',
                            filter: `drop-shadow(0 0 12px ${currentColor}55)`
                        }}
                    />
                    
                    {/* Score Text */}
                    <text 
                        x="100" 
                        y="85" 
                        textAnchor="middle" 
                        style={{ 
                            fontSize: '2.8rem', 
                            fontWeight: '900', 
                            fill: 'var(--text-main)', 
                            letterSpacing: '-0.02em',
                            fontFamily: 'system-ui'
                        }}
                    >
                        {score}
                    </text>
                    
                    {/* Status Label */}
                    <text 
                        x="100" 
                        y="110" 
                        textAnchor="middle" 
                        style={{ 
                            fontSize: '0.85rem', 
                            fontWeight: '900', 
                            fill: currentColor, 
                            textTransform: 'uppercase', 
                            letterSpacing: '0.12em' 
                        }}
                    >
                        {getScoreLabel(score)}
                    </text>
                </svg>
            </div>

            {/* Range Slider Section */}
            <div style={{ width: '100%', maxWidth: '220px', marginTop: '1.5rem', padding: '0 1rem' }}>
                {/* Visual Track */}
                <div style={{
                    position: 'relative',
                    width: '100%',
                    height: '6px',
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: '3px',
                    marginBottom: '0.75rem',
                    overflow: 'visible'
                }}>
                    {/* Tick Markers */}
                    {[0, 250/600, 400/600, 1].map((pos, idx) => (
                        <div key={idx} style={{
                            position: 'absolute',
                            left: `${pos * 100}%`,
                            top: '-2px',
                            width: '2px',
                            height: '10px',
                            background: 'rgba(255,255,255,0.1)',
                            borderRadius: '1px',
                            zIndex: 1
                        }} />
                    ))}
                    
                    {/* Thumb/Indicator */}
                    <div style={{
                        position: 'absolute',
                        left: `${percentage * 100}%`,
                        top: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: '14px',
                        height: '14px',
                        borderRadius: '50%',
                        background: currentColor,
                        border: '3px solid var(--panel-bg)',
                        boxShadow: `0 0 15px ${currentColor}`,
                        transition: 'left 1.5s cubic-bezier(0.4, 0, 0.2, 1)',
                        zIndex: 2
                    }} />
                </div>

                {/* Range Labels */}
                <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    width: '100%',
                    padding: '0 2px'
                }}>
                    {['300', '550', '700', '900'].map(label => (
                        <span key={label} style={{ 
                            fontSize: '0.7rem', 
                            fontWeight: '800', 
                            color: 'var(--text-dim)',
                            opacity: 0.5,
                            letterSpacing: '0.05em'
                        }}>
                            {label}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default ScoreGauge;
