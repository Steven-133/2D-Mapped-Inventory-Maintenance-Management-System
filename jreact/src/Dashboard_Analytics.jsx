import React, { useContext, useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ReportStateContext, ReportStateProvider } from './LocalStorageContext';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './Dashboard_Analytics.css';

const API_BASE_URL = 'http://localhost/mro-api';

const Dashboard_AnalyticsContent = () => {
    const navigate = useNavigate();
    const { itemData, summaryData, headerColor } = useContext(ReportStateContext);
    const [selectedNav, setSelectedNav] = useState('dashboard');

    // --- 1. NEW FILTER STATE FOR TOP MOVERS ---
    const [topMoversFilter, setTopMoversFilter] = useState('all');

    // --- CONFIGURABLE DEAD STOCK DAYS (Default 90) ---
    const [deadStockDays, setDeadStockDays] = useState(90);

    // --- LOGO STATE ---
    const [logo, setLogo] = useState(() => {
        return localStorage.getItem('admin_logo') || 'https://cdn-icons-png.flaticon.com/512/25/25694.png';
    });

    // --- FETCH SETTINGS (FOR DEAD STOCK CONFIG) ---
    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/settings.php`);
                const data = await response.json();

                const logoSetting = data.find(d => d.setting_key === 'admin_logo');
                if (logoSetting && logoSetting.setting_value) setLogo(logoSetting.setting_value);

                const dsSetting = data.find(d => d.setting_key === 'dead_stock_days');
                if (dsSetting) setDeadStockDays(parseInt(dsSetting.setting_value) || 90);

            } catch (error) {
                console.error("Error fetching settings for analytics:", error);
            }
        };
        fetchSettings();
    }, []);

    // --- MODAL STATE ---
    const [activeModal, setActiveModal] = useState(null);

    // --- 2. HELPER: DATE CHECKER ---
    const isDateInFilter = (dateStr, filter) => {
        if (filter === 'all') return true;
        
        const targetDate = new Date(dateStr);
        const now = new Date();
        
        // Reset times to compare dates only (ignore hours/minutes)
        const target = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        if (filter === 'daily') {
            return target.getTime() === today.getTime();
        }
        if (filter === 'monthly') {
            return target.getMonth() === today.getMonth() && target.getFullYear() === today.getFullYear();
        }
        if (filter === 'yearly') {
            return target.getFullYear() === today.getFullYear();
        }
        return true;
    };

    // --- ANALYTICS ENGINE ---
    const analytics = useMemo(() => {
        const now = new Date();
        const stats = { lowStock: [], deadStock: [], bestsellers: [], expiring: [] };
        const movementMap = {};

        // Initialize Map with Date Added
        itemData.forEach(item => {
            movementMap[item.name] = { totalOut: 0, lastDate: new Date(item.dateAdded), model: item.model };
        });

        // Process Transactions
        summaryData.forEach(tx => {
            if (!movementMap[tx.name]) return;
            const txDate = new Date(tx.date);

            // --- STRICT DEAD STOCK LOGIC ---
            // Only reset the "Dormant Timer" if the item was actually USED/SOLD (Check-Out)
            // If we just Restocked (Check-In), that doesn't mean the item is "moving".
            const isUsage = tx.status === 'Check-Out' || tx.status === 'Consumed' || tx.status === 'OUT';

            if (isUsage) {
                if (txDate > movementMap[tx.name].lastDate) {
                    movementMap[tx.name].lastDate = txDate;
                }
            }

            // B. TOP MOVERS CALCULATION
            if (isDateInFilter(tx.date, topMoversFilter)) {
                if (tx.status === 'Check-Out' || tx.status === 'Consumed' || tx.status === 'OUT') {
                    movementMap[tx.name].totalOut += parseInt(tx.qty || 0);
                }
            }
        });

        itemData.forEach(item => {
            const qty = parseInt(item.qty || 0);
            const threshold = parseInt(item.min_threshold || 5);

            // 1. Low Stock
            if (qty === 0 || qty <= threshold) {
                stats.lowStock.push({ ...item, type: qty === 0 ? 'Empty' : 'Low' });
            }

            // 2. Dead Stock (> Configured Days no usage)
            // Fallback: If no transactions, use dateAdded.
            const lastMove = movementMap[item.name]?.lastDate || new Date(item.dateAdded);
            const daysSinceMove = Math.floor((now - lastMove) / (1000 * 60 * 60 * 24));

            // USE CONFIGURABLE DAYS HERE
            if (daysSinceMove > deadStockDays && qty > 0) {
                stats.deadStock.push({ ...item, daysDormant: daysSinceMove, lastMoveDate: lastMove.toLocaleDateString() });
            }

            // 3. Expiry Logic
            if (item.lifespan && item.dateAdded) {
                const match = item.lifespan.match(/(\d+)\s*(year|month|day|week)/i);
                if (match) {
                    const val = parseInt(match[1]);
                    const unit = match[2].toLowerCase();
                    const added = new Date(item.dateAdded);
                    const expiry = new Date(added);

                    if (unit.startsWith('year')) expiry.setFullYear(expiry.getFullYear() + val);
                    else if (unit.startsWith('month')) expiry.setMonth(expiry.getMonth() + val);
                    else if (unit.startsWith('week')) expiry.setDate(expiry.getDate() + (val * 7));
                    else if (unit.startsWith('day')) expiry.setDate(expiry.getDate() + val);

                    const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));

                    if (daysLeft < 60) {
                        stats.expiring.push({
                            ...item,
                            daysLeft: daysLeft,
                            expiryStatus: daysLeft < 0 ? 'Expired' : 'Expiring Soon'
                        });
                    }
                }
            }
        });

        // 4. Bestsellers
        stats.bestsellers = Object.values(movementMap)
            .map(m => ({ name: Object.keys(movementMap).find(key => movementMap[key] === m), ...m }))
            .filter(i => i.totalOut > 0)
            .sort((a, b) => b.totalOut - a.totalOut);

        stats.lowStock.sort((a, b) => a.qty - b.qty);
        stats.deadStock.sort((a, b) => b.daysDormant - a.daysDormant);
        stats.expiring.sort((a, b) => a.daysLeft - b.daysLeft);

        return stats;
    }, [itemData, summaryData, topMoversFilter, deadStockDays]);

    // --- PDF DATA HELPER ---
    const getReportData = (type) => {
        if (type === 'low') {
            return {
                title: "Low Stock & Empty Items Report",
                columns: ["Item Name", "SKU", "Status", "Qty", "Threshold"],
                headerColor: [220, 53, 69], // Red
                rows: analytics.lowStock.map(i => [i.name, i.model, i.type, i.qty, i.min_threshold || 5])
            };
        } else if (type === 'top') {
            const periodText = topMoversFilter === 'all' ? 'All Time' : topMoversFilter.charAt(0).toUpperCase() + topMoversFilter.slice(1);
            return {
                title: `Top Movers (${periodText}) Report`,
                columns: ["Rank", "Item Name", "SKU", "Total Check-Out"],
                headerColor: [40, 167, 69], // Green
                rows: analytics.bestsellers.map((i, idx) => [idx + 1, i.name, i.model, i.totalOut])
            };
        } else if (type === 'dead') {
            return {
                title: `Dead Stock Report (>${deadStockDays} Days Dormant)`,
                columns: ["Item Name", "SKU", "Qty Stuck", "Days Dormant", "Last Usage"],
                headerColor: [253, 126, 20], // Orange
                rows: analytics.deadStock.map(i => [i.name, i.model, i.qty, `${i.daysDormant} days`, i.lastMoveDate])
            };
        } else if (type === 'expiry') {
            return {
                title: "Item Life Health Report",
                columns: ["Item Name", "SKU", "Status", "Days Left", "Qty"],
                headerColor: [255, 193, 7], // Yellow
                rows: analytics.expiring.map(i => [
                    i.name, i.model, i.expiryStatus,
                    i.daysLeft < 0 ? `${Math.abs(i.daysLeft)} days ago` : `${i.daysLeft} days`,
                    i.qty
                ])
            };
        }
        return null;
    };

    // --- PDF EXPORT FUNCTION ---
    const handleExportPDF = (specificType = null) => {
        const typeToUse = specificType || activeModal;
        if (!typeToUse) return;

        const doc = new jsPDF();
        const dateStr = new Date().toLocaleDateString();
        
        // --- EXPORT ALL AS ONE DOCUMENT ---
        if (typeToUse === 'all') {
            doc.setFontSize(22);
            doc.text("Inventory Analytics Full Report", 14, 20);
            doc.setFontSize(11);
            doc.text(`Generated on: ${dateStr}`, 14, 28);
            
            let finalY = 35;
            const reportTypes = ['low', 'top', 'dead', 'expiry'];

            reportTypes.forEach((rptType, index) => {
                const data = getReportData(rptType);
                
                // Check if we need a new page for the next table
                if (finalY > 250) {
                    doc.addPage();
                    finalY = 20;
                }

                doc.setFontSize(14);
                doc.setTextColor(0, 0, 0);
                doc.text(data.title, 14, finalY);
                
                autoTable(doc, {
                    startY: finalY + 5,
                    head: [data.columns],
                    body: data.rows,
                    theme: 'grid',
                    headStyles: { fillColor: data.headerColor },
                    margin: { top: 20 },
                    didDrawPage: (d) => { finalY = d.cursor.y; } // Update cursor
                });

                finalY = doc.lastAutoTable.finalY + 15; // Spacing after table
            });
            
            doc.save(`Full_Inventory_Report_${dateStr}.pdf`);
        } 
        // --- EXPORT SINGLE REPORT ---
        else {
            const data = getReportData(typeToUse);
            if (!data) return;

            doc.setFontSize(18);
            doc.text(data.title, 14, 20);
            doc.setFontSize(11);
            doc.text(`Generated on: ${dateStr}`, 14, 28);
            
            autoTable(doc, {
                startY: 35,
                head: [data.columns],
                body: data.rows,
                theme: 'grid',
                headStyles: { fillColor: data.headerColor },
            });
            doc.save(`${data.title.replace(/\s+/g, '_')}_${dateStr}.pdf`);
        }
    };

    // --- MODAL CONTENT RENDERER ---
    const renderModalContent = () => {
        if (activeModal === 'low') {
            return (
                <table>
                    <thead><tr style={{ background: '#f8f9fa' }}><th>Item Name</th><th>SKU</th><th>Status</th><th>Qty / Limit</th></tr></thead>
                    <tbody>
                        {analytics.lowStock.map((item, i) => (
                            <tr key={i}>
                                <td>{item.name}</td>
                                <td>{item.model}</td>
                                <td><span className={`badge ${item.type === 'Empty' ? 'badge-red' : 'badge-orange'}`}>{item.type}</span></td>
                                <td style={{ fontWeight: 'bold', color: item.qty === 0 ? 'red' : 'orange' }}>{item.qty} / {item.min_threshold || 5}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            );
        }
        if (activeModal === 'top') {
            return (
                <table>
                    <thead><tr style={{ background: '#f8f9fa' }}><th>Rank</th><th>Item Name</th><th>SKU</th><th>Total Check-Out</th></tr></thead>
                    <tbody>
                        {analytics.bestsellers.map((item, i) => (
                            <tr key={i}>
                                <td><div className="rank-circle" style={{ margin: 0 }}>{i + 1}</div></td>
                                <td>{item.name}</td>
                                <td>{item.model}</td>
                                <td style={{ fontWeight: 'bold', color: '#28a745' }}>{item.totalOut}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            );
        }
        if (activeModal === 'dead') {
            return (
                <table>
                    <thead><tr style={{ background: '#f8f9fa' }}><th>Item Name</th><th>SKU</th><th>Qty Stuck</th><th>Dormant Time</th></tr></thead>
                    <tbody>
                        {analytics.deadStock.map((item, i) => (
                            <tr key={i}>
                                <td>{item.name}</td>
                                <td>{item.model}</td>
                                <td style={{ fontWeight: 'bold' }}>{item.qty}</td>
                                <td style={{ color: '#666' }}>{item.daysDormant} days</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            );
        }
        if (activeModal === 'expiry') {
            return (
                <table>
                    <thead><tr style={{ background: '#f8f9fa' }}><th>Item Name</th><th>SKU</th><th>Status</th><th>Time Remaining</th><th>Qty</th></tr></thead>
                    <tbody>
                        {analytics.expiring.map((item, i) => (
                            <tr key={i}>
                                <td>{item.name}</td>
                                <td>{item.model}</td>
                                <td>
                                    <span className={`badge ${item.daysLeft < 0 ? 'badge-red' : 'badge-orange'}`}>
                                        {item.daysLeft < 0 ? 'EXPIRED' : 'SOON'}
                                    </span>
                                </td>
                                <td style={{ fontWeight: 'bold', color: item.daysLeft < 0 ? '#dc3545' : '#e67e22' }}>
                                    {item.daysLeft < 0 ? `${Math.abs(item.daysLeft)} days ago` : `${item.daysLeft} days`}
                                </td>
                                <td>{item.qty}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            );
        }
        return null;
    };

    const getModalTitle = () => {
        if (activeModal === 'low') return "All Low Stock & Empty Items";
        if (activeModal === 'top') {
            const periodText = topMoversFilter === 'all' ? 'All Time' : topMoversFilter.charAt(0).toUpperCase() + topMoversFilter.slice(1);
            return `All Top Movers (${periodText})`;
        }
        if (activeModal === 'dead') return `All Dead Stock (>${deadStockDays} Days)`;
        if (activeModal === 'expiry') return "All Item Life Health (Expired & Soon)";
        return "";
    };

    const handleLogout = () => {
        localStorage.removeItem('currentUser');
        navigate('/');
    };

    return (
        <div className="dash-wrapper">
            {/* SIDEBAR */}
            <div className="dash-sidebar">
                <div className={`dash-nav-item ${selectedNav === 'dashboard' ? 'selected' : ''}`} onClick={() => setSelectedNav('dashboard')}>
                    <div className="dash-nav-icon"><ion-icon name="stats-chart-outline" style={{ fontSize: '30px' }}></ion-icon></div>
                    <span className="dash-nav-text">Dashboard</span>
                </div>
                <div className="dash-nav-item" onClick={() => navigate('/admin-hp')}>
                    <div className="dash-nav-icon"><ion-icon name="map-outline" style={{ fontSize: '30px' }}></ion-icon></div>
                    <span className="dash-nav-text">2D - Map</span>
                </div>
                <div className="dash-nav-item" onClick={() => navigate('/report-itemlist')}>
                    <div className="dash-nav-icon"><ion-icon name="clipboard-outline" style={{ fontSize: '30px' }}></ion-icon></div>
                    <span className="dash-nav-text">Report & Itemlist</span>
                </div>
                <div className="dash-nav-item" onClick={() => navigate('/manage-users')}>
                    <div className="dash-nav-icon"><ion-icon name="people-outline" style={{ fontSize: '30px' }}></ion-icon></div>
                    <span className="dash-nav-text">Manage Users</span>
                </div>

                {/* --- CONFIGURATION BUTTON ADDED HERE --- */}
                <div className="dash-nav-item" onClick={() => navigate('/configuration')}>
                    <div className="dash-nav-icon"><ion-icon name="settings-outline" style={{ fontSize: '30px' }}></ion-icon></div>
                    <span className="dash-nav-text">Configuration</span>
                </div>

                <div className="dash-nav-item" onClick={handleLogout} style={{ marginTop: 'auto', marginBottom: '20px' }}>
                    <div className="dash-nav-icon" style={{ color: '#dc3545' }}><ion-icon name="log-out-outline" style={{ fontSize: '30px' }}></ion-icon></div>
                    <span className="dash-nav-text" style={{ color: '#dc3545' }}>Logout</span>
                </div>
            </div>

            {/* MAIN CONTENT */}
            <div className="dash-main-content">
                <div className="dash-container">
                    {/* --- HEADER --- */}
                    <div className="dash-header" style={{ background: headerColor || '#ffffff', transition: 'background 0.3s' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                            <img
                                src={logo}
                                alt="Logo"
                                style={{ height: '50px', width: '50px', objectFit: 'contain' }}
                            />
                            <h1 className="dash-main-title">Dashboard</h1>
                        </div>
                        <div className="dash-controls">
                             {/* --- FULL REPORT EXPORT BUTTON --- */}
                            <button 
                                onClick={() => handleExportPDF('all')}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    padding: '8px 15px', borderRadius: '5px',
                                    backgroundColor: '#007bff', color: 'white',
                                    border: 'none', cursor: 'pointer', fontWeight: 'bold'
                                }}
                            >
                                <ion-icon name="print-outline"></ion-icon> Print Full Report
                            </button>
                        </div>
                    </div>

                    <div className="dash-scroll-area">
                        {/* KPI CARDS */}
                        <div className="dash-kpi-grid">
                            <div className="dash-card kpi-card red-accent">
                                <h3>Critical Stock</h3>
                                <div className="kpi-value">{analytics.lowStock.length}</div>
                                <p>Items Empty or Below Threshold</p>
                            </div>
                            <div className="dash-card kpi-card orange-accent">
                                <h3>Dead Stock</h3>
                                <div className="kpi-value">{analytics.deadStock.length}</div>
                                <p>No usage &gt; {deadStockDays} Days</p>
                            </div>
                            <div className="dash-card kpi-card green-accent">
                                <h3>Item Life Health</h3>
                                <div className="kpi-value">{analytics.expiring.length}</div>
                                <p>Expiring within 60 Days</p>
                            </div>
                        </div>

                        <div className="dash-grid-container">
                            {/* 1. LOW STOCK */}
                            <div className="dash-card full-height">
                                <div className="card-header">
                                    <h3>Low Stock Alerts</h3>
                                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                        <button 
                                            onClick={() => handleExportPDF('low')} 
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#555', display: 'flex' }} 
                                            title="Export Low Stock"
                                        >
                                            <ion-icon name="print-outline"></ion-icon>
                                        </button>
                                        {analytics.lowStock.length > 5 && (
                                            <button className="btn-link" onClick={() => setActiveModal('low')}>See All ({analytics.lowStock.length})</button>
                                        )}
                                    </div>
                                </div>
                                <div className="dash-list">
                                    {analytics.lowStock.length === 0 ? <p className="empty-state">All stock levels healthy.</p> : (
                                        <table>
                                            <thead><tr><th>Item Name</th><th>Status</th><th>Qty</th></tr></thead>
                                            <tbody>
                                                {analytics.lowStock.slice(0, 5).map((item, i) => (
                                                    <tr key={i}>
                                                        <td>
                                                            {item.name}
                                                            <br />
                                                            <span className="sub-text">SKU: {item.model}</span>
                                                        </td>
                                                        <td><span className={`badge ${item.type === 'Empty' ? 'badge-red' : 'badge-orange'}`}>{item.type}</span></td>
                                                        <td style={{ fontWeight: 'bold', color: item.qty === 0 ? 'red' : 'orange' }}>{item.qty} <span className="sub-text">/ {item.min_threshold || 5}</span></td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </div>

                            {/* 2. BESTSELLERS (NOW WITH FILTER) */}
                            <div className="dash-card">
                                <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <h3 style={{ margin: 0 }}>Top Movers</h3>
                                        {/* Dropdown for Top Movers */}
                                        <select 
                                            value={topMoversFilter} 
                                            onChange={(e) => setTopMoversFilter(e.target.value)}
                                            style={{ padding: '2px 5px', fontSize: '12px', borderRadius: '4px', border: '1px solid #ddd' }}
                                        >
                                            <option value="all">All Time</option>
                                            <option value="daily">Daily</option>
                                            <option value="monthly">Monthly</option>
                                            <option value="yearly">Yearly</option>
                                        </select>
                                    </div>
                                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                        <button 
                                            onClick={() => handleExportPDF('top')} 
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#555', display: 'flex' }} 
                                            title="Export Top Movers"
                                        >
                                            <ion-icon name="print-outline"></ion-icon>
                                        </button>
                                        {analytics.bestsellers.length > 5 && (
                                            <button className="btn-link" onClick={() => setActiveModal('top')}>See All ({analytics.bestsellers.length})</button>
                                        )}
                                    </div>
                                </div>
                                <div className="dash-list">
                                    {analytics.bestsellers.length === 0 ? <p className="empty-state">No check-out in {topMoversFilter} period.</p> : (
                                        analytics.bestsellers.slice(0, 5).map((item, i) => (
                                            <div key={i} className="bestseller-row">
                                                <div className="rank-circle">{i + 1}</div>
                                                <div className="bestseller-info">
                                                    <span className="item-name">{item.name}</span>
                                                    <span className="item-model">SKU: {item.model}</span>
                                                </div>
                                                <div className="bestseller-qty">{item.totalOut} <small>check-out</small></div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* 3. DEAD STOCK */}
                            <div className="dash-card">
                                <div className="card-header">
                                    <h3>Dead Stock ({'>'} {deadStockDays} Days)</h3>
                                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                        <button 
                                            onClick={() => handleExportPDF('dead')} 
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#555', display: 'flex' }} 
                                            title="Export Dead Stock"
                                        >
                                            <ion-icon name="print-outline"></ion-icon>
                                        </button>
                                        {analytics.deadStock.length > 5 && (
                                            <button className="btn-link" onClick={() => setActiveModal('dead')}>See All ({analytics.deadStock.length})</button>
                                        )}
                                    </div>
                                </div>
                                <div className="dash-list">
                                    {analytics.deadStock.length === 0 ? <p className="empty-state">Inventory is moving well.</p> : (
                                        <table>
                                            <thead><tr><th>Item</th><th>Qty Stuck</th><th>Dormant</th></tr></thead>
                                            <tbody>
                                                {analytics.deadStock.slice(0, 5).map((item, i) => (
                                                    <tr key={i}>
                                                        <td>
                                                            {item.name}
                                                            <br />
                                                            <span className="sub-text" style={{ fontSize: '12px', color: '#666' }}>SKU: {item.model}</span>
                                                        </td>
                                                        <td style={{ fontWeight: 'bold' }}>{item.qty}</td>
                                                        <td style={{ color: '#666' }}>{item.daysDormant} days</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </div>

                            {/* 4. ITEM LIFE HEALTH */}
                            <div className="dash-card full-width">
                                <div className="card-header">
                                    <h3>Item Life Health</h3>
                                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                        <button 
                                            onClick={() => handleExportPDF('expiry')} 
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#555', display: 'flex' }} 
                                            title="Export Item Life Health"
                                        >
                                            <ion-icon name="print-outline"></ion-icon>
                                        </button>
                                        {analytics.expiring.length > 5 && (
                                            <button className="btn-link" onClick={() => setActiveModal('expiry')}>See All ({analytics.expiring.length})</button>
                                        )}
                                    </div>
                                </div>
                                <div className="dash-list">
                                    {analytics.expiring.length === 0 ? <p className="empty-state">No items expiring soon.</p> : (
                                        <table>
                                            <thead>
                                                <tr>
                                                    <th>Item Name</th>
                                                    <th>SKU</th>
                                                    <th>Status</th>
                                                    <th>Time Remaining</th>
                                                    <th>Qty</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {analytics.expiring.slice(0, 5).map((item, i) => (
                                                    <tr key={i}>
                                                        <td>{item.name}</td>
                                                        <td><span className="sub-text">{item.model}</span></td>
                                                        <td>
                                                            <span className={`badge ${item.daysLeft < 0 ? 'badge-red' : 'badge-orange'}`}>
                                                                {item.daysLeft < 0 ? 'EXPIRED' : 'SOON'}
                                                            </span>
                                                        </td>
                                                        <td style={{ fontWeight: 'bold', color: item.daysLeft < 0 ? '#dc3545' : '#e67e22' }}>
                                                            {item.daysLeft < 0 ? `${Math.abs(item.daysLeft)} days ago` : `${item.daysLeft} days`}
                                                        </td>
                                                        <td>{item.qty}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* --- UNIFIED LARGE MODAL (SEE ALL) --- */}
            {activeModal && (
                <div className="modal-overlay">
                    <div className="custom-popup-content large-modal">
                        <div className="modal-header-row">
                            <h2 style={{ margin: 0 }}>{getModalTitle()}</h2>
                            <button className="btn-close-icon" onClick={() => setActiveModal(null)}>
                                <ion-icon name="close-outline"></ion-icon>
                            </button>
                        </div>
                        <div className="modal-scroll-table">
                            {renderModalContent()}
                        </div>
                        <div className="popup-buttons" style={{ marginTop: '20px', justifyContent: 'flex-end' }}>
                            <button className="popup-btn secondary" onClick={() => setActiveModal(null)}>Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const Dashboard_Analytics = () => (
    <ReportStateProvider><Dashboard_AnalyticsContent /></ReportStateProvider>
);

export default Dashboard_Analytics;