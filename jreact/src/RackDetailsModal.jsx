import React, { useState, useContext, useEffect, useRef } from 'react';
import './RackDetailsModal.css';
import Checkin from './checkin';
import Checkout from './checkout';
import Defective from './defective';
import { ReportStateContext } from './LocalStorageContext';
import JsBarcode from 'jsbarcode';

// --- FIXED: Aligned with WarehouseMap.jsx ---
const LEGEND_COLORS = {
    'nearly full': '#007BFF', // Blue (Used for Rack Occupancy Bar)
    'normal': '#28A745',      // Green (Good Stock)
    'low': '#FFC107',         // Yellow (Low Stock)
    'empty': '#DC3545',       // Red (Zero Stock)
};

const RackDetailsModal = ({ rack, onClose }) => {
    const [activeSubPopup, setActiveSubPopup] = useState(null);
    
    // Get itemData and rackDetails from context
    const { rackDetails, itemData } = useContext(ReportStateContext);
    
    // --- CAROUSEL STATE ---
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    
    // --- BARCODE REFERENCE ---
    const barcodeRef = useRef(null);

    // --- CAROUSEL LOGIC ---
    const savedRackData = rackDetails[rack?.id];
    
    let itemsInRack = [];

    if (savedRackData && savedRackData.beams) {
        itemsInRack = savedRackData.beams
            .map(beam => {
                const itemInfo = itemData.find(i => i.name === beam.itemName);
                if (itemInfo && itemInfo.image) {
                    return { name: itemInfo.name, image: itemInfo.image };
                }
                return null;
            })
            .filter(item => item !== null);
    }

    const carouselImages = itemsInRack.length > 0 
        ? itemsInRack.map(item => item.image) 
        : ["https://via.placeholder.com/300?text=No+Images+Available"];

    // --- BARCODE GENERATION EFFECT ---
    useEffect(() => {
        if (rack && barcodeRef.current) {
            JsBarcode(barcodeRef.current, rack.id, {
                format: "CODE128",
                width: 1.2,
                height: 35,
                displayValue: false,
                margin: 0
            });
        }
    }, [rack]);

    useEffect(() => {
        setCurrentImageIndex(0);
    }, [rack?.id]);

    const nextImage = () => {
        setCurrentImageIndex((prev) => (prev + 1) % carouselImages.length);
    };

    const prevImage = () => {
        setCurrentImageIndex((prev) => (prev - 1 + carouselImages.length) % carouselImages.length);
    };

    if (!rack) return null;

    const rackArea = rack.area ?
        rack.area.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') : '';
    
    let beams = [];
    let occupancyPercentage = 0;
    
    let occupancyColor = LEGEND_COLORS['normal']; 

    if (savedRackData) {
        occupancyPercentage = savedRackData.occupancyPercentage || 0;
        
        beams = savedRackData.beams.map((beam, index) => {
            const rackQty = parseInt(beam.qty) || 0;
            const rackThreshold = parseInt(beam.threshold) || 0;
            const beamLetter = String.fromCharCode(65 + index);
            const itemName = (beam.itemName || "").trim();

            let status = 'normal';
            let color = LEGEND_COLORS['normal'];

            // --- 1. Empty Slot Check ---
            if (!itemName) {
                return { 
                    id: 'No Item', 
                    code: `Beam ${beamLetter}`, 
                    status: 'empty', 
                    count: '0/0', 
                    color: '#FFFFFF' 
                };
            }

            // --- 2. GLOBAL INVENTORY LOOKUP ---
            // Find the item in the Master Inventory List
            const globalItem = itemData.find(i => i.name === itemName);

            if (globalItem) {
                const totalGlobalQty = parseInt(globalItem.qty) || 0;
                const minThreshold = parseInt(globalItem.min_threshold) || 5;

                // --- 3. APPLY GLOBAL STATUS COLORS ---
                if (totalGlobalQty === 0) {
                    status = 'empty';
                    color = LEGEND_COLORS['empty'];
                } else if (totalGlobalQty <= minThreshold) {
                    status = 'low';
                    color = LEGEND_COLORS['low'];
                } else {
                    status = 'normal';
                    color = LEGEND_COLORS['normal'];
                }
            } else {
                // Fallback if item exists in rack but not in DB (shouldn't happen often)
                color = LEGEND_COLORS['normal'];
            }

            const displayId = itemName;

            return { 
                id: displayId, 
                code: `Beam ${beamLetter}`, 
                status: status, 
                // We still display the LOCAL rack quantity so user knows what is physically there
                count: `${rackQty}/${rackThreshold}`, 
                color: color 
            };
        });
    } else {
        beams = ['A', 'B', 'C', 'D', 'E'].map(char => ({
            id: `No Item`,
            code: `Beam ${char}`,
            status: 'empty',
            count: '0/0', 
            color: '#FFFFFF' 
        }));
    }

    const totalCapacity = beams.reduce((sum, beam) => sum + (parseInt(beam.count.split('/')[1], 10) || 0), 0);
    const totalOccupancy = beams.reduce((sum, beam) => sum + (parseInt(beam.count.split('/')[0], 10) || 0), 0);

    // --- Occupancy Bar Logic (Rack Level) ---
    // This remains based on Rack Capacity because it represents physical space
    if (occupancyPercentage >= 90) occupancyColor = LEGEND_COLORS['nearly full'];
    else if (occupancyPercentage <= 20) occupancyColor = LEGEND_COLORS['empty']; 
    else occupancyColor = LEGEND_COLORS['normal'];

    if (rack.status === 'defective') occupancyColor = LEGEND_COLORS['defective'];
    
    const handleCloseSubPopup = () => setActiveSubPopup(null);

    const formatStatus = (status) => status.charAt(0).toUpperCase() + status.slice(1);

    return (
        <div className="rack-details-modal-user-backdrop">
            <div className="rack-details-modal-user-content">
                <button onClick={onClose} className="rack-details-modal-user-close-button">&times;</button>

                <div className="rack-details-modal-user-left-section">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '10px' }}>
                        <div>
                            <h2 className="rack-details-modal-user-rack-id-title">{rack.id}</h2>
                            <p className="rack-details-modal-user-rack-area-text" style={{margin: 0}}>{rackArea}</p>
                        </div>
                        <div style={{ background: 'white', padding: '4px', borderRadius: '4px', border: '1px solid #eee', height: '45px', display: 'flex', alignItems: 'center' }}>
                            <canvas ref={barcodeRef}></canvas>
                        </div>
                    </div>

                    <div className="rack-details-modal-user-legend-container">
                        {['nearly full', 'normal', 'low', 'empty', 'defective'].map((status) => (
                            <div key={status} className="rack-details-modal-user-legend-item">
                                <div className="rack-details-modal-user-legend-color-dot" style={{ backgroundColor: LEGEND_COLORS[status] }}></div>
                                <span style={{ fontWeight: '500' }}>{formatStatus(status)}</span>
                            </div>
                        ))}
                    </div>

                    <h3 className="rack-details-modal-user-front-view-title">Rack Front View</h3>
                    
                    <div className="rack-details-modal-user-beam-list">
                        {beams.map((beam, index) => (
                            <div key={index} className="rack-details-modal-user-beam-item">
                                <span className="rack-details-modal-user-beam-label">{beam.code}</span>
                                <div className="rack-details-modal-user-beam-display" style={{ 
                                    backgroundColor: beam.color,
                                    color: (beam.color === '#FFFFFF' || beam.color === '#FFC107') ? 'black' : 'white',
                                    border: beam.color === '#FFFFFF' ? '1px solid #ddd' : 'none'
                                }}>
                                    {/* Display format: Item Name (Rack Qty / Rack Cap) */}
                                    {`${beam.id} (${beam.count})`}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="rack-details-modal-user-actions">
                        <button className="rack-details-modal-user-action-button rack-details-modal-user-checkin-button" onClick={() => setActiveSubPopup('checkin')}>
                            <span><ion-icon name="cloud-download-outline"></ion-icon></span> Check-in
                        </button>
                        <button className="rack-details-modal-user-action-button rack-details-modal-user-checkout-button" onClick={() => setActiveSubPopup('checkout')}>
                            <span><ion-icon name="cloud-upload-outline"></ion-icon></span> Check-Out
                        </button>
                        <button className="rack-details-modal-user-delete-button" onClick={() => setActiveSubPopup('defective')}>
                             <ion-icon name="trash-outline" style={{ fontSize: '1.2rem' }}></ion-icon>
                        </button>
                    </div>
                </div>

                <div className="rack-details-modal-user-right-section">
                    <h3 className="rack-details-modal-user-info-title">Rack Information</h3>
                    
                    <div className="rack-details-modal-user-occupancy-group">
                        <p className="rack-details-modal-user-occupancy-label">Occupancy</p>
                        <div className="rack-details-modal-user-progress-bar-container">
                            <div className="rack-details-modal-user-progress-bar" style={{ width: `${occupancyPercentage}%`, backgroundColor: occupancyColor }}></div>
                        </div>
                        <p className="rack-details-modal-user-occupancy-percentage-text">{occupancyPercentage}%</p>
                    </div>

                    <p className="rack-details-modal-user-info-row">
                        Total capacity <span className="rack-details-modal-user-info-value">{totalCapacity} units</span>
                    </p>
                    <p className="rack-details-modal-user-info-row">
                        Total stocked <span className="rack-details-modal-user-info-value">{totalOccupancy} units</span>
                    </p>
                    <p className="rack-details-modal-user-info-row">
                        Unique items <span className="rack-details-modal-user-info-value">
                           {beams.filter(b => b.id !== 'No Item').length}
                        </span>
                    </p>

                    <h3 className="rack-details-modal-user-image-title">Item Image Preview</h3>
                    
                    <div className="rack-details-modal-user-carousel">
                        {itemsInRack.length > 1 && (
                             <button className="carousel-nav prev" onClick={prevImage}>❮</button>
                        )}
                        
                        <div className="carousel-image-container" style={{ position: 'relative' }}>
                            <img 
                                src={carouselImages[currentImageIndex]} 
                                alt="Item Preview" 
                                className="carousel-img"
                                onError={(e) => { e.target.src = "https://via.placeholder.com/150?text=No+Image"; }}
                            />
                            
                            {itemsInRack.length > 0 && (
                                <div style={{
                                    position: 'absolute',
                                    bottom: '0',
                                    left: '0',
                                    width: '100%',
                                    background: 'rgba(0,0,0,0.6)',
                                    color: 'white',
                                    textAlign: 'center',
                                    padding: '5px',
                                    fontSize: '14px',
                                    borderBottomLeftRadius: '8px',
                                    borderBottomRightRadius: '8px'
                                }}>
                                    {itemsInRack[currentImageIndex].name}
                                </div>
                            )}
                        </div>

                        {itemsInRack.length > 1 && (
                            <button className="carousel-nav next" onClick={nextImage}>❯</button>
                        )}
                        
                        <div className="carousel-counter" style={{ marginTop: '10px', textAlign: 'center', fontWeight: 'bold' }}>
                            {currentImageIndex + 1} / {carouselImages.length}
                        </div>
                    </div>
                </div>

                {activeSubPopup === 'checkin' && <Checkin onClose={handleCloseSubPopup} prefillRack={rack.id} />}
                {activeSubPopup === 'checkout' && <Checkout onClose={handleCloseSubPopup} prefillRack={rack.id} />}
                {activeSubPopup === 'defective' && <Defective onClose={handleCloseSubPopup} prefillRack={rack.id} />}
            </div>
        </div>
    );
};

export default RackDetailsModal;