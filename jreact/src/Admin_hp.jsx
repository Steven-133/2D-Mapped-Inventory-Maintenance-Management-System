import React, { useState, useContext, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Stage, Layer, Rect, Text, Group, Circle, Label, Tag } from 'react-konva';
import RackDetailsModal_Admin from './RackDetailsModal_Admin';
import './Admin_hp.css';
import { ReportStateContext } from './LocalStorageContext'; // REMOVED ReportStateProvider FROM IMPORT
import Checkin from './checkin';
import Checkout from './checkout';

// --- CONFIGURATION CONSTANTS ---
const RACK_SIZE = 60;
const RACK_MARGIN = 10;
const TOTAL_CELL_SIZE = RACK_SIZE + RACK_MARGIN;
const STAGE_WIDTH = 1600;
const STAGE_HEIGHT = 900;
const GRID_OFFSET_X = 20;
const GRID_OFFSET_Y = 40;
const INITIAL_AREA_COLORS = {
    'default': '#FFFFFF',
    'Empty': '#E0E0E0'
};

// !!! CHANGE THIS TO YOUR ACTUAL BACKEND API URL !!!
const API_BASE_URL = 'http://localhost/mro-api';

// --- HELPER: Normalize Hex Colors for Comparison ---
const normalizeColor = (color) => {
    if (!color) return '';
    let c = color.toString().trim().toLowerCase();
    if (c.startsWith('#')) c = c.slice(1);
    if (c.length === 3) {
        c = c.split('').map(char => char + char).join('');
    }
    return '#' + c;
};

const generateGrid = () => {
    const cols = Math.floor((STAGE_WIDTH - 20) / TOTAL_CELL_SIZE);
    const rows = Math.floor((STAGE_HEIGHT - 20) / TOTAL_CELL_SIZE);
    const grid = [];
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            grid.push({
                gridX: x, gridY: y,
                x: x * TOTAL_CELL_SIZE + GRID_OFFSET_X,
                y: y * TOTAL_CELL_SIZE + GRID_OFFSET_Y
            });
        }
    }
    return grid;
};

// --- MODERN POPUP COMPONENT ---
const ModernPopup = ({ title, message, type, onConfirm, onCancel, inputValue, setInputValue, showColorPicker, colorValue, setColorValue, confirmText, cancelText }) => {
    return (
        <div className="custom-popup-overlay">
            <div className="custom-popup-content">
                <h3>{title}</h3>
                {message && <p>{message}</p>}
                {type === 'prompt' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        <input
                            type="text"
                            className="popup-input"
                            autoFocus
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            placeholder="Type name here..."
                        />
                        {showColorPicker && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#f5f5f5', padding: '10px', borderRadius: '5px' }}>
                                <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#555' }}>Group Color:</span>
                                <input
                                    type="color"
                                    value={colorValue}
                                    onChange={(e) => setColorValue(e.target.value)}
                                    style={{ width: '50px', height: '30px', border: 'none', cursor: 'pointer' }}
                                />
                                <span style={{ fontSize: '12px', color: '#777' }}>{colorValue}</span>
                            </div>
                        )}
                        <div style={{ fontSize: '11px', color: '#888', fontStyle: 'italic' }}>
                            *Tip: If you use an existing name, it will merge and inherit that group's color.
                        </div>
                    </div>
                )}
                <div className="popup-buttons">
                    {type === 'prompt' || type === 'confirm' ? (
                        <>
                            <button className="popup-btn secondary" onClick={onCancel}>{cancelText || 'Cancel'}</button>
                            <button className="popup-btn primary" onClick={() => onConfirm(inputValue, colorValue)}>{confirmText || 'Confirm'}</button>
                        </>
                    ) : (
                        <button className="popup-btn primary" onClick={() => onConfirm && onConfirm()}>Close</button>
                    )}
                </div>
            </div>
        </div>
    );
};

