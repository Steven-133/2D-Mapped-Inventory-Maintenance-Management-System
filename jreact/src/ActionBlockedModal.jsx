import React from 'react';
import './Report_Itemlist.css'; // We use your existing CSS

const ActionBlockedModal = ({ isOpen, onClose, blockedItems }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop">
      {/* We add a little inline style to make this modal slightly wider for the list */}
      <div className="modal-content remove-item-modal" style={{ maxWidth: '500px', width: '90%' }}>
        
        <div className="remove-modal-body">
          <h2 className="remove-message" style={{ color: '#d32f2f', marginBottom: '15px' }}>
            Deletion Blocked
          </h2>
          
          <p style={{ fontSize: '14px', color: '#555', marginBottom: '15px' }}>
            The following items are currently stored in Racks. <br/>
            You must <b>Check-Out</b> these items to remove them from the rack before deleting them from the Master List.
          </p>

          {/* This creates a scrollable list of the stuck items */}
          <div style={{ 
              maxHeight: '200px', 
              overflowY: 'auto', 
              backgroundColor: '#f5f5f5', 
              padding: '10px', 
              borderRadius: '6px',
              textAlign: 'left',
              border: '1px solid #ddd'
          }}>
            {blockedItems.map((item, index) => (
              <div key={index} style={{ padding: '8px', borderBottom: '1px solid #eee' }}>
                <div style={{ fontWeight: 'bold', color: '#333' }}>{item.name}</div>
                <div style={{ fontSize: '12px', color: '#d32f2f' }}>
                    Currently at: <b>Rack {item.rack}</b> (Zone: {item.zone})
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="remove-modal-actions">
          {/* Only one button: "OK" / "Close" */}
          <button className="remove-btn confirm" onClick={onClose} style={{ width: '100%' }}>
            Understood
          </button>
        </div>
      </div>
    </div>
  );
};

export default ActionBlockedModal;