import React from 'react';
import './Report_Itemlist.css';

const RemoveItemModal = ({ isOpen, onClose, onConfirm, hasSelection }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-content remove-item-modal">
        
        <div className="remove-modal-body">
          {hasSelection ? (
            <>
              <h2 className="remove-message">
                Confirm archiving of <br /> selected items?
              </h2>
              <p style={{ textAlign: 'center', color: '#666', fontSize: '13px', marginTop: '10px' }}>
                These items will be hidden from the main list but can be restored later.
              </p>
            </>
          ) : (
            <h2 className="remove-message">
              Please select at least <br /> one item to archive
            </h2>
          )}
        </div>

        <div className="remove-modal-actions">
          <button className="remove-btn cancel" onClick={onClose}>
            Cancel
          </button>
          <button 
            className="remove-btn confirm" 
            onClick={hasSelection ? onConfirm : onClose}
            disabled={!hasSelection}
          >
            {hasSelection ? "Archive Items" : "OK"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RemoveItemModal;