// --- RACK COMPONENT ---
const Rack = React.memo(({ data, x, y, onInteract, isEditMode, isSelected, isBlinking, rackDetails, areaColors, onDragEnd, onDragStart, onDragMove, onHoverAlert, itemData }) => {
    const [isHovered, setIsHovered] = useState(false);
    const [blinkOn, setBlinkOn] = useState(false);

    useEffect(() => {
        let interval;
        if (isBlinking) interval = setInterval(() => setBlinkOn(prev => !prev), 500);
        else setBlinkOn(false);
        return () => clearInterval(interval);
    }, [isBlinking]);

    // --- COLOR PRIORITY LOGIC ---
    let fillColor = areaColors['Empty'];
    if (data.id) {
        if (data.status === 'defective') {
            fillColor = areaColors['defective'] || '#6C757D';
        } 
        // 1. PRIORITY: Check Global Legend (areaColors)
        else if (data.area && areaColors[data.area]) {
            fillColor = areaColors[data.area];
        } 
        // 2. FALLBACK: Check Custom Color on Rack Object
        else if (data.customColor) {
            fillColor = data.customColor;
        } 
        // 3. FALLBACK: Fuzzy Search or Default
        else {
            const foundKey = Object.keys(areaColors).find(key => data.area && data.area.toLowerCase().includes(key.toLowerCase()));
            fillColor = foundKey ? areaColors[foundKey] : areaColors['default'];
        }
    } else if (!isEditMode) return null;

    let stroke = isSelected ? '#007bff' : (blinkOn ? '#FF4500' : ((!data.id && isEditMode) ? '#ddd' : 'black'));
    let strokeWidth = (isSelected || blinkOn) ? 4 : 1;

    // --- ALERT LOGIC ---
    let alertItems = [];
    if (data.id && rackDetails && rackDetails[data.id]?.beams) {
        alertItems = rackDetails[data.id].beams.filter(beam => {
            if (!beam.itemName || beam.itemName.trim() === '') return false;
            
            const rackQty = parseInt(beam.qty) || 0;
            
            // 1. Alert if physically empty on the rack
            if (rackQty === 0) return true;

            // 2. Alert if GLOBALLY Low Stock (Total vs Min Threshold)
            if (itemData) {
                const globalItem = itemData.find(i => i.name === beam.itemName);
                if (globalItem) {
                    const totalGlobalQty = parseInt(globalItem.qty) || 0;
                    const minThreshold = parseInt(globalItem.min_threshold) || 5; 
                    
                    if (totalGlobalQty <= minThreshold) {
                        return true;
                    }
                }
            }
            return false;
        });
    }
    const hasAlert = alertItems.length > 0;

    const handleIconEnter = (e) => {
        const stageBox = e.target.getStage().container().getBoundingClientRect();
        const tooltipX = stageBox.left + e.target.getStage().getPointerPosition().x + 15;
        const tooltipY = stageBox.top + e.target.getStage().getPointerPosition().y + 15;
        onHoverAlert({ visible: true, x: tooltipX, y: tooltipY, rackId: data.id, items: alertItems });
    };

    const handleIconLeave = () => {
        onHoverAlert({ visible: false, items: [], rackId: '' });
    };

    const isDark = ['#00008B', '#800080', '#228B22', '#6C757D', '#000000'].includes(fillColor);

    return (
        <Group
            x={x}
            y={y}
            name={`cell-${data.gridX}-${data.gridY}`}
            draggable={isEditMode && !!data.id}
            onDragStart={(e) => onDragStart(e, data)}
            onDragMove={(e) => onDragMove(e, data)}
            onDragEnd={(e) => onDragEnd(e, data)}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onClick={(e) => {
                if (e.evt.defaultPrevented) return;
                onInteract(e);
            }}
            onTap={onInteract}
        >
            <Rect
                width={RACK_SIZE}
                height={RACK_SIZE}
                fill={fillColor}
                stroke={stroke}
                strokeWidth={strokeWidth}
                cornerRadius={4}
                shadowBlur={isHovered || isSelected ? 10 : 0}
                shadowColor="black"
                shadowOpacity={(!data.id && !isEditMode) ? 0 : 1}
            />
            {data.id && <Text text={data.id} width={RACK_SIZE} y={RACK_SIZE / 2 - 6} align="center" fontSize={11} fontStyle="bold" fill={isDark ? 'white' : 'black'} listening={false} />}
            {!data.id && isEditMode && <Text text="+" width={RACK_SIZE} y={RACK_SIZE / 2 - 10} align="center" fontSize={20} fill="#ccc" listening={false} />}

            {hasAlert && !isEditMode && data.id && (
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
}, (prev, next) => {
    return (
        prev.data === next.data &&
        prev.x === next.x &&
        prev.y === next.y &&
        prev.isSelected === next.isSelected &&
        prev.isEditMode === next.isEditMode &&
        prev.isBlinking === next.isBlinking &&
        prev.areaColors === next.areaColors &&
        prev.rackDetails === next.rackDetails &&
        prev.itemData === next.itemData
    );
});

// --- MAIN CONTENT ---
const Admin_hp = () => {
    const navigate = useNavigate();
    const { rackDetails = {}, setRackDetails, headerColor, setHeaderColor, itemData, isTransactionActive, startTransaction, promptFinishTransaction } = useContext(ReportStateContext);
    const [showCheckIn, setShowCheckIn] = useState(false);
    const [showCheckOut, setShowCheckOut] = useState(false);
    const [selectedRackForModal, setSelectedRackForModal] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [blinkingIds, setBlinkingIds] = useState([]);

    const [logo, setLogo] = useState('');
    const [racks, setRacks] = useState([]);
    const [areaColors, setAreaColors] = useState(INITIAL_AREA_COLORS);
    const [isLoading, setIsLoading] = useState(true);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [alertTooltip, setAlertTooltip] = useState({ visible: false, x: 0, y: 0, items: [], rackId: '' });

    const gridLayout = useMemo(() => generateGrid(), []);

    const [isEditMode, setIsEditMode] = useState(false);
    const [selectedGridCells, setSelectedGridCells] = useState([]);
    const [editGroupColor, setEditGroupColor] = useState('#000000');

    const stageRef = useRef(null);
    const dragStartPos = useRef({ x: 0, y: 0 });
    const [selectionRect, setSelectionRect] = useState({ x: 0, y: 0, width: 0, height: 0, visible: false });
    const isSelecting = useRef(false);
    const startPos = useRef({ x: 0, y: 0 });

    const [popup, setPopup] = useState({
        show: false,
        title: '',
        message: '',
        type: 'alert',
        onConfirm: null,
        onCancel: null,
        inputValue: '',
        colorValue: '#000000',
        showColorPicker: false,
        confirmText: 'Confirm',
        cancelText: 'Cancel'
    });

    const fetchMapData = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/settings.php`); 
            const data = await response.json(); 
            
            const racksSetting = data.find(d => d.setting_key === 'map_racks');
            const colorsSetting = data.find(d => d.setting_key === 'map_colors');
            const logoSetting = data.find(d => d.setting_key === 'admin_logo');
            const headerColorSetting = data.find(d => d.setting_key === 'header_color');

            if (racksSetting && racksSetting.setting_value) {
                setRacks(JSON.parse(racksSetting.setting_value));
            }
            if (colorsSetting && colorsSetting.setting_value) {
                setAreaColors(JSON.parse(colorsSetting.setting_value));
            }
            if (logoSetting && logoSetting.setting_value) {
                setLogo(logoSetting.setting_value);
            } else {
                setLogo('https://cdn-icons-png.flaticon.com/512/25/25694.png');
            }
            if (headerColorSetting && headerColorSetting.setting_value) {
                setHeaderColor(headerColorSetting.setting_value);
            }

            setHasUnsavedChanges(false);

        } catch (err) {
            console.error("Error loading map data from DB:", err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchMapData();
    }, []);

    const handleSaveChanges = async (shouldCloseEdit = false) => {
        try {
            const saveRequests = [
                fetch(`${API_BASE_URL}/settings.php`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ setting_key: 'map_racks', setting_value: JSON.stringify(racks) })
                }),
                fetch(`${API_BASE_URL}/settings.php`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ setting_key: 'map_colors', setting_value: JSON.stringify(areaColors) })
                }),
                fetch(`${API_BASE_URL}/settings.php`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ setting_key: 'admin_logo', setting_value: logo })
                }),
                fetch(`${API_BASE_URL}/settings.php`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ setting_key: 'header_color', setting_value: headerColor })
                }),
                fetch(`${API_BASE_URL}/racks.php`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(rackDetails)
                })
            ];

            await Promise.all(saveRequests);

            setHasUnsavedChanges(false);

            if (shouldCloseEdit) {
                setIsEditMode(false);
                setSelectedGridCells([]);
            } else {
                setPopup({
                    show: true,
                    title: 'Saved Successfully',
                    message: 'Map layout, settings, and items have been saved.',
                    type: 'alert',
                    onConfirm: () => setPopup({ ...popup, show: false })
                });
            }

        } catch (error) {
            console.error("Failed to save to DB:", error);
            setPopup({
                show: true,
                title: 'Save Failed',
                message: 'Could not connect to the database server.',
                type: 'alert',
                onConfirm: () => setPopup({ ...popup, show: false })
            });
        }
    };

    const handleToggleEditMode = () => {
        if (isEditMode) {
            if (hasUnsavedChanges) {
                setPopup({
                    show: true,
                    title: 'Unsaved Changes',
                    message: 'You have unsaved changes. Save before exiting?',
                    type: 'confirm',
                    confirmText: 'Save & Exit',
                    cancelText: 'Discard Changes',
                    onConfirm: async () => {
                        await handleSaveChanges(true);
                        setPopup({ ...popup, show: false });
                    },
                    onCancel: () => {
                        setIsLoading(true);
                        fetchMapData().then(() => {
                            setIsEditMode(false);
                            setSelectedGridCells([]);
                            setPopup({ ...popup, show: false });
                        });
                    }
                });
            } else {
                setIsEditMode(false);
                setSelectedGridCells([]);
            }
        } else {
            setIsEditMode(true);
        }
    };

    const handleLogoUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setLogo(reader.result);
                setHasUnsavedChanges(true);
            };
            reader.readAsDataURL(file);
        }
    };

    useEffect(() => {
        if (selectedGridCells.length > 0) {
            const firstCell = selectedGridCells[0];
            const firstRack = racks.find(r => r.gridX === firstCell.gridX && r.gridY === firstCell.gridY);
            if (firstRack && firstRack.area && areaColors[firstRack.area]) {
                const commonArea = firstRack.area;
                const allMatch = selectedGridCells.every(cell => {
                    const r = racks.find(rack => rack.gridX === cell.gridX && rack.gridY === cell.gridY);
                    return r && r.area === commonArea;
                });
                if (allMatch) {
                    setEditGroupColor(areaColors[commonArea]);
                }
            }
        }
    }, [selectedGridCells, racks, areaColors]);

    const areaLabels = useMemo(() => {
        const groups = {};
        racks.forEach(rack => {
            if (rack.status === 'defective') return;
            const areaName = rack.area;
            if (!groups[areaName]) groups[areaName] = { minX: Infinity, minY: Infinity, maxX: -Infinity };
            const pixelX = rack.gridX * TOTAL_CELL_SIZE + GRID_OFFSET_X;
            const pixelY = rack.gridY * TOTAL_CELL_SIZE + GRID_OFFSET_Y;
            if (pixelX < groups[areaName].minX) groups[areaName].minX = pixelX;
            if (pixelY < groups[areaName].minY) groups[areaName].minY = pixelY;
            if (pixelX > groups[areaName].maxX) groups[areaName].maxX = pixelX;
        });

        return Object.entries(groups).map(([name, data]) => ({
            text: name,
            x: data.minX,
            y: data.minY - 25,
            width: (data.maxX - data.minX) + RACK_SIZE
        }));
    }, [racks]);

    const handleSearchChange = (e) => {
        const val = e.target.value;
        setSearchTerm(val);
        if (!val) { setSuggestions([]); return; }
        const allNames = new Set();
        Object.values(rackDetails).forEach(r => r.beams?.forEach(b => { if (b.itemName) allNames.add(b.itemName); }));
        setSuggestions([...allNames].filter(n => n.toLowerCase().includes(val.toLowerCase())));
    };

    const handleSelectSuggestion = (name) => {
        setSearchTerm(name);
        setSuggestions([]);
        const foundIds = [];
        Object.entries(rackDetails).forEach(([id, data]) => {
            if (data.beams?.some(b => b.itemName === name)) foundIds.push(id);
        });
        setBlinkingIds(foundIds);
    };

    const handleCellClick = useCallback((cell, existingRack, e) => {
        if (isEditMode) {
            const isSelected = selectedGridCells.some(s => s.gridX === cell.gridX && s.gridY === cell.gridY);
            if (isSelected) {
                setSelectedGridCells(prev => prev.filter(s => !(s.gridX === cell.gridX && s.gridY === cell.gridY)));
            } else {
                setSelectedGridCells(prev => [...prev, { gridX: cell.gridX, gridY: cell.gridY }]);
            }
        } else if (existingRack) {
            setSelectedRackForModal(existingRack);
            setBlinkingIds([]);
        }
    }, [isEditMode, selectedGridCells]);

    const handleStageMouseDown = (e) => {
        if (!isEditMode) return;
        if (e.target.getClassName() !== 'Stage') return;
        if (!e.evt.shiftKey && !e.evt.ctrlKey) {
            setSelectedGridCells([]);
        }
        isSelecting.current = true;
        const stage = e.target.getStage();
        const ptr = stage.getPointerPosition();
        startPos.current = { x: ptr.x, y: ptr.y };
        setSelectionRect({ x: ptr.x, y: ptr.y, width: 0, height: 0, visible: true });
    };

    const handleStageMouseMove = (e) => {
        if (!isSelecting.current || !isEditMode) return;
        const stage = e.target.getStage();
        const ptr = stage.getPointerPosition();
        setSelectionRect({
            x: Math.min(startPos.current.x, ptr.x),
            y: Math.min(startPos.current.y, ptr.y),
            width: Math.abs(ptr.x - startPos.current.x),
            height: Math.abs(ptr.y - startPos.current.y),
            visible: true
        });
    };

    const handleStageMouseUp = (e) => {
        if (!isSelecting.current || !isEditMode) return;
        isSelecting.current = false;
        const sr = selectionRect;

        if (sr.width > 5 && sr.height > 5) {
            const selected = [];
            gridLayout.forEach(cell => {
                const cx = cell.x;
                const cy = cell.y;
                if (
                    sr.x < cx + RACK_SIZE && sr.x + sr.width > cx &&
                    sr.y < cy + RACK_SIZE && sr.y + sr.height > cy
                ) {
                    selected.push({ gridX: cell.gridX, gridY: cell.gridY });
                }
            });

            if (e.evt.shiftKey || e.evt.ctrlKey) {
                const newSelection = [...selectedGridCells];
                selected.forEach(s => {
                    if (!newSelection.some(ns => ns.gridX === s.gridX && ns.gridY === s.gridY)) {
                        newSelection.push(s);
                    }
                });
                setSelectedGridCells(newSelection);
            } else {
                setSelectedGridCells(selected);
            }
        }
        setSelectionRect({ ...selectionRect, visible: false });
    };

    const handleDragStart = useCallback((e, rackData) => {
        const isAlreadySelected = selectedGridCells.some(s => s.gridX === rackData.gridX && s.gridY === rackData.gridY);
        if (!isAlreadySelected) {
            setSelectedGridCells([{ gridX: rackData.gridX, gridY: rackData.gridY }]);
        }
        dragStartPos.current = { x: e.target.x(), y: e.target.y() };
    }, [selectedGridCells]);

    const handleDragMove = useCallback((e, rackData) => {
        const currentX = e.target.x();
        const currentY = e.target.y();
        const dx = currentX - dragStartPos.current.x;
        const dy = currentY - dragStartPos.current.y;

        selectedGridCells.forEach(cell => {
            if (cell.gridX === rackData.gridX && cell.gridY === rackData.gridY) return;
            const nodeName = `.cell-${cell.gridX}-${cell.gridY}`;
            const node = stageRef.current.findOne(nodeName);
            if (node) {
                const originalX = cell.gridX * TOTAL_CELL_SIZE + GRID_OFFSET_X;
                const originalY = cell.gridY * TOTAL_CELL_SIZE + GRID_OFFSET_Y;
                node.position({
                    x: originalX + dx,
                    y: originalY + dy
                });
            }
        });
    }, [selectedGridCells]);

    const handleDragEnd = useCallback((e, rackData) => {
        if (!isEditMode) return;
        const finalX = e.target.x();
        const finalY = e.target.y();
        const newGridX = Math.round((finalX - GRID_OFFSET_X) / TOTAL_CELL_SIZE);
        const newGridY = Math.round((finalY - GRID_OFFSET_Y) / TOTAL_CELL_SIZE);

        const deltaX = newGridX - rackData.gridX;
        const deltaY = newGridY - rackData.gridY;

        let isBlocked = false;
        
        let itemsToMove = selectedGridCells;
        const isSelected = selectedGridCells.some(s => s.gridX === rackData.gridX && s.gridY === rackData.gridY);
        if (!isSelected) itemsToMove = [{ gridX: rackData.gridX, gridY: rackData.gridY }];

        itemsToMove.forEach(cell => {
            const rackObj = racks.find(r => r.gridX === cell.gridX && r.gridY === cell.gridY);
            if (rackObj && rackObj.id && rackDetails[rackObj.id]) {
                const beams = rackDetails[rackObj.id].beams || [];
                const totalQty = beams.reduce((sum, b) => sum + (parseInt(b.qty) || 0), 0);
                if (totalQty > 0) {
                    isBlocked = true;
                }
            }
        });

        if (isBlocked) {
            e.target.to({
                x: rackData.gridX * TOTAL_CELL_SIZE + GRID_OFFSET_X,
                y: rackData.gridY * TOTAL_CELL_SIZE + GRID_OFFSET_Y,
                duration: 0.2
            });
            selectedGridCells.forEach(cell => {
                if (cell.gridX === rackData.gridX && cell.gridY === rackData.gridY) return;
                const node = stageRef.current.findOne(`.cell-${cell.gridX}-${cell.gridY}`);
                if (node) {
                    node.to({
                        x: cell.gridX * TOTAL_CELL_SIZE + GRID_OFFSET_X,
                        y: cell.gridY * TOTAL_CELL_SIZE + GRID_OFFSET_Y,
                        duration: 0.2
                    });
                }
            });

            setPopup({
                show: true,
                title: 'Action Denied',
                message: 'Cannot move rack(s) because they contain items. Please empty them first.',
                type: 'alert',
                onConfirm: () => setPopup(prev => ({ ...prev, show: false }))
            });
            return;
        }

        e.target.to({ x: rackData.gridX * TOTAL_CELL_SIZE + GRID_OFFSET_X, y: rackData.gridY * TOTAL_CELL_SIZE + GRID_OFFSET_Y, duration: 0 });

        selectedGridCells.forEach(cell => {
            if (cell.gridX === rackData.gridX && cell.gridY === rackData.gridY) return;
            const node = stageRef.current.findOne(`.cell-${cell.gridX}-${cell.gridY}`);
            if (node) {
                node.to({
                    x: cell.gridX * TOTAL_CELL_SIZE + GRID_OFFSET_X,
                    y: cell.gridY * TOTAL_CELL_SIZE + GRID_OFFSET_Y,
                    duration: 0
                });
            }
        });

        if (deltaX === 0 && deltaY === 0) return;

        let isValidMove = true;
        const newPositions = [];
        itemsToMove.forEach(cell => {
            const targetX = cell.gridX + deltaX;
            const targetY = cell.gridY + deltaY;
            if (targetX < 0 || targetY < 0) { isValidMove = false; return; }
            const existing = racks.find(r => r.gridX === targetX && r.gridY === targetY);
            const isPartOfSelection = itemsToMove.some(s => s.gridX === targetX && s.gridY === targetY);
            if (existing && !isPartOfSelection) {
                isValidMove = false;
            }
            newPositions.push({ oldX: cell.gridX, oldY: cell.gridY, newX: targetX, newY: targetY });
        });

        if (!isValidMove) return;

        const updatedRackDetails = { ...rackDetails };

        const updatedRacks = racks.map(r => {
            const moveInfo = newPositions.find(np => np.oldX === r.gridX && np.oldY === r.gridY);
            if (moveInfo) {
                let newId = r.id;
                const parts = r.id.split('-');
                if (parts.length >= 3) {
                    const prefix = parts.slice(0, parts.length - 2).join('-');
                    newId = `${prefix}-${moveInfo.newX}-${moveInfo.newY}`;
                }
                
                if (r.id !== newId) {
                    if (updatedRackDetails[r.id]) {
                        updatedRackDetails[newId] = updatedRackDetails[r.id]; 
                        delete updatedRackDetails[r.id]; 
                    }
                }

                return { 
                    ...r, 
                    gridX: moveInfo.newX, 
                    gridY: moveInfo.newY,
                    id: newId 
                };
            }
            return r;
        });

        const updatedSelection = itemsToMove.map(cell => {
            const moveInfo = newPositions.find(np => np.oldX === cell.gridX && np.oldY === cell.gridY);
            return { gridX: moveInfo.newX, gridY: moveInfo.newY };
        });

        setRacks(updatedRacks);
        if (setRackDetails) {
            setRackDetails(updatedRackDetails);
        }
        setSelectedGridCells(updatedSelection);
        setHasUnsavedChanges(true);
    }, [isEditMode, racks, selectedGridCells, rackDetails, setRackDetails]);

    const handleLabelClick = (oldName) => {
        if (!isEditMode) return;
        const existingColor = areaColors[oldName] || '#000000';
        setPopup({
            show: true,
            title: 'Edit Group',
            message: `Edit name and color for "${oldName}".`,
            type: 'prompt',
            inputValue: oldName,
            showColorPicker: true,
            colorValue: existingColor,
            onConfirm: (newName, newColor) => {
                if (!newName || newName.trim() === '') {
                    setPopup({ 
                        show: true, title: 'Error', message: 'Name cannot be empty.', type: 'alert', 
                        onConfirm: () => setPopup({ ...popup, show: false }) 
                    });
                    return;
                }
                const normalizedName = newName.trim();
                const normalizedColor = normalizeColor(newColor);
                
                const existingKey = Object.keys(areaColors).find(k => k.toLowerCase() === normalizedName.toLowerCase());
                let finalName = normalizedName;
                let finalColor = normalizedColor;

                if (existingKey && existingKey.toLowerCase() !== oldName.toLowerCase()) {
                    finalName = existingKey;
                    finalColor = areaColors[existingKey]; 
                } else {
                    const isTaken = Object.entries(areaColors).some(([key, col]) => {
                        if (key === oldName) return false; 
                        return normalizeColor(col) === normalizedColor;
                    });
                    if (isTaken) {
                        setPopup({ 
                            show: true, title: 'Error', message: `The color ${newColor} is already used.`, type: 'alert', 
                            onConfirm: () => setPopup({ ...popup, show: false }) 
                        });
                        return;
                    }
                }

                const updatedRacks = racks.map(rack => {
                    if (rack.area === oldName) {
                        return {
                            ...rack,
                            area: finalName,
                            customColor: finalColor,
                            id: `${finalName.slice(0, 3).toUpperCase()}-${rack.gridX}-${rack.gridY}`
                        };
                    }
                    return rack;
                });

                const newColors = { ...areaColors };
                if (finalName !== oldName) {
                    delete newColors[oldName];
                }
                newColors[finalName] = finalColor;

                setRacks(updatedRacks);
                setAreaColors(newColors);
                setHasUnsavedChanges(true);
                setPopup({ ...popup, show: false });
            },
            onCancel: () => setPopup({ ...popup, show: false })
        });
    };

    const handleAddBoxes = () => {
        if (selectedGridCells.length === 0) return;
        const newRacks = [...racks];
        let addedCount = 0;
        selectedGridCells.forEach(cell => {
            const exists = newRacks.some(r => r.gridX === cell.gridX && r.gridY === cell.gridY);
            if (!exists) {
                newRacks.push({
                    id: `RACK-${cell.gridX}-${cell.gridY}`,
                    area: 'default',
                    status: 'default',
                    gridX: cell.gridX,
                    gridY: cell.gridY,
                    customColor: INITIAL_AREA_COLORS['default']
                });
                addedCount++;
            }
        });
        if (addedCount === 0) {
            setPopup({
                show: true,
                title: 'Selection Already Occupied',
                message: 'Boxes already exist in the selected area.',
                type: 'alert',
                onConfirm: () => setPopup(prev => ({ ...prev, show: false }))
            });
        } else {
            setRacks(newRacks);
            setSelectedGridCells([]);
            setHasUnsavedChanges(true);
        }
    };

    const handleDeleteBoxes = () => {
        if (selectedGridCells.length === 0) return;
        let failCount = 0;
        const newRacks = racks.filter(rack => {
            const isSelected = selectedGridCells.some(s => s.gridX === rack.gridX && s.gridY === rack.gridY);
            if (isSelected) {
                const hasItems = rack.id && rackDetails[rack.id]?.beams?.some(b => b.itemName && parseInt(b.qty) > 0);
                if (hasItems) {
                    failCount++;
                    return true;
                }
                return false;
            }
            return true;
        });

        if (failCount > 0) {
            setPopup({
                show: true,
                title: 'Delete Failed',
                message: `Cannot delete ${failCount} boxes because they contain items.`,
                type: 'alert',
                onConfirm: () => setPopup(prev => ({ ...prev, show: false }))
            });
        }

        const activeAreas = new Set(newRacks.map(r => r.area));
        const newColors = {};
        Object.keys(areaColors).forEach(key => {
            if (key === 'default' || key === 'Empty' || activeAreas.has(key)) {
                newColors[key] = areaColors[key];
            }
        });
        setAreaColors(newColors);
        setRacks(newRacks);
        setSelectedGridCells([]);
        setHasUnsavedChanges(true);
    };

    const handleGroup = () => {
        if (selectedGridCells.length === 0) return;
        const validCells = selectedGridCells.filter(cell =>
            racks.some(r => r.gridX === cell.gridX && r.gridY === cell.gridY)
        );

        if (validCells.length === 0) {
            setPopup({
                show: true,
                title: 'No Boxes Selected',
                message: "Please add boxes first before grouping them.",
                type: 'alert',
                onConfirm: () => setPopup(prev => ({ ...prev, show: false }))
            });
            return;
        }

        setPopup({
            show: true,
            title: 'Group Name',
            message: 'Enter the name for this area:',
            type: 'prompt',
            inputValue: '',
            showColorPicker: false,
            onConfirm: (name) => {
                if (!name) return;
                const inputName = name.trim();
                const existingGroupKey = Object.keys(areaColors).find(
                    key => key.toLowerCase() === inputName.toLowerCase()
                );

                let finalColor;
                let finalName = inputName;

                if (existingGroupKey) {
                    finalName = existingGroupKey;
                    finalColor = areaColors[existingGroupKey];
                } else {
                    const selectedColor = normalizeColor(editGroupColor);
                    const isColorTaken = Object.values(areaColors).some(c => normalizeColor(c) === selectedColor);
                    if (isColorTaken) {
                        setPopup({ 
                            show: true, title: 'Error', message: `The color ${editGroupColor} is already used.`, type: 'alert', 
                            onConfirm: () => setPopup({ ...popup, show: false }) 
                        });
                        return;
                    }
                    finalColor = selectedColor;
                }

                setAreaColors(prev => ({ ...prev, [finalName]: finalColor }));

                const newRacks = racks.map(rack => {
                    const isSelected = selectedGridCells.some(s => s.gridX === rack.gridX && s.gridY === rack.gridY);
                    if (isSelected) {
                        return {
                            ...rack,
                            area: finalName,
                            customColor: finalColor,
                            id: `${finalName.slice(0, 3).toUpperCase()}-${rack.gridX}-${rack.gridY}`
                        };
                    }
                    return rack;
                });

                setRacks(newRacks);
                setSelectedGridCells([]);
                setHasUnsavedChanges(true);
                setPopup({ ...popup, show: false });
            },
            onCancel: () => setPopup({ ...popup, show: false })
        });
    };

    const handleUngroup = () => {
        if (selectedGridCells.length === 0) return;
        const newRacks = racks.map(rack => {
            const isSelected = selectedGridCells.some(s => s.gridX === rack.gridX && s.gridY === rack.gridY);
            if (isSelected) {
                return {
                    ...rack,
                    area: 'default',
                    customColor: INITIAL_AREA_COLORS['default']
                };
            }
            return rack;
        });

        const activeAreas = new Set(newRacks.map(r => r.area));
        const newColors = {};
        Object.keys(areaColors).forEach(key => {
            if (key === 'default' || key === 'Empty' || activeAreas.has(key)) {
                newColors[key] = areaColors[key];
            }
        });
        setRacks(newRacks);
        setAreaColors(newColors);
        setSelectedGridCells([]);
        setHasUnsavedChanges(true);
    };

    const handleLogout = () => {
        localStorage.removeItem('currentUser');
        navigate('/');
    };

    if (isLoading) {
        return <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>Loading Map from Server...</div>;
    }

    return (
        <div className="admin-hp-wrapper">
            <div className="admin-hp-sidebar">
                <div className="admin-hp-nav-item" onClick={() => navigate('/dashboard')}>
                    <div className="admin-hp-nav-icon">
                        <ion-icon name="stats-chart-outline" style={{ fontSize: '30px' }}></ion-icon>
                    </div>
                    <span className="admin-hp-nav-text">Dashboard</span>
                </div>
                <div className="admin-hp-nav-item selected">
                    <div className="admin-hp-nav-icon"><ion-icon name="map-outline" style={{ fontSize: '30px' }}></ion-icon></div>
                    <span className="admin-hp-nav-text">2D Map</span>
                </div>
                <div className="admin-hp-nav-item" onClick={() => navigate('/report-itemlist')}>
                    <div className="admin-hp-nav-icon"><ion-icon name="clipboard-outline" style={{ fontSize: '30px' }}></ion-icon></div>
                    <span className="admin-hp-nav-text">Reports</span>
                </div>
                <div className="admin-hp-nav-item" onClick={() => navigate('/manage-users')}>
                    <div className="admin-hp-nav-icon"><ion-icon name="people-outline"></ion-icon></div>
                    <span className="admin-hp-nav-text">Manage Users</span>
                </div>

                {/* --- CONFIGURATION BUTTON ADDED HERE --- */}
                <div className="admin-hp-nav-item" onClick={() => navigate('/configuration')}>
                    <div className="admin-hp-nav-icon"><ion-icon name="settings-outline"></ion-icon></div>
                    <span className="admin-hp-nav-text">Configuration</span>
                </div>

                <div className="admin-hp-nav-item" onClick={handleLogout} style={{ marginTop: 'auto', marginBottom: '20px' }}>
                    <div className="admin-hp-nav-icon" style={{ color: '#dc3545' }}><ion-icon name="log-out-outline"></ion-icon></div>
                    <span className="admin-hp-nav-text" style={{ color: '#dc3545' }}>Logout</span>
                </div>
            </div>

            <div className="admin-hp-main-content">
                <div className="admin-hp-container">
                    <div className="admin-hp-header" style={{ background: headerColor || '#ffffff', transition: 'background 0.3s' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <img
                                    src={logo}
                                    alt="Logo"
                                    style={{ height: '50px', width: '50px', objectFit: 'contain' }}
                                />
                                {isEditMode && (
                                    <label style={{ cursor: 'pointer', marginTop: '5px', fontSize: '10px', color: '#007bff' }}>
                                        Change
                                        <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
                                    </label>
                                )}
                            </div>
                            <h1 className="admin-hp-main-title">Warehouse Layout</h1>
                        </div>
                        <div className="admin-hp-search-controls">
                            <div style={{ position: 'relative' }}>
                                <input type="text" placeholder="Search item..." className="admin-hp-search-input" value={searchTerm} onChange={handleSearchChange} />
                                {suggestions.length > 0 && (
                                    <ul className="search-suggestions">
                                        {suggestions.map((s, i) => (<li key={i} onClick={() => handleSelectSuggestion(s)}>{s}</li>))}
                                    </ul>
                                )}
                            </div>
                            
                            {!isTransactionActive ? (
                                <button className="btn-action" onClick={startTransaction} style={{ background: '#28a745', color: 'white', fontWeight: 'bold' }}>
                                    <ion-icon name="play-circle-outline"></ion-icon> Start Transaction
                                </button>
                            ) : (
                                <button className="btn-action" onClick={promptFinishTransaction} style={{ background: '#ffc107', color: 'black', fontWeight: 'bold' }}>
                                    <ion-icon name="checkmark-done-circle-outline"></ion-icon> Done (Save)
                                </button>
                            )}

                            <button 
                                className="btn-action check-in" 
                                onClick={() => isTransactionActive ? setShowCheckIn(true) : alert('Please start a transaction first.')}
                                style={{ opacity: isTransactionActive ? 1 : 0.5, cursor: isTransactionActive ? 'pointer' : 'not-allowed' }}
                            >
                                Check-In
                            </button>
                            <button 
                                className="btn-action check-out" 
                                onClick={() => isTransactionActive ? setShowCheckOut(true) : alert('Please start a transaction first.')}
                                style={{ opacity: isTransactionActive ? 1 : 0.5, cursor: isTransactionActive ? 'pointer' : 'not-allowed' }}
                            >
                                Check-Out
                            </button>
                        </div>
                    </div>

                    <div className="edit-toolbar-container">
                        <div className="toggle-wrapper">
                            <span>Edit Mode: </span>
                            <label className="switch">
                                <input type="checkbox" checked={isEditMode} onChange={handleToggleEditMode} />
                                <span className="slider round"></span>
                            </label>
                        </div>

                        {isEditMode && (
                            <div className="edit-actions">
                                <div className="color-picker-group" style={{ marginRight: '15px', border: '1px solid #17a2b8' }}>
                                    <span style={{ fontSize: '12px', paddingLeft: '5px', fontWeight: 'bold', color: '#17a2b8' }}>Header BG:</span>
                                    <input type="color" value={headerColor} onChange={(e) => { setHeaderColor(e.target.value); setHasUnsavedChanges(true); }} />
                                </div>

                                <div className="color-picker-group">
                                    <span style={{ fontSize: '12px', paddingLeft: '5px', fontWeight: 'bold' }}>Box Color:</span>
                                    <input type="color" value={editGroupColor} onChange={(e) => setEditGroupColor(e.target.value)} />
                                    <input type="text" value={editGroupColor} onChange={(e) => setEditGroupColor(e.target.value)} className="hex-input" maxLength={7} />
                                </div>

                                <button className="btn-edit" onClick={handleAddBoxes} style={{ backgroundColor: '#17a2b8', color: 'white', marginRight: '5px' }} title="Create empty boxes">Add Box</button>
                                <button className="btn-edit" onClick={handleDeleteBoxes} style={{ backgroundColor: '#dc3545', color: 'white', marginRight: '15px' }} title="Delete selected boxes">Del Box</button>
                                <button className="btn-edit" onClick={handleGroup} style={{ backgroundColor: '#007bff', color: 'white', marginRight: '5px' }} title="Apply color/label to boxes">Group</button>
                                <button className="btn-edit" onClick={handleUngroup} style={{ backgroundColor: '#6c757d', color: 'white' }} title="Remove color/label">Ungroup</button>
                                <button className="btn-edit save" onClick={() => handleSaveChanges(false)} style={{ backgroundColor: '#28a745', color: 'white', marginLeft: '15px' }}>Save Layout</button>
                                
                                <span className="selection-info">{selectedGridCells.length} Selected</span>
                            </div>
                        )}
                    </div>

                    {alertTooltip.visible && (
                        <div className="custom-alert-tooltip" style={{ top: alertTooltip.y, left: alertTooltip.x }}>
                            <h4>{alertTooltip.rackId} - Attention Needed</h4>
                            <ul>
                                {alertTooltip.items.map((beam, idx) => {
                                    // REVISED TOOLTIP DISPLAY LOGIC
                                    let statusText = "";
                                    let globalInfo = null;

                                    if (itemData) {
                                        globalInfo = itemData.find(i => i.name === beam.itemName);
                                    }

                                    const rackQty = parseInt(beam.qty);
                                    
                                    if (rackQty === 0) {
                                        statusText = "EMPTY";
                                    } else if (globalInfo) {
                                        const globalQty = parseInt(globalInfo.qty) || 0;
                                        const minThresh = parseInt(globalInfo.min_threshold) || 5;
                                        if (globalQty <= minThresh) {
                                            statusText = `LOW STOCK (Global: ${globalQty})`;
                                        } else {
                                            // Should not typically trigger alert, but safe fallback
                                            statusText = `Qty: ${rackQty}`;
                                        }
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

                    {!isEditMode && (
                        <div className="legend-container">
                            {Object.entries(areaColors).map(([name, color]) => (
                                name !== 'Empty' && name !== 'default' && (
                                    <div key={name} className="legend-item"><span className="legend-color" style={{ background: color }}></span><span>{name}</span></div>
                                )
                            ))}
                        </div>
                    )}

                    <div className="admin-hp-konva-stage-container">
                        <Stage width={STAGE_WIDTH} height={STAGE_HEIGHT} ref={stageRef} onMouseDown={handleStageMouseDown} onMouseMove={handleStageMouseMove} onMouseUp={handleStageMouseUp}>
                            <Layer>
                                {gridLayout.map((cell) => {
                                    const rackData = racks.find(r => r.gridX === cell.gridX && r.gridY === cell.gridY) || { gridX: cell.gridX, gridY: cell.gridY, id: null, area: '' };
                                    const isSelected = selectedGridCells.some(s => s.gridX === cell.gridX && s.gridY === cell.gridY);
                                    return (
                                        <Rack
                                            key={`cell-${cell.gridX}-${cell.gridY}`}
                                            x={cell.x}
                                            y={cell.y}
                                            data={rackData}
                                            isEditMode={isEditMode}
                                            isSelected={isSelected}
                                            isBlinking={rackData.id && blinkingIds.includes(rackData.id)}
                                            rackDetails={rackDetails}
                                            areaColors={areaColors}
                                            itemData={itemData} // PASSED GLOBAL DATA TO RACK
                                            onInteract={(e) => handleCellClick(cell, rackData.id ? rackData : null, e)}
                                            onDragStart={handleDragStart}
                                            onDragMove={handleDragMove}
                                            onDragEnd={handleDragEnd}
                                            onHoverAlert={setAlertTooltip}
                                        />
                                    );
                                })}
                                {selectionRect.visible && (
                                    <Rect x={selectionRect.x} y={selectionRect.y} width={selectionRect.width} height={selectionRect.height} fill="rgba(0, 123, 255, 0.3)" stroke="#007bff" strokeWidth={1} dash={[4, 4]} listening={false} />
                                )}
                                {isEditMode && areaLabels.map((label, idx) => (
                                    <Label key={`label-${idx}`} x={label.x} y={label.y} onClick={() => handleLabelClick(label.text)} onTap={() => handleLabelClick(label.text)} onMouseEnter={(e) => { if (isEditMode) e.target.getStage().container().style.cursor = "pointer"; }} onMouseLeave={(e) => { e.target.getStage().container().style.cursor = "default"; }}>
                                        <Tag fill="rgba(255, 255, 255, 0.9)" stroke="#ccc" cornerRadius={4} shadowColor="black" shadowBlur={2} shadowOpacity={0.1} />
                                        <Text text={label.text} fontSize={16} fontStyle="bold" fontFamily="Segoe UI" fill="#333" padding={5} width={label.width} wrap="word" align="center" />
                                    </Label>
                                ))}
                            </Layer>
                        </Stage>
                    </div>
                </div>
            </div>
            {popup.show && (
                <ModernPopup
                    {...popup}
                    setInputValue={(val) => setPopup({ ...popup, inputValue: val })}
                    setColorValue={(val) => setPopup({ ...popup, colorValue: val })}
                    onConfirm={() => popup.onConfirm(popup.inputValue, popup.colorValue)}
                    onCancel={popup.onCancel}
                />
            )}
            {selectedRackForModal && <RackDetailsModal_Admin rack={selectedRackForModal} onClose={() => setSelectedRackForModal(null)} />}
            {showCheckIn && <div className="modal-overlay"><Checkin onClose={() => setShowCheckIn(false)} /></div>}
            {showCheckOut && <div className="modal-overlay"><Checkout onClose={() => setShowCheckOut(false)} /></div>}
        </div>
    );
};

export default Admin_hp;