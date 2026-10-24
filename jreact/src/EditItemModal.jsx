import React, { useState, useContext, useEffect } from 'react';
import './Report_Itemlist.css';
import { ReportStateContext } from './LocalStorageContext';
import Barcode from 'react-barcode';

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

// Fallback categories in case LocalStorage is empty
const DEFAULT_CATEGORIES = ['General', 'Electrical', 'Mechanical', 'Tools', 'Safety', 'Consumables'];

const EditItemModal = ({ isOpen, onClose, itemData }) => {
  if (!isOpen || !itemData) return null;

  const { editItem } = useContext(ReportStateContext);
  const [categoryOptions, setCategoryOptions] = useState(DEFAULT_CATEGORIES);
  const [itemImage, setItemImage] = useState(null);
  const [errors, setErrors] = useState({}); // Store error messages here
  
  // --- FORM DATA ---
  const [formData, setFormData] = useState({
    model: '', name: '', qty: '', min_threshold: '', unit: 'pc', 
    serialNum: '', price: '', currency: 'PHP',
    cat: '', lifespan: ''
  });

  // --- LIFESPAN STATE ---
  const [lifespanParts, setLifespanParts] = useState({
    years: '', months: '', days: '', isLifetime: false
  });

  // Helper: Parse Lifespan String -> Objects
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

  // 1. Load Categories
  useEffect(() => {
    const savedColors = localStorage.getItem('admin_hp_colors');
    if (savedColors) {
        try {
            const parsedColors = JSON.parse(savedColors);
            const loadedCategories = Object.keys(parsedColors).filter(key => 
                key !== 'default' && key !== 'Empty' && key !== 'defective'
            );
            if (loadedCategories.length > 0) {
                setCategoryOptions(loadedCategories);
            }
        } catch (e) { console.error(e); }
    }
  }, []);

  // 2. Populate Form with Item Data
  useEffect(() => {
    if (itemData) {
        setFormData({
            model: itemData.model || '',
            name: itemData.name || '',
            // FIX: Handle 0 correctly so it doesn't become empty string
            qty: itemData.qty !== undefined && itemData.qty !== null ? itemData.qty : '',
            min_threshold: itemData.min_threshold || 5,
            unit: itemData.unit || 'pc',
            serialNum: itemData.serialNum || '',
            price: itemData.price || '',
            currency: itemData.currency || 'PHP',
            cat: itemData.cat || '',
            lifespan: itemData.lifespan || ''
        });
        
        setLifespanParts(parseLifespanString(itemData.lifespan));
        setItemImage(itemData.image || null);
        setErrors({}); // Clear errors when opening
    }
  }, [itemData]);

  // 3. Update Lifespan String when parts change
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
  }, [lifespanParts]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // Clear error for this field as user types
    if (errors[name]) {
        setErrors(prev => ({ ...prev, [name]: null }));
    }
  };

  const handleLifespanChange = (field, value) => {
    setLifespanParts(prev => ({ ...prev, [field]: value }));
  };

  const toggleLifetime = (e) => {
    setLifespanParts(prev => ({ ...prev, isLifetime: e.target.checked }));
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setItemImage(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // --- UPDATED VALIDATION ---
    // Removed 'serialNum' from required list
    const required = ['model', 'name', 'qty', 'cat']; 
    let isValid = true;
    let newErrors = {};
    
    required.forEach(field => {
        // Check if field is empty (but allow 0 for numbers)
        if (formData[field] === '' || formData[field] === null || formData[field] === undefined) { 
            newErrors[field] = 'This field is required'; 
            isValid = false; 
        }
    });

    if (!isValid) {
        setErrors(newErrors);
        return; // STOP HERE if invalid
    }

    const updatedItem = {
        ...formData,
        qty: parseInt(formData.qty) || 0,
        price: parseFloat(formData.price) || 0.00,
        image: itemImage,
        min_threshold: parseInt(formData.min_threshold) || 5
    };

    editItem(itemData.id, updatedItem);
    onClose();
  };

  // Styles
  const overlayStyle = {
    position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
    backgroundColor: 'rgba(0, 0, 0, 0.6)', zIndex: 10000,
    display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(2px)'
  };
  const modalStyle = {
    backgroundColor: '#fff', borderRadius: '12px', width: '900px', maxWidth: '95%', maxHeight: '90vh',
    display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
  };
  const formBodyStyle = {
    display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '25px', padding: '25px', overflowY: 'auto'
  };
  // Error Text Style
  const errorStyle = { color: '#dc3545', fontSize: '11px', marginTop: '2px', fontWeight: 'bold' };

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div className="modal-header" style={{ borderBottom: '1px solid #eee', padding: '15px 20px', display: 'flex', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Edit Item Details</h2>
          <span onClick={onClose} style={{ cursor: 'pointer', fontSize: '24px' }}><ion-icon name="close-outline"></ion-icon></span>
        </div>

        <form onSubmit={handleSubmit} style={formBodyStyle}>
          <div className="form-column">
            {/* Model & Name */}
            <div className="form-group">
                <label style={{fontWeight:'bold'}}>Model Number</label>
                <input 
                    type="text" 
                    className="modal-input" 
                    name="model" 
                    value={formData.model} 
                    onChange={handleChange} 
                    style={{ borderColor: errors.model ? '#dc3545' : '#ccc' }}
                />
                {errors.model && <div style={errorStyle}>{errors.model}</div>}
                <div style={{marginTop:'5px'}}><Barcode value={formData.model || "N/A"} width={1} height={25} fontSize={10} /></div>
            </div>

            <div className="form-group">
                <label style={{fontWeight:'bold'}}>Item Name</label>
                <input 
                    type="text" 
                    className="modal-input" 
                    name="name" 
                    value={formData.name} 
                    onChange={handleChange} 
                    style={{ borderColor: errors.name ? '#dc3545' : '#ccc' }}
                />
                {errors.name && <div style={errorStyle}>{errors.name}</div>}
            </div>

            {/* Serial */}
            <div className="form-group">
                <label style={{fontWeight:'bold'}}>Serial / Batch # <span style={{fontWeight:'normal', color:'#888'}}>(Optional)</span></label>
                <input type="text" className="modal-input" name="serialNum" value={formData.serialNum} onChange={handleChange} />
            </div>

            {/* Qty & Unit */}
            <div className="form-group">
                <label style={{fontWeight:'bold'}}>Quantity & Unit</label>
                <div style={{display:'flex', gap:'10px'}}>
                    <div style={{flex: 1}}>
                        <input 
                            type="number" 
                            className="modal-input" 
                            name="qty" 
                            value={formData.qty} 
                            onChange={handleChange} 
                            style={{ width: '100%', borderColor: errors.qty ? '#dc3545' : '#ccc' }}
                        />
                        {errors.qty && <div style={errorStyle}>{errors.qty}</div>}
                    </div>
                    <select className="modal-input" name="unit" value={formData.unit} onChange={handleChange} style={{width:'120px'}}>
                        {UNIT_DEFINITIONS.map(u => <option key={u.code} value={u.code}>{u.singular}</option>)}
                    </select>
                </div>
            </div>

            {/* Price & Cat */}
            <div className="form-group" style={{display:'flex', gap:'15px'}}>
                <div style={{flex:1}}>
                    <label style={{fontWeight:'bold'}}>Price</label>
                    <div style={{display:'flex', border:'1px solid #ccc', borderRadius:'6px'}}>
                        <span style={{padding:'8px', background:'#eee'}}>{formData.currency === 'USD' ? '$' : '₱'}</span>
                        <input type="number" name="price" value={formData.price} onChange={handleChange} style={{border:'none', width:'100%', padding:'8px'}} step="0.01" />
                    </div>
                </div>
                <div style={{flex:1}}>
                    <label style={{fontWeight:'bold'}}>Category</label>
                    <select 
                        className="modal-input" 
                        name="cat" 
                        value={formData.cat} 
                        onChange={handleChange}
                        style={{ borderColor: errors.cat ? '#dc3545' : '#ccc' }}
                    >
                        <option value="">-- Select --</option>
                        {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    {errors.cat && <div style={errorStyle}>{errors.cat}</div>}
                </div>
            </div>
            
            {/* Threshold */}
            <div className="form-group">
                 <label style={{fontWeight:'bold', color:'#d63384'}}>Low Stock Threshold</label>
                 <input type="number" className="modal-input" name="min_threshold" value={formData.min_threshold} onChange={handleChange} />
            </div>
            
            {/* Lifespan */}
             <div className="form-group">
                 <div style={{display:'flex', justifyContent:'space-between'}}>
                    <label style={{fontWeight:'bold'}}>Lifespan</label>
                    <label style={{fontSize:'12px'}}><input type="checkbox" checked={lifespanParts.isLifetime} onChange={toggleLifetime} /> Lifetime</label>
                 </div>
                 {!lifespanParts.isLifetime && (
                    <div style={{display:'flex', gap:'5px'}}>
                        <input type="number" placeholder="Y" className="modal-input" value={lifespanParts.years} onChange={e=>handleLifespanChange('years',e.target.value)} />
                        <input type="number" placeholder="M" className="modal-input" value={lifespanParts.months} onChange={e=>handleLifespanChange('months',e.target.value)} />
                        <input type="number" placeholder="D" className="modal-input" value={lifespanParts.days} onChange={e=>handleLifespanChange('days',e.target.value)} />
                    </div>
                 )}
            </div>

            <button type="submit" style={{marginTop:'20px', padding:'12px', background:'#ffc107', color:'#000', fontWeight:'bold', border:'none', borderRadius:'6px', cursor:'pointer', width:'100%'}}>Save Changes</button>
          </div>

          <div className="image-column">
             <label style={{fontWeight:'bold'}}>Item Image</label>
             <div onClick={() => document.getElementById('edit-img-input').click()} style={{width:'100%', height:'300px', border:'2px dashed #ccc', borderRadius:'8px', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', position:'relative'}}>
                {itemImage ? <img src={itemImage} alt="Preview" style={{maxWidth:'100%', maxHeight:'100%'}} /> : <span>Click to Upload</span>}
                <input type="file" id="edit-img-input" hidden onChange={handleImageUpload} />
             </div>
          </div>
        </form>
      </div>
    </div>
  );
};
export default EditItemModal;