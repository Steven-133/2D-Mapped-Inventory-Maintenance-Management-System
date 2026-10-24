import { useNavigate } from 'react-router-dom';
import React, { useState, useMemo, useContext, useEffect, useRef } from 'react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import JsBarcode from 'jsbarcode';
import Barcode from 'react-barcode';

// *** IMPORT QR LIBRARIES ***
import QRCode from 'qrcode'; 
import { QRCodeSVG } from 'qrcode.react'; 

import './Report_Itemlist.css';
import { ReportStateProvider, ReportStateContext } from './LocalStorageContext';
import AddItemModal from './AddItemModal';
import EditItemModal from './EditItemModal';
import RemoveItemModal from './RemoveItemModal';
import ActionBlockedModal from './ActionBlockedModal';

/* --- HELPER: Calculate Expiry Status --- */
const getLifespanState = (dateAdded, lifespanStr) => {
  if (!dateAdded || !lifespanStr) return 'unknown';
  if (lifespanStr.toLowerCase().includes('life') || lifespanStr.toLowerCase().includes('n/a')) return 'good';

  const added = new Date(dateAdded);
  const expiry = new Date(added);
  let foundAny = false;

  const yMatch = lifespanStr.match(/(\d+)\s*y/i);
  const mMatch = lifespanStr.match(/(\d+)\s*m/i);
  const dMatch = lifespanStr.match(/(\d+)\s*d/i);

  if (yMatch) { expiry.setFullYear(expiry.getFullYear() + parseInt(yMatch[1])); foundAny = true; }
  if (mMatch) { expiry.setMonth(expiry.getMonth() + parseInt(mMatch[1])); foundAny = true; }
  if (dMatch) { expiry.setDate(expiry.getDate() + parseInt(dMatch[1])); foundAny = true; }

  if (!foundAny) return 'unknown';

  const now = new Date();
  const diffTime = expiry - now;
  const daysLeft = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffTime < 0) return 'expired';
  if (daysLeft <= 30) return 'expiring'; 
  return 'good';
};

