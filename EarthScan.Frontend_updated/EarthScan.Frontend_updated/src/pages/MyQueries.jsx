import React, { useState, useEffect, useContext, useRef, useCallback } from 'react';
import { Container, Row, Col, Card, Form, Button, Spinner } from 'react-bootstrap';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { API_BASE_URL } from '../config';

export default function MyQueries() {
    const { user } = useContext(AuthContext);
    const [queries, setQueries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedQueryId, setSelectedQueryId] = useState(null);
    const [chatInputText, setChatInputText] = useState('');
    
    // File upload states
    const [attachingFile, setAttachingFile] = useState(false);
    const [attachedFileUrl, setAttachedFileUrl] = useState('');
    const [attachedFileName, setAttachedFileName] = useState('');

    const chatEndRef = useRef(null);
    const fileInputRef = useRef(null);
    const email = user?.email || user?.Email || '';
    const myName = user?.name || user?.Name || 'Farmer';

    // Fetch agricultural queries
    const fetchQueries = useCallback(async () => {
        if (!email) return;
        try {
            const res = await axios.get(`${API_BASE_URL}/api/supportqueries/byemail?email=${encodeURIComponent(email)}`);
            const allQueries = res.data;
            setQueries(allQueries);

            // Find or auto-create the single "Agriculture Expert Chat" thread
            let thread = allQueries.find(q => q.title === 'Agriculture Expert Chat');
            if (!thread && loading) {
                const initialMessages = [{
                    sender: 'expert',
                    text: 'Namaskar! 🙏 Welcome to Krishi Vidya Expert Support. How can we help you today with your crops, soil, pest control, or weather forecasts?',
                    time: new Date().toISOString()
                }];
                const createRes = await axios.post(`${API_BASE_URL}/api/supportqueries`, {
                    name: myName,
                    email: email,
                    title: 'Agriculture Expert Chat',
                    message: JSON.stringify(initialMessages)
                });
                thread = createRes.data.query;
                setQueries([thread]);
            }
            if (thread && !selectedQueryId) {
                setSelectedQueryId(thread.id);
            }
        } catch (err) {
            console.error('Failed to load queries:', err);
        } finally {
            setLoading(false);
        }
    }, [email, selectedQueryId, loading, myName]);

    // Initial load
    useEffect(() => {
        if (email) {
            fetchQueries();
        }
    }, [email, fetchQueries]);

    // Auto-poll support queries every 3 seconds while active
    useEffect(() => {
        if (!email) return;
        const interval = setInterval(fetchQueries, 3000);
        return () => clearInterval(interval);
    }, [email, fetchQueries]);

    // Scroll chat window to bottom when messages list changes
    useEffect(() => {
        if (chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [selectedQueryId, queries]);

    const selectedQuery = queries.find(q => q.id === selectedQueryId);

    // Parse description JSON array of messages, fallback to legacy text
    const getQueryMessages = (q) => {
        if (!q) return [];
        try {
            if (q.description.trim().startsWith('[')) {
                return JSON.parse(q.description);
            }
        } catch (e) {
            console.error("JSON parse failed, falling back to legacy format", e);
        }
        
        // Legacy plain text format fallback
        const msgs = [{ sender: 'farmer', text: q.description, time: q.createdAt }];
        if (q.answer) {
            msgs.push({ sender: 'expert', text: q.answer, time: q.createdAt });
        }
        return msgs;
    };

    // Handle file attachment upload
    const handleFileAttach = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setAttachingFile(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await axios.post(`${API_BASE_URL}/api/buyersellermessages/upload`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });
            setAttachedFileUrl(res.data.url);
            setAttachedFileName(file.name);
        } catch (err) {
            console.error('File upload failed:', err);
            alert('Failed to upload file. Please try again.');
        } finally {
            setAttachingFile(false);
        }
    };

    // Send chat message (appends to description JSON array in the same thread!)
    const handleSendChatMessage = async (e) => {
        e.preventDefault();
        if (!chatInputText.trim() && !attachedFileUrl) return;
        if (!selectedQuery) return;

        const currentMessages = getQueryMessages(selectedQuery);
        const newMsgObj = {
            sender: 'farmer',
            text: chatInputText,
            time: new Date().toISOString()
        };

        if (attachedFileUrl) {
            newMsgObj.attachmentUrl = attachedFileUrl;
            newMsgObj.attachmentName = attachedFileName;
        }

        const updatedMessages = [...currentMessages, newMsgObj];

        try {
            const res = await axios.put(`${API_BASE_URL}/api/supportqueries/${selectedQuery.id}/description`, {
                description: JSON.stringify(updatedMessages),
                status: 'Pending' // reset to pending so expert knows there is a follow-up
            });

            // Update queries list state
            setQueries(prev => prev.map(q => q.id === selectedQuery.id ? res.data.query : q));
            setChatInputText('');
            setAttachedFileUrl('');
            setAttachedFileName('');
        } catch (err) {
            console.error('Failed to send message:', err);
            alert('Failed to send message. Please try again.');
        }
    };

    if (loading && queries.length === 0) {
        return (
            <Container className="d-flex justify-content-center align-items-center" style={{ minHeight: '80vh' }}>
                <Spinner animation="border" variant="success" />
            </Container>
        );
    }

    return (
        <Container fluid className="py-4" style={{ height: 'calc(100vh - 120px)', minHeight: '550px' }}>
            <Card className="h-100 bg-dark border-secondary text-white shadow-lg overflow-hidden" style={{ background: 'linear-gradient(135deg, #111a2e 0%, #0a0f18 100%)' }}>
                <Row className="g-0 h-100">
                    {/* Left Sidebar (Single Agriculture Expert Contact Card) */}
                    <Col md={4} className="border-end border-secondary h-100 d-flex flex-column" style={{ background: 'rgba(0, 0, 0, 0.2)' }}>
                        <div className="p-3 border-bottom border-secondary">
                            <h5 className="fw-bold mb-0 d-flex align-items-center gap-2">
                                <i className="bi bi-chat-left-text-fill text-success"></i> Support Chat
                            </h5>
                        </div>

                        <div className="flex-grow-1 overflow-auto">
                            {selectedQuery ? (
                                <div
                                    onClick={() => setSelectedQueryId(selectedQuery.id)}
                                    className={`p-3 border-bottom border-secondary-subtle d-flex align-items-start gap-3 cursor-pointer transition-all bg-secondary bg-opacity-25 border-start border-4 border-success`}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <div className="rounded-circle bg-success bg-opacity-25 p-2 text-center text-success fw-bold d-flex align-items-center justify-content-center animate-pulse" style={{ width: '40px', height: '40px', minWidth: '40px' }}>
                                        <i className="bi bi-patch-question-fill"></i>
                                    </div>
                                    <div className="flex-grow-1 overflow-hidden">
                                        <div className="d-flex justify-content-between align-items-center mb-1">
                                            <span className="fw-bold text-white small">Agriculture Expert</span>
                                            <span className="text-secondary animate-pulse" style={{ fontSize: '0.7rem' }}>
                                                Online 🟢
                                            </span>
                                        </div>
                                        <div className="d-flex justify-content-between align-items-center">
                                            <span className="text-secondary small text-truncate" style={{ maxWidth: '85%' }}>
                                                {getQueryMessages(selectedQuery).slice(-1)[0]?.text || 'Crop & fertilizer advice'}
                                            </span>
                                            <span className={`badge px-2 py-0.5 rounded-pill ${selectedQuery.status === 'Answered' ? 'bg-success text-white' : 'bg-warning text-dark'}`} style={{ fontSize: '0.65rem' }}>
                                                {selectedQuery.status === 'Answered' ? 'Answered' : 'Pending'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-secondary text-center my-4 small">No support thread found.</p>
                            )}
                        </div>
                    </Col>

                    {/* Right Pane (Chat Feed) */}
                    <Col md={8} className="h-100 d-flex flex-column">
                        {selectedQuery ? (
                            <>
                                {/* Conversation Header */}
                                <div className="p-3 border-bottom border-secondary bg-black bg-opacity-20 d-flex justify-content-between align-items-center">
                                    <div>
                                        <h6 className="fw-bold mb-0">Krishi Vidya Expert Support</h6>
                                        <small className="text-success fw-semibold"><i className="bi bi-mortarboard-fill me-1"></i> Agricultural Advisor Panel</small>
                                    </div>
                                    <span className={`badge px-3 py-1.5 rounded-pill ${selectedQuery.status === 'Answered' ? 'bg-success' : 'bg-warning text-dark'}`}>
                                        {selectedQuery.status === 'Answered' ? '✓ Expert Answered' : '⏳ Awaiting Expert Reply'}
                                    </span>
                                </div>

                                {/* Messages Area */}
                                <div className="flex-grow-1 overflow-auto p-3 d-flex flex-column gap-3" style={{ background: 'rgba(0, 0, 0, 0.15)' }}>
                                    {getQueryMessages(selectedQuery).map((m, index) => {
                                        const isFarmer = m.sender === 'farmer';
                                        const isImage = m.attachmentUrl && /\.(jpg|jpeg|png|webp|gif)$/i.test(m.attachmentUrl);

                                        return (
                                            <div key={index} className={`d-flex ${isFarmer ? 'justify-content-end' : 'justify-content-start'}`}>
                                                <div
                                                    className="p-3 rounded-3 text-white shadow-sm"
                                                    style={{
                                                        background: isFarmer ? '#005c4b' : '#202c33',
                                                        maxWidth: '75%',
                                                        borderTopLeftRadius: isFarmer ? '12px' : '0',
                                                        borderTopRightRadius: isFarmer ? '0' : '12px',
                                                        borderBottomLeftRadius: '12px',
                                                        borderBottomRightRadius: '12px'
                                                    }}
                                                >
                                                    {m.attachmentUrl && (
                                                        <div className="mb-2 p-2 bg-dark bg-opacity-50 rounded border border-secondary d-flex align-items-center gap-2">
                                                            <i className={`bi ${isImage ? 'bi-image' : 'bi-file-earmark-pdf'} text-warning fs-5`}></i>
                                                            <div className="overflow-hidden">
                                                                {isImage ? (
                                                                    <a href={`${API_BASE_URL}${m.attachmentUrl}`} target="_blank" rel="noopener noreferrer">
                                                                        <img src={`${API_BASE_URL}${m.attachmentUrl}`} alt={m.attachmentName} style={{ maxWidth: '180px', maxHeight: '120px', borderRadius: '4px' }} className="d-block mb-1 border border-secondary" />
                                                                    </a>
                                                                ) : null}
                                                                <a href={`${API_BASE_URL}${m.attachmentUrl}`} target="_blank" rel="noopener noreferrer" className="text-info text-decoration-none small text-truncate d-block" style={{ maxWidth: '200px' }}>
                                                                    {m.attachmentName || 'View Attachment'}
                                                                </a>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {m.text && <p className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>{m.text}</p>}
                                                    <small className="text-secondary d-block text-end mt-1" style={{ fontSize: '0.65rem', opacity: 0.8 }}>
                                                        {m.sender === 'farmer' ? 'You' : 'Agriculture Expert'} • {m.time ? new Date(m.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                                    </small>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    <div ref={chatEndRef} />
                                </div>

                                {/* Send Input Box with Attachment Button */}
                                <div className="p-3 bg-black bg-opacity-30 border-top border-secondary">
                                    {/* Attachment Preview Box */}
                                    {attachedFileUrl && (
                                        <div className="mb-2 p-2 rounded bg-secondary bg-opacity-25 d-flex align-items-center justify-content-between border border-secondary">
                                            <span className="small text-truncate text-info"><i className="bi bi-file-earmark-arrow-up"></i> Ready to send: {attachedFileName}</span>
                                            <Button size="sm" variant="link" className="text-danger p-0 border-0" onClick={() => { setAttachedFileUrl(''); setAttachedFileName(''); }}>
                                                <i className="bi bi-trash"></i>
                                            </Button>
                                        </div>
                                    )}

                                    <Form onSubmit={handleSendChatMessage} className="d-flex gap-2 align-items-center">
                                        <Button 
                                            variant="outline-secondary" 
                                            className="rounded-circle d-flex align-items-center justify-content-center p-0" 
                                            style={{ width: '40px', height: '40px', minWidth: '40px' }}
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={attachingFile}
                                        >
                                            {attachingFile ? <Spinner animation="border" size="sm" /> : <i className="bi bi-paperclip fs-5 text-light"></i>}
                                        </Button>
                                        
                                        <input 
                                            type="file" 
                                            ref={fileInputRef} 
                                            style={{ display: 'none' }} 
                                            onChange={handleFileAttach}
                                        />

                                        <Form.Control
                                            type="text"
                                            placeholder="Type your message here..."
                                            value={chatInputText}
                                            onChange={(e) => setChatInputText(e.target.value)}
                                            className="bg-transparent text-white border-secondary shadow-none rounded-pill px-3"
                                        />
                                        <Button type="submit" variant="success" className="px-4 rounded-pill">
                                            Send <i className="bi bi-send-fill ms-1"></i>
                                        </Button>
                                    </Form>
                                </div>
                            </>
                        ) : (
                            <div className="h-100 d-flex flex-column align-items-center justify-content-center text-center p-5">
                                <div className="rounded-circle bg-dark p-4 mb-4 border border-secondary" style={{ width: '100px', height: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <i className="bi bi-patch-question text-success fs-1 animate-pulse"></i>
                                </div>
                                <h4 className="fw-bold text-white">Krishi Vidya Expert Support</h4>
                                <p className="text-secondary small max-w-350">
                                    Loading your chat conversation with our agriculture expert...
                                </p>
                            </div>
                        )}
                    </Col>
                </Row>
            </Card>
        </Container>
    );
}
