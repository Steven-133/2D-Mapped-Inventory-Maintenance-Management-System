import React, { useState, useContext, useEffect, useRef } from 'react';
import './defective.css'; 
import { ReportStateContext } from './LocalStorageContext';

// --- ICONS ---
const IconScan = ({ size = 24, color = 'currentColor' }) => (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" /></svg>);
const IconPackage = ({ size = 24, color = 'currentColor' }) => (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16.5 9.4 7.5 4.21" /><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>);
const IconX = ({ size = 24, color = 'currentColor' }) => (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>);
const IconCheckBig = () => (<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#c62828" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>); 
const IconAlert = () => (<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#c62828" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>);

const StepIndicator = ({ step, isActive }) => (
  <div className={`defective-popup-step-indicator defective-popup-font-urbanist ${isActive ? 'defective-popup-step-active' : 'defective-popup-step-inactive'}`}>{`Step ${step}`}</div>
);

const ScanButton = ({ icon: Icon, size, onClick, description }) => (
  <button className="defective-popup-scan-button" onClick={onClick} aria-label={description}><Icon size={size} color="white" /></button>
);

const Defective = ({ onClose, prefillRack }) => {
  const { handleDefective, itemData } = useContext(ReportStateContext);
  const [activeStep, setActiveStep] = useState(1);
  const [inputs, setInputs] = useState({ rack: '', sku: '' });
  const [successData, setSuccessData] = useState(null);
  const [errorData, setErrorData] = useState(null);

  const rackRef = useRef(null);
  const itemRef = useRef(null);

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
    if (inputs.rack && inputs.sku) {
        if (autoSubmitTimer) clearTimeout(autoSubmitTimer);
        setCountdown(2);
        const timer = setTimeout(() => { handleComplete(); }, 2000);
        const interval = setInterval(() => { setCountdown((prev) => prev - 1); }, 1000);
        setAutoSubmitTimer(timer);
        return () => {
            clearTimeout(timer);
            clearInterval(interval);
            setCountdown(0);
        };
    }
  }, [inputs, activeStep]);

  // --- 3. AUTO SUCCESS RESET ---
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
            handleComplete();
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

  const handleComplete = async () => {
    if (autoSubmitTimer) clearTimeout(autoSubmitTimer);

    if (!inputs.sku || !inputs.rack) {
        setErrorData("Please fill in Rack and SKU.");
        return;
    }

    const inputIdentifier = superNormalize(inputs.sku);
    
    // --- FILTER ---
    const matchingItems = itemData.filter(i => {
            const modelNorm = superNormalize(i.model);
            const nameNorm = superNormalize(i.name);
            const idNorm = superNormalize(i.id);

            const matchModel = modelNorm === inputIdentifier;
            const matchName = nameNorm === inputIdentifier;
            const matchID = idNorm === inputIdentifier;
            
            const rawRack = i.rack_loc || i.rack || "Unplaced";
            const isUnplaced = rawRack === "Unplaced";
            const matchRack = checkSmartMatch(rawRack, inputs.rack);
            
            return (matchModel || matchName || matchID) && (matchRack || isUnplaced);
        })
        .sort((a, b) => new Date(a.date_added || a.dateAdded || 0) - new Date(b.date_added || b.dateAdded || 0)); 

    if (matchingItems.length === 0) {
        setErrorData(`SKU '${inputs.sku}' not found in Rack '${inputs.rack}'.`);
        return;
    }

    const specificItem = matchingItems[0];
    const finalRackID = inputs.rack;

    // EXECUTE with empty serial
    const result = await handleDefective(specificItem.id, 1, finalRackID, "", "Reported via Scanner (SKU)"); 

    if (result && result.success) {
        setSuccessData({ sku: inputs.sku, qty: 1, details: "Marked as Defective" });
        setErrorData(null); 
    } else {
        setErrorData(result?.message || "Operation Failed.");
    }
  };

  const handleSuccessClose = () => {
      setSuccessData(null);
      setInputs({ 
          rack: prefillRack || inputs.rack, 
          sku: ''
      });
      setCountdown(0);
      setActiveStep(2);
      setTimeout(() => itemRef.current?.focus(), 100);
  };

  const handleErrorClose = () => setErrorData(null);

  const renderInputBlock = (step, label, name, placeholder, IconComponent, iconSize, isReadOnly = false, ref, nextStep, nextRef) => (
    <div className="defective-popup-input-block-group">
      <div className="defective-popup-input-field-container">
        <p className="defective-popup-input-label-container">
          <StepIndicator step={step} isActive={activeStep === step} />
          <span className="defective-popup-input-label defective-popup-font-roboto-flex">{label}</span>
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
          className="defective-popup-input-field defective-popup-font-roboto-flex"
          placeholder={placeholder}
          autoComplete="off"
          readOnly={isReadOnly}
          style={isReadOnly ? { backgroundColor: '#f0f0f0', color: '#555' } : {}}
        />
      </div>
      {!isReadOnly && (
        <div className="defective-popup-scan-button-wrapper">
            <ScanButton icon={IconComponent} size={iconSize} onClick={() => {}} description={`Scan ${label}`} />
        </div>
      )}
    </div>
  );

  return (
    <div className="defective-popup-wrapper">
      <div className="defective-popup-container" style={{ position: 'relative', overflow: 'hidden', height: 'auto', paddingBottom: '30px' }}>
        
        {successData && (
            <div className="success-overlay">
                <div className="success-icon-container" style={{ backgroundColor: '#ffebee' }}>
                    <IconCheckBig />
                </div>
                <h3 className="success-title" style={{ color: '#c62828' }}>Defective Reported</h3>
                <div className="success-message" style={{textAlign: 'left', fontSize: '14px', color: '#555'}}>
                    <p>SKU: <strong>{inputs.sku}</strong></p>
                    <p>Status: <strong style={{color: '#c62828'}}>Marked Defective</strong></p>
                </div>
                
                <p style={{ marginTop: '15px', color: '#555', fontSize: '14px' }}>
                    Scanning next in <strong>{successCountdown}</strong>...
                </p>

                <button className="success-button" style={{ backgroundColor: '#c62828' }} onClick={handleSuccessClose}>Scan Next Item</button>
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

        <button className="defective-popup-close-button" onClick={onClose}><IconX size={20} color="black" /></button>
        <h1 className="defective-popup-header-title defective-popup-font-roboto">Defective Item (SKU)</h1>
        
        {countdown > 0 && !successData && !errorData && (
             <div style={{background: '#fff3cd', color: '#856404', padding: '10px', textAlign: 'center', marginBottom: '10px', borderRadius: '4px'}}>
                 Auto-submitting in <strong>{countdown}s</strong>... (Press any key to cancel)
             </div>
        )}
        
        {renderInputBlock(1, "Scan Rack", "rack", "Enter rack code", IconScan, 24, !!prefillRack, rackRef, 2, itemRef)}
        {renderInputBlock(2, "Scan SKU", "sku", "Scan SKU / Model No.", IconPackage, 24, false, itemRef, null, null)}
        
        <div className="defective-popup-spacer" style={{ height: '20px', flexGrow: 0 }} />
        
        <div className="defective-popup-divider-line-container"><div className="defective-popup-divider-line" /></div>
        <div className="defective-popup-action-buttons-group defective-popup-font-urbanist">
          <button className="defective-popup-action-button defective-popup-cancel-button" onClick={onClose}>Cancel</button>
          <button className="defective-popup-action-button defective-popup-complete-button" onClick={handleComplete}>Submit Defective</button>
        </div>
      </div>
    </div>
  );
};

export default Defective;