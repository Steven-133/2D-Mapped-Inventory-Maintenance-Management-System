import React, { useState, useContext, useEffect } from 'react';
import './Report_Itemlist.css';
import { ReportStateContext } from './LocalStorageContext';
import Barcode from 'react-barcode';
import { QRCodeSVG } from 'qrcode.react'; 

// --- CONFIG: ESSENTIAL UNIT LIST ---
const UNIT_DEFINITIONS = [
  { code: 'pc', singular: 'Piece (pc)', plural: 'Pieces (pcs)' },
  { code: 'bx', singular: 'Box (bx)', plural: 'Boxes (bxs)' },
  { code: 'ctn', singular: 'Carton (ctn)', plural: 'Cartons (ctns)' },
  { code: 'set', singular: 'Set (set)', plural: 'Sets (sets)' },
  { code: 'kg', singular: 'Kilogram (kg)', plural: 'Kilograms (kgs)' },
  { code: 'L', singular: 'Liter (L)', plural: 'Liters (L)' },
  { code: 'rl', singular: 'Roll (rl)', plural: 'Rolls (rls)' },
  { code: 'plt', singular: 'Pallet (plt)', plural: 'Pallets (plts)' }
];

const AddItemModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  // --- GET codeType FROM CONTEXT (For QR/Barcode toggle) ---
  const { addItem, getItemDetailsByModel, codeType } = useContext(ReportStateContext);
  
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [showSuccess, setShowSuccess] = useState(false);

  // --- FORM DATA ---
  const [formData, setFormData] = useState({
    model: '', // SKU
    name: '', 
    qty: '', 
    min_threshold: '', 
    unit: 'pc', 
    serialNum: '', 
    price: '', 
    currency: 'PHP',
    cat: '', 
    rack: '', 
    zone: '', 
    lifespan: ''
  });

  // --- AUTOMATION STATE ---
  const [isSkuManuallyEdited, setIsSkuManuallyEdited] = useState(false);
  const [randomSuffix, setRandomSuffix] = useState('');

  // --- LIFESPAN STATE ---
  const [lifespanParts, setLifespanParts] = useState({
    years: '', months: '', days: '', isLifetime: false
  });

  const [itemImage, setItemImage] = useState(null);
  const [errors, setErrors] = useState({});
  const [isExisting, setIsExisting] = useState(false);
  
  // --- NEW: STATE FOR DISPLAYING CURRENT DB QUANTITY ---
  const [currentDbQty, setCurrentDbQty] = useState(0); 
  
  // --- INITIALIZATION ---
  useEffect(() => {
    if (isOpen) {
      // 1. Generate a stable 4-digit random suffix for this session
      setRandomSuffix(Math.floor(1000 + Math.random() * 9000)); 
      setIsSkuManuallyEdited(false); // Reset manual flag

      // 2. Load Categories
      try {
        const savedColors = localStorage.getItem('admin_hp_colors');
        if (savedColors) {
          const parsedColors = JSON.parse(savedColors);
          const loadedCategories = Object.keys(parsedColors).filter(key =>
            key !== 'default' && key !== 'Empty' && key !== 'defective'
          );
          setCategoryOptions(loadedCategories);
          if (loadedCategories.length > 0 && !formData.cat) {
            setFormData(prev => ({ ...prev, cat: loadedCategories[0] }));
          }
        }
      } catch (e) {
        console.error("Error loading categories:", e);
      }
    } else {
      resetForm();
      setShowSuccess(false);
    }
  }, [isOpen]);

  // --- ADVANCED SMART SKU AUTO-GENERATION ---
  useEffect(() => {
    // Only run if: Modal is Open, User hasn't typed their own SKU, and it's not an existing item
    if (isOpen && !isSkuManuallyEdited && !isExisting) {
        
        // 1. Category Prefix (First 3 letters)
        const catPrefix = formData.cat ? formData.cat.substring(0, 3).toUpperCase() : 'ITM';
        
        // 2. Name Slug (First 5 letters of cleaned name)
        let nameSlug = 'GEN';
        if (formData.name && formData.name.trim().length > 0) {
            const cleanName = formData.name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
            if (cleanName.length > 0) {
                nameSlug = cleanName.substring(0, 5);
            }
        }

        // 3. Unit Identifier (New Addition)
        const unitSuffix = formData.unit ? formData.unit.toUpperCase() : 'PC';

        // 4. Construct SKU: CAT - NAME - UNIT - 4DIGIT
        const autoSku = `${catPrefix}-${nameSlug}-${unitSuffix}-${randomSuffix}`;

        setFormData(prev => ({ ...prev, model: autoSku }));
        
        if (errors.model) setErrors(prev => ({ ...prev, model: '' }));
    }
  }, [formData.cat, formData.name, formData.unit, randomSuffix, isSkuManuallyEdited, isOpen, isExisting]);


  // --- LOGIC: CONSTRUCT LIFESPAN STRING ---
  useEffect(() => {
    let finalString = "";
    if (lifespanParts.isLifetime) {
        finalString = "N/A"; 
    } else {
        const parts = [];
        if (lifespanParts.years && lifespanParts.years > 0) parts.push(`${lifespanParts.years} Years`);
        if (lifespanParts.months && lifespanParts.months > 0) parts.push(`${lifespanParts.months} Months`);
        if (lifespanParts.days && lifespanParts.days > 0) parts.push(`${lifespanParts.days} Days`);
        finalString = parts.join(", ");
    }
    setFormData(prev => ({ ...prev, lifespan: finalString }));
    if (finalString) setErrors(prev => ({ ...prev, lifespan: '' }));
  }, [lifespanParts]);


  // --- CHECK IF ITEM IS EXISTING ---
  useEffect(() => {
    if (formData.model && isSkuManuallyEdited) {
      const details = getItemDetailsByModel(formData.model);
      if (details) {
        const dbLifespan = (details.lifespan || "").trim().toLowerCase();
        const formLifespan = (formData.lifespan || "").trim().toLowerCase();
        if (dbLifespan !== formLifespan) {
          setIsExisting(false);
          setCurrentDbQty(0);
        } else {
          setIsExisting(true);
          setCurrentDbQty(details.qty || 0); // Update Quantity Display
        }
      } else {
        setIsExisting(false);
        setCurrentDbQty(0);
      }
    }
  }, [formData.model, formData.lifespan, getItemDetailsByModel, isSkuManuallyEdited]);

  // --- HELPER: SERIAL NUMBER GENERATOR ---
  const generateSerialBatch = (baseSerial, qty) => {
    if (!baseSerial || qty <= 1) return baseSerial;
    const match = baseSerial.match(/^(.*?)(\d+)$/);
    if (!match) return baseSerial;

    const prefix = match[1];      // "SN-"
    const startNumStr = match[2]; // "100"
    const startNum = parseInt(startNumStr, 10);
    const length = startNumStr.length;

    let serialList = [];
    for (let i = 0; i < qty; i++) {
        const nextNum = String(startNum + i).padStart(length, '0');
        serialList.push(`${prefix}${nextNum}`);
    }
    return serialList.join(', ');
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'model') setIsSkuManuallyEdited(true);
    setFormData(prev => ({ ...prev, [name]: value }));
    setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const handleLifespanChange = (field, value) => {
    setLifespanParts(prev => ({ ...prev, [field]: value }));
  };

  const toggleLifetime = (e) => {
    const isChecked = e.target.checked;
    setLifespanParts(prev => ({
        ...prev,
        isLifetime: isChecked,
        years: isChecked ? '' : prev.years,
        months: isChecked ? '' : prev.months,
        days: isChecked ? '' : prev.days
    }));
  };

  const parseLifespanString = (str) => {
    if (!str) return { years: '', months: '', days: '', isLifetime: false };
    const s = str.toLowerCase();
    if (s.includes('n/a') || s.includes('lifetime')) {
        return { years: '', months: '', days: '', isLifetime: true };
    }
    let y = '', m = '', d = '';
    const yMatch = s.match(/(\d+)\s*y/);
    const mMatch = s.match(/(\d+)\s*m/);
    const dMatch = s.match(/(\d+)\s*d/);
    if (yMatch) y = yMatch[1];
    if (mMatch) m = mMatch[1];
    if (dMatch) d = dMatch[1];
    return { years: y, months: m, days: d, isLifetime: false };
  };

  const handleModelBlur = (manualValue) => {
    const valueToCheck = typeof manualValue === 'string' ? manualValue : formData.model;
    if (valueToCheck) {
      const details = getItemDetailsByModel(valueToCheck);
      if (details) {
        setIsExisting(true); 
        setIsSkuManuallyEdited(true); 
        setCurrentDbQty(details.qty || 0);
        
        if (details.lifespan) {
            const parsed = parseLifespanString(details.lifespan);
            setLifespanParts(parsed);
        }

        setFormData(prev => ({
          ...prev,
          name: details.name || prev.name,
          price: details.price || prev.price,
          currency: details.currency || prev.currency,
          cat: details.cat || prev.cat,
          unit: details.unit || 'pc', 
          min_threshold: details.min_threshold || prev.min_threshold,
        }));

        if (details.image && !itemImage) setItemImage(details.image);
      } else {
        if (isSkuManuallyEdited) {
            setIsExisting(false);
            setCurrentDbQty(0);
        }
      }
    }
  };

  const handleImageClick = () => document.getElementById('image-upload-input').click();

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setItemImage(reader.result);
        setErrors(prev => ({ ...prev, image: '' }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = (e) => {
    e.stopPropagation();
    setItemImage(null);
    document.getElementById('image-upload-input').value = '';
  };

  const resetForm = () => {
    setFormData({
      model: '', name: '', qty: '', min_threshold: '', unit: 'pc',
      serialNum: '', price: '', currency: 'PHP',
      cat: categoryOptions.length > 0 ? categoryOptions[0] : '',
      rack: '', zone: '', lifespan: ''
    });
    setLifespanParts({ years: '', months: '', days: '', isLifetime: false });
    setItemImage(null);
    setErrors({});
    setIsExisting(false);
    setIsSkuManuallyEdited(false);
    setRandomSuffix('');
    setCurrentDbQty(0);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const newErrors = {};
    let isValid = true;

    const requiredFields = ['model', 'name', 'qty', 'min_threshold', 'price', 'cat'];
    requiredFields.forEach(field => {
      if (!formData[field] || String(formData[field]).trim() === '') {
        newErrors[field] = 'Required';
        isValid = false;
      }
    });

    if (!formData.lifespan) { newErrors.lifespan = 'Required'; isValid = false; }
    if (!itemImage) { newErrors.image = 'Image is required'; isValid = false; }

    setErrors(newErrors);
    if (!isValid) return; 

    const qtyInt = parseInt(String(formData.qty).trim(), 10) || 0;
    
    // Auto-Generate Serial Batch (Only works if user provided a start serial)
    let finalSerial = formData.serialNum || '';
    if (qtyInt > 1 && finalSerial) {
        finalSerial = generateSerialBatch(finalSerial, qtyInt);
    }

    const baseItemData = {
      ...formData,
      qty: qtyInt,
      min_threshold: parseInt(formData.min_threshold) || 5,
      unit: formData.unit,
      price: parseFloat(formData.price) || 0.00,
      serialNum: finalSerial,
      currency: formData.currency || 'PHP',
      image: itemImage,
      lifespan: formData.lifespan
    };

    addItem(baseItemData);
    setShowSuccess(true);
    setTimeout(() => {
      resetForm();
      setShowSuccess(false);
      onClose();
    }, 2000);
  };

  const overlayStyle = { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0, 0, 0, 0.6)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(2px)' };
  const modalStyle = { backgroundColor: '#fff', borderRadius: '12px', width: '900px', maxWidth: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', position: 'relative', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)', overflow: 'hidden' };
  const formBodyStyle = { display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '25px', padding: '25px', overflowY: 'auto', maxHeight: 'calc(90vh - 70px)' };
  const labelStyle = { fontWeight: 'bold', color: '#333' };
  const requiredStar = <span style={{color: 'red', marginLeft: '3px'}}>*</span>;

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        {showSuccess && (
          <div className="success-overlay" style={{position:'absolute', zIndex: 10001, borderRadius:'12px'}}>
            <div className="success-icon-container"><ion-icon name="checkmark-sharp" style={{ fontSize: '48px', color: '#2e7d32' }}></ion-icon></div>
            <div className="success-title">Success!</div>
            <p style={{ color: '#666', marginTop: '5px' }}>{isExisting ? "Item merged successfully." : "Item added successfully."}</p>
          </div>
        )}
        <div className="modal-header" style={{ flexShrink: 0, borderBottom: '1px solid #eee' }}>
          <h2 className="modal-title" style={{ margin: 10, fontSize: '1.5rem' }}>{isExisting ? "Restock / Merge Item" : "Add New Item"}</h2>
          <span className="close-icon" onClick={onClose} style={{ cursor: 'pointer', fontSize: '24px' }}><ion-icon name="close-outline"></ion-icon></span>
        </div>
        <form onSubmit={handleSubmit} style={formBodyStyle}>
          <div className="form-column">
            
            {/* NAME FIELD */}
            <div className="form-group">
              <label style={labelStyle}>Item Name {requiredStar}</label>
              <input type="text" className="modal-input" name="name" value={formData.name} onChange={handleChange} readOnly={isExisting} style={{ backgroundColor: isExisting ? '#f5f5f5' : 'white' }} placeholder="e.g. Wireless Mouse" />
              {errors.name && <p style={{color: 'red', fontSize: '12px', margin: '2px 0'}}>{errors.name}</p>}
            </div>

            {/* CATEGORY */}
            <div className="form-group">
              <label style={labelStyle}>Category {requiredStar}</label>
              <select className="modal-input" name="cat" value={formData.cat} onChange={handleChange}>
                {categoryOptions.length === 0 && <option value="">No categories found</option>}
                {categoryOptions.map((cat, index) => <option key={index} value={cat}>{cat}</option>)}
              </select>
              {errors.cat && <p style={{color: 'red', fontSize: '12px', margin: '2px 0'}}>{errors.cat}</p>}
            </div>

             {/* QTY & UNIT */}
            <div className="form-group">
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px'}}>
                <label style={labelStyle}>{isExisting ? "Quantity to Add" : "Quantity & Unit"} {requiredStar}</label>
                {isExisting && <span style={{ fontSize: '12px', color: '#1976d2', fontWeight: '600', backgroundColor: '#e3f2fd', padding: '2px 6px', borderRadius: '4px' }}>Current Stock: {currentDbQty} {formData.unit}</span>}
              </div>
              <div style={{display: 'flex', gap: '10px'}}>
                <input type="number" className="modal-input" name="qty" value={formData.qty} onChange={handleChange} min="1" style={{ flex: 1 }} placeholder="Qty" />
                <select className="modal-input" name="unit" value={formData.unit} onChange={handleChange} style={{width: '140px'}}>
                   {UNIT_DEFINITIONS.map(opt => <option key={opt.code} value={opt.code}>{(parseInt(formData.qty) > 1) ? opt.plural : opt.singular}</option>)}
                </select>
              </div>
              {errors.qty && <p style={{color: 'red', fontSize: '12px', margin: '2px 0'}}>{errors.qty}</p>}
            </div>

            {/* SKU (MODEL) */}
            <div className="form-group">
              <label style={labelStyle}>SKU (Stock Keeping Unit) {requiredStar}</label>
              <input type="text" className="modal-input" name="model" value={formData.model} onChange={handleChange} onBlur={() => handleModelBlur()} placeholder="Auto-generating..." autoComplete="off" style={{ backgroundColor: isSkuManuallyEdited ? 'white' : '#e3f2fd', border: isSkuManuallyEdited ? '1px solid #ccc' : '1px solid #2196f3', fontWeight: isSkuManuallyEdited ? 'normal' : 'bold' }} />
              <div style={{display: 'flex', justifyContent: 'space-between', marginTop: '2px'}}>
                  <p style={{fontSize: '11px', color: '#666', margin: 0}}>{isSkuManuallyEdited ? "Manual Mode: You are editing the SKU." : "Auto Mode: Generating from Category + Name + Unit"}</p>
                  {isSkuManuallyEdited && <span onClick={() => { setIsSkuManuallyEdited(false); }} style={{fontSize: '11px', color: '#2196f3', cursor: 'pointer', textDecoration: 'underline'}}>Reset to Auto</span>}
              </div>
              {errors.model && <p style={{color: 'red', fontSize: '12px', margin: '2px 0'}}>{errors.model}</p>}
              
              {formData.model && (
                <div style={{ marginTop: '10px', padding: '10px', background: '#fff', border: '1px solid #ddd', borderRadius: '4px', textAlign: 'center', display:'flex', justifyContent:'center', alignItems:'center', minHeight:'60px' }}>
                  {codeType === 'qr' ? <QRCodeSVG value={formData.model} size={100} level={"M"} /> : <Barcode value={formData.model} width={1.5} height={40} fontSize={14} background="#ffffff" />}
                </div>
              )}
            </div>

            {/* --- SERIAL (OPTIONAL) - HIDDEN AS REQUESTED --- */}
            {/* <div className="form-group">
              <label style={labelStyle}>Start Serial Number (Auto-Increments on Save)</label>
              <input type="text" className="modal-input" name="serialNum" value={formData.serialNum} onChange={handleChange} placeholder="e.g. SN-100 (Will generate SN-100, SN-101...)" />
              {parseInt(formData.qty) > 1 && formData.serialNum && (
                 <p style={{fontSize: '11px', color: '#1976d2', marginTop: '2px'}}>
                    System will generate <strong>{formData.qty}</strong> serials starting from <strong>{formData.serialNum}</strong>.
                 </p>
              )}
            </div> 
            */}
            {/* ----------------------------------------------- */}

            {/* THRESHOLD */}
            <div className="form-group">
              <label style={{color: '#d63384', fontWeight: 'bold'}}>Restock Threshold (Low Stock) {requiredStar}</label>
              <input type="number" className="modal-input" name="min_threshold" value={formData.min_threshold} onChange={handleChange} placeholder="Alert when quantity is below..." />
              {errors.min_threshold && <p style={{color: 'red', fontSize: '12px', margin: '2px 0'}}>{errors.min_threshold}</p>}
            </div>

            {/* LIFESPAN */}
            <div className="form-group">
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'5px'}}>
                <label style={labelStyle}>Lifespan / Expiry {requiredStar}</label>
                <label style={{fontSize:'13px', cursor:'pointer', display:'flex', alignItems:'center', gap:'5px', color: lifespanParts.isLifetime ? '#28a745' : '#666'}}>
                   <input type="checkbox" checked={lifespanParts.isLifetime} onChange={toggleLifetime} style={{cursor:'pointer'}} /> Lifetime / N/A
                </label>
              </div>
              {!lifespanParts.isLifetime && (
                <div style={{display:'flex', gap:'10px'}}>
                   <div style={{flex:1}}><input type="number" className="modal-input" placeholder="0" min="0" value={lifespanParts.years} onChange={(e) => handleLifespanChange('years', e.target.value)} /><span style={{fontSize:'10px', color:'#666'}}>Years</span></div>
                   <div style={{flex:1}}><input type="number" className="modal-input" placeholder="0" min="0" max="11" value={lifespanParts.months} onChange={(e) => handleLifespanChange('months', e.target.value)} /><span style={{fontSize:'10px', color:'#666'}}>Months</span></div>
                   <div style={{flex:1}}><input type="number" className="modal-input" placeholder="0" min="0" max="31" value={lifespanParts.days} onChange={(e) => handleLifespanChange('days', e.target.value)} /><span style={{fontSize:'10px', color:'#666'}}>Days</span></div>
                </div>
              )}
              {lifespanParts.isLifetime && <div style={{padding:'10px', background:'#e8f5e9', color:'#2e7d32', borderRadius:'6px', fontSize:'14px', textAlign:'center', fontWeight:'bold'}}><ion-icon name="infinite-outline" style={{verticalAlign:'middle', marginRight:'5px'}}></ion-icon> No Expiry / Lifetime</div>}
              {errors.lifespan && <p style={{color: 'red', fontSize: '12px', margin: '2px 0'}}>Lifespan is required</p>}
            </div>

            {/* PRICE */}
            <div className="form-group">
              <label style={labelStyle}>Price {requiredStar}</label>
              <div style={{ display: 'flex', border: '1px solid #ccc', borderRadius: '8px', overflow: 'hidden', height: '45px' }}>
                <select name="currency" value={formData.currency} onChange={handleChange} style={{ width: '80px', border: 'none', background: '#f0f0f0', fontWeight: 'bold', padding: '0 10px', height: '100%' }}>
                  <option value="PHP">₱</option><option value="USD">$</option>
                </select>
                <input type="number" name="price" value={formData.price} onChange={handleChange} min="0" step="0.01" placeholder="0.00" style={{ border: 'none', flex: 1, padding: '0 10px', height: '100%', outline: 'none' }} />
              </div>
              {errors.price && <p style={{color: 'red', fontSize: '12px', margin: '2px 0'}}>{errors.price}</p>}
            </div>

            <button type="submit" style={{ marginTop: '20px', backgroundColor: isExisting ? '#1976d2' : '#28A745', color: 'white', border: 'none', width: '100%', padding: '14px', fontSize: '16px', fontWeight: 'bold', borderRadius: '8px', cursor: 'pointer' }}>
              {isExisting ? "Confirm Merge / Restock" : "Confirm Add Item"}
            </button>
          </div>

          <div className="image-column" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label style={{ fontWeight: 'bold', color: '#555' }}>Item Image {requiredStar}</label>
            <input type="file" id="image-upload-input" style={{ display: 'none' }} accept="image/*" onChange={handleImageUpload} />
            <div className="image-upload-box" onClick={handleImageClick} style={{ width: '100%', height: '300px', border: itemImage ? 'none' : (errors.image ? '2px dashed red' : '2px dashed #ccc'), borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backgroundColor: '#fafafa', position: 'relative', overflow: 'hidden' }}>
              {itemImage ? (
                <><img src={itemImage} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /><button onClick={handleRemoveImage} style={{ position: 'absolute', bottom: '10px', right: '10px', background: '#d32f2f', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' }}>Remove</button></>
              ) : (
                <div style={{ textAlign: 'center', color: '#999' }}><ion-icon name="image-outline" style={{ fontSize: '48px' }}></ion-icon><p>Click to Upload</p></div>
              )}
            </div>
            {errors.image && <p style={{color: 'red', fontSize: '12px', textAlign: 'center'}}>{errors.image}</p>}
          </div>
        </form>
      </div>
    </div>
  );
};
export default AddItemModal;