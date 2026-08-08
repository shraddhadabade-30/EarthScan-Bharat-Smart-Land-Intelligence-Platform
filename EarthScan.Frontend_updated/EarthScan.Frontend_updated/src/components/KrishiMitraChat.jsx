import React, { useState, useEffect, useRef, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthContext } from '../context/AuthContext';
import { API_BASE_URL } from '../config';
import {
    Box,
    IconButton,
    Paper,
    Typography,
    TextField,
    Avatar,
    Badge,
    CircularProgress,
    List,
    ListItem,
    ListItemText,
    Zoom,
    Fab
} from '@mui/material';
import ChatIcon from '@mui/icons-material/Chat';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import PersonIcon from '@mui/icons-material/Person';
import DeleteIcon from '@mui/icons-material/Delete';
export default function KrishiMitraChat() {
    const { t, i18n } = useTranslation();
    const { user } = useContext(AuthContext);
    const userId = user?.id || user?.userId || 'guest';
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState(() => {
        const saved = localStorage.getItem(`krishi_chat_${userId}`);
        return saved ? JSON.parse(saved) : [];
    });
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const messagesEndRef = useRef(null);

    useEffect(() => {
        if (userId && messages.length > 0) {
            localStorage.setItem(`krishi_chat_${userId}`, JSON.stringify(messages));
        }
    }, [messages, userId]);

    useEffect(() => {
        if (isOpen && messages.length === 0) {
            // Initial welcome message
            const welcomeText = i18n.language === 'mr' 
                ? 'नमस्कार! मी कृषी मित्र आहे. मी तुम्हाला शेती, हवामान, माती आणि सरकारी योजनांबद्दल कशी मदत करू?' 
                : i18n.language === 'hi'
                ? 'नमस्ते! मैं कृषि मित्र हूँ। मैं आपको खेती, मौसम, मिट्टी और सरकारी योजनाओं के बारे में कैसे मदद कर सकता हूँ?'
                : 'Hello! I am Krishi Mitra, your AI agriculture advisor. How can I assist you with farming, weather, soil, or government schemes today?';
            
            setMessages([{
                id: 'welcome',
                text: welcomeText,
                sender: 'ai',
                timestamp: new Date()
            }]);
        }
    }, [isOpen, i18n.language, messages.length]);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const handleClearChat = () => {
        setMessages([]);
        if (userId) {
            localStorage.removeItem(`krishi_chat_${userId}`);
        }
    };

    const handleSend = async (e) => {
        e.preventDefault();
        if (!input.trim() || sending || !userId) return;

        const userMsgText = input;
        setInput('');
        setSending(true);

        // Add user message to UI
        const userMsg = {
            id: Date.now().toString(),
            text: userMsgText,
            sender: 'user',
            timestamp: new Date()
        };
        setMessages(prev => [...prev, userMsg]);

        try {
            const response = await fetch(`${API_BASE_URL}/api/ai/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    userId: userId,
                    question: userMsgText,
                    location: user?.location || user?.Location || 'Pune, Maharashtra',
                    soilInfo: 'Black Soil',
                    weatherInfo: 'Partly Cloudy, 28°C',
                    lang: i18n.language
                })
            });

            if (response.ok) {
                const data = await response.json();
                const aiMsg = {
                    id: (Date.now() + 1).toString(),
                    text: data.answer,
                    sender: 'ai',
                    timestamp: new Date()
                };
                setMessages(prev => [...prev, aiMsg]);
            } else {
                throw new Error('Failed to get answer');
            }
        } catch (error) {
            console.error('Chat error:', error);
            const errMsg = {
                id: (Date.now() + 1).toString(),
                text: t('profile.error_load', 'Something went wrong. Please check your connection.'),
                sender: 'ai',
                timestamp: new Date()
            };
            setMessages(prev => [...prev, errMsg]);
        } finally {
            setSending(false);
        }
    };

    if (!user) return null; // Chat only available to logged-in users

    // WhatsApp-like styling
    const waGreen = '#075E54';
    const waLightGreen = '#dcf8c6';
    const waBg = '#e5ddd5';

    return (
        <Box sx={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1300 }}>
            {/* Toggle Button */}
            <Fab 
                aria-label="chat" 
                onClick={() => setIsOpen(!isOpen)}
                sx={{ 
                    bgcolor: waGreen, 
                    color: '#fff',
                    '&:hover': { bgcolor: '#128C7E' },
                    boxShadow: '0 4px 15px rgba(7, 94, 84, 0.4)',
                    width: 60,
                    height: 60
                }}
            >
                {isOpen ? <CloseIcon /> : <ChatIcon fontSize="large" />}
            </Fab>

            {/* Chat Dialog */}
            <Zoom in={isOpen}>
                <Paper
                    elevation={12}
                    sx={{
                        position: 'absolute',
                        bottom: 80,
                        right: 0,
                        width: { xs: '320px', sm: '380px' },
                        height: '520px',
                        display: 'flex',
                        flexDirection: 'column',
                        borderRadius: '16px',
                        overflow: 'hidden',
                        background: waBg,
                        border: '1px solid rgba(0, 0, 0, 0.1)',
                        boxShadow: '0 10px 40px rgba(0,0,0,0.2)'
                    }}
                >
                    {/* Header */}
                    <Box sx={{ 
                        p: 1.5, 
                        bgcolor: waGreen, 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: 1.5,
                        color: '#fff'
                    }}>
                        <Avatar sx={{ bgcolor: '#fff', width: 40, height: 40 }}>
                            <SmartToyIcon sx={{ color: waGreen }} />
                        </Avatar>
                        <Box sx={{ flexGrow: 1 }}>
                            <Typography variant="subtitle1" sx={{ fontWeight: '600', lineHeight: 1.2 }}>
                                Krishi Mitra AI
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                online
                            </Typography>
                        </Box>
                        <IconButton size="small" onClick={handleClearChat} sx={{ color: '#fff' }} title="Clear Chat">
                            <DeleteIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={() => setIsOpen(false)} sx={{ color: '#fff' }}>
                            <CloseIcon fontSize="small" />
                        </IconButton>
                    </Box>

                    {/* Messages List (WhatsApp background pattern imitation) */}
                    <Box sx={{ 
                        flexGrow: 1, 
                        overflowY: 'auto', 
                        p: 2, 
                        display: 'flex', 
                        flexDirection: 'column', 
                        gap: 1.5,
                        backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")',
                        backgroundRepeat: 'repeat',
                        backgroundSize: '400px',
                        backgroundBlendMode: 'overlay',
                        backgroundColor: 'rgba(229, 221, 213, 0.9)'
                    }}>
                        {messages.map((msg) => {
                            const isAI = msg.sender === 'ai';
                            return (
                                <Box 
                                    key={msg.id} 
                                    sx={{ 
                                        display: 'flex', 
                                        flexDirection: 'column',
                                        alignSelf: isAI ? 'flex-start' : 'flex-end',
                                        maxWidth: '80%'
                                    }}
                                >
                                    <Paper
                                        elevation={1}
                                        sx={{
                                            p: '6px 10px 8px 12px',
                                            borderRadius: isAI ? '0 12px 12px 12px' : '12px 0 12px 12px',
                                            bgcolor: isAI ? '#fff' : waLightGreen,
                                            color: '#303030',
                                            position: 'relative'
                                        }}
                                    >
                                        <Typography variant="body2" sx={{ whiteSpace: 'pre-line', wordBreak: 'break-word', fontSize: '14px', lineHeight: 1.4 }}>
                                            {msg.text}
                                        </Typography>
                                        <Typography variant="caption" sx={{ color: 'rgba(0,0,0,0.45)', display: 'block', mt: 0.5, textAlign: 'right', fontSize: '10px' }}>
                                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </Typography>
                                    </Paper>
                                </Box>
                            );
                        })}
                        {sending && (
                            <Box sx={{ display: 'flex', alignSelf: 'flex-start', maxWidth: '80%' }}>
                                <Paper elevation={1} sx={{ p: 2, borderRadius: '0 12px 12px 12px', bgcolor: '#fff' }}>
                                    <CircularProgress size={20} sx={{ color: waGreen }} />
                                </Paper>
                            </Box>
                        )}
                        <div ref={messagesEndRef} />
                    </Box>

                    {/* Input Field */}
                    <Box component="form" onSubmit={handleSend} sx={{ 
                        p: '10px', 
                        bgcolor: '#f0f0f0', 
                        display: 'flex', 
                        gap: 1,
                        alignItems: 'center'
                    }}>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder={i18n.language === 'mr' ? 'Type a message...' : i18n.language === 'hi' ? 'Type a message...' : 'Type a message...'}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            disabled={sending}
                            sx={{
                                '& .MuiOutlinedInput-root': {
                                    bgcolor: '#fff',
                                    borderRadius: '24px',
                                    '& fieldset': { border: 'none' },
                                },
                            }}
                        />
                        <Fab 
                            type="submit" 
                            disabled={!input.trim() || sending} 
                            sx={{ 
                                bgcolor: waGreen,
                                color: '#fff',
                                width: 44,
                                height: 44,
                                minHeight: 44,
                                '&:hover': { bgcolor: '#128C7E' },
                                '&:disabled': { bgcolor: '#ccc', color: '#fff' } 
                            }}
                        >
                            <SendIcon sx={{ fontSize: 20, ml: 0.5 }} />
                        </Fab>
                    </Box>
                </Paper>
            </Zoom>
        </Box>
    );
}
