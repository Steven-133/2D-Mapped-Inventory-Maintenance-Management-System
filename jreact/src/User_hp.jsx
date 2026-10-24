import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom'; // 1. Import useNavigate
import './User_hp.css';

const User_hp = () => {
  // 2. Initialize the navigation function
  const navigate = useNavigate(); 
  const REDIRECT_DELAY_MS = 3000; // Set the delay in milliseconds (e.g., 3000ms = 3 seconds)

  useEffect(() => {
    // 3. Set a timeout to call the navigate function
    const timerId = setTimeout(() => {
      navigate('/map'); // Go to the map route after the delay
    }, REDIRECT_DELAY_MS);

    // 4. Cleanup function: important to clear the timeout if the component unmounts early
    return () => clearTimeout(timerId); 
    
  }, [navigate]); // The navigate function should be included in the dependency array

  return (
    <div className="user-page">
      <div className="content-card-dark" style={{ textAlign: 'center' }}>
        <h1>User Home Page</h1>
        <p>Welcome, User.</p>
        
        {/* Optional: Add a message to let the user know what is happening */}
        <p style={{ marginTop: '30px', color: '#007bff', fontWeight: 'bold' }}>
          Redirecting to 2D Warehouse Map in {REDIRECT_DELAY_MS / 1000} seconds... ⏳
        </p>
        
      </div>
    </div>
  );
};

export default User_hp;