import React, { useState, useEffect, useRef, useContext } from 'react';
import { ReportStateContext } from './LocalStorageContext';
import JsBarcode from 'jsbarcode';
import './RackDetailsModal_Admin.css';
import Checkin from './checkin';
import Checkout from './checkout';
import Defective from './defective';

const expandSerialString = (serialStr) => {
    if (!serialStr) return [];
    const parts = serialStr.split(',').map(s => s.trim()).filter(s => s);
    let result = [];
    parts.forEach(part => {
        const rangeMatch = part.match(/^(\D*)(\d+)\s*-\s*(\D*)(\d+)$/);
        if (rangeMatch) {
            const prefix = rangeMatch[1] || "";
            const start = parseInt(rangeMatch[2], 10);
            const end = parseInt(rangeMatch[4], 10);
            const numLen = rangeMatch[2].length;
            if (end >= start && (end - start) < 5000) {
                for (let i = start; i <= end; i++) {
                    result.push(`${prefix}${String(i).padStart(numLen, '0')}`);
                }
            } else { result.push(part); }
        } else { result.push(part); }
    });
    return result;
};

const consolidateSerialRanges = (serialInput) => {
    if (!serialInput) return "";
    let parts = Array.isArray(serialInput) ? serialInput : serialInput.split(',').map(s => s.trim()).filter(s => s !== "");
    let ranges = [];
    parts.forEach(part => {
        const rangeMatch = part.match(/^(\D*)(\d+)\s*-\s*(\D*)(\d+)$/);
        const singleMatch = part.match(/^(\D*)(\d+)$/);
        if (rangeMatch) {
            ranges.push({ prefix: rangeMatch[1] || "", start: parseInt(rangeMatch[2], 10), end: parseInt(rangeMatch[4], 10) });
        } else if (singleMatch) {
            const num = parseInt(singleMatch[2], 10);
            ranges.push({ prefix: singleMatch[1] || "", start: num, end: num });
        } else { ranges.push({ original: part, isCustom: true, start: 999999999 }); }
    });
    ranges.sort((a, b) => a.start - b.start);
    const merged = [];
    if (ranges.length > 0) {
        let current = ranges[0];
        for (let i = 1; i < ranges.length; i++) {
            const next = ranges[i];
            if (current.isCustom || next.isCustom) { merged.push(current); current = next; continue; }
            if (current.prefix === next.prefix && next.start <= current.end + 1) {
                current.end = Math.max(current.end, next.end);
            } else { merged.push(current); current = next; }
        }
        merged.push(current);
    }
    return merged.map(r => {
        if (r.isCustom) return r.original;
        if (r.start === r.end) return `${r.prefix}${r.start}`;
        return `${r.prefix}${r.start} - ${r.prefix}${r.end}`;
    }).join(', ');
};

const getSerialStartNumber = (serialStr) => {
    if (!serialStr) return Infinity;
    const match = serialStr.toString().match(/(\d+)/);
    return match ? parseInt(match[0], 10) : Infinity;
};

const createEmptyBeams = () => [
    { id: 'Beam A', itemName: '', qty: '', threshold: '100' },
    { id: 'Beam B', itemName: '', qty: '', threshold: '100' },
    { id: 'Beam C', itemName: '', qty: '', threshold: '100' },
    { id: 'Beam D', itemName: '', qty: '', threshold: '100' },
    { id: 'Beam E', itemName: '', qty: '', threshold: '100' },
];

const STATUS_COLORS = {
    'nearly full': '#007BFF', 
    'normal': '#28A745',
    'low': '#FFC107',
    'empty': '#DC3545',
    'default': '#E9ECEF'
};

