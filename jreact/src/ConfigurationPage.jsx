import React, { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ReportStateProvider, ReportStateContext } from './LocalStorageContext';
import './Admin_hp.css'; 
import './ConfigurationPage.css'; 

const API_BASE_URL = 'http://localhost/mro-api';

const ConfigurationContent = () => {
    const navigate = useNavigate();
    const { setHeaderColor, setLogo, setCodeType } = useContext(ReportStateContext);

    // --- FORM STATE ---
    const [localHeaderColor, setLocalHeaderColor] = useState('#ffffff');
    const [localLogo, setLocalLogo] = useState('');
    const [mapColors, setMapColors] = useState({});
    const [localCodeType, setLocalCodeType] = useState('barcode');
    const [localDeadStockDays, setLocalDeadStockDays] = useState(90);

    const [isLoading, setIsLoading] = useState(true);
    const [message, setMessage] = useState({ text: '', type: '' });

    // --- DIRTY STATE TRACKER ---
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    // --- MODAL STATES ---
    const [showLeaveModal, setShowLeaveModal] = useState(false);
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [pendingAction, setPendingAction] = useState(null); 

    // --- PREVENT BROWSER REFRESH/CLOSE ---
    useEffect(() => {
        const handleBeforeUnload = (e) => {
            if (hasUnsavedChanges) {
                e.preventDefault();
                e.returnValue = ''; 
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [hasUnsavedChanges]);

    // --- NAVIGATION GATEKEEPER ---
    const triggerSafeAction = (action) => {
        if (hasUnsavedChanges) {
            setPendingAction(() => action); 
            setShowLeaveModal(true);      
        } else {
            action(); 
        }
    };

    const handleNavClick = (path) => triggerSafeAction(() => navigate(path));
    const handleLogoutClick = () => {
        triggerSafeAction(() => {
            localStorage.removeItem('currentUser');
            navigate('/');
        });
    };

    // --- MODAL HANDLERS ---
    const confirmLeave = () => {
        if (pendingAction) pendingAction();
        setShowLeaveModal(false);
        setHasUnsavedChanges(false); 
    };

    // Load Settings
    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/settings.php`);
                const data = await response.json();

                const logoSetting = data.find(d => d.setting_key === 'admin_logo');
                if (logoSetting) setLocalLogo(logoSetting.setting_value);

                const headerSetting = data.find(d => d.setting_key === 'header_color');
                if (headerSetting) setLocalHeaderColor(headerSetting.setting_value);

                const colorsSetting = data.find(d => d.setting_key === 'map_colors');
                if (colorsSetting) setMapColors(JSON.parse(colorsSetting.setting_value));

                const codeSetting = data.find(d => d.setting_key === 'code_type');
                if (codeSetting) setLocalCodeType(codeSetting.setting_value);

                const deadStockSetting = data.find(d => d.setting_key === 'dead_stock_days');
                if (deadStockSetting) setLocalDeadStockDays(parseInt(deadStockSetting.setting_value) || 90);

            } catch (error) {
                console.error("Error loading settings:", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchSettings();
    }, []);

    const markAsDirty = () => setHasUnsavedChanges(true);

    const handleLogoUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setLocalLogo(reader.result);
                markAsDirty();
            };
            reader.readAsDataURL(file);
        }
    };

    const handleColorChange = (key, value) => {
        setMapColors(prev => ({ ...prev, [key]: value }));
        markAsDirty();
    };

    // --- SAVE LOGIC ---
    const handleSaveClick = () => setShowSaveModal(true);

    const executeSave = async () => {
        setShowSaveModal(false);
        setMessage({ text: 'Saving...', type: 'info' });

        try {
            await Promise.all([
                fetch(`${API_BASE_URL}/settings.php`, { method: 'POST', body: JSON.stringify({ setting_key: 'admin_logo', setting_value: localLogo }) }),
                fetch(`${API_BASE_URL}/settings.php`, { method: 'POST', body: JSON.stringify({ setting_key: 'header_color', setting_value: localHeaderColor }) }),
                fetch(`${API_BASE_URL}/settings.php`, { method: 'POST', body: JSON.stringify({ setting_key: 'map_colors', setting_value: JSON.stringify(mapColors) }) }),
                fetch(`${API_BASE_URL}/settings.php`, { method: 'POST', body: JSON.stringify({ setting_key: 'code_type', setting_value: localCodeType }) }),
                fetch(`${API_BASE_URL}/settings.php`, { method: 'POST', body: JSON.stringify({ setting_key: 'dead_stock_days', setting_value: localDeadStockDays }) })
            ]);

            setHeaderColor(localHeaderColor);
            setLogo(localLogo);
            setCodeType(localCodeType); 
            
            setHasUnsavedChanges(false); 
            setMessage({ text: 'Configuration Saved Successfully!', type: 'success' });
            setTimeout(() => setMessage({ text: '', type: '' }), 3000);
        } catch (error) {
            console.error(error);
            setMessage({ text: 'Failed to save configuration.', type: 'error' });
        }
    };

    if (isLoading) return <div className="loading-screen">Loading Configuration...</div>;

    return (
        <div className="admin-hp-wrapper full-height-layout">
            {/* --- SIDEBAR --- */}
            <div className="admin-hp-sidebar">
                <div className="admin-hp-nav-item" onClick={() => handleNavClick('/dashboard')}>
                    <div className="admin-hp-nav-icon"><ion-icon name="stats-chart-outline" style={{ fontSize: '30px' }}></ion-icon></div>
                    <span className="admin-hp-nav-text">Dashboard</span>
                </div>
                <div className="admin-hp-nav-item" onClick={() => handleNavClick('/admin-hp')}>
                    <div className="admin-hp-nav-icon"><ion-icon name="map-outline" style={{ fontSize: '30px' }}></ion-icon></div>
                    <span className="admin-hp-nav-text">2D Map</span>
                </div>
                <div className="admin-hp-nav-item" onClick={() => handleNavClick('/report-itemlist')}>
                    <div className="admin-hp-nav-icon"><ion-icon name="clipboard-outline" style={{ fontSize: '30px' }}></ion-icon></div>
                    <span className="admin-hp-nav-text">Report & Itemlist</span>
                </div>
                <div className="admin-hp-nav-item" onClick={() => handleNavClick('/manage-users')}>
                    <div className="admin-hp-nav-icon"><ion-icon name="people-outline" style={{ fontSize: '30px' }}></ion-icon></div>
                    <span className="admin-hp-nav-text">Manage Users</span>
                </div>
                <div className="admin-hp-nav-item selected">
                    <div className="admin-hp-nav-icon"><ion-icon name="settings-outline" style={{ fontSize: '30px' }}></ion-icon></div>
                    <span className="admin-hp-nav-text">Configuration</span>
                </div>
                <div className="admin-hp-nav-item" onClick={handleLogoutClick} style={{ marginTop: 'auto', marginBottom: '20px' }}>
                    <div className="admin-hp-nav-icon" style={{ color: '#dc3545' }}><ion-icon name="log-out-outline" style={{ fontSize: '30px' }}></ion-icon></div>
                    <span className="admin-hp-nav-text" style={{ color: '#dc3545' }}>Logout</span>
                </div>
            </div>

            {/* --- MAIN CONTENT AREA (UPDATED BACKGROUND #f9f9f9) --- */}
            <div className="admin-hp-main-content no-padding" style={{ backgroundColor: '#f9f9f9' }}>
                
                {/* --- HEADER (OLD VERSION RESTORED) --- */}
                <div className="admin-hp-header" style={{ background: localHeaderColor, transition: 'background 0.3s', padding: '20px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <img src={localLogo || 'placeholder.png'} alt="Logo" style={{ height: '50px', width: '50px', objectFit: 'contain' }} />
                        <h1 className="admin-hp-main-title" style={{ color: '#333', margin: 0, fontSize: '24px' }}>System Configuration</h1>
                    </div>
                    {message.text && (
                        <div className={`status-badge ${message.type}`}>
                            {message.text}
                        </div>
                    )}
                </div>

                {/* SCROLLABLE SETTINGS AREA */}
                <div className="config-scroll-container">
                    
                    {/* SECTION 1: SYSTEM PREFERENCES */}
                    <div className="config-section">
                        <h2 className="section-title">System Preferences</h2>
                        
                        {/* SETTING ROW: SCANNING */}
                        <div className="setting-row">
                            <div className="setting-info">
                                <label>Scanning Method</label>
                                <p>Select the technology used for identifying inventory items.</p>
                            </div>
                            <div className="setting-control">
                                <div className="segmented-control">
                                    <div 
                                        className={`segment ${localCodeType === 'barcode' ? 'active' : ''}`}
                                        onClick={() => { setLocalCodeType('barcode'); markAsDirty(); }}
                                    >
                                        <ion-icon name="barcode-outline"></ion-icon> Barcode
                                    </div>
                                    <div 
                                        className={`segment ${localCodeType === 'qr' ? 'active' : ''}`}
                                        onClick={() => { setLocalCodeType('qr'); markAsDirty(); }}
                                    >
                                        <ion-icon name="qr-code-outline"></ion-icon> QR Code
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* SETTING ROW: ANALYTICS */}
                        <div className="setting-row">
                            <div className="setting-info">
                                <label>Dead Stock Threshold</label>
                                <p>Items inactive for this period will be flagged in reports.</p>
                            </div>
                            <div className="setting-control">
                                <div className="input-group">
                                    <input 
                                        type="number" 
                                        value={localDeadStockDays}
                                        onChange={(e) => { setLocalDeadStockDays(e.target.value); markAsDirty(); }}
                                        min="1"
                                    />
                                    <span className="unit">Days</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* SECTION 2: BRANDING */}
                    <div className="config-section">
                        <h2 className="section-title">Branding & Appearance</h2>
                        
                        {/* SETTING ROW: LOGO */}
                        <div className="setting-row">
                            <div className="setting-info">
                                <label>System Logo</label>
                                <p>This logo appears on the login screen and dashboard header.</p>
                            </div>
                            <div className="setting-control">
                                <div className="logo-control">
                                    <div className="logo-preview-box">
                                        <img src={localLogo || 'placeholder.png'} alt="Logo" />
                                    </div>
                                    <label className="btn-upload">
                                        Change Logo
                                        <input type="file" accept="image/*" onChange={handleLogoUpload} hidden />
                                    </label>
                                </div>
                            </div>
                        </div>

                        {/* SETTING ROW: THEME COLOR */}
                        <div className="setting-row">
                            <div className="setting-info">
                                <label>Header Accent Color</label>
                                <p>Customize the top navigation bar color.</p>
                            </div>
                            <div className="setting-control">
                                <div className="color-control">
                                    <input 
                                        type="color" 
                                        value={localHeaderColor} 
                                        onChange={(e) => { setLocalHeaderColor(e.target.value); markAsDirty(); }} 
                                    />
                                    <span className="color-code">{localHeaderColor}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* SECTION 3: MAP CONFIGURATION */}
                    <div className="config-section">
                        <h2 className="section-title">Map Legend Configuration</h2>
                        <p className="section-desc">Define the color coding for different rack groups in the 2D Map view.</p>
                        
                        <div className="map-colors-grid">
                            {Object.entries(mapColors).map(([name, color]) => (
                                <div key={name} className="map-color-item">
                                    <div className="color-dot" style={{ backgroundColor: color }}></div>
                                    <span className="color-name">{name}</span>
                                    <input 
                                        type="color" 
                                        className="hidden-picker"
                                        value={color} 
                                        onChange={(e) => handleColorChange(name, e.target.value)} 
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* STICKY BOTTOM ACTION BAR */}
                <div className={`sticky-action-bar ${hasUnsavedChanges ? 'visible' : ''}`}>
                    <div className="unsaved-notice">
                        <ion-icon name="warning"></ion-icon>
                        <span>You have unsaved changes.</span>
                    </div>
                    <div className="action-buttons">
                        <button className="btn-save" onClick={handleSaveClick}>
                            Save Changes
                        </button>
                    </div>
                </div>
            </div>

            {/* --- MODAL 1: CONFIRM LEAVE (Unsaved Changes) --- */}
            {showLeaveModal && (
                <div className="modal-backdrop">
                    <div className="modal-box warning">
                        <div className="icon-wrapper"><ion-icon name="alert-outline"></ion-icon></div>
                        <h2>Unsaved Changes</h2>
                        <p>You have unsaved changes. Leaving now will discard them.</p>
                        <div className="modal-footer">
                            <button className="btn-text" onClick={() => setShowLeaveModal(false)}>Cancel</button>
                            <button className="btn-danger" onClick={confirmLeave}>Discard & Leave</button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- MODAL 2: CONFIRM SAVE --- */}
            {showSaveModal && (
                <div className="modal-backdrop">
                    <div className="modal-box info">
                        <div className="icon-wrapper"><ion-icon name="save-outline"></ion-icon></div>
                        <h2>Save Configuration?</h2>
                        <p>These settings will apply to all users immediately.</p>
                        <div className="modal-footer">
                            <button className="btn-text" onClick={() => setShowSaveModal(false)}>Cancel</button>
                            <button className="btn-primary" onClick={executeSave}>Confirm Save</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const ConfigurationPage = () => (
    <ReportStateProvider>
        <ConfigurationContent />
    </ReportStateProvider>
);

export default ConfigurationPage;