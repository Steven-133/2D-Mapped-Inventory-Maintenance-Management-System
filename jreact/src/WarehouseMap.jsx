import React, { useState, useContext, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Stage, Layer, Rect, Text, Group, Circle } from 'react-konva';
import RackDetailsModal from './RackDetailsModal';
import './Admin_hp.css';
import './WarehouseMap.css';
import { ReportStateProvider, ReportStateContext } from './LocalStorageContext';
import Checkin from './checkin';
import Checkout from './checkout';

// --- CONFIGURATION CONSTANTS (Must match Admin_hp.jsx) ---
const RACK_SIZE = 60;
const RACK_MARGIN = 10;
const TOTAL_CELL_SIZE = RACK_SIZE + RACK_MARGIN;
const STAGE_WIDTH = 1600;
const STAGE_HEIGHT = 900;
const GRID_OFFSET_X = 20;
const GRID_OFFSET_Y = 40;

// !!! API URL (Must match Admin_hp.jsx) !!!
const API_BASE_URL = 'http://localhost/mro-api';

const INITIAL_AREA_COLORS = {
  'default': '#FFFFFF',
  'Empty': '#E0E0E0'
};

// --- HELPER: Calculate Contrast Color (Black vs White Text) ---
const getContrastYIQ = (hexcolor) => {
  if (!hexcolor) return '#333';
  hexcolor = hexcolor.replace("#", "");
  if (hexcolor.length === 3) {
    hexcolor = hexcolor.split('').map(c => c + c).join('');
  }
  var r = parseInt(hexcolor.substr(0, 2), 16);
  var g = parseInt(hexcolor.substr(2, 2), 16);
  var b = parseInt(hexcolor.substr(4, 2), 16);
  var yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return (yiq >= 128) ? '#333' : 'white';
};

