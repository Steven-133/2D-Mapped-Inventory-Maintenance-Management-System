import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

// --- NEW CRUCIAL IMPORT ---
import { ReportStateProvider } from './LocalStorageContext'; // Assuming your provider is here

// Import your pages
import Login from './Login.jsx';
import Admin_hp from './Admin_hp.jsx'; 
import User_hp from './User_hp.jsx';
import WarehouseMap from './WarehouseMap.jsx'; 
import Report_Itemlist from './Report_Itemlist.jsx'; 
import ManageUser from './ManageUser';  
import Dashboard_Analytics from './Dashboard_Analytics';
import ConfigurationPage from './ConfigurationPage';


createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* --- WRAP THE WHOLE APPLICATION WITH THE PROVIDER --- */}
    <ReportStateProvider>
      <BrowserRouter>
        <Routes>
          {/* Localhost:5173 loads Login first */}
          <Route path="/" element={<Login />} />
          
          {/* Redirect targets */}
          <Route path="/admin-hp" element={<Admin_hp />} />
        
          {/* Warehouse Map Route */}
          <Route path="/map" element={<WarehouseMap />} /> 

          {/* Report Route */}
          <Route path="/report-itemlist" element={<Report_Itemlist />} />
          <Route path="/dashboard" element={<Dashboard_Analytics />} />
          <Route path="/manage-users" element={<ManageUser />} />
          <Route path="/configuration" element={<ConfigurationPage />} />
        </Routes>
      </BrowserRouter>
    </ReportStateProvider>
  </StrictMode>,
);