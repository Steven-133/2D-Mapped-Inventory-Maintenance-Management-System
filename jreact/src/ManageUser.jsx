import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import './Admin_hp.css';
import './ManageUser.css';
import { ReportStateContext, ReportStateProvider } from './LocalStorageContext';

const ManageUserContent = () => {
    const navigate = useNavigate();
    const { headerColor } = useContext(ReportStateContext);
    
    // --- LOGO STATE ---
    const [logo] = useState(() => {
        return localStorage.getItem('admin_logo') || 'https://cdn-icons-png.flaticon.com/512/25/25694.png';
    });

    // --- STATE ---
    const [users, setUsers] = useState([]);
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(false);

    // Form States
    const [newUser, setNewUser] = useState({ email: '', password: '', role: 'user', name: '' });
    const [passwordChange, setPasswordChange] = useState({ old: '', new: '', confirm: '' });
    const [alertMsg, setAlertMsg] = useState('');
    // --- DELETE MODAL STATE ---
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [userToDelete, setUserToDelete] = useState(null);

    const API_BASE = "http://localhost/mro-api";

    // --- LOAD DATA ---
    useEffect(() => {
        const session = localStorage.getItem('currentUser');
        if (session) {
            setCurrentUser(JSON.parse(session));
        } else {
            navigate('/');
        }
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            const res = await fetch(`${API_BASE}/get_users.php`);
            const data = await res.json();
            if (data.success) {
                setUsers(data.users);
            }
        } catch (err) {
            console.error("Failed to load users", err);
        }
    };

    // --- HANDLERS (ADD USER) ---
    const handleAddUser = async () => {
        if (!newUser.email || !newUser.password) {
            setAlertMsg("Please fill in email and password.");
            return;
        }
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/create_user.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newUser)
            });
            const data = await res.json();
            if (data.success) {
                setAlertMsg("User added successfully.");
                setNewUser({ email: '', password: '', role: 'user', name: '' });
                fetchUsers();
            } else {
                setAlertMsg(data.message || "Failed to add user.");
            }
        } catch (err) {
            setAlertMsg("Error connecting to server.");
        } finally {
            setLoading(false);
        }
    };

    // --- NEW HANDLERS (MODERN DELETE) ---
    const initiateDelete = (user) => {
        setUserToDelete(user);
        setShowDeleteModal(true);
    };

    const confirmDeleteUser = async () => {
        if (!userToDelete) return;
        try {
            const res = await fetch(`${API_BASE}/delete_user.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: userToDelete.id })
            });
            const data = await res.json();

            if (data.success) {
                setAlertMsg("User deleted successfully.");
                fetchUsers();
            } else {
                setAlertMsg(data.message || "Error deleting user.");
            }
        } catch (err) {
            setAlertMsg("Error connecting to server.");
        } finally {
            setShowDeleteModal(false);
            setUserToDelete(null);
        }
    };

    // --- HANDLERS (CHANGE PASSWORD) ---
    const handleChangePassword = async () => {
        if (!passwordChange.old || !passwordChange.new || !passwordChange.confirm) {
            setAlertMsg("All fields are required.");
            return;
        }
        if (passwordChange.new !== passwordChange.confirm) {
            setAlertMsg("New passwords do not match.");
            return;
        }
        if (!currentUser || !currentUser.email) {
            setAlertMsg("Session error: Please relogin.");
            return;
        }
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/change_password.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: currentUser.email,
                    currentPassword: passwordChange.old,
                    newPassword: passwordChange.new
                })
            });

            const data = await res.json();
            if (data.success) {
                setAlertMsg("Password changed successfully!");
                setPasswordChange({ old: '', new: '', confirm: '' });
            } else {
                setAlertMsg(data.message || "Failed to update password.");
            }
        } catch (err) {
            setAlertMsg("Error connecting to server.");
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('currentUser');
        navigate('/');
    };

    return (
        <div className="admin-hp-wrapper">
            {/* --- SIDEBAR --- */}
            <div className="admin-hp-sidebar">
                
                {/* --- ANALYTICS TAB (Only for Admin) --- */}
                {currentUser?.role === 'admin' && (
                    <div className="admin-hp-nav-item" onClick={() => navigate('/dashboard')}>
                        <div className="admin-hp-nav-icon"><ion-icon name="stats-chart-outline"></ion-icon></div>
                        <span className="admin-hp-nav-text">Dashboard</span>
                    </div>
                )}

                <div className="admin-hp-nav-item" onClick={() => navigate(currentUser?.role === 'admin' ? '/admin-hp' : '/map')}>
                    <div className="admin-hp-nav-icon"><ion-icon name="map-outline"></ion-icon></div>
                    <span className="admin-hp-nav-text">2D Map</span>
                </div>

                {currentUser?.role === 'admin' && (
                    <div className="admin-hp-nav-item" onClick={() => navigate('/report-itemlist')}>
                        <div className="admin-hp-nav-icon"><ion-icon name="clipboard-outline"></ion-icon></div>
                        <span className="admin-hp-nav-text">Reports</span>
                    </div>
                )}

                <div className="admin-hp-nav-item selected">
                    <div className="admin-hp-nav-icon"><ion-icon name="people-outline"></ion-icon></div>
                    <span className="admin-hp-nav-text">Users</span>
                </div>

                {/* --- CONFIGURATION BUTTON ADDED HERE --- */}
                <div className="admin-hp-nav-item" onClick={() => navigate('/configuration')}>
                    <div className="admin-hp-nav-icon"><ion-icon name="settings-outline"></ion-icon></div>
                    <span className="admin-hp-nav-text">Configuration</span>
                </div>

                {/* --- LOGOUT --- */}
                <div className="admin-hp-nav-item" onClick={handleLogout} style={{ marginTop: 'auto', marginBottom: '20px' }}>
                    <div className="admin-hp-nav-icon" style={{ color: '#dc3545' }}><ion-icon name="log-out-outline"></ion-icon></div>
                    <span className="admin-hp-nav-text" style={{ color: '#dc3545' }}>Logout</span>
                </div>
            </div>

            {/* --- MAIN CONTENT --- */}
            <div className="admin-hp-main-content">
                <div className="admin-hp-container">
                    {/* --- HEADER --- */}
                    <div className="admin-hp-header" style={{ background: headerColor || '#ffffff', transition: 'background 0.3s' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                            <img
                                src={logo}
                                alt="Logo"
                                style={{ height: '50px', width: '50px', objectFit: 'contain' }}
                            />
                            <h1 className="admin-hp-main-title">User Management</h1>
                        </div>
                        <div className="admin-hp-search-controls">
                            <span style={{ fontWeight: 'bold', marginRight: '15px', color: '#555' }}>
                                {currentUser?.email}
                            </span>
                        </div>
                    </div>

                    {alertMsg && (
                        <div className="user-alert">
                            {alertMsg}
                            <span className="close-alert" onClick={() => setAlertMsg('')}>×</span>
                        </div>
                    )}

                    <div className="manage-user-grid">
                        {/* ADMIN PANEL: ADD & LIST */}
                        {currentUser?.role === 'admin' && (
                            <>
                                {/* ADD USER CARD */}
                                <div className="user-card">
                                    <h3>Add New User</h3>
                                    <div className="form-group">
                                        <label>Email</label>
                                        <input
                                            type="email"
                                            value={newUser.email}
                                            onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                                            placeholder="user@example.com"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Name (Optional)</label>
                                        <input
                                            type="text"
                                            value={newUser.name}
                                            onChange={e => setNewUser({ ...newUser, name: e.target.value })}
                                            placeholder="Staff Name"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Password</label>
                                        <input
                                            type="password"
                                            value={newUser.password}
                                            onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                                            placeholder="Set password"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Role</label>
                                        <select
                                            value={newUser.role}
                                            onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                                        >
                                            <option value="user">Staff User</option>
                                            <option value="admin">Administrator</option>
                                        </select>
                                    </div>
                                    <button className="btn-save" onClick={handleAddUser} disabled={loading}>
                                        {loading ? 'Saving...' : 'Create User'}
                                    </button>
                                </div>
                                {/* USER LIST CARD */}
                                <div className="user-card full-height">
                                    <h3>Existing Users</h3>
                                    <div className="table-wrapper">
                                        <table className="user-table">
                                            <thead>
                                                <tr>
                                                    <th>Email</th>
                                                    <th>Name</th>
                                                    <th>Role</th>
                                                    <th>Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {users.map(u => (
                                                    <tr key={u.id}>
                                                        <td>{u.email}</td>
                                                        <td>{u.name || '-'}</td>
                                                        <td><span className={`role-badge ${u.role}`}>{u.role}</span></td>
                                                        <td>
                                                            {u.email !== 'admin@admin' && u.id !== currentUser.id && (
                                                                <button className="btn-delete" onClick={() => initiateDelete(u)}>Delete</button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </>
                        )}
                        {/* CHANGE PASSWORD CARD */}
                        <div className="user-card">
                            <h3>Change Password</h3>
                            <p style={{ marginBottom: '15px', color: '#666', fontSize: '14px' }}>
                                For account: <strong>{currentUser?.email}</strong>
                            </p>

                            <div className="form-group">
                                <label>Old Password</label>
                                <input
                                    type="password"
                                    value={passwordChange.old}
                                    onChange={e => setPasswordChange({ ...passwordChange, old: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>New Password</label>
                                <input
                                    type="password"
                                    value={passwordChange.new}
                                    onChange={e => setPasswordChange({ ...passwordChange, new: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Confirm New Password</label>
                                <input
                                    type="password"
                                    value={passwordChange.confirm}
                                    onChange={e => setPasswordChange({ ...passwordChange, confirm: e.target.value })}
                                />
                            </div>
                            <button className="btn-update" onClick={handleChangePassword} disabled={loading}>
                                {loading ? 'Updating...' : 'Update Password'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* --- CONFIRMATION POP-UP --- */}
            {showDeleteModal && (
                <div className="confirm-modal-overlay">
                    <div className="confirm-modal-content">
                        <ion-icon name="alert-circle-outline" class="confirm-modal-icon"></ion-icon>
                        <h3 className="confirm-modal-title">Delete Account?</h3>
                        <p className="confirm-modal-text">
                            Are you sure you want to delete the user <strong>{userToDelete?.email}</strong>?
                            <br />This action cannot be undone.
                        </p>
                        <div className="confirm-modal-actions">
                            <button className="btn-modal-cancel" onClick={() => setShowDeleteModal(false)}>
                                Cancel
                            </button>
                            <button className="btn-modal-delete" onClick={confirmDeleteUser}>
                                Yes, Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const ManageUser = () => (
    <ReportStateProvider><ManageUserContent /></ReportStateProvider>
);

export default ManageUser;