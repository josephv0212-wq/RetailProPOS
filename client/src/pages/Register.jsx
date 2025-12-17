import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { zohoAPI } from '../services/api';

const Register = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ 
    username: '', 
    password: '', 
    confirmPassword: '',
    role: 'cashier',
    locationId: '',
    locationName: '',
    taxPercentage: 7.5,
    registrationKey: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [taxRates, setTaxRates] = useState([]);
  const [loadingTaxes, setLoadingTaxes] = useState(true);

  // Common location options
  const locations = [
    { id: 'LOC001', name: 'MIA Dry Ice - Miami' },
    { id: 'LOC002', name: 'FLL Dry Ice - Fort Lauderdale' },
    { id: 'LOC003', name: 'WC Dry Ice - West Coast' },
    { id: 'LOC004', name: 'ORL Dry Ice - Orlando' }
  ];

  useEffect(() => {
    // Fetch tax rates from Zoho on component mount
    const fetchTaxRates = async () => {
      try {
        setLoadingTaxes(true);
        const response = await zohoAPI.getTaxRates();
        if (response.data.success) {
          setTaxRates(response.data.data?.taxes || []);
        }
      } catch (error) {
        // Failed to fetch tax rates silently
      } finally {
        setLoadingTaxes(false);
      }
    };

    fetchTaxRates();
  }, []);

  const handleLocationChange = (selectedValue) => {
    // Check if it's a tax rate (from Zoho) or a location
    const tax = taxRates.find(t => t.taxId === selectedValue);
    const location = locations.find(loc => loc.id === selectedValue);
    
    if (tax) {
      // If tax rate selected, use tax name as location name and save tax percentage
      setFormData({
        ...formData,
        locationId: selectedValue,
        locationName: `${tax.taxName} (${tax.taxPercentage}%)`,
        taxPercentage: tax.taxPercentage
      });
    } else if (location) {
      // If location selected, use location name and default tax
      setFormData({
        ...formData,
        locationId: selectedValue,
        locationName: location.name,
        taxPercentage: 7.5
      });
    } else {
      // Reset if nothing selected
      setFormData({
        ...formData,
        locationId: '',
        locationName: '',
        taxPercentage: 7.5
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validation
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.username.length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }

    if (!formData.locationId) {
      setError('Please select a location');
      return;
    }

    if (!formData.registrationKey || formData.registrationKey.trim() === '') {
      setError('Registration key is required');
      return;
    }

    setLoading(true);

    const result = await register({
      username: formData.username,
      password: formData.password,
      role: formData.role,
      locationId: formData.locationId,
      locationName: formData.locationName,
      taxPercentage: formData.taxPercentage,
      registrationKey: formData.registrationKey
    });
    
    if (result.success) {
      // Redirect to login page after successful registration
      navigate('/login', { 
        state: { message: 'Registration successful! Please login with your credentials.' }
      });
    } else {
      setError(result.message || 'Registration failed. Please try again.');
    }
    
    setLoading(false);
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '20px'
    }}>
      <div className="card" style={{ 
        width: '100%', 
        maxWidth: '500px', 
        margin: '20px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
      }}>
        <div className="text-center mb-3">
          <h1 style={{ 
            fontSize: '36px', 
            fontWeight: '800', 
            marginBottom: '16px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            RetailPro POS
          </h1>
          <p style={{ 
            fontSize: '16px', 
            color: 'var(--gray-600)',
            marginBottom: '8px'
          }}>
            Create a new account
          </p>
        </div>

        {error && (
          <div className="error mb-2" style={{ 
            marginBottom: '20px',
            borderRadius: '12px',
            padding: '14px 16px'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-2">
            <label style={{ 
              display: 'block', 
              marginBottom: '10px', 
              fontWeight: '600',
              fontSize: '15px',
              color: 'var(--dark)'
            }}>
              Username
            </label>
            <input
              type="text"
              className="input"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              required
              autoFocus
              placeholder="Enter username (min 3 characters)"
              disabled={loading}
              style={{
                fontSize: '16px',
                padding: '16px',
                borderRadius: '12px',
                border: '2px solid var(--border)'
              }}
            />
          </div>

          <div className="mb-2">
            <label style={{ 
              display: 'block', 
              marginBottom: '10px', 
              fontWeight: '600',
              fontSize: '15px',
              color: 'var(--dark)'
            }}>
              Password
            </label>
            <input
              type="password"
              className="input"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
              placeholder="Enter password (min 6 characters)"
              disabled={loading}
              style={{
                fontSize: '16px',
                padding: '16px',
                borderRadius: '12px',
                border: '2px solid var(--border)'
              }}
            />
          </div>

          <div className="mb-2">
            <label style={{ 
              display: 'block', 
              marginBottom: '10px', 
              fontWeight: '600',
              fontSize: '15px',
              color: 'var(--dark)'
            }}>
              Confirm Password
            </label>
            <input
              type="password"
              className="input"
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              required
              placeholder="Confirm your password"
              disabled={loading}
              style={{
                fontSize: '16px',
                padding: '16px',
                borderRadius: '12px',
                border: '2px solid var(--border)'
              }}
            />
          </div>

          <div className="mb-2">
            <label style={{ 
              display: 'block', 
              marginBottom: '10px', 
              fontWeight: '600',
              fontSize: '15px',
              color: 'var(--dark)'
            }}>
              Registration Key <span style={{ color: 'var(--danger)', fontSize: '12px' }}>*</span>
            </label>
            <input
              type="password"
              className="input"
              value={formData.registrationKey}
              onChange={(e) => setFormData({ ...formData, registrationKey: e.target.value })}
              required
              placeholder="Enter registration key"
              disabled={loading}
              style={{
                fontSize: '16px',
                padding: '16px',
                borderRadius: '12px',
                border: '2px solid var(--border)'
              }}
            />
            <p style={{
              fontSize: '12px',
              color: 'var(--gray-600)',
              marginTop: '6px',
              fontStyle: 'italic'
            }}>
              Contact administrator for registration key
            </p>
          </div>

          <div className="mb-3">
            <label style={{ 
              display: 'block', 
              marginBottom: '10px', 
              fontWeight: '600',
              fontSize: '15px',
              color: 'var(--dark)'
            }}>
              Location
            </label>
            <select
              className="input"
              value={formData.locationId}
              onChange={(e) => handleLocationChange(e.target.value)}
              required
              disabled={loading || loadingTaxes}
              style={{
                fontSize: '16px',
                padding: '16px',
                borderRadius: '12px',
                border: '2px solid var(--border)',
                background: 'white',
                cursor: (loading || loadingTaxes) ? 'not-allowed' : 'pointer'
              }}
            >
              <option value="">
                {loadingTaxes ? 'Loading tax rates...' : 'Select a location'}
              </option>
              {taxRates.length > 0 ? (
                taxRates.map(tax => (
                  <option key={tax.taxId} value={tax.taxId}>
                    {tax.taxName} ({tax.taxPercentage}%)
                  </option>
                ))
              ) : (
                !loadingTaxes && locations.map(location => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))
              )}
            </select>
            {loadingTaxes && (
              <div style={{
                marginTop: '8px',
                fontSize: '13px',
                color: 'var(--gray-600)',
                fontStyle: 'italic'
              }}>
                Fetching tax rates from Zoho...
              </div>
            )}
          </div>

          <button 
            type="submit" 
            className="btn btn-primary" 
            style={{ 
              width: '100%', 
              padding: '16px',
              fontSize: '16px',
              fontWeight: '700',
              borderRadius: '12px',
              marginTop: '8px'
            }}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="spinner" style={{ width: '20px', height: '20px', borderWidth: '3px', borderTopColor: 'white' }}></span>
                Creating account...
              </>
            ) : (
              'Create Account'
            )}
          </button>
        </form>

        <div className="mt-3 text-center" style={{ 
          padding: '16px', 
          marginTop: '24px'
        }}>
          <p style={{ 
            fontSize: '14px', 
            color: 'var(--gray-600)'
          }}>
            Already have an account?{' '}
            <Link 
              to="/login" 
              style={{ 
                color: 'var(--primary)', 
                fontWeight: '600',
                textDecoration: 'none'
              }}
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;

