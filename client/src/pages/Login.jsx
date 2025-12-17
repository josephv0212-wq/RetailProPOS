import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (location.state?.message) {
      setSuccessMessage(location.state.message);
      // Clear the message from location state
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(credentials);
    
    if (result.success) {
      navigate('/sales');
    } else {
      setError(result.message || 'Login failed. Please check your credentials.');
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
        maxWidth: '420px', 
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
            Sign in to continue
          </p>
        </div>

        {successMessage && (
          <div className="success mb-2" style={{ 
            marginBottom: '20px',
            borderRadius: '12px',
            padding: '14px 16px',
            background: '#d1fae5',
            color: '#065f46',
            border: '1px solid #10b981'
          }}>
            {successMessage}
          </div>
        )}

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
              value={credentials.username}
              onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
              required
              autoFocus
              placeholder="Enter your username"
              disabled={loading}
              style={{
                fontSize: '16px',
                padding: '16px',
                borderRadius: '12px',
                border: '2px solid var(--border)'
              }}
            />
          </div>

          <div className="mb-3">
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
              value={credentials.password}
              onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
              required
              placeholder="Enter your password"
              disabled={loading}
              style={{
                fontSize: '16px',
                padding: '16px',
                borderRadius: '12px',
                border: '2px solid var(--border)'
              }}
            />
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
                Signing in...
              </>
            ) : (
              'Sign In'
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
            Don't have an account?{' '}
            <Link 
              to="/register" 
              style={{ 
                color: 'var(--primary)', 
                fontWeight: '600',
                textDecoration: 'none'
              }}
            >
              Sign up
            </Link>
          </p>
        </div>

        <div className="mt-3" style={{ 
          padding: '16px', 
          background: 'var(--gray-100)', 
          borderRadius: '12px',
          marginTop: '24px'
        }}>
          <p style={{ 
            fontSize: '13px', 
            marginBottom: '10px', 
            fontWeight: '600',
            color: 'var(--gray-700)'
          }}>
            Demo Accounts:
          </p>
          <p style={{ fontSize: '12px', color: 'var(--gray-600)', marginBottom: '4px' }}>
            cashier_loc001 / password123
          </p>
          <p style={{ fontSize: '12px', color: 'var(--gray-600)' }}>
            admin / admin123
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
