import React, { useState, useContext, useEffect } from 'react';
import { Container, Row, Col, Card, Form, Button, Badge } from 'react-bootstrap';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import InsightsFooter from '../components/InsightsFooter';
import { CircularProgress } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { SavedSearchContext } from '../context/SavedSearchContext';
import { useLocation } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Recenter helper component for Leaflet
function MapRecenter({ lat, lng }) {
    const map = useMap();
    useEffect(() => {
        if (lat && lng) map.flyTo([lat, lng], 13, { duration: 1.5 });
    }, [lat, lng, map]);
    return null;
}

// Fix standard leaflet markers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/shadow-marker.png',
});

export default function InvestmentAnalysis() {
    const [region, setRegion] = useState('Pune');
    const [crop, setCrop] = useState('Sugarcane');
    const [investment, setInvestment] = useState(5130000);
    const [years, setYears] = useState(5);
    const [growthRate, setGrowthRate] = useState(10); // Default 10% appreciation
    const [maintenanceCost, setMaintenanceCost] = useState(200000); // Default 2L annual cost

    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState(null);
    const { t } = useTranslation();
    const { savedLocations } = useContext(SavedSearchContext);
    const [selectedSavedLandId, setSelectedSavedLandId] = useState('');
    const location = useLocation();

    // Hook to handle router state navigation (Load Profile)
    useEffect(() => {
        if (location.state && location.state.selectedLandId) {
            setSelectedSavedLandId(location.state.selectedLandId);
            // Clean the state to avoid loop on reload
            window.history.replaceState({}, document.title);
        }
    }, [location.state]);

    // Update investment and region fields when saved land is selected
    useEffect(() => {
        if (selectedSavedLandId) {
            const selected = savedLocations.find(s => String(s.id) === String(selectedSavedLandId));
            if (selected) {
                setInvestment(selected.price || 5130000);
                setRegion(selected.pin || 'Pune');
                // Run simulation automatically
                triggerSimulation(selected);
            }
        }
    }, [selectedSavedLandId, savedLocations]);

    const triggerSimulation = (selectedLand) => {
        setLoading(true);
        setTimeout(() => {
            const data = [];
            const landInvestment = selectedLand ? Number(selectedLand.price || 5130000) : Number(investment);
            let currentVal = landInvestment;
            let baseGrowthRate = Number(growthRate) / 100.0;
            let finalRisk = baseGrowthRate > 0.15 ? 'High' : baseGrowthRate > 0.08 ? 'Medium' : 'Low';

            if (selectedLand) {
                const score = selectedLand.score || 75;
                const scoreFactor = (score - 60) / 200; // e.g. score 80 -> +10% relative growth increase
                baseGrowthRate += scoreFactor;

                // Set risk based on water level and intelligence score
                if (selectedLand.water === 'High' || Number(selectedLand.water) > 80 || score >= 80) {
                    finalRisk = 'Low';
                } else if (selectedLand.water === 'Low' || Number(selectedLand.water) < 30 || score < 60) {
                    finalRisk = 'High';
                }
            }

            let breakEvenYear = "N/A";
            for (let i = 0; i <= years; i++) {
                const yearCost = landInvestment + (i * Number(maintenanceCost));
                data.push({
                    year: `Year ${i}`,
                    value: Math.round(currentVal),
                    cost: Math.round(yearCost)
                });

                if (breakEvenYear === "N/A" && currentVal > yearCost && i > 0) {
                    breakEvenYear = `Year ${i}`;
                }

                // Compound growth
                const fluctuation = (Math.random() * 0.02) - 0.01; // +/- 1% yearly variance
                currentVal += (currentVal * (baseGrowthRate + fluctuation));
            }

            const finalValue = data[data.length - 1].value;
            const totalCost = data[data.length - 1].cost;
            const roi = (((finalValue - totalCost) / totalCost) * 100).toFixed(1);

            setResults({
                data,
                finalValue,
                roi,
                breakEven: breakEvenYear,
                risk: finalRisk
            });
            setLoading(false);
        }, 1000);
    };

    const handleSimulate = () => {
        const selected = selectedSavedLandId ? savedLocations.find(s => String(s.id) === String(selectedSavedLandId)) : null;
        triggerSimulation(selected);
    };

    const formatCurrency = (val) => {
        return `₹${(val / 100000).toFixed(1)}L`;
    };

    const selectedLand = selectedSavedLandId ? savedLocations.find(s => String(s.id) === String(selectedSavedLandId)) : null;

    return (
        <Container fluid className="p-0">
            <h2 className="text-white fw-bold mb-4">
                <i className="bi bi-graph-up-arrow text-success animate__animated animate__fadeIn"></i> {t('investment.title')}
            </h2>

            <Row className="g-4 mb-4">
                <Col lg={4}>
                    <Card className="glass-panel border-0 text-white h-100 shadow">
                        <Card.Body className="p-4">
                            <h5 className="fw-bold mb-4 text-light">{t('investment.sim_params')}</h5>
                            <Form>
                                <Form.Group className="mb-3">
                                    <Form.Label className="text-secondary small">{t('investment.select_saved')}</Form.Label>
                                    <Form.Select
                                        value={selectedSavedLandId}
                                        onChange={e => setSelectedSavedLandId(e.target.value)}
                                        className="bg-transparent text-white border-secondary shadow-none"
                                        style={{ backgroundColor: '#141d2b' }}
                                    >
                                        <option value="" className="bg-dark">{t('investment.select_land_placeholder')}</option>
                                        {savedLocations.map((land, idx) => (
                                            <option key={idx} value={land.id} className="bg-dark">
                                                {land.name} ({land.pin})
                                            </option>
                                        ))}
                                    </Form.Select>
                                </Form.Group>

                                <Form.Group className="mb-3">
                                    <Form.Label className="text-secondary small">{t('investment.region')}</Form.Label>
                                    <Form.Control
                                        type="text"
                                        value={region}
                                        onChange={e => setRegion(e.target.value)}
                                        className="bg-transparent text-white border-secondary shadow-none"
                                        placeholder={t('investment.region_placeholder')}
                                    />
                                </Form.Group>

                                <Form.Group className="mb-3">
                                    <Form.Label className="text-secondary small">{t('investment.crop')}</Form.Label>
                                    <Form.Select
                                        value={crop}
                                        onChange={e => setCrop(e.target.value)}
                                        className="bg-transparent text-white border-secondary shadow-none"
                                        style={{ backgroundColor: '#141d2b' }}
                                    >
                                        <option value="Sugarcane" className="bg-dark">Sugarcane</option>
                                        <option value="Cotton" className="bg-dark">Cotton</option>
                                        <option value="Mango" className="bg-dark">Alphonso Mango</option>
                                        <option value="Soybean" className="bg-dark">Soybean</option>
                                    </Form.Select>
                                </Form.Group>

                                <Form.Group className="mb-3">
                                    <Form.Label className="text-secondary small">{t('investment.amount')}</Form.Label>
                                    <Form.Control
                                        type="number"
                                        value={investment}
                                        onChange={e => setInvestment(e.target.value)}
                                        className="bg-transparent text-white border-secondary shadow-none"
                                    />
                                </Form.Group>

                                <Form.Group className="mb-3">
                                    <Form.Label className="text-secondary small">{t('investment.growth_rate_label', 'Annual Appreciation Rate (%)')}</Form.Label>
                                    <Form.Control
                                        type="number"
                                        min={1} max={100}
                                        value={growthRate}
                                        onChange={e => setGrowthRate(e.target.value)}
                                        className="bg-transparent text-white border-secondary shadow-none"
                                    />
                                </Form.Group>

                                <Form.Group className="mb-3">
                                    <Form.Label className="text-secondary small">{t('investment.maintenance_cost_label', 'Annual Maintenance Cost (₹)')}</Form.Label>
                                    <Form.Control
                                        type="number"
                                        value={maintenanceCost}
                                        onChange={e => setMaintenanceCost(e.target.value)}
                                        className="bg-transparent text-white border-secondary shadow-none"
                                    />
                                </Form.Group>

                                <Form.Group className="mb-4">
                                    <Form.Label className="text-secondary small">{t('investment.time_horizon', { years })}</Form.Label>
                                    <Form.Range
                                        min={1} max={15}
                                        value={years}
                                        onChange={e => setYears(e.target.value)}
                                    />
                                </Form.Group>

                                <Button
                                    variant="success"
                                    className="w-100 py-2 fw-bold rounded-pill d-flex justify-content-center align-items-center gap-2 shadow-sm"
                                    onClick={handleSimulate}
                                    disabled={loading}
                                >
                                    {loading ? <CircularProgress size={20} color="inherit" /> : <i className="bi bi-cpu"></i>}
                                    {loading ? t('investment.running_model') : t('investment.run_sim')}
                                </Button>
                            </Form>

                            {/* Detailed Location stats and Leaflet Map */}
                            {selectedLand && selectedLand.latitude && selectedLand.longitude && (
                                <Card className="glass-panel border-0 text-white mt-4 overflow-hidden shadow-sm" style={{ borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <Card.Body className="p-0">
                                        <div style={{ height: '220px', position: 'relative' }}>
                                            <MapContainer
                                                center={[selectedLand.latitude, selectedLand.longitude]}
                                                zoom={13}
                                                style={{ height: '100%', width: '100%', zIndex: 1 }}
                                                zoomControl={false}
                                            >
                                                <TileLayer
                                                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                                    attribution='&copy; OpenStreetMap contributors'
                                                />
                                                <Marker position={[selectedLand.latitude, selectedLand.longitude]}>
                                                    <Popup>
                                                        <strong>{selectedLand.name}</strong><br />
                                                        Soil: {selectedLand.soil}<br />
                                                        Water Depth: {selectedLand.water}m
                                                    </Popup>
                                                </Marker>
                                                <MapRecenter lat={selectedLand.latitude} lng={selectedLand.longitude} />
                                            </MapContainer>
                                        </div>
                                        <div className="p-3 bg-dark bg-opacity-75">
                                            <Row className="g-2 text-center text-secondary small">
                                                <Col xs={4}>
                                                    <div className="text-success fw-bold">{selectedLand.soil || 'N/A'}</div>
                                                    <div style={{ fontSize: '10px' }}>{t('investment.soil_type')}</div>
                                                </Col>
                                                <Col xs={4}>
                                                    <div className="text-info fw-bold">{selectedLand.water || 'N/A'}m</div>
                                                    <div style={{ fontSize: '10px' }}>{t('investment.water_level')}</div>
                                                </Col>
                                                <Col xs={4}>
                                                    <div className="text-warning fw-bold">{selectedLand.score || '75'}</div>
                                                    <div style={{ fontSize: '10px' }}>{t('investment.intel_score')}</div>
                                                </Col>
                                            </Row>
                                        </div>
                                    </Card.Body>
                                </Card>
                            )}
                        </Card.Body>
                    </Card>
                </Col>

                <Col lg={8}>
                    {results ? (
                        <>
                            <Row className="g-3 mb-4">
                                <Col md={4}>
                                    <Card className="glass-panel border-0 text-white text-center shadow-sm">
                                        <Card.Body className="py-4">
                                            <h6 className="text-secondary mb-2">{t('investment.projected_roi')}</h6>
                                            <h2 className="fw-bold text-success mb-0">+{results.roi}%</h2>
                                        </Card.Body>
                                    </Card>
                                </Col>
                                <Col md={4}>
                                    <Card className="glass-panel border-0 text-white text-center shadow-sm">
                                        <Card.Body className="py-4">
                                            <h6 className="text-secondary mb-2">{t('investment.est_value', { years })}</h6>
                                            <h2 className="fw-bold text-info mb-0">{formatCurrency(results.finalValue)}</h2>
                                        </Card.Body>
                                    </Card>
                                </Col>
                                <Col md={4}>
                                    <Card className="glass-panel border-0 text-white text-center shadow-sm">
                                        <Card.Body className="py-4">
                                            <h6 className="text-secondary mb-2">{t('investment.breakeven_pt')}</h6>
                                            <h2 className="fw-bold text-warning mb-0">{results.breakEven}</h2>
                                        </Card.Body>
                                    </Card>
                                </Col>
                            </Row>

                            <Card className="glass-panel border-0 text-white shadow-sm mb-4">
                                <Card.Body className="p-4">
                                    <div className="d-flex justify-content-between align-items-center mb-4">
                                        <h5 className="fw-bold mb-0 text-light">{t('investment.value_growth')}</h5>
                                        <Badge bg={results.risk === 'High' ? 'danger' : results.risk === 'Low' ? 'success' : 'warning'} className="px-3 py-2 rounded-pill">
                                            {t('investment.risk_profile', { risk: results.risk })}
                                        </Badge>
                                    </div>
                                    <div style={{ height: '300px', width: '100%' }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={results.data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                                <defs>
                                                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#00e676" stopOpacity={0.4} />
                                                        <stop offset="95%" stopColor="#00e676" stopOpacity={0} />
                                                    </linearGradient>
                                                </defs>
                                                <XAxis dataKey="year" stroke="#a0aec0" />
                                                <YAxis stroke="#a0aec0" tickFormatter={formatCurrency} />
                                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                                <Tooltip
                                                    contentStyle={{ backgroundColor: '#0a0f18', borderColor: '#2979ff', color: '#fff', borderRadius: '8px' }}
                                                    itemStyle={{ color: '#00e676' }}
                                                    formatter={(value) => formatCurrency(value)}
                                                />
                                                <Area type="monotone" dataKey="value" stroke="#00e676" fillOpacity={1} fill="url(#colorValue)" name={t('investment.projected_value')} strokeWidth={3} />
                                                <Line type="monotone" dataKey="cost" stroke="#ff5252" strokeWidth={2} dot={false} name={t('investment.cumulative_cost')} />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                </Card.Body>
                            </Card>
                        </>
                    ) : (
                        <Card className="glass-panel border-0 text-white h-100 d-flex justify-content-center align-items-center shadow-lg" style={{ borderRadius: '16px', minHeight: '400px' }}>
                            <Card.Body className="text-center p-5 text-secondary">
                                <i className="bi bi-bar-chart-line mb-3 d-block text-success animate__animated animate__pulse animate__infinite" style={{ fontSize: '4.5rem' }}></i>
                                <h4 className="fw-bold text-white mb-2">{t('investment.awaiting_params')}</h4>
                                <p className="mb-0 mx-auto" style={{ maxWidth: '440px' }}>{t('investment.awaiting_params_desc')}</p>
                            </Card.Body>
                        </Card>
                    )}
                </Col>
            </Row>

            <InsightsFooter />
        </Container>
    );
}
