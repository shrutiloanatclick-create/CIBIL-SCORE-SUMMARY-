import React, { useState, useEffect, useRef } from 'react'
import { MessageSquare, Send, X, Bot, User, Loader2, Maximize2, Minimize2, Sparkles } from 'lucide-react'
import axios from 'axios'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export default function AIChat({ extractedText }) {
    console.log("DEBUG: AIChat mounting with extractedText length:", extractedText?.length || 0);
    const [isOpen, setIsOpen] = useState(false)
    const [messages, setMessages] = useState([
        { role: 'bot', content: 'Underwriting Assistant ready. I can analyze the customer\'s credit history, identify risks, and summarize liabilities. What would you like to investigate?' }
    ])
    const [input, setInput] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [isExpanded, setIsExpanded] = useState(false)
    const messagesEndRef = useRef(null)

    const SUGGESTIONS = [
        "Summarize customer's debt load",
        "Explain risk factors & late payments",
        "Total outstanding of all accounts",
        "Underwriting recommendation hint"
    ]

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    useEffect(() => {
        scrollToBottom()
    }, [messages])

    const handleSend = async () => {
        if (!input.trim() || isLoading) return

        const userMsg = { role: 'user', content: input }
        setMessages(prev => [...prev, userMsg])
        setInput('')
        setIsLoading(true)

        try {
            const response = await axios.post('http://127.0.0.1:8000/api/chat', {
                extracted_text: extractedText,
                question: input
            })
            
            const botMsg = { role: 'bot', content: response.data.answer }
            setMessages(prev => [...prev, botMsg])
        } catch (err) {
            setMessages(prev => [...prev, { 
                role: 'bot', 
                content: 'Sorry, I had trouble connecting to the brain. Please try again!' 
            }])
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <>
            {/* Floating Toggle Button */}
            {!isOpen && (
                <button
                    onClick={() => setIsOpen(true)}
                    style={{
                        position: 'fixed',
                        bottom: '5rem',
                        right: '2rem',
                        width: '64px',
                        height: '64px',
                        borderRadius: '1rem',
                        background: 'var(--accent-gradient)',
                        color: 'white',
                        border: 'none',
                        boxShadow: '0 10px 30px var(--accent-glow)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1000,
                        transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
                    }}
                    onMouseEnter={e => e.target.style.transform = 'scale(1.1) translateY(-5px)'}
                    onMouseLeave={e => e.target.style.transform = 'scale(1) translateY(0)'}
                >
                    <MessageSquare size={28} />
                </button>
            )}

            {/* Chat Window */}
            {isOpen && (
                <div 
                    className="glass-panel"
                    style={{
                        position: 'fixed',
                        bottom: isExpanded ? '3rem' : '5rem',
                        right: isExpanded ? '3rem' : '2rem',
                        width: isExpanded ? 'min(1100px, calc(100vw - 6rem))' : 'min(400px, calc(100vw - 4rem))',
                        height: isExpanded ? 'min(850px, calc(100vh - 8rem))' : 'min(600px, calc(100vh - 10rem))',
                        zIndex: 1001,
                        display: 'flex',
                        flexDirection: 'column',
                        padding: '0',
                        overflow: 'hidden',
                        borderRadius: '1.25rem',
                        animation: 'premiumFadeIn 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
                        transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 40px var(--accent-glow)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        backdropFilter: 'blur(20px) saturate(180%)'
                    }}
                >
                    {/* Header */}
                    <div style={{
                        padding: isExpanded ? '1rem 1.5rem' : '1.5rem',
                        background: 'var(--accent-gradient)',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                            <Bot size={24} />
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800' }}>Report Assistant</h3>
                                <p style={{ margin: 0, fontSize: '0.75rem', opacity: 0.8 }}>Powered by Loan At Click AI</p>
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <button 
                                onClick={() => setIsExpanded(!isExpanded)}
                                style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: '0.4rem', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                title={isExpanded ? "Collapse" : "Expand"}
                            >
                                {isExpanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                            </button>
                            <button 
                                onClick={() => setIsOpen(false)}
                                style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: '0.4rem', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                                <X size={20} />
                            </button>
                        </div>
                    </div>

                    {/* Messages Area */}
                    <div 
                        className="chat-window-content"
                        style={{
                            flex: 1,
                            overflowY: 'auto',
                            padding: '1.5rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '1rem'
                        }}
                    >
                        <div style={{ marginBottom: '0.5rem' }}>
                            <p style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: '700', textTransform: 'uppercase', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                <Sparkles size={10} color="var(--accent-color)" /> Suggestions
                            </p>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                {SUGGESTIONS.map((s, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setInput(s)}
                                        style={{
                                            padding: '0.4rem 0.8rem',
                                            borderRadius: '2rem',
                                            background: 'var(--nav-bg)',
                                            border: '1px solid var(--border-color)',
                                            color: 'var(--text-main)',
                                            fontSize: '0.75rem',
                                            cursor: 'pointer',
                                            whiteSpace: 'nowrap',
                                            transition: 'all 0.2s'
                                        }}
                                        onMouseEnter={e => e.target.style.borderColor = 'var(--accent-color)'}
                                        onMouseLeave={e => e.target.style.borderColor = 'var(--border-color)'}
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {messages.map((msg, idx) => (
                            <div 
                                key={idx}
                                style={{
                                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                                    maxWidth: '85%',
                                    display: 'flex',
                                    gap: '0.6rem',
                                    flexDirection: msg.role === 'user' ? 'row-reverse' : 'row'
                                }}
                            >
                                <div style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '0.75rem',
                                    background: msg.role === 'user' ? 'var(--accent-glow)' : 'var(--accent-color)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0
                                }}>
                                    {msg.role === 'user' ? <User size={16} color="var(--accent-color)" /> : <Bot size={16} color="white" />}
                                </div>
                                <div className="chat-markdown-content" style={{
                                    padding: '0.9rem 1.25rem',
                                    borderRadius: '0.85rem',
                                    background: msg.role === 'user' ? 'var(--accent-gradient)' : 'rgba(255, 255, 255, 0.03)',
                                    color: 'white',
                                    fontSize: '0.92rem',
                                    lineHeight: '1.6',
                                    border: msg.role === 'user' ? 'none' : '1px solid var(--glass-border)',
                                    boxShadow: msg.role === 'user' ? '0 4px 15px rgba(38, 128, 235, 0.2)' : 'none',
                                    overflowX: 'auto',
                                    position: 'relative'
                                }}>
                                    {msg.role === 'user' ? (
                                        msg.content
                                    ) : (
                                        <ReactMarkdown 
                                            remarkPlugins={[remarkGfm]}
                                            components={{
                                                table: ({node, ...props}) => (
                                                    <div style={{ overflowX: 'auto', margin: '0.5rem 0' }}>
                                                        <table style={{ 
                                                            width: '100%', 
                                                            borderCollapse: 'collapse',
                                                            background: 'var(--panel-sub-bg)',
                                                            borderRadius: '0.5rem',
                                                            overflow: 'hidden',
                                                            border: '1px solid var(--border-color)'
                                                        }} {...props} />
                                                    </div>
                                                ),
                                                th: ({node, ...props}) => (
                                                    <th style={{ 
                                                        background: 'rgba(59, 130, 246, 0.1)', 
                                                        color: 'var(--accent-color)',
                                                        textAlign: 'left',
                                                        padding: '0.5rem',
                                                        fontSize: '0.8rem',
                                                        textTransform: 'uppercase',
                                                        borderBottom: '1px solid var(--border-color)'
                                                    }} {...props} />
                                                ),
                                                td: ({node, ...props}) => (
                                                    <td style={{ 
                                                        padding: '0.5rem',
                                                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                                                        color: 'var(--text-muted)'
                                                    }} {...props} />
                                                ),
                                                strong: ({node, ...props}) => (
                                                    <strong style={{ color: 'var(--accent-color)', fontWeight: '700' }} {...props} />
                                                )
                                            }}
                                        >
                                            {msg.content}
                                        </ReactMarkdown>
                                    )}
                                </div>
                            </div>
                        ))}
                        {isLoading && (
                            <div style={{ alignSelf: 'flex-start', display: 'flex', gap: '0.6rem' }}>
                                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(255, 255, 255, 0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Bot size={16} color="white" />
                                </div>
                                <div style={{ padding: '0.8rem 1.2rem', borderRadius: '0.2rem 1.2rem 1.2rem 1.2rem', background: 'var(--nav-bg)', border: '1px solid var(--border-color)' }}>
                                    <Loader2 className="spinner" size={20} color="var(--accent-color)" />
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input Area */}
                    <div style={{
                        padding: '1.25rem',
                        background: 'rgba(2, 6, 23, 0.4)',
                        borderTop: '1px solid var(--border-color)',
                        display: 'flex',
                        gap: '0.8rem',
                        alignItems: 'center'
                    }}>
                        <input
                            type="text"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyPress={e => e.key === 'Enter' && handleSend()}
                            placeholder="Ask me something..."
                            style={{
                                flex: 1,
                                background: 'var(--nav-bg)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '0.8rem',
                                padding: '0.8rem 1rem',
                                color: 'var(--text-main)',
                                outline: 'none'
                            }}
                        />
                        <button
                            onClick={handleSend}
                            disabled={!input.trim() || isLoading}
                            style={{
                                width: '45px',
                                height: '45px',
                                borderRadius: '0.8rem',
                                background: 'var(--accent-color)',
                                border: 'none',
                                color: 'white',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.2s'
                            }}
                        >
                            <Send size={18} />
                        </button>
                    </div>
                </div>
            )}
        </>
    )
}