/* --- COMPONENT: Details Popup for Grouped Items --- */
const GroupDetailsModal = ({ isOpen, onClose, groupData }) => {
  if (!isOpen || !groupData) return null;

  const overlayStyle = {
    position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
    backgroundColor: 'rgba(0, 0, 0, 0.6)', zIndex: 10000,
    display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(2px)'
  };
  const modalStyle = {
    backgroundColor: '#fff', borderRadius: '12px', width: '900px', maxWidth: '95%', maxHeight: '85vh',
    display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', overflow: 'hidden'
  };

  const renderLifespan = (dateAdded, lifespanStr) => {
    if (!dateAdded || !lifespanStr) return <span style={{ color: '#ccc' }}>-</span>;
    const match = lifespanStr.match(/(\d+)\s*(year|month|day|week)/i);
    if (!match) return <span>{lifespanStr}</span>;
    
    const val = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    const added = new Date(dateAdded);
    const expiry = new Date(added);
    
    if (unit.startsWith('year')) expiry.setFullYear(expiry.getFullYear() + val);
    else if (unit.startsWith('month')) expiry.setMonth(expiry.getMonth() + val);
    else if (unit.startsWith('week')) expiry.setDate(expiry.getDate() + (val * 7));
    else if (unit.startsWith('day')) expiry.setDate(expiry.getDate() + val);
    
    const now = new Date();
    const diffTime = expiry - now;

    if (diffTime < 0) {
      const diffDays = Math.ceil(Math.abs(diffTime) / (1000 * 60 * 60 * 24));
      return <span style={{ color: '#dc3545', fontWeight: 'bold' }}>Expired ({diffDays} days ago)</span>;
    }

    const totalDaysLeft = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const years = Math.floor(totalDaysLeft / 365);
    const months = Math.floor((totalDaysLeft % 365) / 30);
    const days = Math.floor((totalDaysLeft % 365) % 30);

    let timeString = [];
    if (years > 0) timeString.push(`${years} yr${years > 1 ? 's' : ''}`);
    if (months > 0) timeString.push(`${months} mo${months > 1 ? 's' : ''}`);
    if (days > 0) timeString.push(`${days} d`);
    
    const finalString = timeString.join(' ') || "Due Today";

    let color = '#28a745'; 
    if (totalDaysLeft <= 30) color = '#fd7e14'; 
    if (totalDaysLeft <= 7) color = '#d63384'; 

    return <span style={{ color: color, fontWeight: '500' }}>{finalString}</span>;
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '20px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, color: '#333' }}>{groupData.name}</h3>
            <span style={{ color: '#666', fontSize: '14px' }}>SKU: <strong>{groupData.model}</strong></span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#555' }}>
            <ion-icon name="close-outline"></ion-icon>
          </button>
        </div>
        
        <div style={{ padding: '20px', overflowY: 'auto' }}>
          <table className="report-table" style={{ width: '100%', fontSize: '14px' }}>
            <thead>
              <tr style={{ background: '#f8f9fa', textAlign: 'left' }}>
                <th style={{ padding: '10px' }}>Serial / Batch #</th>
                <th style={{ padding: '10px' }}>Qty</th>
                <th style={{ padding: '10px' }}>Placed</th>
                <th style={{ padding: '10px' }}>Unplaced</th>
                <th style={{ padding: '10px' }}>Location</th>
                <th style={{ padding: '10px' }}>Lifespan Status</th>
              </tr>
            </thead>
            <tbody>
              {groupData.subItems.map((item, idx) => (
                <tr key={item.id || idx} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '10px', fontWeight: '500' }}>{item.serialNum || '-'}</td>
                  <td style={{ padding: '10px' }}>{item.qty} {item.unit}</td>
                  <td style={{ padding: '10px', color: 'green' }}>{item.qtyPlaced}</td>
                  <td style={{ padding: '10px', color: item.qtyUnplaced > 0 ? '#dc3545' : '#888' }}>{item.qtyUnplaced}</td>
                  <td style={{ padding: '10px', fontSize: '12px' }}>{item.rack}</td>
                  <td style={{ padding: '10px' }}>{renderLifespan(item.dateAdded, item.lifespan)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        <div style={{ padding: '15px 20px', background: '#f8f9fa', borderTop: '1px solid #eee', textAlign: 'right' }}>
           <span style={{ fontSize: '12px', color: '#888' }}>Total Batches: {groupData.subItems.length}</span>
        </div>
      </div>
    </div>
  );
};

/* --- MAIN COMPONENT --- */
const Report_ItemlistContent = () => {
  const navigate = useNavigate();
  const { itemData, summaryData, removeItems, restoreItems, rackDetails, validateItemDeletion, headerColor, codeType } = useContext(ReportStateContext);
  
  const [logo] = useState(() => {
    return localStorage.getItem('admin_logo') || 'https://cdn-icons-png.flaticon.com/512/25/25694.png';
  });

  const [activeTab, setActiveTab] = useState('summary'); 
  const [selectedNav, setSelectedNav] = useState('report');
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const session = localStorage.getItem('currentUser');
    if (session) {
      try {
        setCurrentUser(JSON.parse(session));
      } catch (e) {
        console.error("Error parsing current user", e);
      }
    }
  }, []);

  const [searchQuery, setSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchWrapperRef = useRef(null);
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isRemoveModalOpen, setIsRemoveModalOpen] = useState(false);
  const [isBlockedModalOpen, setIsBlockedModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false); 
  const [itemToEdit, setItemToEdit] = useState(null); 

  const [blockedItemsList, setBlockedItemsList] = useState([]);
  
  const [selectedItems, setSelectedItems] = useState({});
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [inventoryFilter, setInventoryFilter] = useState('all'); 
  const [showArchived, setShowArchived] = useState(false);

  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef(null);

  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [selectedGroupData, setSelectedGroupData] = useState(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target)) {
        setShowExportMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [searchWrapperRef, exportMenuRef]);

  const resolveUpdatedBy = (val) => {
    if (!val) return '-';
    if (String(val) === '[object Object]') return 'System';
    if (typeof val === 'object') return val.name || val.username || 'System';
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (trimmed.startsWith('{')) {
        try {
          const parsed = JSON.parse(val);
          return parsed.name || parsed.username || 'System';
        } catch (e) { return val; }
      }
      return val;
    }
    return String(val);
  };

  const getLifespanStatus = (dateAdded, lifespanStr) => {
    if (!dateAdded || !lifespanStr) return <span style={{ color: '#ccc' }}>-</span>;
    if (lifespanStr.toLowerCase().includes('life') || lifespanStr.toLowerCase().includes('n/a')) {
        return <span style={{ color: '#28a745', fontWeight: 'bold' }}>Lifetime</span>;
    }

    const added = new Date(dateAdded);
    const expiry = new Date(added);
    let foundAny = false;

    const yMatch = lifespanStr.match(/(\d+)\s*y/i); 
    const mMatch = lifespanStr.match(/(\d+)\s*m/i); 
    const dMatch = lifespanStr.match(/(\d+)\s*d/i); 

    if (yMatch) { expiry.setFullYear(expiry.getFullYear() + parseInt(yMatch[1])); foundAny = true; }
    if (mMatch) { expiry.setMonth(expiry.getMonth() + parseInt(mMatch[1])); foundAny = true; }
    if (dMatch) { expiry.setDate(expiry.getDate() + parseInt(dMatch[1])); foundAny = true; }

    if (!foundAny) return <span>{lifespanStr}</span>;

    const now = new Date();
    const diffTime = expiry - now;
    
    if (diffTime < 0) {
      const diffDays = Math.ceil(Math.abs(diffTime) / (1000 * 60 * 60 * 24));
      return (
        <span style={{ color: '#dc3545', fontWeight: 'bold', fontSize: '13px' }}>
           Expired <br/> ({diffDays} days ago)
        </span>
      );
    }

    const totalDaysLeft = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    const years = Math.floor(totalDaysLeft / 365);
    const months = Math.floor((totalDaysLeft % 365) / 30);
    const days = Math.floor((totalDaysLeft % 365) % 30);

    let timeString = [];
    if (years > 0) timeString.push(`${years}y`);
    if (months > 0) timeString.push(`${months}m`);
    if (days > 0) timeString.push(`${days}d`);
    
    const finalString = timeString.join(' ') || "Due Today";

    let color = '#28a745'; 
    let fontWeight = 'normal';
    
    if (totalDaysLeft <= 180) { color = '#17a2b8'; } 
    if (totalDaysLeft <= 90)  { color = '#d39e00'; } 
    if (totalDaysLeft <= 30)  { color = '#fd7e14'; fontWeight = 'bold'; } 
    if (totalDaysLeft <= 7)   { color = '#dc3545'; fontWeight = 'bold'; } 

    return (
      <div style={{ lineHeight: '1.2' }}>
        <span style={{ color: color, fontWeight: fontWeight }}>{finalString}</span>
      </div>
    );
  };

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const findItemLocations = (itemObj) => {
    if (!rackDetails) return null;
    
    const targetId = itemObj.id ? String(itemObj.id) : "";
    const targetSerial = itemObj.serialNum ? itemObj.serialNum.toString().toLowerCase().trim() : "";
    const targetName = itemObj.name ? itemObj.name.toString().toLowerCase().trim() : "";
    
    let foundRacks = [];
    let foundZones = [];
    
    const entries = Array.isArray(rackDetails) 
        ? rackDetails.map(r => [r.id, r]) 
        : Object.entries(rackDetails);

    entries.forEach(([key, rack]) => {
      if (!rack || key === "DEFECTIVE_RACK") return;
      const actualRackId = rack.id || key || "Unknown";
      const contents = rack.beams || rack.items || rack.inventory || [];
      
      if (Array.isArray(contents)) {
        const hasItem = contents.some(beam => {
          if (beam.id && targetId && String(beam.id) === targetId) return true;
          const beamSerial = (beam.serialNum || "").toString().toLowerCase().trim();
          if (targetSerial !== "" && beamSerial === targetSerial) return true;
          const beamName = (beam.itemName || beam.name || "").toString().toLowerCase().trim();
          if (!targetSerial && !beam.serialNum && targetName !== "" && beamName === targetName) {
            return true;
          }
          return false;
        });

        if (hasItem) {
          foundRacks.push(actualRackId);
          if (rack.area || rack.zone) foundZones.push(rack.area || rack.zone);
        }
      }
    });

    if (foundRacks.length === 0) return null;
    const uniqueRacks = [...new Set(foundRacks)];
    const uniqueZones = [...new Set(foundZones)];
    return {
      ids: uniqueRacks.join(", "),
      zones: uniqueZones.join(", ")
    };
  };

  const filteredData = useMemo(() => {
    let rawData;
    
    if (activeTab === 'summary') {
        rawData = summaryData;
    } else if (activeTab === 'defective') {
        rawData = summaryData.filter(log => {
              const action = (log.action || '').toLowerCase();
              const status = (log.status || '').toLowerCase();
              return action.includes('defective') || status.includes('defective');
        });
    } else {
        rawData = itemData;
    }

    let enrichedData = rawData.map(item => {
      const resolvedUser = resolveUpdatedBy(item.updatedBy);
      
      let dbRack = item.rack_loc || item.rack || "Unplaced";
      let dbZone = item.zone_loc || item.zone || "Unplaced";
      
      const isUnplaced = !dbRack || 
                         dbRack.toString().trim() === "" || 
                         dbRack.toString().toLowerCase() === "unplaced";

      if (isUnplaced && activeTab === 'items' && summaryData.length > 0) {
         const clean = (str) => (str || '').toString().toLowerCase().trim();
         let validTrans = summaryData.find(t => {
             const tRack = t.rack || t.rack_loc;
             if (!tRack || clean(tRack) === 'unplaced' || clean(tRack) === '') return false;
             if (item.serialNum && t.serialNum && clean(item.serialNum) === clean(t.serialNum)) return true;
             return false;
         });
         if (!validTrans) {
             validTrans = summaryData.find(t => {
                 const tRack = t.rack || t.rack_loc;
                 if (!tRack || clean(tRack) === 'unplaced' || clean(tRack) === '') return false;
                 if (item.model && t.model && clean(item.model) === clean(t.model)) return true;
                 return false;
             });
         }
         if (validTrans) {
             dbRack = validTrans.rack || validTrans.rack_loc;
             dbZone = validTrans.zone || validTrans.zone_loc || dbZone;
         }
      }

      let finalRack = dbRack;
      let finalZone = dbZone;

      if (activeTab === 'items') {
         const isMapLoaded = rackDetails && Object.keys(rackDetails).length > 0;
         if (isMapLoaded) {
             const mapLocation = findItemLocations(item);
             if (mapLocation && mapLocation.ids) {
                 finalRack = mapLocation.ids;
                 finalZone = mapLocation.zones;
             } else {
                 finalRack = "Unplaced";
                 finalZone = "Unplaced";
             }
         }
      }

      let finalPrice = item.price;
      let finalCurrency = item.currency || 'PHP';

      if (activeTab === 'summary' && (!finalPrice || finalPrice == 0)) {
          const mainItem = itemData.find(i => (i.model === item.model) || (item.serialNum && i.serialNum === item.serialNum) || (i.name === item.name));
          if (mainItem) {
              finalPrice = mainItem.price;
              finalCurrency = mainItem.currency || finalCurrency;
          }
      }

      return { ...item, rack: finalRack, zone: finalZone, resolvedUser, price: finalPrice, currency: finalCurrency };
    });

    if (activeTab === 'summary') {
        enrichedData = enrichedData.filter(item => {
            if (!item.date) return false;
            const itemDate = new Date(item.date);
            if (isNaN(itemDate.getTime())) return true; 

            const itemDateOnly = new Date(itemDate.getFullYear(), itemDate.getMonth(), itemDate.getDate()).getTime();
            
            if (startDate) {
                const sDate = new Date(startDate);
                const sDateOnly = new Date(sDate.getFullYear(), sDate.getMonth(), sDate.getDate()).getTime();
                if (itemDateOnly < sDateOnly) return false;
            }
            
            if (endDate) {
                const eDate = new Date(endDate);
                const eDateOnly = new Date(eDate.getFullYear(), eDate.getMonth(), eDate.getDate()).getTime();
                if (itemDateOnly > eDateOnly) return false;
            }

            return true;
        });
    }

    if (activeTab === 'items') {
        enrichedData = enrichedData.filter(item => {
            const status = (item.status || 'active').toLowerCase();
            if (showArchived) {
                return status === 'archived';
            } else {
                return !['deleted', 'archived'].includes(status);
            }
        });

        if (!showArchived) {
            enrichedData = enrichedData.filter(item => {
                if (inventoryFilter === 'all') return true;
          
                const qty = parseInt(item.qty) || 0;
                const threshold = parseInt(item.min_threshold) || 5; 
                const qtyPlaced = parseInt(item.qtyPlaced) || 0;
                const qtyUnplaced = parseInt(item.qtyUnplaced) || 0;
          
                if (inventoryFilter === 'low_stock') { return qty > 0 && qty <= threshold; }
                if (inventoryFilter === 'empty') { return qty === 0; }
                if (inventoryFilter === 'expired') { return getLifespanState(item.dateAdded, item.lifespan) === 'expired'; }
                if (inventoryFilter === 'expiring') { return getLifespanState(item.dateAdded, item.lifespan) === 'expiring'; }
                if (inventoryFilter === 'unplaced') { 
                    return qtyUnplaced > 0 || (item.rack && item.rack.toLowerCase().includes('unplaced')) || (item.rack_loc && item.rack_loc.toLowerCase().includes('unplaced')); 
                }
                if (inventoryFilter === 'placed') { 
                    return qtyPlaced > 0 || (item.rack && !item.rack.toLowerCase().includes('unplaced')) || (item.rack_loc && !item.rack_loc.toLowerCase().includes('unplaced')); 
                }
                return true;
            });
        }
    }

    if (!searchQuery.trim()) return enrichedData;

    const lowerQuery = searchQuery.toLowerCase();
    return enrichedData.filter(item => {
      const matchReport = activeTab === 'defective' ? (item.report || item.details || item.notes || '').toLowerCase().includes(lowerQuery) : false;
      
      return (
        (item.transaction_id && item.transaction_id.toLowerCase().includes(lowerQuery)) || 
        (item.model && item.model.toLowerCase().includes(lowerQuery)) ||
        (item.name && item.name.toLowerCase().includes(lowerQuery)) ||
        (item.rack && item.rack.toLowerCase().includes(lowerQuery)) ||
        (item.rack_loc && item.rack_loc.toLowerCase().includes(lowerQuery)) || 
        (item.zone && item.zone.toLowerCase().includes(lowerQuery)) ||
        (item.cat && item.cat.toLowerCase().includes(lowerQuery)) ||
        (item.serialNum && item.serialNum.toLowerCase().includes(lowerQuery)) ||
        (item.status && item.status.toLowerCase().includes(lowerQuery)) ||
        (item.resolvedUser && item.resolvedUser.toLowerCase().includes(lowerQuery)) ||
        matchReport
      );
    });
  }, [activeTab, summaryData, itemData, searchQuery, startDate, endDate, inventoryFilter, rackDetails, showArchived]);

  const sortedData = useMemo(() => {
    let dataToSort = [...filteredData];
    if (sortConfig.key !== null) {
      dataToSort.sort((a, b) => {
        let aValue = a[sortConfig.key] || "";
        let bValue = b[sortConfig.key] || "";
        if (sortConfig.key === 'updatedBy') {
          aValue = a.resolvedUser || "";
          bValue = b.resolvedUser || "";
        }
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return dataToSort;
  }, [filteredData, sortConfig]);

  const groupedData = useMemo(() => {
    if (activeTab !== 'items') return sortedData; 
    const groups = {};
    sortedData.forEach(item => {
      const key = item.model || item.id;
      if (!groups[key]) {
        groups[key] = {
          ...item,
          isGroup: true,
          subItems: [item],
          qty: parseInt(item.qty || 0),
          qtyPlaced: parseInt(item.qtyPlaced || 0),
          qtyUnplaced: parseInt(item.qtyUnplaced || 0),
        };
      } else {
        groups[key].subItems.push(item);
        groups[key].qty += parseInt(item.qty || 0);
        groups[key].qtyPlaced += parseInt(item.qtyPlaced || 0);
        groups[key].qtyUnplaced += parseInt(item.qtyUnplaced || 0);
      }
    });
    return Object.values(groups);
  }, [sortedData, activeTab]);

  const displayData = activeTab === 'items' ? groupedData : sortedData;

  const suggestions = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const lowerQuery = searchQuery.toLowerCase();
    const uniqueMatches = new Set();
    filteredData.forEach(item => {
      if (item.name && item.name.toLowerCase().includes(lowerQuery)) uniqueMatches.add(item.name);
      if (item.model && item.model.toLowerCase().includes(lowerQuery)) uniqueMatches.add(item.model);
      if (item.transaction_id && item.transaction_id.toLowerCase().includes(lowerQuery)) uniqueMatches.add(item.transaction_id); 
      if (item.rack && item.rack.toLowerCase().includes(lowerQuery)) uniqueMatches.add(item.rack); 
    });
    return Array.from(uniqueMatches).slice(0, 6);
  }, [searchQuery, filteredData]);

  const handleSuggestionClick = (suggestion) => {
    setSearchQuery(suggestion);
    setShowSuggestions(false);
  };

  const handleCheckboxChange = (row) => {
    if (activeTab === 'items' && row.subItems) {
       const allIds = row.subItems.map(i => i.id);
       const isAllSelected = allIds.every(id => selectedItems[id]);
       const newSelection = { ...selectedItems };
       allIds.forEach(id => { newSelection[id] = !isAllSelected; });
       setSelectedItems(newSelection);
    } else {
       setSelectedItems(prev => ({ ...prev, [row.id]: !prev[row.id] }));
    }
  };

  const isRowSelected = (row) => {
      if (activeTab === 'items' && row.subItems) {
        return row.subItems.length > 0 && row.subItems.every(i => selectedItems[i.id]);
      }
      return !!selectedItems[row.id];
  };

  const hasSelection = useMemo(() => Object.values(selectedItems).some(val => val === true), [selectedItems]);
  
  const selectedIds = useMemo(() => Object.keys(selectedItems).filter(key => selectedItems[key]), [selectedItems]);
  const canEdit = selectedIds.length === 1; 

  const handleRemoveClick = () => {
    const itemIdsToCheck = Object.keys(selectedItems).filter(key => selectedItems[key]);
    const issues = validateItemDeletion(itemIdsToCheck);
    if (issues.length > 0) {
      setBlockedItemsList(issues);
      setIsBlockedModalOpen(true);
    } else {
      setIsRemoveModalOpen(true);
    }
  };

  const confirmDelete = () => {
    const itemIdsToDelete = Object.keys(selectedItems).filter(key => selectedItems[key]);
    removeItems(itemIdsToDelete);
    setSelectedItems({});
    setIsRemoveModalOpen(false);
  };

  const handleExport = async (exportType) => {
    setShowExportMenu(false);
    const workbook = new ExcelJS.Workbook();
    
    const codeTypeName = codeType === 'qr' ? "QR Codes" : "Barcodes";
    const sheetName = exportType === 'barcode' ? codeTypeName : (activeTab === 'summary' ? "Summary Report" : (activeTab === 'defective' ? "Defective Items" : "Item List"));
    
    const worksheet = workbook.addWorksheet(sheetName);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    let dataToExport = sortedData;

    // Specific logic for exporting entirely unfiltered Summary Data
    if (exportType === 'all_summary' && activeTab === 'summary') {
        dataToExport = summaryData.map(item => {
            const resolvedUser = resolveUpdatedBy(item.updatedBy);
            let finalPrice = item.price;
            let finalCurrency = item.currency || 'PHP';

            if (!finalPrice || finalPrice == 0) {
                const mainItem = itemData.find(i => (i.model === item.model) || (item.serialNum && i.serialNum === item.serialNum) || (i.name === item.name));
                if (mainItem) {
                    finalPrice = mainItem.price;
                    finalCurrency = mainItem.currency || finalCurrency;
                }
            }
            return { ...item, resolvedUser, price: finalPrice, currency: finalCurrency };
        });
    }

    if (activeTab === 'items') {
      const selectedIds = Object.keys(selectedItems).filter(key => selectedItems[key]);
      if (selectedIds.length > 0) {
        dataToExport = sortedData.filter(item => selectedIds.includes(item.id));
      }
    }

    if (exportType === 'barcode') {
      worksheet.columns = [{ header: `${codeTypeName} Image (SKU)`, key: 'barcode_img', width: 60 }];
    } else if (activeTab === 'summary') {
      worksheet.columns = [
        { header: 'Transaction ID', key: 'transaction_id', width: 20 },
        { header: 'SKU (Model)', key: 'model', width: 20 },
        { header: 'Item Name', key: 'name', width: 30 },
        // { header: 'Serial #', key: 'serialNum', width: 20 }, // Hidden
        { header: 'Price', key: 'price', width: 15 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Qty', key: 'qty', width: 10 },
        { header: 'Unit', key: 'unit', width: 10 },
        { header: 'Category', key: 'cat', width: 15 },
        { header: 'Date & Time', key: 'date', width: 25 },
        { header: 'Rack ID', key: 'rack', width: 15 },
        { header: 'Updated By', key: 'updatedBy', width: 15 }
      ];
    } else if (activeTab === 'defective') {
        worksheet.columns = [
            { header: 'Date Reported', key: 'date', width: 25 },
            { header: 'SKU (Model)', key: 'model', width: 20 },
            { header: 'Item Name', key: 'name', width: 30 },
            { header: 'Qty Defective', key: 'qty', width: 15 },
            { header: 'Reported By', key: 'updatedBy', width: 20 },
            // { header: 'Serial Numbers', key: 'serialNum', width: 25 }, // Hidden
        ];
    } else {
      worksheet.columns = [
        { header: `${codeTypeName} Image`, key: 'barcode_img', width: 25 },
        { header: 'SKU (Model)', key: 'model', width: 20 },
        { header: 'Item Name', key: 'name', width: 30 },
        // { header: 'Serial #', key: 'serialNum', width: 20 }, // Hidden
        { header: 'Price', key: 'price', width: 15 },
        { header: 'Category', key: 'cat', width: 15 },
        { header: 'Threshold', key: 'min_threshold', width: 15 }, 
        { header: 'Total Qty', key: 'qty', width: 10 },
        { header: 'Placed Qty', key: 'qtyPlaced', width: 12 },
        { header: 'Unplaced Qty', key: 'qtyUnplaced', width: 12 },
        { header: 'Rack ID', key: 'rack', width: 20 },
        { header: 'Unit', key: 'unit', width: 10 }
      ];
    }

    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    for (let i = 0; i < dataToExport.length; i++) {
      const item = dataToExport[i];
      const rowIndex = i + 2;
      const priceStr = item.price ? `${item.currency === 'USD' ? '$' : '₱'} ${parseFloat(item.price).toFixed(2)}` : '-';

      if (exportType === 'barcode') {
        worksheet.addRow({ barcode_img: '' });
        worksheet.getRow(rowIndex).height = codeType === 'qr' ? 80 : 100;
        worksheet.getRow(rowIndex).alignment = { vertical: 'middle', horizontal: 'center' };
        
        try {
          let base64Image;
          if (codeType === 'qr') {
                base64Image = await QRCode.toDataURL(item.model || "N/A", { width: 200, margin: 1 });
          } else {
                const canvas = document.createElement('canvas');
                JsBarcode(canvas, item.model || "N/A", { format: "CODE128", width: 3, height: 70, displayValue: true, fontSize: 16 });
                base64Image = canvas.toDataURL('image/png');
          }

          const imageId = workbook.addImage({ base64: base64Image, extension: 'png' });
          const width = codeType === 'qr' ? 80 : 300;
          const height = codeType === 'qr' ? 80 : 90;

          worksheet.addImage(imageId, { tl: { col: 0.1, row: rowIndex - 0.9 }, ext: { width: width, height: height } });

        } catch (e) { console.error("Code Generation failed", e); }

      } else if (activeTab === 'summary') {
        worksheet.addRow({
          transaction_id: item.transaction_id || '-',
          model: item.model, name: item.name, serialNum: item.serialNum || '-', price: priceStr,
          status: item.status, qty: item.qty, unit: item.unit || 'pcs', cat: item.cat,
          date: item.date, rack: item.rack, updatedBy: item.resolvedUser || resolveUpdatedBy(item.updatedBy)
        });
      } else if (activeTab === 'defective') {
        worksheet.addRow({
            date: item.date, model: item.model, name: item.name, qty: item.qty,
            updatedBy: resolveUpdatedBy(item.updatedBy), serialNum: item.serialNum || '-'
        });
      } else {
        worksheet.addRow({
          model: item.model, name: item.name, serialNum: item.serialNum || '-', price: priceStr,
          cat: item.cat, 
          min_threshold: item.min_threshold || 5, 
          qty: item.qty, qtyPlaced: item.qtyPlaced || 0, qtyUnplaced: item.qtyUnplaced || 0, 
          rack: item.rack || 'Unplaced',
          unit: item.unit || 'pcs'
        });
        
        worksheet.getRow(rowIndex).height = codeType === 'qr' ? 80 : 55;
        worksheet.getRow(rowIndex).alignment = { vertical: 'middle' };
        
        try {
          let base64Image;
          if (codeType === 'qr') {
               base64Image = await QRCode.toDataURL(item.model || "N/A", { width: 200, margin: 1 });
          } else {
               const canvas = document.createElement('canvas');
               JsBarcode(canvas, item.model || "N/A", { format: "CODE128", width: 2, height: 40, displayValue: false });
               base64Image = canvas.toDataURL('image/png');
          }
          
          const imageId = workbook.addImage({ base64: base64Image, extension: 'png' });
          const width = codeType === 'qr' ? 60 : 160;
          const height = codeType === 'qr' ? 60 : 45;

          worksheet.addImage(imageId, { tl: { col: 0.1, row: rowIndex - 0.9 }, ext: { width: width, height: height } });
        } catch (e) { console.error("Code Generation failed", e); }
      }
    }

    const fileNamePrefix = exportType === 'barcode' ? (codeType === 'qr' ? "QR_Codes" : "Barcodes") : activeTab;
    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `${fileNamePrefix}_Report_${timestamp}.xlsx`);
  };

  const renderHeader = (label, key) => (
    <th onClick={() => handleSort(key)} style={{ cursor: 'pointer' }}>
      <div className="th-content">
        <span>{label}</span>
        <ion-icon name={sortConfig.key === key ? (sortConfig.direction === 'asc' ? "chevron-up-outline" : "chevron-down-outline") : "chevron-expand-outline"}></ion-icon>
      </div>
    </th>
  );

  const handleLogout = () => {
    localStorage.removeItem('currentUser');
    navigate('/');
  };

  const dropdownItemStyle = { padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #eee', fontSize: '14px', color: '#333', transition: 'background 0.2s' };
  const handleDropdownEnter = (e) => e.target.style.background = '#f5f5f5';
  const handleDropdownLeave = (e) => e.target.style.background = 'white';

  return (
    <div className="report-wrapper">
      <div className="report-sidebar">
        <div className="report-nav-item" onClick={() => navigate('/dashboard')}>
          <div className="report-nav-icon"><ion-icon name="stats-chart-outline" style={{ fontSize: '50px' }}></ion-icon></div>
          <span className="report-nav-text">Dashboard</span>
        </div>
        <div className={`report-nav-item ${selectedNav === 'map' ? 'selected' : ''}`} onClick={() => { setSelectedNav('map'); navigate('/admin-hp'); }}>
          <div className="report-nav-icon"><ion-icon name="map-outline" style={{ fontSize: '50px' }}></ion-icon></div>
          <span className="report-nav-text">2D - Map</span>
        </div>
        <div className={`report-nav-item ${selectedNav === 'report' ? 'selected' : ''}`} onClick={() => setSelectedNav('report')}>
          <div className="report-nav-icon"><ion-icon name="clipboard-outline" style={{ fontSize: '50px' }}></ion-icon></div>
          <span className="report-nav-text">Report & Itemlist</span>
        </div>
        {currentUser?.role === 'admin' && (
          <div className="report-nav-item" onClick={() => navigate('/manage-users')}>
            <div className="report-nav-icon"><ion-icon name="people-outline" style={{ fontSize: '50px' }}></ion-icon></div>
            <span className="report-nav-text">Manage Users</span>
          </div>
        )}

        <div className="report-nav-item" onClick={() => navigate('/configuration')}>
            <div className="report-nav-icon"><ion-icon name="settings-outline" style={{ fontSize: '50px' }}></ion-icon></div>
            <span className="report-nav-text">Configuration</span>
        </div>

        <div className="report-nav-item" onClick={handleLogout} style={{ marginTop: 'auto', marginBottom: '20px' }}>
          <div className="report-nav-icon" style={{ color: '#dc3545' }}><ion-icon name="log-out-outline" style={{ fontSize: '50px' }}></ion-icon></div>
          <span className="report-nav-text" style={{ color: '#dc3545' }}>Logout</span>
        </div>
      </div>

      <div className="report-main-content">
        <div className="report-header" style={{ background: headerColor || '#ffffff', transition: 'background 0.3s' }}>
          <div className="report-title-group">
            <img src={logo} alt="Logo" style={{ height: '50px', width: '50px', objectFit: 'contain', marginRight: '15px' }} />
            <h1 className="report-main-title">WAREHOUSE MANAGEMENT</h1>
          </div>
        </div>

        <div className="report-scroll-container">
          <div style={{ marginBottom: '20px', background: 'white', padding: '15px', borderRadius: '8px', boxShadow: '0 2px 5px rgba(0,0,0,0.05)', width: 'fit-content' }}>
          </div>

          <div className="report-tabs-container">
            <button className={`report-tab-btn ${activeTab === 'summary' ? 'active' : ''}`} onClick={() => {
              setActiveTab('summary'); setSortConfig({ key: null, direction: 'asc' }); setSelectedItems({});
              setSearchQuery('');
            }}>Summary Report</button>
            <button className={`report-tab-btn ${activeTab === 'items' ? 'active' : ''}`} onClick={() => {
              setActiveTab('items'); setSortConfig({ key: null, direction: 'asc' }); setSelectedItems({});
              setSearchQuery('');
            }}>Item List</button>
            <button className={`report-tab-btn ${activeTab === 'defective' ? 'active' : ''}`} onClick={() => {
              setActiveTab('defective'); setSortConfig({ key: null, direction: 'asc' }); setSelectedItems({});
              setSearchQuery('');
            }}>Defective Items</button>
          </div>

          <div className="report-content-card">
            <div className="report-card-toolbar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                
                {activeTab === 'items' && (
                    <button 
                        onClick={() => { setShowArchived(!showArchived); setSelectedItems({}); }}
                        style={{
                            padding: '8px 12px',
                            borderRadius: '6px',
                            border: '1px solid #ccc',
                            backgroundColor: showArchived ? '#6c757d' : 'white',
                            color: showArchived ? 'white' : '#6c757d',
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '5px'
                        }}
                    >
                        <ion-icon name={showArchived ? "arrow-undo-outline" : "archive-outline"}></ion-icon>
                        {showArchived ? "Back to Active" : "Archived"}
                    </button>
                )}

                <div className="filter-wrapper">
                  {activeTab === 'summary' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ fontSize: '14px', fontWeight: '500', color: '#555' }}>From:</span>
                        <input 
                            type="date" 
                            value={startDate} 
                            onChange={(e) => setStartDate(e.target.value)} 
                            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '14px' }}
                        />
                        <span style={{ fontSize: '14px', fontWeight: '500', color: '#555', marginLeft: '5px' }}>To:</span>
                        <input 
                            type="date" 
                            value={endDate} 
                            onChange={(e) => setEndDate(e.target.value)} 
                            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '14px' }}
                        />
                        {(startDate || endDate) && (
                            <button 
                                onClick={() => { setStartDate(''); setEndDate(''); }}
                                style={{ background: 'none', border: 'none', color: '#dc3545', cursor: 'pointer', fontSize: '18px', display: 'flex', alignItems: 'center' }}
                                title="Clear Dates"
                            >
                                <ion-icon name="close-circle-outline"></ion-icon>
                            </button>
                        )}
                    </div>
                  ) : activeTab === 'items' && !showArchived ? (
                    <select 
                      value={inventoryFilter} 
                      onChange={(e) => setInventoryFilter(e.target.value)} 
                      style={{ 
                        padding: '10px 15px', 
                        borderRadius: '8px', 
                        border: '1px solid #e2e8f0', 
                        cursor: 'pointer', 
                        outline: 'none', 
                        fontWeight: '500', 
                        fontSize: '14px',
                        backgroundColor: inventoryFilter !== 'all' ? '#e7f1ff' : 'white',
                        color: inventoryFilter !== 'all' ? '#0056b3' : '#333'
                      }}
                    >
                      <option value="all">Show All Items</option>
                      <option value="low_stock"> Low Stock</option>
                      <option value="empty"> Out of Stock (Empty)</option>
                      <option value="expiring"> Expiring Soon (30 Days)</option>
                      <option value="expired"> Expired</option>
                    </select>
                  ) : null}
                </div>
                <div className="report-local-search" ref={searchWrapperRef}>
                  <span className="search-icon-small"><ion-icon name="search-outline"></ion-icon></span>
                  <input type="text" placeholder="Search..." value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setShowSuggestions(true); }} onFocus={() => setShowSuggestions(true)} />
                  {showSuggestions && suggestions.length > 0 && (
                    <div className="suggestions-dropdown">
                      {suggestions.map((item, index) => (
                        <div key={index} className="suggestion-item" onClick={() => handleSuggestionClick(item)}>{item}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="report-action-buttons" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  {activeTab === 'items' && !showArchived && (
                    <>
                        <button className="btn-add-item" onClick={() => setIsAddModalOpen(true)}>Add New Item</button>
                        
                        <button 
                            className="btn-add-item" 
                            style={{ 
                                backgroundColor: canEdit ? '#ffc107' : '#e0e0e0', 
                                color: canEdit ? '#000' : '#888', 
                                borderColor: canEdit ? '#ffc107' : '#ccc', 
                                cursor: canEdit ? 'pointer' : 'not-allowed',
                                display: 'flex', alignItems: 'center', gap: '5px'
                            }}
                            disabled={!canEdit}
                            onClick={() => {
                                const idToEdit = selectedIds[0];
                                const itemObj = itemData.find(i => i.id === idToEdit);
                                if (itemObj) {
                                    setItemToEdit(itemObj);
                                    setIsEditModalOpen(true);
                                }
                            }}
                        >
                             <ion-icon name="create-outline"></ion-icon> Edit Item
                        </button>

                        <button className="btn-remove-item" onClick={handleRemoveClick} disabled={!hasSelection}>Archive Item</button>
                    </>
                  )}
                  {activeTab === 'items' && showArchived && (
                    <button 
                        className="btn-add-item"
                        style={{ backgroundColor: '#28a745' }}
                        onClick={() => {
                            const ids = Object.keys(selectedItems).filter(k => selectedItems[k]);
                            restoreItems(ids);
                            setSelectedItems({});
                        }} 
                        disabled={!hasSelection}
                    >
                        <ion-icon name="refresh-outline"></ion-icon> Restore Selected
                    </button>
                  )}

                  {/* Export Dropdown Moved Down Here */}
                  <div className="export-dropdown-wrapper" ref={exportMenuRef} style={{ position: 'relative', display: 'inline-block' }}>
                      <button 
                          className="report-export-btn" 
                          onClick={() => setShowExportMenu(!showExportMenu)}
                          style={{
                              display: 'flex', alignItems: 'center', gap: '5px', padding: '8px 15px',
                              borderRadius: '6px', border: '1px solid #ccc', backgroundColor: '#f8f9fa',
                              color: '#333', cursor: 'pointer', fontWeight: 'bold'
                          }}
                      >
                          <ion-icon name="download-outline"></ion-icon><span>Export</span>
                          <ion-icon name="chevron-down-outline" style={{ marginLeft: '5px', fontSize: '14px' }}></ion-icon>
                      </button>
                      
                      {showExportMenu && (
                          <div className="export-menu-dropdown" style={{
                              position: 'absolute', top: '110%', right: 0, backgroundColor: 'white', border: '1px solid #ddd',
                              borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 100, minWidth: '220px', overflow: 'hidden'
                          }}>
                              {activeTab === 'summary' && (
                                  <>
                                      <div onClick={() => handleExport('filtered')} style={dropdownItemStyle} onMouseEnter={handleDropdownEnter} onMouseLeave={handleDropdownLeave}>Export Displayed Records</div>
                                      <div onClick={() => handleExport('all_summary')} style={dropdownItemStyle} onMouseEnter={handleDropdownEnter} onMouseLeave={handleDropdownLeave}>Export All Summary Data</div>
                                  </>
                              )}

                              {activeTab === 'defective' && (
                                  <div onClick={() => handleExport('filtered')} style={dropdownItemStyle} onMouseEnter={handleDropdownEnter} onMouseLeave={handleDropdownLeave}>Export Displayed Records</div>
                              )}

                              {activeTab === 'items' && (
                                  <>
                                      <div onClick={() => handleExport('standard')} style={dropdownItemStyle} onMouseEnter={handleDropdownEnter} onMouseLeave={handleDropdownLeave}>Export Full Data</div>
                                      <div onClick={() => handleExport('barcode')} style={dropdownItemStyle} onMouseEnter={handleDropdownEnter} onMouseLeave={handleDropdownLeave}>Export {codeType === 'qr' ? 'QR Codes' : 'Barcodes'} Only</div>
                                  </>
                              )}
                          </div>
                      )}
                  </div>
              </div>
            </div>

            <div className="report-table-container">
              <table className="report-table">
                <thead>
                  {activeTab === 'summary' ? (
                    <tr>
                      {renderHeader('Trans ID', 'transaction_id')}
                      {renderHeader('SKU (Model)', 'model')}
                      {renderHeader('Item Name', 'name')}
                      {/* <th>Serial #</th> HIDDEN */}
                      <th>Price</th>
                      {renderHeader('Status', 'status')}
                      {renderHeader('Quantity', 'qty')}
                      {renderHeader('Category', 'cat')}
                      {renderHeader('Date & Time', 'date')}
                      {renderHeader('Rack ID', 'rack')}
                      {renderHeader('Updated By', 'updatedBy')}
                    </tr>
                  ) : activeTab === 'defective' ? (
                    <tr>
                      {renderHeader('Date Reported', 'date')}
                      {renderHeader('SKU (Model)', 'model')}
                      {renderHeader('Item Name', 'name')}
                      {renderHeader('Qty Defective', 'qty')}
                      {renderHeader('Reported By', 'updatedBy')}
                      {/* <th>Serial Number</th> HIDDEN */}
                    </tr>
                  ) : (
                    <tr>
                      {renderHeader('SKU', 'model')}
                      
                      {/* DYNAMIC HEADER LABEL */}
                      <th>{codeType === 'qr' ? 'QR Code' : 'Barcode'}</th>

                      {renderHeader('Item Name', 'name')}
                      {/* <th>Serial #</th> HIDDEN */}
                      <th>Price</th>
                      {renderHeader('Threshold', 'min_threshold')} 
                      {renderHeader('Total Qty', 'qty')}
                      {renderHeader('Placed Qty', 'qtyPlaced')}
                      {renderHeader('Unplaced Qty', 'qtyUnplaced')}
                      {renderHeader('Rack ID', 'rack')} {/* NEW */}
                      {renderHeader('Category', 'cat')}
                      <th>Lifespan</th>
                      <th>Select</th>
                    </tr>
                  )}
                </thead>
                <tbody>
                  {displayData.map((row, index) => {
                    if (activeTab === 'defective') {
                        return (
                            <tr key={row.id || index}>
                                <td>{row.date}</td>
                                <td>{row.model}</td>
                                <td>{row.name}</td>
                                <td style={{color: '#dc3545', fontWeight: 'bold'}}>{row.qty}</td>
                                <td>{resolveUpdatedBy(row.updatedBy)}</td>
                                {/* <td style={{fontSize: '12px'}}>{row.serialNum || 'N/A'}</td> HIDDEN */}
                            </tr>
                        );
                    }

                    // --- EXISTING ROW RENDER ---
                    const isLowStock = activeTab !== 'summary' && parseInt(row.qty || 0) <= parseInt(row.min_threshold || 5);
                    const isGroupedRow = activeTab === 'items' && row.subItems && row.subItems.length > 1;

                    let groupStatus = { color: 'inherit', text: 'See All', isAlert: false };
                    
                    if (isGroupedRow) {
                        let expired = 0;
                        let expiring = 0;

                        row.subItems.forEach(sub => {
                            if (!sub.dateAdded || !sub.lifespan) return;
                            const match = sub.lifespan.match(/(\d+)\s*(year|month|day|week)/i);
                            if (!match) return;

                            const val = parseInt(match[1]);
                            const unit = match[2].toLowerCase();
                            const added = new Date(sub.dateAdded);
                            const expiry = new Date(added);

                            if (unit.startsWith('year')) expiry.setFullYear(expiry.getFullYear() + val);
                            else if (unit.startsWith('month')) expiry.setMonth(expiry.getMonth() + val);
                            else if (unit.startsWith('week')) expiry.setDate(expiry.getDate() + (val * 7));
                            else if (unit.startsWith('day')) expiry.setDate(expiry.getDate() + val);

                            const now = new Date();
                            const diffTime = expiry - now;
                            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                            if (diffDays < 0) expired++;
                            else if (diffDays <= 30) expiring++;
                        });

                        if (expired > 0) {
                            groupStatus = { color: '#dc3545', text: `${expired} batch${expired > 1 ? 'es' : ''} expired`, isAlert: true };
                        } else if (expiring > 0) {
                            groupStatus = { color: '#fd7e14', text: `${expiring} batch${expiring > 1 ? 'es' : ''} expiring`, isAlert: true };
                        }
                    }

                    return (
                      <tr key={row.id || index} style={{ backgroundColor: isLowStock ? '#fff0f0' : 'inherit' }}>
                        
                        {activeTab === 'summary' && (
                            <td style={{ verticalAlign: 'middle', fontWeight: 'bold', color: row.transaction_id === 'Pending...' ? '#fd7e14' : 'inherit' }}>
                                {row.transaction_id || '-'}
                            </td>
                        )}

                        <td style={{ verticalAlign: 'middle', fontWeight: 'bold' }}>{row.model}</td>
                        
                        {activeTab !== 'summary' && (
                          <td style={{ padding: '5px', textAlign: 'center' }}>
                            {codeType === 'qr' ? (
                                <div style={{ background: 'white', display: 'inline-block', padding: '5px', borderRadius:'4px' }}>
                                    <QRCodeSVG 
                                        value={row.model || "N/A"} 
                                        size={50} 
                                        level="M" 
                                    />
                                </div>
                            ) : (
                                <Barcode 
                                    value={row.model || "N/A"} 
                                    format="CODE128" 
                                    width={1.2} 
                                    height={35} 
                                    fontSize={11} 
                                    background="transparent" 
                                    margin={5} 
                                />
                            )}
                          </td>
                        )}

                        <td style={{ verticalAlign: 'middle' }}>{row.name}</td>
                        
                        {/* <td style={{ fontSize: '12px', color: '#555', verticalAlign: 'middle' }}>
                            {isGroupedRow ? (
                                <span style={{fontStyle:'italic', color: '#888'}}>{row.subItems.length} batches</span>
                            ) : (
                                row.serialNum || '-'
                            )}
                        </td>
                        */}

                        <td style={{ fontWeight: 'bold', color: '#28a745', verticalAlign: 'middle' }}>
                          {row.currency === 'USD' ? '$' : '₱'} {parseFloat(row.price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>

                        {activeTab === 'summary' && (
                          <td style={{
                            verticalAlign: 'middle', fontWeight: 'bold',
                            color: (row.status || '').toLowerCase().includes('clear') || (row.status || '').toLowerCase().includes('remove') ? '#dc3545' :
                              (row.status || '').toLowerCase().includes('check') || (row.status || '').toLowerCase().includes('add') || (row.status || '').toLowerCase().includes('edit') ? '#28a745' : 'inherit'
                          }}>
                            {row.status}
                          </td>
                        )}
                        
                        {activeTab !== 'summary' && (
                            <td style={{ verticalAlign: 'middle', textAlign: 'center' }}>
                                {row.min_threshold || 5}
                            </td>
                        )}

                        <td style={{ verticalAlign: 'middle' }}>
                          <span style={{ fontWeight: isLowStock ? 'bold' : 'normal', color: isLowStock ? '#dc3545' : 'inherit' }}>
                            {row.qty}
                          </span>
                          <span style={{ fontSize: '0.8em', color: '#666' }}> {row.unit || 'pcs'}</span>
                          {isLowStock && (
                            <div style={{ color: '#dc3545', fontSize: '11px', fontWeight: 'bold', marginTop: '2px' }}>
                              <ion-icon name="alert-circle-outline" style={{ verticalAlign: 'middle' }}></ion-icon> Low Stock
                            </div>
                          )}
                        </td>

                        {activeTab !== 'summary' && (
                          <td style={{ verticalAlign: 'middle', color: 'green', fontWeight: 'bold' }}>
                            {row.qtyPlaced || 0}
                          </td>
                        )}
                        {activeTab !== 'summary' && (
                          <td style={{
                            verticalAlign: 'middle', color: (row.qtyUnplaced || 0) > 0 ? '#dc3545' : '#888', fontWeight: (row.qtyUnplaced || 0) > 0 ?
                              'bold' : 'normal'
                          }}>
                            {row.qtyUnplaced || 0}
                          </td>
                        )}

                        {/* NEW RACK ID CELL */}
                        {activeTab !== 'summary' && (
                           <td style={{ verticalAlign: 'middle', fontSize: '13px', color: '#007bff', fontWeight: 'bold' }}>
                              {isGroupedRow 
                                ? [...new Set(row.subItems.map(i => i.rack).filter(r => r && r !== 'Unplaced'))].join(", ") || "Unplaced"
                                : (row.rack || "Unplaced")
                              }
                           </td>
                        )}

                        <td style={{ verticalAlign: 'middle' }}>{row.cat}</td>

                        {activeTab !== 'summary' && (
                          <td style={{ verticalAlign: 'middle', fontSize: '13px' }}>
                            {isGroupedRow ? (
                              <button 
                                  onClick={() => { setSelectedGroupData(row); setGroupModalOpen(true); }}
                                  style={{
                                    border: `1px solid ${groupStatus.isAlert ? groupStatus.color : '#ddd'}`, 
                                    background: '#fff', borderRadius: '4px',
                                    padding: '5px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                                    color: groupStatus.isAlert ? groupStatus.color : '#555'
                                  }}
                              >
                                  <span style={{fontSize: '12px', fontWeight: groupStatus.isAlert ? 'bold' : 'normal'}}>
                                    {groupStatus.text}
                                  </span>
                                  <ion-icon name="ellipsis-horizontal" style={{fontSize: '16px', color: '#333'}}></ion-icon>
                              </button>
                            ) : (
                              getLifespanStatus(row.dateAdded, row.lifespan)
                            )}
                          </td>
                        )}

                        {activeTab === 'summary' && <td>{row.date}</td>}
                        {activeTab === 'summary' && (
                          <td style={{
                            verticalAlign: 'middle', fontWeight: row.rack && row.rack !== 'Unplaced' ? 'bold' : 'normal', color: row.rack && row.rack !== 'Unplaced' ?
                              '#007bff' : 'inherit'
                          }}>
                            {row.rack}
                          </td>
                        )}
                        {activeTab === 'summary' && (
                          <td>
                            {resolveUpdatedBy(row.updatedBy)}
                          </td>
                        )}

                        {activeTab !== 'summary' && (
                          <td className="checkbox-cell" style={{ verticalAlign: 'middle' }}>
                            <input type="checkbox" checked={isRowSelected(row)} onChange={() => handleCheckboxChange(row)} />
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  
                  {displayData.length === 0 && (
                    <tr>
                      <td colSpan={13} style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
                        {activeTab === 'summary' 
                          ? `No summary records found for selected filters.`
                          : activeTab === 'defective'
                            ? `No defective item reports found.`
                            : `No items found matching "${searchQuery}"`
                        }
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      
      <AddItemModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />
      
      <EditItemModal 
          isOpen={isEditModalOpen} 
          onClose={() => setIsEditModalOpen(false)} 
          itemData={itemToEdit}
      />

      <RemoveItemModal isOpen={isRemoveModalOpen} onClose={() => setIsRemoveModalOpen(false)} hasSelection={hasSelection} onConfirm={confirmDelete} />
      <ActionBlockedModal isOpen={isBlockedModalOpen} onClose={() => setIsBlockedModalOpen(false)} blockedItems={blockedItemsList} />
      
      <GroupDetailsModal 
        isOpen={groupModalOpen} 
        onClose={() => setGroupModalOpen(false)} 
        groupData={selectedGroupData} 
      />
    </div>
  );
};

const Report_Itemlist = () => (
  <ReportStateProvider>
    <Report_ItemlistContent />
  </ReportStateProvider>
);

export default Report_Itemlist;