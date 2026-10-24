import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Login.css';

// Ensure this matches your XAMPP setup
const API_URL = "http://localhost/mro-api/login.php";

const Login = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const navigate = useNavigate();

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        localStorage.setItem('currentUser', JSON.stringify(data.user));
        
        if (data.user.role === 'admin') {
          navigate('/admin-hp');
        } else {
          navigate('/map');
        }
      } else {
        setError(data.message || "Invalid credentials");
      }
    } catch (err) {
      console.error("Login Error:", err);
      setError("Cannot connect to server. Check if XAMPP is running.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-overlay"></div>
      
      <div className="login-card">
        <div className="header-container">
          <h1 className="login-title">LOGIN</h1>
          <p className="login-subtitle">Please enter details to login.</p>
        </div>

        <form onSubmit={handleSubmit} className="form-container">
          
          {/* UPDATED CLASS NAME HERE */}
          <div className="login-input-group">
            <label className="input-label">Email Address</label>
            <input
              type="text"
              className="input-field"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              required
              disabled={isLoading}
            />
          </div>

          {/* UPDATED CLASS NAME HERE */}
          <div className="login-input-group">
            <label className="input-label">Password</label>
            <div className="password-wrapper">
              <input
                type={showPassword ? "text" : "password"}
                className="input-field"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                disabled={isLoading}
              />
              <button
                type="button"
                className="toggle-password"
                onClick={togglePasswordVisibility}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="eye-icon">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="eye-icon">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          
          {error && <div className="error-message">{error}</div>}

          <button type="submit" className="login-btn" disabled={isLoading}>
            {isLoading ? "LOGGING IN..." : "LOGIN"}
          </button>

        </form>
      </div>
    </div>
  );
};

export default Login;