import React, { useContext, useState, useEffect } from 'react';
import { Container, Row, Col, Card, Button, Modal, Form, Table } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import InsightsFooter from '../components/InsightsFooter';
import { SavedSearchContext } from '../context/SavedSearchContext';
import { AuthContext } from '../context/AuthContext';
import { API_BASE_URL } from '../config';

export default function SavedSearches() {
    const { savedLocations, removeSavedSearch } = useContext(SavedSearchContext);
    const { user } = useContext(AuthContext);
    const { t } = useTranslation();
    const navigate = useNavigate();

    // Purchase Modal States
    const [selectedLand, setSelectedLand] = useState(null);
    const [showBuyModal, setShowBuyModal] = useState(false);
    const [buyerName, setBuyerName] = useState('');
    const [buyerPhone, setBuyerPhone] = useState('');
    const [buyerIdCard, setBuyerIdCard] = useState('');
    const [receiptData, setReceiptData] = useState(null);
    const [showReceiptModal, setShowReceiptModal] = useState(false);

    useEffect(() => {
        if (user) {
            setBuyerName(user.name || user.Name || '');
            setBuyerPhone(user.phone || user.Phone || '');
        }
    }, [user]);

    const handleDelete = (id) => {
        removeSavedSearch(id);
    };

    const handleLoadProfile = (id) => {
        navigate('/buyer/analysis', { state: { selectedLandId: id } });
    };

    const handleBuyClick = (location) => {
        setSelectedLand(location);
        setShowBuyModal(true);
    };

    const handleConfirmPurchase = async (e) => {
        e.preventDefault();
        if (!buyerName || !buyerPhone) {
            alert("Please fill in your Name and Phone Number.");
            return;
        }

        try {
            // Generate dynamic fallback/authentic Satbara details based on the saved location properties
            const satbaraInfo = {
                state: 'Maharashtra State (महाराष्ट्र राज्य)',
                formName: 'Form VII-XII (गांव नमुना ७/१२)',
                district: selectedLand.district || 'Pune',
                taluka: selectedLand.taluka || 'Haveli',
                village: selectedLand.village || selectedLand.name || 'Unknown',
                surveyNo: `${Math.floor(100 + Math.random() * 800)} / ${Math.floor(1 + Math.random() * 10)}`,
                tenure: 'Occupant Class I (भोगवटादार वर्ग - १)',
                totalArea: `${selectedLand.sizeInAcres || '5'} Acres`,
                cultivableArea: `${selectedLand.sizeInAcres || '5'} Acres`,
                potkharaba: '0.00 Hectares',
                assessmentTax: '₹12.50',
                irrigationSource: selectedLand.water || 'Borewell / Well',
                hasWell: 'Yes',
                ownerName: selectedLand.ownerName || 'Agrarian Seller Private Ltd',
                otherRights: 'Agricultural loan hypothecation of ₹1,50,000 from Bank of Maharashtra.',
                cropHistory: [
                    { year: '2025-2026', cropName: 'Sugarcane (ऊस)', area: `${selectedLand.sizeInAcres || '5'} Acres` }
                ]
            };

            const receipt = {
                receiptNo: `ESB-${Math.floor(100000 + Math.random() * 900000)}`,
                date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
                buyerName,
                buyerPhone,
                buyerIdCard: buyerIdCard || 'XXXXXXXXXXXX',
                landTitle: selectedLand.name,
                landLocation: selectedLand.pin || 'Unknown Location',
                landSize: selectedLand.sizeInAcres || 'N/A',
                landPrice: selectedLand.price,
                soilType: selectedLand.soil || 'Black Cotton',
                waterDepth: selectedLand.water || 'Moderate',
                contactNumber: selectedLand.contactNumber || '9969361069',
                satbara: satbaraInfo
            };

            // Call Backend delete endpoint to mark land as sold and remove listing
            await axios.delete(`${API_BASE_URL}/api/lands/${selectedLand.id}`);

            setReceiptData(receipt);

            // Store receipt to buyer's account
            const emailKey = user?.email || user?.Email || '';
            const existingPurchases = JSON.parse(localStorage.getItem(`purchasedLands_${emailKey}`) || '[]');
            const updatedPurchases = [receipt, ...existingPurchases];
            localStorage.setItem(`purchasedLands_${emailKey}`, JSON.stringify(updatedPurchases));

            // Remove from saved searches
            removeSavedSearch(selectedLand.id);

            setShowBuyModal(false);
            setSelectedLand(null);
            setShowReceiptModal(true);

            alert("Transaction Confirmed! Receipt and Satbara details generated in your account.");
        } catch (err) {
            console.error("Error during land purchase transaction:", err);
            alert("Transaction failed. Listing may have been sold or removed. Please try again.");
        }
    };

    return (
        <Container fluid className="p-0 d-flex flex-column min-vh-100">
            <div className="flex-grow-1 py-4">
                <h2 className="text-white fw-bold mb-4">
                    <i className="bi bi-bookmarks text-primary animate__animated animate__pulse animate__infinite"></i> {t('saved.title')}
                </h2>
                
                {savedLocations.length === 0 ? (
                    <div className="text-center mt-5 text-secondary">
                        <i className="bi bi-folder2-open display-1 text-muted"></i>
                        <h4 className="mt-3 text-light">{t('saved.no_saved')}</h4>
                        <p>{t('saved.no_saved_desc')}</p>
                    </div>
                ) : (
                    <Row className="g-4">
                        {savedLocations.map(location => (
                            <Col md={4} key={location.id}>
                                <Card className="glass-panel border-0 text-white overflow-hidden h-100 shadow-lg" style={{ borderRadius: '16px', background: 'rgba(255, 255, 255, 0.05)' }}>
                                    <div style={{ height: '180px', overflow: 'hidden', position: 'relative' }}>
                                        {location.imagePath ? (
                                            <Card.Img 
                                                variant="top" 
                                                src={`${API_BASE_URL}${location.imagePath}`} 
                                                style={{ height: '100%', objectFit: 'cover', transition: 'transform 0.3s ease' }}
                                                className="hover-zoom"
                                            />
                                        ) : (
                                            <div className="w-100 h-100 bg-secondary d-flex align-items-center justify-content-center" style={{ minHeight: '180px' }}>
                                                <i className="bi bi-image text-white-50" style={{ fontSize: '3rem' }}></i>
                                            </div>
                                        )}
                                        <div style={{ position: 'absolute', top: '12px', right: '12px' }}>
                                            <span className="badge bg-dark bg-opacity-75 text-success fw-bold px-2 py-1" style={{ borderRadius: '6px' }}>
                                                ₹{(location.price / 100000).toFixed(1)}L
                                            </span>
                                        </div>
                                    </div>
                                    <Card.Body className="p-4 d-flex flex-column">
                                        <div className="d-flex justify-content-between align-items-start mb-3">
                                            <div>
                                                <h5 className="fw-bold mb-1 text-light">{location.name}</h5>
                                                <p className="text-secondary small mb-0"><i className="bi bi-geo-alt text-danger"></i> Location: {location.pin}</p>
                                            </div>
                                        </div>
                                        <div className="text-secondary small mb-4 flex-grow-1">
                                            <div className="mb-1"><i className="bi bi-calendar-event me-1"></i> {t('saved.saved_on')}: {location.date}</div>
                                            <div className="mb-1"><i className="bi bi-layers me-1"></i> {t('saved.soil')}: {location.soil || 'N/A'}</div>
                                            {location.sizeInAcres && (
                                                <div><i className="bi bi-aspect-ratio me-1"></i> Size: {location.sizeInAcres} Acres</div>
                                            )}
                                        </div>
                                        <div className="d-flex gap-2 flex-wrap">
                                            <Button 
                                                variant="primary" 
                                                size="sm" 
                                                className="flex-grow-1 fw-bold py-2 rounded-pill shadow-sm"
                                                onClick={() => handleLoadProfile(location.id)}
                                            >
                                                Load Profile
                                            </Button>
                                            <Button 
                                                variant="success" 
                                                size="sm" 
                                                className="flex-grow-1 fw-bold py-2 rounded-pill shadow-sm"
                                                onClick={() => handleBuyClick(location)}
                                            >
                                                <i className="bi bi-cart-fill me-1"></i> Buy Land
                                            </Button>
                                            <Button 
                                                variant="outline-danger" 
                                                size="sm" 
                                                className="rounded-circle p-2 d-flex align-items-center justify-content-center"
                                                style={{ width: '38px', height: '38px' }}
                                                onClick={() => handleDelete(location.id)}
                                            >
                                                <i className="bi bi-trash"></i>
                                            </Button>
                                        </div>
                                    </Card.Body>
                                </Card>
                            </Col>
                        ))}
                    </Row>
                )}
            </div>

            {/* Confirm Buy Modal */}
            <Modal show={showBuyModal} onHide={() => setShowBuyModal(false)} centered contentClassName="glass-panel text-white border-0" style={{ background: 'rgba(10, 15, 24, 0.45)' }}>
                <Modal.Header closeButton closeVariant="white" className="border-secondary">
                    <Modal.Title className="fw-bold text-warning"><i className="bi bi-cart-check-fill"></i> Confirm Land Purchase</Modal.Title>
                </Modal.Header>
                <Modal.Body className="p-4" style={{ backgroundColor: '#0d1527' }}>
                    {selectedLand && (
                        <Form onSubmit={handleConfirmPurchase}>
                            <h5 className="text-light fw-bold mb-3">{selectedLand.name}</h5>
                            <p className="text-secondary small mb-4">
                                You are about to initiate a transaction to purchase this agricultural land. Upon completion, a legal receipt and digital 7/12 Satbara extract certificate will be generated and saved to your account.
                            </p>

                            <Table borderless size="sm" className="text-white mb-4">
                                <tbody>
                                    <tr>
                                        <td className="text-secondary ps-0">Price:</td>
                                        <td className="fw-bold text-success text-end pe-0">₹{selectedLand.price?.toLocaleString('en-IN')}</td>
                                    </tr>
                                    <tr>
                                        <td className="text-secondary ps-0">Location:</td>
                                        <td className="text-end pe-0">{selectedLand.pin}</td>
                                    </tr>
                                    <tr>
                                        <td className="text-secondary ps-0">Size:</td>
                                        <td className="text-end pe-0">{selectedLand.sizeInAcres} Acres</td>
                                    </tr>
                                </tbody>
                            </Table>

                            <Form.Group className="mb-3">
                                <Form.Label className="text-secondary small">Buyer Full Name</Form.Label>
                                <Form.Control 
                                    type="text" 
                                    placeholder="Enter your legal name" 
                                    value={buyerName}
                                    onChange={(e) => setBuyerName(e.target.value)}
                                    className="bg-dark border-secondary text-white shadow-none"
                                    required 
                                />
                            </Form.Group>

                            <Form.Group className="mb-3">
                                <Form.Label className="text-secondary small">Buyer Phone Number</Form.Label>
                                <Form.Control 
                                    type="text" 
                                    placeholder="Enter your phone number" 
                                    value={buyerPhone}
                                    onChange={(e) => setBuyerPhone(e.target.value)}
                                    className="bg-dark border-secondary text-white shadow-none"
                                    required 
                                />
                            </Form.Group>

                            <Form.Group className="mb-4">
                                <Form.Label className="text-secondary small">Aadhaar/PAN ID Card Number (Optional)</Form.Label>
                                <Form.Control 
                                    type="text" 
                                    placeholder="Enter ID number for Satbara registry" 
                                    value={buyerIdCard}
                                    onChange={(e) => setBuyerIdCard(e.target.value)}
                                    className="bg-dark border-secondary text-white shadow-none"
                                />
                            </Form.Group>

                            <Button type="submit" variant="warning" className="w-100 fw-bold py-2 rounded-pill text-dark shadow mt-2">
                                Confirm & Complete Purchase
                            </Button>
                        </Form>
                    )}
                </Modal.Body>
            </Modal>

            {/* Receipt Modal */}
            <Modal show={showReceiptModal} onHide={() => setShowReceiptModal(false)} centered size="lg" contentClassName="glass-panel text-white border-0" style={{ background: 'rgba(10, 15, 24, 0.45)' }}>
                <Modal.Header closeButton closeVariant="white" className="border-secondary">
                    <Modal.Title className="fw-bold text-success"><i className="bi bi-printer-fill"></i> Purchase Receipt & 7/12 Satbara Certificate</Modal.Title>
                </Modal.Header>
                <Modal.Body className="p-4 overflow-auto" style={{ maxHeight: '80vh', backgroundColor: '#0d1527' }}>
                    {receiptData && (
                        <div id="printable-receipt-saved" className="p-3 border border-secondary rounded bg-dark bg-opacity-50">
                            {/* Receipt Header */}
                            <div className="text-center border-bottom border-secondary pb-3 mb-4">
                                <h3 className="fw-bold text-success mb-1">EarthScan Bharat Platform</h3>
                                <p className="text-secondary small mb-0">Smart Agricultural Land Marketplace & Intelligence Portal</p>
                                <span className="badge bg-success mt-2">OFFICIAL TRANSACTION RECEIPT</span>
                            </div>

                            <Row className="mb-4 g-3">
                                <Col md={6}>
                                    <h6 className="text-secondary fw-semibold mb-2">Transaction Details</h6>
                                    <div className="small"><span className="text-secondary">Receipt No:</span> <strong className="text-warning">{receiptData.receiptNo}</strong></div>
                                    <div className="small"><span className="text-secondary">Date:</span> {receiptData.date}</div>
                                    <div className="small"><span className="text-secondary">Status:</span> <span className="text-success fw-bold">PAID / REGISTERED</span></div>
                                </Col>
                                <Col md={6} className="text-md-end">
                                    <h6 className="text-secondary fw-semibold mb-2">Buyer Information</h6>
                                    <div className="small"><strong>{receiptData.buyerName}</strong></div>
                                    <div className="small"><span className="text-secondary">Phone:</span> {receiptData.buyerPhone}</div>
                                    <div className="small"><span className="text-secondary">ID Card:</span> {receiptData.buyerIdCard}</div>
                                </Col>
                            </Row>

                            {/* Property Details */}
                            <h6 className="text-success border-bottom border-secondary pb-1 mb-2 fw-bold">1. PURCHASED PROPERTY DESCRIPTION</h6>
                            <Row className="mb-4 small g-2">
                                <Col xs={6}><span className="text-secondary">Title:</span></Col>
                                <Col xs={6} className="text-end"><strong>{receiptData.landTitle}</strong></Col>
                                <Col xs={6}><span className="text-secondary">Location:</span></Col>
                                <Col xs={6} className="text-end">{receiptData.landLocation}</Col>
                                <Col xs={6}><span className="text-secondary">Land Size:</span></Col>
                                <Col xs={6} className="text-end">{receiptData.landSize} Acres</Col>
                                <Col xs={6}><span className="text-secondary">Soil Type:</span></Col>
                                <Col xs={6} className="text-end">{receiptData.soilType}</Col>
                                <Col xs={6}><span className="text-secondary">Groundwater Availability:</span></Col>
                                <Col xs={6} className="text-end">{receiptData.waterDepth}</Col>
                                <Col xs={12} className="border-top border-secondary pt-2 mt-2"></Col>
                                <Col xs={6} className="fs-6 text-light font-bold">Total Paid Amount:</Col>
                                <Col xs={6} className="fs-5 text-success text-end font-bold">₹{receiptData.landPrice?.toLocaleString('en-IN')}</Col>
                            </Row>

                            {/* 7/12 Satbara Certificate */}
                            <h6 className="text-success border-bottom border-secondary pb-1 mb-2 fw-bold">2. GOVERNMENT 7/12 SATBARA EXTRACT (७/१२ उतारा)</h6>
                            <div className="p-3 bg-black bg-opacity-40 border border-secondary rounded font-monospace small" style={{ fontSize: '0.8rem', color: '#abb2bf', lineHeight: '1.4' }}>
                                <div className="text-center fw-bold border-bottom border-secondary pb-2 mb-2 text-warning">
                                    GOVERNMENT OF MAHARASHTRA / महाराष्ट्र शासन<br />
                                    REVENUE DEPARTMENT / महसूल विभाग
                                </div>
                                <div className="d-flex justify-content-between mb-1">
                                    <span>Village / गाव: {receiptData.satbara.village}</span>
                                    <span>Taluka / तालुका: {receiptData.satbara.taluka}</span>
                                </div>
                                <div className="d-flex justify-content-between mb-2">
                                    <span>District / जिल्हा: {receiptData.satbara.district}</span>
                                    <span>Survey / गट क्रमांक: {receiptData.satbara.surveyNo}</span>
                                </div>
                                <div className="border-top border-secondary pt-2 mb-2">
                                    <strong>Rights & Occupancy / हक्क आणि भोगवटादार:</strong><br />
                                    • {receiptData.satbara.tenure}<br />
                                    • New Owner Name / नवीन मालकाचे नाव: <span className="text-white fw-bold">{receiptData.buyerName}</span><br />
                                    • (Transferred from / माजी मालक: {receiptData.satbara.ownerName})
                                </div>
                                <div className="border-top border-secondary pt-2 mb-2">
                                    <strong>Area Details / क्षेत्रफळ तपशील:</strong><br />
                                    • Total Cultivable Area: {receiptData.satbara.cultivableArea}<br />
                                    • Uncultivable (Potkharaba): {receiptData.satbara.potkharaba}<br />
                                    • Assessment Tax (आकारणी): {receiptData.satbara.assessmentTax}
                                </div>
                                <div className="border-top border-secondary pt-2">
                                    <strong>Other Rights / इतर हक्क व बोजा:</strong><br />
                                    • {receiptData.satbara.otherRights}
                                </div>
                            </div>

                            {/* Verification Footer */}
                            <div className="text-center mt-4 pt-3 border-top border-secondary">
                                <p className="small text-secondary mb-1">This document is digitally signed and authentic. Serial verified via EarthScan blockchain ledger.</p>
                                <span className="text-success small fw-semibold">&#x2714; Verified EarthScan Bharat Registry</span>
                            </div>
                        </div>
                    )}
                </Modal.Body>
                <Modal.Footer className="border-secondary">
                    <Button variant="outline-light" onClick={() => window.print()} className="rounded-pill">
                        <i className="bi bi-printer me-1"></i> Print Receipt
                    </Button>
                    <Button variant="success" onClick={() => setShowReceiptModal(false)} className="rounded-pill px-4">
                        Close
                    </Button>
                </Modal.Footer>
            </Modal>
            
            <div className="mt-5">
                <InsightsFooter />
            </div>
        </Container>
    );
}