// --- COMPONENT: Read-Only Rack (Updated Animation) ---
const Rack = ({ rack, onRackClick, isBlinking, rackDetails, onHoverAlert, itemData }) => {
  const rectRef = useRef();
  
  // Logic to determine fill color based on Admin settings
  const rackColor = rack.customColor || rack.color || '#ccc';
  const textColor = getContrastYIQ(rackColor);

  // --- UPDATED BLINKING LOGIC (Red Outline) ---
  useEffect(() => {
    const node = rectRef.current;
    if (!node) return;

    let anim;
    if (isBlinking) {
      anim = new window.Konva.Animation((frame) => {
        // Create a pulse for opacity to simulate blinking
        const alpha = (Math.sin(frame.time * 0.01) + 1) / 2;
        
        // Apply Red Outline Style
        node.stroke('red');
        node.strokeWidth(5); // Thick border
        
        // Pulse the opacity of the rect (not the text)
        node.opacity(0.4 + 0.6 * alpha); 
      }, node.getLayer());
      anim.start();
    } else {
      // Reset to Normal State
      node.stroke('black');
      node.strokeWidth(1);
      node.opacity(1);
      node.scale({ x: 1, y: 1 });
    }

    return () => {
      if (anim) anim.stop();
      // Ensure clean reset on unmount/change
      if (node) {
        node.stroke('black');
        node.strokeWidth(1);
        node.opacity(1);
        node.scale({ x: 1, y: 1 });
      }
    };
  }, [isBlinking]);

  // --- REVISED ALERT LOGIC ---
  let alertItems = [];
  if (rack.id && rackDetails && rackDetails[rack.id]?.beams) {
    alertItems = rackDetails[rack.id].beams.filter(beam => {
      if (!beam.itemName || beam.itemName.trim() === '') return false;
      const rackQty = parseInt(beam.qty) || 0;
      
      // 1. Physically empty
      if (rackQty === 0) return true;

      // 2. Globally Low Stock
      if (itemData) {
        const globalItem = itemData.find(i => i.name === beam.itemName);
        if (globalItem) {
          const totalGlobalQty = parseInt(globalItem.qty) || 0;
          const minThreshold = parseInt(globalItem.min_threshold) || 5;
          if (totalGlobalQty <= minThreshold) return true;
        }
      }
      return false;
    });
  }

  const hasAlert = alertItems.length > 0;

  // --- Hover Handlers ---
  const handleIconEnter = (e) => {
    const stageBox = e.target.getStage().container().getBoundingClientRect();
    const ptr = e.target.getStage().getPointerPosition();
    const tooltipX = stageBox.left + ptr.x + 15;
    const tooltipY = stageBox.top + ptr.y + 15;
    onHoverAlert({ visible: true, x: tooltipX, y: tooltipY, rackId: rack.id, items: alertItems });
  };

  const handleIconLeave = () => {
    onHoverAlert({ visible: false, items: [], rackId: '' });
  };

  return (
    <Group
      x={rack.x}
      y={rack.y}
      onClick={(e) => {
        if (e.evt.defaultPrevented) return;
        onRackClick(rack);
      }}
      onTap={(e) => {
        if (e.evt.defaultPrevented) return;
        onRackClick(rack);
      }}
      onMouseEnter={(e) => {
        const container = e.target.getStage().container();
        container.style.cursor = 'pointer';
      }}
      onMouseLeave={(e) => {
        const container = e.target.getStage().container();
        container.style.cursor = 'default';
      }}
    >
      <Rect
        ref={rectRef}
        width={RACK_SIZE}
        height={RACK_SIZE}
        fill={rackColor}
        stroke="black"
        strokeWidth={1}
        cornerRadius={4}
        shadowColor="black"
        shadowBlur={2}
        shadowOpacity={0.3}
      />
      <Text
        text={rack.id}
        width={RACK_SIZE}
        height={RACK_SIZE}
        align="center"
        verticalAlign="middle"
        fontSize={12}
        fill={textColor}
        fontStyle="bold"
        listening={false}
      />
      {hasAlert && (
        <Group
          x={RACK_SIZE - 10}
          y={10}
          onMouseEnter={handleIconEnter}
          onMouseLeave={handleIconLeave}
        >
          <Circle radius={8} fill="#DC3545" stroke="white" strokeWidth={1} />
          <Text
            text="!"
            fontSize={12}
            fontStyle="bold"
            fill="white"
            width={16}
            height={16}
            x={-8}
            y={-7.5}
            align="center"
            verticalAlign="middle"
            listening={false}
          />
        </Group>
      )}
    </Group>
  );
};

