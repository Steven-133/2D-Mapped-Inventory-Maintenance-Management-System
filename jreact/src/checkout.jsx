import React, { useState, useContext, useEffect, useRef } from 'react';
import './checkout.css';
import { ReportStateContext } from './LocalStorageContext';

// --- ICONS ---
const IconScan = ({ size = 24, color = 'currentColor' }) => (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" /></svg>);
const IconPackage = ({ size = 24, color = 'currentColor' }) => (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16.5 9.4 7.5 4.21" /><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>);
const IconX = ({ size = 24, color = 'currentColor' }) => (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>);
const IconCheckBig = () => (<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#2e7d32" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>);
const IconAlert = () => (<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#c62828" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>);
const IconList = () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>);

const StepIndicator = ({ step, isActive }) => (
  <div className={`check-out-popup-step-indicator check-out-popup-font-urbanist ${isActive ? 'check-out-popup-step-active' : 'check-out-popup-step-inactive'}`}>{`Step ${step}`}</div>
);

const ScanButton = ({ icon: Icon, size, onClick, description }) => (
  <button className="check-out-popup-scan-button" onClick={onClick} aria-label={description}><Icon size={size} color="white" /></button>
);

const Checkout = ({ onClose, prefillRack }) => {
  const { handleCheckOut, itemData, rackDetails } = useContext(ReportStateContext);
  const [activeStep, setActiveStep] = useState(1);
  const [inputs, setInputs] = useState({ rack: '', sku: '' });
  const [successData, setSuccessData] = useState(null);
  const [errorData, setErrorData] = useState(null);
  
  // --- NEW: State for "Step 3" (Ambiguity Resolution) ---
  const [ambiguousItems, setAmbiguousItems] = useState([]); 

  // --- REFS FOR AUTO-FOCUS ---
  const rackRef = useRef(null);
  const itemRef = useRef(null);

  // --- AUTO SUBMIT STATE ---
  const [countdown, setCountdown] = useState(0);
  const [autoSubmitTimer, setAutoSubmitTimer] = useState(null);
  const [successCountdown, setSuccessCountdown] = useState(3);

  // --- 1. INITIAL FOCUS ---
  useEffect(() => {
    if (prefillRack) {
        setInputs(prev => ({ ...prev, rack: prefillRack }));
        setActiveStep(2);
        setTimeout(() => itemRef.current?.focus(), 100);
    } else {
        setTimeout(() => rackRef.current?.focus(), 100);
    }
  }, [prefillRack]);

  // --- 2. AUTO NEXT LOGIC ---
  useEffect(() => {
    if (activeStep === 1 && inputs.rack.length > 0) {
        const timer = setTimeout(() => {
            setActiveStep(2);
            itemRef.current?.focus();
        }, 1000); 
        return () => clearTimeout(timer);
    }

    // SKU -> Auto Submit
    if (inputs.rack && inputs.sku && activeStep === 2) {
        if (autoSubmitTimer) clearTimeout(autoSubmitTimer);
        setCountdown(2);
        
        const timer = setTimeout(() => {
            handleScanAttempt();
        }, 2000);

        const interval = setInterval(() => {
            setCountdown((prev) => prev - 1);
        }, 1000);

        setAutoSubmitTimer(timer);

        return () => {
            clearTimeout(timer);
            clearInterval(interval);
            setCountdown(0);
        };
    }
  }, [inputs, activeStep]);

  // --- 3. AUTO SUCCESS RESET LOGIC ---
  useEffect(() => {
    let timer;
    if (successData) {
      setSuccessCountdown(3); 
      timer = setInterval(() => {
        setSuccessCountdown(prev => {
          if (prev <= 1) {
            handleSuccessClose(); 
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [successData]);

  const handleChange = (e) => {
      setInputs({ ...inputs, [e.target.name]: e.target.value });
      setCountdown(0); 
  };
  
  const handleFocus = (step) => setActiveStep(step);
  const handleBlur = () => {};

  const handleKeyDown = (e, nextStep, nextRef) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        if (nextRef && nextRef.current) {
            setActiveStep(nextStep);
            nextRef.current.focus();
        } else {
            handleScanAttempt();
        }
    }
  };

  const superNormalize = (val) => {
      if (val === null || val === undefined) return '';
      return String(val).toLowerCase().replace(/[^a-z0-9]/g, '');
  };

  const checkSmartMatch = (dbValue, scanValue) => {
      const dbNorm = superNormalize(dbValue);
      const scanNorm = superNormalize(scanValue);
      if (dbNorm.includes(scanNorm) || scanNorm.includes(dbNorm)) return true;
      return false;
  };

  // --- CORE LOGIC: CHECK WHAT WAS SCANNED ---
  const handleScanAttempt = () => {
    if (autoSubmitTimer) clearTimeout(autoSubmitTimer);

    if (!inputs.sku || !inputs.rack) {
        setErrorData("Please fill in Rack and SKU.");
        return;
    }

    const inputIdentifier = superNormalize(inputs.sku);
    
    // Helpers
    const isValidItem = (i) => {
        const badStatuses = ['consumed', 'defective', 'missing', 'out', 'archived'];
        const currentStatus = (i.status || '').toLowerCase();
        return !badStatuses.some(bad => currentStatus.includes(bad));
    };
    const isRackMatch = (i) => {
        const rawRack = i.rack_loc || i.rack || "Unplaced";
        const isUnplaced = rawRack === "Unplaced";
        return isUnplaced || checkSmartMatch(rawRack, inputs.rack);
    };

    // 1. Check for EXACT SERIAL match first (Scenario: User scanned specific box)
    const exactSerialMatch = itemData.find(i => 
        superNormalize(i.serialNum) === inputIdentifier && 
        isRackMatch(i) && 
        isValidItem(i)
    );

    if (exactSerialMatch) {
        // Perfect! No ambiguity. User scanned the exact unit.
        performCheckout(exactSerialMatch, "Exact Serial Scan");
        return;
    }

    // 2. If no serial match, check for SKU matches
    const skuMatches = itemData.filter(i => {
        const modelNorm = superNormalize(i.model);
        const nameNorm = superNormalize(i.name);
        const idNorm = superNormalize(i.id);
        return (modelNorm === inputIdentifier || nameNorm === inputIdentifier || idNorm === inputIdentifier) && 
               isRackMatch(i) && 
               isValidItem(i);
    }).sort((a, b) => new Date(a.date_added || a.dateAdded || 0) - new Date(b.date_added || b.dateAdded || 0));

    if (skuMatches.length === 0) {
        setErrorData(`No matching item found for '${inputs.sku}' in Rack '${inputs.rack}'.`);
        return;
    }

    if (skuMatches.length === 1) {
        // Only 1 item exists with this SKU. Safe to checkout.
        performCheckout(skuMatches[0], "Single Item Match");
    } else {
        // 3. AMBIGUITY DETECTED!
        // Multiple items have this SKU. User needs to pick which serial they have.
        setAmbiguousItems(skuMatches);
        setActiveStep(3); // Move to selection screen
        setCountdown(0);  // Stop auto-submit
    }
  };

  // --- EXECUTE THE CHECKOUT ---
  const performCheckout = (item, method) => {
    
    // Check rack details to find current quantity before deduction
    let currentQtyInRack = 0;
    const targetRackId = inputs.rack;
    
    if (rackDetails && rackDetails[targetRackId] && rackDetails[targetRackId].beams) {
        const beam = rackDetails[targetRackId].beams.find(b => 
            superNormalize(b.itemName) === superNormalize(item.name) || 
            superNormalize(b.itemName) === superNormalize(item.model)
        );
        if (beam) {
            currentQtyInRack = parseInt(beam.qty) || 0;
        }
    }
    
    // We deduct 1 for this checkout, so this is what remains
    const remainingQty = Math.max(0, currentQtyInRack - 1);

    const result = handleCheckOut(item.id, 1, inputs.rack, ""); 
    
    const processResult = (res) => {
        if (res.success) {
            setSuccessData({ 
                sku: inputs.sku, 
                qty: 1, 
                serial: item.serialNum || "N/A", 
                details: method,
                remainingQty: remainingQty // Passed to UI
            });
            setErrorData(null); 
            setAmbiguousItems([]); // Clear ambiguity list
        } else {
            setErrorData(res.message || "Checkout Failed.");
        }
    };

    if (result && typeof result.then === 'function') {
        result.then(processResult);
    } else {
        processResult(result);
    }
  };

  const handleSuccessClose = () => {
      setSuccessData(null);
      setInputs({ 
          rack: prefillRack || inputs.rack, 
          sku: ''
      });
      setCountdown(0);
      setAmbiguousItems([]);
      setActiveStep(2);
      setTimeout(() => itemRef.current?.focus(), 100);
  };

  const handleErrorClose = () => setErrorData(null);

  const renderInputBlock = (step, label, name, placeholder, IconComponent, iconSize, isReadOnly = false, ref, nextStep, nextRef) => (
    <div className="check-out-popup-input-block-group">
      <div className="check-out-popup-input-field-container">
        <p className="check-out-popup-input-label-container">
          <StepIndicator step={step} isActive={activeStep === step} />
          <span className="check-out-popup-input-label check-out-popup-font-roboto-flex">{label}</span>
        </p>
        <input
          ref={ref}
          type="text"
          name={name}
          value={inputs[name]}
          onChange={handleChange}
          onKeyDown={(e) => handleKeyDown(e, nextStep, nextRef)}
          onFocus={() => handleFocus(step)}
          onBlur={handleBlur}
          className="check-out-popup-input-field check-out-popup-font-roboto-flex"
          placeholder={placeholder}
          autoComplete="off"
          readOnly={isReadOnly}
          style={isReadOnly ? { backgroundColor: '#f0f0f0', color: '#555' } : {}}
        />
      </div>
      {!isReadOnly && (
        <div className="check-out-popup-scan-button-wrapper">
            <ScanButton icon={IconComponent} size={iconSize} onClick={() => {}} description={`Scan ${label}`} />
        </div>
      )}
    </div>
  );

  return (
    <div className="check-out-popup-wrapper">
      <div className="check-out-popup-container" style={{ position: 'relative', overflow: 'hidden', height: 'auto', paddingBottom: '30px' }}>
        
        {successData && (
            <div className="success-overlay">
                <div className="success-icon-container">
                    <IconCheckBig />
                </div>
                <h3 className="success-title">Item Removed</h3>
                <div className="success-message" style={{textAlign: 'left', fontSize: '14px', background: '#f8f9fa', padding: '10px', borderRadius: '5px', width: '80%'}}>
                    <p><strong>SKU:</strong> {successData.sku}</p>
                    {/* NEW: Displays the remaining quantity in the specific rack */}
                    <p style={{color: '#0056b3', fontWeight: 'bold'}}>
                       <strong>Remaining in Rack:</strong> {successData.remainingQty}
                    </p>
                </div>
                <p style={{ marginTop: '15px', color: '#555', fontSize: '14px' }}>
                    Scanning next in <strong>{successCountdown}</strong>...
                </p>
                <button className="success-button" onClick={handleSuccessClose}>Scan Next Item Now</button>
            </div>
        )}

        {errorData && (
            <div className="success-overlay">
                <div className="success-icon-container" style={{ backgroundColor: '#ffebee' }}>
                    <IconAlert />
                </div>
                <h3 className="success-title" style={{ color: '#c62828' }}>Validation Failed</h3>
                <p className="success-message" style={{ color: '#555', whiteSpace: 'pre-line', fontWeight: 'bold' }}>
                    {errorData}
                </p>
                <button className="success-button" style={{ backgroundColor: '#c62828' }} onClick={handleErrorClose}>
                  Try Again
                </button>
            </div>
        )}

        <button className="check-out-popup-close-button" onClick={onClose}><IconX size={20} color="black" /></button>
        <h1 className="check-out-popup-header-title check-out-popup-font-roboto">Checkout Item</h1>
        
        {countdown > 0 && !successData && !errorData && (
             <div style={{background: '#d1e7dd', color: '#0f5132', padding: '10px', textAlign: 'center', marginBottom: '10px', borderRadius: '4px'}}>
                 Checking... <strong>{countdown}s</strong>
             </div>
        )}
        
        {/* --- STEP 1 & 2: SCANNING --- */}
        {ambiguousItems.length === 0 ? (
            <>
                {renderInputBlock(1, "Scan Rack", "rack", "Enter rack code", IconScan, 24, !!prefillRack, rackRef, 2, itemRef)}
                {renderInputBlock(2, "Scan SKU", "sku", "Enter SKU or Serial Number", IconPackage, 24, false, itemRef, null, null)}
                
                <div className="check-out-popup-spacer" style={{ height: '20px', flexGrow: 0 }} />
                <div className="check-out-popup-divider-line-container"><div className="check-out-popup-divider-line" /></div>
                <div className="check-out-popup-action-buttons-group check-out-popup-font-urbanist">
                    <button className="check-out-popup-action-button check-out-popup-cancel-button" onClick={onClose}>Cancel</button>
                    <button className="check-out-popup-action-button check-out-popup-complete-button" onClick={handleScanAttempt}>Confirm</button>
                </div>
            </>
        ) : (
            /* --- STEP 3: SERIAL SELECTION (AMBIGUITY RESOLVER) --- */
            <div style={{padding: '0 25px'}}>
                 <div style={{background: '#fff3cd', border: '1px solid #ffeeba', padding: '10px', borderRadius: '5px', marginBottom: '15px'}}>
                    <p style={{margin: 0, fontWeight: 'bold', color: '#856404'}}>Multiple items found!</p>
                    <p style={{margin: '5px 0 0 0', fontSize: '13px', color: '#856404'}}>
                        You scanned a generic SKU ({inputs.sku}). Please select the specific Serial Number you are holding to ensure inventory accuracy.
                    </p>
                 </div>

                 <div style={{maxHeight: '300px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '8px'}}>
                    <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '14px'}}>
                        <thead style={{background: '#f8f9fa', position: 'sticky', top: 0}}>
                            <tr>
                                <th style={{padding: '10px', textAlign: 'left', borderBottom: '2px solid #ddd'}}>Serial #</th>
                                <th style={{padding: '10px', textAlign: 'left', borderBottom: '2px solid #ddd'}}>Date Added</th>
                                <th style={{padding: '10px', textAlign: 'right', borderBottom: '2px solid #ddd'}}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {ambiguousItems.map((item, index) => (
                                <tr key={item.id} style={{borderBottom: '1px solid #eee'}}>
                                    <td style={{padding: '10px', fontWeight: 'bold', color: '#2c3e50'}}>
                                        {item.serialNum || "No Serial"} 
                                        {index === 0 && <span style={{marginLeft: '5px', fontSize: '10px', background: '#e2e3e5', padding: '2px 4px', borderRadius: '3px'}}>OLDEST</span>}
                                    </td>
                                    <td style={{padding: '10px', color: '#7f8c8d'}}>{new Date(item.date_added).toLocaleDateString()}</td>
                                    <td style={{padding: '10px', textAlign: 'right'}}>
                                        <button 
                                            onClick={() => performCheckout(item, "Manual Selection")}
                                            style={{
                                                background: '#28a745', 
                                                color: 'white', 
                                                border: 'none', 
                                                padding: '6px 12px', 
                                                borderRadius: '4px',
                                                cursor: 'pointer',
                                                fontSize: '12px'
                                            }}
                                        >
                                            Take This
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                 </div>
                 <button 
                    onClick={() => { setAmbiguousItems([]); setActiveStep(2); }} 
                    style={{marginTop: '15px', width: '100%', padding: '10px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer'}}
                 >
                    Back to Scan
                 </button>
            </div>
        )}
      </div>
    </div>
  );
};

export default Checkout;