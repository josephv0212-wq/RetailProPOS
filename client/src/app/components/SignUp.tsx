import { useState, useEffect, FormEvent } from 'react';
import { Eye, EyeOff, ChevronDown } from 'lucide-react';
import { authAPI, zohoAPI } from '../../services/api';
import { useAlert } from '../contexts/AlertContext';

interface SignUpProps {
  onSignUp: () => void;
  onNavigateToSignIn: () => void;
}

export interface SignUpData {
  fullName: string;
  email: string;
  password: string;
  role: string;
  storeLocation: string;
}

interface Location {
  locationId: string;
  locationName: string;
  status: string;
  isPrimary?: boolean;
}

export function SignUp({ onSignUp, onNavigateToSignIn }: SignUpProps) {
  const { showAlert } = useAlert();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState('cashier');
  const [locationId, setLocationId] = useState('');
  const [taxPercentage, setTaxPercentage] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [locations, setLocations] = useState<Location[]>([]);
  const [taxRates, setTaxRates] = useState<Array<{ tax_id: string; tax_name: string; tax_percentage: number }>>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Load locations and tax rates on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const [locationsRes, taxesRes] = await Promise.all([
          zohoAPI.getLocations(),
          zohoAPI.getTaxRates(),
        ]);

        if (locationsRes.success && locationsRes.data?.locations) {
          setLocations(locationsRes.data.locations);
          if (locationsRes.data.locations.length > 0) {
            const primary = locationsRes.data.locations.find((loc: Location) => loc.isPrimary) || locationsRes.data.locations[0];
            setLocationId(primary.locationId);
          }
        }

        if (taxesRes.success && taxesRes.data?.taxes) {
          setTaxRates(taxesRes.data.taxes);
          if (taxesRes.data.taxes.length > 0) {
            setTaxPercentage(taxesRes.data.taxes[0].tax_percentage);
          }
        }
      } catch (err) {
        console.error('Failed to load registration data:', err);
        setError('Failed to load locations and tax rates. Please try again.');
      } finally {
        setLoadingData(false);
      }
    };

    loadData();
  }, []);

  // Update tax percentage when location changes
  useEffect(() => {
    // In a real app, you might want to fetch location-specific tax rate
    // For now, we'll use the first tax rate
    if (taxRates.length > 0 && taxPercentage === 0) {
      setTaxPercentage(taxRates[0].tax_percentage);
    }
  }, [locationId, taxRates]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!agreeToTerms) {
      setError('Please agree to the Terms of Service and Privacy Policy');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (!email || !password || !role || !locationId) {
      setError('Please fill in all required fields');
      return;
    }

    const selectedLocation = locations.find(loc => loc.locationId === locationId);
    if (!selectedLocation) {
      setError('Please select a valid location');
      return;
    }

    setIsLoading(true);
    try {
      const response = await authAPI.register({
        username: email,
        password,
        role: role.toLowerCase().replace(/\s+/g, '_'), // Convert to API format
        locationId,
        locationName: selectedLocation.locationName,
        taxPercentage,
      });

      if (response.success) {
        // Registration successful - user needs admin approval
        showAlert({
          message: 'Registration successful! Your account is pending admin approval. You will be notified once approved.',
          onConfirm: () => onNavigateToSignIn(),
        });
      } else {
        setError(response.message || 'Registration failed. Please try again.');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during registration');
    } finally {
      setIsLoading(false);
    }
  };

  const roles = [
    { value: 'cashier', label: 'Cashier' },
    { value: 'admin', label: 'Administrator' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center px-4 py-8">
      {/* Logo/Title */}
      <div className="mb-12 flex flex-col items-center">
        <img 
          src="/sz_logo-01-est2001-1.webp" 
          alt="RetailPro POS Logo" 
          className="h-20 w-auto mb-4 object-contain"
        />
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          RetailPro POS
        </h1>
      </div>

      {/* Sign Up Card */}
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Create Account
          </h2>
          <p className="text-gray-500 dark:text-gray-400">
            Set up your account to start processing sales.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Error Message */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Loading State */}
          {loadingData && (
            <div className="text-center py-4 text-gray-500 dark:text-gray-400">
              Loading locations and tax rates...
            </div>
          )}

          {/* Full Name Field */}
          <div>
            <label htmlFor="fullName" className="block font-medium text-gray-900 dark:text-white mb-2">
              Full Name
            </label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jane Doe"
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-gray-600 transition-colors text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
              disabled={isLoading || loadingData}
            />
          </div>

          {/* Email Field */}
          <div>
            <label htmlFor="email" className="block font-medium text-gray-900 dark:text-white mb-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-gray-600 transition-colors text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
              required
            />
          </div>

          {/* Password Field */}
          <div>
            <label htmlFor="password" className="block font-medium text-gray-900 dark:text-white mb-2">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a password"
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-gray-600 transition-colors pr-12 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                {showPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>
            <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">At least 8 characters.</p>
          </div>

          {/* Confirm Password Field */}
          <div>
            <label htmlFor="confirmPassword" className="block font-medium text-gray-900 dark:text-white mb-2">
              Confirm Password
            </label>
            <div className="relative">
              <input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-gray-600 transition-colors pr-12 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                {showConfirmPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          {/* Role Field */}
          <div>
            <label htmlFor="role" className="block font-medium text-gray-900 dark:text-white mb-2">
              Role
            </label>
            <div className="relative">
              <select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-gray-600 transition-colors appearance-none text-gray-900 dark:text-white"
                required
                disabled={isLoading || loadingData}
              >
                <option value="">Select your role</option>
                {roles.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Store Location Field */}
          <div>
            <label htmlFor="locationId" className="block font-medium text-gray-900 dark:text-white mb-2">
              Store Location
            </label>
            <div className="relative">
              <select
                id="locationId"
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-gray-600 transition-colors appearance-none text-gray-900 dark:text-white"
                required
                disabled={isLoading || loadingData}
              >
                <option value="">Select store location</option>
                {locations.map((loc) => (
                  <option key={loc.locationId} value={loc.locationId}>
                    {loc.locationName} {loc.isPrimary ? '(Primary)' : ''}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Terms Agreement */}
          <div>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={agreeToTerms}
                onChange={(e) => setAgreeToTerms(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-400">
                I agree to the{' '}
                <button
                  type="button"
                  className="text-blue-600 hover:text-blue-700 font-medium transition-colors"
                  onClick={(e) => {
                    e.preventDefault();
                    showAlert({ message: 'Terms of Service would be displayed here' });
                  }}
                >
                  Terms of Service
                </button>
                {' '}and{' '}
                <button
                  type="button"
                  className="text-blue-600 hover:text-blue-700 font-medium transition-colors"
                  onClick={(e) => {
                    e.preventDefault();
                    showAlert({ message: 'Privacy Policy would be displayed here' });
                  }}
                >
                  Privacy Policy
                </button>
                .
              </span>
            </label>
          </div>

          {/* Create Account Button */}
          <button
            type="submit"
            disabled={isLoading || loadingData}
            className="w-full bg-gray-900 text-white font-medium py-3.5 rounded-lg hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Creating Account...' : 'Create Account'}
          </button>

          {/* Sign In Link */}
          <div className="text-center pt-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Already have an account?{' '}
            </span>
            <button
              type="button"
              className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
              onClick={onNavigateToSignIn}
            >
              Sign In
            </button>
          </div>
        </form>
      </div>

      {/* Footer */}
      <div className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
        Version 1.0.0 | <button className="hover:text-gray-700 transition-colors" onClick={() => showAlert({ message: 'Support functionality would be implemented here' })}>Support</button>
      </div>
    </div>
  );
}