const ExchangeModal = ({ sourceRackId, allRackIds, rackDetails, onClose, onConfirm }) => {
    const [targetRack, setTargetRack] = useState('');
    const [previewItems, setPreviewItems] = useState([]);

    const destinationOptions = allRackIds.filter(id => id !== sourceRackId).sort();

    useEffect(() => {
        if (targetRack && rackDetails[targetRack]) {
            const beams = rackDetails[targetRack].beams || [];
            const items = beams.filter(b => b.itemName && b.itemName.trim() !== '');
            setPreviewItems(items);
        } else {
            setPreviewItems([]);
        }
    }, [targetRack, rackDetails]);

    const handleConfirm = () => {
        if (!targetRack) return;
        onConfirm(targetRack);
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000
        }}>
            <div style={{ backgroundColor: 'white', padding: '25px', borderRadius: '8px', width: '450px', boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>
                <h3 style={{ marginTop: 0, color: '#6f42c1', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <ion-icon name="swap-horizontal-outline"></ion-icon> Exchange Contents
                </h3>
                
                <p style={{fontSize: '14px', color: '#666', marginBottom: '20px'}}>
                    Swap all items between <strong>{sourceRackId}</strong> and the selected rack.
                </p>

                <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Select Target Rack:</label>
                    <select 
                        style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }}
                        onChange={(e) => setTargetRack(e.target.value)}
                        value={targetRack}
                    >
                        <option value="">-- Choose Rack to Swap With --</option>
                        {destinationOptions.map(rackId => (
                            <option key={rackId} value={rackId}>{rackId}</option>
                        ))}
                    </select>
                </div>

                <div style={{ marginBottom: '20px', background: '#f8f9fa', padding: '10px', borderRadius: '4px', border: '1px solid #eee', minHeight: '80px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#888', display: 'block', marginBottom: '5px' }}>
                        Contents of Target ({targetRack || 'None'}):
                    </label>
                    {targetRack ? (
                        previewItems.length > 0 ? (
                            <ul style={{ paddingLeft: '20px', margin: 0, fontSize: '13px' }}>
                                {previewItems.map((item, idx) => (
                                    <li key={idx}><strong>{item.itemName}</strong> (Qty: {item.qty})</li>
                                ))}
                            </ul>
                        ) : (
                            <span style={{ fontSize: '13px', color: '#999', fontStyle: 'italic' }}>Rack is empty</span>
                        )
                    ) : (
                        <span style={{ fontSize: '13px', color: '#ccc' }}>Select a rack to preview items</span>
                    )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button onClick={onClose} style={{ padding: '8px 15px', border: '1px solid #ccc', background: 'white', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                    <button 
                        onClick={handleConfirm} 
                        disabled={!targetRack}
                        style={{ 
                            padding: '8px 15px', 
                            border: 'none', 
                            background: targetRack ? '#6f42c1' : '#ccc', 
                            color: 'white', 
                            borderRadius: '4px', 
                            cursor: targetRack ? 'pointer' : 'not-allowed' 
                        }}
                    >
                        Confirm Exchange
                    </button>
                </div>
            </div>
        </div>
    );
};

const SearchableDropdown = ({ value, onChange, options }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState(value);
    const wrapperRef = useRef(null);

    useEffect(() => { setSearchTerm(value); }, [value]);

    useEffect(() => {
        function handleClickOutside(event) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setIsOpen(false);
                if (searchTerm !== value) onChange(searchTerm.trim());
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [wrapperRef, searchTerm, value, onChange]);

    const filteredOptions = options.filter(opt =>
        opt.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="Rack-Details-Modal-admin-dropdown-wrapper" ref={wrapperRef} style={{ position: 'relative', width: '100%' }}>
            <div className="Rack-Details-Modal-admin-input-group" onClick={() => setIsOpen(!isOpen)} style={{ width: '100%' }}>
                <input
                    type="text"
                    className="Rack-Details-Modal-admin-dropdown-input"
                    placeholder="Select Item..."
                    value={searchTerm}
                    onChange={(e) => { setSearchTerm(e.target.value); setIsOpen(true); onChange(e.target.value); }}
                    onFocus={() => setIsOpen(true)}
                    onBlur={() => onChange(searchTerm.trim())}
                    style={{ width: '100%' }}
                />
                <span className="Rack-Details-Modal-admin-dropdown-arrow">
                    <ion-icon name={isOpen ? "caret-up-outline" : "caret-down-outline"}></ion-icon>
                </span>
            </div>
            {isOpen && (
                <ul className="Rack-Details-Modal-admin-dropdown-list" style={{
                    maxHeight: '200px', overflowY: 'auto', position: 'absolute', width: '100%',
                    backgroundColor: 'white', border: '1px solid #ccc', zIndex: 1000,
                    listStyle: 'none', padding: 0, margin: 0, top: '100%', left: 0
                }}>
                    {filteredOptions.length > 0 ? (
                        filteredOptions.map((opt, idx) => (
                            <li key={idx}
                                onClick={() => { onChange(opt); setSearchTerm(opt); setIsOpen(false); }}
                                style={{ padding: '8px', cursor: 'pointer', borderBottom: '1px solid #eee' }}
                                onMouseOver={(e) => e.target.style.backgroundColor = '#f0f0f0'}
                                onMouseOut={(e) => e.target.style.backgroundColor = 'white'}
                            >
                                {opt}
                            </li>
                        ))
                    ) : (
                        <li className="Rack-Details-Modal-admin-no-options" style={{ padding: '8px', color: '#999' }}>No items found</li>
                    )}
                </ul>
            )}
        </div>
    );
};

const RackDetailsModal_Admin = ({ rack, onClose }) => {
    const context = useContext(ReportStateContext);
    const itemData = context ? context.itemData : [];
    const rackDetails = context ? context.rackDetails : {};
    const updateRackData = context ? context.updateRackData : () => { };
    const updateMultipleRacks = context ? context.updateMultipleRacks : () => { };
    
    // --- GRAB NEW TRANSACTION STATE ---
    const isTransactionActive = context ? context.isTransactionActive : false;
    
    const barcodeRef = useRef(null);
    const [activeSubPopup, setActiveSubPopup] = useState(null);
    const [beams, setBeams] = useState([]);
    const initialBeamsState = useRef([]);
    const [carouselIndex, setCarouselIndex] = useState(0);
    const [itemOptions, setItemOptions] = useState([]);
    const [qtyError, setQtyError] = useState(null);
    const [saveError, setSaveError] = useState(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (rack && barcodeRef.current) {
            JsBarcode(barcodeRef.current, rack.id, {
                format: "CODE128", width: 1.5, height: 40, displayValue: false, margin: 0
            });
        }
    }, [rack]);

    useEffect(() => {
        if (itemData.length > 0) {
            let lockedCategory = null;
            for (const beam of beams) {
                const name = (beam.itemName || "").trim();
                if (name) {
                    const foundItem = itemData.find(i => i.name === name);
                    if (foundItem && foundItem.cat) {
                        lockedCategory = foundItem.cat;
                        break; 
                    }
                }
            }
            let availableItems = itemData;
            if (lockedCategory) {
                availableItems = itemData.filter(i => i.cat === lockedCategory);
            }
            const names = availableItems.map(item => item.name).filter(n => n);
            setItemOptions([...new Set(names)]);
        }
    }, [itemData, beams]); 

    useEffect(() => {
        if (rack && rackDetails[rack.id]) {
            const deepCopyBeams = JSON.parse(JSON.stringify(rackDetails[rack.id].beams));
            setBeams(deepCopyBeams);
            initialBeamsState.current = JSON.parse(JSON.stringify(deepCopyBeams));
        } else {
            const emptyBeams = createEmptyBeams();
            setBeams(emptyBeams);
            initialBeamsState.current = emptyBeams;
        }
        setQtyError(null);
        setSaveError(null);
    }, [rack, rackDetails]);

    if (!rack) return null;

    const handleBeamChange = (index, field, value) => {
        if ((field === 'qty' || field === 'threshold') && value < 0) return;
        setQtyError(null);
        setSaveError(null);
        const newBeams = [...beams];
        newBeams[index] = { ...newBeams[index], [field]: value };
        setBeams(newBeams);
    };

    const handleClearRow = (index) => {
        const newBeams = [...beams];
        newBeams[index] = { ...newBeams[index], itemName: '', qty: '', threshold: '' };
        setBeams(newBeams);
        setQtyError(null);
        setSaveError(null);
    };

    const handleRemoveRow = (index) => {
        const beamToDelete = beams[index];
        if ((beamToDelete.itemName && beamToDelete.itemName.trim() !== '') || (parseInt(beamToDelete.qty) || 0) > 0) {
            setSaveError(`Cannot delete "${beamToDelete.id}" because it contains items. Please clear the row first.`);
            return;
        }
        const sortedBeams = [...beams].sort((a, b) =>
            a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' })
        );
        const lastBeam = sortedBeams[sortedBeams.length - 1];
        if (beamToDelete.id !== lastBeam.id) {
            setSaveError(`Cannot delete "${beamToDelete.id}" while "${lastBeam.id}" exists. Please delete the bottom-most beam first.`);
            return;
        }
        const newBeams = beams.filter((_, i) => i !== index);
        setBeams(newBeams);
        setQtyError(null);
        setSaveError(null);
    };

    const handleAddBeam = () => {
        setSaveError(null);
        let charCode = 65; 
        let nextId = "";
        while (true) {
            const candidateId = "Beam " + String.fromCharCode(charCode);
            const exists = beams.some(b => b.id === candidateId);
            if (!exists) {
                nextId = candidateId;
                break;
            }
            charCode++;
            if (charCode > 122) {
                nextId = "Beam " + (beams.length + 1); 
                break;
            }
        }
        setBeams([...beams, { id: nextId, itemName: '', qty: '', threshold: '' }]);
    };

    const handleCloseSubPopup = () => {
        setActiveSubPopup(null);
    };

    const executeExchange = async (targetRackId) => {
        setIsSaving(true);
        setActiveSubPopup(null);

        try {
            const sourceBeams = [...beams];
            const targetRackData = rackDetails[targetRackId];
            const targetBeams = targetRackData && targetRackData.beams 
                ? JSON.parse(JSON.stringify(targetRackData.beams)) 
                : createEmptyBeams();

            const newSourceBeams = targetBeams;
            const newTargetBeams = sourceBeams;

            const calculateStats = (bList) => {
                let total = 0, thresh = 0;
                bList.forEach(b => { 
                    total += parseInt(b.qty)||0; 
                    thresh += parseInt(b.threshold)||0; 
                });
                const occ = thresh > 0 ? Math.round((total/thresh)*100) : 0;
                let status = 'default';
                const hasItems = bList.some(b => b.itemName && b.itemName.trim() !== '');
                if (hasItems) {
                    if (occ === 0) status = 'empty';
                    else if (occ < 40) status = 'low';
                    else if (occ < 90) status = 'normal';
                    else status = 'nearly full';
                }
                return { occupancyPercentage: occ, status };
            };

            const sourceStats = calculateStats(newSourceBeams);
            const targetStats = calculateStats(newTargetBeams);

            const sourceLog = [{
                name: "All Items", model: "-", cat: "Batch", serialNum: "Full Exchange", qty: 0,
                transactionType: `Exchanged contents with ${targetRackId}`
            }];

            const targetLog = [{
                name: "All Items", model: "-", cat: "Batch", serialNum: "Full Exchange", qty: 0,
                transactionType: `Exchanged contents with ${rack.id}`
            }];

            const updates = [
                { rackId: rack.id, data: { beams: newSourceBeams, ...sourceStats }, logs: sourceLog },
                { rackId: targetRackId, data: { beams: newTargetBeams, ...targetStats }, logs: targetLog }
            ];

            setBeams(newSourceBeams); 
            await updateMultipleRacks(updates);

            setIsSaving(false);
            onClose(); 

        } catch (err) {
            console.error("Exchange failed", err);
            setSaveError("An error occurred during exchange.");
            setIsSaving(false);
        }
    };

    let totalQty = 0;
    let totalThreshold = 0;
    const totalItems = beams.filter(b => b.itemName !== '').length;

    beams.forEach(b => {
        totalQty += parseInt(b.qty) || 0;
        totalThreshold += parseInt(b.threshold) || 0;
    });

    const occupancyPercentage = totalThreshold > 0 ? Math.min(Math.round((totalQty / totalThreshold) * 100), 100) : 0;

    const handleSave = async () => {
        if (isSaving) return;
        setSaveError(null);
        setQtyError(null);

        const categoriesFound = new Set();

        for (const [index, beam] of beams.entries()) {
            const name = (beam.itemName || "").trim();
            if (name) {
                if (beam.qty === '' || beam.qty == null) {
                    setSaveError(` Error on row ${index + 1} ("${name}"): Current Qty is required.`);
                    return; 
                }
                if (beam.threshold === '' || beam.threshold == null) {
                    setSaveError(` Error on row ${index + 1} ("${name}"): Beam Capacity is required.`);
                    return; 
                }
                const item = itemData.find(i => i.name === name);
                if (item && item.cat) {
                    categoriesFound.add(item.cat);
                }
            }
        }

        if (categoriesFound.size > 1) {
            setSaveError(` Mixed categories detected (${Array.from(categoriesFound).join(', ')}). A rack can only contain items of the same category.`);
            return;
        }

        for (const beam of beams) {
            const q = parseInt(beam.qty) || 0;
            const t = parseInt(beam.threshold) || 0;
            if (t > 0 && q > t) {
                setSaveError(` Error on "${beam.itemName || beam.id}": Qty (${q}) exceeds Limit (${t}).`);
                return;
            }
        }

        setIsSaving(true);
        const logs = [];
        const previousBeams = initialBeamsState.current;
        const changes = {};

        const prevTotals = {};
        previousBeams.forEach(b => {
            const name = (b.itemName || "").trim().toLowerCase();
            if (name) prevTotals[name] = (prevTotals[name] || 0) + (parseInt(b.qty) || 0);
        });

        const currTotals = {};
        beams.forEach(b => {
            const name = (b.itemName || "").trim().toLowerCase();
            const realName = b.itemName.trim();
            if (name) {
                currTotals[name] = (currTotals[name] || 0) + (parseInt(b.qty) || 0);
                if (!changes[name]) changes[name] = { realName: realName, addedQty: 0 };
            }
        });

        Object.keys(currTotals).forEach(name => {
            const currentQ = currTotals[name];
            const prevQ = prevTotals[name] || 0;
            const delta = currentQ - prevQ;
            if (delta > 0) changes[name].addedQty = delta;
        });

        for (const [normName, data] of Object.entries(changes)) {
            const { realName, addedQty } = data;
            
            if (addedQty > 0) {
                const allBatches = itemData.filter(i => i.name.toLowerCase() === normName);

                if (allBatches.length === 0) {
                    setSaveError(`Item "${realName}" does not exist in Master Inventory.`);
                    setIsSaving(false);
                    return;
                }

                allBatches.sort((a, b) => {
                    const startA = getSerialStartNumber(a.serialNum);
                    const startB = getSerialStartNumber(b.serialNum);
                    if (startA !== Infinity && startB !== Infinity) {
                        return startA - startB;
                    }
                    const dateA = new Date(a.dateAdded || a.createdAt || 0).getTime();
                    const dateB = new Date(b.dateAdded || b.createdAt || 0).getTime();
                    return dateA - dateB;
                });

                const totalMasterQty = allBatches.reduce((sum, batch) => sum + (parseInt(batch.qty) || 0), 0);
                
                let usedInOtherRacks = 0;
                Object.entries(rackDetails).forEach(([rId, rData]) => {
                    if (rId === rack.id) return;
                    if (rData.beams) {
                        rData.beams.forEach(b => {
                            if ((b.itemName || "").trim().toLowerCase() === normName) {
                                usedInOtherRacks += (parseInt(b.qty) || 0);
                            }
                        });
                    }
                });

                let usedInThisRackPreviously = prevTotals[normName] || 0;
                const totalInForm = currTotals[normName] || 0;
                const availableForThisRack = totalMasterQty - usedInOtherRacks;

                if (totalInForm > availableForThisRack) {
                    setSaveError(`Error on "${realName}": Exceeds Master Inventory Limit (Avail: ${availableForThisRack}, Req: ${totalInForm}).`);
                    setIsSaving(false);
                    return;
                }

                let calculatedSerialLog = "Qty Update";
                let globalSerialList = [];
                allBatches.forEach(batch => {
                    if(batch.serialNum) {
                        globalSerialList = globalSerialList.concat(expandSerialString(batch.serialNum));
                    }
                });

                if (globalSerialList.length > 0) {
                    const startIndex = usedInOtherRacks + usedInThisRackPreviously;
                    const endIndex = startIndex + addedQty;

                    if (startIndex < globalSerialList.length) {
                        const myBatch = globalSerialList.slice(startIndex, Math.min(endIndex, globalSerialList.length));
                        
                        if (myBatch.length > 0) {
                            calculatedSerialLog = consolidateSerialRanges(myBatch.join(', '));
                        } else {
                            calculatedSerialLog = "No Serials Rem.";
                        }
                    } else {
                         calculatedSerialLog = "No Serials Rem.";
                    }
                }

                const metaBatch = allBatches[0]; 

                logs.push({
                    name: metaBatch.name,
                    model: metaBatch.model || "N/A",
                    cat: metaBatch.cat || "N/A",
                    serialNum: calculatedSerialLog, 
                    qty: addedQty,
                    transactionType: "Slotted"
                });
            }
        }

        let status = 'default';
        if (totalItems > 0) {
            if (occupancyPercentage === 0) status = 'empty';
            else if (occupancyPercentage < 40) status = 'low';
            else if (occupancyPercentage < 90) status = 'normal';
            else status = 'nearly full';
        }

        const cleanBeams = beams.map(b => ({ ...b, itemName: (b.itemName || "").trim() }));
        const dataToSave = { beams: cleanBeams, occupancyPercentage, status };

        const result = await updateRackData(rack.id, dataToSave, logs);
        if (result && result.success === false) {
            setSaveError(result.message);
            setIsSaving(false);
            return;
        }

        setTimeout(() => {
            onClose();
            setIsSaving(false);
        }, 100);
    };

    const carouselItems = beams.map(beam => {
        const item = itemData.find(i => i.name === beam.itemName);
        if (item && item.image) return { image: item.image, name: item.name };
        return null;
    }).filter(item => item !== null);

    const nextImage = () => setCarouselIndex((prev) => (prev + 1) % carouselItems.length);
    const prevImage = () => setCarouselIndex((prev) => (prev - 1 + carouselItems.length) % carouselItems.length);
    const currentCarouselItem = carouselItems[carouselIndex] || {};

    // --- BTN HELPER STYLES ---
    const actionBtnStyle = (enabled, isCancel = false) => ({
        flex: 1, 
        backgroundColor: enabled ? (isCancel ? 'white' : '#007bff') : '#cccccc',
        color: enabled ? (isCancel ? '#dc3545' : 'white') : '#888888',
        border: enabled && isCancel ? '1px solid #dc3545' : 'none',
        padding: '10px', borderRadius: '5px', cursor: enabled ? 'pointer' : 'not-allowed', 
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
    });

    return (
        <div className="Rack-Details-Modal-admin-backdrop" onClick={onClose}>
            <div className="Rack-Details-Modal-admin-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '1200px', width: '95%' }}>
                <div className="Rack-Details-Modal-admin-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '30px' }}>
                        <div>
                            <h2 className="Rack-Details-Modal-admin-title">{rack.id}</h2>
                            <span style={{ color: '#666', fontSize: '14px' }}>{rack.area}</span>
                        </div>
                        <div className="Rack-Details-Modal-admin-barcode-wrapper" style={{ background: '#fff', padding: '5px', borderRadius: '4px', border: '1px solid #eee' }}>
                            <canvas ref={barcodeRef}></canvas>
                        </div>
                    </div>
                    <div>
                        <button
                            type="button"
                            className="Rack-Details-Modal-admin-save-btn"
                            onClick={handleSave}
                            disabled={isSaving}
                            style={{ opacity: isSaving ? 0.6 : 1, cursor: isSaving ? 'not-allowed' : 'pointer' }}
                        >
                            {isSaving ? 'Saving...' : 'Save Changes'}
                        </button>
                        <button className="Rack-Details-Modal-admin-close-btn" onClick={onClose}>&times;</button>
                    </div>
                </div>

                <div className="Rack-Details-Modal-admin-body">
                    <div className="Rack-Details-Modal-admin-left">
                        <h3 className="Rack-Details-Modal-admin-section-title">Rack Front View</h3>

                        {qtyError && qtyError.index === -1 && (
                            <div style={{ backgroundColor: '#ffebee', color: '#c62828', padding: '10px', borderRadius: '4px', marginBottom: '10px', fontSize: '13px', fontWeight: 'bold' }}>
                                {qtyError.message}
                            </div>
                        )}

                        {saveError && (
                            <div style={{ backgroundColor: '#fdeded', color: '#5f2120', padding: '12px', marginBottom: '15px', border: '1px solid #f5c6cb', borderRadius: '4px', fontSize: '14px', fontWeight: 'bold' }}>
                                ⚠️   {saveError}
                            </div>
                        )}

                        <div className="Rack-Details-Modal-admin-row-header">
                            <span className="col-name"></span>
                            <span className="col-item">Item Name</span>
                            <span className="col-qty">Current Qty</span>
                            <span className="col-thresh">Beam Capacity</span>
                            <span className="col-remove">Action</span>
                        </div>

                        <div className="Rack-Details-Modal-admin-beam-list-scrollable" style={{ maxHeight: '350px', overflowY: 'auto' }}>
                            <div className="Rack-Details-Modal-admin-beam-list">
                                {beams.map((beam, index) => {
                                    const isError = qtyError && qtyError.index === index;
                                    let statusColor = STATUS_COLORS['default'];

                                    if (beam.itemName && beam.itemName.trim() !== '') {
                                        const globalItem = itemData.find(i => i.name === beam.itemName.trim());
                                        if (globalItem) {
                                            const totalGlobalQty = parseInt(globalItem.qty) || 0;
                                            const minThreshold = parseInt(globalItem.min_threshold) || 5; 
                                            if (totalGlobalQty === 0) statusColor = STATUS_COLORS['empty']; 
                                            else if (totalGlobalQty <= minThreshold) statusColor = STATUS_COLORS['low']; 
                                            else statusColor = STATUS_COLORS['normal']; 
                                        }
                                    }

                                    return (
                                        <React.Fragment key={index}>
                                            <div className="Rack-Details-Modal-admin-beam-row" style={{
                                                position: 'relative', zIndex: beams.length - index, display: 'flex', alignItems: 'center', gap: '12px'
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', width: '80px', flexShrink: 0 }}>
                                                    <div style={{ width: '14px', height: '14px', backgroundColor: statusColor, marginRight: '8px', borderRadius: '3px', border: '1px solid #ccc' }}></div>
                                                    <span className="Rack-Details-Modal-admin-beam-label">{beam.id}</span>
                                                </div>
                                                <div className="Rack-Details-Modal-admin-input-container-wide" style={{ flex: 1 }}>
                                                    <SearchableDropdown
                                                        value={beam.itemName}
                                                        options={itemOptions}
                                                        onChange={(val) => handleBeamChange(index, 'itemName', val)}
                                                    />
                                                </div>
                                                <div className="Rack-Details-Modal-admin-input-group-qty-thresh" style={{ display: 'flex', alignItems: 'center', gap: '5px', width: '160px', flexShrink: 0 }}>
                                                    <input
                                                        type="number" min="0" className="Rack-Details-Modal-admin-input-qty"
                                                        style={{ border: isError ? '2px solid red' : '1px solid #ccc', width: '60px' }}
                                                        value={beam.qty} onChange={(e) => handleBeamChange(index, 'qty', e.target.value)}
                                                    />
                                                    <span className="Rack-Details-Modal-admin-slash">/</span>
                                                    <input type="number" min="0" className="Rack-Details-Modal-admin-input-thresh"
                                                        style={{ width: '60px' }}
                                                        value={beam.threshold} onChange={(e) => handleBeamChange(index, 'threshold', e.target.value)} />
                                                </div>
                                                <div className="Rack-Details-Modal-admin-action-container" style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '80px', justifyContent: 'flex-end' }}>
                                                    <button onClick={() => handleClearRow(index)} style={{ background: '#f8f9fa', border: '1px solid #ced4da', borderRadius: '4px', padding: '6px', color: '#6c757d', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Clear Content">
                                                        <ion-icon name="backspace-outline" style={{ fontSize: '18px' }}></ion-icon>
                                                    </button>
                                                    <button onClick={() => handleRemoveRow(index)} style={{ background: '#fff5f5', border: '1px solid #ffc9c9', color: '#dc3545', borderRadius: '4px', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Delete Row">
                                                        <ion-icon name="trash-outline" style={{ fontSize: '18px' }}></ion-icon>
                                                    </button>
                                                </div>
                                            </div>
                                        </React.Fragment>
                                    );
                                })}
                            </div>
                        </div>

                        <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'center' }}>
                            <button className="Rack-Details-Modal-admin-add-beam-btn" onClick={handleAddBeam}>
                                <ion-icon name="add-outline" style={{ fontSize: '18px' }}></ion-icon>
                            </button>
                        </div>

                        <div style={{ marginTop: '20px', display: 'flex', gap: '10px', paddingTop: '15px', borderTop: '1px solid #eee' }}>
                            <button 
                                onClick={() => isTransactionActive ? setActiveSubPopup('checkin') : alert('Please start a transaction in the map first.')} 
                                style={actionBtnStyle(isTransactionActive)}
                                disabled={!isTransactionActive}
                                title={!isTransactionActive ? "Start a transaction first" : ""}
                            >
                                <ion-icon name="cloud-download-outline"></ion-icon> Check-in
                            </button>
                            
                            <button 
                                onClick={() => isTransactionActive ? setActiveSubPopup('checkout') : alert('Please start a transaction in the map first.')} 
                                style={actionBtnStyle(isTransactionActive, true)}
                                disabled={!isTransactionActive}
                                title={!isTransactionActive ? "Start a transaction first" : ""}
                            >
                                <ion-icon name="cloud-upload-outline"></ion-icon> Check-Out
                            </button>
                            
                            <button 
                                onClick={() => isTransactionActive ? setActiveSubPopup('exchange') : alert('Please start a transaction in the map first.')} 
                                style={{ flex: 1, backgroundColor: isTransactionActive ? '#6f42c1' : '#cccccc', color: 'white', border: 'none', padding: '10px', borderRadius: '5px', cursor: isTransactionActive ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                                disabled={!isTransactionActive}
                                title={!isTransactionActive ? "Start a transaction first" : ""}
                            >
                                <ion-icon name="swap-horizontal-outline"></ion-icon> Exchange
                            </button>

                            <button onClick={() => setActiveSubPopup('defective')} style={{ width: '50px', backgroundColor: 'white', color: '#6c757d', border: '1px solid #6c757d', padding: '10px', borderRadius: '5px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <ion-icon name="trash-outline" style={{ fontSize: '1.2rem' }}></ion-icon>
                            </button>
                        </div>
                    </div>

                    <div className="Rack-Details-Modal-admin-right">
                        <h3 className="Rack-Details-Modal-admin-section-title">Rack Information</h3>
                        <div className="Rack-Details-Modal-admin-info-group">
                            <div className="Rack-Details-Modal-admin-info-header">
                                <span>Occupancy</span>
                                <span>{occupancyPercentage}%</span>
                            </div>
                            <div className="Rack-Details-Modal-admin-progress-bg">
                                <div className="Rack-Details-Modal-admin-progress-fill" style={{ width: `${occupancyPercentage}%` }}></div>
                            </div>
                        </div>
                        <div className="Rack-Details-Modal-admin-info-row">
                            <span>Total Items</span>
                            <span className="Rack-Details-Modal-admin-bold">{totalItems}</span>
                        </div>

                        <h3 className="Rack-Details-Modal-admin-section-title mt-large">Items Preview</h3>
                        <div className="Rack-Details-Modal-admin-carousel-container">
                            {carouselItems.length > 0 ? (
                                <>
                                    <img src={currentCarouselItem.image} alt={currentCarouselItem.name} className="Rack-Details-Modal-admin-carousel-image" />
                                    <p className="Rack-Details-Modal-admin-item-label">{currentCarouselItem.name}</p>
                                    {carouselItems.length > 1 && (
                                        <>
                                            <button className="carousel-btn prev-btn" onClick={prevImage}><ion-icon name="chevron-back-outline"></ion-icon></button>
                                            <button className="carousel-btn next-btn" onClick={nextImage}><ion-icon name="chevron-forward-outline"></ion-icon></button>
                                            <div className="carousel-counter">{carouselIndex + 1} / {carouselItems.length}</div>
                                        </>
                                    )}
                                </>
                            ) : (
                                <div className="Rack-Details-Modal-admin-no-image">
                                    <ion-icon name="images-outline" style={{ fontSize: '48px', color: '#ccc' }}></ion-icon>
                                    <p>No images configured</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {activeSubPopup === 'checkin' && <Checkin onClose={handleCloseSubPopup} prefillRack={rack.id} />}
                {activeSubPopup === 'checkout' && <Checkout onClose={handleCloseSubPopup} prefillRack={rack.id} />}
                {activeSubPopup === 'defective' && <Defective onClose={handleCloseSubPopup} prefillRack={rack.id} />}
                
                {activeSubPopup === 'exchange' && (
                    <ExchangeModal 
                        sourceRackId={rack.id}
                        allRackIds={Object.keys(rackDetails)}
                        rackDetails={rackDetails}
                        onClose={handleCloseSubPopup}
                        onConfirm={executeExchange}
                    />
                )}
            </div>
        </div>
    );
};

export default RackDetailsModal_Admin;