import React, { useState, useEffect, useContext, useRef, useCallback } from 'react';
import { Container, Row, Col, Card, Form, Button, Spinner } from 'react-bootstrap';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { API_BASE_URL } from '../config';

export default function LandMessages() {
    const { user } = useContext(AuthContext);
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedThreadKey, setSelectedThreadKey] = useState(null);
    const [chatInputText, setChatInputText] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [attachingFile, setAttachingFile] = useState(false);
    const [attachedFileUrl, setAttachedFileUrl] = useState('');
    const [attachedFileName, setAttachedFileName] = useState('');

    const chatEndRef = useRef(null);
    const fileInputRef = useRef(null);

    const email = user?.email || user?.Email || '';
    const myName = user?.name || user?.Name || 'User';

    // Fetch all user messages
    const fetchAllMessages = useCallback(async () => {
        if (!email) return;
        try {
            const res = await axios.get(`${API_BASE_URL}/api/buyersellermessages/byemail?email=${encodeURIComponent(email)}`);
            setMessages(res.data);
        } catch (err) {
            console.error('Failed to load messages:', err);
        } finally {
            setLoading(false);
        }
    }, [email]);

    // Initial load
    useEffect(() => {
        if (email) {
            fetchAllMessages();
        }
    }, [email, fetchAllMessages]);

    // Auto-poll messages every 3 seconds while active
    useEffect(() => {
        if (!email) return;
        const interval = setInterval(fetchAllMessages, 3000);
        return () => clearInterval(interval);
    }, [email, fetchAllMessages]);

    // Scroll chat window to bottom when selected thread or message list changes
    useEffect(() => {
        if (chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [selectedThreadKey, messages]);

    // Group messages into WhatsApp-style chat threads
    const threads = [];
    const seenThreads = new Set();

    messages.forEach(m => {
        const partnerEmail = m.senderEmail.toLowerCase() === email.toLowerCase()
            ? (m.buyerEmail.toLowerCase() === email.toLowerCase() ? m.sellerEmail : m.buyerEmail)
            : m.senderEmail;
        
        const threadKey = `${m.landId}_${partnerEmail.toLowerCase()}`;
        const isOutgoing = m.senderEmail.toLowerCase() === email.toLowerCase();

        if (!seenThreads.has(threadKey)) {
            seenThreads.add(threadKey);
            threads.push({
                key: threadKey,
                landId: m.landId,
                landTitle: m.landTitle,
                partnerEmail: partnerEmail,
                partnerName: partnerEmail.toLowerCase() === m.buyerEmail.toLowerCase() ? m.buyerName : m.sellerName,
                lastMessage: m.messageContent,
                sentAt: m.sentAt,
                isUnread: !isOutgoing,
                messages: [m]
            });
        } else {
            const existing = threads.find(t => t.key === threadKey);
            existing.messages.push(m);
            existing.messages.sort((a, b) => new Date(a.sentAt) - new Date(b.sentAt));
            const last = existing.messages[existing.messages.length - 1];
            existing.lastMessage = last.messageContent;
            existing.sentAt = last.sentAt;
            existing.isUnread = last.senderEmail.toLowerCase() !== email.toLowerCase();
        }
    });

    // Sort threads by latest message time
    threads.sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));

    const selectedThread = threads.find(t => t.key === selectedThreadKey);

    // Filter threads by search query
    const filteredThreads = threads.filter(t => 
        t.partnerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.landTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.lastMessage.toLowerCase().includes(searchQuery.toLowerCase())
    );

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

    // Send chat message
    const handleSendChatMessage = async (e) => {
        e.preventDefault();
        if (!chatInputText.trim() && !attachedFileUrl) return;
        if (!selectedThread) return;

        let finalMessage = chatInputText;
        if (attachedFileUrl) {
            const fileLink = `[Attachment: ${attachedFileName}](${API_BASE_URL}${attachedFileUrl})`;
            finalMessage = finalMessage.trim() ? `${finalMessage}\n\n${fileLink}` : fileLink;
        }

        const buyerEmail = email.toLowerCase() === selectedThread.partnerEmail.toLowerCase()
            ? email
            : selectedThread.partnerEmail;

        const sellerEmail = email.toLowerCase() === selectedThread.partnerEmail.toLowerCase()
            ? selectedThread.partnerEmail
            : email;

        const partnerIsBuyer = selectedThread.partnerEmail.toLowerCase() === selectedThread.messages[0].buyerEmail.toLowerCase();
        const buyerName = partnerIsBuyer ? selectedThread.partnerName : myName;
        const sellerName = partnerIsBuyer ? myName : selectedThread.partnerName;

        try {
            const res = await axios.post(`${API_BASE_URL}/api/buyersellermessages`, {
                landId: selectedThread.landId,
                landTitle: selectedThread.landTitle,
                buyerEmail: buyerEmail,
                buyerName: buyerName,
                sellerEmail: sellerEmail,
                sellerName: sellerName,
                messageContent: finalMessage,
                senderEmail: email
            });

            setMessages(prev => [...prev, res.data]);
            setChatInputText('');
            setAttachedFileUrl('');
            setAttachedFileName('');
        } catch (err) {
            console.error('Failed to send message:', err);
            alert('Failed to send message. Please try again.');
        }
    };

    const renderMessageContent = (content) => {
        const linkRegex = /\[Attachment:\s*([^\]]+)\]\(([^)]+)\)/g;
        const matches = [...content.matchAll(linkRegex)];

        if (matches.length > 0) {
            const cleanText = content.replace(linkRegex, '').trim();
            return (
                <div>
                    {cleanText && <p className="mb-2" style={{ whiteSpace: 'pre-wrap' }}>{cleanText}</p>}
                    {matches.map((m, idx) => {
                        const name = m[1];
                        const url = m[2];
                        const isImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(url);
                        return (
                            <div key={idx} className="mt-2 p-2 bg-dark bg-opacity-50 rounded border border-secondary d-flex align-items-center gap-2">
                                <i className={`bi ${isImage ? 'bi-image' : 'bi-file-earmark-pdf'} text-warning fs-5`}></i>
                                <div className="overflow-hidden">
                                    {isImage ? (
                                        <a href={url} target="_blank" rel="noopener noreferrer">
                                            <img src={url} alt={name} style={{ maxWidth: '150px', maxHeight: '100px', borderRadius: '4px' }} className="d-block mb-1 border border-secondary" />
                                        </a>
                                    ) : null}
                                    <a href={url} target="_blank" rel="noopener noreferrer" className="text-info text-decoration-none small text-truncate d-block" style={{ maxWidth: '200px' }}>
                                        {name}
                                    </a>
                                </div>
                            </div>
                        );
                    })}
                </div>
            );
        }

        return <p className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>{content}</p>;
    };

    if (loading && messages.length === 0) {
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
                    {/* Left Sidebar (Chats List) */}
                    <Col md={4} className="border-end border-secondary h-100 d-flex flex-column" style={{ background: 'rgba(0, 0, 0, 0.2)' }}>
                        <div className="p-3 border-bottom border-secondary">
                            <h5 className="fw-bold mb-3 d-flex align-items-center gap-2">
                                <i className="bi bi-chat-left-text-fill text-success"></i> Land Marketplace Chats
                            </h5>
                            <Form.Control
                                type="text"
                                placeholder="Search chat partners..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="bg-dark text-white border-secondary small rounded-pill shadow-none"
                            />
                        </div>

                        <div className="flex-grow-1 overflow-auto">
                            {filteredThreads.length === 0 ? (
                                <p className="text-secondary text-center my-4 small">No active chat threads found.</p>
                            ) : (
                                filteredThreads.map(t => {
                                    const isSelected = t.key === selectedThreadKey;
                                    return (
                                        <div
                                            key={t.key}
                                            onClick={() => setSelectedThreadKey(t.key)}
                                            className={`p-3 border-bottom border-secondary-subtle d-flex align-items-start gap-3 cursor-pointer transition-all ${isSelected ? 'bg-secondary bg-opacity-25 border-start border-4 border-success' : 'hover-bg-dark'}`}
                                            style={{ cursor: 'pointer' }}
                                        >
                                            <div className="rounded-circle bg-success bg-opacity-25 p-2 text-center text-success fw-bold d-flex align-items-center justify-content-center" style={{ width: '40px', height: '40px', minWidth: '40px' }}>
                                                {t.partnerName.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="flex-grow-1 overflow-hidden">
                                                <div className="d-flex justify-content-between align-items-center mb-1">
                                                    <span className="fw-bold text-white small text-truncate">{t.partnerName}</span>
                                                    <span className="text-secondary" style={{ fontSize: '0.7rem' }}>
                                                        {new Date(t.sentAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                                    </span>
                                                </div>
                                                <div className="text-info small text-truncate fw-semibold mb-1">{t.landTitle}</div>
                                                <div className="d-flex justify-content-between align-items-center">
                                                    <span className="text-secondary small text-truncate" style={{ maxWidth: '85%' }}>{t.lastMessage}</span>
                                                    {t.isUnread && (
                                                        <span className="bg-success rounded-circle" style={{ width: '8px', height: '8px' }}></span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </Col>

                    {/* Right Pane (Chat Feed) */}
                    <Col md={8} className="h-100 d-flex flex-column">
                        {selectedThread ? (
                            <>
                                {/* Conversation Header */}
                                <div className="p-3 border-bottom border-secondary bg-black bg-opacity-20 d-flex justify-content-between align-items-center">
                                    <div>
                                        <h6 className="fw-bold mb-0">{selectedThread.partnerName}</h6>
                                        <small className="text-info fw-semibold"><i className="bi bi-geo-alt-fill me-1"></i>{selectedThread.landTitle}</small>
                                    </div>
                                    <div className="d-flex gap-2">
                                        <Button
                                            variant="outline-danger"
                                            size="sm"
                                            className="rounded-pill px-3"
                                            onClick={async () => {
                                                if (window.confirm("Are you sure you want to delete this chat thread? This action cannot be undone.")) {
                                                    const buyerEmail = email.toLowerCase() === selectedThread.partnerEmail.toLowerCase()
                                                        ? email
                                                        : selectedThread.partnerEmail;
                                                    try {
                                                        await axios.delete(`${API_BASE_URL}/api/buyersellermessages/thread?landId=${selectedThread.landId}&buyerEmail=${encodeURIComponent(buyerEmail)}`);
                                                        setSelectedThreadKey(null);
                                                        fetchAllMessages();
                                                        alert("Conversation deleted successfully.");
                                                    } catch (err) {
                                                        console.error("Failed to delete chat thread:", err);
                                                        alert("Failed to delete chat thread.");
                                                    }
                                                }
                                            }}
                                        >
                                            <i className="bi bi-trash3 me-1"></i> Delete Chat
                                        </Button>
                                        <Button
                                            variant="outline-info"
                                            size="sm"
                                            className="rounded-pill px-3"
                                            onClick={() => {
                                                alert(`Viewing details for property: ${selectedThread.landTitle}`);
                                            }}
                                        >
                                            <i className="bi bi-info-circle me-1"></i> Land Details
                                        </Button>
                                    </div>
                                </div>

                                {/* Messages Area */}
                                <div className="flex-grow-1 overflow-auto p-3 d-flex flex-column gap-2" style={{ background: 'rgba(0, 0, 0, 0.15)' }}>
                                    {selectedThread.messages.map((m) => {
                                        const isMe = m.senderEmail.toLowerCase() === email.toLowerCase();
                                        return (
                                            <div key={m.id} className={`d-flex ${isMe ? 'justify-content-end' : 'justify-content-start'}`}>
                                                <div
                                                    className="p-3 rounded-3 text-white shadow-sm"
                                                    style={{
                                                        background: isMe ? '#005c4b' : '#202c33',
                                                        maxWidth: '75%',
                                                        borderTopLeftRadius: isMe ? '12px' : '0',
                                                        borderTopRightRadius: isMe ? '0' : '12px',
                                                        borderBottomLeftRadius: '12px',
                                                        borderBottomRightRadius: '12px'
                                                    }}
                                                >
                                                    {renderMessageContent(m.messageContent)}
                                                    <small className="text-secondary d-block text-end mt-1" style={{ fontSize: '0.65rem', opacity: 0.8 }}>
                                                        {new Date(m.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </small>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    <div ref={chatEndRef} />
                                </div>

                                {/* Send Input Box */}
                                <div className="p-3 bg-black bg-opacity-30 border-top border-secondary">
                                    {attachingFile && (
                                        <div className="small text-secondary mb-2 d-flex align-items-center gap-2">
                                            <Spinner size="sm" animation="border" variant="success" /> Uploading attachment...
                                        </div>
                                    )}

                                    {attachedFileUrl && (
                                        <div className="mb-2 p-2 bg-success bg-opacity-25 rounded border border-success d-flex align-items-center justify-content-between">
                                            <span className="small text-success text-truncate" style={{ maxWidth: '80%' }}>
                                                <i className="bi bi-paperclip me-2"></i>Attached: {attachedFileName}
                                            </span>
                                            <Button variant="link" className="text-danger p-0 border-0" onClick={() => { setAttachedFileUrl(''); setAttachedFileName(''); }}>
                                                <i className="bi bi-trash"></i>
                                            </Button>
                                        </div>
                                    )}

                                    <Form onSubmit={handleSendChatMessage} className="d-flex gap-2">
                                        <Button
                                            type="button"
                                            variant="outline-secondary"
                                            onClick={() => fileInputRef.current.click()}
                                            title="Attach File / Image"
                                            className="d-flex align-items-center justify-content-center"
                                        >
                                            <i className="bi bi-paperclip"></i>
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
                                            required={!attachedFileUrl}
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
                                    <i className="bi bi-whatsapp text-success fs-1"></i>
                                </div>
                                <h4 className="fw-bold text-white">Select a Chat to Start Negotiating</h4>
                                <p className="text-secondary small max-w-350">
                                    Click any conversation thread on the left panel to read and reply in real time.
                                    Negotiate price, exchange photos, or request documents instantly!
                                </p>
                            </div>
                        )}
                    </Col>
                </Row>
            </Card>
        </Container>
    );
}