const WarehouseMapContent = () => {
  const navigate = useNavigate();
  const { itemData = [], rackDetails = {} } = useContext(ReportStateContext);
  const [currentUser, setCurrentUser] = useState(null);

  // --- STATE ---
  const [racks, setRacks] = useState([]);
  const [areaColors, setAreaColors] = useState(INITIAL_AREA_COLORS);
  const [logo, setLogo] = useState('https://cdn-icons-png.flaticon.com/512/25/25694.png');
  const [headerColor, setHeaderColor] = useState('#ffffff');

  // --- SEARCH STATE ---
  const [searchTerm, setSearchTerm] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  
  const [blinkingRacks, setBlinkingRacks] = useState([]);
  const [selectedRack, setSelectedRack] = useState(null);
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [showCheckOut, setShowCheckOut] = useState(false);
  const [alertTooltip, setAlertTooltip] = useState({ visible: false, x: 0, y: 0, items: [], rackId: '' });

  // --- FETCH MAP DATA ---
  const fetchMapData = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/settings.php`);
      const data = await response.json();

      // Process Racks
      const racksSetting = data.find(d => d.setting_key === 'map_racks');
      if (racksSetting && racksSetting.setting_value) {
        const parsedRacks = JSON.parse(racksSetting.setting_value);
        const mappedRacks = parsedRacks.map(r => ({
          ...r,
          x: r.gridX * TOTAL_CELL_SIZE + GRID_OFFSET_X,
          y: r.gridY * TOTAL_CELL_SIZE + GRID_OFFSET_Y
        }));
        setRacks(mappedRacks);
      }

      // Process Colors
      const colorsSetting = data.find(d => d.setting_key === 'map_colors');
      if (colorsSetting && colorsSetting.setting_value) {
        setAreaColors(JSON.parse(colorsSetting.setting_value));
      }

      // Process Logo
      const logoSetting = data.find(d => d.setting_key === 'admin_logo');
      if (logoSetting && logoSetting.setting_value) {
        setLogo(logoSetting.setting_value);
      }

      // Process Header Color
      const headerColorSetting = data.find(d => d.setting_key === 'header_color');
      if (headerColorSetting && headerColorSetting.setting_value) {
        setHeaderColor(headerColorSetting.setting_value);
      }

    } catch (err) {
      console.error("Error fetching map data:", err);
    }
  };

  useEffect(() => {
    const session = localStorage.getItem('currentUser');
    if (session) {
      setCurrentUser(JSON.parse(session));
    } else {
      navigate('/');
    }

    fetchMapData();
    const interval = setInterval(fetchMapData, 2000);
    return () => clearInterval(interval);
  }, [navigate]);

  // --- SEARCH HANDLERS ---
  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearchTerm(val);
    
    if (!val) { 
      setSuggestions([]); 
      setBlinkingRacks([]);
      return; 
    }

    // Collect all unique item names
    const allNames = new Set();
    Object.values(rackDetails).forEach(r => r.beams?.forEach(b => { 
      if (b.itemName) allNames.add(b.itemName); 
    }));
    
    setSuggestions([...allNames].filter(n => n.toLowerCase().includes(val.toLowerCase())));
  };

  const handleSelectSuggestion = (name) => {
    setSearchTerm(name);
    setSuggestions([]);
    
    // Find racks containing the item
    const foundIds = [];
    Object.entries(rackDetails).forEach(([id, data]) => {
      if (data.beams?.some(b => b.itemName === name)) foundIds.push(id);
    });
    
    setBlinkingRacks(foundIds);
  };

  // --- NEW: RACK CLICK HANDLER (Clears Blinking) ---
  const handleRackClick = (rack) => {
    setSelectedRack(rack);
    setBlinkingRacks([]); // Clear the search red blinking when clicked
  };

  const handleLogout = () => {
    localStorage.removeItem('currentUser');
    navigate('/');
  };

  return (
    <div className="admin-hp-wrapper">
      <div className="admin-hp-sidebar">
        <div className="admin-hp-nav-item selected">
          <div className="admin-hp-nav-icon"><ion-icon name="map-outline"></ion-icon></div>
          <span className="admin-hp-nav-text">2D Map</span>
        </div>
        <div className="admin-hp-nav-item" onClick={() => navigate('/manage-users')}>
          <div className="admin-hp-nav-icon"><ion-icon name="people-outline"></ion-icon></div>
          <span className="admin-hp-nav-text">Manage Users</span>
        </div>
        
        <div className="admin-hp-nav-item" onClick={handleLogout} style={{ marginTop: 'auto', marginBottom: '20px' }}>
          <div className="admin-hp-nav-icon" style={{ color: '#dc3545' }}><ion-icon name="log-out-outline"></ion-icon></div>
          <span className="admin-hp-nav-text" style={{ color: '#dc3545' }}>Logout</span>
        </div>
      </div>

      <div className="admin-hp-main-content">
        <div className="admin-hp-container">
          
          {/* --- HEADER --- */}
          <div className="admin-hp-header" style={{ background: headerColor || '#ffffff', transition: 'background 0.3s' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <img src={logo} alt="Logo" style={{ height: '50px', width: '50px', objectFit: 'contain' }} />
              <h1 className="admin-hp-main-title">Warehouse Map</h1>
            </div>

            <div className="admin-hp-search-controls">
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  className="admin-hp-search-input"
                  placeholder="Search item..."
                  value={searchTerm}
                  onChange={handleSearchChange}
                />
                {suggestions.length > 0 && (
                  <ul className="search-suggestions">
                    {suggestions.map((s, i) => (
                      <li key={i} onClick={() => handleSelectSuggestion(s)}>{s}</li>
                    ))}
                  </ul>
                )}
                {!searchTerm && <ion-icon name="search-outline" style={{ position: 'absolute', right: '15px', top: '50%', transform: 'translateY(-50%)', color: '#666', pointerEvents: 'none' }}></ion-icon>}
              </div>

              <button className="btn-action check-in" onClick={() => setShowCheckIn(true)}>Check In</button>
              <button className="btn-action check-out" onClick={() => setShowCheckOut(true)}>Check Out</button>
              <div style={{ fontWeight: '600', marginLeft: '10px', fontSize: '14px', color: '#555' }}>{currentUser?.email}</div>
            </div>
          </div>

          {/* --- LEGEND --- */}
          <div className="legend-container">
            {Object.entries(areaColors).map(([name, color]) => (
              name !== 'Empty' && name !== 'default' && (
                <div key={name} className="legend-item"><span className="legend-color" style={{ background: color }}></span><span>{name}</span></div>
              )
            ))}
          </div>

          {/* --- TOOLTIP --- */}
          {alertTooltip.visible && (
            <div className="custom-alert-tooltip" style={{ top: alertTooltip.y, left: alertTooltip.x }}>
              <h4>{alertTooltip.rackId} - Attention Needed</h4>
              <ul>
                {alertTooltip.items.map((beam, idx) => {
                  let statusText = "";
                  let globalInfo = null;
                  if (itemData) globalInfo = itemData.find(i => i.name === beam.itemName);
                  const rackQty = parseInt(beam.qty);

                  if (rackQty === 0) statusText = "EMPTY";
                  else if (globalInfo) {
                    const globalQty = parseInt(globalInfo.qty) || 0;
                    const minThresh = parseInt(globalInfo.min_threshold) || 5;
                    statusText = (globalQty <= minThresh) ? `LOW STOCK (Global: ${globalQty})` : `Qty: ${rackQty}`;
                  } else {
                    statusText = `Qty: ${rackQty}`;
                  }

                  return (
                    <li key={idx}>
                      <span className="alert-item-name">{beam.itemName}</span>
                      <span className="alert-qty">{statusText}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* --- STAGE --- */}
          <div className="admin-hp-konva-stage-container">
            <div className="stage-wrapper">
              <Stage width={STAGE_WIDTH} height={STAGE_HEIGHT}>
                <Layer>
                  {Array.isArray(racks) && racks.map((rack) => (
                    <Rack
                      key={rack.id || `rack-${rack.gridX}-${rack.gridY}`}
                      rack={rack}
                      onRackClick={handleRackClick}
                      isBlinking={blinkingRacks.includes(rack.id)}
                      rackDetails={rackDetails}
                      itemData={itemData}
                      onHoverAlert={setAlertTooltip}
                    />
                  ))}
                </Layer>
              </Stage>
            </div>
          </div>

        </div>
      </div>

      {selectedRack && <RackDetailsModal rack={selectedRack} onClose={() => setSelectedRack(null)} />}
      {showCheckIn && <div className="modal-overlay"><Checkin onClose={() => setShowCheckIn(false)} /></div>}
      {showCheckOut && <div className="modal-overlay"><Checkout onClose={() => setShowCheckOut(false)} /></div>}
    </div>
  );
};

const WarehouseMap = () => (
  <ReportStateProvider>
    <WarehouseMapContent />
  </ReportStateProvider>
);

export default WarehouseMap;