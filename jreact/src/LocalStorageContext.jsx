import React, { createContext, useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import JsBarcode from 'jsbarcode';

// --- CONFIGURATION ---
const API_URL = "http://localhost/mro-api";

export const ReportStateContext = createContext();

// --- HELPER: Standard Normalize ---
const normalizeStr = (str) => {
  return (str || "").toString().toLowerCase().replace(/\s+/g, ' ').trim();
};

// --- HELPER: Super Normalize (Removes ALL spaces & symbols) ---
const superNormalize = (str) => {
  return (str || "").toString().toLowerCase().replace(/[^a-z0-9]/g, '');
};

// --- HELPER: Extract Start Number from Serial ---
const getSerialStartNumber = (serialStr) => {
  if (!serialStr) return Infinity; 
  const match = serialStr.toString().match(/(\d+)/);
  return match ? parseInt(match[0], 10) : Infinity;
};

// --- HELPER: Expand Serial Ranges ---
const expandSerialString = (serialStr) => {
  if (serialStr === null || serialStr === undefined) return [];
  const parts = String(serialStr).split(',').map(s => s.trim()).filter(s => s);
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

// --- HELPER: Consolidate Serial Ranges ---
const consolidateSerialRanges = (serialInput) => {
  if (!serialInput) return "";
  let parts = Array.isArray(serialInput) ? serialInput : String(serialInput).split(',').map(s => s.trim()).filter(s => s !== "");
  let ranges = [];

  parts.forEach(part => {
    const rangeMatch = part.match(/^(\D*)(\d+)\s*-\s*(\D*)(\d+)$/);
    const singleMatch = part.match(/^(\D*)(\d+)$/);

    if (rangeMatch) {
      ranges.push({ prefix: rangeMatch[1] || "", start: parseInt(rangeMatch[2], 10), end: parseInt(rangeMatch[4], 10) });
    } else if (singleMatch) {
      const num = parseInt(singleMatch[2], 10);
      ranges.push({ prefix: singleMatch[1] || "", start: num, end: num });
    } else {
      ranges.push({ original: part, isCustom: true, start: 999999999 });
    }
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

export const ReportStateProvider = ({ children }) => {
  const [headerColor, setHeaderColor] = useState(() => {
    return localStorage.getItem('system_header_color') || '#ffffff';
  });

  const [logo, setLogo] = useState(() => {
    return localStorage.getItem('admin_logo') || 'https://cdn-icons-png.flaticon.com/512/25/25694.png';
  });

  const [codeType, setCodeType] = useState('barcode');

  useEffect(() => {
    localStorage.setItem('admin_logo', logo);
  }, [logo]);

  useEffect(() => {
    localStorage.setItem('system_header_color', headerColor);
  }, [headerColor]);

  const [itemData, setItemData] = useState([]);
  const [summaryData, setSummaryData] = useState([]);
  const [rackDetails, setRackDetails] = useState({});
  const [alertConfig, setAlertConfig] = useState({ show: false, message: '' });

  // --- NEW: TRANSACTION MANAGEMENT STATE ---
  const [isTransactionActive, setIsTransactionActive] = useState(false);
  const [sessionLogIds, setSessionLogIds] = useState([]);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [tempTransactionId, setTempTransactionId] = useState('');
  const isTransactionActiveRef = useRef(false);

  const itemDataRef = useRef(itemData);
  const rackDetailsRef = useRef(rackDetails);
  const isSavingRef = useRef(false);

  useEffect(() => { itemDataRef.current = itemData; }, [itemData]);
  useEffect(() => { rackDetailsRef.current = rackDetails; }, [rackDetails]);

  // --- NEW: TRANSACTION CONTROLLERS ---
  const startTransaction = useCallback(() => {
      setIsTransactionActive(true);
      isTransactionActiveRef.current = true;
      setSessionLogIds([]);
  }, []);

  const promptFinishTransaction = useCallback(() => {
      setShowTransactionModal(true);
  }, []);

  const submitTransactionId = async () => {
      if (!tempTransactionId.trim()) return;
      try {
          // Identify all pending items directly from current state 
          // (prevents dropping logs if sessionLogIds array missed a fast state update)
          const pendingLogs = summaryData.filter(log => log.transaction_id === 'Pending...');
          const pendingIds = pendingLogs.map(log => log.id);
          const finalLogIds = [...new Set([...sessionLogIds, ...pendingIds])];

          await fetch(`${API_URL}/transaction.php`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  action: 'update_transaction_ids',
                  transaction_id: tempTransactionId,
                  log_ids: finalLogIds
              })
          });

          // Update local state summary data with new ID targeting ALL 'Pending...'
          setSummaryData(prev => prev.map(log => {
              if (log.transaction_id === 'Pending...') {
                  return { ...log, transaction_id: tempTransactionId };
              }
              return log;
          }));

          setIsTransactionActive(false);
          isTransactionActiveRef.current = false;
          setSessionLogIds([]);
          setShowTransactionModal(false);
          setTempTransactionId('');
          setAlertConfig({ show: true, message: "Transaction Saved Successfully!" });
      } catch (e) {
          console.error("Failed to update transaction IDs", e);
      }
  };

  const getCurrentUser = () => {
    const session = localStorage.getItem('currentUser');
    if (!session) return 'Unknown Account'; 
    try {
        const u = JSON.parse(session);
        return u.name || 'Unknown Account'; 
    } catch (e) {
        return session; 
    }
  };

  useEffect(() => {
    const checkAndRunBackup = async () => {
      const getWeekNumber = (d) => {
        d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
      };

      const currentWeek = new Date().getFullYear() + '-W' + getWeekNumber(new Date());
      const lastBackupWeek = localStorage.getItem('system_last_backup_week');

      if (lastBackupWeek !== currentWeek) {
        try {
          const response = await fetch(`${API_URL}/backup.php`);
          if (response.ok) {
             const result = await response.json();
             if (result.success) {
                localStorage.setItem('system_last_backup_week', currentWeek);
             }
          }
        } catch (error) {
          console.error("Backup Network Error:", error);
        }
      }
    };

    const timer = setTimeout(() => { checkAndRunBackup(); }, 5000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    fetchInventory();
    fetchRacks();
    fetchTransactions();
    fetchSettings();

    const intervalId = setInterval(() => {
      if (!isSavingRef.current) {
        fetchInventory();
        fetchRacks();
      }
    }, 2000);
    return () => clearInterval(intervalId);
  }, []);

  const fetchSettings = async () => {
    try {
        const response = await fetch(`${API_URL}/settings.php`); 
        const data = await response.json(); 
        
        const logoSetting = data.find(d => d.setting_key === 'admin_logo');
        const headerColorSetting = data.find(d => d.setting_key === 'header_color');
        const codeTypeSetting = data.find(d => d.setting_key === 'code_type');

        if (logoSetting && logoSetting.setting_value) setLogo(logoSetting.setting_value);
        if (headerColorSetting && headerColorSetting.setting_value) setHeaderColor(headerColorSetting.setting_value);
        if (codeTypeSetting && codeTypeSetting.setting_value) setCodeType(codeTypeSetting.setting_value);
    } catch (err) { console.error("Error loading settings:", err); }
  };

  const fetchInventory = async () => {
    try {
      const response = await fetch(`${API_URL}/inventory.php`);
      const data = await response.json();
      
      const formattedData = Array.isArray(data) ? data.map(row => ({
        id: row.id, model: row.model, name: row.name, serialNum: row.serial_num || row.serialNum || '', 
        qty: parseInt(row.qty) || 0, price: row.price, unit: row.unit || 'pcs', cat: row.category,
        rack: row.rack_loc || row.rack || 'Unplaced', zone: row.zone_loc || row.zone || 'Unplaced', 
        image: row.image, currency: row.currency || 'PHP', lifespan: row.lifespan || '',
        dateAdded: row.date_added, min_threshold: row.min_threshold, status: row.status || 'active'
      })) : [];

      if (formattedData.length > 0 || data.length === 0) {
        const syncedData = syncItemLocations(formattedData, rackDetailsRef.current);
        if (JSON.stringify(syncedData) !== JSON.stringify(itemDataRef.current)) {
          setItemData(syncedData);
        }
      }
    } catch (error) { console.error("Failed to load Inventory:", error); }
  };

  const fetchRacks = async () => {
    try {
      const response = await fetch(`${API_URL}/racks.php`);
      const raw = await response.json();
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const validData = (data && Object.keys(data).length > 0) ? data : {};
      
      if (JSON.stringify(validData) !== JSON.stringify(rackDetailsRef.current)) {
        setRackDetails(validData);
        const reSyncedItems = syncItemLocations(itemDataRef.current, validData);
        setItemData(reSyncedItems);
      }
    } catch (error) { console.error("Failed to load Racks:", error); }
  };

  const fetchTransactions = async () => {
    try {
      const response = await fetch(`${API_URL}/transaction.php`);
      const data = await response.json();
      if (Array.isArray(data)) setSummaryData(data);
    } catch (error) { console.error("Failed to load Transactions:", error); }
  };

  const saveItemToDB = async (item) => {
    try {
      const payload = {
        ...item, rack_loc: item.rack, serial_num: item.serialNum, 
        zone_loc: item.zone, date_added: item.dateAdded, category: item.cat 
      };
      await fetch(`${API_URL}/inventory.php`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      setTimeout(() => { isSavingRef.current = false; }, 1500);
    } catch (e) { console.error("Save Item Failed", e); isSavingRef.current = false; }
  };

  const saveRacksToDB = async (racks) => {
    try { await fetch(`${API_URL}/racks.php`, { method: 'POST', body: JSON.stringify(racks) }); } catch (e) {}
  };

  const saveTransactionToDB = async (logItem) => {
    if (isTransactionActiveRef.current) {
        setSessionLogIds(prev => [...prev, logItem.id]);
    }
    try {
      await fetch(`${API_URL}/transaction.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(logItem) });
    } catch (e) { console.error("Save Transaction Failed", e); }
  };

  const syncItemLocations = (currentItems, currentRacks) => {
    const rackInventory = {};

    Object.values(currentRacks).forEach(rack => {
      if (rack.id === "DEFECTIVE_RACK") return;
      if (rack.beams && Array.isArray(rack.beams)) {
        rack.beams.forEach(beam => {
          if (beam.itemName && beam.qty) {
            const key = superNormalize(beam.itemName);
            if (!rackInventory[key]) rackInventory[key] = [];
            rackInventory[key].push({
              rackId: rack.id,
              area: rack.area,
              qty: parseInt(beam.qty, 10) || 0
            });
          }
        });
      }
    });

    const itemsByName = {};
    currentItems.forEach(item => {
      const key = superNormalize(item.name);
      if (!itemsByName[key]) itemsByName[key] = [];
      itemsByName[key].push(item);
    });

    const updatedItemsMap = new Map();

    Object.keys(itemsByName).forEach(key => {
      const group = itemsByName[key];
      group.sort((a, b) => {
        const startA = getSerialStartNumber(a.serialNum);
        const startB = getSerialStartNumber(b.serialNum);
        if (startA !== Infinity && startB !== Infinity) return startA - startB;
        return new Date(a.dateAdded || 0) - new Date(b.dateAdded || 0);
      });

      const availableSlots = (rackInventory[key] || []).map(slot => ({ ...slot }));

      group.forEach(item => {
        const itemTotal = parseInt(item.qty) || 0;
        let remainingNeeded = itemTotal;
        let placed = 0;
        const foundRacks = new Set();
        const foundZones = new Set();

        for (const slot of availableSlots) {
          if (remainingNeeded <= 0) break;
          if (slot.qty > 0) {
            const take = Math.min(remainingNeeded, slot.qty);
            slot.qty -= take;
            remainingNeeded -= take;
            placed += take;

            foundRacks.add(slot.rackId);
            if (slot.area) foundZones.add(slot.area);
          }
        }

        const rackStr = foundRacks.size > 0 ? Array.from(foundRacks).join(", ") : "Unplaced";
        const zoneStr = foundZones.size > 0 ? Array.from(foundZones).join(", ") : "Unplaced";

        updatedItemsMap.set(item.id, {
          ...item, rack: rackStr, zone: zoneStr, qtyPlaced: placed, qtyUnplaced: itemTotal - placed
        });
      });
    });

    return currentItems.map(item => updatedItemsMap.get(item.id) || item);
  };

  const getCalculatedSerialsForRack = useCallback((rackId, modelName) => {
    if (!rackId || !modelName) return null;
    const normModel = superNormalize(modelName);

    let batches = itemDataRef.current.filter(i => superNormalize(i.model) === normModel);
    batches.sort((a, b) => {
        const startA = getSerialStartNumber(a.serialNum);
        const startB = getSerialStartNumber(b.serialNum);
        if (startA !== Infinity && startB !== Infinity) return startA - startB;
        return new Date(a.dateAdded || 0) - new Date(b.dateAdded || 0);
    });

    let globalSerials = [];
    batches.forEach(b => {
        if (b.serialNum) {
            globalSerials.push(...expandSerialString(b.serialNum));
        } else {
            for(let i=0; i<(parseInt(b.qty)||0); i++) globalSerials.push("No SN");
        }
    });

    const sortedRacks = Object.values(rackDetailsRef.current).sort((a, b) => 
        a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' })
    );

    let offset = 0;
    let targetQty = 0;
    let foundRack = false;

    for (const r of sortedRacks) {
        if (r.id === "DEFECTIVE_RACK") continue;
        let qtyInThisRack = 0;
        if (r.beams && Array.isArray(r.beams)) {
            r.beams.forEach(b => {
                const beamItem = itemDataRef.current.find(i => superNormalize(i.name) === superNormalize(b.itemName));
                if(beamItem && superNormalize(beamItem.model) === normModel) {
                    qtyInThisRack += (parseInt(b.qty) || 0);
                }
            });
        }
        if (r.id === rackId) {
            targetQty = qtyInThisRack;
            foundRack = true;
            break; 
        }
        offset += qtyInThisRack;
    }

    if (!foundRack || targetQty === 0) return null;
    const slice = globalSerials.slice(offset, offset + targetQty);
    const validSerials = slice.filter(s => s !== "No SN");
    if (validSerials.length === 0) return null;
    return consolidateSerialRanges(validSerials.join(", "));
  }, []);

  const getGlobalUsedQty = useCallback((itemName, currentRackId) => {
    let used = 0;
    const racks = rackDetailsRef.current;
    const normItemName = superNormalize(itemName);
    Object.values(racks).forEach(rack => {
      if (rack.id === currentRackId) return;
      if (rack.beams && Array.isArray(rack.beams)) {
        rack.beams.forEach(beam => { if (superNormalize(beam.itemName) === normItemName) used += (parseInt(beam.qty) || 0); });
      }
    });
    return used;
  }, []);

  const getItemDetailsByModel = useCallback((modelName) => {
    if (!modelName) return null;
    const matches = itemDataRef.current.filter(i => i.model && superNormalize(i.model) === superNormalize(modelName));
    if (matches.length === 0) return null;
    matches.sort((a, b) => {
        const startA = getSerialStartNumber(a.serialNum);
        const startB = getSerialStartNumber(b.serialNum);
        if (startA !== Infinity && startB !== Infinity) return startA - startB;
        return new Date(a.dateAdded || 0) - new Date(b.dateAdded || 0);
    });
    return matches[0];
  }, []);

  const getNextSerial = useCallback((modelName) => {
    if (!modelName) return "";
    const existingItems = itemDataRef.current.filter(i => superNormalize(i.model) === superNormalize(modelName) && i.serialNum);
    if (existingItems.length === 0) return "";
    let maxNum = 0; let prefix = ""; let numberLength = 0;
    existingItems.forEach(item => {
      const segments = expandSerialString(item.serialNum);
      segments.forEach(segment => {
        const match = segment.match(/^(.*?)(\d+)$/);
        if (match) {
          const currentPrefix = match[1];
          const currentNum = parseInt(match[2], 10);
          if (currentNum > maxNum) { maxNum = currentNum; prefix = currentPrefix; numberLength = match[2].length; }
        }
      });
    });
    if (maxNum > 0) {
      const nextNum = maxNum + 1;
      return `${prefix}${String(nextNum).padStart(numberLength, '0')}`;
    }
    return "";
  }, []);

  const addItem = useCallback((newItem) => {
    isSavingRef.current = true;
    const currentItems = [...itemDataRef.current];
    const qtyToAdd = parseInt(newItem.qty) || 0;
    const currentUser = getCurrentUser();

    const existingIndex = currentItems.findIndex(i => {
      const iModel = superNormalize(i.model);
      const nModel = superNormalize(newItem.model);
      const iName = superNormalize(i.name);
      const nName = superNormalize(newItem.name);
      const isModelMatch = (iModel && nModel) ? (iModel === nModel) : (iName === nName);

      if (isModelMatch) {
        const oldLifespan = normalizeStr(i.lifespan);
        const newLifespan = normalizeStr(newItem.lifespan);
        if (oldLifespan !== newLifespan) return false; 
        return true; 
      }
      return false;
    });

    if (existingIndex !== -1) {
      const existingItem = { ...currentItems[existingIndex] };
      existingItem.qty = (parseInt(existingItem.qty) || 0) + qtyToAdd;
      if (newItem.price && parseFloat(newItem.price) > 0) existingItem.price = parseFloat(newItem.price);
      
      if (newItem.serialNum) {
        const rawCombined = existingItem.serialNum ? `${existingItem.serialNum}, ${newItem.serialNum}` : newItem.serialNum;
        existingItem.serialNum = consolidateSerialRanges(rawCombined);
      }
      
      if (newItem.min_threshold) existingItem.min_threshold = newItem.min_threshold;
      
      currentItems[existingIndex] = existingItem;
      setItemData(currentItems);
      saveItemToDB(existingItem);

      const mergeLog = {
        id: uuidv4(), transaction_id: isTransactionActiveRef.current ? 'Pending...' : '-',
        model: existingItem.model, name: existingItem.name, status: 'Restock',
        qty: qtyToAdd, unit: existingItem.unit, cat: existingItem.cat,
        date: new Date().toLocaleString(), rack: existingItem.rack || "Unplaced", zone: existingItem.zone || "Unplaced",
        updatedBy: currentUser, serialNum: newItem.serialNum || ''
      };
      setSummaryData(prev => [mergeLog, ...prev]);
      saveTransactionToDB(mergeLog);

    } else {
      const cleanSerial = consolidateSerialRanges(newItem.serialNum);
      const newItemListItem = {
        id: uuidv4(), model: newItem.model, name: newItem.name, qty: qtyToAdd, unit: newItem.unit || 'pcs',
        cat: newItem.cat, serialNum: cleanSerial || '', price: parseFloat(newItem.price) || 0.00,
        currency: newItem.currency || 'PHP', rack: "Unplaced", zone: "Unplaced",
        image: newItem.image || null, lifespan: newItem.lifespan || '', dateAdded: new Date().toISOString(),
        min_threshold: newItem.min_threshold || 5, status: 'active'
      };

      setItemData(prev => [...prev, newItemListItem]);
      saveItemToDB(newItemListItem);

      const newSummaryTransaction = {
        id: uuidv4(), transaction_id: isTransactionActiveRef.current ? 'Pending...' : '-',
        model: newItem.model, name: newItem.name, status: 'Created',
        qty: qtyToAdd, unit: newItem.unit, cat: newItem.cat, date: new Date().toLocaleString(),
        rack: "Unplaced", zone: "Unplaced", updatedBy: currentUser, serialNum: cleanSerial
      };
      setSummaryData(prev => [newSummaryTransaction, ...prev]);
      saveTransactionToDB(newSummaryTransaction);
    }
  }, []);

  const editItem = useCallback((id, updatedFields) => {
    isSavingRef.current = true;
    const currentUser = getCurrentUser();

    setItemData(prevItems => {
      const itemIndex = prevItems.findIndex(i => i.id === id);
      if (itemIndex === -1) return prevItems;

      const oldItem = prevItems[itemIndex];
      const newItem = { ...oldItem, ...updatedFields };

      saveItemToDB(newItem);

      const log = {
        id: uuidv4(), transaction_id: isTransactionActiveRef.current ? 'Pending...' : '-',
        model: newItem.model, name: newItem.name, status: 'Edited',
        qty: newItem.qty, unit: newItem.unit, cat: newItem.cat,
        date: new Date().toLocaleString(), rack: newItem.rack || "Unplaced", zone: newItem.zone || "Unplaced",
        updatedBy: currentUser, serialNum: newItem.serialNum || '', notes: "Details updated via Edit Item"
      };
      setSummaryData(prev => [log, ...prev]);
      saveTransactionToDB(log);

      const newItems = [...prevItems];
      newItems[itemIndex] = newItem;
      return newItems;
    });

    setTimeout(() => { isSavingRef.current = false; }, 1500);
  }, []);

  const removeItems = useCallback((itemIdsToDelete) => {
    const currentItems = itemDataRef.current;
    const currentUser = getCurrentUser();
    const timestamp = new Date().toLocaleString();
    
    const itemsToRemove = currentItems.filter(item => itemIdsToDelete.includes(item.id));
    itemsToRemove.forEach(item => {
      const log = {
        id: uuidv4(), transaction_id: isTransactionActiveRef.current ? 'Pending...' : '-',
        model: item.model, name: item.name, status: 'Archived',
        qty: item.qty, unit: item.unit, cat: item.cat, date: timestamp,
        rack: item.rack || "N/A", zone: item.zone || "N/A", updatedBy: currentUser, serialNum: item.serialNum || ''
      };
      setSummaryData(prev => [log, ...prev]);
      saveTransactionToDB(log);
    });

    setItemData(prev => prev.map(item => {
        if (itemIdsToDelete.includes(item.id)) return { ...item, status: 'archived' };
        return item;
    }));

    itemIdsToDelete.forEach(id => {
      fetch(`${API_URL}/inventory.php`, { 
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id, action: 'archive' }) 
      });
    });
  }, []);

  const restoreItems = useCallback((itemIdsToRestore) => {
    const currentItems = itemDataRef.current;
    const currentUser = getCurrentUser();
    const timestamp = new Date().toLocaleString();

    const itemsToRestore = currentItems.filter(item => itemIdsToRestore.includes(item.id));
    itemsToRestore.forEach(item => {
      const log = {
        id: uuidv4(), transaction_id: isTransactionActiveRef.current ? 'Pending...' : '-',
        model: item.model, name: item.name, status: 'Restored',
        qty: item.qty, unit: item.unit, cat: item.cat, date: timestamp,
        rack: item.rack || "N/A", zone: item.zone || "N/A", updatedBy: currentUser, serialNum: item.serialNum || ''
      };
      setSummaryData(prev => [log, ...prev]);
      saveTransactionToDB(log);
    });

    setItemData(prev => prev.map(item => {
        if (itemIdsToRestore.includes(item.id)) return { ...item, status: 'active' };
        return item;
    }));

    itemIdsToRestore.forEach(id => {
        fetch(`${API_URL}/inventory.php`, { 
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id, action: 'restore' }) 
        });
    });
  }, []);

  const validateItemDeletion = useCallback((idsToCheck) => {
    const blockedItems = [];
    const currentItems = itemDataRef.current;
    const currentRacks = rackDetailsRef.current;
    const itemsToCheck = currentItems.filter(i => idsToCheck.includes(i.id));

    itemsToCheck.forEach(item => {
      const targetName = superNormalize(item.name);
      if (!targetName) return;
      let isFoundOnMap = false; let locationInfo = "";
      Object.entries(currentRacks).forEach(([key, rack]) => {
        if (key === "DEFECTIVE_RACK" || rack.id === "DEFECTIVE_RACK") return;
        if (rack.beams && Array.isArray(rack.beams)) {
          rack.beams.forEach(beam => {
            const beamItemName = superNormalize(beam.itemName);
            if (beamItemName === targetName) {
              isFoundOnMap = true;
              locationInfo = `Rack: ${rack.id || key} (Zone: ${rack.area || "Unknown"})`;
            }
          });
        }
      });
      if (isFoundOnMap) blockedItems.push({ name: item.name, model: item.model, reason: `Currently at: ${locationInfo}` });
    });
    return blockedItems;
  }, []);

  const updateRackData = useCallback(async (rackId, newData, logDetails = null) => {
    const currentRackDetails = { ...rackDetailsRef.current };
    const updatedRackState = { ...currentRackDetails, [rackId]: newData };
    setRackDetails(updatedRackState);
    setItemData(syncItemLocations(itemDataRef.current, updatedRackState));

    try {
      await fetch(`${API_URL}/racks.php`, { method: 'POST', body: JSON.stringify(updatedRackState) });
      if (logDetails) {
        const currentUser = getCurrentUser();
        const processLog = (d) => {
          const log = {
            id: uuidv4(), transaction_id: isTransactionActiveRef.current ? 'Pending...' : '-',
            model: d.model || 'N/A', name: d.name || "Item",
            status: d.transactionType || 'Slotted', qty: d.qty || 0, unit: 'pcs', cat: d.cat || 'N/A',
            date: new Date().toLocaleString(), rack: rackId, zone: newData.area || 'Unknown',
            updatedBy: currentUser, serialNum: d.serialNum || '-'
          };
          setSummaryData(prev => [log, ...prev]);
          saveTransactionToDB(log);
        };
        if (Array.isArray(logDetails)) logDetails.forEach(detail => processLog(detail));
        else processLog(logDetails);
      }
    } catch (e) { console.error("Save Failed", e); return { success: false, message: "Network Error" }; }
    return { success: true, message: "Success" };
  }, []);

  const updateMultipleRacks = useCallback(async (updates) => {
    const currentRackDetails = { ...rackDetailsRef.current };
    const updatedRackState = { ...currentRackDetails };
    
    updates.forEach(update => {
        updatedRackState[update.rackId] = update.data;
    });

    setRackDetails(updatedRackState);
    setItemData(syncItemLocations(itemDataRef.current, updatedRackState));

    try {
        await fetch(`${API_URL}/racks.php`, { method: 'POST', body: JSON.stringify(updatedRackState) });
        const currentUser = getCurrentUser();
        
        updates.forEach(update => {
            if (update.logs && Array.isArray(update.logs)) {
                update.logs.forEach(d => {
                      const log = {
                          id: uuidv4(), transaction_id: isTransactionActiveRef.current ? 'Pending...' : '-',
                          model: d.model || 'N/A', name: d.name || "Item",
                          status: d.transactionType || 'Slotted', qty: d.qty || 0, unit: 'pcs', cat: d.cat || 'N/A',
                          date: new Date().toLocaleString(), rack: update.rackId, zone: updatedRackState[update.rackId]?.area || 'Unknown',
                          updatedBy: currentUser, serialNum: d.serialNum || '-'
                      };
                      setSummaryData(prev => [log, ...prev]);
                      saveTransactionToDB(log);
                });
            }
        });
    } catch (e) { 
        return { success: false, message: "Network Error" }; 
    }
    return { success: true, message: "Success" };
  }, []);

  const handleCheckIn = useCallback((modelOrName, qtyInput, rackId, specificSerial = "") => {
    const qtyToAdd = parseInt(qtyInput);
    if (isNaN(qtyToAdd) || qtyToAdd <= 0) return { success: false, message: "Invalid Quantity" };

    const currentItems = itemDataRef.current;
    const currentRacks = { ...rackDetailsRef.current };
    const searchStr = superNormalize(modelOrName);

    const candidates = currentItems.filter(i => superNormalize(i.model) === searchStr || superNormalize(i.name) === searchStr);
    if (candidates.length === 0) return { success: false, message: "Item not found in Master Inventory List." };
    
    candidates.sort((a, b) => {
        const startA = getSerialStartNumber(a.serialNum);
        const startB = getSerialStartNumber(b.serialNum);
        if (startA !== Infinity && startB !== Infinity) return startA - startB;
        return new Date(a.dateAdded || 0) - new Date(b.dateAdded || 0);
    });

    const masterItem = candidates[0]; 
    const masterNameNormalized = superNormalize(masterItem.name);

    if (!currentRacks[rackId]) return { success: false, message: "Rack ID not found." };
    const targetRack = currentRacks[rackId];
    const beamIndex = targetRack.beams ? targetRack.beams.findIndex(b => superNormalize(b.itemName) === masterNameNormalized) : -1;

    if (beamIndex === -1) return { success: false, message: `Check-In Failed. Item "${masterItem.name}" is not assigned to Rack ${rackId}.` };

    let totalInAllRacks = 0;
    Object.values(currentRacks).forEach(r => {
      if (r.beams) r.beams.forEach(b => { if (superNormalize(b.itemName) === masterNameNormalized) totalInAllRacks += (parseInt(b.qty) || 0); });
    });

    const globalQty = candidates.reduce((sum, item) => sum + (parseInt(item.qty) || 0), 0);
    const unplacedQty = globalQty - totalInAllRacks;

    if (!specificSerial) {
      if (unplacedQty <= 0) return { success: false, message: `All ${globalQty} units are already placed.` };
      if (qtyToAdd > unplacedQty) return { success: false, message: `Only ${unplacedQty} unplaced items available.` };
    }

    let calculatedSerialLog = 'FIFO Fill';
    
    if (specificSerial) {
      calculatedSerialLog = specificSerial;
    } else {
      let globalSerialStream = [];
      candidates.forEach(c => {
         if (c.serialNum) globalSerialStream.push(...expandSerialString(c.serialNum));
         else for(let k=0; k < (parseInt(c.qty) || 0); k++) globalSerialStream.push("No SN");
      });

      const startIndex = totalInAllRacks;
      const endIndex = startIndex + qtyToAdd;

      if (startIndex < globalSerialStream.length) {
        const myBatch = globalSerialStream.slice(startIndex, Math.min(endIndex, globalSerialStream.length));
        const validBatch = myBatch.filter(s => s !== "No SN");
        if (validBatch.length > 0) calculatedSerialLog = consolidateSerialRanges(validBatch.join(', '));
        else calculatedSerialLog = "FIFO Fill";
      }
    }

    const updatedBeams = [...targetRack.beams];
    updatedBeams[beamIndex] = { ...updatedBeams[beamIndex], qty: (parseInt(updatedBeams[beamIndex].qty) || 0) + qtyToAdd };

    const updatedRackState = { ...currentRacks, [rackId]: { ...targetRack, beams: updatedBeams } };
    setRackDetails(updatedRackState);
    saveRacksToDB(updatedRackState); 
    const newItems = syncItemLocations(currentItems, updatedRackState);
    setItemData(newItems);

    const currentUser = getCurrentUser();
    const log = {
      id: uuidv4(), transaction_id: isTransactionActiveRef.current ? 'Pending...' : '-',
      model: masterItem.model, name: masterItem.name, status: 'Check-In',
      qty: qtyToAdd, unit: masterItem.unit, cat: masterItem.cat, date: new Date().toLocaleString(),
      rack: rackId, zone: targetRack.area || 'N/A', updatedBy: currentUser, serialNum: calculatedSerialLog
    };
    setSummaryData(prev => [log, ...prev]);
    saveTransactionToDB(log); 
    return { success: true, message: "Success" };
  }, []);

  const handleCheckOut = useCallback(async (modelOrName, qtyToRemove, rackIdInput = "Unplaced", targetSerial = "", customStatus = "Check-Out", notes = "") => {
    const qtyRequired = parseInt(qtyToRemove);
    if (isNaN(qtyRequired) || qtyRequired <= 0) return { success: false, message: "Invalid Quantity" };

    const currentItems = [...itemDataRef.current];
    const currentRacks = { ...rackDetailsRef.current };
    const rackId = String(rackIdInput).trim();
    let rackUpdated = false;

    let candidates = currentItems.filter(i => i.id === modelOrName);
    if (candidates.length === 0) {
       const searchStrClean = superNormalize(modelOrName);
       candidates = currentItems.filter(i => {
           const matchModel = superNormalize(i.model) === searchStrClean;
           const matchName = superNormalize(i.name) === searchStrClean;
           const allSerials = expandSerialString(i.serialNum);
           const matchSerial = allSerials.some(s => superNormalize(s) === searchStrClean);
           return (matchModel || matchName || matchSerial);
       });
    }
    
    candidates = candidates.filter(i => parseInt(i.qty) > 0);
    if (candidates.length === 0) return { success: false, message: "Item not found in Master Inventory List." };

    if (!targetSerial && candidates.length > 0) {
        const searchStrClean = superNormalize(modelOrName);
        const exactSerialMatch = candidates.find(i => expandSerialString(i.serialNum).some(s => superNormalize(s) === searchStrClean));
        if (exactSerialMatch) targetSerial = modelOrName;
    }

    const itemInMasterList = candidates[0];
    const targetItemName = itemInMasterList.name;
    const targetModel = itemInMasterList.model;

    if (rackId && rackId !== "Unplaced" && rackId !== "N/A") {
        if (currentRacks[rackId]) {
            const targetRack = currentRacks[rackId];
            const beamIndex = targetRack.beams ? targetRack.beams.findIndex(b => {
                const bNameClean = superNormalize(b.itemName);
                const tNameClean = superNormalize(targetItemName);
                const tModelClean = superNormalize(targetModel);
                return bNameClean === tNameClean || bNameClean === tModelClean;
            }) : -1;

            if (beamIndex === -1) return { success: false, message: `Empty Slot: Item "${targetItemName}" is NOT present in Rack "${rackId}".\n(Qty: 0)` };

            const specificBeam = targetRack.beams[beamIndex];
            const qtyInThisRack = parseInt(specificBeam.qty) || 0;

            if (qtyInThisRack <= 0) return { success: false, message: `Rack Empty: Item exists in Rack "${rackId}" layout, but quantity is 0.` };
            if (qtyInThisRack < qtyRequired) return { success: false, message: `Insufficient in Rack: Rack "${rackId}" only has ${qtyInThisRack} units.\nYou requested ${qtyRequired}.` };
            
            const beam = targetRack.beams[beamIndex];
            const updatedBeams = [...targetRack.beams];
            updatedBeams[beamIndex] = { ...beam, qty: qtyInThisRack - qtyRequired };
            currentRacks[rackId] = { ...targetRack, beams: updatedBeams };
            rackUpdated = true;

        } else {
            return { success: false, message: `Rack Error: Rack ID "${rackId}" not found.` };
        }
    }

    candidates.sort((a, b) => {
        const startA = getSerialStartNumber(a.serialNum);
        const startB = getSerialStartNumber(b.serialNum);
        if (startA !== Infinity && startB !== Infinity) return startA - startB;
        return new Date(a.dateAdded || 0) - new Date(b.dateAdded || 0);
    });

    let targetItemIndex = 0;
    if (targetSerial) {
      const specificItemIndex = candidates.findIndex(i => {
        if (!i.serialNum) return false;
        const allSerials = expandSerialString(i.serialNum);
        return allSerials.some(s => superNormalize(s) === superNormalize(targetSerial));
      });
      if (specificItemIndex !== -1) targetItemIndex = specificItemIndex;
    }

    const itemToDeduct = candidates[targetItemIndex];
    const globalIndex = currentItems.findIndex(i => i.id === itemToDeduct.id);

    if (globalIndex === -1) return { success: false, message: "System Error: Item Index Lost." };

    const updatedItem = { ...currentItems[globalIndex] };
    const currentQty = parseInt(updatedItem.qty) || 0;
    
    if (currentQty < qtyRequired) return { success: false, message: `Insufficient Global Stock. Available: ${currentQty}` };

    updatedItem.qty = currentQty - qtyRequired;

    let removedSerialLog = "FIFO";
    if (updatedItem.serialNum) {
        let serials = expandSerialString(updatedItem.serialNum);
        
        if (targetSerial) {
             const serialIndex = serials.findIndex(s => superNormalize(s) === superNormalize(targetSerial));
             if (serialIndex !== -1) {
                 removedSerialLog = serials[serialIndex];
                 serials.splice(serialIndex, 1);
             } else {
                 removedSerialLog = serials[0];
                 serials.shift();
             }
        } else {
             removedSerialLog = serials.slice(0, qtyRequired).join(", ");
             serials = serials.slice(qtyRequired);
        }
        updatedItem.serialNum = consolidateSerialRanges(serials);
    }

    currentItems[globalIndex] = updatedItem;
    setItemData(currentItems);
    saveItemToDB(updatedItem);
    
    if (rackUpdated) {
        setRackDetails(currentRacks);
        saveRacksToDB(currentRacks);
    }

    const currentUser = getCurrentUser();
    const log = {
        id: uuidv4(), transaction_id: isTransactionActiveRef.current ? 'Pending...' : '-',
        model: updatedItem.model, name: updatedItem.name, status: customStatus, qty: qtyRequired, 
        unit: updatedItem.unit, cat: updatedItem.cat, date: new Date().toLocaleString(), rack: rackId, 
        zone: updatedItem.zone || "N/A", updatedBy: currentUser, serialNum: removedSerialLog, notes: notes
    };
    
    setSummaryData(prev => [log, ...prev]);
    saveTransactionToDB(log);
    return { success: true, message: "Success" };
  }, []);

  const handleDefective = useCallback(async (modelOrName, qty, rackIdInput, serial, reason = 'Reported as defective') => {
    const qtyDefective = parseInt(qty) || 1;
    const currentUser = getCurrentUser();
    const currentItems = [...itemDataRef.current];
    const currentRacks = { ...rackDetailsRef.current };
    const rackId = String(rackIdInput).trim();
    let rackUpdated = false;

    let candidates = currentItems.filter(i => i.id === modelOrName);
    if (candidates.length === 0) {
      const searchStrClean = superNormalize(modelOrName);
      candidates = currentItems.filter(i => {
        const matchModel = superNormalize(i.model) === searchStrClean;
        const matchName = superNormalize(i.name) === searchStrClean;
        const allSerials = expandSerialString(i.serialNum);
        const matchSerial = allSerials.some(s => superNormalize(s) === searchStrClean);
        return (matchModel || matchName || matchSerial);
      });
    }
    candidates = candidates.filter(i => parseInt(i.qty) > 0);
    
    let targetItemIndex = 0;
    if (serial) {
      const idx = candidates.findIndex(i => expandSerialString(i.serialNum).some(s => superNormalize(s) === superNormalize(serial)));
      if (idx !== -1) targetItemIndex = idx;
    }

    if (candidates.length === 0) return { success: false, message: "Item not found or 0 quantity." };
    const masterItem = candidates[targetItemIndex];
    const globalIndex = currentItems.findIndex(i => i.id === masterItem.id);

    if (rackId && rackId !== "Unplaced" && rackId !== "N/A") {
      if (currentRacks[rackId]) {
        const targetRack = currentRacks[rackId];
        const beamIndex = targetRack.beams ? targetRack.beams.findIndex(b => {
           const bName = superNormalize(b.itemName);
           const mName = superNormalize(masterItem.name);
           const mModel = superNormalize(masterItem.model);
           return bName === mName || bName === mModel;
        }) : -1;

        if (beamIndex !== -1) {
          const beam = targetRack.beams[beamIndex];
          const currentBeamQty = parseInt(beam.qty) || 0;
          const newBeamQty = Math.max(0, currentBeamQty - qtyDefective);
          
          if (currentBeamQty !== newBeamQty) {
              const updatedBeams = [...targetRack.beams];
              updatedBeams[beamIndex] = { ...beam, qty: newBeamQty };
              currentRacks[rackId] = { ...targetRack, beams: updatedBeams };
              rackUpdated = true;
          }
        }
      }
    }

    const updatedItem = { ...masterItem };
    updatedItem.qty = Math.max(0, (parseInt(updatedItem.qty) || 0) - qtyDefective);
    
    let removedSerialLog = serial || 'FIFO';
    if (updatedItem.serialNum) {
      let serials = expandSerialString(updatedItem.serialNum);
      if (serial) {
        const sIdx = serials.findIndex(s => superNormalize(s) === superNormalize(serial));
        if (sIdx !== -1) serials.splice(sIdx, 1);
      } else {
        removedSerialLog = serials.slice(0, qtyDefective).join(', ');
        serials.splice(0, qtyDefective);
      }
      updatedItem.serialNum = consolidateSerialRanges(serials);
    }

    currentItems[globalIndex] = updatedItem;
    setItemData(currentItems);
    saveItemToDB(updatedItem);

    if (rackUpdated) {
      setRackDetails(currentRacks); 
      saveRacksToDB(currentRacks);  
    }

    const newLog = {
      id: uuidv4(), transaction_id: isTransactionActiveRef.current ? 'Pending...' : '-',
      date: new Date().toLocaleString(), action: 'Defective', status: 'Defective',
      model: updatedItem.model, name: updatedItem.name, qty: qtyDefective,
      unit: updatedItem.unit, cat: updatedItem.cat, rack: rackId, zone: updatedItem.zone || 'N/A',
      updatedBy: currentUser, serialNum: removedSerialLog, report: reason 
    };

    setSummaryData(prev => [newLog, ...prev]);
    saveTransactionToDB(newLog);
    return { success: true };
  }, []);
  
  const exportToExcel = useCallback(async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Inventory List');

    worksheet.columns = [
      { header: 'Transaction ID', key: 'transaction_id', width: 20 },
      { header: 'Model Number', key: 'model', width: 20 },
      { header: 'Item Name', key: 'name', width: 30 },
      { header: 'Serial #', key: 'serialNum', width: 20 },
      { header: 'Price', key: 'price', width: 15 },
      { header: 'Category', key: 'cat', width: 15 },
      { header: 'Qty', key: 'qty', width: 10 },
      { header: 'Unit', key: 'unit', width: 10 },
      { header: 'Rack', key: 'rack', width: 25 },
      { header: 'Zone', key: 'zone', width: 20 },
    ];

    worksheet.getRow(1).font = { bold: true };

    for (let i = 0; i < itemData.length; i++) {
      const item = itemData[i];
      const rowIndex = i + 2;
      const canvas = document.createElement('canvas');
      JsBarcode(canvas, item.model || "N/A", { format: "CODE128", width: 2, height: 40, displayValue: false });
      const base64Image = canvas.toDataURL('image/png');

      worksheet.addRow({
        transaction_id: item.transaction_id || '-', model: item.model, name: item.name, serialNum: item.serialNum || '-',
        price: `${item.currency || 'PHP'} ${item.price || 0.00}`,
        cat: item.cat, qty: item.qty, unit: item.unit || 'pcs',
        rack: item.rack, zone: item.zone
      });

      worksheet.getRow(rowIndex).height = 60;
      const imageId = workbook.addImage({ base64: base64Image, extension: 'png' });
      worksheet.addImage(imageId, { tl: { col: 0.2, row: rowIndex - 0.8 }, ext: { width: 160, height: 45 } });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `MRO_Inventory_${new Date().toLocaleDateString()}.xlsx`);
  }, [itemData]);

  const value = {
    logo, setLogo, editItem, itemData, summaryData, rackDetails, headerColor, setHeaderColor, codeType, setCodeType,

    // --- TRANSACTION ACTIONS EXPORTED ---
    isTransactionActive, startTransaction, promptFinishTransaction,

    addItem, removeItems, restoreItems, validateItemDeletion, 
    updateRackData, updateMultipleRacks, getGlobalUsedQty, getNextSerial, getItemDetailsByModel, getCalculatedSerialsForRack,
    exportToExcel, handleCheckOut, handleCheckIn, handleDefective, checkoutItem: handleCheckOut
  };

  return (
    <ReportStateContext.Provider value={value}>
      {children}
      {alertConfig.show && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', width: '350px', maxWidth: '90%', boxShadow: '0 2px 10px rgba(0,0,0,0.2)', fontFamily: 'sans-serif' }}>
            <h3 style={{ marginTop: 0 }}>{alertConfig.message}</h3>
            <button onClick={() => setAlertConfig({ show: false, message: '' })} style={{ marginTop: '10px', padding: '8px 16px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>OK</button>
          </div>
        </div>
      )}

      {/* TRANSACTION DONE DIALOG WIDGET */}
      {showTransactionModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div style={{ backgroundColor: 'white', padding: '25px', borderRadius: '8px', width: '400px', boxShadow: '0 4px 15px rgba(0,0,0,0.2)', fontFamily: 'sans-serif' }}>
            <h3 style={{ marginTop: 0, color: '#007bff' }}>Complete Session</h3>
            <p style={{ color: '#555', fontSize: '14px' }}>Please enter a <strong>Transaction ID</strong> for the actions performed in this session.</p>
            <input 
                type="text" 
                value={tempTransactionId} 
                onChange={(e) => setTempTransactionId(e.target.value)}
                placeholder="Enter ID... (e.g. TRN-00124)"
                style={{ width: '100%', padding: '10px', margin: '15px 0', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button onClick={() => setShowTransactionModal(false)} style={{ padding: '8px 15px', background: '#ccc', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                <button onClick={submitTransactionId} disabled={!tempTransactionId.trim()} style={{ padding: '8px 15px', background: tempTransactionId.trim() ? '#007bff' : '#a0cbfc', color: 'white', border: 'none', borderRadius: '4px', cursor: tempTransactionId.trim() ? 'pointer' : 'not-allowed' }}>Save Record</button>
            </div>
          </div>
        </div>
      )}

    </ReportStateContext.Provider>
  );
};